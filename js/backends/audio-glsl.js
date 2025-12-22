// ============================================================================
// GLSL Audio Backend - Shadertoy-compatible Audio Synthesis
// ============================================================================
// Renders audio using WebGL shaders, compatible with Shadertoy's sound shaders.
// Signature: vec2 mainSound(int samp, float time)
//   samp = absolute sample index from start
//   time = absolute time in seconds

import { state, AUDIO_MODES, logStatus } from '../core.js';
import * as waveformPanel from '../ui/audio-waveform-panel.js';

// ============================================================================
// State
// ============================================================================

let audioContext = null;
let gainNode = null;
let renderWorker = null;
let workerReady = false;
let isRunning = false;
let sampleOffset = 0;
let scheduledUntil = 0;
let scheduledSources = [];
let maxTextureSize = 4096;
let bufferAheadTime = 0.5;
let generating = false;
let animationFrameId = null;

// ============================================================================
// Initialization
// ============================================================================

export async function init(ctx, gain) {
    audioContext = ctx || state.audioContext;
    gainNode = gain || state.gainNode;
    
    if (!audioContext) {
        return { success: false, error: 'AudioContext not available' };
    }
    
    return { success: true };
}

// ============================================================================
// Load/Compile Shader
// ============================================================================

export async function load(shaderCode) {
    if (!audioContext) {
        return { 
            success: false, 
            errors: [{ lineNum: 1, message: 'AudioContext not initialized' }] 
        };
    }
    
    const codeLines = shaderCode.split('\n').length;
    
    try {
        // Stop any existing playback
        stop();
        
        // Terminate old worker if exists
        if (renderWorker) {
            renderWorker.terminate();
            renderWorker = null;
        }
        
        workerReady = false;
        
        // Create Web Worker for background rendering
        const workerCode = createWorkerCode();
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        renderWorker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        
        // Set up message handling
        return new Promise((resolve) => {
            let resolved = false;
            
            renderWorker.onmessage = (e) => {
                if (e.data.type === 'ready') {
                    workerReady = true;
                    if (!resolved) {
                        resolved = true;
                        state.audioMode = AUDIO_MODES.GLSL;
                        
                        // Initialize waveform panel
                        const container = document.getElementById('audioWaveformContainer');
                        if (container) {
                            waveformPanel.mountPanel(container);
                            waveformPanel.onAudioShaderLoaded(shaderCode);
                        }
                        
                        resolve({ success: true });
                    }
                } else if (e.data.type === 'maxTextureSize') {
                    maxTextureSize = e.data.size;
                } else if (e.data.type === 'audioData') {
                    generating = false;
                    onAudioDataGenerated(e.data.audioData, e.data.numSamples);
                } else if (e.data.type === 'error') {
                    console.error('GLSL Audio shader error:', e.data.error);
                    generating = false;
                    
                    if (!resolved) {
                        resolved = true;
                        
                        // Try to parse line number from error
                        const errors = parseShaderErrors(e.data.error, codeLines);
                        state.audioMode = AUDIO_MODES.NONE;
                        resolve({ success: false, errors });
                    }
                }
            };
            
            // Create offscreen canvas and send to worker
            const canvas = document.createElement('canvas');
            const offscreen = canvas.transferControlToOffscreen();
            
            renderWorker.postMessage({
                type: 'init',
                canvas: offscreen,
                shaderCode
            }, [offscreen]);
            
            // Timeout if worker doesn't respond
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve({ 
                        success: false, 
                        errors: [{ lineNum: 1, message: 'Worker initialization timeout' }] 
                    });
                }
            }, 5000);
        });
        
    } catch (err) {
        console.error('GLSL Audio loading error:', err);
        state.audioMode = AUDIO_MODES.NONE;
        return { 
            success: false, 
            errors: [{ lineNum: 1, message: err.message }] 
        };
    }
}

// ============================================================================
// Parse Shader Errors
// ============================================================================

function parseShaderErrors(errorStr, codeLines) {
    const errors = [];
    
    // Try to parse GLSL error format: "ERROR: 0:LINE: message"
    const lineMatch = errorStr.match(/ERROR:\s*\d+:(\d+):\s*(.+)/i);
    if (lineMatch) {
        let lineNum = parseInt(lineMatch[1]);
        const message = lineMatch[2];
        
        // Adjust for boilerplate lines (the wrapper adds ~15 lines before user code)
        const boilerplateLines = 15;
        lineNum = lineNum - boilerplateLines;
        
        if (lineNum > 0 && lineNum <= codeLines) {
            errors.push({ lineNum, message });
            return errors;
        }
    }
    
    // Try simpler format: ":LINE:"
    const simpleMatch = errorStr.match(/:(\d+):/);
    if (simpleMatch) {
        let lineNum = parseInt(simpleMatch[1]) - 15;
        if (lineNum > 0 && lineNum <= codeLines) {
            errors.push({ lineNum, message: errorStr });
            return errors;
        }
    }
    
    // Fallback: report on line 1
    errors.push({ lineNum: 1, message: errorStr });
    return errors;
}

