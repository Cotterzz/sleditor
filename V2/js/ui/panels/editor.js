/**
 * Editor Panel - Multi-window Monaco code editor
 * 
 * Architecture:
 * - GLOBAL models (one per tab, stores undo history)
 * - ONE editor instance PER WINDOW (supports drag-out)
 * - Models are shared, editors are per-window
 * 
 * This supports:
 * - Undo history preserved across tab switches
 * - Drag tab out to new window (each window has its own editor)
 * - Side-by-side editing of different tabs
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state } from '../../core/state.js';
import { loadMonaco, createMonacoEditor, setMonacoTheme, applyMonacoThemeFromSLUI, getFontSizeOptions, setEditorFontSizeIndex } from '../../editor/monaco-loader.js';
import { shaderManager } from '../../managers/ShaderManager.js';
import { getSLUI } from '../index.js';

// ========== GLOBAL STATE ==========

// Persistent Monaco models per tab (Map<tabId, ITextModel>)
// Undo history lives in models, NOT editors
const models = new Map();

// Model change listener disposables (one per model)
const modelListeners = new Map();

// Monaco load promise
let monacoReady = null;

// ========== PER-WINDOW STATE ==========

// Registry of editor instances per window
// Map<windowId, { editor, host, activeTabId, disposables }>
const windowEditors = new Map();

// ========== CONFIGURATION ==========

// No DEFAULT_CODE here - ShaderManager is the single source of truth
// Editor reads from state.shader.code which is populated by ShaderManager.ensureDefaults()

// Reference to SLUI for dynamic tab updates
let _SLUI = null;

/**
 * Get current tab configuration based on state
 */
function getCurrentTabs() {
    const tabs = [];
    
    // Image is always first and not closable
    tabs.push({ id: 'Image', label: 'Image', icon: '🖼️', closable: false });
    
    // Common if it has content or is in active tabs
    if (state.shader.code?.Common?.trim() || state.shader.activeTabs?.includes('Common')) {
        tabs.push({ id: 'Common', label: 'Common', icon: '📦', closable: true });
    }
    
    // Buffers in alphabetical order
    const bufferIds = ['BufferA', 'BufferB', 'BufferC', 'BufferD', 'BufferE', 'BufferF'];
    for (const bufferId of bufferIds) {
        if (state.shader.code?.[bufferId]?.trim() || state.shader.activeTabs?.includes(bufferId)) {
            tabs.push({ 
                id: bufferId, 
                label: bufferId.replace('Buffer', 'Buf '), 
                icon: '📋', 
                closable: true 
            });
        }
    }
    
    return tabs;
}

// ========== MODEL MANAGEMENT (GLOBAL) ==========

/**
 * Get or create a Monaco model for a tab
 * Models are SHARED across all editor instances
 * 
 * Code comes from state.shader.code (populated by ShaderManager.ensureDefaults)
 */
function getOrCreateModel(tabId) {
    if (!window.monaco) return null;
    
    if (models.has(tabId)) {
        return models.get(tabId);
    }
    
    // Code from state only - ShaderManager.ensureDefaults() must have run first
    const code = state.shader?.code?.[tabId] || '';
    
    // Create model (undo history lives here)
    const model = window.monaco.editor.createModel(code, 'glsl');
    models.set(tabId, model);
    
    // Set up change listener (once per model, syncs to state)
    if (!modelListeners.has(tabId)) {
        const disposable = model.onDidChangeContent(() => {
            const newCode = model.getValue();
            if (!state.shader.code) state.shader.code = {};
            state.shader.code[tabId] = newCode;
            state.shader.isDirty = true;
            
            if (state.editor?.autoCompile) {
                events.emit(EVENTS.EDITOR_CODE_CHANGED, { tabId, code: newCode });
            }
        });
        modelListeners.set(tabId, disposable);
    }
    
    logger.debug('Editor', 'Model', `Created model: ${tabId}`);
    return model;
}

/**
 * Save a model's content to state
 */
function saveModelToState(tabId) {
    const model = models.get(tabId);
    if (model) {
        state.shader.code[tabId] = model.getValue();
    }
}

/**
 * Ensure Monaco is loaded
 */
async function ensureMonaco() {
    if (monacoReady) return monacoReady;
    monacoReady = loadMonaco();
    return monacoReady;
}

// ========== EDITOR INSTANCE MANAGEMENT (PER-WINDOW) ==========

/**
 * Create an editor instance for a window
 * Called when a new editor window is opened or a tab is dragged out
 */
