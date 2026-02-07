/**
 * Unified Editor Panel - All-in-one editor with project sidebar
 * 
 * Architecture:
 * - Left sidebar: Project explorer (Code, Media, Inputs sections)
 * - Right area: Tabbed content (Monaco for code, settings for inputs, selector for media)
 * 
 * Key concepts:
 * - Sidebar shows PROJECT ELEMENTS (the canonical data)
 * - Tabs are VIEWS into elements (opening/closing tabs doesn't affect elements)
 * - Creating/deleting elements happens in sidebar only
 * - Double-click element → open tab (or focus if already open)
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state, findProjectElement, resetProjectState } from '../../core/state.js';
import { actions } from '../../core/actions.js';
import { applyMonacoThemeFromSLUI } from '../../editor/monaco-loader.js';
import { shaderManager } from '../../managers/ShaderManager.js';
import { channelManager } from '../../managers/ChannelManager.js';
import { getSLUI } from '../index.js';

// Import component modules
import { 
    createCodeContent, 
    ensureMonaco, 
    getOrCreateModel, 
    saveModelToState, 
    disposeModel,
    showErrorMarkers,
    clearErrorMarkers
} from './editor-code.js';

import { 
    createMediaContent, 
    loadCatalog,
    setRefreshCallback as setMediaRefreshCallback 
} from './editor-media.js';

import { createInputContent } from './editor-inputs.js';

import { 
    createChannelMatrixContent, 
    openChannelMatrixTab, 
    MATRIX_TAB_ID,
    setRefreshCallback as setMatrixRefreshCallback
} from './editor-matrix.js';

// ========== CONSTANTS ==========

const CODE_TYPES = [
    { type: 'common', label: 'Common', icon: '📄', desc: 'Shared code (prepended to all passes)' },
    { type: 'buffer', label: 'Buffer', icon: '📄', desc: 'Render pass (BufferA, B, C, D...)' },
    { type: 'audio', label: 'Audio', icon: '🔊', desc: 'Audio output shader', disabled: true }
];

const MEDIA_TYPES = [
    { type: 'texture', label: 'Texture', shortLabel: 'Tex', icon: '🖼️', desc: '2D texture' },
    { type: 'audio', label: 'Audio', shortLabel: 'Aud', icon: '🎵', desc: 'Audio file' },
    { type: 'video', label: 'Video', shortLabel: 'Vid', icon: '🎬', desc: 'Video file' },
    { type: 'cubemap', label: 'Cubemap', shortLabel: 'Cube', icon: '🌐', desc: 'Cubemap texture' },
    { type: 'volume', label: 'Volume', shortLabel: 'Vol', icon: '📦', desc: '3D volume texture' }
];

const INPUT_TYPES = [
    { type: 'keyboard', label: 'Keyboard', icon: '⌨️', desc: 'Keyboard input texture' },
    { type: 'webcam', label: 'Webcam', icon: '📷', desc: 'Webcam video input' },
    { type: 'mic', label: 'Microphone', icon: '🎤', desc: 'Microphone audio input' },
    { type: 'gamepad', label: 'Gamepad', icon: '🎮', desc: 'Gamepad input', disabled: true },
    { type: 'midi', label: 'MIDI', icon: '🎹', desc: 'MIDI controller input', disabled: true }
];

// ========== STATE ==========

// SLUI reference
let _SLUI = null;

// Sidebar DOM reference (for updates)
let sidebarElement = null;

// ========== ELEMENT MANAGEMENT ==========

/**
 * Get output channel for a code element
 * Returns the channel property from the element, or looks it up via ChannelManager
 */
function getCodeOutputChannel(elementId) {
    // Common doesn't output to a channel
    if (elementId === 'Common') return null;
    
    // Find the element and return its channel property
    const element = state.project.code.find(c => c.id === elementId);
    if (element && element.channel !== undefined) {
        return element.channel;
    }
    
    // Fallback: look up via ChannelManager (for buffers that may have been registered there)
    const ch = channelManager.getChannelForPass(elementId);
    return ch !== null ? ch : null;
}

/**
 * Get next available buffer letter (A-Z)
 */
function getNextBufferLetter() {
    const existing = state.project.code
        .filter(c => c.id.startsWith('Buffer'))
        .map(c => c.id.replace('Buffer', ''));
    
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i); // A=65
        if (!existing.includes(letter)) {
            return letter;
        }
    }
    return null; // All 26 letters used (unlikely)
}

/**
 * Add a code element
 */
