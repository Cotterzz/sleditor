// ============================================================================
// Render Loop - Main rendering coordination
// ============================================================================

import { state, CONFIG, DERIVED, UNIFORM_STRUCT, logStatus } from './core.js';
import { UniformBuilder } from './uniforms.js';
import * as webgpu from './backends/webgpu.js';
import * as webgl from './backends/webgl.js';
import * as jsRuntime from './js-runtime.js';
import * as perfMonitor from './performance-monitor.js';

// ============================================================================
// Main Render Loop
// ============================================================================

export function render(rawTime) {
    if (!state.isRunning) return;
    
    // Skip rendering during shader recompilation to prevent flicker
    if (state.isRecompiling) {
        requestAnimationFrame(render);
        return;
    }
    
    // Only render when playing
    if (!state.isPlaying) {
        requestAnimationFrame(render);
        return;
    }

    // Mark frame start for performance monitoring
    perfMonitor.markFrameStart();

    const device = state.gpuDevice;
    const gl = state.glContext;
    const ctx = state.audioContext;
    
    // Debug: Log on first frame
    if (state.visualFrame === 0) {
        console.log('First render frame - backend:', state.graphicsBackend, 'device:', !!device, 'gl:', !!gl);
    }
    
    // Mark JS start (before user code)
    perfMonitor.markJSStart();
    
    // Determine rendering mode based on available backend
    if (state.graphicsBackend === 'webgl' && gl) {
        renderWebGLMode(rawTime, gl, ctx);
    } else if (state.graphicsBackend === 'webgpu' && device) {
        renderGPUMode(rawTime, device, ctx);
    } else {
        // Non-graphics mode: just call enterframe
        renderNonGPUMode(rawTime);
    }
    
    // Mark JS end (after user code)
    perfMonitor.markJSEnd();
    
    // Mark frame end for performance monitoring
    perfMonitor.markFrameEnd();
    
    requestAnimationFrame(render);
}

// ============================================================================
// Non-GPU Rendering (AudioWorklet + JS only)
// ============================================================================

function renderNonGPUMode(rawTime) {
    // Calculate elapsed time
    const elapsedMs = rawTime - state.startTime - state.pausedTime;
    const elapsedSec = elapsedMs * 0.001;
    
    // Update counters
    state.visualFrame++;
    state.fpsFrameCount++;
    if (rawTime - state.fpsLastTime >= 1000) {
        state.fps = Math.round(state.fpsFrameCount * 1000 / (rawTime - state.fpsLastTime));
        state.fpsFrameCount = 0;
        state.fpsLastTime = rawTime;
        updateFPSDisplay();
    }
    updateCounterDisplays(state.visualFrame, elapsedSec);
    
    // Call user's enterframe (non-GPU mode - uniforms are no-op)
    const result = jsRuntime.callEnterframe(elapsedSec, null, null, state.audioContext);
    if (!result.success) {
        handleEnterframeError(result);
    }
}

// ============================================================================
// WebGL Rendering (GLSL Graphics)
// ============================================================================

function renderWebGLMode(rawTime, gl, ctx) {
    // Calculate elapsed time (accounting for pauses)
    const elapsedMs = rawTime - state.startTime - state.pausedTime;
    const elapsedSec = elapsedMs * 0.001;
    
    // Increment visual frame counter
    state.visualFrame++;
    
    // Calculate FPS (update every second)
    state.fpsFrameCount++;
    if (rawTime - state.fpsLastTime >= 1000) {
        state.fps = Math.round(state.fpsFrameCount * 1000 / (rawTime - state.fpsLastTime));
        state.fpsFrameCount = 0;
        state.fpsLastTime = rawTime;
        updateFPSDisplay();
    }
    
    updateCounterDisplays(state.visualFrame, elapsedSec);

    // Build uniforms using abstraction layer
    const uniforms = new UniformBuilder();
    uniforms.setTime(elapsedSec);
    uniforms.setAudioTime(ctx.currentTime, state.nextAudioTime, state.nextAudioTime % 1);
    uniforms.setAudioFrame(state.audioFrame);
    uniforms.setResolution(state.canvasWebGL.width, state.canvasWebGL.height);
    uniforms.setMouse(state.mouseX, state.mouseY);
    uniforms.setFrame(state.visualFrame);
    
    // Call user's enterframe BEFORE rendering (so uniforms can be set)
    const { f32: uniformF32, i32: uniformI32 } = uniforms.getArrays();
    const result = jsRuntime.callEnterframe(elapsedSec, uniformF32, uniformI32, ctx);
    if (!result.success) {
        handleEnterframeError(result);
        return;
    }
    
    // Render with WebGL backend
    webgl.renderFrame(uniforms);
}

// ============================================================================
// GPU Rendering (WebGPU + optional audio)
// ============================================================================

