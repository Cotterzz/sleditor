/**
 * Actions - Centralized state mutations
 * 
 * ALL state mutations go through this module. Benefits:
 * - Single place for all state changes
 * - Automatic event emission (can't forget)
 * - Enables undo/redo (future)
 * - Easier debugging
 * 
 * Pattern:
 *   import { actions } from './core/actions.js';
 *   actions.addProjectElement('code', element);
 */

import { state } from './state.js';
import { events, EVENTS } from './events.js';

// ============================================================================
// Project Element Actions
// ============================================================================

/**
 * Add an element to a project category
 * @param {'code'|'media'|'inputs'} category
 * @param {Object} element
 * @returns {Object} The added element
 */
export function addProjectElement(category, element) {
    if (!state.project[category]) {
        throw new Error(`Invalid category: ${category}`);
    }
    
    state.project[category].push(element);
    events.emit(EVENTS.PROJECT_ELEMENT_CREATED, { element, category });
    
    return element;
}

/**
 * Remove an element from a project category
 * @param {'code'|'media'|'inputs'} category
 * @param {number} index
 * @returns {Object|null} The removed element
 */
export function removeProjectElement(category, index) {
    if (!state.project[category] || index < 0 || index >= state.project[category].length) {
        return null;
    }
    
    const [element] = state.project[category].splice(index, 1);
    events.emit(EVENTS.PROJECT_ELEMENT_DELETED, { elementId: element.id, category });
    
    return element;
}

/**
 * Set the entire project code array
 * @param {Array} codeElements
 */
export function setProjectCode(codeElements) {
    state.project.code = codeElements;
}

/**
 * Set the entire project inputs array
 * @param {Array} inputElements
 */
export function setProjectInputs(inputElements) {
    state.project.inputs = inputElements;
}

/**
 * Set the entire project media array
 * @param {Array} mediaElements
 */
export function setProjectMedia(mediaElements) {
    state.project.media = mediaElements;
}

// ============================================================================
// Shader Code Actions
// ============================================================================

/**
 * Set shader code for a tab
 * @param {string} tabId - 'Image', 'BufferA', 'Common', etc.
 * @param {string} code
 */
export function setShaderCode(tabId, code) {
    if (!state.shader.code) {
        state.shader.code = {};
    }
    state.shader.code[tabId] = code;
    state.shader.isDirty = true;
}

/**
 * Delete shader code for a tab
 * @param {string} tabId
 */
export function deleteShaderCode(tabId) {
    if (state.shader.code) {
        delete state.shader.code[tabId];
        state.shader.isDirty = true;
    }
}

/**
 * Set the entire shader code object
 * @param {Object} codeObj - { Image: '...', BufferA: '...', etc. }
 */
export function setShaderCodeAll(codeObj) {
    state.shader.code = codeObj;
}

/**
 * Mark shader as dirty (has unsaved changes)
 */
export function markShaderDirty() {
    state.shader.isDirty = true;
}

/**
 * Mark shader as clean (saved)
 */
export function markShaderClean() {
    state.shader.isDirty = false;
}

// ============================================================================
// Shader Metadata Actions
// ============================================================================

/**
 * Set shader title
 * @param {string} title
 */
export function setShaderTitle(title) {
    state.shader.title = title;
    state.shader.isDirty = true;
}

/**
 * Set shader ID
 * @param {string|null} id
 */
export function setShaderId(id) {
    state.shader.id = id;
}

/**
 * Set shader active tabs
 * @param {Array<string>} tabs
 */
export function setShaderActiveTabs(tabs) {
    state.shader.activeTabs = tabs;
}

/**
 * Add a tab to shader active tabs
 * @param {string} tabId
 */
export function addShaderActiveTab(tabId) {
    if (!state.shader.activeTabs.includes(tabId)) {
        state.shader.activeTabs.push(tabId);
    }
}

/**
 * Remove a tab from shader active tabs
 * @param {string} tabId
 */
export function removeShaderActiveTab(tabId) {
    const idx = state.shader.activeTabs.indexOf(tabId);
    if (idx >= 0) {
        state.shader.activeTabs.splice(idx, 1);
    }
}

