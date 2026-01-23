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
let timelineSlider = null;
let backendLogo = null;
let snapshotBtn = null;
let recordBtn = null;
let recordSettingsBtn = null;

// Backend logo state (cycles through: webgl, webgpu, webgpu-notext)
let currentBackend = 'webgl'; // 'webgl' | 'webgpu' | 'webgpu-notext'

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
    
    // Get SLUI for button creation
    const SLUI = getSLUI();
    
    // Play/Pause button
    playBtn = SLUI.CtrlButton({
        icon: '▶',
        tooltip: 'Play/Pause (Space)',
        onClick: () => {
            const renderer = getRenderer();
            if (!renderer) return;
            const state = renderer.getState();
            if (state.isPlaying) {
                renderer.pause();
            } else {
                renderer.play();
            }
        }
    });
    buttonsRow.appendChild(playBtn);
    
    // Restart button
    const restartBtn = SLUI.CtrlButton({
        icon: '↻',
        tooltip: 'Restart (R)',
        onClick: () => {
            const renderer = getRenderer();
            if (renderer) renderer.restart();
            // Reset timeline to initial duration
            if (timelineSlider && timelineSlider.reset) {
                timelineSlider.reset();
            }
        }
    });
    buttonsRow.appendChild(restartBtn);
    
    buttonsRow.appendChild(createSeparator());
    
    // Glass mode toggle
    glassBtn = SLUI.CtrlButton({
        icon: '◐',
        tooltip: 'Glass mode - transparent background',
        onClick: () => setGlassMode(!isGlassModeEnabled())
    });
    buttonsRow.appendChild(glassBtn);
    
    // Colorspace toggle (sRGB / Linear)
    colorspaceBtn = SLUI.CtrlButton({
        icon: createSrgbIcon(),
        tooltip: 'Color space: sRGB (click for Linear)',
        onClick: () => {
            isLinearColorspace = !isLinearColorspace;
            updateColorspaceButton();
            // Update renderer
            const renderer = getRenderer();
            if (renderer && typeof renderer.setColorspace === 'function') {
                renderer.setColorspace(isLinearColorspace);
            }
            events.emit(EVENTS.RENDER_COLORSPACE_CHANGED, { linear: isLinearColorspace });
        }
    });
    buttonsRow.appendChild(colorspaceBtn);
    
    buttonsRow.appendChild(createSeparator());
    
    // Snapshot button (placeholder)
    snapshotBtn = SLUI.CtrlButton({
        icon: '📷',
        tooltip: 'Take snapshot',
        onClick: () => {
            console.log('[Shader Controls] Snapshot - placeholder');
            // TODO: Implement snapshot functionality
        }
    });
    buttonsRow.appendChild(snapshotBtn);
    
    // Record button (placeholder)
    recordBtn = SLUI.CtrlButton({
        icon: '⏺',
        tooltip: 'Record',
        onClick: () => {
            console.log('[Shader Controls] Record - placeholder');
            // TODO: Implement record functionality
        }
    });
    buttonsRow.appendChild(recordBtn);
    
    // Record settings button (placeholder)
    recordSettingsBtn = SLUI.CtrlButton({
        icon: '⚙',
        tooltip: 'Recording settings',
        onClick: () => {
            console.log('[Shader Controls] Record settings - placeholder');
            // TODO: Implement record settings dialog
        }
    });
    buttonsRow.appendChild(recordSettingsBtn);
    
    // Spacer
    const buttonsSpacer = document.createElement('div');
    buttonsSpacer.style.flex = '1';
    buttonsRow.appendChild(buttonsSpacer);
    
    // Fullscreen toggle
    fullscreenBtn = SLUI.CtrlButton({
        icon: '⛶',
        tooltip: 'Fullscreen (F)',
        onClick: () => fullscreen.toggle()
    });
    buttonsRow.appendChild(fullscreenBtn);
    
    // Dock/Undock toggle
    dockBtn = SLUI.CtrlButton({
        icon: '↗',
        tooltip: 'Float controls',
        onClick: () => {
            if (isDocked) {
                undockControls();
                dockBtn.setIcon('↙');
                dockBtn.setTooltip('Dock controls');
            } else {
                dockControls();
                dockBtn.setIcon('↗');
                dockBtn.setTooltip('Float controls');
            }
        }
    });
    buttonsRow.appendChild(dockBtn);
    
    container.appendChild(buttonsRow);
    
    // ========== Row 2: Info + Timeline (combined) ==========
    // Layout: T:1:54  F:5436  740x413  @60fps
    //         0:00 --------o-------- 4:00
    const infoTimelineRow = document.createElement('div');
    infoTimelineRow.className = 'v2-shader-controls-info-timeline';
    infoTimelineRow.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 10px 6px;
    `;
    
    // Top line: stats
    const statsRow = document.createElement('div');
    statsRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 10px;
        color: var(--text-muted, #8b949e);
    `;
    
    // Time display (T:0:00.00)
    timeDisplay = document.createElement('span');
    timeDisplay.textContent = 'T:0:00';
    statsRow.appendChild(timeDisplay);
    
    // Frame display (F:0)
    frameDisplay = document.createElement('span');
    frameDisplay.textContent = 'F:0';
    statsRow.appendChild(frameDisplay);
    
    // Resolution display
    resDisplay = document.createElement('span');
    resDisplay.textContent = '0×0';
    statsRow.appendChild(resDisplay);
    
    // FPS display
    fpsDisplay = document.createElement('span');
    fpsDisplay.style.color = 'var(--console-success, #3fb950)';
    fpsDisplay.textContent = '@0fps';
    statsRow.appendChild(fpsDisplay);
    
    // Spacer
    const statsSpacer = document.createElement('div');
    statsSpacer.style.flex = '1';
    statsRow.appendChild(statsSpacer);
    
    // Backend logo (WebGL/WebGPU) - clickable to cycle
    backendLogo = document.createElement('img');
    backendLogo.src = 'ui-system/icons/WebGL_Logo.svg';
    backendLogo.alt = 'WebGL';
    backendLogo.title = 'Backend: WebGL (click to cycle)';
    backendLogo.style.cssText = `
        height: 12px;
        width: auto;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.15s;
    `;
    backendLogo.addEventListener('mouseenter', () => { backendLogo.style.opacity = '1'; });
    backendLogo.addEventListener('mouseleave', () => { backendLogo.style.opacity = '0.7'; });
    backendLogo.addEventListener('click', () => {
        // Cycle through: webgl -> webgpu -> webgpu-notext -> webgl
        if (currentBackend === 'webgl') {
            currentBackend = 'webgpu';
            backendLogo.src = 'ui-system/icons/webgpu-horizontal.svg';
            backendLogo.alt = 'WebGPU';
            backendLogo.title = 'Backend: WebGPU (click to cycle)';
        } else if (currentBackend === 'webgpu') {
            currentBackend = 'webgpu-notext';
            backendLogo.src = 'ui-system/icons/webgpu-notext.svg';
            backendLogo.alt = 'WebGPU';
            backendLogo.title = 'Backend: WebGPU Compact (click to cycle)';
        } else {
            currentBackend = 'webgl';
            backendLogo.src = 'ui-system/icons/WebGL_Logo.svg';
            backendLogo.alt = 'WebGL';
            backendLogo.title = 'Backend: WebGL (click to cycle)';
        }
    });
    statsRow.appendChild(backendLogo);
    
    infoTimelineRow.appendChild(statsRow);
    
    // Bottom line: timeline slider
    timelineSlider = SLUI.TimelineSlider({
        duration: 60,
        value: 0,
        autoExtend: true,
        compact: true,
        onChange: (time) => {
            // User is seeking - update renderer
            const renderer = getRenderer();
            if (renderer && typeof renderer.seek === 'function') {
                renderer.seek(time);
            }
        }
    });
    infoTimelineRow.appendChild(timelineSlider);
    
    container.appendChild(infoTimelineRow);
    
    // ========== Row 3: Channel dropdown, Volume, Pixel Size ==========
    const settingsRow = document.createElement('div');
    settingsRow.className = 'v2-shader-controls-settings';
    settingsRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 10px 6px;
        border-top: 1px solid var(--border, rgba(255,255,255,0.05));
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 10px;
        color: var(--text-muted, #8b949e);
    `;
    
    // Channel dropdown
    const channelGroup = document.createElement('div');
    channelGroup.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    
    const channelLabel = document.createElement('span');
    channelLabel.textContent = 'Ch:';
    channelGroup.appendChild(channelLabel);
    
    if (SLUI && SLUI.Select) {
        channelSelect = SLUI.Select({
            items: [{ value: '0', label: 'Main' }],
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
    channelGroup.appendChild(channelSelect);
    settingsRow.appendChild(channelGroup);
    
    // Volume slider (placeholder) - using SLUI.IconSlider
    const volumeSlider = SLUI.IconSlider({
        icon: '🔊',
        min: 0,
        max: 100,
        value: 100,
        step: 1,
        isInt: true,
        compact: true,
        onChange: (val) => {
            console.log('[Shader Controls] Volume:', val);
            // TODO: Implement volume control
        }
    });
    volumeSlider.title = 'Volume (placeholder)';
    volumeSlider.style.flex = '1';
    settingsRow.appendChild(volumeSlider);
    
    // Pixel size slider (placeholder) - using SLUI.IconSlider
    const pixelSlider = SLUI.IconSlider({
        icon: '⊞',
        min: 1,
        max: 8,
        value: 1,
        step: 1,
        isInt: true,
        compact: true,
        onChange: (val) => {
            console.log('[Shader Controls] Pixel size:', val + 'x');
            // TODO: Implement pixel size / resolution divider
        }
    });
    pixelSlider.title = 'Pixel size / resolution divider (placeholder)';
    pixelSlider.style.flex = '1';
    settingsRow.appendChild(pixelSlider);
    
    container.appendChild(settingsRow);
    
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
    
    if (isLinearColorspace) {
        colorspaceBtn.setIcon(createLinearIcon());
        colorspaceBtn.setTooltip('Color space: Linear (click for sRGB)');
    } else {
        colorspaceBtn.setIcon(createSrgbIcon());
        colorspaceBtn.setTooltip('Color space: sRGB (click for Linear)');
    }
}


/**
 * Setup reactive event listeners
 */
function setupReactiveBindings() {
    // Update all displays every frame
    events.on(EVENTS.RENDER_FRAME, (data) => {
        // Time display (T:0:00)
        if (timeDisplay) {
            const mins = Math.floor(data.time / 60);
            const secs = Math.floor(data.time % 60);
            timeDisplay.textContent = `T:${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        // Frame display (F:0)
        if (frameDisplay) frameDisplay.textContent = `F:${data.frame}`;
        
        // FPS display (@60fps)
        if (fpsDisplay) {
            fpsDisplay.textContent = `@${data.fps}fps`;
            // Color based on performance
            if (data.fps >= 55) {
                fpsDisplay.style.color = 'var(--console-success, #3fb950)';
            } else if (data.fps >= 30) {
                fpsDisplay.style.color = 'var(--console-warn, #d29922)';
            } else {
                fpsDisplay.style.color = 'var(--console-error, #f85149)';
            }
        }
        
        // Update timeline slider (auto-extends when reaching end)
        if (timelineSlider && timelineSlider.setTime) {
            timelineSlider.setTime(data.time);
        }
        
        // Update play button icon
        if (playBtn) {
            playBtn.setIcon('⏸');
            playBtn.setTooltip('Pause');
        }
    });
    
    // Update play button when render stops
    events.on(EVENTS.RENDER_STOP, () => {
        if (playBtn) {
            playBtn.setIcon('▶');
            playBtn.setTooltip('Play');
        }
    });
    
    // Update resolution display
    events.on(EVENTS.RENDER_RESOLUTION, (data) => {
        if (resDisplay) resDisplay.textContent = `${data.width}×${data.height}`;
    });
    
    // Update glass button based on glass mode state
    events.on(EVENTS.PREVIEW_GLASS_MODE, ({ enabled }) => {
        if (glassBtn) {
            glassBtn.setIcon(enabled ? '◑' : '◐');
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
