/**
 * SLUI - SL Editor UI System
 * Main entry point - combines all modules
 */

// Core modules
import { state, panels, panelConfigs, resetLayoutState } from './core/state.js';
import { on, off, emit, once, EVENTS } from './core/events.js';
import { setTheme, getTheme, getThemes, loadThemes } from './core/theme.js';
import { t, setLanguage, getLanguage, loadLanguage, updateAllText } from './core/i18n.js';
import { isMobileDevice, detectOrientation, updateDeviceMode, setForceMode, setupDeviceListeners } from './core/device.js';

// Layout modules
import { setToolbarPosition, getToolbarPosition, buildToolbar, createToolbarItem, updateToolbarItem, updateAllToolbarItems, checkToolbarOverflow } from './layout/toolbar.js';
import { createWindow, bringToFront, closeWindow, openWindow, toggleWindow } from './layout/window.js';
import { dockWindow, undockWindow, closeDockWindow, renderDockTree, detectDropZone, showDropPreview, hideDropPreview } from './layout/dock.js';
import { buildMobileZones, renderMobileZones, renderMobileZoneContentsFromState, focusZone, openPanelInZone, closePanelInZone } from './layout/mobile-zones.js';
import { createTabbedWindow, closeTabbedWindow } from './layout/tabbed-window.js';

// Components
import { Slider, LabeledSlider, SliderGroup } from './components/slider.js';
import { Tabs } from './components/tabs.js';
import {
    UniformSlider,
    SliderStack,
    ParameterSlider,
    IconSlider,
    TimelineSlider,
    Checkbox,
    UniformBool,
    BoolStack,
    FloatStack,
    IntStack,
    UniformPanel,
    ColorPicker,
    ColorStack,
    Vec3Picker,
    Vec3Stack,
    PresetManager,
    VectorSliderStack
} from './components/slider.js';
import { Button, ToggleButton } from './components/buttons.js';
import { SlideToggle } from './components/slide-toggle.js';
import { ColorInput, ColorUniform } from './components/color-input.js';
import { Tooltip } from './components/tooltip.js';
import { TabPane } from './components/tabpane.js';
import { Console } from './components/console.js';
import { Select } from './components/select.js';
import { ThemeEditor } from './components/theme-editor.js';

/**
 * Initialize the UI system
 * @param {object} options - Configuration options
 */
async function init(options = {}) {
    // Load themes
    const themesUrl = options.themesUrl || './themes/themes.json';
    const themesData = await loadThemes(themesUrl);
    
    // Load language
    const langUrl = options.langUrl || './lang/en.json';
    await loadLanguage(langUrl);
    
    // Load saved force mode
    const savedForceMode = localStorage.getItem('sl-force-mode');
    state.forceMode = savedForceMode || null;
    
    // Apply default or saved theme
    const savedTheme = localStorage.getItem('sl-theme') || themesData.defaultTheme;
    setTheme(savedTheme);
    
    // Apply saved toolbar position (desktop only)
    const savedToolbar = localStorage.getItem('sl-toolbar-position') || 'left';
    setToolbarPosition(savedToolbar);
    
    // Detect device
    const deviceUpdateCallback = () => updateDeviceMode(renderMobileZones, renderMobileZoneContentsFromState, updateAllToolbarItems);
    deviceUpdateCallback();
    setupDeviceListeners(deviceUpdateCallback);
    
    // Build initial UI
    buildApp();

    // Optional: restore layout from localStorage (robustness for large app migrations)
    const restoreLayout = options.restoreLayout ?? true;
    if (restoreLayout) {
        try { loadLayout(); } catch (e) { console.warn('SLUI loadLayout failed:', e); }
    }
    
    console.log('SLUI initialized', { 
        theme: state.theme, 
        lang: state.lang,
        deviceMode: state.deviceMode,
        isMobileDevice: isMobileDevice()
    });
    
    return SLUI;
}

// ========================================
// LAYOUT PERSISTENCE (no build step)
// ========================================

const DEFAULT_LAYOUT_KEY = 'slui-layout-v1';

function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return null; }
}

