/**
 * Shader Controls Bar - Dockable playback controls
 * 
 * A lightweight bar (not a window) that can:
 * - Dock to the bottom of the Preview window (default)
 * - Float as a simple overlay bar
 * 
 * Uses reactive state pattern - UI always reflects current state.
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { getRenderer, setGlassMode, isGlassModeEnabled } from './preview.js';
import * as fullscreen from '../../features/fullscreen.js';
import { getSLUI } from '../index.js';

// Singleton controls bar element
let controlsBar = null;
let floatingContainer = null;
let isDocked = true;
let dockBtn = null; // Reference to dock button for enabling/disabling

// UI element references (for reactive updates)
let playBtn = null;
let glassBtn = null;
let colorspaceBtn = null;
let fullscreenBtn = null;
let timeDisplay = null;
let frameDisplay = null;
let resDisplay = null;
let fpsDisplay = null;
let channelSelect = null;

// Colorspace state
let isLinearColorspace = false;

/**
 * Create the controls bar (called once)
 * Two-row layout:
 * - Row 1: Playback buttons, Glass, Colorspace, Dock
 * - Row 2: Channel dropdown, Time, Frame, FPS, Resolution
 */
function createControlsBar() {
    const container = document.createElement('div');
    container.className = 'v2-shader-controls-bar';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        background: var(--bg-tertiary, #21262d);
        font-size: 12px;
        color: var(--text-primary, #c9d1d9);
        border-top: 1px solid var(--border, rgba(255,255,255,0.1));
        user-select: none;
    `;
    
    // ========== Row 1: Buttons ==========
    const buttonsRow = document.createElement('div');
    buttonsRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
    `;
    
    // Play/Pause button
    playBtn = createButton('▶', 'Play/Pause (Space)', () => {
        const renderer = getRenderer();
        if (!renderer) return;
        const state = renderer.getState();
        if (state.isPlaying) {
            renderer.pause();
        } else {
            renderer.play();
        }
    });
    buttonsRow.appendChild(playBtn);
    
    // Restart button
    const restartBtn = createButton('↻', 'Restart (R)', () => {
        const renderer = getRenderer();
        if (renderer) renderer.restart();
    });
    buttonsRow.appendChild(restartBtn);
    
    buttonsRow.appendChild(createSeparator());
    
    // Glass mode toggle
    glassBtn = createButton('◐', 'Glass mode - transparent background', () => {
        setGlassMode(!isGlassModeEnabled());
    });
    buttonsRow.appendChild(glassBtn);
    
    // Colorspace toggle (sRGB / Linear)
    colorspaceBtn = createIconButton(
        createSrgbIcon(),
        'Color space: sRGB (click for Linear)',
        () => {
            isLinearColorspace = !isLinearColorspace;
            updateColorspaceButton();
            // Update renderer
            const renderer = getRenderer();
            if (renderer && typeof renderer.setColorspace === 'function') {
                renderer.setColorspace(isLinearColorspace);
            }
            events.emit(EVENTS.RENDER_COLORSPACE_CHANGED, { linear: isLinearColorspace });
        }
    );
    buttonsRow.appendChild(colorspaceBtn);
    
    // Spacer
    const buttonsSpacer = document.createElement('div');
    buttonsSpacer.style.flex = '1';
    buttonsRow.appendChild(buttonsSpacer);
    
    // Fullscreen toggle
    fullscreenBtn = createButton('⛶', 'Fullscreen (F)', () => {
        fullscreen.toggle();
    });
    buttonsRow.appendChild(fullscreenBtn);
    
    // Dock/Undock toggle
    dockBtn = createButton('↗', 'Float controls', () => {
        if (isDocked) {
            undockControls();
            dockBtn.textContent = '↙';
            dockBtn.title = 'Dock controls';
        } else {
            dockControls();
            dockBtn.textContent = '↗';
            dockBtn.title = 'Float controls';
        }
    });
    buttonsRow.appendChild(dockBtn);
    
    container.appendChild(buttonsRow);
    
    // ========== Row 2: Info ==========
    const infoRow = document.createElement('div');
    infoRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px;
    `;
    
    // Channel viewer dropdown (monospace variant for channel numbers)
    const SLUI = getSLUI();
    if (SLUI && SLUI.Select) {
        channelSelect = SLUI.Select({
            items: [{ value: '0', label: 'Main' }], // Will be populated by refreshChannelDropdown
            value: '0',
            variant: 'monospace',
            onChange: (value) => {
                const renderer = getRenderer();
                if (renderer) {
                    renderer.setDisplayChannel(parseInt(value, 10));
                }
            }
        });
    } else {
        // Fallback if SLUI not available (shouldn't happen)
        channelSelect = document.createElement('select');
        channelSelect.className = 'sl-select sl-select-monospace';
        channelSelect.innerHTML = '<option value="0">Main</option>';
        channelSelect.addEventListener('change', (e) => {
            const renderer = getRenderer();
            if (renderer) {
                renderer.setDisplayChannel(parseInt(e.target.value, 10));
            }
        });
    }
    channelSelect.title = 'Display channel';
    infoRow.appendChild(channelSelect);
    
    infoRow.appendChild(createSeparator());
    
    // Time display
    timeDisplay = document.createElement('span');
    timeDisplay.textContent = '0:00.00';
    timeDisplay.style.cssText = `
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        min-width: 55px;
        color: var(--text-muted, #8b949e);
    `;
    infoRow.appendChild(timeDisplay);
    
    // Frame display
    frameDisplay = document.createElement('span');
    frameDisplay.textContent = 'F:0';
    frameDisplay.style.cssText = `
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        min-width: 50px;
        color: var(--text-muted, #8b949e);
    `;
    infoRow.appendChild(frameDisplay);
    
    // Spacer
    const infoSpacer = document.createElement('div');
    infoSpacer.style.flex = '1';
    infoRow.appendChild(infoSpacer);
    
    // Resolution display
    resDisplay = document.createElement('span');
    resDisplay.textContent = '0×0';
    resDisplay.style.cssText = `
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 10px;
        color: var(--text-muted, #6e7681);
    `;
    infoRow.appendChild(resDisplay);
    
    infoRow.appendChild(createSeparator());
    
    // FPS display
    fpsDisplay = document.createElement('span');
    fpsDisplay.textContent = '0 fps';
    fpsDisplay.style.cssText = `
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        min-width: 50px;
        text-align: right;
        color: var(--console-success, #3fb950);
    `;
    infoRow.appendChild(fpsDisplay);
    
    container.appendChild(infoRow);
    
    return container;
}

/**
 * Create SVG icon for sRGB colorspace (triangle with pronounced curved hypotenuse)
 */
function createSrgbIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.style.cssText = 'display: block;';
    
    // Filled triangle with pronounced gamma curve (bulges outward)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // Start bottom-left, go up to top-left, then curve down to bottom-right
    path.setAttribute('d', 'M2 12 L2 2 Q10 2 12 12 Z');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('opacity', '0.85');
    svg.appendChild(path);
    
    return svg;
}

/**
 * Create SVG icon for Linear colorspace (straight filled triangle)
 */
function createLinearIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.style.cssText = 'display: block;';
    
    // Filled straight triangle
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M2 12 L2 2 L12 12 Z');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('opacity', '0.85');
    svg.appendChild(path);
    
    return svg;
}

/**
 * Update colorspace button icon and tooltip
 */
function updateColorspaceButton() {
    if (!colorspaceBtn) return;
    
    // Clear current icon
    colorspaceBtn.innerHTML = '';
    
    if (isLinearColorspace) {
        colorspaceBtn.appendChild(createLinearIcon());
        colorspaceBtn.title = 'Color space: Linear (click for sRGB)';
    } else {
        colorspaceBtn.appendChild(createSrgbIcon());
        colorspaceBtn.title = 'Color space: sRGB (click for Linear)';
    }
}

/**
 * Create a button with an SVG icon instead of text
 */
function createIconButton(iconElement, title, onClick) {
    const btn = document.createElement('button');
    btn.title = title;
    btn.style.cssText = `
        width: 28px;
        height: 24px;
        border: 1px solid var(--border, rgba(255,255,255,0.2));
        border-radius: 4px;
        background: var(--bg-secondary, #30363d);
        color: var(--text-primary, #c9d1d9);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
    `;
    btn.appendChild(iconElement);
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--bg-tertiary, #484f58)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'var(--bg-secondary, #30363d)');
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * Setup reactive event listeners
 */
function setupReactiveBindings() {
    // Update play button based on render state
    events.on(EVENTS.RENDER_FRAME, (data) => {
        if (timeDisplay) timeDisplay.textContent = formatTime(data.time);
        if (frameDisplay) frameDisplay.textContent = `F:${data.frame}`;
        if (fpsDisplay) {
            fpsDisplay.textContent = `${data.fps} fps`;
            // Color based on performance
            if (data.fps >= 55) {
                fpsDisplay.style.color = 'var(--console-success, #3fb950)';
            } else if (data.fps >= 30) {
                fpsDisplay.style.color = 'var(--console-warn, #d29922)';
            } else {
                fpsDisplay.style.color = 'var(--console-error, #f85149)';
            }
        }
        
        // Update play button icon
        if (playBtn) {
            playBtn.textContent = '⏸';
            playBtn.title = 'Pause';
        }
    });
    
    // Update play button when render stops
    events.on(EVENTS.RENDER_STOP, () => {
        if (playBtn) {
            playBtn.textContent = '▶';
            playBtn.title = 'Play';
        }
    });
    
    // Update resolution display
    events.on(EVENTS.RENDER_RESOLUTION, (data) => {
        if (resDisplay) resDisplay.textContent = `${data.width}×${data.height}`;
    });
    
    // Update glass button based on glass mode state
    events.on(EVENTS.PREVIEW_GLASS_MODE, ({ enabled }) => {
        if (glassBtn) {
            glassBtn.textContent = enabled ? '◑' : '◐';
        }
    });
    
    // Refresh channel dropdown when compilation succeeds
    events.on(EVENTS.COMPILE_SUCCESS, refreshChannelDropdown);
    
    // Update channel dropdown selection when channel changes
    events.on(EVENTS.RENDER_CHANNEL_CHANGED, ({ channel }) => {
        if (channelSelect) channelSelect.value = channel;
    });
    
    // Fullscreen enter - save state, undock if needed
    events.on(EVENTS.FULLSCREEN_ENTER, () => {
        // Save docked state
        fullscreen.saveControlsState(isDocked);
        
        // Auto-undock if docked (controls need to float in fullscreen)
        if (isDocked) {
            undockControls();
        }
        
        // Update fullscreen button
        if (fullscreenBtn) {
            fullscreenBtn.title = 'Exit fullscreen (F or Esc)';
        }
        
        // Hide dock button via class (CSS will handle it)
        if (dockBtn) {
            dockBtn.classList.add('fullscreen-hidden');
        }
    });
    
    // Fullscreen exit - restore state
    events.on(EVENTS.FULLSCREEN_EXIT, () => {
        // Restore docked state
        const shouldBeDocked = fullscreen.getControlsState();
        if (shouldBeDocked && !isDocked) {
            dockControls();
        }
        
        // Update fullscreen button
        if (fullscreenBtn) {
            fullscreenBtn.title = 'Fullscreen (F)';
        }
        
        // Show dock button again
        if (dockBtn) {
            dockBtn.classList.remove('fullscreen-hidden');
        }
    });
    
    logger.debug('ShaderControls', 'Init', 'Reactive bindings set up');
}

/**
 * Refresh the channel dropdown with available channels
 */
function refreshChannelDropdown() {
    if (!channelSelect) return;
    
    const renderer = getRenderer();
    if (!renderer) return;
    
    const channels = renderer.getAvailableDisplayChannels();
    const currentValue = parseInt(channelSelect.value, 10);
    
    // Rebuild options
    channelSelect.innerHTML = '';
    channels.forEach(ch => {
        const option = document.createElement('option');
        option.value = ch.number;
        option.textContent = ch.label;
        channelSelect.appendChild(option);
    });
    
    // Restore selection if still valid, otherwise default to 0
    const hasCurrentValue = channels.some(ch => ch.number === currentValue);
    channelSelect.value = hasCurrentValue ? currentValue : 0;
    
    logger.debug('ShaderControls', 'Channels', `Updated dropdown: ${channels.map(c => c.label).join(', ')}`);
}

/**
 * Get or create the controls bar
 */
export function getControlsBar() {
    if (!controlsBar) {
        controlsBar = createControlsBar();
        setupReactiveBindings();
    }
    return controlsBar;
}

/**
 * Dock controls to preview window
 */
export function dockControls() {
    if (!controlsBar) return;
    
    isDocked = true;
    
    // Remove floating container if exists
    if (floatingContainer && floatingContainer.parentNode) {
        floatingContainer.parentNode.removeChild(floatingContainer);
    }
    
    // The preview panel will append this
    controlsBar.style.borderTop = '1px solid var(--border, rgba(255,255,255,0.1))';
    controlsBar.style.borderRadius = '0';
    
    events.emit(EVENTS.SHADER_CONTROLS_DOCKED, { docked: true });
    logger.debug('ShaderControls', 'Dock', 'Controls docked');
}

/**
 * Undock controls to floating bar
 */
export function undockControls() {
    if (!controlsBar) return;
    
    isDocked = false;
    
    // Create floating container if needed
    if (!floatingContainer) {
        floatingContainer = document.createElement('div');
        floatingContainer.className = 'v2-shader-controls-floating';
        floatingContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            overflow: hidden;
        `;
        
        // Make draggable
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        floatingContainer.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            const rect = floatingContainer.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            floatingContainer.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            floatingContainer.style.left = `${e.clientX - dragOffset.x}px`;
            floatingContainer.style.top = `${e.clientY - dragOffset.y}px`;
            floatingContainer.style.bottom = 'auto';
            floatingContainer.style.transform = 'none';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            if (floatingContainer) floatingContainer.style.cursor = 'grab';
        });
    }
    
    // Style for floating
    controlsBar.style.borderTop = 'none';
    controlsBar.style.borderRadius = '8px';
    
    // Move bar to floating container
    floatingContainer.appendChild(controlsBar);
    document.body.appendChild(floatingContainer);
    floatingContainer.style.cursor = 'grab';
    
    events.emit(EVENTS.SHADER_CONTROLS_DOCKED, { docked: false });
    logger.debug('ShaderControls', 'Undock', 'Controls floating');
}

/**
 * Check if controls are docked
 */
export function isDockedState() {
    return isDocked;
}

// Helper functions
function createButton(text, title, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = `
        width: 28px;
        height: 24px;
        border: 1px solid var(--border, rgba(255,255,255,0.2));
        border-radius: 4px;
        background: var(--bg-secondary, #30363d);
        color: var(--text-primary, #c9d1d9);
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--bg-tertiary, #484f58)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'var(--bg-secondary, #30363d)');
    btn.addEventListener('click', onClick);
    return btn;
}

function createSeparator() {
    const sep = document.createElement('div');
    sep.style.cssText = `
        width: 1px;
        height: 16px;
        background: var(--border, rgba(255,255,255,0.15));
        margin: 0 4px;
    `;
    return sep;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

// No SLUI panel registration needed - this is a simple bar, not a window

export default { getControlsBar, dockControls, undockControls, isDockedState };
