/**
 * V2 Event Bus - Decoupled messaging between modules
 * 
 * Usage:
 *   import { events, EVENTS } from './core/events.js';
 *   
 *   // Subscribe
 *   events.on(EVENTS.SHADER_LOADED, (shader) => { ... });
 *   
 *   // Emit
 *   events.emit(EVENTS.SHADER_LOADED, shaderData);
 *   
 *   // One-time subscription
 *   events.once(EVENTS.COMPILE_SUCCESS, () => { ... });
 */

class EventBus {
    #listeners = new Map();
    
    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event).add(handler);
        
        // Return unsubscribe function
        return () => this.off(event, handler);
    }
    
    /**
     * Unsubscribe from an event
     */
    off(event, handler) {
        const handlers = this.#listeners.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    
    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        const handlers = this.#listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`Event handler error for ${event}:`, e);
                }
            }
        }
        
        // Also emit to wildcard listeners
        const wildcardHandlers = this.#listeners.get('*');
        if (wildcardHandlers) {
            for (const handler of wildcardHandlers) {
                try {
                    handler(event, data);
                } catch (e) {
                    console.error(`Wildcard handler error:`, e);
                }
            }
        }
    }
    
    /**
     * Subscribe to an event once
     */
    once(event, handler) {
        const wrapper = (data) => {
            this.off(event, wrapper);
            handler(data);
        };
        return this.on(event, wrapper);
    }
    
    /**
     * Clear all listeners for an event (or all events if no event specified)
     */
    clear(event = null) {
        if (event) {
            this.#listeners.delete(event);
        } else {
            this.#listeners.clear();
        }
    }
}

// Singleton instance
export const events = new EventBus();

// Event constants for discoverability and refactoring safety
export const EVENTS = {
    // Shader lifecycle
    SHADER_CREATED: 'shader:created',
    SHADER_LOADED: 'shader:loaded',
    SHADER_SAVED: 'shader:saved',
    SHADER_FORKED: 'shader:forked',
    SHADER_DIRTY: 'shader:dirty',
    SHADER_CLOSED: 'shader:closed',
    
    // Compilation
    COMPILE_START: 'compile:start',
    COMPILE_SUCCESS: 'compile:success',
    COMPILE_ERROR: 'compile:error',
    COMPILE_WARNING: 'compile:warning',
    
    // Uniforms
    UNIFORMS_DETECTED: 'uniforms:detected',
    UNIFORM_CHANGED: 'uniforms:changed',
    
    // Render
    RENDERER_READY: 'render:ready',
    RENDER_START: 'render:start',
    RENDER_STOP: 'render:stop',
    RENDER_FRAME: 'render:frame',
    RENDER_FRAME_REQUESTED: 'render:frame:requested',  // Request single frame (even when paused)
    RENDER_RESOLUTION: 'render:resolution',
    RENDER_ERROR: 'render:error',
    RENDER_CHANNEL_CHANGED: 'render:channel:changed',
    RENDER_COLORSPACE_CHANGED: 'render:colorspace:changed',
    
    // Shader controls
    SHADER_CONTROLS_DOCKED: 'shader-controls:docked',
    PREVIEW_GLASS_MODE: 'preview:glass-mode',
    
    // Shader code (from external sources)
    SHADER_CODE_SET: 'shader:code-set',
    COMPILE_REQUEST: 'compile:request',
    
    // Editor
    EDITOR_CODE_CHANGED: 'editor:code-changed',
    EDITOR_CURSOR_CHANGED: 'editor:cursor-changed',
    EDITOR_FOCUS: 'editor:focus',
    EDITOR_BLUR: 'editor:blur',
    
    // Editor
    EDITOR_CODE_CHANGED: 'editor:code-changed',
    EDITOR_CURSOR_CHANGED: 'editor:cursor-changed',
    
    // Tabs (legacy - kept for compatibility)
    TAB_SWITCHED: 'tab:switched',
    TAB_ADDED: 'tab:added',
    TAB_REMOVED: 'tab:removed',
    TAB_RENAMED: 'tab:renamed',
    
    // Project elements (unified editor)
    PROJECT_ELEMENT_CREATED: 'project:element:created',   // { id, category, element }
    PROJECT_ELEMENT_DELETED: 'project:element:deleted',   // { id, category }
    PROJECT_ELEMENT_UPDATED: 'project:element:updated',   // { id, category, changes }
    PROJECT_TAB_OPENED: 'project:tab:opened',             // { elementId }
    PROJECT_TAB_CLOSED: 'project:tab:closed',             // { elementId }
    PROJECT_TAB_ACTIVATED: 'project:tab:activated',       // { elementId }
    PROJECT_SIDEBAR_TOGGLED: 'project:sidebar:toggled',   // { collapsed }
    PROJECT_RESET: 'project:reset',                       // (no data)
    
    // Channels
    CHANNEL_CREATED: 'channel:created',
    CHANNEL_SET: 'channel:set',
    CHANNEL_CLEARED: 'channel:cleared',
    CHANNEL_ERROR: 'channel:error',
    
    // Media
    MEDIA_SELECTED: 'media:selected',
    MEDIA_TAB_ADDED: 'media:tab:added',
    MEDIA_TAB_REMOVED: 'media:tab:removed',
    MEDIA_URL_IMPORT: 'media:url:import',
    MEDIA_OPTIONS_CHANGED: 'media:options:changed',
    VIDEO_SELECTED: 'video:selected',
    VIDEO_URL_IMPORT: 'video:url:import',
    VIDEO_LOOP_CHANGED: 'video:loop:changed',
    AUDIO_SELECTED: 'audio:selected',
    AUDIO_URL_IMPORT: 'audio:url:import',
    AUDIO_MODE_CHANGED: 'audio:mode:changed',
    AUDIO_LOOP_CHANGED: 'audio:loop:changed',
    
    // Inputs
    INPUT_WEBCAM_ENABLED: 'input:webcam:enabled',
    INPUT_WEBCAM_DISABLED: 'input:webcam:disabled',
    INPUT_MIC_ENABLED: 'input:mic:enabled',
    INPUT_MIC_DISABLED: 'input:mic:disabled',
    INPUT_KEYBOARD_ENABLED: 'input:keyboard:enabled',
    INPUT_KEYBOARD_DISABLED: 'input:keyboard:disabled',
    
    // Fullscreen
    FULLSCREEN_ENTER: 'fullscreen:enter',
    FULLSCREEN_EXIT: 'fullscreen:exit',
    FULLSCREEN_CONTROLS_VISIBLE: 'fullscreen:controls:visible',
    
    // Auth
    AUTH_CHANGED: 'auth:changed',
    AUTH_LOGIN: 'auth:login',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_ERROR: 'auth:error',
    
    // UI
    UI_READY: 'ui:ready',
    UI_PANEL_OPENED: 'ui:panel-opened',
    UI_PANEL_CLOSED: 'ui:panel-closed',
    UI_THEME_CHANGED: 'ui:theme-changed',
    UI_LAYOUT_CHANGED: 'ui:layout-changed',
    
    // System
    INIT_START: 'init:start',
    INIT_PROGRESS: 'init:progress',
    INIT_COMPLETE: 'init:complete',
    INIT_ERROR: 'init:error',
    
    // Toast/Notifications
    TOAST_SHOW: 'toast:show',
    TOAST_HIDE: 'toast:hide'
};

export default events;
