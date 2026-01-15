/**
 * Theme Editor Component for SLUI
 * 
 * A comprehensive theme editor that:
 * - Lists all theme properties (colors, fonts, effects)
 * - Allows live editing of the current theme
 * - Exports themes as JSON for saving
 * - Supports creating new themes from existing ones
 * - Font browser with Google Fonts integration
 */

import { state } from '../core/state.js';
import { setTheme, getTheme, getThemes } from '../core/theme.js';

// Google Fonts API for font discovery
const GOOGLE_FONTS_API = 'https://www.googleapis.com/webfonts/v1/webfonts';
const GOOGLE_FONTS_KEY = 'AIzaSyBwIX97bVWr3-6AIUvGkcNnmFgirefZ6Sw'; // Free tier key

// Popular coding fonts
const CODING_FONTS = [
    'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Cascadia Code',
    'IBM Plex Mono', 'Roboto Mono', 'Ubuntu Mono', 'Inconsolata',
    'Hack', 'Consolas', 'Monaco', 'Menlo', 'SF Mono'
];

// Popular UI fonts
const UI_FONTS = [
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Nunito',
    'Source Sans Pro', 'Work Sans', 'DM Sans', 'IBM Plex Sans',
    'Noto Sans', 'Segoe UI', 'SF Pro Display', 'Helvetica Neue'
];

// Color property categories for organization
const COLOR_CATEGORIES = {
    'Backgrounds': ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-panel', 'bg-hover', 'bg-active'],
    'Text': ['text-primary', 'text-secondary', 'text-muted', 'text-inverse'],
    'Accent': ['accent', 'accent-hover', 'accent-active'],
    'Borders': ['border', 'border-focus'],
    'Status': ['success', 'warning', 'error', 'info'],
    'UI Elements': ['toolbar-bg', 'window-header', 'scrollbar', 'scrollbar-thumb'],
    'Other': ['shadow', 'overlay']
};

// Editor-specific colors (optional, some themes have them)
const EDITOR_COLORS = ['editor-bg', 'editor-text', 'editor-gutter', 'editor-line-highlight'];

/**
 * Create a color swatch with picker
 */
function createColorEditor(key, value, onChange) {
    const container = document.createElement('div');
    container.className = 'te-color-row';
    container.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
    `;
    
    // Color swatch / input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = parseColorToHex(value);
    colorInput.style.cssText = `
        width: 32px;
        height: 24px;
        border: 1px solid #444;
        border-radius: 4px;
        cursor: pointer;
        background: none;
        padding: 0;
    `;
    colorInput.addEventListener('input', (e) => {
        textInput.value = e.target.value;
        onChange(key, e.target.value);
    });
    
    // Property name
    const label = document.createElement('span');
    label.textContent = key;
    label.style.cssText = `
        flex: 1;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #ccc;
    `;
    
    // Text input for direct value entry
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = value;
    textInput.style.cssText = `
        width: 120px;
        padding: 4px 8px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #ccc;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
    `;
    textInput.addEventListener('input', (e) => {
        const hex = parseColorToHex(e.target.value);
        if (hex) colorInput.value = hex;
        onChange(key, e.target.value);
    });
    
    container.appendChild(colorInput);
    container.appendChild(label);
    container.appendChild(textInput);
    
    return container;
}

/**
 * Parse any color format to hex (best effort)
 */
function parseColorToHex(color) {
    if (!color) return '#000000';
    
    // Already hex
    if (color.startsWith('#')) {
        if (color.length === 4) {
            // Short hex #rgb -> #rrggbb
            return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
        }
        return color.slice(0, 7); // Trim alpha if present
    }
    
    // rgba/rgb
    const match = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    
    return '#000000';
}

/**
 * Create a text input editor for effects
 */
function createTextEditor(key, value, onChange) {
    const container = document.createElement('div');
    container.className = 'te-text-row';
    container.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
    `;
    
    const label = document.createElement('span');
    label.textContent = key;
    label.style.cssText = `
        min-width: 100px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #ccc;
    `;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.cssText = `
        flex: 1;
        padding: 4px 8px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #ccc;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
    `;
    input.addEventListener('input', (e) => {
        onChange(key, e.target.value);
    });
    
    container.appendChild(label);
    container.appendChild(input);
    
    return container;
}

/**
 * Create a font selector with preview and Google Fonts integration
 */
