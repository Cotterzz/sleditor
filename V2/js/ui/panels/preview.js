/**
 * Preview Panel - Shader canvas with glass mode support
 * 
 * Features:
 * - WebGL canvas with alpha transparency support
 * - Glass mode: transparent window, only UI elements visible
 * - Dockable controls bar at bottom
 * 
 * Layout (normal):
 * ┌────────────────────────────┐
 * │                            │
 * │         Canvas             │
 * │                            │
 * ├────────────────────────────┤
 * │ ▶ ⏸ ↻  │ 0:00 │ 60fps     │
 * └────────────────────────────┘
 * 
 * Layout (glass mode):
 * ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
 * ╎                            ╎
 * ╎     Canvas (transparent)   ╎
 * ╎                            ╎
 * ├────────────────────────────┤
 * │ ▶ ⏸ ↻  │ 0:00 │ 60fps     │ (controls visible)
 * └────────────────────────────┘
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { CONFIG } from '../../core/config.js';
import { createRenderer } from '../../render/webgl.js';
import { getControlsBar, isDockedState } from './shader-controls.js';
import * as fullscreen from '../../features/fullscreen.js';

let renderer = null;
let isGlassMode = false;
let previewContainer = null;
let canvasContainer = null;

/**
 * Get the current renderer instance
 */
export function getRenderer() {
    return renderer;
}

/**
 * Toggle glass mode
 */
