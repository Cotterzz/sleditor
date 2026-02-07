/**
 * Code Editor Component - Monaco integration for unified editor
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state } from '../../core/state.js';
import { actions } from '../../core/actions.js';
import { loadMonaco, createMonacoEditor, getFontSizeOptions, setEditorFontSizeIndex } from '../../editor/monaco-loader.js';
import { getSLUI } from '../index.js';

// Monaco models (shared across windows)
const models = new Map();
const modelListeners = new Map();

// Editor instances per window
const windowEditors = new Map();

// Monaco load promise
let monacoReady = null;

/**
 * Ensure Monaco is loaded
 */
export async function ensureMonaco() {
    if (!monacoReady) {
        monacoReady = loadMonaco();
    }
    return monacoReady;
}

/**
 * Get or create a Monaco model for a tab
 */
export function getOrCreateModel(tabId) {
    if (models.has(tabId)) {
        return models.get(tabId);
    }
    
    if (!window.monaco) {
        logger.warn('CodeEditor', 'Model', 'Monaco not loaded');
        return null;
    }
    
    // Get code from state
    const code = state.shader?.code?.[tabId] || '';
    
    // Create model
    const uri = window.monaco.Uri.parse(`inmemory://model/${tabId}.glsl`);
    const model = window.monaco.editor.createModel(code, 'glsl', uri);
    models.set(tabId, model);
    
    // Listen for changes and save to state
    const listener = model.onDidChangeContent(() => {
        saveModelToState(tabId);
        
        // Auto-compile if enabled
        if (state.editor?.autoCompile) {
            events.emit(EVENTS.COMPILE_REQUEST);
        }
    });
    modelListeners.set(tabId, listener);
    
    return model;
}

/**
 * Save model content to state
 */
export function saveModelToState(tabId) {
    const model = models.get(tabId);
    if (model) {
        actions.setShaderCode(tabId, model.getValue());
    }
}

/**
 * Clean up model when tab is closed
 */
export function disposeModel(tabId) {
    const listener = modelListeners.get(tabId);
    if (listener) {
        listener.dispose();
        modelListeners.delete(tabId);
    }
    
    const model = models.get(tabId);
    if (model) {
        model.dispose();
        models.delete(tabId);
    }
    
    windowEditors.delete(tabId);
}

/**
 * Get editor instance for a tab
 */
export function getEditor(tabId) {
    return windowEditors.get(tabId)?.editor;
}

/**
 * Create content for a code tab
 */
export function createCodeContent(element) {
    const container = document.createElement('div');
    container.className = 'v2-code-content';
    container.dataset.elementId = element.id;
    
    // Editor host
    const host = document.createElement('div');
    host.className = 'v2-editor-host';
    
    // Controls bar
    const controls = createEditorControls(element.id);
    host.appendChild(controls);
    
    // Editor wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'v2-editor-wrapper';
    host.appendChild(wrapper);
    
    // Status bar
    const statusBar = createEditorStatusBar(element.id);
    host.appendChild(statusBar);
    
    container.appendChild(host);
    
    // Initialize Monaco
    initMonacoEditor(element.id, wrapper, statusBar);
    
    return container;
}

/**
 * Initialize Monaco editor for a code element
 */
async function initMonacoEditor(elementId, wrapper, statusBar) {
    try {
        await ensureMonaco();
        
        const editor = createMonacoEditor(wrapper, { value: '' });
        if (!editor) {
            wrapper.innerHTML = '<div class="v2-error">Failed to create editor</div>';
            return;
        }
        
        // Store editor reference
        windowEditors.set(elementId, { editor, wrapper });
        
        // Get/create model
        const model = getOrCreateModel(elementId);
        if (model) {
            editor.setModel(model);
        }
        
        // Cursor position
        const lineInfo = statusBar.querySelector('.v2-line-info');
        editor.onDidChangeCursorPosition((e) => {
            if (lineInfo) {
                lineInfo.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
            }
        });
        
        // Ctrl+S to compile
        editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
            saveModelToState(elementId);
            events.emit(EVENTS.COMPILE_REQUEST);
        });
        
        // Layout after mount
        requestAnimationFrame(() => {
            editor.layout();
            editor.focus();
        });
        
    } catch (err) {
        logger.error('CodeEditor', 'Monaco', err.message);
        wrapper.innerHTML = `<div class="v2-error">Failed to load editor: ${err.message}</div>`;
    }
}