function snapshotWindowRecord(windowId, winState) {
    const el = winState?.element;
    const opts = { ...(winState?.options || {}) };
    if (el) {
        opts.x = el.offsetLeft;
        opts.y = el.offsetTop;
        opts.width = el.offsetWidth;
        opts.height = el.offsetHeight;
    }
    return {
        id: windowId,
        visible: !!winState?.visible,
        tabbed: !!(el?.classList?.contains('sl-tabbed-window') || Array.isArray(opts.tabs)),
        options: opts
    };
}

function isDockedId(id, dockTree) {
    if (!dockTree) return false;
    if (dockTree.type === 'leaf') return dockTree.panelId === id;
    if (dockTree.type === 'split') return isDockedId(id, dockTree.first) || isDockedId(id, dockTree.second);
    return false;
}

function saveLayout(key = DEFAULT_LAYOUT_KEY) {
    const windows = [];
    for (const [windowId, winState] of state.windows.entries()) {
        windows.push(snapshotWindowRecord(windowId, winState));
    }

    const payload = {
        version: 1,
        dockTree: state.dockTree,
        dockedWindows: Array.from(state.dockedWindows),
        windows
    };

    localStorage.setItem(key, JSON.stringify(payload));
    return payload;
}

function clearLayout(key = DEFAULT_LAYOUT_KEY) {
    localStorage.removeItem(key);
}

function loadLayout(key = DEFAULT_LAYOUT_KEY) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const payload = safeJsonParse(raw);
    if (!payload || payload.version !== 1) return null;

    // Close existing windows
    for (const [id] of Array.from(state.windows.entries())) {
        // Works for both regular + tabbed windows (both are in state.windows)
        const ws = state.windows.get(id);
        ws?.element?.remove?.();
        state.windows.delete(id);
    }
    state.dockedWindows.clear();
    state.dockTree = null;

    // Restore docking structure first (so renderDockTree can place docked elements)
    state.dockTree = payload.dockTree || null;
    (payload.dockedWindows || []).forEach(id => state.dockedWindows.add(id));

    const floatLayer = document.getElementById('sl-float-layer');

    // Recreate windows from panel registry when possible (content is not serializable)
    for (const w of payload.windows || []) {
        const panel = panels.get(w.id);

        if (w.tabbed) {
            // Tabbed windows carry their own tabs in options (serializable)
            const el = createTabbedWindow({
                ...w.options,
                id: w.id
            });
            if (!el) continue;
        } else {
            // Regular windows: rebuild content from panel.createContent
            const content = panel?.createContent ? panel.createContent() : null;
            const el = createWindow({
                ...w.options,
                id: w.id,
                title: t(`panels.${w.id}.title`) || panel?.title || w.options?.title || w.id,
                icon: panel?.icon || w.options?.icon || '📄',
                content
            }, dockWindow, closeDockWindow);
            if (!el) continue;
        }

        const winState = state.windows.get(w.id);
        if (!winState?.element) continue;

        // Restore visibility
        winState.visible = !!w.visible;
        winState.element.style.display = w.visible ? '' : 'none';
    }

    // Render docked windows into dock layer
    renderDockTree();

    // Attach floating windows to float layer
    if (floatLayer) {
        for (const [id, winState] of state.windows.entries()) {
            const docked = payload.dockedWindows?.includes?.(id) || isDockedId(id, payload.dockTree);
            if (!docked) {
                floatLayer.appendChild(winState.element);
            }
        }
    }

    // Toolbar states
    updateAllToolbarItems();

    return payload;
}

/**
 * Build the main app structure
 */
