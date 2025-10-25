// ============================================================================
// Vim Mode - Monaco Vim Integration
// ============================================================================

import { state, logStatus, saveSettings } from './core.js';

// ============================================================================
// Vim Library Loading
// ============================================================================

export async function loadVimLibrary() {
    return new Promise((resolve) => {
        // Load monaco-vim asynchronously
        // This uses a workaround for AMD/require conflicts
        (async function() {
            try {
                // Save current AMD/require context
                const tempRequire = window.require;
                const tempDefine = window.define;
                
                // Temporarily remove AMD/require to allow monaco-vim to load
                // Note: Can't use delete in strict mode, so we set to undefined
                window.require = undefined;
                window.define = undefined;
                
                try {
                    // Load the monaco-vim library
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/monaco-vim@0.4.0/dist/monaco-vim.js';
                    script.onload = () => {
                        // Restore AMD/require
                        window.require = tempRequire;
                        window.define = tempDefine;
                        
                        // Check if MonacoVim exists
                        if (window.MonacoVim && typeof window.MonacoVim === 'object') {
                            // Try to get initVimMode from default export or named export
                            const vimExport = window.MonacoVim.default || window.MonacoVim;
                            
                            if (typeof vimExport.initVimMode === 'function') {
                                window.MonacoVim = vimExport;
                                resolve(true);
                            } else {
                                console.error('MonacoVim module found but initVimMode not available');
                                resolve(false);
                            }
                        } else if (typeof window.initVimMode === 'function') {
                            // Fallback: global initVimMode
                            window.MonacoVim = { initVimMode: window.initVimMode };
                            resolve(true);
                        } else {
                            console.error('MonacoVim not found - vim mode will not be available');
                            resolve(false);
                        }
                    };
                    script.onerror = () => {
                        window.require = tempRequire;
                        window.define = tempDefine;
                        console.error('Failed to load monaco-vim script');
                        resolve(false);
                    };
                    document.head.appendChild(script);
                    
                    // Restore AMD/require immediately after appending the script
                    // This minimizes the time Monaco is without its AMD loader
                    setTimeout(() => {
                        window.require = tempRequire;
                        window.define = tempDefine;
                    }, 100);
                } catch (innerErr) {
                    // Restore on error
                    window.require = tempRequire;
                    window.define = tempDefine;
                    throw innerErr;
                }
            } catch (err) {
                console.error('Failed to load monaco-vim:', err);
                resolve(false);
            }
        })();
    });
}

// ============================================================================
// Apply/Toggle Vim Mode
// ============================================================================

export function toggleVimMode() {
    state.isVimMode = !state.isVimMode;
    saveSettings({ isVimMode: state.isVimMode });
    applyVimMode();
}

export function applyVimMode() {
    const vimStatusBar = document.getElementById('vim-status');
    
    // Remove existing vim mode from all editors
    state.vimStatusNodes.forEach(statusNode => {
        if (statusNode && statusNode.dispose) {
            statusNode.dispose();
        }
    });
    state.vimStatusNodes = [];
    
    // Clear any content in the status bar before reapplying
    if (vimStatusBar) {
        vimStatusBar.textContent = '';
    }
    
    if (state.isVimMode) {
        // User wants vim mode enabled
        if (!window.MonacoVim) {
            console.warn('MonacoVim not loaded yet');
            logStatus('⚠ Vim library not loaded, browser refresh may be required', 'error');
            // Hide status bar if vim not loaded
            if (vimStatusBar) vimStatusBar.style.display = 'none';
            return;
        }
        
        // Enable vim mode on all editors (except read-only ones)
        const editors = [
            state.graphicsEditor,
            state.audioEditor,
            state.jsEditor
        ];
        
        editors.forEach(editor => {
            if (editor) {
                try {
                    const statusNode = window.MonacoVim.initVimMode(editor, vimStatusBar);
                    state.vimStatusNodes.push(statusNode);
                } catch (e) {
                    console.error('Failed to init vim mode:', e);
                }
            }
        });
        
        // Show vim status bar
        if (vimStatusBar) vimStatusBar.style.display = 'block';
        
        logStatus('✓ Vim mode enabled');
    } else {
        // User wants vim mode disabled
        // Hide vim status bar (works even if MonacoVim isn't loaded)
        if (vimStatusBar) vimStatusBar.style.display = 'none';
        
        logStatus('✓ Vim mode disabled');
    }
}

// ============================================================================
// Re-apply Vim Mode (after editors change)
// ============================================================================

export function reapplyVimMode() {
    // Always call applyVimMode - it will handle the MonacoVim check internally
    // based on whether vim mode is enabled or disabled
    applyVimMode();
}