function renderGPUMode(rawTime, device, ctx) {
    // Calculate elapsed time (accounting for pauses)
    const elapsedMs = rawTime - state.startTime - state.pausedTime;
    const elapsedSec = elapsedMs * 0.001;
    
    // Increment visual frame counter
    state.visualFrame++;
    
    // Debug: log first frame
    if (state.visualFrame === 1) {
        console.log('First GPU frame rendering, device:', !!device, 'context:', !!state.gpuContext, 'pipeline:', !!state.graphicsPipeline);
    }
    
    // Calculate FPS (update every second)
    state.fpsFrameCount++;
    if (rawTime - state.fpsLastTime >= 1000) {
        state.fps = Math.round(state.fpsFrameCount * 1000 / (rawTime - state.fpsLastTime));
        state.fpsFrameCount = 0;
        state.fpsLastTime = rawTime;
        updateFPSDisplay();
    }
    
    updateCounterDisplays(state.visualFrame, elapsedSec);

    // Build uniforms using abstraction layer
    const uniforms = new UniformBuilder();
    uniforms.setTime(elapsedSec);
    uniforms.setAudioTime(ctx.currentTime, state.nextAudioTime, state.nextAudioTime % 1);
    uniforms.setAudioFrame(state.audioFrame);
    uniforms.setResolution(state.canvasWebGPU.width, state.canvasWebGPU.height);
    uniforms.setMouse(state.mouseX, state.mouseY);
    uniforms.setFrame(state.visualFrame);
    
    // Call user's enterframe BEFORE rendering (so uniforms can be set)
    const { f32: uniformF32, i32: uniformI32 } = uniforms.getArrays();
    const result = jsRuntime.callEnterframe(elapsedSec, uniformF32, uniformI32, ctx);
    if (!result.success) {
        handleEnterframeError(result);
        return;
    }
    
    // Render with WebGPU backend
    webgpu.renderFrame(uniforms.getBuffer(), ctx);
}

// ============================================================================
// Error Handling
// ============================================================================

function handleEnterframeError(result) {
    // Pause playback on runtime error
    state.isPlaying = false;
    if (state.audioContext) {
        state.audioContext.suspend();
    }
    
    // Update play/pause button (will be called from main app)
    const event = new CustomEvent('playback-error', { detail: result });
    window.dispatchEvent(event);
    
    if (state.activeTabs.includes('js')) {
        const errorInfo = result.errorInfo;
        
        // Dispatch error event for editor to handle
        const errorEvent = new CustomEvent('js-runtime-error', { 
            detail: {
                lineNum: errorInfo.lineNum,
                column: errorInfo.column,
                endColumn: errorInfo.endColumn,
                message: `Runtime error in enterframe(): ${errorInfo.message}`
            }
        });
        window.dispatchEvent(errorEvent);
        
        logStatus(`✗ JS enterframe() error (line ${errorInfo.lineNum}): ${result.error.message}`, 'error');
    } else {
        logStatus(`✗ JS runtime error: ${result.error.message}`, 'error');
    }
    console.error('enterframe error:', result.error);
}

// ============================================================================
// UI Updates
// ============================================================================

function updateFPSDisplay() {
    const fpsEl = document.getElementById('fpsCounter');
    if (fpsEl) {
        fpsEl.textContent = state.fps;
    }
}

function updateCounterDisplays(frame, time) {
    const frameEl = document.getElementById('frameCounter');
    const timeEl = document.getElementById('timeCounter');
    
    if (frameEl) {
        frameEl.textContent = frame;
    }
    if (timeEl) {
        timeEl.textContent = time.toFixed(2) + 's';
    }
}

// ============================================================================
// Start/Stop
// ============================================================================

export function start() {
    if (!state.isRunning) {
        state.isRunning = true;
        state.startTime = performance.now();
        state.pausedTime = 0;
        state.fpsLastTime = performance.now();
        requestAnimationFrame(render);
    }
}

export function stop() {
    state.isRunning = false;
}

// ============================================================================
// Single Frame Render (for paused state)
// ============================================================================

export function renderOnce() {
    // Render a single frame at the current paused time
    if (!state.isRunning) return;
    
    const device = state.gpuDevice;
    const ctx = state.audioContext;
    
    // Calculate current elapsed time (accounting for pauses)
    let rawTime;
    if (!state.isPlaying && state.lastPauseTime > 0) {
        // Use the frozen time from when we paused
        rawTime = state.lastPauseTime;
    } else {
        rawTime = performance.now();
    }
    const elapsedMs = rawTime - state.startTime - state.pausedTime;
    const elapsedSec = elapsedMs * 0.001;
    
    // Non-graphics mode
    if (!device && !state.glContext) {
        // Call user's enterframe
        jsRuntime.callEnterframe(elapsedSec, null, null, ctx);
        return;
    }
    
    // Build uniforms using abstraction layer
    const uniforms = new UniformBuilder();
    uniforms.setTime(elapsedSec);
    uniforms.setAudioTime(ctx.currentTime, state.nextAudioTime, state.nextAudioTime % 1);
    uniforms.setAudioFrame(state.audioFrame);
    
    // Use appropriate canvas based on active backend
    const activeCanvas = state.graphicsBackend === 'webgl' ? state.canvasWebGL : state.canvasWebGPU;
    uniforms.setResolution(activeCanvas.width, activeCanvas.height);
    uniforms.setMouse(state.mouseX, state.mouseY);
    uniforms.setFrame(state.visualFrame);
    
    // Call user's enterframe
    const { f32: uniformF32, i32: uniformI32 } = uniforms.getArrays();
    jsRuntime.callEnterframe(elapsedSec, uniformF32, uniformI32, ctx);
    
    // Render with appropriate backend
    if (state.graphicsBackend === 'webgl' && state.glContext) {
        webgl.renderFrame(uniforms);
    } else if (state.graphicsBackend === 'webgpu' && device) {
        webgpu.renderFrame(uniforms.getBuffer(), ctx);
    }
}