async function createEditorForWindow(windowId, container) {
    await ensureMonaco();
    
    // Check if we already have an editor for this window
    if (windowEditors.has(windowId)) {
        const existing = windowEditors.get(windowId);
        // Move existing host to new container if needed
        if (existing.host.parentElement !== container) {
            container.appendChild(existing.host);
            existing.editor.layout();
        }
        return existing;
    }
    
    // Create the editor host (controls + Monaco + status bar)
    const host = createEditorHost(windowId);
    container.appendChild(host);
    
    // Create Monaco editor instance
    const editorWrapper = host.querySelector('.v2-editor-wrapper');
    const editor = createMonacoEditor(editorWrapper, { value: '' });
    
    if (!editor) {
        logger.error('Editor', 'Create', `Failed to create editor for window ${windowId}`);
        return null;
    }
    
    // Set up cursor position display
    const lineInfo = host.querySelector('.v2-line-info');
    editor.onDidChangeCursorPosition((e) => {
        if (lineInfo) {
            lineInfo.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
        }
    });
    
    // Focus on click
    editorWrapper.addEventListener('click', () => editor.focus());
    
    // Ctrl+S to compile
    editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
        const data = windowEditors.get(windowId);
        if (data?.activeTabId) {
            saveModelToState(data.activeTabId);
        }
        events.emit(EVENTS.COMPILE_REQUEST);
    });
    
    // Store in registry
    const windowData = {
        editor,
        host,
        activeTabId: null,
        disposables: []
    };
    windowEditors.set(windowId, windowData);
    
    logger.info('Editor', 'Window', `Created editor for window: ${windowId}`);
    return windowData;
}

/**
 * Show a specific tab in a window's editor
 */
function showTabInWindow(windowId, tabId) {
    const data = windowEditors.get(windowId);
    if (!data || !data.editor) {
        logger.warn('Editor', 'ShowTab', `No editor for window ${windowId}`);
        return;
    }
    
    // Save current tab first
    if (data.activeTabId && data.activeTabId !== tabId) {
        saveModelToState(data.activeTabId);
    }
    
    // Get or create the model
    const model = getOrCreateModel(tabId);
    if (!model) {
        logger.error('Editor', 'ShowTab', `Failed to get model for ${tabId}`);
        return;
    }
    
    // Switch to new model
    data.editor.setModel(model);
    data.activeTabId = tabId;
    
    // Clear markers
    window.monaco.editor.setModelMarkers(model, 'glsl', []);
    
    // Ensure layout is correct
    requestAnimationFrame(() => {
        data.editor.layout();
        data.editor.focus();
    });
    
    logger.debug('Editor', 'ShowTab', `Window ${windowId} showing ${tabId}`);
}

/**
 * Dispose of an editor instance when window closes
 */
function disposeEditorForWindow(windowId) {
    const data = windowEditors.get(windowId);
    if (!data) return;
    
    // Save current state
    if (data.activeTabId) {
        saveModelToState(data.activeTabId);
    }
    
    // Dispose editor (NOT the model - models are shared)
    data.editor.dispose();
    
    // Clean up host
    if (data.host.parentElement) {
        data.host.remove();
    }
    
    // Dispose any additional disposables
    data.disposables.forEach(d => d.dispose());
    
    windowEditors.delete(windowId);
    logger.info('Editor', 'Window', `Disposed editor for window: ${windowId}`);
}

/**
 * Create the editor host DOM (controls bar + wrapper + status bar)
 */