function addCodeElement(type) {
    let element;
    
    if (type === 'common') {
        if (state.project.code.find(c => c.id === 'Common')) {
            logger.warn('UnifiedEditor', 'Add', 'Common already exists');
            return null;
        }
        // Common doesn't get a channel - it's prepended to all passes
        element = { id: 'Common', type: 'common', label: 'Common', icon: '📄', locked: false };
        actions.setShaderCode('Common', '// Common code\n');
    } else if (type === 'buffer') {
        const letter = getNextBufferLetter();
        
        if (!letter) {
            logger.warn('UnifiedEditor', 'Add', 'All buffer letters (A-Z) in use');
            return null;
        }
        
        const bufferId = `Buffer${letter}`;
        
        // Allocate channel via ChannelManager (dynamic sequential allocation)
        const channel = channelManager.createBufferChannel(bufferId);
        
        element = { 
            id: bufferId, 
            type: 'buffer', 
            label: `Buff ${letter}`, 
            icon: '📄', 
            locked: false,
            channel  // Store the allocated channel on the element
        };
        actions.setShaderCode(bufferId, `// ${bufferId} - Output: iChannel${channel}\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    fragColor = vec4(0.0);\n}\n`);
    } else {
        return null;
    }
    
    actions.addProjectElement('code', element);
    
    openTab(element.id);
    shaderManager.compileNow();
    
    return element;
}

/**
 * Add a media element
 */
function addMediaElement(type) {
    const typeInfo = MEDIA_TYPES.find(t => t.type === type);
    if (!typeInfo) return null;
    
    const count = state.project.media.filter(m => m.type === type).length;
    const letter = String.fromCharCode(65 + count);
    
    // Allocate channel via ChannelManager (dynamic sequential allocation)
    const channel = channelManager.createMediaChannel(type, null);
    
    // Use short label format for consistency (e.g., "Tex A", "Aud B")
    const element = {
        id: `${type}_${Date.now()}`,
        type,
        label: `${typeInfo.shortLabel} ${letter}`,
        icon: typeInfo.icon,
        channel,
        locked: false
    };
    
    actions.addProjectElement('media', element);
    
    openTab(element.id);
    return element;
}

/**
 * Add an input element
 */
function addInputElement(type) {
    const typeInfo = INPUT_TYPES.find(t => t.type === type);
    if (!typeInfo) return null;
    
    if (state.project.inputs.find(i => i.type === type)) {
        logger.warn('UnifiedEditor', 'Add', `${type} input already exists`);
        return null;
    }
    
    // Allocate channel via ChannelManager (dynamic sequential allocation)
    const channel = channelManager.createMediaChannel(type, null);
    
    const element = {
        id: `${type}_input`,
        type,
        label: typeInfo.label,
        icon: typeInfo.icon,
        channel,
        locked: false,
        active: false
    };
    
    actions.addProjectElement('inputs', element);
    
    openTab(element.id);
    return element;
}

/**
 * Delete an element
 */
function deleteElement(elementId) {
    // Find element
    let element = null;
    let category = null;
    let index = -1;
    
    index = state.project.code.findIndex(c => c.id === elementId);
    if (index >= 0) {
        element = state.project.code[index];
        category = 'code';
    }
    
    if (!element) {
        index = state.project.media.findIndex(m => m.id === elementId);
        if (index >= 0) {
            element = state.project.media[index];
            category = 'media';
        }
    }
    
    if (!element) {
        index = state.project.inputs.findIndex(i => i.id === elementId);
        if (index >= 0) {
            element = state.project.inputs[index];
            category = 'inputs';
        }
    }
    
    if (!element) {
        logger.warn('UnifiedEditor', 'Delete', `Element not found: ${elementId}`);
        return false;
    }
    
    if (element.locked) {
        logger.warn('UnifiedEditor', 'Delete', `Cannot delete locked element: ${elementId}`);
        return false;
    }
    
    // Close tab if open
    closeTab(elementId);
    
    // Clean up channel if element has one (frees it for reuse)
    if (element.channel !== undefined && element.channel !== 0) {
        channelManager.removeChannel(element.channel);
    }
    
    // Clean up model for code elements
    if (category === 'code') {
        disposeModel(elementId);
        actions.deleteShaderCode(elementId);
    }
    
    // Remove from project (actions.removeProjectElement emits the event)
    actions.removeProjectElement(category, index);
    
    if (category === 'code') {
        shaderManager.compileNow();
    }
    
    return true;
}

// ========== TAB MANAGEMENT ==========

/**
 * Open a tab for an element
 */
function openTab(elementId) {
    actions.openTab(elementId);
    refreshTabs();
    refreshSidebarActiveState();
}

/**
 * Close a tab
 */
