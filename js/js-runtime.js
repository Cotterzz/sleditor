// ============================================================================
// JS Runtime - User JavaScript Compilation and Execution
// ============================================================================

import { state } from './core.js';
import { sanitize } from './sanitizer.js';

// Default JS that runs when JS tab is not visible
const INVISIBLE_DEFAULT_JS = `
function init() {
    return {};
}

function enterframe(state, api) {
    // Mouse is automatically available via built-in uniforms
    // Use custom uniforms for your own data:
    // api.uniforms.setCustomFloat(0, someValue);
}
`;

// ============================================================================
// Error Parsing
// ============================================================================

export function parseJSError(err, codeLines) {
    // Extract line number from error message or stack
    let lineNum = 1;
    let column = 1;
    let endColumn = 1000; // Default to end of line
    
    // Try to parse from stack trace
    const stackMatch = err.stack?.match(/<anonymous>:(\d+):(\d+)/);
    if (stackMatch) {
        // Line numbers from Function() wrapper need adjustment
        // The template string has one leading newline, so subtract 1
        const rawLineNum = parseInt(stackMatch[1]);
        lineNum = Math.max(1, rawLineNum - 1);
        column = parseInt(stackMatch[2]) || 1;
        
        // Try to determine end column by looking at the error type
        // For syntax errors, highlight a reasonable amount
        if (err instanceof SyntaxError) {
            endColumn = column + 10; // Highlight ~10 chars for syntax errors
        } else {
            // For runtime errors, try to highlight the problematic token
            endColumn = column + 20; // Highlight more for runtime errors
        }
    } else {
        // Try parsing from error message (some syntax errors include line info)
        const msgMatch = err.message?.match(/line (\d+)/i);
        if (msgMatch) {
            lineNum = parseInt(msgMatch[1]);
        }
    }
    
    // Clamp to valid range
    lineNum = Math.min(lineNum, codeLines);
    
    return { lineNum, column, endColumn, message: err.message };
}

// ============================================================================
// Compilation
// ============================================================================

// Store module URL for cleanup
let currentModuleURL = null;
let hasLoggedExecutionMode = false;

// ============================================================================
// Sandboxed Execution 
// ============================================================================

let sandboxWorklet = null;
let sandboxContext = null;
let currentCodeBlobURL = null;
let pendingEnterframeCallback = null;
let processorNameCounter = 0; // Unique name for each compilation

export async function compile(code = null, useDefault = false) {
    // If JS tab is not active, use invisible default
    const actualCode = useDefault ? INVISIBLE_DEFAULT_JS : (code || '');
    const codeLines = actualCode.split('\n').length;
    
    // Reset execution log flag on recompile
    hasLoggedExecutionMode = false;
    
    // Sanitize code (skip for default code and sandboxed mode)
    if (!useDefault && state.jsExecutionMode !== 'sandboxed') {
        const sanitizeResult = sanitize(actualCode);
        if (!sanitizeResult.success) {
            return { success: false, errors: sanitizeResult.errors };
        }
    }
    
    // Choose execution method based on state
    if (state.jsExecutionMode === 'sandboxed') {
       
        return await compileSandboxed(actualCode, codeLines, useDefault);
    } else if (state.jsExecutionMode === 'module') {
       
        return await compileModule(actualCode, codeLines, useDefault);
    } else {
        
        return compileFunction(actualCode, codeLines, useDefault);
    }
}

// Method 1: new Function() - current method
function compileFunction(actualCode, codeLines, useDefault) {
    try {
        const compileStart = performance.now();
        
        // Create a safe scope and eval the user's code
        // We add one newline before user code to make line numbers match
        const wrappedCode = `
${actualCode}
return { init, enterframe };
`;
        const factory = new Function(wrappedCode);
        const userFunctions = factory();
        
        state.userInit = userFunctions.init;
        state.userEnterframe = userFunctions.enterframe;
        
        const compileTime = performance.now() - compileStart;
        
        
        return { success: true };
    } catch (err) {
        if (useDefault) {
            // Default JS should never fail, but if it does, log and continue
            console.error('Default JS compilation failed:', err);
            return { success: false, errors: [] };
        }
        
        const errorInfo = parseJSError(err, codeLines);
        
        return {
            success: false,
            errors: [{
                lineNum: errorInfo.lineNum,
                column: errorInfo.column,
                endColumn: errorInfo.endColumn,
                message: errorInfo.message
            }]
        };
    }
}