function createEditorHost(windowId) {
    const host = document.createElement('div');
    host.className = 'v2-editor-host';
    host.dataset.windowId = windowId;
    host.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
    `;
    
    // Controls bar
    const controlsBar = document.createElement('div');
    controlsBar.className = 'v2-editor-controls';
    controlsBar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: var(--bg-tertiary, #252526);
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
        flex-shrink: 0;
    `;
    
    // Compile button
    const SLUI = getSLUI();
    const compileBtn = SLUI.Button({
        icon: '▶',
        label: 'Compile',
        variant: 'primary',
        size: 'small',
        tooltip: 'Compile shader (Ctrl+S)',
        onClick: () => {
            const data = windowEditors.get(windowId);
            if (data?.activeTabId) {
                saveModelToState(data.activeTabId);
            }
            logger.info('Editor', 'Compile', 'Manual compile');
            events.emit(EVENTS.COMPILE_REQUEST);
        }
    });
    controlsBar.appendChild(compileBtn);
    
    // Auto-compile toggle
    const autoLabel = document.createElement('label');
    autoLabel.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-muted, #8b949e);
        cursor: pointer;
    `;
    
    const autoCheck = document.createElement('input');
    autoCheck.type = 'checkbox';
    autoCheck.checked = state.editor?.autoCompile || false;
    autoCheck.addEventListener('change', () => {
        state.editor.autoCompile = autoCheck.checked;
        logger.info('Editor', 'AutoCompile', autoCheck.checked ? 'ON' : 'OFF');
    });
    autoLabel.appendChild(autoCheck);
    autoLabel.appendChild(document.createTextNode('Auto'));
    controlsBar.appendChild(autoLabel);
    
    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    controlsBar.appendChild(spacer);
    
    // Compile status
    const status = document.createElement('span');
    status.className = 'v2-compile-status';
    status.style.cssText = 'font-size: 11px; color: var(--text-muted);';
    controlsBar.appendChild(status);
    
    // Status event handlers (shared across all windows)
    const onSuccess = () => {
        status.textContent = '✓ Compiled';
        status.style.color = 'var(--console-success, #3fb950)';
        setTimeout(() => { status.textContent = ''; }, 2000);
    };
    const onError = () => {
        status.textContent = '✗ Error';
        status.style.color = 'var(--console-error, #f85149)';
    };
    events.on(EVENTS.COMPILE_SUCCESS, onSuccess);
    events.on(EVENTS.COMPILE_ERROR, onError);
    
    host.appendChild(controlsBar);
    
    // Editor wrapper (Monaco goes here)
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'v2-editor-wrapper';
    editorWrapper.style.cssText = `
        flex: 1;
        position: relative;
        min-height: 0;
        overflow: hidden;
    `;
    host.appendChild(editorWrapper);
    
    // Status bar
    const statusBar = document.createElement('div');
    statusBar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 10px;
        background: var(--bg-tertiary, #252526);
        border-top: 1px solid var(--border, rgba(255,255,255,0.1));
        font-size: 11px;
        color: var(--text-muted);
        font-family: 'JetBrains Mono', monospace;
        flex-shrink: 0;
    `;
    
    const lineInfo = document.createElement('span');
    lineInfo.className = 'v2-line-info';
    lineInfo.textContent = 'Ln 1, Col 1';
    statusBar.appendChild(lineInfo);
    
    const barSpacer = document.createElement('div');
    barSpacer.style.flex = '1';
    statusBar.appendChild(barSpacer);
    
    // Font size slider (5 levels: 10, 12, 13, 14, 16)
    const fontSizeContainer = document.createElement('div');
    fontSizeContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
    `;
    
    const fontSizeLabel = document.createElement('span');
    fontSizeLabel.textContent = 'A';
    fontSizeLabel.style.cssText = 'font-size: 9px; opacity: 0.7;';
    fontSizeContainer.appendChild(fontSizeLabel);
    
    const fontSizeSlider = document.createElement('input');
    fontSizeSlider.type = 'range';
    fontSizeSlider.min = '0';
    fontSizeSlider.max = '4';
    const fontOpts = getFontSizeOptions();
    fontSizeSlider.value = String(fontOpts.currentIndex);
    fontSizeSlider.title = `Font size: ${fontOpts.current}px`;
    fontSizeSlider.style.cssText = `
        width: 50px;
        height: 4px;
        cursor: pointer;
        accent-color: var(--accent, #58a6ff);
    `;
    fontSizeSlider.addEventListener('input', () => {
        const newSize = setEditorFontSizeIndex(parseInt(fontSizeSlider.value, 10));
        fontSizeSlider.title = `Font size: ${newSize}px`;
        fontSizeLabelLarge.style.opacity = fontSizeSlider.value === '4' ? '1' : '0.7';
        fontSizeLabel.style.opacity = fontSizeSlider.value === '0' ? '1' : '0.7';
    });
    fontSizeContainer.appendChild(fontSizeSlider);
    
    const fontSizeLabelLarge = document.createElement('span');
    fontSizeLabelLarge.textContent = 'A';
    fontSizeLabelLarge.style.cssText = 'font-size: 13px; opacity: 0.7;';
    fontSizeContainer.appendChild(fontSizeLabelLarge);
    
    statusBar.appendChild(fontSizeContainer);
    
    // Separator
    const separator = document.createElement('span');
    separator.style.cssText = 'color: var(--border); margin: 0 4px;';
    separator.textContent = '│';
    statusBar.appendChild(separator);
    
    const langInfo = document.createElement('span');
    langInfo.textContent = 'GLSL';
    statusBar.appendChild(langInfo);
    
    host.appendChild(statusBar);
    
    return host;
}

// ========== PANEL REGISTRATION ==========

/**
 * Register the editor panel with SLUI
 */
export function registerEditorPanel(SLUI) {
    _SLUI = SLUI;
    
    SLUI.registerPanel({
        id: 'editor',
        icon: '<img src="/ui-system/icons/code32.png" srcset="/ui-system/icons/code64.png 2x" width="24" height="24" alt="Editor">',
        title: 'Editor',
        showInToolbar: true,
        tabbed: true,
        tabGroup: 'editor',
        tabs: () => getCurrentTabs().map(tab => ({
            ...tab,
            content: () => createTabContent(tab.id)
        })),
        // Custom tab bar addon: Add Tab button
        tabBarAddon: () => createAddTabButton(),
        // Hook for when tab is closed
        onTabClose: (tabId) => {
            handleTabClose(tabId);
        },
        // Hook for when window is created (including drag-out)
        onWindowCreated: (windowId) => {
            logger.debug('Editor', 'Hook', `Window created: ${windowId}`);
        },
        // Hook for when window is closed
        onWindowClosed: (windowId) => {
            disposeEditorForWindow(windowId);
        }
    });
    
    // Listen for shader loaded
    events.on(EVENTS.SHADER_LOADED, (data) => {
        if (data.code) {
            Object.entries(data.code).forEach(([tabId, code]) => {
                setEditorCode(tabId, code);
            });
        }
    });
    
    // Note: TAB_ADDED and TAB_REMOVED are now handled directly in handleAddTab
    // via addTabToEditorWindow, so we don't need these listeners anymore
    
    // Error markers
    events.on(EVENTS.COMPILE_ERROR, (data) => {
        if (data.errors?.length > 0) {
            showErrorMarkers('Image', data.errors);
        }
    });
    
    events.on(EVENTS.COMPILE_SUCCESS, () => {
        clearErrorMarkers('Image');
    });
    
    // Theme changes - listen for SLUI theme-change event
    if (SLUI.on) {
        SLUI.on('theme-change', (data) => {
            const themeName = data?.theme || '';
            // Use new theme-aware Monaco theming from SLUI theme data
            applyMonacoThemeFromSLUI(themeName);
        });
    }
    
    logger.info('UI', 'Editor', 'Editor panel registered');
}

/**
 * Create the "Add Tab" dropdown button
 */
function createAddTabButton() {
    const container = document.createElement('div');
    container.className = 'v2-add-tab-container';
    container.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        margin-left: 4px;
    `;
    
    const btn = document.createElement('button');
    btn.className = 'v2-add-tab-btn';
    btn.textContent = '+';
    btn.title = 'Add tab';
    btn.style.cssText = `
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-muted, #8b949e);
        font-size: 16px;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    btn.addEventListener('mouseenter', () => {
        btn.style.background = 'var(--bg-hover, rgba(255,255,255,0.1))';
        btn.style.color = 'var(--text-primary, #e6edf3)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted, #8b949e)';
    });
    
    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'v2-add-tab-dropdown';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        background: var(--bg-secondary, #161b22);
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        border-radius: 6px;
        padding: 4px 0;
        min-width: 140px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        z-index: 1000;
        display: none;
    `;
    
    // Menu items
    const menuItems = [
        { id: 'buffer', label: '📋 Buffer', desc: 'New render pass' },
        { id: 'common', label: '📦 Common', desc: 'Shared code' },
        { id: 'sound', label: '🔊 Sound', desc: 'Audio output', disabled: true }
    ];
    
    for (const item of menuItems) {
        const menuItem = document.createElement('button');
        menuItem.className = 'v2-dropdown-item';
        menuItem.setAttribute('role', 'menuitem');
        menuItem.setAttribute('aria-label', item.label);
        menuItem.disabled = item.disabled || false;
        menuItem.style.cssText = `
            padding: 8px 12px;
            cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
            opacity: ${item.disabled ? '0.5' : '1'};
            display: flex;
            flex-direction: column;
            gap: 2px;
            background: transparent;
            border: none;
            width: 100%;
            text-align: left;
        `;
        
        const label = document.createElement('span');
        label.textContent = item.label;
        label.style.cssText = 'font-size: 13px; color: var(--text-primary, #e6edf3);';
        menuItem.appendChild(label);
        
        const desc = document.createElement('span');
        desc.textContent = item.desc;
        desc.style.cssText = 'font-size: 11px; color: var(--text-muted, #8b949e);';
        menuItem.appendChild(desc);
        
        if (!item.disabled) {
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = 'var(--bg-hover, rgba(255,255,255,0.1))';
            });
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.style.display = 'none';
                handleAddTab(item.id);
            });
        }
        
        dropdown.appendChild(menuItem);
    }
    
    container.appendChild(btn);
    container.appendChild(dropdown);
    
    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close on outside click
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });
    
    return container;
}

