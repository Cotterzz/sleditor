// ============================================================================
// Audio Waveform Visualization
// ============================================================================
// GPU-accelerated waveform generation and display for GLSL audio shaders.
// Uses a dedicated WebGL worker for efficient min/max decimation.

import { state, AUDIO_MODES } from './core.js';

// ============================================================================
// State
// ============================================================================

let waveformWorker = null;
let waveformWorkerReady = false;
let waveformWorkerError = null;
let waveformCanvas = null;
let waveformCtx = null;
let waveformCache = new Map();
let waveformPendingRequest = null;
let waveformRequestId = 0;

// Waveform view state
let waveformZoom = 1.0;  // seconds visible
let waveformOffset = 0;  // start time in seconds
let sampleRate = 48000;

// Animation
let animationFrameId = null;
let lastUniformHash = '';
let uniformCheckCounter = 0;

// ============================================================================
// Worker Code Generation
// ============================================================================

function createWaveformWorkerCode() {
    return `
let gl = null;
let program = null;
let sampleRateLocation = null;
let sampleOffsetLocation = null;
let sampleStepLocation = null;
let uniformLocations = {};
let currentUniforms = null;
let framebuffer = null;
let texture = null;
let maxTextureSize = 4096;
let currentWidth = 0;
let shaderValid = false;

self.onmessage = async (e) => {
    if (e.data.type === 'init') {
        const { canvas, shaderCode } = e.data;
        setupWebGL(canvas, shaderCode);
    } else if (e.data.type === 'render') {
        if (!shaderValid) {
            self.postMessage({ type: 'waveformError', error: 'Shader not valid' });
            return;
        }
        const { startSample, endSample, outputWidth, sampleRate, requestId, uniforms } = e.data;
        if (uniforms) currentUniforms = uniforms;
        const result = generateDecimated(startSample, endSample, outputWidth, sampleRate);
        if (result) {
            self.postMessage({ 
                type: 'waveformData', 
                minMaxData: result, 
                startSample,
                endSample,
                outputWidth,
                requestId 
            }, [result.buffer]);
        }
    } else if (e.data.type === 'updateShader') {
        const { shaderCode } = e.data;
        updateShader(shaderCode);
    } else if (e.data.type === 'updateUniforms') {
        currentUniforms = e.data.uniforms;
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
        self.postMessage({ type: 'waveformError', error: 'WebGL2 not supported' });
        return;
    }
    
    gl.getExtension('EXT_color_buffer_float');
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    
    updateShader(shaderCode);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    
    if (program) {
        const positionLoc = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    }
}

function updateShader(shaderCode) {
    shaderValid = false;
    
    const vertexShaderSource = \`#version 300 es
        in vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    \`;
    
    // Shader with all uniforms for compatibility with audio shaders
    // Note: We include common uniforms that audio shaders might use
    const fragmentShaderSource = \`#version 300 es
        precision highp float;
        precision highp int;
        
        // Waveform-specific uniforms
        uniform float iSampleRate;
        uniform int iSampleOffset;
        uniform int iSampleStep;
        
        // Built-in uniforms (from graphics shaders)
        uniform float iTime;
        uniform int iFrame;
        uniform vec4 iMouse;
        uniform vec2 u_mouse;
        uniform vec2 u_click;
        uniform vec2 u_hover;
        
        // Custom float uniforms (sliders)
        uniform float u_custom0, u_custom1, u_custom2, u_custom3, u_custom4;
        uniform float u_custom5, u_custom6, u_custom7, u_custom8, u_custom9;
        
        out vec4 fragColor;
        
        \${shaderCode}
        
        void main() {
            int pixelIdx = int(gl_FragCoord.x - 0.5);
            int samp = iSampleOffset + pixelIdx * iSampleStep;
            float time = float(samp) / iSampleRate;
            vec2 sound = mainSound(samp, time);
            sound = clamp(sound, -1.0, 1.0);
            fragColor = vec4(sound, 0.0, 1.0);
        }
    \`;
    
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
        self.postMessage({ type: 'waveformError', error: 'Shader compilation failed' });
        return;
    }
    
    if (program) gl.deleteProgram(program);
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        self.postMessage({ type: 'waveformError', error: 'Shader link failed' });
        return;
    }
    
    gl.useProgram(program);
    
    // Core uniforms
    sampleRateLocation = gl.getUniformLocation(program, 'iSampleRate');
    sampleOffsetLocation = gl.getUniformLocation(program, 'iSampleOffset');
    sampleStepLocation = gl.getUniformLocation(program, 'iSampleStep');
    
    // Built-in uniforms
    uniformLocations = {
        iTime: gl.getUniformLocation(program, 'iTime'),
        iFrame: gl.getUniformLocation(program, 'iFrame'),
        iMouse: gl.getUniformLocation(program, 'iMouse'),
        u_mouse: gl.getUniformLocation(program, 'u_mouse'),
        u_click: gl.getUniformLocation(program, 'u_click'),
        u_hover: gl.getUniformLocation(program, 'u_hover')
    };
    
    // Custom float uniforms (first 10)
    for (let i = 0; i < 10; i++) uniformLocations['u_custom' + i] = gl.getUniformLocation(program, 'u_custom' + i);
    
    // Re-setup vertex attrib
    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    
    shaderValid = true;
    self.postMessage({ type: 'waveformReady' });
}

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function generateDecimated(startSample, endSample, outputWidth, sampleRate) {
    const totalSamples = endSample - startSample;
    const OVERSAMPLE = 8;
    const targetRenderSamples = Math.min(outputWidth * OVERSAMPLE, totalSamples, maxTextureSize);
    const sampleStep = Math.max(1, Math.floor(totalSamples / targetRenderSamples));
    const renderWidth = Math.min(Math.ceil(totalSamples / sampleStep), maxTextureSize);
    
    if (currentWidth !== renderWidth) {
        if (texture) gl.deleteTexture(texture);
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, renderWidth, 1, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        
        currentWidth = renderWidth;
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    }
    
    gl.uniform1f(sampleRateLocation, sampleRate);
    gl.uniform1i(sampleOffsetLocation, startSample);
    gl.uniform1i(sampleStepLocation, sampleStep);
    
    // Apply current uniforms if available
    if (currentUniforms) {
        if (uniformLocations.iTime) gl.uniform1f(uniformLocations.iTime, currentUniforms.time || 0);
        if (uniformLocations.iFrame) gl.uniform1i(uniformLocations.iFrame, currentUniforms.frame || 0);
        if (uniformLocations.iMouse) {
            const md = currentUniforms.mouseDrag || [0,0];
            const mc = currentUniforms.mouseClick || [0,0];
            gl.uniform4f(uniformLocations.iMouse, md[0], md[1], mc[0], mc[1]);
        }
        if (uniformLocations.u_mouse) {
            const md = currentUniforms.mouseDrag || [0,0];
            gl.uniform2f(uniformLocations.u_mouse, md[0], md[1]);
        }
        if (uniformLocations.u_click) {
            const mc = currentUniforms.mouseClick || [0,0];
            gl.uniform2f(uniformLocations.u_click, mc[0], mc[1]);
        }
        if (uniformLocations.u_hover) {
            const mh = currentUniforms.mouseHover || [0,0];
            gl.uniform2f(uniformLocations.u_hover, mh[0], mh[1]);
        }
        
        // Custom floats (first 10)
        const cf = currentUniforms.customFloats || [];
        for (let i = 0; i < 10; i++) {
            if (uniformLocations['u_custom' + i]) gl.uniform1f(uniformLocations['u_custom' + i], cf[i] || 0);
        }
    }
    
    gl.viewport(0, 0, renderWidth, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    const pixelData = new Float32Array(renderWidth * 4);
    gl.readPixels(0, 0, renderWidth, 1, gl.RGBA, gl.FLOAT, pixelData);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    const result = new Float32Array(outputWidth * 4);
    const samplesPerColumn = renderWidth / outputWidth;
    
    for (let col = 0; col < outputWidth; col++) {
        const colStart = Math.floor(col * samplesPerColumn);
        const colEnd = Math.min(Math.ceil((col + 1) * samplesPerColumn), renderWidth);
        
        let minL = 1, maxL = -1, minR = 1, maxR = -1;
        let hasData = false;
        
        for (let i = colStart; i < colEnd; i++) {
            const left = pixelData[i * 4];
            const right = pixelData[i * 4 + 1];
            
            if (!hasData) {
                minL = maxL = left;
                minR = maxR = right;
                hasData = true;
            } else {
                minL = Math.min(minL, left);
                maxL = Math.max(maxL, left);
                minR = Math.min(minR, right);
                maxR = Math.max(maxR, right);
            }
        }
        
        if (!hasData && renderWidth > 0) {
            const nearestIdx = Math.min(Math.floor(col * renderWidth / outputWidth), renderWidth - 1);
            minL = maxL = pixelData[nearestIdx * 4];
            minR = maxR = pixelData[nearestIdx * 4 + 1];
        }
        
        result[col * 4] = minL;
        result[col * 4 + 1] = maxL;
        result[col * 4 + 2] = minR;
        result[col * 4 + 3] = maxR;
    }
    
    return result;
}
`;
}

