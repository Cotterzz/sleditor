/**
 * V2 Configuration
 * 
 * Static configuration values that don't change at runtime.
 * For runtime state, see state.js
 */

export const CONFIG = {
    // App info
    APP_NAME: 'Sleditor',
    APP_VERSION: '2.0.0',
    
    // SLUI paths (absolute from site root)
    SLUI_PATH: '/ui-system/src/index.js',
    SLUI_THEMES: '/ui-system/themes/themes.json',
    SLUI_LANG: '/ui-system/lang/en.json',
    SLUI_ICONS: '/ui-system/icons/',
    
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
