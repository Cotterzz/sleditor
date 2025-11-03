// ============================================================================
// Tab Configuration - Single Source of Truth for Tab Management
// ============================================================================
// This file defines all tab types, their properties, and mapping between
// internal tab names and database code keys.
//
// Key Concepts:
// - Tab Name: Internal identifier used in activeTabs array
// - DB Key: Key used when saving to database/localStorage (code.xxx)
// - These can be different for historical/compatibility reasons
// ============================================================================

/**
 * Main tab configuration
 * Each tab has:
 * - label: Display name shown to users
 * - icon: Emoji icon for the tab
 * - dbKey: Key used in code object when saving (can differ from tab name)
 * - editor: Which Monaco editor instance this tab uses
 * - type: Technology type (for capability/compatibility checks)
 * - security: Optional security classification
 */
export const TAB_CONFIG = {
    // ========================================================================
    // GRAPHICS TABS
    // ========================================================================
    
    graphics: {
        label: 'Graphics (WGSL)',
        icon: '🎨',
        dbKey: 'graphics',
        editor: 'graphics',
        type: 'webgpu',
        language: 'wgsl'
    },
    
    glsl_fragment: {
        label: 'Fragment (GLSL)',
        icon: '🔺',
        dbKey: 'glsl_fragment',
        editor: 'graphics',
        type: 'webgl',
        language: 'glsl'
    },
    
    // ========================================================================
    // AUDIO TABS
    // ========================================================================
    
    audio_gpu: {
        label: 'Audio (WGSL)',
        icon: '🔊',
        dbKey: 'audio_gpu',
        editor: 'audio',
        type: 'webgpu',
        language: 'wgsl'
    },
    
    audio_worklet: {
        label: 'Audio (Worklet)',
        icon: '🎵',
        dbKey: 'audio_worklet',
        editor: 'audio',
        type: 'web-audio',
        language: 'javascript'
    },
    
    // ========================================================================
    // JAVASCRIPT
    // ========================================================================
    
    js: {
        label: 'JavaScript',
        icon: '⚡',
        dbKey: 'js',
        editor: 'js',
        type: 'javascript',
        language: 'javascript',
        security: 'restricted'  // Used for security checks
    }
};

/**
 * Legacy database keys mapping
 * Maps old/alternate code keys to current tab names
 * Used when loading shaders that were saved with old naming conventions
 */
export const LEGACY_DB_KEYS = {
    // Old variants of audio keys
    'wgsl_audio': 'audio_gpu',        // Old name for WGSL audio
    'audioworklet': 'audio_worklet',  // Missing underscore variant
    
    // Old variants of JS keys  
    'javascript': 'js',               // Full name variant
    
    // Old variants of graphics keys
    'wgsl_graphics': 'graphics'       // Explicit WGSL naming
};

/**
 * Get tab configuration by name
 * @param {string} tabName - Internal tab name
 * @returns {Object|null} Tab configuration or null if not found
 */
export function getTabConfig(tabName) {
    return TAB_CONFIG[tabName] || null;
}

/**
 * Get tab icon by name
 * @param {string} tabName - Internal tab name
 * @returns {string} Icon emoji
 */
export function getTabIcon(tabName) {
    const config = TAB_CONFIG[tabName];
    return config ? config.icon : '📝';
}

/**
 * Get tab label by name
 * @param {string} tabName - Internal tab name
 * @returns {string} Display label
 */
export function getTabLabel(tabName) {
    const config = TAB_CONFIG[tabName];
    return config ? config.label : tabName;
}

/**
 * Get database key for a tab
 * @param {string} tabName - Internal tab name
 * @returns {string} Database key
 */
export function getTabDbKey(tabName) {
    const config = TAB_CONFIG[tabName];
    return config ? config.dbKey : tabName;
}

/**
 * Map database key to tab name (handles legacy keys)
 * @param {string} dbKey - Database code key
 * @returns {string} Internal tab name
 */
export function dbKeyToTabName(dbKey) {
    // Check if it's a legacy key
    if (LEGACY_DB_KEYS[dbKey]) {
        return LEGACY_DB_KEYS[dbKey];
    }
    
    // Check if any tab uses this as its dbKey
    for (const [tabName, config] of Object.entries(TAB_CONFIG)) {
        if (config.dbKey === dbKey) {
            return tabName;
        }
    }
    
    // Not found - return as-is (might be a future buffer pass or unknown type)
    return dbKey;
}

/**
 * Check if a tab requires WebGPU
 * @param {string} tabName - Internal tab name
 * @returns {boolean}
 */
export function tabRequiresWebGPU(tabName) {
    const config = TAB_CONFIG[tabName];
    return config?.type === 'webgpu';
}

/**
 * Check if a tab has JavaScript (security concern)
 * @param {string} tabName - Internal tab name
 * @returns {boolean}
 */
export function tabHasJavaScript(tabName) {
    const config = TAB_CONFIG[tabName];
    return config?.security === 'restricted' || config?.language === 'javascript';
}

/**
 * Get all available tab names
 * @returns {string[]} Array of tab names
 */
export function getAllTabNames() {
    return Object.keys(TAB_CONFIG);
}

/**
 * Check if tabs are mutually exclusive
 * (e.g., audio_gpu and audio_worklet can't coexist)
 * @param {string} tab1 - First tab name
 * @param {string} tab2 - Second tab name
 * @returns {boolean}
 */
export function tabsAreMutuallyExclusive(tab1, tab2) {
    // Audio tabs are mutually exclusive
    const audioTabs = ['audio_gpu', 'audio_worklet'];
    if (audioTabs.includes(tab1) && audioTabs.includes(tab2)) {
        return true;
    }
    
    return false;
}

/**
 * Get the editor instance for a tab
 * @param {string} tabName - Internal tab name
 * @param {Object} state - Application state
 * @returns {Object|null} Monaco editor instance
 */
export function getEditorForTab(tabName, state) {
    const config = TAB_CONFIG[tabName];
    if (!config) return null;
    
    const editorName = config.editor + 'Editor';
    return state[editorName] || null;
}