// ============================================================================
// Initialization
// ============================================================================

export async function init(shaderCode) {
    if (waveformWorker) {
        cleanup();
    }
    
    sampleRate = state.audioContext?.sampleRate || 48000;
    
    const workerCode = createWaveformWorkerCode();
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    waveformWorker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    
    waveformWorkerReady = false;
    waveformWorkerError = null;
    
    waveformWorker.onmessage = (e) => {
        if (e.data.type === 'waveformReady') {
            waveformWorkerReady = true;
            waveformWorkerError = null;
            requestWaveformUpdate();
        } else if (e.data.type === 'waveformError') {
            waveformWorkerError = e.data.error;
            waveformWorkerReady = true;
            drawWaveform();
        } else if (e.data.type === 'waveformData') {
            onWaveformDataGenerated(e.data);
        }
    };
    
    waveformWorker.onerror = (e) => {
        console.error('[Waveform Worker] Error:', e.message);
        waveformWorkerError = e.message;
        waveformWorkerReady = true;
    };
    
    const canvas = document.createElement('canvas');
    const offscreen = canvas.transferControlToOffscreen();
    
    waveformWorker.postMessage({
        type: 'init',
        canvas: offscreen,
        shaderCode: shaderCode || ''
    }, [offscreen]);
    
    // Wait for ready with timeout
    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        const check = setInterval(() => {
            if (waveformWorkerReady) {
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
            }
        }, 10);
    });
    
    return { success: waveformWorkerReady && !waveformWorkerError };
}

