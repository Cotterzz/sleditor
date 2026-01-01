/**
 * SLUI Theme Management
 * Handles theme loading and switching
 */

import { state } from './state.js';
import { emit, EVENTS } from './events.js';

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
    for (const [key, value] of Object.entries(theme.effects)) {
        root.style.setProperty(`--${key}`, value);
    }
    
    // Set theme attribute for CSS selectors
    document.body.dataset.theme = themeName;
    
    emit(EVENTS.THEME_CHANGE, { theme: themeName });
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
 * Load themes from JSON file
 * @param {string} url - URL to themes.json
 * @returns {Promise<object>}
 */
export async function loadThemes(url) {
    const data = await fetch(url).then(r => r.json());
    state.themes = data.themes;
    return data;
}
