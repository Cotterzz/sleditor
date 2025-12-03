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
import * as audioGlsl from './backends/audio-glsl.js';
import * as render from './render.js';
import * as editor from './editor.js';
import * as jsRuntime from './js-runtime.js';
import { getBoilerplate, MINIMAL_JS } from './examples.js';
import { getBoilerplateForTab, getBoilerplateLineCount } from './glsl-boilerplate.js';
import * as aiAssist from './ai-assist.js';
import * as channels from './channels.js';
import { getActiveGlslTab, syncCurrentGraphicsTabCode } from './tabs.js';
import { setCompileOverlay, setCompileTime } from './ui.js';

const PASS_LABELS = {
    main: 'Main (ch0)'
};

function buildPassPlan(currentGLSLTab) {
    const passes = [];
    const bufferChannels = channels.getBufferExecutionOrder();
    bufferChannels.forEach(ch => {
        passes.push({
            type: 'buffer',
            tabName: ch.tabName,
            channelNumber: ch.number,
            label: ch.name || `Buffer(ch${ch.number})`
        });
    });
    
    passes.push({
        type: 'main',
        tabName: currentGLSLTab,
        channelNumber: 0,
        label: PASS_LABELS.main
    });
    
    return passes;
}

function getPassSource(pass) {
    if (!pass) return '';
    if (pass.type === 'main') {
        return state.tabCodeCache[pass.tabName] ??
            state.graphicsEditor?.getValue() ??
            '';
    }
    return state.tabCodeCache[pass.tabName] ?? '';
}

function adjustGLSLErrors(errors, boilerplateLines, channelUniformLines) {
    if (!errors?.length) return errors;
    const totalInjectedLines = (boilerplateLines || 0) + (channelUniformLines || 0);
    if (totalInjectedLines === 0) {
        return errors;
    }
    return errors.map(err => ({
        ...err,
        lineNum: Math.max(1, err.lineNum - totalInjectedLines)
    }));
}

// ============================================================================
// GLSL Compilation Path
// ============================================================================