function buildApp() {
    const app = document.createElement('div');
    app.className = 'sl-app';
    app.dataset.mode = state.deviceMode;
    app.dataset.orientation = state.mobileOrientation;
    
    if (state.deviceMode === 'desktop') {
        app.dataset.toolbarPosition = state.toolbarPosition;
    } else {
        app.dataset.toolbarPosition = state.mobileOrientation === 'portrait' ? 'top' : 'left';
    }
    
    // Toolbar
    app.appendChild(buildToolbar(toggleUserMenu));
    
    // Workspace
    const workspace = document.createElement('div');
    workspace.className = 'sl-workspace';
    workspace.id = 'sl-workspace';
    
    if (state.deviceMode === 'mobile') {
        workspace.appendChild(buildMobileZones());
    } else {
        const dockLayer = document.createElement('div');
        dockLayer.className = 'sl-dock-layer';
        dockLayer.id = 'sl-dock-layer';
        workspace.appendChild(dockLayer);
        
        const floatLayer = document.createElement('div');
        floatLayer.className = 'sl-float-layer';
        floatLayer.id = 'sl-float-layer';
        workspace.appendChild(floatLayer);
        
        ['left', 'right', 'top', 'bottom'].forEach(side => {
            const zone = document.createElement('div');
            zone.className = `sl-drop-zone ${side}`;
            zone.dataset.side = side;
            workspace.appendChild(zone);
        });
        
        const preview = document.createElement('div');
        preview.className = 'sl-drop-preview';
        preview.id = 'sl-drop-preview';
        workspace.appendChild(preview);
        
        renderDockTree();
    }
    
    app.appendChild(workspace);
    
    document.body.innerHTML = '';
    document.body.appendChild(app);
    
    updateAllToolbarItems();
}

/**
 * Toggle user menu
 */