function closeTab(elementId) {
    if (actions.closeTab(elementId)) {
        refreshTabs();
        refreshSidebarActiveState();
    }
}

/**
 * Activate a tab
 */
function activateTab(elementId) {
    if (state.ui.openTabs.includes(elementId) || elementId === MATRIX_TAB_ID) {
        actions.setActiveTab(elementId);
        refreshTabs();
        refreshSidebarActiveState();
    }
}

// ========== SIDEBAR ==========

/**
 * Create the sidebar
 */
function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'v2-project-sidebar';
    if (state.ui.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
    }
    sidebarElement = sidebar;
    
    // Header
    const header = document.createElement('div');
    header.className = 'v2-sidebar-header';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'v2-sidebar-toggle';
    toggleBtn.innerHTML = state.ui.sidebarCollapsed ? '▶' : '◀';
    toggleBtn.title = 'Toggle sidebar';
    toggleBtn.addEventListener('click', toggleSidebar);
    header.appendChild(toggleBtn);
    
    const title = document.createElement('span');
    title.className = 'v2-sidebar-title';
    title.textContent = 'Project';
    header.appendChild(title);
    
    sidebar.appendChild(header);
    
    // Sections
    sidebar.appendChild(createSidebarSection('code', 'Code', CODE_TYPES, state.project.code));
    sidebar.appendChild(createSidebarSection('media', 'Media', MEDIA_TYPES, state.project.media));
    sidebar.appendChild(createSidebarSection('inputs', 'Inputs', INPUT_TYPES, state.project.inputs));
    
    // Channel Matrix link
    const matrixLink = document.createElement('div');
    matrixLink.className = 'v2-sidebar-section';
    
    const matrixHeader = document.createElement('div');
    matrixHeader.className = 'v2-sidebar-section-header v2-matrix-link';
    matrixHeader.innerHTML = '<span class="v2-section-icon">🔗</span><span class="v2-section-title">Channel Matrix</span>';
    matrixHeader.addEventListener('click', () => openChannelMatrixTab());
    matrixLink.appendChild(matrixHeader);
    
    sidebar.appendChild(matrixLink);
    
    return sidebar;
}

/**
 * Create a sidebar section
 */
function createSidebarSection(category, title, addOptions, elements) {
    const section = document.createElement('div');
    section.className = 'v2-sidebar-section';
    section.dataset.category = category;
    
    // Header
    const header = document.createElement('div');
    header.className = 'v2-sidebar-section-header';
    
    const expandBtn = document.createElement('span');
    expandBtn.className = 'v2-section-expand';
    expandBtn.textContent = state.ui.sidebarSections?.[category] === false ? '▶' : '▼';
    expandBtn.addEventListener('click', () => toggleSection(category));
    header.appendChild(expandBtn);
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'v2-section-title';
    titleSpan.textContent = title;
    header.appendChild(titleSpan);
    
    const addBtn = createAddButton(category, addOptions);
    header.appendChild(addBtn);
    
    section.appendChild(header);
    
    // Items
    const items = document.createElement('div');
    items.className = 'v2-sidebar-items';
    if (state.ui.sidebarSections?.[category] === false) {
        items.style.display = 'none';
    }
    
    elements.forEach(element => {
        items.appendChild(createSidebarItem(element, category));
    });
    
    section.appendChild(items);
    
    return section;
}

/**
 * Create add button with dropdown
 */
function createAddButton(category, options) {
    const container = document.createElement('div');
    container.className = 'v2-add-button-container';
    
    const btn = document.createElement('button');
    btn.className = 'v2-add-button';
    btn.textContent = '+';
    btn.title = `Add ${category}`;
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Remove any existing dropdown
        document.querySelectorAll('.v2-add-dropdown').forEach(d => d.remove());
        
        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'v2-add-dropdown visible';
        
        options.forEach(opt => {
            const item = document.createElement('button');
            item.className = 'v2-dropdown-item';
            item.disabled = opt.disabled || false;
            item.title = opt.desc;
            item.innerHTML = `<span class="v2-dropdown-icon">${opt.icon}</span><span class="v2-dropdown-label">${opt.label}</span>`;
            
            item.addEventListener('click', () => {
                dropdown.remove();
                if (category === 'code') addCodeElement(opt.type);
                else if (category === 'media') addMediaElement(opt.type);
                else if (category === 'inputs') addInputElement(opt.type);
            });
            
            dropdown.appendChild(item);
        });
        
        // Position and append
        const rect = btn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        document.body.appendChild(dropdown);
        
        // Close on click outside
        setTimeout(() => {
            const close = (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.remove();
                    document.removeEventListener('click', close);
                }
            };
            document.addEventListener('click', close);
        }, 0);
    });
    
    container.appendChild(btn);
    return container;
}