// Method 2: Dynamic Import - optimized method
async function compileModule(actualCode, codeLines, useDefault) {
    try {
        const compileStart = performance.now();
        
        // Clean up previous module URL
        if (currentModuleURL) {
            URL.revokeObjectURL(currentModuleURL);
            currentModuleURL = null;
        }
        
        // Wrap user code in ES6 module format
        // Users write init() and enterframe() like normal, we export them
        const moduleCode = `
${actualCode}

// Auto-export user functions (user doesn't need to write export)
export { init, enterframe };
`;
        
        // Create blob URL for dynamic import
        const blob = new Blob([moduleCode], { type: 'application/javascript' });
        currentModuleURL = URL.createObjectURL(blob);
        
        // Import the module
        const module = await import(currentModuleURL);
        
        state.userInit = module.init;
        state.userEnterframe = module.enterframe;
        
        const compileTime = performance.now() - compileStart;
        
        
        return { success: true };
    } catch (err) {
        if (useDefault) {
            // Default JS should never fail, but if it does, log and continue
            console.error('Default JS compilation failed:', err);
            return { success: false, errors: [] };
        }
        
        // Parse error from dynamic import
        const errorInfo = parseModuleError(err, codeLines);
        
        return {
            success: false,
            errors: [{
                lineNum: errorInfo.lineNum,
                column: errorInfo.column,
                endColumn: errorInfo.endColumn,
                message: errorInfo.message
            }]
        };
    }
}

// Parse errors from dynamic import (different format than Function errors)
function parseModuleError(err, codeLines) {
    let lineNum = 1;
    let column = 1;
    let endColumn = 1000;
    
    // Try to parse from error message
    // Module errors often include line:column format
    const lineColMatch = err.message?.match(/(\d+):(\d+)/);
    if (lineColMatch) {
        lineNum = parseInt(lineColMatch[1]);
        column = parseInt(lineColMatch[2]);
        endColumn = column + 20;
    }
    
    // Try to parse from stack trace
    const stackMatch = err.stack?.match(/blob:[^:]+:(\d+):(\d+)/);
    if (stackMatch) {
        // Module line numbers need adjustment for our wrapper
        const rawLineNum = parseInt(stackMatch[1]);
        lineNum = Math.max(1, rawLineNum - 1);
        column = parseInt(stackMatch[2]) || 1;
        
        if (err instanceof SyntaxError) {
            endColumn = column + 10;
        } else {
            endColumn = column + 20;
        }
    }
    
    // Clamp to valid range
    lineNum = Math.min(lineNum, codeLines);
    
    return { lineNum, column, endColumn, message: err.message };
}

// ============================================================================
// Sandboxed Compilation 
// ============================================================================

