/**
 * SLUI Event System
 * Simple pub/sub event bus for UI communication
 */

const listeners = new Map();

/**
 * Subscribe to an event
 * @param {string} event - Event name
 * @param {Function} callback - Handler function
 * @returns {Function} Unsubscribe function
 */
export function on(event, callback) {
    if (!listeners.has(event)) {
        listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => off(event, callback);
}

/**
 * Unsubscribe from an event
 * @param {string} event - Event name
 * @param {Function} callback - Handler function
 */
export function off(event, callback) {
    if (listeners.has(event)) {
        listeners.get(event).delete(callback);
    }
}

/**
 * Emit an event
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
export function emit(event, data) {
    if (listeners.has(event)) {
        listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`Error in event handler for "${event}":`, err);
            }
        });
    }
    
    // Also dispatch as DOM CustomEvent for external listeners
    document.dispatchEvent(new CustomEvent(`sl-${event}`, { detail: data }));
}

/**
 * Subscribe to an event once
 * @param {string} event - Event name
 * @param {Function} callback - Handler function
 */
export function once(event, callback) {
    const wrapper = (data) => {
        off(event, wrapper);
        callback(data);
    };
    on(event, wrapper);
}

// Event name constants
export const EVENTS = {
    THEME_CHANGE: 'theme-change',
    LANG_CHANGE: 'lang-change',
    WINDOW_OPEN: 'window-open',
    WINDOW_CLOSE: 'window-close',
    WINDOW_FOCUS: 'window-focus',
    PANEL_OPEN: 'panel-open',
    PANEL_CLOSE: 'panel-close',
    DEVICE_MODE_CHANGE: 'device-mode-change',
    TOOLBAR_POSITION_CHANGE: 'toolbar-position-change',
    USER_ACTION: 'user-action'
};