// ============================================================================
// Shader Updates
// ============================================================================

export async function updateShader(shaderCode) {
    if (!waveformWorker) {
        return init(shaderCode);
    }
    
    waveformWorkerReady = false;
    waveformWorkerError = null;
    waveformCache.clear();
    waveformPendingRequest = null;
    
    waveformWorker.postMessage({
        type: 'updateShader',
        shaderCode
    });
    
    // Wait for ready with timeout
    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        const check = setInterval(() => {
            if (waveformWorkerReady) {
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
            }
        }, 10);
    });
    
    if (!waveformWorkerError) {
        requestWaveformUpdate();
    } else {
        drawWaveform();
    }
}

// ============================================================================
// Canvas Setup
// ============================================================================

export function setupCanvas(canvas) {
    waveformCanvas = canvas;
    waveformCtx = canvas.getContext('2d');
    
    let isDragging = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
        const oldZoom = waveformZoom;
        
        waveformZoom = Math.max(1/60, Math.min(60, waveformZoom * zoomFactor));
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseRatio = mouseX / canvas.width;
        
        const oldTimeAtMouse = waveformOffset + oldZoom * mouseRatio;
        const newTimeAtMouse = waveformOffset + waveformZoom * mouseRatio;
        waveformOffset += (oldTimeAtMouse - newTimeAtMouse);
        waveformOffset = Math.max(0, waveformOffset);
        
        updateZoomDisplay();
        requestWaveformUpdate();
    });
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartOffset = waveformOffset;
        canvas.style.cursor = 'grabbing';
    });
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const timePerPixel = waveformZoom / canvas.width;
        waveformOffset = Math.max(0, dragStartOffset - dx * timePerPixel);
        requestWaveformUpdate();
    };
    
    const onMouseUp = () => {
        isDragging = false;
        if (canvas) canvas.style.cursor = 'grab';
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    canvas.style.cursor = 'grab';
    
    // Store cleanup functions
    canvas._waveformCleanup = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };
    
    requestWaveformUpdate();
}

