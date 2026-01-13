/**
 * SLUI Internationalization
 * Translation and language management
 */

import { state, panels } from './state.js';
import { emit, EVENTS } from './events.js';

/**
 * Get translated string by path
 * @param {string} path - Dot-separated path to string (e.g., 'panels.editor.title')
 * @param {string} fallback - Fallback value if path not found
 * @returns {string}
 */
export function t(path, fallback = '') {
    const keys = path.split('.');
    let value = state.strings;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return fallback || path;
        }
    }
    
    return value;
}

/**
 * Set the active language
 * @param {string} langCode - Language code (e.g., 'en', 'ja')
 * @param {string} langUrl - Base URL for language files (optional)
 */
export async function setLanguage(langCode, langUrl = './lang') {
    try {
        const url = `${langUrl}/${langCode}.json`;
        state.strings = await fetch(url).then(r => r.json());
        state.lang = langCode;
        localStorage.setItem('sl-lang', langCode);
        
        updateAllText();
        
        emit(EVENTS.LANG_CHANGE, { lang: langCode });
    } catch (err) {
        console.error(`Failed to load language: ${langCode}`, err);
    }
}

/**
 * Get current language code
 * @returns {string}
 */
export function getLanguage() {
    return state.lang;
}

/**
 * Load language file
 * @param {string} url - URL to language JSON
 * @returns {Promise<object>}
 */
export async function loadLanguage(url) {
    state.strings = await fetch(url).then(r => r.json());
    state.lang = state.strings.meta?.code || 'en';
    return state.strings;
}

/**
 * Update all translatable text in the DOM
 */
export function updateAllText() {
    // Update elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        el.textContent = t(key);
    });
    
    // Update elements with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        el.title = t(key);
    });
    
    // Update elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = t(key);
    });
    
    // Update zone headers
    document.querySelectorAll('.sl-zone-title').forEach(el => {
        const panelId = el.closest('.sl-zone-content')?.querySelector('[data-panel]')?.dataset.panel;
        if (panelId) {
            el.textContent = t(`panels.${panelId}.title`) || panels.get(panelId)?.title || panelId;
        }
    });
    
    // Update mobile zone empty text
    document.querySelectorAll('.sl-zone-content[data-empty-text]').forEach(el => {
        el.dataset.emptyText = t('mobile.tapToLoad');
    });
    
    // Update toolbar item titles
    document.querySelectorAll('.sl-toolbar-item[data-panel-id]').forEach(btn => {
        const panelId = btn.dataset.panelId;
        const panel = panels.get(panelId);
        if (panel) {
            btn.title = t(`panels.${panelId}.title`) || panel.title || panelId;
        }
    });
}
