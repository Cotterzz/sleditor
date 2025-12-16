// ============================================================================
// WebGPU Backend - WGSL Graphics + Audio
// ============================================================================

import { state, CONFIG, DERIVED, AUDIO_MODES } from '../core.js';

// Blit shader for copying intermediate texture to canvas with optional gamma correction
const BLIT_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var out: VertexOutput;
    // Fullscreen triangle (covers screen with single oversized triangle)
    let x = i32(idx) / 2;
    let y = i32(idx) & 1;
    let tc = vec2<f32>(f32(x) * 2.0, f32(y) * 2.0);
    out.position = vec4<f32>(tc.x * 2.0 - 1.0, 1.0 - tc.y * 2.0, 0.0, 1.0);
    out.uv = tc;
    return out;
}

@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

// Linear to sRGB conversion (matches compute.toys)
fn linear_to_srgb(rgb: vec3<f32>) -> vec3<f32> {
    return select(
        1.055 * pow(rgb, vec3<f32>(1.0 / 2.4)) - 0.055,
        rgb * 12.92,
        rgb <= vec3<f32>(0.0031308)
    );
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(srcTexture, srcSampler, in.uv);
}

@fragment
fn fs_main_linear(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(srcTexture, srcSampler, in.uv);
    return vec4<f32>(linear_to_srgb(color.rgb), color.a);
}
`;

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

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        const context = canvas.getContext('webgpu');
        context.configure({
            device: device,
            format: presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,  // Changed: now used as render target for blit
        });

        // Clear old resources from previous device (if any)
        state.intermediateTexture = null;
        state.intermediateTextureView = null;
        state.blitBindGroup = null;

        // Store in state
        state.gpuDevice = device;
        state.gpuContext = context;
        state.presentationFormat = presentationFormat;

        // Create GPU resources
        createGPUResources(device);
        
        // Create blit pipeline for final output
        createBlitPipeline(device, presentationFormat);
        
        state.hasWebGPU = true;
        console.log('✓ WebGPU initialized successfully');
        return { success: true, device, context };
    } catch (err) {
        console.warn('WebGPU initialization failed:', err.message);
        return { success: false, error: err.message };
    }
}

function createGPUResources(device) {
    // IMPORTANT: Size must match UniformBuilder.buffer in js/uniforms.js
    // If uniform layout changes there, update this size to match!
    state.uniformBuffer = device.createBuffer({
        size: 512,
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
                format: 'rgba16float', access: 'write-only', viewDimension: '2d'  // High precision
            }},
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
    });
}

// Create intermediate texture for compute shader output
// Uses rgba16float for high precision (avoids banding during gamma correction)
function createIntermediateTexture(device, width, height) {
    // Destroy old texture if it exists
    if (state.intermediateTexture) {
        state.intermediateTexture.destroy();
    }
    
    state.intermediateTexture = device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba16float',  // High precision to avoid banding
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    
    state.intermediateTextureView = state.intermediateTexture.createView();
    
    // Recreate blit bind group with new texture
    if (state.blitBindGroupLayout) {
        state.blitBindGroup = device.createBindGroup({
            layout: state.blitBindGroupLayout,
            entries: [
                { binding: 0, resource: state.intermediateTextureView },
                { binding: 1, resource: state.blitSampler },
            ],
        });
    }
}

// Create the blit pipeline for final output with optional gamma correction
function createBlitPipeline(device, presentationFormat) {
    const blitModule = device.createShaderModule({
        label: 'Blit Shader',
        code: BLIT_SHADER,
    });
    
    state.blitBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
    });
    
    const blitPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [state.blitBindGroupLayout],
    });
    
    state.blitSampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
    });
    
    // Pipeline for sRGB mode (no conversion - passthrough)
    state.blitPipelineSRGB = device.createRenderPipeline({
        layout: blitPipelineLayout,
        vertex: { module: blitModule, entryPoint: 'vs_main' },
        fragment: {
            module: blitModule,
            entryPoint: 'fs_main',
            targets: [{ format: presentationFormat }],
        },
        primitive: { topology: 'triangle-list' },
    });
    
    // Pipeline for linear mode (applies linear→sRGB conversion)
    state.blitPipelineLinear = device.createRenderPipeline({
        layout: blitPipelineLayout,
        vertex: { module: blitModule, entryPoint: 'vs_main' },
        fragment: {
            module: blitModule,
            entryPoint: 'fs_main_linear',
            targets: [{ format: presentationFormat }],
        },
        primitive: { topology: 'triangle-list' },
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

        // Ensure intermediate texture exists and is correct size
        const width = Math.ceil(state.canvasWidth / state.pixelScale);
        const height = Math.ceil(state.canvasHeight / state.pixelScale);
        
        if (!state.intermediateTexture || 
            state.intermediateTexture.width !== width || 
            state.intermediateTexture.height !== height) {
            createIntermediateTexture(device, width, height);
        }

        // Create bind group for compute pass (writes to intermediate texture)
        const computeBindGroup = device.createBindGroup({
            layout: state.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: state.uniformBuffer } },
                { binding: 1, resource: { buffer: state.computeBuffer } },
                { binding: 2, resource: { buffer: state.audioBufferGPU } },
                { binding: 3, resource: state.intermediateTextureView },
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
        
        // COMPUTE PASS - render to intermediate texture
        const computePass = encoder.beginComputePass();
        
        // AUDIO PASS FIRST - Only for GPU audio mode!
        if (needsGPUAudio) {
            computePass.setPipeline(state.audioPipeline);
            computePass.setBindGroup(0, computeBindGroup);
            computePass.dispatchWorkgroups(
                Math.ceil(DERIVED.samplesPerBlock / 128),
                1,
                1
            );
        }
        
        // GRAPHICS PASS - Reads audio data from buffer
        if (state.graphicsPipeline) {
            computePass.setPipeline(state.graphicsPipeline);
            computePass.setBindGroup(0, computeBindGroup);
            computePass.dispatchWorkgroups(
                Math.ceil(width / 8),
                Math.ceil(height / 8),
                1
            );
        }
        
        computePass.end();
        
        // BLIT PASS - copy intermediate texture to canvas with optional gamma correction
        const canvasTexture = state.gpuContext.getCurrentTexture();
        const blitPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: canvasTexture.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        
        // Choose pipeline based on colorspace mode
        const blitPipeline = state.linearColorspace ? state.blitPipelineLinear : state.blitPipelineSRGB;
        blitPass.setPipeline(blitPipeline);
        blitPass.setBindGroup(0, state.blitBindGroup);
        blitPass.draw(3, 1, 0, 0);  // Fullscreen triangle
        blitPass.end();

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
    
    // Destroy intermediate texture (must be recreated with new device)
    if (state.intermediateTexture) {
        state.intermediateTexture.destroy();
        state.intermediateTexture = null;
        state.intermediateTextureView = null;
    }
    state.blitBindGroup = null;
    
    // Note: WebGPU buffers and resources are garbage collected
    // We just need to null out references
}

// ============================================================================
// Colorspace Configuration
// ============================================================================

/**
 * Update the colorspace mode
 * @param {boolean} linear - true for linear (compute.toys), false for sRGB (Shadertoy)
 * 
 * When linear=true, the blit pass applies linear→sRGB conversion (like compute.toys)
 * When linear=false, no conversion is applied (like Shadertoy)
 */
export function setColorspace(linear) {
    state.linearColorspace = linear;
    console.log(`✓ WebGPU colorspace set to ${linear ? 'linear (with sRGB conversion)' : 'sRGB (no conversion)'}`);
}

