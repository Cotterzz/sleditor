/**
 * V2 UI Module - Sleditor-specific UI
 * 
 * This module:
 * - Initializes SLUI
 * - Registers sleditor-specific panels
 * - Sets up reactive bindings (UI auto-updates from events)
 * 
 * This is NOT the generic UI library (that's ui-system/).
 * This is sleditor's use of that library.
 */

import { logger } from '../core/logger.js';
import { events, EVENTS } from '../core/events.js';
import { state } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { registerConsolePanel } from './panels/console.js';
import { registerSettingsPanel } from './panels/settings.js';
import { registerPreviewPanel } from './panels/preview.js';
import { registerEditorPanel } from './panels/editor.js';
import { registerUniformsPanel } from './panels/uniforms.js';
import { registerTutorialsPanel } from './panels/tutorials.js';
import { registerShaderInfoPanel } from './panels/shader-info.js';
import * as mediaPanel from './panels/media.js';
import * as inputsPanel from './panels/inputs.js';
// Note: shader-controls is not a SLUI panel - it's a lightweight bar managed by preview.js

let SLUI = null;

/**
 * Initialize the UI system
 */
export async function initUI() {
    logger.info('UI', 'Init', 'Loading SLUI...');
    
    // Dynamic import of SLUI
    const module = await import(CONFIG.SLUI_PATH);
    SLUI = module.default;
    window.SLUI = SLUI;
    
    logger.debug('UI', 'SLUI', 'SLUI module loaded');
    
    // Initialize SLUI (don't restore layout yet - panels aren't registered!)
    await SLUI.init({
        themesUrl: CONFIG.SLUI_THEMES,
        langUrl: CONFIG.SLUI_LANG,
        restoreLayout: false  // Will restore AFTER panels are registered
    });
    
    logger.info('UI', 'SLUI', `Theme: ${SLUI.getTheme()}, Mode: ${SLUI.state.deviceMode}`);
    
    // Mark UI as initialized
    state.ui.isInitialized = true;
    
    return SLUI;
}

/**
 * Register all sleditor-specific panels
 */
export function registerPanels() {
    logger.info('UI', 'Panels', 'Registering panels...');
    
    // Console panel (uses logger)
    registerConsolePanel(SLUI, logger);
    
    // Settings panel
    registerSettingsPanel(SLUI);
    
    // Preview panel (shader canvas with glass mode)
    registerPreviewPanel(SLUI);
    // Note: Shader controls bar is created by preview.js, not a separate SLUI panel
    
    // Editor panel (tabbed code editor)
    registerEditorPanel(SLUI);
    
    // Uniforms panel (auto-generated uniform controls)
    registerUniformsPanel(SLUI);
    
    // Tutorials panel (YouTube embeds)
    registerTutorialsPanel(SLUI);
    
    // Shader Info panel (title, author, description, license, comments)
    registerShaderInfoPanel(SLUI);
    
    // Media panel (textures, audio, video, cubemaps, volumes)
    mediaPanel.register(SLUI);
    
    // Inputs panel (mouse, keyboard, webcam, mic, gamepad, midi)
    inputsPanel.register(SLUI);
    
    // Future panels:
    // registerGalleryPanel(SLUI);
    
    logger.debug('UI', 'Panels', 'All panels registered');
}

/**
 * Restore saved layout (must be called AFTER panels are registered)
 * 
 * WORKAROUND: SLUI's loadLayout has a bug with tabbed windows - it doesn't
 * re-fetch tabs from panel configs, so restored windows have no content.
 * For now, we skip layout restoration for tabbed panels.
 */
export async function restoreLayout() {
    logger.warn('UI', 'Layout', 'Layout restoration temporarily disabled due to SLUI tabbed window content bug');
    logger.info('UI', 'Layout', 'TODO: Fix SLUI.loadLayout() to merge saved options with panel.tabs() for tabbed windows');
    
    // TODO: Either fix SLUI's loadLayout or implement custom restoration
    // The bug: Tabbed windows save their options, but tabs[] contains content functions
    // that can't be serialized. On restore, tabs are empty.
    // Fix: When restoring a tabbed window, merge saved position/size with fresh tabs from panel config
    
    return;
    
    /* DISABLED UNTIL SLUI BUG IS FIXED:
    if (SLUI && SLUI.loadLayout) {
        await new Promise(resolve => setTimeout(resolve, 50));
        
        try {
            SLUI.loadLayout();
            logger.info('UI', 'Layout', 'Saved layout restored');
            
            if (SLUI.updateAllToolbarItems) {
                SLUI.updateAllToolbarItems();
            }
        } catch (e) {
            logger.warn('UI', 'Layout', 'Failed to restore layout: ' + e.message);
        }
    }
    */
}

/**
 * Set up reactive bindings - UI auto-updates from events
 * This is the "Reactive UI" pillar from V2-approach.md
 */
export function setupReactiveBindings() {
    logger.debug('UI', 'Bindings', 'Setting up reactive bindings...');
    
    // Example: shader dirty state → save button
    events.on(EVENTS.SHADER_DIRTY, (isDirty) => {
        // Will update save button when we have one
        // const saveBtn = document.getElementById('saveBtn');
        // if (saveBtn) saveBtn.textContent = isDirty ? '💾*' : '💾';
    });
    
    // Example: shader loaded → update title
    events.on(EVENTS.SHADER_LOADED, (shader) => {
        // Will update title display when we have one
        // const titleEl = document.getElementById('shaderTitle');
        // if (titleEl) titleEl.textContent = shader.title;
    });
    
    // Example: auth changed → update user menu
    events.on(EVENTS.AUTH_CHANGED, (user) => {
        // Will update auth UI when we have it
    });
    
    // Example: compile error → show in console (already automatic via logger)
    events.on(EVENTS.COMPILE_ERROR, (error) => {
        logger.error('Compiler', 'Error', error.message || String(error));
    });
    
    logger.debug('UI', 'Bindings', 'Reactive bindings ready');
}

/**
 * Open the console panel (for initial display)
 */
export function openConsole() {
    if (SLUI && SLUI.state.deviceMode === 'desktop') {
        SLUI.openPanel('console');
        logger.debug('UI', 'Console', 'Console panel opened');
    }
}

/**
 * Get SLUI instance
 */
export function getSLUI() {
    return SLUI;
}

export default {
    initUI,
    registerPanels,
    restoreLayout,
    setupReactiveBindings,
    openConsole,
    getSLUI
};