export async function compileGLSL(hasAudioWorklet, hasAudioGlsl, skipAudioReload) {
    const compileToken = ++state.currentCompileToken;
    state.isRecompiling = true;
    setCompileOverlay(true);
    await waitForNextFrame();
    try {
        const currentCode = state.graphicsEditor ? state.graphicsEditor.getValue() : '';
        
        if (state.currentTab.startsWith('glsl_')) {
            const hasAIRequest = await aiAssist.processAIRequest(currentCode, state.currentTab);
            if (hasAIRequest) {
                return false;
            }
        }
        
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
        
        // Ensure ping-pong textures and framebuffer exist even if WebGL was initialized elsewhere
        channels.initMainBufferTextures();
        webgl.initBufferResources();
        
        // Always ensure WebGL canvas is visible when compiling GLSL
        state.canvasWebGL.style.display = 'block';
        state.canvasWebGPU.style.display = 'none';
        
        const startTotal = performance.now();
        
        const currentGLSLTab = getActiveGlslTab();
        if (!currentGLSLTab) {
            logStatus('✗ No GLSL tab active. Add a GLSL tab to compile.', 'error');
            return false;
        }
        
        const boilerplate = getBoilerplateForTab(currentGLSLTab);
        const boilerplateLines = getBoilerplateLineCount(currentGLSLTab);
        
        syncCurrentGraphicsTabCode();
        
        const passPlan = buildPassPlan(currentGLSLTab);
        if (passPlan.length === 0) {
            logStatus('✗ No GLSL passes to compile', 'error');
            return false;
        }
        
        const compiledPasses = [];
        for (const pass of passPlan) {
            const source = getPassSource(pass);
            const requiredChannels = channels.parseChannelUsage(source);
            
            // Check if all required channels exist (for non-raw modes)
            if (boilerplate !== '') {
                const missingChannels = [];
                requiredChannels.forEach(chNum => {
                    const channel = channels.getChannel(chNum);
                    if (!channel) {
                        missingChannels.push(chNum);
                    }
                });
                
                if (missingChannels.length > 0) {
                    const channelList = missingChannels.map(n => `iChannel${n}`).join(', ');
                    const errorMsg = `Shader uses ${channelList} but this channel(s) doesn't exist. Add using the '+Add Pass' button.`;
                    logStatus(`✗ ${pass.label}: ${errorMsg}`, 'error');
                    return false;
                }
            }
            
            // Build full source
            let fullSource;
            if (boilerplate === '') {
                // Raw GLSL mode: NO automatic additions, user must declare everything
                fullSource = source;
            } else {
                // Regular/Stoy/Golf mode: add channel uniforms automatically
                let channelUniforms = '';
                requiredChannels.forEach(chNum => {
                    channelUniforms += `uniform sampler2D iChannel${chNum};\n`;
                });
                fullSource = boilerplate + channelUniforms + source;
            }
            
            const compileResult = await webgl.compileProgram(fullSource);
            if (!compileResult.success) {
                const adjustedErrors = adjustGLSLErrors(compileResult.errors, boilerplateLines, requiredChannels.length);
                const shouldShowInEditor = pass.type === 'main' || state.currentTab === pass.tabName;
                if (shouldShowInEditor) {
                    editor.setGLSLErrors(adjustedErrors);
                }
                
                const errorMsg = adjustedErrors.map(e => `Line ${e.lineNum}: ${e.message}`).join('\n');
                logStatus(`✗ ${pass.label} compilation failed:\n` + errorMsg, 'error');
                return false;
            }
            
            const channelUniformLocations = {};
            requiredChannels.forEach(chNum => {
                channelUniformLocations[chNum] = state.glContext?.getUniformLocation(compileResult.program, `iChannel${chNum}`);
            });
            
            compiledPasses.push({
                ...pass,
                program: compileResult.program,
                uniforms: compileResult.uniforms,
                requiredChannels,
                channelUniformLocations
            });
        }
        
        if (compileToken !== state.currentCompileToken) {
            webgl.disposePassPrograms(compiledPasses);
            queueCompileRerun(hasAudioWorklet, skipAudioWorkletReload);
            return false;
        }
        
        webgl.disposePassPrograms(state.webglPasses);
        state.webglPasses = compiledPasses;
        state.graphicsBackend = 'webgl';
        state.glProgram = compiledPasses.find(pass => pass.type === 'main')?.program || null;
        
        // Load Audio if present
        let audioSuccess = true;
        if (!skipAudioReload) {
            if (hasAudioGlsl) {
                // Initialize GLSL audio backend
                await audioGlsl.init(state.audioContext, state.gainNode);
                
                const audioCode = state.audioEditor.getValue();
                const result = await audioGlsl.load(audioCode);
                if (!result.success) {
                    editor.setAudioWorkletErrors(result.errors); // Reuse error display
                    const errMsg = result.errors[0] ? `Line ${result.errors[0].lineNum || '?'}: ${result.errors[0].message}` : 'Unknown error';
                    logStatus(`✗ GLSL Audio error: ${errMsg}`, 'error');
                    audioSuccess = false;
                }
            } else if (hasAudioWorklet) {
                const audioCode = state.audioEditor.getValue();
                const result = await audioWorklet.load(audioCode);
                if (!result.success) {
                    editor.setAudioWorkletErrors(result.errors);
                    const errMsg = result.errors[0] ? `Line ${result.errors[0].lineNum || '?'}: ${result.errors[0].message}` : 'Unknown error';
                    logStatus(`✗ AudioWorklet error: ${errMsg}`, 'error');
                    audioSuccess = false;
                }
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
            await jsRuntime.compile(MINIMAL_JS, true);
        }
        
        if (!audioSuccess || !jsSuccess) {
            return false;
        }
        
        const totalTime = performance.now() - startTotal;
        const mainSource = getPassSource(passPlan.find(pass => pass.type === 'main'));
        console.log('Compiled passes:', compiledPasses.map(p => p.label));
        
        setCompileTime(totalTime);
        
        let statusMessage = `✓ Compiled in ${totalTime.toFixed(1)}ms`;
        if (currentGLSLTab === 'glsl_golf') {
            statusMessage += ` | ${mainSource.length} chars`;
        }
        logStatus(statusMessage, 'success');
        
        jsRuntime.callInit();
        
        if (!state.isPlaying) {
            render.renderOnce();
        }
        
        return true;
    } catch (err) {
        if (compileToken === state.currentCompileToken) {
            logStatus('✗ ' + err.message, 'error');
            console.error('GLSL compilation error:', err);
        }
        return false;
    } finally {
        if (state.currentCompileToken === compileToken) {
            state.isRecompiling = false;
            setCompileOverlay(false);
        }
    }
}

function queueCompileRerun(hasAudioWorklet, skipAudioWorkletReload) {
    if (state.isRecompiling) return;
    setTimeout(() => {
        const currentTab = getActiveGlslTab();
        if (!currentTab) {
            state.isRecompiling = false;
            setCompileOverlay(false);
            return;
        }
        state.isRecompiling = true;
        setCompileOverlay(true);
        const hasAudioGlsl = state.activeTabs.includes('audio_glsl');
        compileGLSL(hasAudioWorklet, hasAudioGlsl, skipAudioWorkletReload);
    }, 50);
}

function waitForNextFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
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
    const hasAudioGlsl = state.activeTabs.includes('audio_glsl');
    
    // Determine backend based on active tabs
    const needsWebGPU = hasGraphicsWGSL || hasAudioGpu;
    const needsWebGL = hasGraphicsGLSL;
    
    // Stop old audio
    const isWorkletActive = state.audioMode === AUDIO_MODES.WORKLET && state.audioWorkletNode;
    const isGlslAudioActive = state.audioMode === AUDIO_MODES.GLSL;
    const skipAudioReload = isResizeOnly && (isWorkletActive || isGlslAudioActive);
    
    if (!skipAudioReload) {
        stopAudio();
    }
    
    // Handle GLSL (WebGL) compilation
    if (needsWebGL) {
        return await compileGLSL(hasAudioWorklet, hasAudioGlsl, skipAudioReload);
    }
    
    // Non-graphics mode (JS + Audio only)
    if (!needsWebGPU || !state.hasWebGPU) {
        try {
            logStatus('Compiling...', 'info');
            editor.clearAllErrors();
            
            const startTotal = performance.now();
            let audioSuccess = true;
            let jsSuccess = true;
            
            // Load Audio if present
            if (!skipAudioReload) {
                if (hasAudioGlsl) {
                    await audioGlsl.init(state.audioContext, state.gainNode);
                    const audioCode = state.audioEditor.getValue();
                    const result = await audioGlsl.load(audioCode);
                    if (!result.success) {
                        editor.setAudioWorkletErrors(result.errors);
                        logStatus(`✗ GLSL Audio error: ${result.errors[0].message}`, 'error');
                        audioSuccess = false;
                    }
                } else if (hasAudioWorklet) {
                    const audioCode = state.audioEditor.getValue();
                    const result = await audioWorklet.load(audioCode);
                    if (!result.success) {
                        editor.setAudioWorkletErrors(result.errors);
                        logStatus(`✗ AudioWorklet error: ${result.errors[0].message}`, 'error');
                        audioSuccess = false;
                    }
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
        
        // Load Audio if present (AudioWorklet - GLSL audio wouldn't be used with WebGPU graphics)
        if (hasAudioWorklet && !skipAudioReload) {
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
            await jsRuntime.compile(MINIMAL_JS, true);
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
    audioGlsl.cleanup();
    state.audioMode = AUDIO_MODES.NONE;
}