function toggleUserMenu() {
    const existing = document.getElementById('sl-user-menu');
    if (existing) {
        existing.remove();
        return;
    }
    
    const userBtn = document.getElementById('sl-toolbar-user');
    if (!userBtn) return;
    
    const rect = userBtn.getBoundingClientRect();
    
    const menu = document.createElement('div');
    menu.className = 'sl-menu sl-user-menu';
    menu.id = 'sl-user-menu';
    
    const toolbarPos = state.deviceMode === 'mobile' 
        ? (state.mobileOrientation === 'portrait' ? 'top' : 'left')
        : state.toolbarPosition;
    
    if (toolbarPos === 'left' || toolbarPos === 'float') {
        menu.style.left = `${rect.right + 8}px`;
        menu.style.bottom = `${window.innerHeight - rect.bottom}px`;
    } else if (toolbarPos === 'right') {
        menu.style.right = `${window.innerWidth - rect.left + 8}px`;
        menu.style.bottom = `${window.innerHeight - rect.bottom}px`;
    } else if (toolbarPos === 'top') {
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 8}px`;
    } else {
        menu.style.left = `${rect.left}px`;
        menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    }
    
    menu.innerHTML = `
        <div class="sl-menu-header">
            <div class="sl-menu-user-avatar">${state.user.avatar ? `<img src="${state.user.avatar}">` : state.user.name.charAt(0).toUpperCase()}</div>
            <div class="sl-menu-user-info">
                <div class="sl-menu-user-name">${state.user.name}</div>
                <div class="sl-menu-user-status sl-text-muted">${t('panels.profile.statusOptions.online')}</div>
            </div>
        </div>
        <div class="sl-menu-divider"></div>
        <div class="sl-menu-item" data-action="profile">👤 ${t('user.profile')}</div>
        <div class="sl-menu-item" data-action="settings">⚙ ${t('user.settings')}</div>
        <div class="sl-menu-divider"></div>
        <div class="sl-menu-item" data-action="logout">🚪 ${t('user.logout')}</div>
    `;
    
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.sl-menu-item');
        if (!item) return;
        
        const action = item.dataset.action;
        menu.remove();
        
        if (action === 'settings') {
            openPanel('settings');
        } else if (action === 'profile') {
            openPanel('profile');
        }
        emit(EVENTS.USER_ACTION, { action });
    });
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== userBtn) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

/**
 * Set user info
 */
function setUser(name, avatar = null) {
    state.user.name = name;
    state.user.avatar = avatar;
    
    const userBtn = document.getElementById('sl-toolbar-user');
    if (userBtn) {
        userBtn.title = name;
        userBtn.innerHTML = avatar 
            ? `<img src="${avatar}" alt="${name}">`
            : `<span class="sl-user-initial">${name.charAt(0).toUpperCase()}</span>`;
    }
}

/**
 * Create profile panel content
 */
function createProfileContent() {
    const div = document.createElement('div');
    div.className = 'sl-profile-content';
    
    const render = () => {
        div.innerHTML = `
            <div class="sl-profile-header">
                <div class="sl-profile-avatar">${state.user.avatar ? `<img src="${state.user.avatar}">` : state.user.name.charAt(0).toUpperCase()}</div>
                <div class="sl-profile-info">
                    <div class="sl-profile-name">${state.user.name}</div>
                    <div class="sl-profile-status sl-text-muted">${t('panels.profile.statusOptions.online')}</div>
                </div>
            </div>
            <div class="sl-settings-group">
                <label class="sl-settings-label">${t('panels.profile.displayName')}</label>
                <input type="text" class="sl-input sl-fullwidth" id="sl-profile-name-input" value="${state.user.name}">
            </div>
            <div class="sl-settings-group">
                <label class="sl-settings-label">${t('panels.profile.status')}</label>
                <select class="sl-select sl-fullwidth">
                    <option selected>${t('panels.profile.statusOptions.online')}</option>
                    <option>${t('panels.profile.statusOptions.away')}</option>
                    <option>${t('panels.profile.statusOptions.busy')}</option>
                    <option>${t('panels.profile.statusOptions.offline')}</option>
                </select>
            </div>
        `;
        
        div.querySelector('#sl-profile-name-input')?.addEventListener('change', (e) => {
            setUser(e.target.value, state.user.avatar);
        });
    };
    
    render();
    on(EVENTS.LANG_CHANGE, render);
    
    return div;
}

/**
 * Create settings panel content
 */
function createSettingsContent() {
    const div = document.createElement('div');
    div.className = 'sl-settings-content';
    
    const renderSettings = () => {
        div.innerHTML = `
            <div class="sl-settings-group">
                <label class="sl-settings-label">${t('settings.appearance.theme')}</label>
                <select class="sl-select sl-settings-select" id="sl-theme-select-panel">
                    ${getThemes().map(th => `<option value="${th}" ${th === state.theme ? 'selected' : ''}>${state.themes[th].name}</option>`).join('')}
                </select>
            </div>
            
            <div class="sl-settings-group">
                <label class="sl-settings-label">${t('settings.appearance.language')}</label>
                <select class="sl-select sl-settings-select" id="sl-lang-select-panel">
                    <option value="en" ${state.lang === 'en' ? 'selected' : ''}>English</option>
                    <option value="es" ${state.lang === 'es' ? 'selected' : ''}>Español</option>
                    <option value="ja" ${state.lang === 'ja' ? 'selected' : ''}>日本語</option>
                </select>
            </div>
            
            <div class="sl-settings-group" id="sl-toolbar-group">
                <label class="sl-settings-label">${t('toolbar.position')}</label>
                <select class="sl-select sl-settings-select" id="sl-toolbar-select-panel">
                    <option value="top" ${state.toolbarPosition === 'top' ? 'selected' : ''}>${t('toolbar.dock.top')}</option>
                    <option value="bottom" ${state.toolbarPosition === 'bottom' ? 'selected' : ''}>${t('toolbar.dock.bottom')}</option>
                    <option value="left" ${state.toolbarPosition === 'left' ? 'selected' : ''}>${t('toolbar.dock.left')}</option>
                    <option value="right" ${state.toolbarPosition === 'right' ? 'selected' : ''}>${t('toolbar.dock.right')}</option>
                    <option value="float" ${state.toolbarPosition === 'float' ? 'selected' : ''}>${t('toolbar.dock.float')}</option>
                </select>
            </div>
            
            <div class="sl-settings-group">
                <label class="sl-settings-label">${t('settings.device.title')}</label>
                <select class="sl-select sl-settings-select" id="sl-mode-select-panel">
                    <option value="" ${!state.forceMode ? 'selected' : ''}>${t('settings.device.auto')}</option>
                    <option value="desktop" ${state.forceMode === 'desktop' ? 'selected' : ''}>${t('settings.device.forceDesktop')}</option>
                    <option value="mobile" ${state.forceMode === 'mobile' ? 'selected' : ''}>${t('settings.device.forceMobile')}</option>
                </select>
            </div>
        `;
        
        div.querySelector('#sl-theme-select-panel')?.addEventListener('change', (e) => {
            setTheme(e.target.value);
        });
        
        div.querySelector('#sl-lang-select-panel')?.addEventListener('change', (e) => {
            setLanguage(e.target.value);
        });
        
        div.querySelector('#sl-toolbar-select-panel')?.addEventListener('change', (e) => {
            setToolbarPosition(e.target.value);
        });
        
        div.querySelector('#sl-mode-select-panel')?.addEventListener('change', (e) => {
            setForceMode(e.target.value || null, buildApp, reRegisterPanels);
        });
        
        if (state.deviceMode === 'mobile') {
            div.querySelector('#sl-toolbar-group')?.classList.add('hidden');
        }
    };
    
    renderSettings();
    on(EVENTS.LANG_CHANGE, renderSettings);
    
    return div;
}

/**
 * Re-register all panels (after mode change)
 */
function reRegisterPanels() {
    panels.clear();
    panelConfigs.forEach(config => {
        registerPanel(config, true);
    });
}

/**
 * Register a panel
 */
function registerPanel(config, isReRegister = false) {
    const {
        id, icon, title, createContent, showInToolbar = true,
        // Tabbed window options (ui.js compatibility)
        tabbed = false,
        tabGroup = 'default',
        tabs = null,
        tabBarAddon = null,          // Custom element at end of tab bar
        // Lifecycle callbacks
        onWindowCreated = null,
        onWindowClosed = null,
        onTabClose = null            // Called when a tab is closed
    } = config;
    
    if (!isReRegister) {
        panelConfigs.push(config);
    }
    
    panels.set(id, config);
    
    if (!showInToolbar) return;
    
    const itemsContainer = document.getElementById('sl-toolbar-items');
    if (itemsContainer) {
        const spacer = itemsContainer.querySelector('.sl-toolbar-spacer');
        const btn = createToolbarItem(icon, id, t(`panels.${id}.title`) || title);
        
        btn.addEventListener('click', () => {
            if (state.deviceMode === 'mobile') {
                const isLandscape = state.mobileOrientation === 'landscape';
                const zone1Key = isLandscape ? 'left' : 'top';
                const zone2Key = isLandscape ? 'right' : 'bottom';
                
                if (state.mobileZones[zone1Key] === id || state.mobileZones[zone2Key] === id) {
                    closePanelInZone(id);
                } else {
                    openPanelInZone(id);
                }
            } else {
                // Desktop: window mode
                if (tabbed) {
                    // Match ui.js behavior: toggle the whole tab group
                    const groupWindows = [];
                    for (const [windowId, data] of (state.windows || new Map())) {
                        if (data?.options?.group === tabGroup || data?.element?.dataset?.tabGroup === tabGroup) {
                            groupWindows.push(windowId);
                        }
                    }

                    if (groupWindows.length > 0) {
                        for (const winId of groupWindows) {
                            closeTabbedWindow(winId);
                        }
                        updateToolbarItem(id, false, false, false);
                    } else {
                        const tabsData = typeof tabs === 'function' ? tabs() : tabs;
                        const addonEl = typeof tabBarAddon === 'function' ? tabBarAddon : tabBarAddon;
                        const win = createTabbedWindow({
                            id,
                            group: tabGroup,
                            x: 100 + panels.size * 30,
                            y: 100 + panels.size * 30,
                            width: 500,
                            height: 400,
                            tabs: tabsData || [],
                            tabBarAddon: addonEl,
                            onTabClose,
                            onWindowClosed
                        });
                        
                        // Call onWindowCreated callback if provided
                        if (onWindowCreated && win) {
                            try {
                                onWindowCreated(id);
                            } catch (e) {
                                console.error('onWindowCreated callback error:', e);
                            }
                        }

                        const floatLayer = document.getElementById('sl-float-layer');
                        if (floatLayer && win) {
                            floatLayer.appendChild(win);
                        }
                        updateToolbarItem(id, true, true, false);
                    }
                } else {
                    const winState = state.windows.get(id);
                    if (winState) {
                        toggleWindow(id, closeDockWindow);
                    } else {
                        const content = createContent ? createContent() : null;
                        const win = createWindow({
                            id,
                            title: t(`panels.${id}.title`) || title,
                            icon,
                            x: 100 + panels.size * 30,
                            y: 100 + panels.size * 30,
                            width: 500,
                            height: 400,
                            content
                        }, dockWindow, closeDockWindow);

                        const floatLayer = document.getElementById('sl-float-layer');
                        if (floatLayer) {
                            floatLayer.appendChild(win);
                        }
                        updateToolbarItem(id, true, true, false);
                    }
                }
            }
        });
        
        itemsContainer.insertBefore(btn, spacer);
        setTimeout(checkToolbarOverflow, 0);
    }
}

/**
 * Universal panel open function
 */
function openPanel(panelId) {
    const config = panels.get(panelId);
    if (!config) return;
    
    if (state.deviceMode === 'mobile') {
        openPanelInZone(panelId);
    } else {
        const winState = state.windows.get(panelId);
        if (winState) {
            openWindow(panelId);
        } else {
            const content = config.createContent ? config.createContent() : null;
            const win = createWindow({
                id: panelId,
                title: t(`panels.${panelId}.title`) || config.title,
                icon: config.icon,
                x: 100 + state.windows.size * 30,
                y: 100 + state.windows.size * 30,
                width: 400,
                height: 350,
                content,
                resizable: true
            }, dockWindow, closeDockWindow);
            
            const floatLayer = document.getElementById('sl-float-layer');
            if (floatLayer) {
                floatLayer.appendChild(win);
            }
            bringToFront(panelId);
        }
        updateToolbarItem(panelId, true, true, false);
    }
}

// ========================================
// PUBLIC API
// ========================================

const SLUI = {
    init,
    
    // Theming
    setTheme,
    getTheme,
    getThemes,
    
    // i18n
    t,
    setLanguage,
    
    // Toolbar
    setToolbarPosition,
    getToolbarPosition,
    
    // Windows
    createWindow: (opts) => createWindow(opts, dockWindow, closeDockWindow),
    openWindow,
    closeWindow,
    toggleWindow: (id) => toggleWindow(id, closeDockWindow),
    bringToFront,
    
    // Docking
    dockWindow,
    undockWindow,
    closeDockWindow,
    renderDockTree,
    
    // Panels
    registerPanel,
    openPanel,
    
    // Mobile zones
    openPanelInZone,
    closePanelInZone,
    focusZone,
    
    // User
    setUser,
    toggleUserMenu,
    createProfileContent,
    createSettingsContent,
    
    // Device mode
    setForceMode: (mode) => setForceMode(mode, buildApp, reRegisterPanels),
    isMobileDevice,
    
    // Events
    on,
    off,
    emit,
    once,
    EVENTS,
    
    // Components
    Slider,
    LabeledSlider,
    SliderGroup,
    UniformSlider,
    SliderStack,
    ParameterSlider,
    IconSlider,
    TimelineSlider,
    Checkbox,
    UniformBool,
    BoolStack,
    FloatStack,
    IntStack,
    UniformPanel,
    ColorPicker,
    ColorUniform,
    ColorStack,
    Vec3Picker,
    Vec3Stack,
    PresetManager,
    VectorSliderStack,
    Tabs,
    TabPane,
    
    // Buttons
    Button,
    ToggleButton,
    SlideToggle,
    
    // Form Controls
    Select,
    
    // Color
    ColorInput,
    
    // Tooltip
    Tooltip,
    
    // Console
    Console,
    
    // Theme Editor
    ThemeEditor,
    
    // Tabbed Windows
    createTabbedWindow,
    closeTabbedWindow,

    // Layout persistence
    saveLayout,
    loadLayout,
    clearLayout,
    
    // State access
    get state() { return state; }
};

// Export for ES modules
export default SLUI;

// Global export for non-module usage
if (typeof window !== 'undefined') {
    window.SLUI = SLUI;
}
