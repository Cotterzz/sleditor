// ============================================================================
// Audio Waveform Panel UI
// ============================================================================
// Collapsible panel for displaying audio waveform visualization.
// Only visible when GLSL audio shader is active.

import * as audioWaveform from '../audio-waveform.js';
import * as audioGlsl from '../backends/audio-glsl.js';
import { state, AUDIO_MODES } from '../core.js';

let panelElement = null;
let isExpanded = true;
let resizeObserver = null;

// ============================================================================
// Panel Creation
// ============================================================================

export function createPanel() {
    if (panelElement) return panelElement;
    
    panelElement = document.createElement('div');
    panelElement.id = 'audioWaveformPanel';
    panelElement.className = 'waveform-panel';
    panelElement.innerHTML = `
        <div class="waveform-panel-header">
            <span class="waveform-panel-title">🔊 Audio Waveform</span>
            <div class="waveform-panel-controls">
                <span id="waveformZoomInfo" class="waveform-zoom-info">Zoom: 1.00s</span>
                <button id="waveformResetBtn" class="waveform-btn" title="Reset view">⟲</button>
                <button id="waveformToggleBtn" class="waveform-btn" title="Collapse/Expand">▼</button>
            </div>
        </div>
        <div class="waveform-buffer-controls">
            <div class="buffer-slider-group">
                <label for="bufferAheadSlider" title="How far ahead to pre-schedule audio. Higher = more stable, Lower = more responsive">
                    Buffer: <span id="bufferAheadValue">500</span>ms
                </label>
                <input type="range" id="bufferAheadSlider" min="50" max="1000" value="500" step="10">
            </div>
            <div class="buffer-slider-group">
                <label for="batchSizeSlider" title="Audio samples per render batch. Higher = more efficient, Lower = more responsive to uniform changes">
                    Batch: <span id="batchSizeValue">100</span>ms
                </label>
                <input type="range" id="batchSizeSlider" min="20" max="200" value="100" step="5">
            </div>
        </div>
        <div class="waveform-panel-content">
            <canvas id="waveformCanvas"></canvas>
            <div class="waveform-legend">
                <div class="legend-item">
                    <div class="legend-color legend-left"></div>
                    <span>Left</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color legend-right"></div>
                    <span>Right</span>
                </div>
            </div>
            <div class="waveform-hint">Scroll to zoom • Drag to pan</div>
        </div>
    `;
    
    // Add event listeners
    const toggleBtn = panelElement.querySelector('#waveformToggleBtn');
    const resetBtn = panelElement.querySelector('#waveformResetBtn');
    const content = panelElement.querySelector('.waveform-panel-content');
    
    toggleBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        content.style.display = isExpanded ? 'block' : 'none';
        toggleBtn.textContent = isExpanded ? '▼' : '▲';
        
        if (isExpanded) {
            setTimeout(resizeCanvas, 10);
        }
    });
    
    resetBtn.addEventListener('click', () => {
        audioWaveform.resetView();
    });
    
    // Buffer configuration sliders
    const bufferAheadSlider = panelElement.querySelector('#bufferAheadSlider');
    const bufferAheadValue = panelElement.querySelector('#bufferAheadValue');
    const batchSizeSlider = panelElement.querySelector('#batchSizeSlider');
    const batchSizeValue = panelElement.querySelector('#batchSizeValue');
    
    // Initialize sliders with current values
    bufferAheadSlider.value = audioGlsl.getBufferAheadTime();
    bufferAheadValue.textContent = Math.round(audioGlsl.getBufferAheadTime());
    batchSizeSlider.value = audioGlsl.getBatchDuration();
    batchSizeValue.textContent = Math.round(audioGlsl.getBatchDuration());
    
    bufferAheadSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        bufferAheadValue.textContent = value;
        audioGlsl.setBufferAheadTime(value);
    });
    
    batchSizeSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        batchSizeValue.textContent = value;
        audioGlsl.setBatchDuration(value);
    });
    
    // Set up resize observer for canvas
    const canvas = panelElement.querySelector('#waveformCanvas');
    resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
    });
    resizeObserver.observe(panelElement);
    
    return panelElement;
}

// ============================================================================
// Panel Mounting
// ============================================================================

export function mountPanel(container) {
    if (!panelElement) {
        createPanel();
    }
    
    if (!panelElement.parentElement) {
        container.appendChild(panelElement);
    }
    
    // Initial canvas setup
    setTimeout(() => {
        if (!panelElement) return;
        resizeCanvas();
        const canvas = panelElement.querySelector('#waveformCanvas');
        if (canvas) {
            audioWaveform.setupCanvas(canvas);
        }
    }, 50);
}

export function unmountPanel() {
    if (panelElement && panelElement.parentElement) {
        panelElement.parentElement.removeChild(panelElement);
    }
}

// ============================================================================
// Canvas Sizing
// ============================================================================

function resizeCanvas() {
    if (!panelElement) return;
    
    const canvas = panelElement.querySelector('#waveformCanvas');
    const content = panelElement.querySelector('.waveform-panel-content');
    
    if (canvas && content && isExpanded) {
        const rect = content.getBoundingClientRect();
        const width = Math.floor(rect.width - 20); // Account for padding
        const height = 120; // Fixed height for waveform
        
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            audioWaveform.requestWaveformUpdate();
        }
    }
}

// ============================================================================
// Visibility Control
// ============================================================================

export function show() {
    if (panelElement) {
        panelElement.style.display = 'block';
        setTimeout(resizeCanvas, 10);
    }
}

export function hide() {
    if (panelElement) {
        panelElement.style.display = 'none';
    }
}

export function isVisible() {
    return panelElement && panelElement.style.display !== 'none';
}

// ============================================================================
// Integration with Audio System
// ============================================================================

export async function onAudioShaderLoaded(shaderCode) {
    // Initialize waveform with the shader code
    await audioWaveform.init(shaderCode);
    show();
}

export async function onAudioShaderUpdated(shaderCode) {
    // Update waveform shader
    await audioWaveform.updateShader(shaderCode);
}

export function onAudioStarted() {
    audioWaveform.startAnimation();
}

export function onAudioStopped() {
    audioWaveform.stopAnimation();
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanup() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
    audioWaveform.cleanup();
    
    if (panelElement && panelElement.parentElement) {
        panelElement.parentElement.removeChild(panelElement);
    }
    panelElement = null;
}

// ============================================================================
// Auto-visibility based on audio mode
// ============================================================================

export function updateVisibility() {
    const hasGLSLAudio = state.audioMode === AUDIO_MODES.GLSL || 
                         state.activeTabs?.some(t => t === 'audio_glsl');
    
    if (hasGLSLAudio) {
        show();
    } else {
        hide();
    }
}