/**
 * Create sidebar item
 */
function createSidebarItem(element, category) {
    const item = document.createElement('div');
    item.className = 'v2-sidebar-item';
    item.dataset.elementId = element.id;
    
    if (state.ui.openTabs.includes(element.id)) {
        item.classList.add('has-tab');
    }
    if (state.ui.activeTab === element.id) {
        item.classList.add('active');
    }
    
    // Icon
    const icon = document.createElement('span');
    icon.className = 'v2-item-icon';
    icon.textContent = element.icon;
    item.appendChild(icon);
    
    // Label
    const label = document.createElement('span');
    label.className = 'v2-item-label';
    label.textContent = element.label;
    item.appendChild(label);
    
    // Channel indicator
    if (category === 'code') {
        const outputChannel = getCodeOutputChannel(element.id);
        if (outputChannel !== null) {
            const channel = document.createElement('span');
            channel.className = 'v2-item-channel';
            channel.textContent = `iCh${outputChannel}`;
            channel.title = `Output: iChannel${outputChannel}`;
            item.appendChild(channel);
        }
    } else if (element.channel !== undefined) {
        const channel = document.createElement('span');
        channel.className = 'v2-item-channel';
        channel.textContent = `iCh${element.channel}`;
        item.appendChild(channel);
    }
    
    // Double-click to open tab
    item.addEventListener('dblclick', () => openTab(element.id));
    
    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, element, category);
    });
    
    return item;
}

/**
 * Show context menu for sidebar item
 */