export function setGlassMode(enabled) {
    isGlassMode = enabled;
    
    // Tell renderer to respect/ignore shader alpha
    if (renderer) {
        renderer.setGlassMode(enabled);
    }
    
    if (previewContainer) {
        // Find the parent SLUI window container
        const windowContainer = previewContainer.closest('.sl-window-container');
        const windowFrame = windowContainer?.querySelector('.sl-window-frame');
        const windowBody = windowContainer?.querySelector('.sl-window-body');
        
        if (enabled) {
            previewContainer.classList.add('glass-mode');
            previewContainer.style.background = 'transparent';
            if (canvasContainer) {
                canvasContainer.style.background = 'transparent';
            }
            
            // Make window frame/body transparent but keep controls visible
            if (windowContainer) {
                windowContainer.classList.add('glass-mode');
                windowContainer.style.background = 'transparent';
                windowContainer.style.boxShadow = 'none';
                windowContainer.style.border = 'none';
            }
            if (windowFrame) {
                windowFrame.style.background = 'transparent';
                windowFrame.style.boxShadow = 'none';
                windowFrame.style.border = 'none';
            }
            if (windowBody) {
                windowBody.style.background = 'transparent';
                windowBody.style.border = 'none';
                windowBody.style.boxShadow = 'none';
            }
        } else {
            previewContainer.classList.remove('glass-mode');
            previewContainer.style.background = '#000';
            if (canvasContainer) {
                canvasContainer.style.background = '#000';
            }
            
            // Restore window styling
            if (windowContainer) {
                windowContainer.classList.remove('glass-mode');
                windowContainer.style.background = '';
                windowContainer.style.boxShadow = '';
                windowContainer.style.border = '';
            }
            if (windowFrame) {
                windowFrame.style.background = '';
                windowFrame.style.boxShadow = '';
                windowFrame.style.border = '';
            }
            if (windowBody) {
                windowBody.style.background = '';
                windowBody.style.border = '';
                windowBody.style.boxShadow = '';
            }
        }
    }
    
    events.emit(EVENTS.PREVIEW_GLASS_MODE, { enabled });
    logger.debug('Preview', 'GlassMode', `Glass mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Get glass mode state
 */
export function isGlassModeEnabled() {
    return isGlassMode;
}

/**
 * Register the preview panel with SLUI
 */
export function registerPreviewPanel(SLUI) {
    SLUI.registerPanel({
        id: 'preview',
        icon: '<img src="/ui-system/icons/shader32.png" srcset="/ui-system/icons/shader64.png 2x" width="24" height="24" alt="Preview">',
        title: 'Preview',
        showInToolbar: true,
        createContent: () => createPreviewContent(SLUI)
    });
    
    // Listen for controls dock state changes - move controls bar back to preview
    events.on(EVENTS.SHADER_CONTROLS_DOCKED, ({ docked }) => {
        if (docked && previewContainer) {
            const controlsBar = getControlsBar();
            // Re-append to preview container
            previewContainer.appendChild(controlsBar);
        }
    });
    
    logger.debug('UI', 'Preview', 'Preview panel registered');
}

/**
 * Create preview panel content
 */
function createPreviewContent(SLUI) {
    const container = document.createElement('div');
    container.className = 'v2-preview';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #000;
        font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    `;
    previewContainer = container;
    
    // Canvas container (takes remaining space)
    const canvasContainerEl = document.createElement('div');
    canvasContainerEl.className = 'v2-preview-canvas-container';
    canvasContainerEl.style.cssText = `
        flex: 1;
        position: relative;
        overflow: hidden;
        min-height: 200px;
        background: #000;
    `;
    canvasContainer = canvasContainerEl;
    
    // Canvas - with alpha support for transparency
    const canvas = document.createElement('canvas');
    canvas.className = 'v2-preview-canvas';
    canvas.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    `;
    canvasContainerEl.appendChild(canvas);
    container.appendChild(canvasContainerEl);
    
    // Initialize fullscreen manager (canvasContainer is the fullscreen element)
    fullscreen.init(canvasContainerEl);
    
    // Controls bar (singleton - same element whether docked or floating)
    const controlsBar = getControlsBar();
    if (isDockedState()) {
        container.appendChild(controlsBar);
    }
    
    // Mouse handling
    canvas.addEventListener('mousemove', (e) => {
        if (renderer) {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            renderer.setMouse(x, y, e.buttons === 1, false);
        }
    });
    
    canvas.addEventListener('mousedown', (e) => {
        if (renderer) {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            renderer.setMouse(x, y, true, true);
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        if (renderer) {
            renderer.setMouse(renderer.getState().mouse?.x || 0, renderer.getState().mouse?.y || 0, false, false);
        }
    });
    
    // Initialize renderer when panel is added to DOM
    const observer = new MutationObserver(() => {
        if (container.isConnected && !renderer) {
            initRenderer();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also try immediately in case already connected
    setTimeout(() => {
        if (container.isConnected && !renderer) {
            initRenderer();
        }
    }, 100);
    
    async function initRenderer() {
        logger.info('Preview', 'Init', 'Initializing renderer with alpha support...');
        
        // Create renderer with alpha support
        renderer = createRenderer(canvas, { alpha: true });
        if (!renderer) {
            logger.error('Preview', 'Init', 'Failed to create renderer');
            return;
        }
        
        // Emit resolution updates
        const emitResolution = () => {
            events.emit(EVENTS.RENDER_RESOLUTION, { 
                width: canvas.width, 
                height: canvas.height 
            });
        };
        emitResolution();
        
        // Watch for resize
        const resizeObserver = new ResizeObserver(emitResolution);
        resizeObserver.observe(canvas);
        
        // Emit renderer ready event - ShaderManager will load shader
        events.emit(EVENTS.RENDERER_READY, { renderer });
        logger.debug('Preview', 'Init', 'Renderer ready, waiting for shader...');
        
        // Listen for successful compile to auto-play
        events.once(EVENTS.COMPILE_SUCCESS, () => {
            if (renderer) {
                renderer.play();
            }
        });
        
        // Initialize theme ID from current SLUI theme
        updateThemeId();
        
        // Listen for theme changes to update iTheme uniform
        if (window.SLUI?.on) {
            window.SLUI.on('theme-change', updateThemeId);
        }
    }
    
    /**
     * Update the renderer's theme ID from current SLUI theme
     */
    function updateThemeId(eventData) {
        if (!renderer) return;
        
        const themeName = eventData?.theme || window.SLUI?.getTheme?.();
        const themeData = window.SLUI?.getThemeData?.(themeName);
        const themeId = themeData?.id ?? 0;
        
        renderer.setThemeId(themeId);
    }
    
    return container;
}

export default { registerPreviewPanel, getRenderer, setGlassMode, isGlassModeEnabled };
