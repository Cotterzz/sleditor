// ============================================================================
// WebGPU Backend - WGSL Graphics + Audio
// ============================================================================

import { state, CONFIG, DERIVED, AUDIO_MODES } from '../core.js';

// ============================================================================
// Initialization
// ============================================================================

export async function init(canvas) {
    try {
        // Check if WebGPU is available
        if (!navigator.gpu) {
            console.warn('WebGPU not available in this browser');
            return { success: false, error: 'WebGPU not available in this browser' };
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.warn('WebGPU adapter not available');
            return { success: false, error: 'WebGPU adapter not available' };
        }

        const device = await adapter.requestDevice({
            requiredFeatures: ['bgra8unorm-storage'],
            requiredLimits: {
                maxBufferSize: Math.pow(2, 30),
                maxStorageBufferBindingSize: Math.pow(2, 30),
            }
        });

        const context = canvas.getContext('webgpu');
        context.configure({
            device: device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            usage: GPUTextureUsage.STORAGE_BINDING,
        });

        // Store in state
        state.gpuDevice = device;
        state.gpuContext = context;

        // Create GPU resources
        createGPUResources(device);
        
        state.hasWebGPU = true;
        console.log('✓ WebGPU initialized successfully');
        return { success: true, device, context };
    } catch (err) {
        console.warn('WebGPU initialization failed:', err.message);
        return { success: false, error: err.message };
    }
}

function createGPUResources(device) {
    state.uniformBuffer = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    state.computeBuffer = device.createBuffer({
        size: CONFIG.computeBufferSize,
        usage: GPUBufferUsage.STORAGE,
    });

    state.audioBufferGPU = device.createBuffer({
        size: DERIVED.audioBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Phase state buffer - persistent GPU-side phase for perfect timing
    state.phaseStateBuffer = device.createBuffer({
        size: 4,  // Single f32
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    // Initialize phase to 0
    device.queue.writeBuffer(state.phaseStateBuffer, 0, new Float32Array([0.0]));

    for (let i = 0; i < 2; i++) {
        state.audioBuffersReadback[i] = device.createBuffer({
            size: DERIVED.audioBufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
    }

    state.bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { 
                format: 'bgra8unorm', access: 'write-only', viewDimension: '2d' 
            }},
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
    });
}

// ============================================================================
// Shader Compilation
// ============================================================================

export async function compile(code, hasGraphics, hasAudioGpu) {
    const device = state.gpuDevice;
    if (!device) {
        return { 
            success: false, 
            errors: [{ lineNum: 1, message: 'WebGPU not initialized' }] 
        };
    }

    try {
        // Compile shader module
        const shaderModule = device.createShaderModule({ code });
        const compilationInfo = await shaderModule.getCompilationInfo();
        const errors = compilationInfo.messages.filter(m => m.type === 'error');
        
        if (errors.length > 0) {
            return { success: false, errors };
        }
        
        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [state.bindGroupLayout],
        });
        
        // Create graphics pipeline if needed
        let graphicsPipeline = null;
        if (hasGraphics) {
            graphicsPipeline = device.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: shaderModule, entryPoint: 'graphics_main' },
            });
        }
        
        // Create audio pipeline if needed
        let audioPipeline = null;
        if (hasAudioGpu) {
            audioPipeline = device.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: shaderModule, entryPoint: 'audio_main' },
            });
        }
        
        // Update state
        if (graphicsPipeline) {
            state.graphicsPipeline = graphicsPipeline;
            state.graphicsBackend = 'webgpu';
        }
        if (audioPipeline) {
            state.audioPipeline = audioPipeline;
            state.audioMode = AUDIO_MODES.GPU;
            state.currentAudioType = 'gpu';
        }
        
        return { 
            success: true,
            graphicsPipeline, 
            audioPipeline 
        };
    } catch (err) {
        return { 
            success: false, 
            errors: [{ lineNum: 1, message: err.message }] 
        };
    }
}

// ============================================================================
// Rendering
// ============================================================================

export function renderFrame(uniformData, audioContext) {
    const device = state.gpuDevice;
    const ctx = audioContext;
    
    if (!device || !state.gpuContext) {
        console.warn('WebGPU not ready for rendering');
        return;
    }
    
    try {
        // Write uniforms
        device.queue.writeBuffer(state.uniformBuffer, 0, uniformData);

    const textureView = state.gpuContext.getCurrentTexture().createView();
    const bindGroup = device.createBindGroup({
        layout: state.bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: state.uniformBuffer } },
            { binding: 1, resource: { buffer: state.computeBuffer } },
            { binding: 2, resource: { buffer: state.audioBufferGPU } },
            { binding: 3, resource: textureView },
            { binding: 4, resource: { buffer: state.phaseStateBuffer } },
        ],
    });

    // Check if we need to generate GPU audio THIS frame (only for GPU audio mode)
    const needsGPUAudio = state.isPlaying && 
                          state.audioMode === AUDIO_MODES.GPU &&
                          state.audioPipeline &&
                          ctx.currentTime >= state.nextAudioTime - CONFIG.audioBlockDuration && 
                          !state.pendingAudio;

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    
    // AUDIO PASS FIRST - Only for GPU audio mode!
    if (needsGPUAudio) {
        pass.setPipeline(state.audioPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(DERIVED.samplesPerBlock / 128),  // e.g., ceil(4800/128) = 38 workgroups
            1,
            1
        );
    }
    
    // GRAPHICS PASS SECOND - Reads audio data from buffer
    // 8×8 workgroups for optimal 2D texture access
    if (state.graphicsPipeline) {
        pass.setPipeline(state.graphicsPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(state.canvasWidth / state.pixelScale / 8),   // Scaled workgroups X
            Math.ceil(state.canvasHeight / state.pixelScale / 8),  // Scaled workgroups Y
            1
        );
    }
    
    pass.end();

    if (needsGPUAudio) {
        state.pendingAudio = true;
        
        const readbackBuffer = state.audioBuffersReadback[state.readbackIndex];
        encoder.copyBufferToBuffer(
            state.audioBufferGPU, 0,
            readbackBuffer, 0,
            DERIVED.audioBufferSize
        );
        
        device.queue.submit([encoder.finish()]);
        
        readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
            playAudioBlock(readbackBuffer, ctx);
            state.readbackIndex = 1 - state.readbackIndex;
            state.pendingAudio = false;
        }).catch(err => {
            console.error('Audio readback failed:', err);
            state.pendingAudio = false;
        });
    } else {
        device.queue.submit([encoder.finish()]);
    }
    } catch (err) {
        console.error('WebGPU render error:', err);
        console.error('Stack:', err.stack);
    }
}

function playAudioBlock(readbackBuffer, audioContext) {
    const audioData = new Float32Array(readbackBuffer.getMappedRange());
    
    const audioBuffer = audioContext.createBuffer(
        CONFIG.channels,
        DERIVED.samplesPerBlock,
        DERIVED.sampleRate
    );
    
    for (let ch = 0; ch < CONFIG.channels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        const offset = ch * DERIVED.samplesPerBlock;
        for (let i = 0; i < DERIVED.samplesPerBlock; i++) {
            channelData[i] = audioData[offset + i];
        }
    }
    
    readbackBuffer.unmap();
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(state.gainNode);
    source.start(state.nextAudioTime);
    
    state.nextAudioTime += CONFIG.audioBlockDuration;
    state.audioFrame++;
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanup() {
    // Destroy pipelines
    state.graphicsPipeline = null;
    state.audioPipeline = null;
    
    // Note: WebGPU buffers and resources are garbage collected
    // We just need to null out references
}