function createFontEditor(key, value, onChange, onBrowseFonts) {
    const container = document.createElement('div');
    container.className = 'te-font-row';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 0;
        border-bottom: 1px solid #2a2a2a;
    `;
    
    // Header row
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const label = document.createElement('span');
    label.textContent = key.charAt(0).toUpperCase() + key.slice(1) + ' Font';
    label.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #aaa;
        min-width: 80px;
    `;
    
    const browseBtn = document.createElement('button');
    browseBtn.textContent = '🔍 Browse';
    browseBtn.style.cssText = `
        padding: 2px 8px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 4px;
        color: #ccc;
        font-size: 10px;
        cursor: pointer;
    `;
    browseBtn.addEventListener('click', () => onBrowseFonts(key));
    
    header.appendChild(label);
    header.appendChild(browseBtn);
    
    // Font stack input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.cssText = `
        width: 100%;
        padding: 6px 8px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #ccc;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
    `;
    input.addEventListener('input', (e) => {
        preview.style.fontFamily = e.target.value;
        onChange(key, e.target.value);
    });
    
    // Preview
    const preview = document.createElement('div');
    preview.textContent = 'The quick brown fox jumps over the lazy dog. 0123456789';
    preview.style.cssText = `
        padding: 8px;
        background: #0d0d0d;
        border-radius: 4px;
        font-family: ${value};
        font-size: 14px;
        color: #e0e0e0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;
    
    container.appendChild(header);
    container.appendChild(input);
    container.appendChild(preview);
    
    return container;
}

/**
 * Create a collapsible section
 */
function createSection(title, collapsed = false) {
    const section = document.createElement('div');
    section.className = 'te-section';
    section.style.cssText = `
        margin-bottom: 8px;
        border: 1px solid #333;
        border-radius: 6px;
        overflow: hidden;
    `;
    
    const header = document.createElement('div');
    header.className = 'te-section-header';
    header.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #1a1a1a;
        cursor: pointer;
        user-select: none;
    `;
    
    const arrow = document.createElement('span');
    arrow.textContent = collapsed ? '▶' : '▼';
    arrow.style.cssText = `
        font-size: 10px;
        color: #888;
        transition: transform 0.15s ease;
    `;
    
    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #ccc;
    `;
    
    header.appendChild(arrow);
    header.appendChild(titleEl);
    
    const content = document.createElement('div');
    content.className = 'te-section-content';
    content.style.cssText = `
        padding: 8px 12px;
        background: #0d0d0d;
        display: ${collapsed ? 'none' : 'block'};
    `;
    
    header.addEventListener('click', () => {
        const isCollapsed = content.style.display === 'none';
        content.style.display = isCollapsed ? 'block' : 'none';
        arrow.textContent = isCollapsed ? '▼' : '▶';
    });
    
    section.appendChild(header);
    section.appendChild(content);
    
    return { section, content };
}

/**
 * Create the Theme Editor component
 */
