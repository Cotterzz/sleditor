// ============================================================================
// AudioWorklet Backend - JavaScript-based Audio Synthesis
// ============================================================================

import { state, AUDIO_MODES } from '../core.js';

// ============================================================================
// Initialization
// ============================================================================

export async function init(audioContext, gainNode) {
    if (!audioContext) {
        return { success: false, error: 'AudioContext not available' };
    }
    
    state.audioContext = audioContext;
    state.gainNode = gainNode;
    
    return { success: true };
}

// ============================================================================
// Load AudioWorklet Code
// ============================================================================

export async function load(audioCode) {
    if (!state.audioContext) {
        return { 
            success: false, 
            errors: [{ lineNum: 1, message: 'AudioContext not initialized' }] 
        };
    }
    
    const codeLines = audioCode.split('\n').length;
    
    try {
        // Disconnect and remove old worklet if exists
        if (state.audioWorkletNode) {
            state.audioWorkletNode.disconnect();
            state.audioWorkletNode = null;
        }
        
        // Generate unique processor name for each reload to avoid registration conflicts
        const processorName = 'user-audio-' + Date.now();
        
        // Wrap user code in AudioWorkletProcessor boilerplate
        // User code should define: const audioProcessor = { init() {...}, userProcess() {...}, receiveMessage() {...} }
        const wrappedCode = `
// User code defines audioProcessor object
${audioCode}

class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = sampleRate;
        this.audioProcessor = audioProcessor;
        
        // Bind methods to this instance so 'this' works correctly in user code
        if (this.audioProcessor.init) {
            this.audioProcessor.init = this.audioProcessor.init.bind(this);
            this.audioProcessor.init();
        }
        if (this.audioProcessor.userProcess) {
            this.audioProcessor.userProcess = this.audioProcessor.userProcess.bind(this);
        }
        if (this.audioProcessor.receiveMessage) {
            this.audioProcessor.receiveMessage = this.audioProcessor.receiveMessage.bind(this);
        }
        
        this.port.onmessage = (e) => {
            if (this.audioProcessor.receiveMessage) {
                this.audioProcessor.receiveMessage(e.data);
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (this.audioProcessor.userProcess) {
            const output = outputs[0];
            this.audioProcessor.userProcess(output, inputs, parameters);
        }
        return true;
    }

    sendMessage(data) {
        this.port.postMessage(data);
    }
}
registerProcessor('${processorName}', AudioProcessor);
`;
        
        // Create blob URL with the wrapped audio code
        const blob = new Blob([wrappedCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        
        // Load the module
        await state.audioContext.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        
        // Create the worklet node with our unique processor name
        state.audioWorkletNode = new AudioWorkletNode(state.audioContext, processorName);
        state.audioWorkletNode.connect(state.gainNode);
        
        // Listen for errors from the worklet
        state.audioWorkletNode.port.onmessageerror = (event) => {
            console.error('AudioWorklet message error:', event);
        };
        
        state.audioMode = AUDIO_MODES.WORKLET;
        return { success: true, node: state.audioWorkletNode };
    } catch (err) {
        console.error('AudioWorklet loading error:', err);
        
        // Try to parse line numbers from the error
        let lineNum = null;
        let column = 1;
        let endColumn = 1000;
        
        // Try to parse from stack trace
        // AudioWorklet errors from addModule often have format like ":30:10"
        const stackMatch = err.stack?.match(/:(\d+):(\d+)/);
        if (stackMatch) {
            lineNum = parseInt(stackMatch[1]);
            column = parseInt(stackMatch[2]);
            endColumn = column + 10;
        }
        
        const errors = [];
        if (lineNum && lineNum > 0 && lineNum <= codeLines) {
            // We got a valid line number
            errors.push({
                lineNum,
                column,
                endColumn,
                message: err.message
            });
        } else {
            // No line number available (AudioWorklet limitation)
            // Monaco's built-in JavaScript linter should still show errors in the editor
            console.warn('Could not parse line number from AudioWorklet error (browser limitation)');
            errors.push({
                lineNum: 1,
                column: 1,
                endColumn: 1000,
                message: err.message + ' (check editor for red underlines)'
            });
        }
        
        state.audioMode = AUDIO_MODES.NONE;
        return { success: false, errors };
    }
}

// ============================================================================
// Communication
// ============================================================================

export function send(data) {
    if (state.audioWorkletNode && state.audioWorkletNode.port) {
        state.audioWorkletNode.port.postMessage(data);
    }
}

export function setParam(name, value) {
    if (state.audioWorkletNode && state.audioWorkletNode.parameters && 
        state.audioWorkletNode.parameters.has(name)) {
        state.audioWorkletNode.parameters.get(name).value = value;
    }
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanup() {
    // Stop AudioWorklet
    if (state.audioWorkletNode) {
        state.audioWorkletNode.disconnect();
        state.audioWorkletNode = null;
    }
    
    state.audioMode = AUDIO_MODES.NONE;
}