// ============================================================================
// Worker Code Generation
// ============================================================================

function createWorkerCode() {
    return `
let gl = null;
let program = null;
let framebuffer = null;
let texture = null;
let maxTextureSize = 4096;
let currentWidth = 0;

// Uniform locations
let uniformLocs = {
    iSampleRate: null,
    iSampleOffset: null,
    iTime: null,
    iFrame: null,
    iMouse: null,
    customFloats: [],  // u_custom0-84
    customInts: [],    // u_customInt0-9
    customBools: []    // u_customBool0-4
};

self.onmessage = async (e) => {
    if (e.data.type === 'init') {
        const { canvas, shaderCode } = e.data;
        setupWebGL(canvas, shaderCode);
    } else if (e.data.type === 'render') {
        const { numSamples, sampleRate, sampleOffset, uniforms } = e.data;
        const audioData = generateAudio(numSamples, sampleRate, sampleOffset, uniforms);
        if (audioData) {
            self.postMessage({ type: 'audioData', audioData, numSamples }, [audioData.buffer]);
        } else {
            self.postMessage({ type: 'error', error: 'Generation failed' });
        }
    } else if (e.data.type === 'updateShader') {
        const { shaderCode } = e.data;
        updateShader(shaderCode);
    }
};

function setupWebGL(canvas, shaderCode) {
    gl = canvas.getContext('webgl2', {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        powerPreference: 'high-performance'
    });
    
    if (!gl) {
        self.postMessage({ type: 'error', error: 'WebGL2 not supported' });
        return;
    }
    
    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) {
        self.postMessage({ type: 'error', error: 'Float textures not supported' });
        return;
    }
    
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    self.postMessage({ type: 'maxTextureSize', size: maxTextureSize });
    
    updateShader(shaderCode);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    
    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
}

function updateShader(shaderCode) {
    const vertexShaderSource = \`#version 300 es
        in vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    \`;
    
    // Generate individual custom uniform declarations
    let customFloatDecls = '';
    for (let i = 0; i < 85; i++) {
        customFloatDecls += 'uniform float u_custom' + i + ';\\n        ';
    }
    let customIntDecls = '';
    for (let i = 0; i < 10; i++) {
        customIntDecls += 'uniform int u_customInt' + i + ';\\n        ';
    }
    let customBoolDecls = '';
    for (let i = 0; i < 5; i++) {
        customBoolDecls += 'uniform bool u_customBool' + i + ';\\n        ';
    }
    
    // Wrap user's mainSound function with boilerplate
    // Shadertoy-compatible: mainSound(int samp, float time)
    // For precision, users should use samp with fract() instead of time for oscillators
    const fragmentShaderSource = \`#version 300 es
        precision highp float;
        precision highp int;
        
        // Audio-specific uniforms
        uniform float iSampleRate;
        uniform int iSampleOffset;
        
        // Graphics state uniforms (synced from main thread)
        uniform float iTime;      // Graphics playback time
        uniform float u_time;     // Alias for iTime
        uniform int iFrame;       // Graphics frame number
        uniform int u_frame;      // Alias for iFrame
        uniform vec4 iMouse;      // Mouse: xy=current drag, zw=click position
        uniform vec2 u_mouse;     // Alias for iMouse.xy
        uniform vec2 u_click;     // Click position
        uniform vec2 u_hover;     // Hover position
        
        // Custom uniforms (85 floats, 10 ints, 5 bools) - same as graphics shaders
        \${customFloatDecls}
        \${customIntDecls}
        \${customBoolDecls}
        
        out vec4 fragColor;
        
        // User's shader code (must define mainSound)
        \${shaderCode}
        
        void main() {
            // Calculate absolute sample index (integer, no precision loss)
            int samp = iSampleOffset + int(gl_FragCoord.x - 0.5);
            
            // Calculate time (for Shadertoy compatibility)
            // WARNING: time has precision issues after ~40s for oscillators
            // Use: fract(float(samp) * freq / iSampleRate) instead
            float time = float(samp) / iSampleRate;
            
            // Call user's mainSound function (Shadertoy-compatible signature)
            vec2 sound = mainSound(samp, time);
            
            // Clamp to valid audio range
            sound = clamp(sound, -1.0, 1.0);
            
            fragColor = vec4(sound, 0.0, 1.0);
        }
    \`;
    
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) return;
    
    if (program) gl.deleteProgram(program);
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        self.postMessage({ type: 'error', error: 'Shader link error: ' + gl.getProgramInfoLog(program) });
        return;
    }
    
    gl.useProgram(program);
    
    // Get uniform locations
    uniformLocs.iSampleRate = gl.getUniformLocation(program, 'iSampleRate');
    uniformLocs.iSampleOffset = gl.getUniformLocation(program, 'iSampleOffset');
    uniformLocs.iTime = gl.getUniformLocation(program, 'iTime');
    uniformLocs.u_time = gl.getUniformLocation(program, 'u_time');
    uniformLocs.iFrame = gl.getUniformLocation(program, 'iFrame');
    uniformLocs.u_frame = gl.getUniformLocation(program, 'u_frame');
    uniformLocs.iMouse = gl.getUniformLocation(program, 'iMouse');
    uniformLocs.u_mouse = gl.getUniformLocation(program, 'u_mouse');
    uniformLocs.u_click = gl.getUniformLocation(program, 'u_click');
    uniformLocs.u_hover = gl.getUniformLocation(program, 'u_hover');
    
    // Custom uniform locations (individual, matching graphics shaders)
    uniformLocs.customFloats = [];
    for (let i = 0; i < 85; i++) {
        uniformLocs.customFloats[i] = gl.getUniformLocation(program, 'u_custom' + i);
    }
    uniformLocs.customInts = [];
    for (let i = 0; i < 10; i++) {
        uniformLocs.customInts[i] = gl.getUniformLocation(program, 'u_customInt' + i);
    }
    uniformLocs.customBools = [];
    for (let i = 0; i < 5; i++) {
        uniformLocs.customBools[i] = gl.getUniformLocation(program, 'u_customBool' + i);
    }
    
    self.postMessage({ type: 'ready' });
}

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        self.postMessage({ type: 'error', error: gl.getShaderInfoLog(shader) });
        return null;
    }
    
    return shader;
}

function generateAudio(numSamples, sampleRate, sampleOffset, uniforms) {
    const clampedSamples = Math.min(numSamples, maxTextureSize);
    
    if (currentWidth !== clampedSamples) {
        if (texture) gl.deleteTexture(texture);
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, clampedSamples, 1, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            self.postMessage({ type: 'error', error: 'Framebuffer error: ' + status });
            return null;
        }
        
        currentWidth = clampedSamples;
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    }
    
    // Core audio uniforms
    gl.uniform1f(uniformLocs.iSampleRate, sampleRate);
    gl.uniform1i(uniformLocs.iSampleOffset, sampleOffset);
    
    // Apply graphics state uniforms if provided
    if (uniforms) {
        // Time
        if (uniformLocs.iTime) gl.uniform1f(uniformLocs.iTime, uniforms.time || 0);
        if (uniformLocs.u_time) gl.uniform1f(uniformLocs.u_time, uniforms.time || 0);
        
        // Frame
        if (uniformLocs.iFrame) gl.uniform1i(uniformLocs.iFrame, uniforms.frame || 0);
        if (uniformLocs.u_frame) gl.uniform1i(uniformLocs.u_frame, uniforms.frame || 0);
        
        // Mouse
        const md = uniforms.mouseDrag || [0, 0];
        const mc = uniforms.mouseClick || [0, 0];
        const mh = uniforms.mouseHover || [0, 0];
        if (uniformLocs.iMouse) gl.uniform4f(uniformLocs.iMouse, md[0], md[1], mc[0], mc[1]);
        if (uniformLocs.u_mouse) gl.uniform2f(uniformLocs.u_mouse, md[0], md[1]);
        if (uniformLocs.u_click) gl.uniform2f(uniformLocs.u_click, mc[0], mc[1]);
        if (uniformLocs.u_hover) gl.uniform2f(uniformLocs.u_hover, mh[0], mh[1]);
        
        // Custom floats (individual uniforms, matching graphics shaders)
        if (uniforms.customFloats) {
            for (let i = 0; i < 85; i++) {
                if (uniformLocs.customFloats[i]) {
                    gl.uniform1f(uniformLocs.customFloats[i], uniforms.customFloats[i]);
                }
            }
        }
        
        // Custom ints (individual uniforms)
        if (uniforms.customInts) {
            for (let i = 0; i < 10; i++) {
                if (uniformLocs.customInts[i]) {
                    gl.uniform1i(uniformLocs.customInts[i], uniforms.customInts[i]);
                }
            }
        }
        
        // Custom bools (individual uniforms, as ints)
        if (uniforms.customBools) {
            for (let i = 0; i < 5; i++) {
                if (uniformLocs.customBools[i]) {
                    gl.uniform1i(uniformLocs.customBools[i], uniforms.customBools[i]);
                }
            }
        }
    }
    
    gl.viewport(0, 0, clampedSamples, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    const pixelData = new Float32Array(clampedSamples * 4);
    gl.readPixels(0, 0, clampedSamples, 1, gl.RGBA, gl.FLOAT, pixelData);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // Extract stereo audio from RGBA (R=left, G=right)
    const audioData = new Float32Array(clampedSamples * 2);
    for (let i = 0; i < clampedSamples; i++) {
        audioData[i * 2] = pixelData[i * 4];       // Left channel
        audioData[i * 2 + 1] = pixelData[i * 4 + 1]; // Right channel
    }
    
    return audioData;
}
`;
}