export function ThemeEditor(options = {}) {
    const { container } = options;
    
    // Working copy of theme being edited
    let editingTheme = null;
    let editingThemeName = null;
    let isDirty = false;
    
    // Create main container - fixed dark styling for editor itself
    const wrapper = document.createElement('div');
    wrapper.className = 'slui-theme-editor';
    wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        color: #ccc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
    `;
    
    // ========== TOOLBAR ==========
    const toolbar = document.createElement('div');
    toolbar.className = 'te-toolbar';
    toolbar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
        flex-wrap: wrap;
    `;
    
    // Theme selector
    const themeSelect = document.createElement('select');
    themeSelect.style.cssText = `
        padding: 6px 10px;
        background: #0d0d0d;
        border: 1px solid #444;
        border-radius: 4px;
        color: #ccc;
        font-size: 12px;
        cursor: pointer;
        min-width: 140px;
    `;
    
    // Duplicate button
    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📋 Duplicate';
    duplicateBtn.title = 'Create a copy of this theme';
    duplicateBtn.style.cssText = `
        padding: 6px 12px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 4px;
        color: #ccc;
        font-size: 11px;
        cursor: pointer;
    `;
    duplicateBtn.addEventListener('click', duplicateTheme);
    
    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.textContent = '✓ Apply';
    applyBtn.title = 'Apply changes to current theme';
    applyBtn.style.cssText = `
        padding: 6px 12px;
        background: #1a5a1a;
        border: 1px solid #2a7a2a;
        border-radius: 4px;
        color: #8f8;
        font-size: 11px;
        cursor: pointer;
    `;
    applyBtn.addEventListener('click', applyChanges);
    
    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '📤 Export JSON';
    exportBtn.title = 'Export theme as JSON';
    exportBtn.style.cssText = `
        padding: 6px 12px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 4px;
        color: #ccc;
        font-size: 11px;
        cursor: pointer;
    `;
    exportBtn.addEventListener('click', exportTheme);
    
    // Dirty indicator
    const dirtyIndicator = document.createElement('span');
    dirtyIndicator.className = 'te-dirty';
    dirtyIndicator.textContent = '● Modified';
    dirtyIndicator.style.cssText = `
        margin-left: auto;
        font-size: 11px;
        color: #f80;
        display: none;
    `;
    
    toolbar.appendChild(themeSelect);
    toolbar.appendChild(duplicateBtn);
    toolbar.appendChild(applyBtn);
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(dirtyIndicator);
    
    wrapper.appendChild(toolbar);
    
    // ========== SCROLLABLE CONTENT ==========
    const scrollArea = document.createElement('div');
    scrollArea.className = 'te-scroll';
    scrollArea.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 12px;
    `;
    wrapper.appendChild(scrollArea);
    
    // ========== FONT BROWSER MODAL ==========
    const fontModal = document.createElement('div');
    fontModal.className = 'te-font-modal';
    fontModal.style.cssText = `
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        z-index: 1000;
        flex-direction: column;
    `;
    wrapper.appendChild(fontModal);
    
    // ========== METHODS ==========
    
    function populateThemeSelector() {
        themeSelect.innerHTML = '';
        const themes = getThemes();
        const currentTheme = getTheme();
        
        themes.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = state.themes[name]?.name || name;
            if (name === currentTheme) option.selected = true;
            themeSelect.appendChild(option);
        });
    }
    
    function loadTheme(themeName) {
        const theme = state.themes[themeName];
        if (!theme) return;
        
        editingThemeName = themeName;
        editingTheme = JSON.parse(JSON.stringify(theme)); // Deep clone
        isDirty = false;
        dirtyIndicator.style.display = 'none';
        
        renderEditor();
    }
    
    function renderEditor() {
        scrollArea.innerHTML = '';
        
        if (!editingTheme) {
            scrollArea.innerHTML = '<div style="padding: 20px; color: #666;">Select a theme to edit</div>';
            return;
        }
        
        // ===== META INFO =====
        const { section: metaSection, content: metaContent } = createSection('Theme Info');
        
        // Name
        metaContent.appendChild(createTextEditor('name', editingTheme.name, (k, v) => {
            editingTheme.name = v;
            markDirty();
        }));
        
        // Type dropdown
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 4px 0;';
        
        const typeLabel = document.createElement('span');
        typeLabel.textContent = 'type';
        typeLabel.style.cssText = 'min-width: 100px; font-family: monospace; font-size: 11px; color: #ccc;';
        
        const typeSelect = document.createElement('select');
        typeSelect.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 4px;
            color: #ccc;
            font-size: 11px;
        `;
        ['light', 'dark', 'hybrid'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (editingTheme.type === t) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener('change', (e) => {
            editingTheme.type = e.target.value;
            markDirty();
        });
        
        typeRow.appendChild(typeLabel);
        typeRow.appendChild(typeSelect);
        metaContent.appendChild(typeRow);
        
        scrollArea.appendChild(metaSection);
        
        // ===== FONTS =====
        const { section: fontSection, content: fontContent } = createSection('Fonts');
        
        if (editingTheme.fonts) {
            for (const [key, value] of Object.entries(editingTheme.fonts)) {
                fontContent.appendChild(createFontEditor(key, value, (k, v) => {
                    editingTheme.fonts[k] = v;
                    markDirty();
                }, openFontBrowser));
            }
        }
        
        scrollArea.appendChild(fontSection);
        
        // ===== COLORS BY CATEGORY =====
        if (editingTheme.colors) {
            for (const [category, keys] of Object.entries(COLOR_CATEGORIES)) {
                const existingKeys = keys.filter(k => editingTheme.colors[k] !== undefined);
                if (existingKeys.length === 0) continue;
                
                const { section, content } = createSection(category);
                
                for (const key of existingKeys) {
                    content.appendChild(createColorEditor(key, editingTheme.colors[key], (k, v) => {
                        editingTheme.colors[k] = v;
                        markDirty();
                    }));
                }
                
                scrollArea.appendChild(section);
            }
            
            // Editor colors (optional)
            const editorKeys = EDITOR_COLORS.filter(k => editingTheme.colors[k] !== undefined);
            if (editorKeys.length > 0) {
                const { section, content } = createSection('Editor (Optional)');
                for (const key of editorKeys) {
                    content.appendChild(createColorEditor(key, editingTheme.colors[key], (k, v) => {
                        editingTheme.colors[k] = v;
                        markDirty();
                    }));
                }
                scrollArea.appendChild(section);
            }
            
            // Any uncategorized colors
            const allCategorized = new Set(Object.values(COLOR_CATEGORIES).flat().concat(EDITOR_COLORS));
            const uncategorized = Object.keys(editingTheme.colors).filter(k => !allCategorized.has(k));
            if (uncategorized.length > 0) {
                const { section, content } = createSection('Custom Colors');
                for (const key of uncategorized) {
                    content.appendChild(createColorEditor(key, editingTheme.colors[key], (k, v) => {
                        editingTheme.colors[k] = v;
                        markDirty();
                    }));
                }
                scrollArea.appendChild(section);
            }
        }
        
        // ===== EFFECTS =====
        if (editingTheme.effects) {
            const { section, content } = createSection('Effects');
            
            for (const [key, value] of Object.entries(editingTheme.effects)) {
                content.appendChild(createTextEditor(key, value, (k, v) => {
                    editingTheme.effects[k] = v;
                    markDirty();
                }));
            }
            
            scrollArea.appendChild(section);
        }
        
        // ===== ADD COLOR BUTTON =====
        const addColorBtn = document.createElement('button');
        addColorBtn.textContent = '+ Add Color Property';
        addColorBtn.style.cssText = `
            margin-top: 12px;
            padding: 8px 16px;
            background: transparent;
            border: 1px dashed #444;
            border-radius: 4px;
            color: #888;
            font-size: 12px;
            cursor: pointer;
            width: 100%;
        `;
        addColorBtn.addEventListener('click', addColorProperty);
        scrollArea.appendChild(addColorBtn);
    }
    
    function markDirty() {
        isDirty = true;
        dirtyIndicator.style.display = 'inline';
    }
    
    function applyChanges() {
        if (!editingTheme || !editingThemeName) return;
        
        // Update state
        state.themes[editingThemeName] = JSON.parse(JSON.stringify(editingTheme));
        
        // Re-apply if this is the current theme
        if (getTheme() === editingThemeName) {
            setTheme(editingThemeName);
        }
        
        isDirty = false;
        dirtyIndicator.style.display = 'none';
    }
    
    function duplicateTheme() {
        if (!editingTheme) return;
        
        const newName = prompt('Enter name for new theme:', editingThemeName + '-copy');
        if (!newName || newName.trim() === '') return;
        
        const newId = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        // Clone theme
        const newTheme = JSON.parse(JSON.stringify(editingTheme));
        newTheme.name = newName;
        
        // Add to state
        state.themes[newId] = newTheme;
        
        // Update selector and load new theme
        populateThemeSelector();
        themeSelect.value = newId;
        loadTheme(newId);
    }
    
    function exportTheme() {
        if (!editingTheme || !editingThemeName) return;
        
        const exportData = {
            [editingThemeName]: editingTheme
        };
        
        const json = JSON.stringify(exportData, null, 2);
        
        // Create download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `theme-${editingThemeName}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    function addColorProperty() {
        const key = prompt('Enter color property name (e.g., my-custom-color):');
        if (!key || key.trim() === '') return;
        
        const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '-');
        
        if (!editingTheme.colors) editingTheme.colors = {};
        editingTheme.colors[cleanKey] = '#888888';
        
        markDirty();
        renderEditor();
    }
    
    function openFontBrowser(fontKey) {
        fontModal.innerHTML = '';
        fontModal.style.display = 'flex';
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: #1a1a1a;
            border-bottom: 1px solid #333;
        `;
        
        const title = document.createElement('span');
        title.textContent = `Browse ${fontKey} fonts`;
        title.style.cssText = 'font-size: 14px; font-weight: 600; color: #ccc;';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #888;
            font-size: 18px;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', () => {
            fontModal.style.display = 'none';
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        fontModal.appendChild(header);
        
        // Tabs
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex;
            background: #1a1a1a;
            border-bottom: 1px solid #333;
        `;
        
        const popularTab = document.createElement('button');
        popularTab.textContent = 'Popular';
        popularTab.className = 'active';
        popularTab.style.cssText = `
            padding: 8px 16px;
            background: #0d0d0d;
            border: none;
            border-bottom: 2px solid #58a6ff;
            color: #ccc;
            cursor: pointer;
        `;
        
        const googleTab = document.createElement('button');
        googleTab.textContent = 'Google Fonts';
        googleTab.style.cssText = `
            padding: 8px 16px;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: #888;
            cursor: pointer;
        `;
        
        tabs.appendChild(popularTab);
        tabs.appendChild(googleTab);
        fontModal.appendChild(tabs);
        
        // Content area
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        `;
        fontModal.appendChild(content);
        
        // Populate with popular fonts
        function showPopularFonts() {
            content.innerHTML = '';
            const fonts = fontKey === 'code' ? CODING_FONTS : UI_FONTS;
            
            fonts.forEach(fontName => {
                const row = createFontOption(fontName, fontKey);
                content.appendChild(row);
            });
            
            popularTab.style.background = '#0d0d0d';
            popularTab.style.borderBottomColor = '#58a6ff';
            popularTab.style.color = '#ccc';
            googleTab.style.background = 'transparent';
            googleTab.style.borderBottomColor = 'transparent';
            googleTab.style.color = '#888';
        }
        
        async function showGoogleFonts() {
            content.innerHTML = '<div style="padding: 20px; color: #888;">Loading Google Fonts...</div>';
            
            popularTab.style.background = 'transparent';
            popularTab.style.borderBottomColor = 'transparent';
            popularTab.style.color = '#888';
            googleTab.style.background = '#0d0d0d';
            googleTab.style.borderBottomColor = '#58a6ff';
            googleTab.style.color = '#ccc';
            
            try {
                const response = await fetch(`${GOOGLE_FONTS_API}?key=${GOOGLE_FONTS_KEY}&sort=popularity`);
                const data = await response.json();
                
                content.innerHTML = '';
                
                // Filter for monospace if code font
                let fonts = data.items;
                if (fontKey === 'code') {
                    fonts = fonts.filter(f => f.category === 'monospace');
                }
                
                // Limit to top 50
                fonts.slice(0, 50).forEach(font => {
                    const row = createFontOption(font.family, fontKey, true);
                    content.appendChild(row);
                });
            } catch (err) {
                content.innerHTML = `<div style="padding: 20px; color: #f88;">Failed to load Google Fonts: ${err.message}</div>`;
            }
        }
        
        function createFontOption(fontName, key, isGoogle = false) {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                border: 1px solid #333;
                border-radius: 6px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: background 0.15s ease;
            `;
            row.addEventListener('mouseenter', () => row.style.background = '#1a1a1a');
            row.addEventListener('mouseleave', () => row.style.background = 'transparent');
            
            // Load font if Google
            if (isGoogle) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@400;600&display=swap`;
                document.head.appendChild(link);
            }
            
            const preview = document.createElement('div');
            preview.style.cssText = `
                flex: 1;
                font-family: '${fontName}', ${key === 'code' ? 'monospace' : 'sans-serif'};
                font-size: 16px;
                color: #e0e0e0;
            `;
            preview.textContent = fontName;
            
            const selectBtn = document.createElement('button');
            selectBtn.textContent = 'Select';
            selectBtn.style.cssText = `
                padding: 4px 12px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 4px;
                color: #ccc;
                font-size: 11px;
                cursor: pointer;
            `;
            selectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Build font stack
                const fallback = key === 'code' ? 'monospace' : 'sans-serif';
                const fontStack = `'${fontName}', ${fallback}`;
                
                editingTheme.fonts[key] = fontStack;
                markDirty();
                fontModal.style.display = 'none';
                renderEditor();
            });
            
            row.appendChild(preview);
            row.appendChild(selectBtn);
            
            return row;
        }
        
        popularTab.addEventListener('click', showPopularFonts);
        googleTab.addEventListener('click', showGoogleFonts);
        
        showPopularFonts();
    }
    
    // ========== EVENT LISTENERS ==========
    
    themeSelect.addEventListener('change', () => {
        if (isDirty) {
            if (!confirm('You have unsaved changes. Discard them?')) {
                themeSelect.value = editingThemeName;
                return;
            }
        }
        loadTheme(themeSelect.value);
    });
    
    // ========== INITIALIZE ==========
    
    populateThemeSelector();
    loadTheme(getTheme());
    
    if (container) {
        container.appendChild(wrapper);
    }
    
    // ========== PUBLIC API ==========
    
    return {
        element: wrapper,
        
        refresh() {
            populateThemeSelector();
            loadTheme(getTheme());
        },
        
        getEditingTheme() {
            return editingTheme ? JSON.parse(JSON.stringify(editingTheme)) : null;
        },
        
        isDirty() {
            return isDirty;
        },
        
        destroy() {
            wrapper.remove();
        }
    };
}

export default ThemeEditor;
