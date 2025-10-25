// ============================================================================
// JS Runtime - User JavaScript Compilation and Execution
// ============================================================================

import { state } from './core.js';

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

export function compile(code = null, useDefault = false) {
    // If JS tab is not active, use invisible default
    const actualCode = useDefault ? INVISIBLE_DEFAULT_JS : (code || '');
    const codeLines = actualCode.split('\n').length;
    
    try {
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

// ============================================================================
// Runtime Execution
// ============================================================================

export function callEnterframe(elapsedSec, uniformF32 = null, uniformI32 = null, audioContext = null) {
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

