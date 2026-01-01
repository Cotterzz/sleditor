/**
 * SLUI State Management
 * Central state store for the UI system
 */

export const state = {
    theme: null,
    themes: {},
    lang: null,
    strings: {},
    toolbarPosition: 'left',
    windowMode: 'overlay', // 'overlay' or 'docked'
    windows: new Map(),
    activeWindow: null,
    zIndex: 100,
    deviceMode: 'desktop', // 'desktop' or 'mobile'
    mobileOrientation: 'portrait', // 'portrait' or 'landscape'
    forceMode: null, // null = auto, 'desktop' or 'mobile' for override
    settingsOpen: false,
    user: {
        name: 'Guest',
        avatar: null
    },
    // Mobile zone state
    mobileZones: {
        top: null,    // panel id
        bottom: null, // panel id
        left: null,   // panel id (landscape)
        right: null,  // panel id (landscape)
        focused: 'top' // or 'bottom', 'left', 'right'
    },
    // Dock tree state - BSP tree for docked windows
    // null = empty, or { type: 'leaf', panelId } or { type: 'split', direction, ratio, first, second }
    dockTree: null,
    // Track which windows are docked vs floating
    dockedWindows: new Set()
};

// Panel registry
export const panels = new Map();

// Store panel configs for re-registration after mode changes
export const panelConfigs = [];

/**
 * Reset layout state (used when switching between mobile/desktop)
 */
export function resetLayoutState() {
    state.windows.clear();
    state.activeWindow = null;
    state.zIndex = 100;
    
    state.mobileZones = {
        top: null,
        bottom: null,
        left: null,
        right: null,
        focused: 'top'
    };
    
    state.settingsOpen = false;
}