// ============================================================================
// UI Tab Actions
// ============================================================================

/**
 * Set the list of open tabs
 * @param {Array<string>} tabs
 */
export function setOpenTabs(tabs) {
    state.ui.openTabs = tabs;
}

/**
 * Open a tab (add to open tabs if not present)
 * @param {string} tabId
 */
export function openTab(tabId) {
    if (!state.ui.openTabs.includes(tabId)) {
        state.ui.openTabs.push(tabId);
    }
    state.ui.activeTab = tabId;
    events.emit(EVENTS.PROJECT_TAB_OPENED, { tabId });
}

/**
 * Close a tab
 * @param {string} tabId
 * @returns {boolean} Whether the tab was closed
 */
export function closeTab(tabId) {
    const idx = state.ui.openTabs.indexOf(tabId);
    if (idx >= 0) {
        state.ui.openTabs.splice(idx, 1);
        
        // If closing active tab, switch to adjacent
        if (state.ui.activeTab === tabId) {
            state.ui.activeTab = state.ui.openTabs[Math.max(0, idx - 1)] || null;
        }
        
        events.emit(EVENTS.PROJECT_TAB_CLOSED, { tabId });
        return true;
    }
    return false;
}

/**
 * Set the active tab
 * @param {string} tabId
 */
export function setActiveTab(tabId) {
    state.ui.activeTab = tabId;
    events.emit(EVENTS.PROJECT_TAB_ACTIVATED, { tabId });
}

/**
 * Toggle sidebar collapsed state
 */
export function toggleSidebar() {
    state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
    events.emit(EVENTS.PROJECT_SIDEBAR_TOGGLED, { collapsed: state.ui.sidebarCollapsed });
}

/**
 * Toggle a sidebar section
 * @param {string} category
 */
export function toggleSidebarSection(category) {
    if (!state.ui.sidebarSections) {
        state.ui.sidebarSections = {};
    }
    state.ui.sidebarSections[category] = !(state.ui.sidebarSections[category] !== false);
}

// ============================================================================
// Channel Matrix Actions
// ============================================================================

/**
 * Set channel matrix settings for a receiver-sender pair
 * @param {string} key - Format: 'receiverId-channelNum'
 * @param {Object} settings - { filter, wrap }
 */
export function setChannelMatrixSettings(key, settings) {
    if (!state.shader.channelMatrix) {
        state.shader.channelMatrix = {};
    }
    state.shader.channelMatrix[key] = settings;
}

/**
 * Clear all channel matrix settings
 */
export function clearChannelMatrix() {
    state.shader.channelMatrix = {};
}

// ============================================================================
// Shader Like Actions
// ============================================================================

/**
 * Set shader like state
 * @param {boolean} liked
 * @param {number} likes
 */
export function setShaderLikeState(liked, likes) {
    state.shader.liked = liked;
    state.shader.likes = likes;
}

// ============================================================================
// Editor State Actions
// ============================================================================

/**
 * Set auto-compile preference
 * @param {boolean} enabled
 */
export function setAutoCompile(enabled) {
    state.editor.autoCompile = enabled;
}

// ============================================================================
// Export all actions
// ============================================================================

export const actions = {
    // Project elements
    addProjectElement,
    removeProjectElement,
    setProjectCode,
    setProjectInputs,
    setProjectMedia,
    
    // Shader code
    setShaderCode,
    deleteShaderCode,
    setShaderCodeAll,
    markShaderDirty,
    markShaderClean,
    
    // Shader metadata
    setShaderTitle,
    setShaderId,
    setShaderActiveTabs,
    addShaderActiveTab,
    removeShaderActiveTab,
    
    // UI tabs
    setOpenTabs,
    openTab,
    closeTab,
    setActiveTab,
    toggleSidebar,
    toggleSidebarSection,
    
    // Channel matrix
    setChannelMatrixSettings,
    clearChannelMatrix,
    
    // Like state
    setShaderLikeState,
    
    // Editor
    setAutoCompile
};

export default actions;