/**
 * Handle adding a new tab
 */
function handleAddTab(type) {
    let tabId = null;
    let tabLabel = '';
    let tabIcon = '';
    
    if (type === 'buffer') {
        tabId = shaderManager.addBuffer();
        if (tabId) {
            tabLabel = tabId.replace('Buffer', 'Buf ');
            tabIcon = '📋';
            logger.info('Editor', 'AddTab', `Added ${tabId}`);
        }
    } else if (type === 'common') {
        tabId = shaderManager.addCommon();
        tabLabel = 'Common';
        tabIcon = '📦';
        logger.info('Editor', 'AddTab', 'Added Common');
    }
    // 'sound' is disabled for now
    
    if (!tabId) return;
    
    // Directly add tab to the SLUI window
    addTabToEditorWindow(tabId, tabLabel, tabIcon);
}

/**
 * Add a tab directly to the editor window's TabPane
 */
function addTabToEditorWindow(tabId, label, icon) {
    // Find the editor window container
    const container = document.getElementById('sl-window-container-editor');
    if (!container) {
        logger.warn('Editor', 'AddTab', 'Editor window not found');
        return;
    }
    
    // Get the TabPane via the container's API
    const tabPane = container.getTabPane?.();
    if (!tabPane) {
        logger.warn('Editor', 'AddTab', 'TabPane not found');
        return;
    }
    
    // Check if tab already exists
    const existing = tabPane.getTab?.(tabId);
    if (existing) {
        // Just activate it
        tabPane.setActiveTab(tabId);
        return;
    }
    
    // Add the tab
    tabPane.addTab({
        id: tabId,
        label: label,
        icon: icon,
        closable: true,
        content: () => createTabContent(tabId)
    }, true); // true = activate immediately
    
    logger.debug('Editor', 'AddTab', `Tab ${tabId} added to window`);
}

