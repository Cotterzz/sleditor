/**
 * SLUI Theme Management
 * Handles theme loading and switching
 */

import { state } from './state.js';
import { emit, EVENTS } from './events.js';

// Style element for theme-specific CSS rules
let themeStyleElement = null;

/**
 * Set the active theme
 * @param {string} themeName - Theme identifier
 */
export function setTheme(themeName) {
    const theme = state.themes[themeName];
    if (!theme) {
        console.warn(`Theme "${themeName}" not found`);
        return;
    }
    
    state.theme = themeName;
    localStorage.setItem('sl-theme', themeName);
    
    // Apply CSS variables
    const root = document.documentElement;
    
    // Fonts
    root.style.setProperty('--font-code', theme.fonts.code);
    root.style.setProperty('--font-ui', theme.fonts.ui);
    root.style.setProperty('--font-content', theme.fonts.content);
    
    // Colors
    for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(`--${key}`, value);
    }
    
    // Effects
    for (const [key, value] of Object.entries(theme.effects || {})) {
        root.style.setProperty(`--${key}`, value);
    }
    
    // Apply theme-specific CSS rules
    applyThemeCSS(themeName, theme.css);
    
    // Apply Monaco editor theme if Monaco is loaded
    applyMonacoTheme(themeName, theme.monaco);
    
    // Set theme attribute for CSS selectors
    document.body.dataset.theme = themeName;
    
    emit(EVENTS.THEME_CHANGE, { theme: themeName });
}

/**
 * Apply theme-specific CSS rules
 * @param {string} themeName - Theme identifier
 * @param {object} cssRules - Object of selector -> style properties
 */
function applyThemeCSS(themeName, cssRules) {
    // Create or get the theme style element
    if (!themeStyleElement) {
        themeStyleElement = document.createElement('style');
        themeStyleElement.id = 'slui-theme-custom-css';
        document.head.appendChild(themeStyleElement);
    }
    
    // Clear previous rules
    themeStyleElement.textContent = '';
    
    // If no custom CSS, we're done
    if (!cssRules || typeof cssRules !== 'object') {
        return;
    }
    
    // Build CSS string from rules object
    // Format: { "selector": { "property": "value", ... }, ... }
    const cssLines = [];
    cssLines.push(`/* Theme-specific CSS for: ${themeName} */`);
    
    for (const [selector, styles] of Object.entries(cssRules)) {
        if (!styles || typeof styles !== 'object') continue;
        
        // Scope selector to current theme using data-theme attribute
        const scopedSelector = `[data-theme="${themeName}"] ${selector}`;
        
        const styleLines = [];
        for (const [prop, value] of Object.entries(styles)) {
            // Convert camelCase to kebab-case if needed
            const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            styleLines.push(`    ${cssProp}: ${value};`);
        }
        
        if (styleLines.length > 0) {
            cssLines.push(`${scopedSelector} {`);
            cssLines.push(...styleLines);
            cssLines.push(`}`);
            cssLines.push('');
        }
    }
    
    themeStyleElement.textContent = cssLines.join('\n');
}

/**
 * Apply Monaco editor theme from theme data
 * @param {string} themeName - Theme identifier
 * @param {object} monacoConfig - Monaco theme configuration from theme.monaco
 */
function applyMonacoTheme(themeName, monacoConfig) {
    // Check if Monaco is loaded
    if (!window.monaco || !window.monaco.editor) {
        return;
    }
    
    const monacoThemeName = `sleditor-${themeName}`;
    
    if (monacoConfig && monacoConfig.base) {
        // Define the theme from config
        try {
            window.monaco.editor.defineTheme(monacoThemeName, {
                base: monacoConfig.base,
                inherit: true,
                rules: monacoConfig.rules || [],
                colors: monacoConfig.colors || {}
            });
            window.monaco.editor.setTheme(monacoThemeName);
            return;
        } catch (e) {
            console.warn(`[Theme] Failed to define Monaco theme: ${e.message}`);
        }
    }
    
    // Fall back to default based on theme type
    const themeData = state.themes[themeName];
    const isDark = themeData?.type === 'dark' || themeName === 'hacker';
    const fallback = isDark ? 'vs-dark' : 'vs';
    window.monaco.editor.setTheme(fallback);
}

/**
 * Get current theme name
 * @returns {string}
 */
export function getTheme() {
    return state.theme;
}

/**
 * Get list of available theme names
 * @returns {string[]}
 */
export function getThemes() {
    return Object.keys(state.themes);
}

/**
 * Get the full theme object for a theme
 * @param {string} themeName - Theme identifier (defaults to current theme)
 * @returns {object|null}
 */
export function getThemeData(themeName = null) {
    const name = themeName || state.theme;
    return state.themes[name] || null;
}

/**
 * Load themes from JSON file
 * @param {string} url - URL to themes.json
 * @returns {Promise<object>}
 */
export async function loadThemes(url) {
    const data = await fetch(url).then(r => r.json());
    state.themes = data.themes;
    return data;
}