async function compileSandboxed(actualCode, codeLines, useDefault) {
    try {
        const compileStart = performance.now();
        
        // Clean up old blob URL
        if (currentCodeBlobURL) {
            URL.revokeObjectURL(currentCodeBlobURL);
            currentCodeBlobURL = null;
        }
        
        // Generate unique processor name for each compilation
        const processorName = `sandbox-processor-${processorNameCounter++}`;
        
        // Wrap user code
        const wrappedCode = `
// User's code (sandboxed - no DOM, window, or network access)
${actualCode}

// Wrapper that exposes user functions in isolated scope
class SandboxProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Initialize user state by calling init()
        try {
            this.userState = (typeof init === 'function') ? init() : {};
        } catch (err) {
            this.userState = {};
            this.port.postMessage({
                type: 'error',
                phase: 'init',
                error: err.message,
                stack: err.stack
            });
        }
        
        // Message handler from main thread
        this.port.onmessage = (e) => {
            if (e.data.type === 'enterframe') {
                this.runEnterframe(e.data);
            }
        };
    }
    
    runEnterframe(data) {
        try {
            const uniforms = new Float32Array(15);
            const audioMessages = []; // Collect audio.send() calls
            const audioParams = {}; // Collect audio.setParam() calls
            
            const api = {
                time: data.time,
                deltaTime: data.deltaTime,
                mouse: data.mouse,
                uniforms: {
                    setCustomFloat: (slot, value) => {
                        if (slot >= 0 && slot < 15) {
                            uniforms[slot] = value;
                        }
                    },
                    setCustomInt: (slot, value) => {
                        // Int uniforms not supported in sandboxed mode yet
                        // Could add if needed
                    }
                },
                audio: {
                    send: (message) => {
                        // Collect messages to relay to main thread
                        audioMessages.push(message);
                    },
                    setParam: (name, value) => {
                        // Collect params to relay to main thread
                        audioParams[name] = value;
                    }
                }
            };
            
            // Call user's enterframe function
            if (typeof enterframe === 'function') {
                enterframe(this.userState, api);
            }
            
            // Send back results including audio messages
            this.port.postMessage({
                type: 'result',
                uniforms: Array.from(uniforms),
                audioMessages: audioMessages,
                audioParams: audioParams
            });
        } catch (err) {
            this.port.postMessage({
                type: 'error',
                phase: 'enterframe',
                error: err.message,
                stack: err.stack
            });
        }
    }
    
    // Required by AudioWorkletProcessor - keeps worklet alive
    process() {
        return true;
    }
}

registerProcessor('${processorName}', SandboxProcessor);
`;
        
        // Create blob URL from wrapped code
        const blob = new Blob([wrappedCode], { type: 'application/javascript' });
        currentCodeBlobURL = URL.createObjectURL(blob);
        
        // Initialize AudioContext if needed
        if (!sandboxContext) {
            sandboxContext = new AudioContext({ sampleRate: 8000 });
        }
        
        // Load the module into Worklet
        await sandboxContext.audioWorklet.addModule(currentCodeBlobURL);
        
        // Create/recreate the worklet node
        if (sandboxWorklet) {
            sandboxWorklet.port.onmessage = null;
            sandboxWorklet.disconnect();
        }
        
        sandboxWorklet = new AudioWorkletNode(sandboxContext, processorName);
        
        // Handle responses from worklet
        sandboxWorklet.port.onmessage = (e) => {
            if (e.data.type === 'result') {
                // Apply uniforms via callback
                if (pendingEnterframeCallback) {
                    pendingEnterframeCallback(e.data.uniforms);
                    pendingEnterframeCallback = null;
                }
                
                // Relay audio messages to actual audio worklet
                if (e.data.audioMessages && e.data.audioMessages.length > 0) {
                    e.data.audioMessages.forEach(msg => {
                        if (state.audioWorkletNode && state.audioWorkletNode.port) {
                            state.audioWorkletNode.port.postMessage(msg);
                        }
                    });
                }
                
                // Relay audio params to actual audio worklet
                if (e.data.audioParams) {
                    Object.entries(e.data.audioParams).forEach(([name, value]) => {
                        if (state.audioWorkletNode && state.audioWorkletNode.parameters && 
                            state.audioWorkletNode.parameters.has(name)) {
                            state.audioWorkletNode.parameters.get(name).value = value;
                        }
                    });
                }
            } else if (e.data.type === 'warning') {
                console.warn(`⚠️ Sandboxed JS: ${e.data.message}`);
            } else if (e.data.type === 'error') {
                console.error(`Sandboxed JS ${e.data.phase} error:`, e.data.error);
                if (e.data.stack) {
                    console.error(e.data.stack);
                }
            }
        };
        
        const compileTime = performance.now() - compileStart;
       
        
        // Store placeholder functions for compatibility
        state.userInit = () => ({});
        state.userEnterframe = () => {}; // Actual execution happens in worklet
        
        return { success: true };
        
    } catch (err) {
        if (useDefault) {
            console.error('Default JS compilation failed:', err);
            return { success: false, errors: [] };
        }
        
        // Parse error
        const errorInfo = parseJSError(err, codeLines);
        
        return {
            success: false,
            errors: [{
                lineNum: errorInfo.lineNum,
                column: errorInfo.column,
                endColumn: errorInfo.endColumn,
                message: errorInfo.message
            }]
        };
    }
}

// ============================================================================
// Runtime Execution
// ============================================================================