function showContextMenu(event, element, category) {
    document.querySelectorAll('.v2-sidebar-context-menu').forEach(m => m.remove());
    
    const menu = document.createElement('div');
    menu.className = 'v2-sidebar-context-menu';
    
    // Open
    const openItem = document.createElement('button');
    openItem.textContent = 'Open';
    openItem.addEventListener('click', () => {
        menu.remove();
        openTab(element.id);
    });
    menu.appendChild(openItem);
    
    // Delete (if not locked)
    if (!element.locked) {
        const deleteItem = document.createElement('button');
        deleteItem.textContent = 'Delete';
        deleteItem.className = 'v2-menu-danger';
        deleteItem.addEventListener('click', () => {
            menu.remove();
            if (confirm(`Delete "${element.label}"?`)) {
                deleteElement(element.id);
            }
        });
        menu.appendChild(deleteItem);
    }
    
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    document.body.appendChild(menu);
    
    setTimeout(() => {
        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
        document.addEventListener('click', close);
    }, 0);
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar() {
    actions.toggleSidebar();
    
    if (sidebarElement) {
        sidebarElement.classList.toggle('collapsed', state.ui.sidebarCollapsed);
        const toggle = sidebarElement.querySelector('.v2-sidebar-toggle');
        if (toggle) {
            toggle.innerHTML = state.ui.sidebarCollapsed ? '▶' : '◀';
        }
    }
}

/**
 * Toggle section expand/collapse
 */
function toggleSection(category) {
    actions.toggleSidebarSection(category);
    refreshSidebar();
}

/**
 * Refresh the entire sidebar
 */
function refreshSidebar() {
    // Find the current sidebar in the DOM
    const currentSidebar = document.querySelector('.v2-project-sidebar');
    if (!currentSidebar || !currentSidebar.parentElement) return;
    
    const parent = currentSidebar.parentElement;
    const newSidebar = createSidebar();
    parent.replaceChild(newSidebar, currentSidebar);
    sidebarElement = newSidebar;
}

/**
 * Refresh just the active state of sidebar items
 */
function refreshSidebarActiveState() {
    if (!sidebarElement) return;
    
    sidebarElement.querySelectorAll('.v2-sidebar-item').forEach(item => {
        const elementId = item.dataset.elementId;
        item.classList.toggle('has-tab', state.ui.openTabs.includes(elementId));
        item.classList.toggle('active', state.ui.activeTab === elementId);
    });
}

// ========== TAB AREA ==========

let tabPaneElement = null;

/**
 * Create the tab area
 */
function createTabArea() {
    const SLUI = getSLUI();
    
    const container = document.createElement('div');
    container.className = 'v2-tab-area';
    
    // Build tabs from state
    const tabs = buildTabsFromState();
    
    if (tabs.length === 0) {
        container.innerHTML = '<div class="v2-no-tabs"><div style="font-size:48px;opacity:0.3;">📂</div><div>Double-click an item to open it</div></div>';
        return container;
    }
    
    // Use SLUI TabPane
    const tabPane = SLUI.TabPane({
        tabs,
        activeTab: state.ui.activeTab,
        closable: true,
        onTabChange: (tabId) => activateTab(tabId),
        onTabClose: (tabId) => handleTabClose(tabId)
    });
    
    tabPaneElement = tabPane;
    container.appendChild(tabPane);
    
    return container;
}

/**
 * Build tabs array from state
 */
function buildTabsFromState() {
    const tabs = [];
    
    state.ui.openTabs.forEach(tabId => {
        if (tabId === MATRIX_TAB_ID) {
            tabs.push({
                id: MATRIX_TAB_ID,
                label: 'Channel Matrix',
                icon: '🔗',
                content: () => createChannelMatrixContent()
            });
        } else {
            const result = findProjectElement(tabId);
            if (result) {
                const element = result.element;
                tabs.push({
                    id: tabId,
                    label: element.label,
                    icon: element.icon,
                    closable: true,  // All tabs are closable - they're just views
                    content: () => createTabContentForElement(tabId)
                });
            }
        }
    });
    
    return tabs;
}

/**
 * Create content for a tab based on element type
 */
function createTabContentForElement(elementId) {
    const result = findProjectElement(elementId);
    if (!result) {
        const div = document.createElement('div');
        div.textContent = 'Element not found';
        return div;
    }
    
    const element = result.element;
    const category = result.category;
    
    if (category === 'code') {
        return createCodeContent(element);
    } else if (category === 'media') {
        return createMediaContent(element);
    } else if (category === 'inputs') {
        return createInputContent(element);
    }
    
    const div = document.createElement('div');
    div.textContent = 'Unknown element type';
    return div;
}

/**
 * Handle tab close
 */
function handleTabClose(tabId) {
    if (tabId === MATRIX_TAB_ID) {
        closeTab(MATRIX_TAB_ID);
        return;
    }
    
    const result = findProjectElement(tabId);
    
    // For code elements, save model before closing
    if (result && result.category === 'code') {
        saveModelToState(tabId);
    }
    
    closeTab(tabId);
}

/**
 * Refresh tabs (rebuild tab area)
 */
function refreshTabs() {
    const mainArea = document.querySelector('.v2-unified-main-area');
    if (!mainArea) return;
    
    const oldTabArea = mainArea.querySelector('.v2-tab-area');
    const newTabArea = createTabArea();
    
    if (oldTabArea) {
        mainArea.replaceChild(newTabArea, oldTabArea);
    } else {
        mainArea.appendChild(newTabArea);
    }
}

// ========== MAIN PANEL ==========

/**
 * Create the unified editor panel content
 */
function createUnifiedEditorContent() {
    const container = document.createElement('div');
    container.className = 'v2-unified-editor';
    
    // Sidebar
    const sidebar = createSidebar();
    container.appendChild(sidebar);
    
    // Main area
    const mainArea = document.createElement('div');
    mainArea.className = 'v2-unified-main-area';
    
    const tabArea = createTabArea();
    mainArea.appendChild(tabArea);
    
    container.appendChild(mainArea);
    
    return container;
}

/**
 * Register the unified editor panel
 */
export function registerUnifiedEditorPanel(SLUI) {
    _SLUI = SLUI;
    
    // Set refresh callbacks for child modules
    setMediaRefreshCallback(refreshTabs);
    setMatrixRefreshCallback(refreshTabs);
    
    SLUI.registerPanel({
        id: 'unified-editor',
        icon: '📝',
        title: 'Editor',
        showInToolbar: true,
        defaultWidth: 800,
        defaultHeight: 600,
        
        createContent: () => {
            const content = createUnifiedEditorContent();
            
            // Open Main tab by default if no tabs open
            if (state.ui.openTabs.length === 0) {
                openTab('Image');
            }
            
            return content;
        }
    });
    
    // Event handlers
    events.on(EVENTS.PROJECT_ELEMENT_CREATED, () => refreshSidebar());
    events.on(EVENTS.PROJECT_ELEMENT_DELETED, () => refreshSidebar());
    
    events.on(EVENTS.SHADER_LOADED, () => {
        refreshSidebar();
        refreshTabs();
    });
    
    events.on(EVENTS.COMPILE_ERROR, ({ tabId, errors }) => {
        if (tabId && errors?.length) {
            showErrorMarkers(tabId, errors);
        }
    });
    
    events.on(EVENTS.COMPILE_SUCCESS, () => {
        state.project.code.forEach(c => clearErrorMarkers(c.id));
    });
    
    events.on('theme-change', () => {
        applyMonacoThemeFromSLUI();
    });
    
    logger.info('UnifiedEditor', 'Init', 'Unified editor panel registered');
}