function updateZoomDisplay() {
    const zoomInfo = document.getElementById('waveformZoomInfo');
    if (zoomInfo) {
        if (waveformZoom < 1) {
            zoomInfo.textContent = `Zoom: ${(waveformZoom * 1000).toFixed(0)}ms`;
        } else {
            zoomInfo.textContent = `Zoom: ${waveformZoom.toFixed(2)}s`;
        }
    }
}

// ============================================================================
// Waveform Generation
// ============================================================================

export function requestWaveformUpdate() {
    if (!waveformCanvas || !waveformWorkerReady || waveformWorkerError) {
        drawWaveform();
        return;
    }
    
    const canvas = waveformCanvas;
    const width = canvas.width;
    
    const startTime = waveformOffset;
    const endTime = startTime + waveformZoom;
    
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.ceil(endTime * sampleRate);
    
    // Get current uniform values for the waveform
    const uniforms = state.uniformBuilder ? state.uniformBuilder.data : null;
    
    // Simple cache key - uniform changes are handled by checkUniformChanges() which clears cache
    const cacheKey = `${startSample}-${endSample}-${width}`;
    
    if (waveformCache.has(cacheKey)) {
        drawWaveform();
        return;
    }
    
    waveformRequestId++;
    const requestId = waveformRequestId;
    
    waveformPendingRequest = {
        cacheKey,
        requestId,
        startSample,
        endSample,
        width
    };
    
    waveformWorker.postMessage({
        type: 'render',
        startSample,
        endSample,
        outputWidth: width,
        sampleRate,
        requestId,
        uniforms
    });
    
    drawWaveform();
}

function onWaveformDataGenerated(data) {
    const { minMaxData, startSample, endSample, outputWidth, requestId } = data;
    
    if (!waveformPendingRequest || waveformPendingRequest.requestId !== requestId) {
        return;
    }
    
    const cacheKey = waveformPendingRequest.cacheKey;
    
    waveformCache.set(cacheKey, {
        data: minMaxData,
        startSample,
        endSample,
        width: outputWidth
    });
    
    waveformPendingRequest = null;
    
    // Limit cache size
    if (waveformCache.size > 10) {
        const firstKey = waveformCache.keys().next().value;
        waveformCache.delete(firstKey);
    }
    
    drawWaveform();
}

// ============================================================================
// Drawing
// ============================================================================

function drawWaveform() {
    if (!waveformCanvas || !waveformCtx) return;
    
    const canvas = waveformCanvas;
    const ctx = waveformCtx;
    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;
    
    const startTime = waveformOffset;
    const endTime = startTime + waveformZoom;
    
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.ceil(endTime * sampleRate);
    
    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw center line
    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    
    // Draw time markers
    drawTimeMarkers(ctx, width, height, startTime, endTime);
    
    // Find matching cache entry
    const cacheKey = `${startSample}-${endSample}-${width}`;
    const cached = waveformCache.get(cacheKey);
    
    if (cached && cached.data) {
        const data = cached.data;
        const scale = midY - 10;
        
        for (let x = 0; x < width && x < cached.width; x++) {
            const minL = data[x * 4];
            const maxL = data[x * 4 + 1];
            const minR = data[x * 4 + 2];
            const maxR = data[x * 4 + 3];
            
            // Calculate y positions with minimum 1px height for visibility
            let y1L = midY - maxL * scale;
            let y2L = midY - minL * scale;
            if (Math.abs(y2L - y1L) < 1) {
                // Keep position but ensure 1px minimum height
                const centerY = (y1L + y2L) / 2;
                y1L = centerY - 0.5;
                y2L = centerY + 0.5;
            }
            
            let y1R = midY - maxR * scale;
            let y2R = midY - minR * scale;
            if (Math.abs(y2R - y1R) < 1) {
                const centerY = (y1R + y2R) / 2;
                y1R = centerY - 0.5;
                y2R = centerY + 0.5;
            }
            
            // Draw left channel (red)
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, y1L);
            ctx.lineTo(x + 0.5, y2L);
            ctx.stroke();
            
            // Draw right channel (green)
            ctx.strokeStyle = 'rgba(80, 255, 80, 0.8)';
            ctx.beginPath();
            ctx.moveTo(x + 0.5, y1R);
            ctx.lineTo(x + 0.5, y2R);
            ctx.stroke();
        }
    } else if (waveformWorkerError) {
        ctx.fillStyle = '#f44747';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Shader error - fix code to see waveform', width / 2, midY);
    } else if (waveformPendingRequest) {
        ctx.fillStyle = '#808080';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Generating waveform...', width / 2, midY);
    } else if (!waveformWorkerReady) {
        ctx.fillStyle = '#808080';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Initializing...', width / 2, midY);
    }
    
    // Draw playhead if audio is playing
    if (state.isPlaying && state.audioMode === AUDIO_MODES.GLSL) {
        const currentTime = getCurrentPlaybackTime();
        if (currentTime >= startTime && currentTime <= endTime) {
            const x = ((currentTime - startTime) / waveformZoom) * width;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }
}

