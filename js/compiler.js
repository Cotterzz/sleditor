// ============================================================================
// Shader Compilation Orchestration
// ============================================================================
// This module coordinates shader compilation across multiple backends and systems.
// It routes to the correct compilation path based on active tabs and handles
// multi-system coordination (graphics, audio, JS).

import { state, CONFIG, DERIVED, AUDIO_MODES, logStatus } from './core.js';
import * as webgpu from './backends/webgpu.js';
import * as webgl from './backends/webgl.js';
import * as audioWorklet from './backends/audio-worklet.js';
import * as render from './render.js';
import * as editor from './editor.js';
import * as jsRuntime from './js-runtime.js';
import { getBoilerplate, MINIMAL_JS } from './examples.js';
import { getBoilerplateForTab, getBoilerplateLineCount } from './glsl-boilerplate.js';

// ============================================================================
// GLSL Compilation Path
// ============================================================================

export async function compileGLSL(hasAudioWorklet, skipAudioWorkletReload) {
    try {
        logStatus('Compiling GLSL...', 'info');
        editor.clearAllErrors();
        
        // Initialize WebGL if needed
        if (!state.glContext) {
            console.log('Initializing WebGL for GLSL...');
            
            // Clear WebGPU state (switching from WebGPU to WebGL)
            if (state.gpuContext) {
                console.log('Releasing WebGPU context to switch to WebGL...');
                state.gpuContext.unconfigure();
                state.gpuContext = null;
                state.graphicsBackend = null;
            }
            
            const webglResult = await webgl.init(state.canvasWebGL);
            if (!webglResult.success) {
                logStatus('✗ WebGL2 not available', 'error');
                return false;
            }
        }
        
        // Always ensure WebGL canvas is visible when compiling GLSL
        state.canvasWebGL.style.display = 'block';
        state.canvasWebGPU.style.display = 'none';
        
        const startTotal = performance.now();
        
        // Determine which GLSL tab is active
        const currentGLSLTab = state.activeTabs.find(tab => 
            tab === 'glsl_fragment' || tab === 'glsl_regular' || tab === 'glsl_stoy' || tab === 'glsl_golf'
        );
        
        // Get fragment shader code from editor
        const userCode = state.graphicsEditor.getValue();
        
        // Inject boilerplate if needed
        const boilerplate = getBoilerplateForTab(currentGLSLTab);
        const fullSource = boilerplate + userCode;
        
        if (boilerplate) {
            console.log(`  Injecting ${getBoilerplateLineCount(currentGLSLTab)} lines of boilerplate for ${currentGLSLTab}`);
        }
        
        // Compile GLSL shader
        const compileResult = await webgl.compile(fullSource);
        if (!compileResult.success) {
            // Adjust error line numbers if boilerplate was injected
            let errors = compileResult.errors;
            if (boilerplate) {
                const boilerplateLines = getBoilerplateLineCount(currentGLSLTab);
                errors = errors.map(err => {
                    const userLine = Math.max(1, err.lineNum - boilerplateLines);
                    return {
                        ...err,
                        lineNum: userLine,
                        message: err.message  // Keep original message
                    };
                });
            }
            
            editor.setGLSLErrors(errors);
            
            const errorMsg = errors.map(e => 
                `Line ${e.lineNum}: ${e.message}`
            ).join('\n');
            
            logStatus('✗ GLSL compilation failed:\n' + errorMsg, 'error');
            return false;
        }
        
        // Load AudioWorklet if present
        let audioSuccess = true;
        if (hasAudioWorklet && !skipAudioWorkletReload) {
            const audioCode = state.audioEditor.getValue();
            const result = await audioWorklet.load(audioCode);
            if (!result.success) {
                editor.setAudioWorkletErrors(result.errors);
                const errMsg = result.errors[0] ? `Line ${result.errors[0].lineNum || '?'}: ${result.errors[0].message}` : 'Unknown error';
                logStatus(`✗ AudioWorklet error: ${errMsg}`, 'error');
                audioSuccess = false;
            }
        }
        
        // Compile JS
        let jsSuccess = true;
        if (state.activeTabs.includes('js')) {
            const jsCode = state.jsEditor.getValue();
            const result = await jsRuntime.compile(jsCode, false);
            if (!result.success) {
                editor.setJSErrors(result.errors);
                const errMsg = result.errors[0] ? `Line ${result.errors[0].lineNum || '?'}: ${result.errors[0].message}` : 'Unknown error';
                logStatus(`✗ JS error: ${errMsg}`, 'error');
                jsSuccess = false;
            }
        } else {
            // No JS tab active - reset to minimal JS to prevent old code from running
            await jsRuntime.compile(MINIMAL_JS, false);
        }
        
        if (!audioSuccess || !jsSuccess) {
            return false;
        }
        
        const totalTime = performance.now() - startTotal;
        
        // For Golf mode, add character count
        let statusMessage = `✓ Compiled in ${totalTime.toFixed(1)}ms`;
        if (currentGLSLTab === 'glsl_golf') {
            const charCount = userCode.length;
            statusMessage += ` | ${charCount} chars`;
        }
        logStatus(statusMessage, 'success');
        
        // Call user init
        jsRuntime.callInit();
        
        // If paused, render a single frame to show the compiled shader
        if (!state.isPlaying) {
            render.renderOnce();
        }
        
        return true;
    } catch (err) {
        logStatus('✗ ' + err.message, 'error');
        console.error('GLSL compilation error:', err);
        return false;
    }
}

