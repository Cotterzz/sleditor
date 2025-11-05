// ============================================================================
// Audio System Management
// ============================================================================
// This module handles Web Audio API initialization and audio-related settings.

import { state, CONFIG, DERIVED, updateDerived, saveSettings, logStatus } from './core.js';
import * as compiler from './compiler.js';

// ============================================================================
// Audio Initialization
// ============================================================================

export function initWebAudio() {
    state.audioContext = new AudioContext();
    state.gainNode = state.audioContext.createGain();
    state.gainNode.gain.value = CONFIG.volume;
    state.gainNode.connect(state.audioContext.destination);
    
    // Update DERIVED values
    updateDerived(state.audioContext);
    
    console.log(`Audio initialized: ${DERIVED.sampleRate}Hz, ${DERIVED.samplesPerBlock} samples/block`);
}

// ============================================================================
// JS Execution Mode Toggle
// ============================================================================

export function toggleJSExecMode() {
    const oldMode = state.jsExecutionMode;
    
    // Toggle between 'function' and 'module'
    state.jsExecutionMode = state.jsExecutionMode === 'function' ? 'module' : 'function';
    saveSettings({ jsExecutionMode: state.jsExecutionMode });
    
    console.log(`⚙️  JS Execution Mode toggled: ${oldMode} → ${state.jsExecutionMode}`);
    
    // Recompile JS with new execution mode
    if (state.isRunning) {
        compiler.reloadShader();
    }
    
    logStatus(`✓ JS execution mode: ${state.jsExecutionMode === 'module' ? 'Module Import (optimized)' : 'Function Eval (compatible)'}`, 'success');
}