/**
 * Create editor controls bar
 */
function createEditorControls(elementId) {
    const SLUI = getSLUI();
    
    const controls = document.createElement('div');
    controls.className = 'v2-editor-controls';
    
    // Compile button
    const compileBtn = SLUI.Button({
        icon: '▶',
        label: 'Compile',
        variant: 'primary',
        size: 'small',
        onClick: () => {
            saveModelToState(elementId);
            events.emit(EVENTS.COMPILE_REQUEST);
        }
    });
    controls.appendChild(compileBtn);
    
    // Auto-compile toggle
    const autoLabel = document.createElement('label');
    autoLabel.className = 'v2-auto-compile';
    const autoCheck = document.createElement('input');
    autoCheck.type = 'checkbox';
    autoCheck.checked = state.editor?.autoCompile || false;
    autoCheck.addEventListener('change', () => {
        actions.setAutoCompile(autoCheck.checked);
    });
    autoLabel.appendChild(autoCheck);
    autoLabel.appendChild(document.createTextNode(' Auto'));
    controls.appendChild(autoLabel);
    
    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    controls.appendChild(spacer);
    
    // Compile status
    const status = document.createElement('span');
    status.className = 'v2-compile-status';
    controls.appendChild(status);
    
    // Status handlers
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
    
    return controls;
}

/**
 * Create editor status bar
 */
function createEditorStatusBar(elementId) {
    const statusBar = document.createElement('div');
    statusBar.className = 'v2-editor-statusbar';
    
    const lineInfo = document.createElement('span');
    lineInfo.className = 'v2-line-info';
    lineInfo.textContent = 'Ln 1, Col 1';
    statusBar.appendChild(lineInfo);
    
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    statusBar.appendChild(spacer);
    
    // Font size control
    const fontContainer = document.createElement('div');
    fontContainer.className = 'v2-font-size-control';
    
    const fontSmall = document.createElement('span');
    fontSmall.textContent = 'A';
    fontSmall.className = 'v2-font-small';
    fontContainer.appendChild(fontSmall);
    
    const fontSlider = document.createElement('input');
    fontSlider.type = 'range';
    fontSlider.min = '0';
    fontSlider.max = '4';
    const fontOpts = getFontSizeOptions();
    fontSlider.value = String(fontOpts.currentIndex);
    fontSlider.addEventListener('input', () => {
        setEditorFontSizeIndex(parseInt(fontSlider.value, 10));
    });
    fontContainer.appendChild(fontSlider);
    
    const fontLarge = document.createElement('span');
    fontLarge.textContent = 'A';
    fontLarge.className = 'v2-font-large';
    fontContainer.appendChild(fontLarge);
    
    statusBar.appendChild(fontContainer);
    
    // Separator
    const sep = document.createElement('span');
    sep.textContent = '│';
    sep.className = 'v2-separator';
    statusBar.appendChild(sep);
    
    // Language indicator
    const lang = document.createElement('span');
    lang.textContent = 'GLSL';
    statusBar.appendChild(lang);
    
    return statusBar;
}

/**
 * Show error markers in the editor
 */
export function showErrorMarkers(tabId, errors) {
    const model = models.get(tabId);
    if (!model || !window.monaco) return;
    
    const markers = errors.map(err => ({
        severity: window.monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: err.line,
        startColumn: 1,
        endLineNumber: err.line,
        endColumn: 1000
    }));
    
    window.monaco.editor.setModelMarkers(model, 'glsl', markers);
}

/**
 * Clear error markers
 */
export function clearErrorMarkers(tabId) {
    const model = models.get(tabId);
    if (!model || !window.monaco) return;
    
    window.monaco.editor.setModelMarkers(model, 'glsl', []);
}