export function callEnterframe(elapsedSec, uniformF32 = null, uniformI32 = null, audioContext = null) {
    // Log execution mode once per compilation
    if (!hasLoggedExecutionMode) {
        console.log(`▶️  Executing enterframe() compiled with: ${state.jsExecutionMode}`);
        hasLoggedExecutionMode = true;
    }
    
    // Sandboxed mode: delegate to Worklet
    if (state.jsExecutionMode === 'sandboxed') {
        // Check if sandbox is initialized
        if (!sandboxWorklet) {
            // Not an error - just skip this frame, it will initialize
            return { success: true };
        }
        return callEnterframeSandboxed(elapsedSec, uniformF32);
    }
    
    // Non-sandboxed modes: direct execution
    if (!state.userEnterframe) return { success: true };
    
    try {
        const api = {
            time: elapsedSec,
            deltaTime: 0.016, // Could calculate real delta
            mouse: { x: state.mouseX, y: state.mouseY },
            sampleRate: audioContext ? audioContext.sampleRate : 48000,
            samplesPerBlock: 0, // Will be set by caller
            audioFrame: state.audioFrame,
            audioMode: state.audioMode,
            audioBlockGenerated: false,
            uniforms: {
                // Custom uniforms API - slot 0-14 maps to buffer indices 7-21
                setCustomFloat: (slot, value) => {
                    if (uniformF32 && slot >= 0 && slot < 15) {
                        uniformF32[7 + slot] = value;
                    }
                },
                setCustomInt: (slot, value) => {
                    if (uniformI32 && slot >= 0 && slot < 15) {
                        uniformI32[7 + slot] = value;
                    }
                },
                // Legacy API (deprecated but kept for backwards compatibility)
                setFloat: (index, value) => {
                    if (uniformF32 && index >= 7 && index < 22) {
                        uniformF32[index] = value;
                    }
                },
                setInt: (index, value) => {
                    if (uniformI32 && index >= 7 && index < 22) {
                        uniformI32[index] = value;
                    }
                }
            },
            audio: {
                send: (data) => {
                    if (state.audioWorkletNode && state.audioWorkletNode.port) {
                        state.audioWorkletNode.port.postMessage(data);
                    }
                },
                setParam: (name, value) => {
                    if (state.audioWorkletNode && state.audioWorkletNode.parameters && 
                        state.audioWorkletNode.parameters.has(name)) {
                        state.audioWorkletNode.parameters.get(name).value = value;
                    }
                }
            }
        };
        
        state.userEnterframe(state.userState, api);
        return { success: true };
    } catch (err) {
        return { 
            success: false, 
            error: err,
            errorInfo: parseJSError(err, state.jsEditor ? state.jsEditor.getValue().split('\n').length : 1)
        };
    }
}

// ============================================================================
// Sandboxed Enterframe Execution
// ============================================================================

function callEnterframeSandboxed(elapsedSec, uniformF32) {
    if (!sandboxWorklet) {
        return { success: false, error: 'Sandbox not initialized' };
    }
    
    try {
        const t0 = performance.now();
        
        // Set up callback to apply uniforms when worklet responds
        pendingEnterframeCallback = (uniforms) => {
            
            if (uniformF32) {
                for (let i = 0; i < Math.min(uniforms.length, 15); i++) {
                    uniformF32[7 + i] = uniforms[i];
                }
            }
        };
        
        // Send enterframe request to worklet
        sandboxWorklet.port.postMessage({
            type: 'enterframe',
            time: elapsedSec,
            deltaTime: 0.016, // Could calculate real delta
            mouse: { x: state.mouseX, y: state.mouseY }
        });
        
        return { success: true };
    } catch (err) {
        return { 
            success: false, 
            error: err,
            errorInfo: { lineNum: 1, message: err.message }
        };
    }
}

// ============================================================================
// Initialization
// ============================================================================

export function callInit() {
    if (!state.userInit) {
        state.userState = { mouseX: 0.5, mouseY: 0.5 };
        return { success: true };
    }
    
    try {
        state.userState = state.userInit();
        if (!state.userState) {
            state.userState = {};
        }
        return { success: true };
    } catch (err) {
        console.error('User init() error:', err);
        state.userState = {};
        return { 
            success: false, 
            error: err,
            errorInfo: parseJSError(err, state.jsEditor ? state.jsEditor.getValue().split('\n').length : 1)
        };
    }
}