function drawTimeMarkers(ctx, width, height, startTime, endTime) {
    const duration = endTime - startTime;
    
    let interval;
    if (duration <= 0.1) interval = 0.01;
    else if (duration <= 0.5) interval = 0.05;
    else if (duration <= 1) interval = 0.1;
    else if (duration <= 5) interval = 0.5;
    else if (duration <= 10) interval = 1;
    else if (duration <= 30) interval = 5;
    else interval = 10;
    
    ctx.strokeStyle = '#2a2a2a';
    ctx.fillStyle = '#666666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    
    const firstMark = Math.ceil(startTime / interval) * interval;
    
    for (let t = firstMark; t <= endTime; t += interval) {
        const x = ((t - startTime) / duration) * width;
        
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        
        const label = t < 1 ? `${(t * 1000).toFixed(0)}ms` : `${t.toFixed(1)}s`;
        ctx.fillText(label, x, height - 5);
    }
}

function getCurrentPlaybackTime() {
    // Get current playback time from audio-glsl module
    // This is approximate based on scheduled audio
    if (state.audioContext && state.nextAudioTime) {
        const now = state.audioContext.currentTime;
        // Estimate based on how much audio has been scheduled
        return Math.max(0, now - (state.audioStartTime || 0));
    }
    return 0;
}

// ============================================================================
// Animation
// ============================================================================

export function startAnimation() {
    if (animationFrameId) return;
    
    function animate() {
        // Check for uniform changes every 10 frames (~6 times per second)
        uniformCheckCounter++;
        if (uniformCheckCounter >= 10) {
            uniformCheckCounter = 0;
            checkUniformChanges();
        }
        
        drawWaveform();
        animationFrameId = requestAnimationFrame(animate);
    }
    animate();
}

function checkUniformChanges() {
    const uniforms = state.uniformBuilder?.data;
    if (!uniforms) return;
    
    // Create a hash of current uniform values
    const hash = [
        uniforms.mouseDrag?.[0]?.toFixed(3),
        uniforms.mouseDrag?.[1]?.toFixed(3),
        uniforms.mouseClick?.[0]?.toFixed(3),
        uniforms.mouseClick?.[1]?.toFixed(3),
        ...(uniforms.customFloats || []).slice(0, 10).map(v => v?.toFixed(3))
    ].join(',');
    
    if (hash !== lastUniformHash) {
        lastUniformHash = hash;
        waveformCache.clear();
        requestWaveformUpdate();
    }
}

export function stopAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    drawWaveform();
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanup() {
    stopAnimation();
    
    if (waveformCanvas && waveformCanvas._waveformCleanup) {
        waveformCanvas._waveformCleanup();
    }
    
    if (waveformWorker) {
        waveformWorker.terminate();
        waveformWorker = null;
    }
    
    waveformWorkerReady = false;
    waveformWorkerError = null;
    waveformCanvas = null;
    waveformCtx = null;
    waveformCache.clear();
    waveformPendingRequest = null;
}

// ============================================================================
// Getters
// ============================================================================

export function isReady() {
    return waveformWorkerReady && !waveformWorkerError;
}

export function hasError() {
    return !!waveformWorkerError;
}

export function getZoom() {
    return waveformZoom;
}

export function setZoom(zoom) {
    waveformZoom = Math.max(1/60, Math.min(60, zoom));
    updateZoomDisplay();
    requestWaveformUpdate();
}

export function resetView() {
    waveformZoom = 1.0;
    waveformOffset = 0;
    updateZoomDisplay();
    requestWaveformUpdate();
}

/**
 * Called when uniforms change (mouse move, slider change, etc.)
 * Clears cache and triggers waveform regeneration
 */
export function onUniformsChanged() {
    // Clear cache since uniforms have changed
    waveformCache.clear();
    requestWaveformUpdate();
}