// ============================================================================
// Audio Generation Loop
// ============================================================================

function generationLoop() {
    if (!isRunning) {
        animationFrameId = requestAnimationFrame(generationLoop);
        return;
    }
    
    // Check how much audio is buffered ahead
    const now = audioContext.currentTime;
    const bufferedTime = scheduledUntil - now;
    
    // Request more audio if buffer is low and not already generating
    if (bufferedTime < bufferAheadTime && workerReady && !generating) {
        generating = true;
        
        const sampleRate = audioContext.sampleRate;
        // Generate ~100ms of audio per batch
        const samplesToGenerate = Math.min(Math.floor(sampleRate * 0.1), maxTextureSize);
        
        // Get current uniform values from the shared uniform builder
        const uniforms = state.uniformBuilder ? state.uniformBuilder.getAudioUniforms() : null;
        
        renderWorker.postMessage({
            type: 'render',
            numSamples: samplesToGenerate,
            sampleRate,
            sampleOffset,
            uniforms
        });
    }
    
    animationFrameId = requestAnimationFrame(generationLoop);
}

function onAudioDataGenerated(audioData, numSamples) {
    if (!isRunning) return;
    
    const sampleRate = audioContext.sampleRate;
    const actualSamples = audioData.length / 2;
    
    // Create AudioBuffer
    const buffer = audioContext.createBuffer(2, actualSamples, sampleRate);
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);
    
    for (let i = 0; i < actualSamples; i++) {
        leftChannel[i] = audioData[i * 2];
        rightChannel[i] = audioData[i * 2 + 1];
    }
    
    // Schedule playback
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    
    // Schedule from either current scheduled position or current time + small buffer
    const now = audioContext.currentTime;
    const startTime = Math.max(scheduledUntil, now + 0.05);
    
    source.start(startTime);
    
    scheduledSources.push(source);
    scheduledUntil = startTime + buffer.duration;
    
    // Advance sample offset for next batch
    sampleOffset += actualSamples;
    
    // Clean up old sources
    source.onended = () => {
        const idx = scheduledSources.indexOf(source);
        if (idx > -1) scheduledSources.splice(idx, 1);
    };
}