// ============================================================================
// Main Shader Reload/Compilation Entry Point
// ============================================================================

export async function reloadShader(isResizeOnly = false) {
    // Detect which tabs are active
    const hasGraphicsWGSL = state.activeTabs.includes('graphics');
    const hasGraphicsGLSL = state.activeTabs.includes('glsl_fragment') || 
                           state.activeTabs.includes('glsl_regular') || 
                           state.activeTabs.includes('glsl_stoy') ||
                           state.activeTabs.includes('glsl_golf');
    const hasAudioGpu = state.activeTabs.includes('audio_gpu');
    const hasAudioWorklet = state.activeTabs.includes('audio_worklet');
    
    // Determine backend based on active tabs
    const needsWebGPU = hasGraphicsWGSL || hasAudioGpu;
    const needsWebGL = hasGraphicsGLSL;
    
    // Stop old audio
    const isWorkletActive = state.audioMode === AUDIO_MODES.WORKLET && state.audioWorkletNode;
    const skipAudioWorkletReload = isResizeOnly && isWorkletActive && hasAudioWorklet;
    
    if (!skipAudioWorkletReload) {
        stopAudio();
    }
    
    // Handle GLSL (WebGL) compilation
    if (needsWebGL) {
        return await compileGLSL(hasAudioWorklet, skipAudioWorkletReload);
    }
    
    // Non-graphics mode (JS + AudioWorklet only)
    if (!needsWebGPU || !state.hasWebGPU) {
        try {
            logStatus('Compiling...', 'info');
            editor.clearAllErrors();
            
            const startTotal = performance.now();
            let audioSuccess = true;
            let jsSuccess = true;
            
            // Load AudioWorklet if present
            if (hasAudioWorklet && !skipAudioWorkletReload) {
                const audioCode = state.audioEditor.getValue();
                const result = await audioWorklet.load(audioCode);
                if (!result.success) {
                    editor.setAudioWorkletErrors(result.errors);
                    logStatus(`✗ AudioWorklet error: ${result.errors[0].message}`, 'error');
                    audioSuccess = false;
                }
            }
            
            // Compile JS
            if (state.activeTabs.includes('js')) {
                const code = state.jsEditor.getValue();
                const result = await jsRuntime.compile(code, false);
                if (!result.success) {
                    editor.setJSErrors(result.errors);
                    logStatus(`✗ JS error: ${result.errors[0].message}`, 'error');
                    jsSuccess = false;
                }
            } else {
                // No JS tab active - reset to minimal JS to prevent old code from running
                await jsRuntime.compile(MINIMAL_JS, false);
            }
            
            if (audioSuccess && jsSuccess) {
                const totalTime = performance.now() - startTotal;
                logStatus(`✓ Compiled in ${totalTime.toFixed(1)}ms`, 'success');
                return true;
            }
            return false;
        } catch (err) {
            logStatus('✗ ' + err.message, 'error');
            return false;
        }
    }
    
    // GPU mode (WebGPU + optional audio)
    
    // If WebGL is currently active, reinitialize WebGPU
    if (state.glContext && !state.gpuContext) {
        console.log('Reinitializing WebGPU (switching from WebGL)...');
        const webgpuResult = await webgpu.init(state.canvasWebGPU);
        if (!webgpuResult.success) {
            logStatus('✗ Failed to reinitialize WebGPU', 'error');
            return false;
        }
        // Clean up WebGL state
        state.glContext = null;
        state.glProgram = null;
        state.glUniforms = null;
    }
    
    // Always ensure WebGPU canvas is visible when compiling WGSL
    state.canvasWebGPU.style.display = 'block';
    state.canvasWebGL.style.display = 'none';
    
    const boilerplate = getBoilerplate();
    const graphics = state.graphicsEditor.getValue();
    const audio = hasAudioGpu ? state.audioEditor.getValue() : '';
    const code = boilerplate + '\n' + graphics + '\n' + audio;
    
    state.boilerplateEditor.setValue(boilerplate);
    
    try {
        logStatus('Compiling...', 'info');
        editor.clearAllErrors();
        
        const startTotal = performance.now();
        
        // Compile WGSL
        const compileResult = await webgpu.compile(code, hasGraphicsWGSL, hasAudioGpu);
        if (!compileResult.success) {
            editor.setWGSLErrors(compileResult.errors);
            
            // Convert raw line numbers to user-friendly editor-relative line numbers
            const boilerplateLines = state.boilerplateEditor.getValue().split('\n').length;
            const graphicsLines = state.graphicsEditor.getValue().split('\n').length;
            const graphicsStartLine = boilerplateLines + 1;
            const audioStartLine = boilerplateLines + 1 + graphicsLines + 1;
            
            const errorMsg = compileResult.errors.map(e => {
                const lineNum = e.lineNum || 1;
                let editorName, editorLine;
                
                if (lineNum < graphicsStartLine) {
                    editorName = 'Boilerplate';
                    editorLine = lineNum;
                } else if (lineNum < audioStartLine) {
                    editorName = 'Graphics';
                    editorLine = lineNum - graphicsStartLine + 1;
                } else {
                    editorName = 'Audio';
                    editorLine = lineNum - audioStartLine + 2;
                }
                
                return `${editorName} line ${editorLine}: ${e.message}`;
            }).join('\n');
            
            logStatus('✗ Shader compilation failed:\n' + errorMsg, 'error');
            return false;
        }
        
        // Load AudioWorklet if present
        if (hasAudioWorklet && !skipAudioWorkletReload) {
            const audioCode = state.audioEditor.getValue();
            const result = await audioWorklet.load(audioCode);
            if (!result.success) {
                editor.setAudioWorkletErrors(result.errors);
                const errMsg = result.errors[0] ? `Line ${result.errors[0].lineNum || '?'}: ${result.errors[0].message}` : 'Unknown error';
                logStatus(`✗ AudioWorklet error: ${errMsg}`, 'error');
                return false;
            }
        }
        
        // Compile JS
        if (state.activeTabs.includes('js')) {
            const jsCode = state.jsEditor.getValue();
            const result = await jsRuntime.compile(jsCode, false);
            if (!result.success) {
                editor.setJSErrors(result.errors);
                const errMsg = result.errors[0] ? `Line ${result.errors[0].lineNum || '?'}: ${result.errors[0].message}` : 'Unknown error';
                logStatus(`✗ JS error: ${errMsg}`, 'error');
                return false;
            }
        } else {
            // No JS tab active - reset to minimal JS to prevent old code from running
            await jsRuntime.compile(MINIMAL_JS, false);
        }
        
        const totalTime = performance.now() - startTotal;
        logStatus(`✓ Compiled in ${totalTime.toFixed(1)}ms`, 'success');
        
        // Call user init
        jsRuntime.callInit();
        
        // If paused, render a single frame to show the compiled shader
        if (!state.isPlaying) {
            render.renderOnce();
        }
        
        return true;
    } catch (err) {
        logStatus('✗ ' + err.message, 'error');
        console.error('Compilation error:', err);
        return false;
    }
}

// ============================================================================
// Audio Cleanup
// ============================================================================

export function stopAudio() {
    state.audioPipeline = null;
    state.pendingAudio = false;
    audioWorklet.cleanup();
    state.audioMode = AUDIO_MODES.NONE;
}

