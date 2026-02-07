/**
 * V2 Configuration
 * 
 * Static configuration values that don't change at runtime.
 * For runtime state, see state.js
 */

// Compute V2 root as absolute URL so paths work from any module
// config.js is at V2/js/core/config.js → go up 2 levels to reach V2/
const V2_ROOT = new URL('../..', import.meta.url).href;

export const CONFIG = {
    // App info
    APP_NAME: 'Sleditor',
    APP_VERSION: '2.0.0',
    
    // SLUI paths (absolute URLs computed from V2 root)
    SLUI_PATH: V2_ROOT + 'ui-system/src/index.js',
    SLUI_THEMES: V2_ROOT + 'ui-system/themes/themes.json',
    SLUI_LANG: V2_ROOT + 'ui-system/lang/en.json',
    SLUI_ICONS: V2_ROOT + 'ui-system/icons/',
    
    // Default settings
    DEFAULT_THEME: 'architect',
    DEFAULT_LANG: 'en',
    
    // Limits
    MAX_CONSOLE_MESSAGES: 1000,
    
    // Feature flags
    FEATURES: {
        WEBGPU: false,           // WebGPU backend (future)
        AI_ASSIST: false,        // AI assistance (future)
        RECORDING: false,        // Video recording (future)
    }
};

export default CONFIG;