/**
 * Handle closing a tab
 */
function handleTabClose(tabId) {
    if (tabId === 'Image') {
        logger.warn('Editor', 'Close', 'Cannot close Image tab');
        return false; // Prevent close
    }
    
    if (tabId === 'Common') {
        // Clear common code
        state.shader.code.Common = '';
        const idx = state.shader.activeTabs?.indexOf('Common');
        if (idx !== -1) state.shader.activeTabs.splice(idx, 1);
    } else if (tabId.startsWith('Buffer')) {
        shaderManager.removeBuffer(tabId);
    }
    
    return true; // Allow close
}

/**
 * Refresh editor tabs (after add/remove)
 * Note: For adding tabs, we now use addTabToEditorWindow directly
 */
function refreshEditorTabs() {
    // This is now a no-op as we add/remove tabs directly
    logger.debug('Editor', 'Refresh', 'Tab refresh requested');
}

/**
 * Detect which window a DOM element is in
 */
function detectWindowId(element) {
    let el = element;
    while (el) {
        if (el.dataset?.windowId) {
            return el.dataset.windowId;
        }
        if (el.classList?.contains('sl-window-container')) {
            return el.dataset.windowId || el.id?.replace('sl-window-container-', '') || 'editor';
        }
        el = el.parentElement;
    }
    return 'editor'; // Default fallback
}

/**
 * Create content for a tab
 * This is called when a tab is activated or when a new window receives a tab
 * Window ID is detected from DOM context after mounting
 */
