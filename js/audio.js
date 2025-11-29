// ============================================================================
// Audio System Management
// ============================================================================
// This module handles Web Audio API initialization and audio-related settings.

import { state, CONFIG, DERIVED, updateDerived, saveSettings, logStatus } from './core.js';
import * as compiler from './compiler.js';

// ============================================================================
// Audio Initialization
// ============================================================================

let unlockHandlerRegistered = false;

export function initWebAudio() {
    state.audioContext = new AudioContext();
    state.gainNode = state.audioContext.createGain();
    state.gainNode.gain.value = CONFIG.volume;
    state.gainNode.connect(state.audioContext.destination);
    
    // Update DERIVED values
    updateDerived(state.audioContext);
    
    console.log(`Audio initialized: ${DERIVED.sampleRate}Hz, ${DERIVED.samplesPerBlock} samples/block`);
    
    setupAutoplayUnlock();
}

export function setupAutoplayUnlock() {
    if (!state.audioContext || unlockHandlerRegistered) return;
    
    const unlock = async () => {
        if (!state.audioContext) return;
        try {
            await state.audioContext.resume();
            console.log('🔓 AudioContext unlocked');
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            unlockHandlerRegistered = false;
        } catch (err) {
            console.warn('AudioContext resume failed:', err);
        }
    };
    
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    unlockHandlerRegistered = true;
}

// ============================================================================
// JS Execution Mode Toggle
// ============================================================================

export function toggleJSExecMode() {
    const oldMode = state.jsExecutionMode;
    
    // Cycle through modes: function → module → sandboxed → function
    if (state.jsExecutionMode === 'function') {
        state.jsExecutionMode = 'module';
    } else if (state.jsExecutionMode === 'module') {
        state.jsExecutionMode = 'sandboxed';
    } else {
        state.jsExecutionMode = 'function';
    }
    
    saveSettings({ jsExecutionMode: state.jsExecutionMode });
    
    console.log(`⚙️  JS Execution Mode toggled: ${oldMode} → ${state.jsExecutionMode}`);
    
    // Recompile JS with new execution mode
    if (state.isRunning) {
        compiler.reloadShader();
    }
    
    const modeLabels = {
        'function': 'Function Eval (compatible)',
        'module': 'Module Import (optimized)',
        'sandboxed': 'Sandboxed AudioWorklet (secure)'
    };
    
    logStatus(`✓ JS execution mode: ${modeLabels[state.jsExecutionMode]}`, 'success');
}