// ============================================================================
// Playback Control
// ============================================================================

export function start() {
    if (isRunning) return;
    
    isRunning = true;
    audioContext?.resume();
    
    // Initialize timing
    const now = audioContext?.currentTime || 0;
    scheduledUntil = now;
    sampleOffset = 0;
    state.audioStartTime = now;  // Track start time for waveform playhead
    
    // Start generation loop
    generationLoop();
    
    // Start waveform animation
    waveformPanel.onAudioStarted();
}

export function stop() {
    isRunning = false;
    
    // Stop all scheduled sources
    scheduledSources.forEach((source) => {
        try {
            source.stop();
            source.disconnect();
        } catch (e) {}
    });
    scheduledSources = [];
    
    sampleOffset = 0;
    scheduledUntil = 0;
    
    // Stop waveform animation
    waveformPanel.onAudioStopped();
}

export function restart() {
    const wasRunning = isRunning;
    stop();
    if (wasRunning) {
        start();
    }
}

export function isPlaying() {
    return isRunning;
}

export function getCurrentTime() {
    if (!audioContext) return 0;
    return sampleOffset / audioContext.sampleRate;
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanup() {
    stop();
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    if (renderWorker) {
        renderWorker.terminate();
        renderWorker = null;
    }
    
    workerReady = false;
    state.audioMode = AUDIO_MODES.NONE;
    
    // Cleanup waveform panel
    waveformPanel.cleanup();
}