function createTabContent(tabId) {
    const container = document.createElement('div');
    container.className = 'v2-editor-tab-container';
    container.style.cssText = 'height: 100%; display: flex; flex-direction: column;';
    container.dataset.tabId = tabId;
    
    // Use MutationObserver to detect when we're mounted, then find our window
    const initEditor = () => {
        if (!container.isConnected) return;
        
        const windowId = detectWindowId(container);
        container.dataset.windowId = windowId;
        
        logger.debug('Editor', 'Init', `Tab ${tabId} in window ${windowId}`);
        
        // Initialize editor for this window (async)
        createEditorForWindow(windowId, container).then((data) => {
            if (data) {
                showTabInWindow(windowId, tabId);
            }
        }).catch(err => {
            logger.error('Editor', 'Init', err.message);
            container.innerHTML = `<div style="padding: 20px; color: var(--console-error);">Failed to load editor: ${err.message}</div>`;
        });
    };
    
    // Try immediately
    requestAnimationFrame(() => {
        if (container.isConnected) {
            initEditor();
        } else {
            // Wait for mount
            const observer = new MutationObserver(() => {
                if (container.isConnected) {
                    observer.disconnect();
                    initEditor();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    });
    
    return container;
}

// ========== PUBLIC API ==========

/**
 * Set code for a tab (updates model if it exists)
 */
export function setEditorCode(tabId, code) {
    if (!state.shader.code) state.shader.code = {};
    state.shader.code[tabId] = code;
    
    const model = models.get(tabId);
    if (model) {
        model.setValue(code);
    }
}

/**
 * Get code from a tab
 */
export function getEditorCode(tabId = 'Image') {
    const model = models.get(tabId);
    if (model) {
        return model.getValue();
    }
    return state.shader?.code?.[tabId] || '';
}

/**
 * Get editor instance for a window
 */
export function getEditorForWindow(windowId = 'editor') {
    return windowEditors.get(windowId)?.editor || null;
}

/**
 * Get the primary/default editor
 */
export function getEditor() {
    // Return the first available editor (for backwards compatibility)
    for (const [, data] of windowEditors) {
        if (data.editor) return data.editor;
    }
    return null;
}

// ========== ERROR MARKERS ==========

const decorationIds = new Map();

export function showErrorMarkers(tabId, errors) {
    const model = models.get(tabId);
    if (!model || !window.monaco) return;
    
    const markers = errors.map(err => ({
        severity: window.monaco.MarkerSeverity.Error,
        startLineNumber: err.line,
        startColumn: 1,
        endLineNumber: err.line,
        endColumn: model.getLineMaxColumn(err.line) || 1000,
        message: err.message,
        source: 'GLSL Compiler'
    }));
    
    window.monaco.editor.setModelMarkers(model, 'glsl', markers);
    
    // Add line decorations to all editors showing this tab
    for (const [windowId, data] of windowEditors) {
        if (data.activeTabId === tabId && data.editor) {
            const decorations = errors.map(err => ({
                range: new window.monaco.Range(err.line, 1, err.line, 1),
                options: {
                    isWholeLine: true,
                    className: 'v2-error-line',
                    overviewRuler: { color: '#f85149', position: 4 }
                }
            }));
            
            const key = `${windowId}:${tabId}`;
            const oldIds = decorationIds.get(key) || [];
            const newIds = data.editor.deltaDecorations(oldIds, decorations);
            decorationIds.set(key, newIds);
            
            if (errors.length > 0 && errors[0].line > 0) {
                data.editor.revealLineInCenter(errors[0].line);
            }
        }
    }
}

export function clearErrorMarkers(tabId) {
    const model = models.get(tabId);
    if (model && window.monaco) {
        window.monaco.editor.setModelMarkers(model, 'glsl', []);
    }
    
    // Clear decorations in all windows showing this tab
    for (const [windowId, data] of windowEditors) {
        if (data.activeTabId === tabId && data.editor) {
            const key = `${windowId}:${tabId}`;
            const oldIds = decorationIds.get(key) || [];
            data.editor.deltaDecorations(oldIds, []);
            decorationIds.set(key, []);
        }
    }
}

// ========== SLUI INTEGRATION HOOKS ==========

/**
 * Called by SLUI when a tab is dragged out to a new window
 * This allows us to create a new editor instance for the new window
 */
export function onTabDraggedToWindow(tabId, newWindowId, container) {
    logger.info('Editor', 'DragOut', `Tab ${tabId} dragged to window ${newWindowId}`);
    
    createEditorForWindow(newWindowId, container).then((data) => {
        if (data) {
            showTabInWindow(newWindowId, tabId);
        }
    });
}

/**
 * Called when a window containing editor tabs is closed
 */
export function onEditorWindowClosed(windowId) {
    disposeEditorForWindow(windowId);
}

export default {
    registerEditorPanel,
    getEditor,
    getEditorForWindow,
    setEditorCode,
    getEditorCode,
    showErrorMarkers,
    clearErrorMarkers,
    onTabDraggedToWindow,
    onEditorWindowClosed
};
