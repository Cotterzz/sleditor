/**
 * Settings Panel Registration
 * 
 * Theme, language, device mode, and app preferences.
 * Uses SLUI components and reactive event bindings.
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { CONFIG } from '../../core/config.js';

// Will be set when panel is registered
let SLUI = null;

/**
 * Register the settings panel with SLUI
 * @param {object} SLUIInstance - The SLUI instance
 */
export function registerSettingsPanel(SLUIInstance) {
    SLUI = SLUIInstance; // Store reference
    
    SLUI.registerPanel({
        id: 'settings',
        icon: '⚙️',
        title: 'Settings',
        showInToolbar: true,
        createContent: () => createSettingsContent()
    });
    
    logger.debug('UI', 'Settings', 'Settings panel registered');
}

/**
 * Create settings panel content
 */
function createSettingsContent() {
    const container = document.createElement('div');
    container.className = 'v2-settings';
    container.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        color: var(--text-primary, #c9d1d9);
        height: 100%;
        overflow-y: auto;
    `;
    
    // ========== APPEARANCE SECTION ==========
    const appearanceSection = createSection('Appearance');
    
    // Theme selector
    const themeGroup = createSettingGroup('Theme');
    const themes = SLUI.getThemes();
    const themeSelect = SLUI.Select({
        items: themes.map(themeId => ({
            value: themeId,
            label: SLUI.state.themes[themeId]?.name || themeId
        })),
        value: SLUI.getTheme(),
        onChange: (value) => {
            SLUI.setTheme(value);
            logger.info('Settings', 'Theme', `Changed to: ${value}`);
            events.emit(EVENTS.UI_THEME_CHANGED, value);
        }
    });
    
    themeGroup.appendChild(themeSelect);
    appearanceSection.appendChild(themeGroup);
    
    // Language selector
    const langGroup = createSettingGroup('Language');
    const langSelect = SLUI.Select({
        items: [
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
            { value: 'fr', label: 'Français' },
            { value: 'ja', label: '日本語' },
            { value: 'it', label: 'Italiano' }
        ],
        value: SLUI.state.lang,
        onChange: (value) => {
            SLUI.setLanguage(value);
            logger.info('Settings', 'Language', `Changed to: ${value}`);
        }
    });
    
    langGroup.appendChild(langSelect);
    appearanceSection.appendChild(langGroup);
    
    container.appendChild(appearanceSection);
    
    // ========== LAYOUT SECTION ==========
    const layoutSection = createSection('Layout');
    
    // Toolbar position (desktop only)
    if (SLUI.state.deviceMode === 'desktop') {
        const toolbarGroup = createSettingGroup('Toolbar Position');
        const toolbarSelect = SLUI.Select({
            items: [
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'float', label: 'Floating' }
            ],
            value: SLUI.getToolbarPosition(),
            onChange: (value) => {
                SLUI.setToolbarPosition(value);
                logger.info('Settings', 'Toolbar', `Position: ${value}`);
            }
        });
        
        toolbarGroup.appendChild(toolbarSelect);
        layoutSection.appendChild(toolbarGroup);
    }
    
    // Device mode override
    const modeGroup = createSettingGroup('Device Mode');
    const modeSelect = SLUI.Select({
        items: [
            { value: '', label: 'Auto-detect' },
            { value: 'desktop', label: 'Force Desktop' },
            { value: 'mobile', label: 'Force Mobile' }
        ],
        value: SLUI.state.forceMode || '',
        onChange: (value) => {
            SLUI.setForceMode(value || null);
            logger.info('Settings', 'Mode', `Device mode: ${value || 'auto'}`);
        }
    });
    
    modeGroup.appendChild(modeSelect);
    layoutSection.appendChild(modeGroup);
    
    // Layout actions
    const layoutActions = document.createElement('div');
    layoutActions.style.cssText = `
        display: flex;
        gap: 8px;
        margin-top: 8px;
    `;
    
    const saveLayoutBtn = createButton('Save Layout', () => {
        SLUI.saveLayout();
        logger.success('Settings', 'Layout', 'Layout saved');
    });
    
    const clearLayoutBtn = createButton('Reset Layout', () => {
        SLUI.clearLayout();
        logger.info('Settings', 'Layout', 'Layout cleared (reload to apply)');
    }, 'secondary');
    
    layoutActions.appendChild(saveLayoutBtn);
    layoutActions.appendChild(clearLayoutBtn);
    layoutSection.appendChild(layoutActions);
    
    container.appendChild(layoutSection);
    
    // ========== APP INFO SECTION ==========
    const infoSection = createSection('About');
    
    const infoContent = document.createElement('div');
    infoContent.style.cssText = `
        font-size: 12px;
        color: var(--text-muted, #6e7681);
        line-height: 1.6;
    `;
    infoContent.innerHTML = `
        <strong>${CONFIG.APP_NAME}</strong> v${CONFIG.APP_VERSION}<br>
        Theme: ${SLUI.getTheme()}<br>
        Mode: ${SLUI.state.deviceMode}<br>
        <br>
        <span style="opacity: 0.6;">UI Library: SLUI (modular)</span>
    `;
    
    infoSection.appendChild(infoContent);
    container.appendChild(infoSection);
    
    return container;
}

// ========== HELPER FUNCTIONS ==========

function createSection(title) {
    const section = document.createElement('div');
    section.className = 'v2-settings-section';
    
    const header = document.createElement('div');
    header.className = 'v2-settings-section-header';
    header.textContent = title;
    header.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-muted, #6e7681);
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    section.appendChild(header);
    return section;
}

function createSettingGroup(label) {
    const group = document.createElement('div');
    group.className = 'v2-setting-group';
    group.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    `;
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
        font-size: 13px;
        color: var(--text-primary, #c9d1d9);
    `;
    
    group.appendChild(labelEl);
    return group;
}

function createButton(text, onClick, variant = 'primary') {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid var(--border, rgba(255,255,255,0.2));
        border-radius: 4px;
        background: ${variant === 'primary' ? 'var(--accent, #58a6ff)' : 'transparent'};
        color: ${variant === 'primary' ? '#fff' : 'var(--text-primary, #c9d1d9)'};
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: opacity 0.15s;
    `;
    btn.addEventListener('mouseenter', () => btn.style.opacity = '0.8');
    btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
    btn.addEventListener('click', onClick);
    return btn;
}

export default { registerSettingsPanel };
