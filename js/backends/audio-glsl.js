// ============================================================================
// GLSL Audio Backend - Shadertoy-compatible Audio Synthesis
// ============================================================================
// Renders audio using WebGL shaders, compatible with Shadertoy's sound shaders.
// Signature: vec2 mainSound(int samp, float time)
//   samp = absolute sample index from start
//   time = absolute time in seconds

import { state, AUDIO_MODES, logStatus } from '../core.js';

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
let sampleRateLocation = null;
let sampleOffsetLocation = null;
let framebuffer = null;
let texture = null;
let maxTextureSize = 4096;
let currentWidth = 0;

self.onmessage = async (e) => {
    if (e.data.type === 'init') {
        const { canvas, shaderCode } = e.data;
        setupWebGL(canvas, shaderCode);
    } else if (e.data.type === 'render') {
        const { numSamples, sampleRate, sampleOffset } = e.data;
        const audioData = generateAudio(numSamples, sampleRate, sampleOffset);
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
    
    // Wrap user's mainSound function with boilerplate
    const fragmentShaderSource = \`#version 300 es
        precision highp float;
        precision highp int;
        
        uniform float iSampleRate;
        uniform int iSampleOffset;
        
        out vec4 fragColor;
        
        // User's shader code (must define mainSound)
        \${shaderCode}
        
        void main() {
            // Calculate absolute sample index (integer, no precision loss)
            int samp = iSampleOffset + int(gl_FragCoord.x - 0.5);
            
            // Calculate time from sample index (full precision)
            float time = float(samp) / iSampleRate;
            
            // Call user's mainSound function
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
    
    sampleRateLocation = gl.getUniformLocation(program, 'iSampleRate');
    sampleOffsetLocation = gl.getUniformLocation(program, 'iSampleOffset');
    
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

function generateAudio(numSamples, sampleRate, sampleOffset) {
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
    
    gl.uniform1f(sampleRateLocation, sampleRate);
    gl.uniform1i(sampleOffsetLocation, sampleOffset);
    
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
        
        renderWorker.postMessage({
            type: 'render',
            numSamples: samplesToGenerate,
            sampleRate,
            sampleOffset
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
    
    // Start generation loop
    generationLoop();
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
}

