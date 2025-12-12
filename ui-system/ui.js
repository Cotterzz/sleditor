/**
 * SL Editor UI System
 * Window/Panel management with theming and i18n support
 */

const SLUI = (function() {
    'use strict';
    
    // ========================================
    // STATE
    // ========================================
    
    const state = {
        theme: null,
        themes: {},
        lang: null,
        strings: {},
        toolbarPosition: 'left',
        windowMode: 'overlay', // 'overlay' or 'docked'
        windows: new Map(),
        activeWindow: null,
        zIndex: 100,
        deviceMode: 'desktop', // 'desktop' or 'mobile'
        mobileOrientation: 'portrait', // 'portrait' or 'landscape'
        forceMode: null, // null = auto, 'desktop' or 'mobile' for override
        settingsOpen: false,
        user: {
            name: 'Guest',
            avatar: null
        },
        // Mobile zone state
        mobileZones: {
            top: null,    // panel id
            bottom: null, // panel id
            left: null,   // panel id (landscape)
            right: null,  // panel id (landscape)
            focused: 'top' // or 'bottom', 'left', 'right'
        },
        // Dock tree state - BSP tree for docked windows
        // null = empty, or { type: 'leaf', panelId } or { type: 'split', direction, ratio, first, second }
        dockTree: null,
        // Track which windows are docked vs floating
        dockedWindows: new Set()
    };
    
    // ========================================
    // DEVICE DETECTION
    // ========================================
    
    function isMobileDevice() {
        const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const touchNarrow = (navigator.maxTouchPoints || 0) > 0 && window.innerWidth < 900;
        return uaMobile || touchNarrow;
    }
    
    function detectOrientation() {
        return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    }
    
    function updateDeviceMode() {
        // Track previous mode/orientation for remapping
        const prevMode = state.deviceMode;
        const prevOrientation = state.mobileOrientation;
        
        // Check for manual override
        if (state.forceMode) {
            state.deviceMode = state.forceMode;
        } else {
            state.deviceMode = isMobileDevice() ? 'mobile' : 'desktop';
        }
        
        state.mobileOrientation = detectOrientation();
        
        const app = document.querySelector('.sl-app');
        if (app) {
            app.dataset.mode = state.deviceMode;
            app.dataset.orientation = state.mobileOrientation;
            
            // Update toolbar position for mobile
            if (state.deviceMode === 'mobile') {
                app.dataset.toolbarPosition = state.mobileOrientation === 'portrait' ? 'top' : 'left';
            }
        }
        
        // Rebuild mobile zones if needed
        if (state.deviceMode === 'mobile') {
            // If orientation changed, remap existing zone assignments
            if (prevMode === 'mobile' && prevOrientation && prevOrientation !== state.mobileOrientation) {
                remapMobileZones(prevOrientation, state.mobileOrientation);
            }
            renderMobileZones();
            renderMobileZoneContentsFromState();
            // Sync toolbar state to mobile zones
            updateAllToolbarItems();
        }
    }
    
    function setForceMode(mode) {
        // mode: null (auto), 'desktop', or 'mobile'
        state.forceMode = mode;
        localStorage.setItem('sl-force-mode', mode || '');
        
        // Complete reset of layout state
        resetLayoutState();
        
        updateDeviceMode();
        
        // Rebuild UI
        buildApp();
        
        // Re-register panels
        reRegisterPanels();
    }
    
    function resetLayoutState() {
        // Clear all windows
        state.windows.clear();
        state.activeWindow = null;
        state.zIndex = 100;
        
        // Reset mobile zones
        state.mobileZones = {
            top: null,
            bottom: null,
            left: null,
            right: null,
            focused: 'top'
        };
        
        // Reset settings
        state.settingsOpen = false;
    }
    
    // ========================================
    // INITIALIZATION
    // ========================================
    
    async function init(options = {}) {
        // Load themes
        const themesUrl = options.themesUrl || './themes/themes.json';
        const themesData = await fetch(themesUrl).then(r => r.json());
        state.themes = themesData.themes;
        
        // Load language
        const langUrl = options.langUrl || './lang/en.json';
        state.strings = await fetch(langUrl).then(r => r.json());
        state.lang = state.strings.meta.code;
        
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
        updateDeviceMode();
        window.addEventListener('resize', updateDeviceMode);
        window.addEventListener('orientationchange', updateDeviceMode);
        
        // Build initial UI
        buildApp();
        
        console.log('SLUI initialized', { 
            theme: state.theme, 
            lang: state.lang,
            deviceMode: state.deviceMode,
            isMobileDevice: isMobileDevice()
        });
        
        return SLUI;
    }
    
    // ========================================
    // THEMING
    // ========================================
    
    function setTheme(themeName) {
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
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('sl-theme-change', { detail: { theme: themeName } }));
    }
    
    function getTheme() {
        return state.theme;
    }
    
    function getThemes() {
        return Object.keys(state.themes);
    }
    
    // ========================================
    // INTERNATIONALIZATION
    // ========================================
    
    function t(path, fallback = '') {
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
    
    async function setLanguage(langCode) {
        try {
            const langUrl = `./lang/${langCode}.json`;
            state.strings = await fetch(langUrl).then(r => r.json());
            state.lang = langCode;
            localStorage.setItem('sl-lang', langCode);
            
            // Update all text in UI
            updateAllText();
            
            document.dispatchEvent(new CustomEvent('sl-lang-change', { detail: { lang: langCode } }));
        } catch (err) {
            console.error(`Failed to load language: ${langCode}`, err);
        }
    }
    
    function updateAllText() {
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
    
    // ========================================
    // TOOLBAR
    // ========================================
    
    function setToolbarPosition(position) {
        state.toolbarPosition = position;
        localStorage.setItem('sl-toolbar-position', position);
        
        const app = document.querySelector('.sl-app');
        if (app) {
            app.dataset.toolbarPosition = position;
        }
    }
    
    function getToolbarPosition() {
        return state.toolbarPosition;
    }
    
    function buildToolbar() {
        // Wrapper (for layered float mode with frame)
        const wrapper = document.createElement('div');
        wrapper.className = 'sl-toolbar-wrapper';
        wrapper.id = 'sl-toolbar-wrapper';
        
        // Frame (surrounds toolbar in float mode, appears on hover)
        const frame = document.createElement('div');
        frame.className = 'sl-toolbar-frame';
        frame.id = 'sl-toolbar-frame';
        wrapper.appendChild(frame);
        
        // Toolbar body
        const toolbar = document.createElement('div');
        toolbar.className = 'sl-toolbar';
        toolbar.id = 'sl-toolbar';
        wrapper.appendChild(toolbar);
        
        // Items container (for grid layout in float mode)
        const items = document.createElement('div');
        items.className = 'sl-toolbar-items';
        items.id = 'sl-toolbar-items';
        toolbar.appendChild(items);
        
        // Spacer (pushed to items container by registerPanel)
        const spacer = document.createElement('div');
        spacer.className = 'sl-toolbar-spacer';
        items.appendChild(spacer);
        
        // Divider
        const divider = document.createElement('div');
        divider.className = 'sl-toolbar-divider';
        items.appendChild(divider);
        
        // User profile button
        const userBtn = document.createElement('button');
        userBtn.className = 'sl-toolbar-user';
        userBtn.id = 'sl-toolbar-user';
        userBtn.title = state.user.name;
        userBtn.innerHTML = state.user.avatar 
            ? `<img src="${state.user.avatar}" alt="${state.user.name}">`
            : `<span class="sl-user-initial">${state.user.name.charAt(0).toUpperCase()}</span>`;
        userBtn.addEventListener('click', toggleUserMenu);
        items.appendChild(userBtn);
        
        // Setup floating toolbar frame hover and drag
        setupToolbarFrameHover(wrapper, toolbar, frame);
        setupToolbarDrag(wrapper, frame);
        
        return wrapper;
    }
    
    function setupToolbarFrameHover(wrapper, toolbar, frame) {
        let isInsideToolbar = false;
        
        toolbar.addEventListener('mouseenter', () => {
            isInsideToolbar = true;
            wrapper.classList.remove('frame-visible');
        });
        
        toolbar.addEventListener('mouseleave', () => {
            isInsideToolbar = false;
        });
        
        wrapper.addEventListener('mouseenter', () => {
            if (!isInsideToolbar && state.toolbarPosition === 'float') {
                wrapper.classList.add('frame-visible');
            }
        });
        
        wrapper.addEventListener('mouseleave', () => {
            if (!wrapper.classList.contains('dragging')) {
                wrapper.classList.remove('frame-visible');
            }
        });
        
        wrapper.addEventListener('mousemove', (e) => {
            if (state.toolbarPosition !== 'float') return;
            if (wrapper.classList.contains('dragging')) return;
            
            const toolbarRect = toolbar.getBoundingClientRect();
            const inToolbar = e.clientX >= toolbarRect.left && e.clientX <= toolbarRect.right &&
                             e.clientY >= toolbarRect.top && e.clientY <= toolbarRect.bottom;
            
            wrapper.classList.toggle('frame-visible', !inToolbar);
        });
    }
    
    function setupToolbarDrag(wrapper, frame) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let pendingDockPosition = null;
        const edgeThreshold = 50;
        
        // Detect which edge the cursor is near
        function detectToolbarDockEdge(x, y) {
            if (x < edgeThreshold) return 'left';
            if (window.innerWidth - x < edgeThreshold) return 'right';
            if (y < edgeThreshold) return 'top';
            if (window.innerHeight - y < edgeThreshold) return 'bottom';
            return null;
        }
        
        // Show dock preview
        function showToolbarDockPreview(position) {
            let preview = document.getElementById('sl-toolbar-dock-preview');
            if (!preview) {
                preview = document.createElement('div');
                preview.id = 'sl-toolbar-dock-preview';
                preview.style.cssText = `
                    position: fixed;
                    background: var(--accent);
                    opacity: 0.3;
                    z-index: 999;
                    pointer-events: none;
                    transition: all 0.15s ease;
                `;
                document.body.appendChild(preview);
            }
            
            // Size based on position
            if (position === 'left' || position === 'right') {
                preview.style.width = 'var(--toolbar-size)';
                preview.style.height = '100%';
                preview.style.top = '0';
                preview.style.bottom = '0';
                preview.style.left = position === 'left' ? '0' : 'auto';
                preview.style.right = position === 'right' ? '0' : 'auto';
            } else {
                preview.style.width = '100%';
                preview.style.height = 'var(--toolbar-size)';
                preview.style.left = '0';
                preview.style.right = '0';
                preview.style.top = position === 'top' ? '0' : 'auto';
                preview.style.bottom = position === 'bottom' ? '0' : 'auto';
            }
            
            preview.style.display = 'block';
        }
        
        function hideToolbarDockPreview() {
            const preview = document.getElementById('sl-toolbar-dock-preview');
            if (preview) preview.style.display = 'none';
        }
        
        // Handle mousedown on frame (floating mode drag)
        frame.addEventListener('mousedown', (e) => {
            if (state.toolbarPosition !== 'float') return;
            isDragging = true;
            pendingDockPosition = null;
            
            const wrapperRect = wrapper.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = wrapperRect.left;
            startTop = wrapperRect.top;
            
            wrapper.style.left = `${startLeft}px`;
            wrapper.style.top = `${startTop}px`;
            wrapper.style.transform = 'none';
            
            wrapper.classList.add('dragging');
            e.preventDefault();
        });
        
        // Handle mousedown on docked toolbar (for undocking)
        const toolbar = wrapper.querySelector('.sl-toolbar');
        toolbar.addEventListener('mousedown', (e) => {
            if (state.toolbarPosition === 'float') return;
            if (e.target.closest('.sl-toolbar-item, .sl-toolbar-user')) return; // Don't drag from buttons
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // We'll undock once moved far enough
            wrapper.classList.add('dragging');
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            if (state.toolbarPosition === 'float') {
                // Floating - move and check for dock
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                wrapper.style.left = `${startLeft + dx}px`;
                wrapper.style.top = `${startTop + dy}px`;
                wrapper.style.transform = 'none';
                
                // Check for dock position
                pendingDockPosition = detectToolbarDockEdge(e.clientX, e.clientY);
                if (pendingDockPosition) {
                    showToolbarDockPreview(pendingDockPosition);
                } else {
                    hideToolbarDockPreview();
                }
            } else {
                // Docked - check if moved far enough to undock
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                
                if (dx > 30 || dy > 30) {
                    // Undock - switch to float mode at cursor position
                    const newLeft = e.clientX - 30;
                    const newTop = e.clientY - 30;
                    
                    setToolbarPosition('float');
                    
                    // Position wrapper at cursor
                    wrapper.style.left = `${newLeft}px`;
                    wrapper.style.top = `${newTop}px`;
                    wrapper.style.transform = 'none';
                    
                    // Update drag state
                    startLeft = newLeft;
                    startTop = newTop;
                    startX = e.clientX;
                    startY = e.clientY;
                }
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                wrapper.classList.remove('dragging');
                hideToolbarDockPreview();
                
                // If we have a pending dock position, dock it
                if (pendingDockPosition && state.toolbarPosition === 'float') {
                    setToolbarPosition(pendingDockPosition);
                }
                pendingDockPosition = null;
            }
        });
        
        // Touch support
        frame.addEventListener('touchstart', (e) => {
            if (state.toolbarPosition !== 'float') return;
            isDragging = true;
            pendingDockPosition = null;
            
            const touch = e.touches[0];
            const wrapperRect = wrapper.getBoundingClientRect();
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = wrapperRect.left;
            startTop = wrapperRect.top;
            
            wrapper.style.left = `${startLeft}px`;
            wrapper.style.top = `${startTop}px`;
            wrapper.style.transform = 'none';
            
            wrapper.classList.add('dragging');
        }, { passive: true });
        
        toolbar.addEventListener('touchstart', (e) => {
            if (state.toolbarPosition === 'float') return;
            if (e.target.closest('.sl-toolbar-item, .sl-toolbar-user')) return;
            
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            wrapper.classList.add('dragging');
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            
            if (state.toolbarPosition === 'float') {
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                
                wrapper.style.left = `${startLeft + dx}px`;
                wrapper.style.top = `${startTop + dy}px`;
                wrapper.style.transform = 'none';
                
                pendingDockPosition = detectToolbarDockEdge(touch.clientX, touch.clientY);
                if (pendingDockPosition) {
                    showToolbarDockPreview(pendingDockPosition);
                } else {
                    hideToolbarDockPreview();
                }
            } else {
                const dx = Math.abs(touch.clientX - startX);
                const dy = Math.abs(touch.clientY - startY);
                
                if (dx > 30 || dy > 30) {
                    const newLeft = touch.clientX - 30;
                    const newTop = touch.clientY - 30;
                    
                    setToolbarPosition('float');
                    
                    wrapper.style.left = `${newLeft}px`;
                    wrapper.style.top = `${newTop}px`;
                    wrapper.style.transform = 'none';
                    
                    startLeft = newLeft;
                    startTop = newTop;
                    startX = touch.clientX;
                    startY = touch.clientY;
                }
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                wrapper.classList.remove('dragging');
                hideToolbarDockPreview();
                
                if (pendingDockPosition && state.toolbarPosition === 'float') {
                    setToolbarPosition(pendingDockPosition);
                }
                pendingDockPosition = null;
            }
        });
    }
    
    function checkToolbarOverflow() {
        const toolbar = document.getElementById('sl-toolbar');
        const itemsContainer = document.getElementById('sl-toolbar-items');
        if (!toolbar || !itemsContainer) return;
        
        // Count items (excluding spacer)
        const items = itemsContainer.querySelectorAll('.sl-toolbar-item');
        const itemCount = items.length;
        
        // Check for overflow on mobile
        if (state.deviceMode === 'mobile') {
            const isOverflow = itemsContainer.scrollWidth > itemsContainer.clientWidth ||
                               itemsContainer.scrollHeight > itemsContainer.clientHeight;
            toolbar.classList.toggle('has-overflow', isOverflow);
        }
        
        // For float mode, add class if few items (single column)
        if (state.toolbarPosition === 'float') {
            itemsContainer.classList.toggle('few-items', itemCount <= 6);
        }
    }
    
    function createToolbarItem(icon, id, title) {
        const btn = document.createElement('button');
        btn.className = 'sl-toolbar-item';
        btn.dataset.panelId = id;
        btn.innerHTML = icon;
        btn.title = title;
        return btn;
    }
    
    function updateToolbarItem(panelId, isLoaded, isVisible, isMinimized) {
        const btn = document.querySelector(`.sl-toolbar-item[data-panel-id="${panelId}"]`);
        if (!btn) return;
        
        btn.classList.toggle('loaded', isLoaded);
        btn.classList.toggle('active', isVisible && !isMinimized);
        btn.classList.toggle('minimized', isMinimized);
    }
    
    // ========================================
    // WINDOWS
    // ========================================
    
    function createWindow(options) {
        // In mobile mode we do not create desktop-style windows
        if (state.deviceMode === 'mobile') return null;
        
        const {
            id,
            title = 'Window',
            icon = '📄',
            x = 100,
            y = 100,
            width = 400,
            height = 300,
            minWidth = 200,
            minHeight = 150,
            content = null,
            resizable = true
        } = options;
        
        // Create container (hover zone extends beyond window)
        const container = document.createElement('div');
        container.className = 'sl-window-container';
        container.id = `sl-window-container-${id}`;
        container.dataset.windowId = id;
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.minWidth = `${minWidth}px`;
        container.style.minHeight = `${minHeight}px`;
        
        // Frame (surrounding border, appears on hover from outside)
        const frame = document.createElement('div');
        frame.className = 'sl-window-frame';
        container.appendChild(frame);
        
        // Window element
        const win = document.createElement('div');
        win.className = 'sl-window';
        win.id = `sl-window-${id}`;
        win.dataset.windowId = id;
        
        // Body (the visible window content area)
        const body = document.createElement('div');
        body.className = 'sl-window-body';
        
        // Content
        const contentEl = document.createElement('div');
        contentEl.className = 'sl-window-content';
        if (content) {
            if (typeof content === 'string') {
                contentEl.innerHTML = content;
            } else {
                contentEl.appendChild(content);
            }
        }
        body.appendChild(contentEl);
        
        // Resize handles (inside body, at edges)
        if (resizable) {
            ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `sl-resize-handle ${dir}`;
                handle.dataset.direction = dir;
                body.appendChild(handle);
            });
        }
        
        win.appendChild(body);
        container.appendChild(win);
        
        // Store window state (store container as the main element)
        state.windows.set(id, {
            element: container,
            window: win,
            body: body,
            frame: frame,
            options,
            minimized: false,
            visible: true
        });
        
        // Setup interactions
        setupFrameHover(container, body, frame);
        setupWindowDrag(container, frame);
        if (resizable) setupWindowResize(container, body);
        setupWindowFocus(container);
        
        // Always bring new windows to front
        bringToFront(id);
        
        // Reflect state in toolbar (mark as open/loaded)
        updateToolbarItem(id, true, true, false);
        
        return container;
    }
    
    // Frame hover - show frame when cursor is near window but not inside body
    function setupFrameHover(container, body, frame) {
        let isInsideBody = false;
        
        // Track when cursor enters/leaves the body
        body.addEventListener('mouseenter', () => {
            isInsideBody = true;
            container.classList.remove('frame-visible');
        });
        
        body.addEventListener('mouseleave', () => {
            isInsideBody = false;
            // Check if still in container
            // Frame will show via container hover
        });
        
        // Show frame when hovering container (but not if inside body)
        container.addEventListener('mouseenter', () => {
            if (!isInsideBody) {
                container.classList.add('frame-visible');
            }
        });
        
        container.addEventListener('mouseleave', () => {
            if (!container.classList.contains('dragging') && !container.classList.contains('resizing')) {
                container.classList.remove('frame-visible');
            }
        });
        
        // Update on mouse move within container
        container.addEventListener('mousemove', (e) => {
            if (container.classList.contains('dragging') || container.classList.contains('resizing')) return;
            
            const bodyRect = body.getBoundingClientRect();
            const inBody = e.clientX >= bodyRect.left && e.clientX <= bodyRect.right &&
                          e.clientY >= bodyRect.top && e.clientY <= bodyRect.bottom;
            
            container.classList.toggle('frame-visible', !inBody);
        });
    }
    
    function setupWindowDrag(container, frame) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let currentDropInfo = null; // { side, targetPanel }
        
        frame.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;
            container.style.transition = 'none';
            container.classList.add('dragging');
            bringToFront(container.dataset.windowId);
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            container.style.left = `${startLeft + dx}px`;
            container.style.top = `${startTop + dy}px`;
            
            // Check for drop zones (only for floating windows on desktop)
            if (state.deviceMode === 'desktop' && !state.dockedWindows.has(container.dataset.windowId)) {
                currentDropInfo = detectDropZone(e.clientX, e.clientY, container.dataset.windowId);
                if (currentDropInfo) {
                    showDropPreview(currentDropInfo);
                } else {
                    hideDropPreview();
                }
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                container.style.transition = '';
                container.classList.remove('dragging');
                
                // If dropped in a zone, dock it
                if (currentDropInfo && state.deviceMode === 'desktop' && !state.dockedWindows.has(container.dataset.windowId)) {
                    dockWindow(container.dataset.windowId, currentDropInfo.side, currentDropInfo.targetPanel);
                }
                
                hideDropPreview();
                currentDropInfo = null;
            }
        });
        
        // Touch support
        frame.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            isDragging = true;
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;
            container.classList.add('dragging');
            bringToFront(container.dataset.windowId);
        });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            container.style.left = `${startLeft + dx}px`;
            container.style.top = `${startTop + dy}px`;
            
            // Check for drop zones on touch too
            if (state.deviceMode === 'desktop' && !state.dockedWindows.has(container.dataset.windowId)) {
                currentDropInfo = detectDropZone(touch.clientX, touch.clientY, container.dataset.windowId);
                if (currentDropInfo) {
                    showDropPreview(currentDropInfo);
                } else {
                    hideDropPreview();
                }
            }
        });
        
        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                container.classList.remove('dragging');
                
                if (currentDropInfo && state.deviceMode === 'desktop' && !state.dockedWindows.has(container.dataset.windowId)) {
                    dockWindow(container.dataset.windowId, currentDropInfo.side, currentDropInfo.targetPanel);
                }
                
                hideDropPreview();
                currentDropInfo = null;
            }
        });
    }
    
    function setupWindowResize(container, body) {
        let isResizing = false;
        let startX, startY, startW, startH, startL, startT, direction;
        
        body.querySelectorAll('.sl-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                isResizing = true;
                direction = handle.dataset.direction;
                startX = e.clientX;
                startY = e.clientY;
                startW = container.offsetWidth;
                startH = container.offsetHeight;
                startL = container.offsetLeft;
                startT = container.offsetTop;
                container.style.transition = 'none';
                container.classList.add('resizing');
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            if (direction.includes('e')) container.style.width = `${startW + dx}px`;
            if (direction.includes('w')) {
                container.style.width = `${startW - dx}px`;
                container.style.left = `${startL + dx}px`;
            }
            if (direction.includes('s')) container.style.height = `${startH + dy}px`;
            if (direction.includes('n')) {
                container.style.height = `${startH - dy}px`;
                container.style.top = `${startT + dy}px`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                container.style.transition = '';
                container.classList.remove('resizing');
            }
        });
    }
    
    function setupWindowFocus(container) {
        container.addEventListener('mousedown', () => {
            bringToFront(container.dataset.windowId);
        });
    }
    
    function bringToFront(windowId) {
        const winState = state.windows.get(windowId);
        if (!winState) return;
        
        // Remove focus from all window containers
        document.querySelectorAll('.sl-window-container').forEach(c => c.classList.remove('focused'));
        
        // Set this container as focused and bring to front
        winState.element.classList.add('focused');
        winState.element.style.zIndex = ++state.zIndex;
        state.activeWindow = windowId;
    }
    
    function toggleMinimize(windowId) {
        const winState = state.windows.get(windowId);
        if (!winState) return;
        
        winState.minimized = !winState.minimized;
        winState.element.classList.toggle('minimized', winState.minimized);
        
        updateToolbarItem(windowId, true, winState.visible, winState.minimized);
    }
    
    function closeWindow(windowId) {
        const winState = state.windows.get(windowId);
        if (!winState) return;
        
        winState.element.remove();
        state.windows.delete(windowId);
        
        updateToolbarItem(windowId, false, false, false);
    }
    
    function openWindow(windowId) {
        const winState = state.windows.get(windowId);
        if (!winState) return;
        
        winState.visible = true;
        winState.minimized = false;
        winState.element.style.display = '';
        winState.element.classList.remove('minimized');
        bringToFront(windowId);
        
        updateToolbarItem(windowId, true, true, false);
    }
    
    function toggleWindow(windowId) {
        const winState = state.windows.get(windowId);
        
        if (!winState) {
            return;
        }
        
        if (winState.visible && !winState.minimized) {
            toggleMinimize(windowId);
        } else {
            openWindow(windowId);
        }
    }
    
    // ========================================
    // DOCKING SYSTEM
    // ========================================
    
    // Dock a window to a specific edge, optionally splitting a specific panel
    function dockWindow(windowId, side, targetPanelId = null) {
        const winState = state.windows.get(windowId);
        if (!winState) return;
        
        // Remove from float layer
        const floatLayer = document.getElementById('sl-float-layer');
        if (floatLayer && winState.element.parentNode === floatLayer) {
            floatLayer.removeChild(winState.element);
        }
        
        // Mark as docked
        state.dockedWindows.add(windowId);
        
        // Create new leaf node
        const newLeaf = { type: 'leaf', panelId: windowId };
        
        if (!state.dockTree) {
            // First dock - fill entire layer
            state.dockTree = newLeaf;
        } else if (targetPanelId) {
            // Split a specific panel
            splitNodeByPanelId(state.dockTree, targetPanelId, newLeaf, side);
        } else {
            // Split at root level
            const direction = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
            const newFirst = (side === 'left' || side === 'top');
            
            state.dockTree = {
                type: 'split',
                direction,
                ratio: 0.5,
                first: newFirst ? newLeaf : state.dockTree,
                second: newFirst ? state.dockTree : newLeaf
            };
        }
        
        // Re-render dock layer
        renderDockTree();
        updateToolbarItem(windowId, true, true, false);
    }
    
    // Find and split a specific node by panelId
    function splitNodeByPanelId(tree, targetPanelId, newLeaf, side, parent = null, parentKey = null) {
        if (!tree) return false;
        
        if (tree.type === 'leaf' && tree.panelId === targetPanelId) {
            // Found it - replace with a split
            const direction = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
            const newFirst = (side === 'left' || side === 'top');
            
            const newSplit = {
                type: 'split',
                direction,
                ratio: 0.5,
                first: newFirst ? newLeaf : { type: 'leaf', panelId: targetPanelId },
                second: newFirst ? { type: 'leaf', panelId: targetPanelId } : newLeaf
            };
            
            if (parent && parentKey) {
                parent[parentKey] = newSplit;
            } else {
                // It's the root
                state.dockTree = newSplit;
            }
            return true;
        }
        
        if (tree.type === 'split') {
            if (splitNodeByPanelId(tree.first, targetPanelId, newLeaf, side, tree, 'first')) return true;
            if (splitNodeByPanelId(tree.second, targetPanelId, newLeaf, side, tree, 'second')) return true;
        }
        
        return false;
    }
    
    // Render the dock tree to the DOM
    function renderDockTree() {
        const dockLayer = document.getElementById('sl-dock-layer');
        if (!dockLayer) return;
        
        // Clear existing
        dockLayer.innerHTML = '';
        
        if (!state.dockTree) return;
        
        // Recursively build DOM
        const element = buildDockNode(state.dockTree);
        if (element) {
            dockLayer.appendChild(element);
        }
    }
    
    // Recursively build dock node DOM
    function buildDockNode(node) {
        if (!node) return null;
        
        if (node.type === 'leaf') {
            // Leaf - create panel container for the window
            const panel = document.createElement('div');
            panel.className = 'sl-dock-panel';
            panel.dataset.panelId = node.panelId;
            
            // Add drop zones for subdivision docking
            ['left', 'right', 'top', 'bottom'].forEach(side => {
                const dropZone = document.createElement('div');
                dropZone.className = `sl-panel-drop-zone ${side}`;
                dropZone.dataset.side = side;
                dropZone.dataset.targetPanel = node.panelId;
                panel.appendChild(dropZone);
            });
            
            // Get or create the window
            const winState = state.windows.get(node.panelId);
            if (winState && winState.element) {
                panel.appendChild(winState.element);
            }
            
            return panel;
        }
        
        if (node.type === 'split') {
            // Split - create container with two children and a divider
            const container = document.createElement('div');
            container.className = 'sl-dock-container';
            container.dataset.direction = node.direction;
            
            const first = buildDockNode(node.first);
            const second = buildDockNode(node.second);
            
            if (first) {
                first.style.flex = node.ratio;
                container.appendChild(first);
            }
            
            // Divider
            const divider = document.createElement('div');
            divider.className = 'sl-dock-divider';
            setupDockDivider(divider, node, container);
            container.appendChild(divider);
            
            if (second) {
                second.style.flex = 1 - node.ratio;
                container.appendChild(second);
            }
            
            return container;
        }
        
        return null;
    }
    
    // Setup divider drag to resize splits
    function setupDockDivider(divider, node, container) {
        let isDragging = false;
        let startPos, startRatio;
        
        divider.addEventListener('mousedown', (e) => {
            isDragging = true;
            divider.classList.add('dragging');
            startPos = node.direction === 'horizontal' ? e.clientX : e.clientY;
            startRatio = node.ratio;
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const rect = container.getBoundingClientRect();
            const size = node.direction === 'horizontal' ? rect.width : rect.height;
            const currentPos = node.direction === 'horizontal' ? e.clientX : e.clientY;
            const delta = (currentPos - startPos) / size;
            
            node.ratio = Math.max(0.1, Math.min(0.9, startRatio + delta));
            
            // Update flex values
            const children = container.children;
            if (children[0]) children[0].style.flex = node.ratio;
            if (children[2]) children[2].style.flex = 1 - node.ratio;
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                divider.classList.remove('dragging');
            }
        });
    }
    
    // Detect drop zone during drag - returns { side, targetPanel } or null
    function detectDropZone(x, y, draggedWindowId) {
        const workspace = document.getElementById('sl-workspace');
        if (!workspace) return null;
        
        const workspaceRect = workspace.getBoundingClientRect();
        const screenEdge = 40; // pixels from screen edge for root-level dock
        const panelEdge = 30; // pixels from panel edge for subdivision
        
        // First check dock panels for subdivision docking (takes priority)
        const panels = document.querySelectorAll('.sl-dock-panel');
        
        for (const panel of panels) {
            const panelId = panel.dataset.panelId;
            
            // Don't dock into the window being dragged
            if (panelId === draggedWindowId) continue;
            
            const rect = panel.getBoundingClientRect();
            
            // Check if cursor is over this panel
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                const fromLeft = x - rect.left;
                const fromRight = rect.right - x;
                const fromTop = y - rect.top;
                const fromBottom = rect.bottom - y;
                
                // Check panel edges for subdivision
                // Each edge only triggers if we're near THAT edge specifically
                if (fromLeft < panelEdge) return { side: 'left', targetPanel: panelId };
                if (fromRight < panelEdge) return { side: 'right', targetPanel: panelId };
                if (fromTop < panelEdge) return { side: 'top', targetPanel: panelId };
                if (fromBottom < panelEdge) return { side: 'bottom', targetPanel: panelId };
            }
        }
        
        // Then check screen edges for root-level docking (only if not over any panel edge)
        // Only dock at root level if there are no docked panels, or cursor is outside all panels
        if (panels.length === 0 || !state.dockTree) {
            // No panels yet - screen edge triggers root dock
            if (x - workspaceRect.left < screenEdge) return { side: 'left', targetPanel: null };
            if (workspaceRect.right - x < screenEdge) return { side: 'right', targetPanel: null };
            if (y - workspaceRect.top < screenEdge) return { side: 'top', targetPanel: null };
            if (workspaceRect.bottom - y < screenEdge) return { side: 'bottom', targetPanel: null };
        } else {
            // Panels exist - only trigger root dock at the very edges where no panel is
            // Check if cursor is outside all panels but near screen edge
            let overAnyPanel = false;
            for (const panel of panels) {
                const rect = panel.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    overAnyPanel = true;
                    break;
                }
            }
            
            if (!overAnyPanel) {
                // Not over any panel - screen edges for root dock
                if (x - workspaceRect.left < screenEdge) return { side: 'left', targetPanel: null };
                if (workspaceRect.right - x < screenEdge) return { side: 'right', targetPanel: null };
                if (y - workspaceRect.top < screenEdge) return { side: 'top', targetPanel: null };
                if (workspaceRect.bottom - y < screenEdge) return { side: 'bottom', targetPanel: null };
            }
        }
        
        return null;
    }
    
    // Show drop preview
    function showDropPreview(dropInfo) {
        const preview = document.getElementById('sl-drop-preview');
        const workspace = document.getElementById('sl-workspace');
        if (!preview || !workspace || !dropInfo) return;
        
        const { side, targetPanel } = dropInfo;
        let targetRect;
        
        if (targetPanel) {
            // Subdivision - preview relative to target panel
            const panel = document.querySelector(`.sl-dock-panel[data-panel-id="${targetPanel}"]`);
            if (panel) {
                targetRect = panel.getBoundingClientRect();
            } else {
                return;
            }
        } else {
            // Root level - preview relative to workspace
            targetRect = workspace.getBoundingClientRect();
        }
        
        // Calculate preview position
        let previewRect = { left: 0, top: 0, width: 0, height: 0 };
        
        if (!state.dockTree && !targetPanel) {
            // Will fill entire workspace
            previewRect = { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height };
        } else {
            // Will take half on that side
            switch (side) {
                case 'left':
                    previewRect = { left: targetRect.left, top: targetRect.top, width: targetRect.width / 2, height: targetRect.height };
                    break;
                case 'right':
                    previewRect = { left: targetRect.left + targetRect.width / 2, top: targetRect.top, width: targetRect.width / 2, height: targetRect.height };
                    break;
                case 'top':
                    previewRect = { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height / 2 };
                    break;
                case 'bottom':
                    previewRect = { left: targetRect.left, top: targetRect.top + targetRect.height / 2, width: targetRect.width, height: targetRect.height / 2 };
                    break;
            }
        }
        
        preview.style.left = previewRect.left + 'px';
        preview.style.top = previewRect.top + 'px';
        preview.style.width = previewRect.width + 'px';
        preview.style.height = previewRect.height + 'px';
        preview.classList.add('visible');
        
        // Highlight appropriate drop zones
        document.querySelectorAll('.sl-drop-zone').forEach(z => {
            z.classList.toggle('active', !targetPanel && z.dataset.side === side);
        });
        
        document.querySelectorAll('.sl-panel-drop-zone').forEach(z => {
            const isTarget = z.dataset.targetPanel === targetPanel && z.dataset.side === side;
            z.classList.toggle('active', isTarget);
        });
    }
    
    // Hide drop preview
    function hideDropPreview() {
        const preview = document.getElementById('sl-drop-preview');
        if (preview) preview.classList.remove('visible');
        document.querySelectorAll('.sl-drop-zone').forEach(z => z.classList.remove('active'));
        document.querySelectorAll('.sl-panel-drop-zone').forEach(z => z.classList.remove('active'));
    }
    
    // ========================================
    // APP BUILDER
    // ========================================
    
    function buildApp() {
        // Create app container
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
        app.appendChild(buildToolbar());
        
        // Workspace
        const workspace = document.createElement('div');
        workspace.className = 'sl-workspace';
        workspace.id = 'sl-workspace';
        
        if (state.deviceMode === 'mobile') {
            // Mobile: add zone containers
            workspace.appendChild(buildMobileZones());
        } else {
            // Desktop: create dock and float layers
            const dockLayer = document.createElement('div');
            dockLayer.className = 'sl-dock-layer';
            dockLayer.id = 'sl-dock-layer';
            workspace.appendChild(dockLayer);
            
            const floatLayer = document.createElement('div');
            floatLayer.className = 'sl-float-layer';
            floatLayer.id = 'sl-float-layer';
            workspace.appendChild(floatLayer);
            
            // Create drop zone indicators
            ['left', 'right', 'top', 'bottom'].forEach(side => {
                const zone = document.createElement('div');
                zone.className = `sl-drop-zone ${side}`;
                zone.dataset.side = side;
                workspace.appendChild(zone);
            });
            
            // Create drop preview
            const preview = document.createElement('div');
            preview.className = 'sl-drop-preview';
            preview.id = 'sl-drop-preview';
            workspace.appendChild(preview);
            
            // Render any existing dock tree
            renderDockTree();
        }
        
        app.appendChild(workspace);
        
        // Mount to body
        document.body.innerHTML = '';
        document.body.appendChild(app);
        
        // Ensure toolbar reflects current state (especially after rebuilds)
        updateAllToolbarItems();
    }
    
    // ========================================
    // USER MENU
    // ========================================
    
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
        
        // Position based on toolbar location
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
        
        // Handle menu clicks
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.sl-menu-item');
            if (!item) return;
            
            const action = item.dataset.action;
            menu.remove();
            
            if (action === 'settings') {
                // Open settings panel
                openPanel('settings');
            } else if (action === 'profile') {
                // Open profile panel
                openPanel('profile');
            }
            // Other actions can be handled via events
            document.dispatchEvent(new CustomEvent('sl-user-action', { detail: { action } }));
        });
        
        document.body.appendChild(menu);
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== userBtn) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }
    
    function setUser(name, avatar = null) {
        state.user.name = name;
        state.user.avatar = avatar;
        
        // Update toolbar button
        const userBtn = document.getElementById('sl-toolbar-user');
        if (userBtn) {
            userBtn.title = name;
            userBtn.innerHTML = avatar 
                ? `<img src="${avatar}" alt="${name}">`
                : `<span class="sl-user-initial">${name.charAt(0).toUpperCase()}</span>`;
        }
    }
    
    // Profile panel content creator (for registerPanel)
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
                    <label class="sl-settings-label" data-i18n="panels.profile.displayName">${t('panels.profile.displayName')}</label>
                    <input type="text" class="sl-input sl-fullwidth" id="sl-profile-name-input" value="${state.user.name}">
                </div>
                <div class="sl-settings-group">
                    <label class="sl-settings-label" data-i18n="panels.profile.status">${t('panels.profile.status')}</label>
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
        
        // Listen for language changes
        const langHandler = () => render();
        document.addEventListener('sl-lang-change', langHandler);
        div._cleanup = () => document.removeEventListener('sl-lang-change', langHandler);
        
        return div;
    }
    
    // Settings panel content creator (for registerPanel)
    function createSettingsContent() {
        const div = document.createElement('div');
        div.className = 'sl-settings-content';
        
        const renderSettings = () => {
            div.innerHTML = `
                <div class="sl-settings-group">
                    <label class="sl-settings-label" data-i18n="settings.appearance.theme">${t('settings.appearance.theme')}</label>
                    <select class="sl-select sl-settings-select" id="sl-theme-select-panel">
                        ${getThemes().map(th => `<option value="${th}" ${th === state.theme ? 'selected' : ''}>${state.themes[th].name}</option>`).join('')}
                    </select>
                </div>
                
                <div class="sl-settings-group">
                    <label class="sl-settings-label" data-i18n="settings.appearance.language">${t('settings.appearance.language')}</label>
                    <select class="sl-select sl-settings-select" id="sl-lang-select-panel">
                        <option value="en" ${state.lang === 'en' ? 'selected' : ''}>English</option>
                        <option value="es" ${state.lang === 'es' ? 'selected' : ''}>Español</option>
                        <option value="fr" ${state.lang === 'fr' ? 'selected' : ''}>Français</option>
                        <option value="it" ${state.lang === 'it' ? 'selected' : ''}>Italiano</option>
                        <option value="ja" ${state.lang === 'ja' ? 'selected' : ''}>日本語</option>
                        <option value="vi" ${state.lang === 'vi' ? 'selected' : ''}>Tiếng Việt</option>
                    </select>
                </div>
                
                <div class="sl-settings-group" id="sl-toolbar-group">
                    <label class="sl-settings-label" data-i18n="toolbar.position">${t('toolbar.position')}</label>
                    <select class="sl-select sl-settings-select" id="sl-toolbar-select-panel">
                        <option value="top" ${state.toolbarPosition === 'top' ? 'selected' : ''} data-i18n="toolbar.dock.top">${t('toolbar.dock.top')}</option>
                        <option value="bottom" ${state.toolbarPosition === 'bottom' ? 'selected' : ''} data-i18n="toolbar.dock.bottom">${t('toolbar.dock.bottom')}</option>
                        <option value="left" ${state.toolbarPosition === 'left' ? 'selected' : ''} data-i18n="toolbar.dock.left">${t('toolbar.dock.left')}</option>
                        <option value="right" ${state.toolbarPosition === 'right' ? 'selected' : ''} data-i18n="toolbar.dock.right">${t('toolbar.dock.right')}</option>
                        <option value="float" ${state.toolbarPosition === 'float' ? 'selected' : ''} data-i18n="toolbar.dock.float">${t('toolbar.dock.float')}</option>
                    </select>
                </div>
                
                <div class="sl-settings-group">
                    <label class="sl-settings-label" data-i18n="settings.device.title">${t('settings.device.title')}</label>
                    <select class="sl-select sl-settings-select" id="sl-mode-select-panel">
                        <option value="" ${!state.forceMode ? 'selected' : ''}>${t('settings.device.auto')} (${isMobileDevice() ? 'Mobile' : 'Desktop'})</option>
                        <option value="desktop" ${state.forceMode === 'desktop' ? 'selected' : ''} data-i18n="settings.device.forceDesktop">${t('settings.device.forceDesktop')}</option>
                        <option value="mobile" ${state.forceMode === 'mobile' ? 'selected' : ''} data-i18n="settings.device.forceMobile">${t('settings.device.forceMobile')}</option>
                    </select>
                </div>
            `;
            
            // Re-attach event listeners (query within div, not document)
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
                setForceMode(e.target.value || null);
            });
            
            // Hide toolbar position on mobile
            if (state.deviceMode === 'mobile') {
                div.querySelector('#sl-toolbar-group')?.classList.add('hidden');
            }
        };
        
        renderSettings();
        
        // Listen for language changes to re-render
        const langHandler = () => renderSettings();
        document.addEventListener('sl-lang-change', langHandler);
        
        // Store cleanup function for later if needed
        div._cleanup = () => document.removeEventListener('sl-lang-change', langHandler);
        
        return div;
    }
    
    // ========================================
    // MOBILE ZONES
    // ========================================
    
    function buildMobileZones() {
        const container = document.createElement('div');
        container.className = 'sl-mobile-zones';
        container.id = 'sl-mobile-zones';
        
        const isLandscape = state.mobileOrientation === 'landscape';
        const emptyText = t('mobile.tapToLoad');
        
        // Zone 1 (top or left)
        const zone1 = document.createElement('div');
        zone1.className = `sl-mobile-zone sl-zone-${isLandscape ? 'left' : 'top'}`;
        zone1.dataset.zone = isLandscape ? 'left' : 'top';
        zone1.innerHTML = `<div class="sl-zone-content" id="sl-zone-1-content" data-empty-text="${emptyText}"></div>`;
        zone1.addEventListener('click', () => focusZone(isLandscape ? 'left' : 'top'));
        container.appendChild(zone1);
        
        // Divider
        const divider = document.createElement('div');
        divider.className = 'sl-zone-divider';
        divider.addEventListener('dblclick', toggleSingleZone);
        setupDividerDrag(divider);
        container.appendChild(divider);
        
        // Zone 2 (bottom or right)
        const zone2 = document.createElement('div');
        zone2.className = `sl-mobile-zone sl-zone-${isLandscape ? 'right' : 'bottom'}`;
        zone2.dataset.zone = isLandscape ? 'right' : 'bottom';
        zone2.innerHTML = `<div class="sl-zone-content" id="sl-zone-2-content" data-empty-text="${emptyText}"></div>`;
        zone2.addEventListener('click', () => focusZone(isLandscape ? 'right' : 'bottom'));
        container.appendChild(zone2);
        
        return container;
    }
    
    function renderMobileZones() {
        const container = document.getElementById('sl-mobile-zones');
        if (!container) return;
        
        const isLandscape = state.mobileOrientation === 'landscape';
        container.dataset.orientation = state.mobileOrientation;
    }
    
    function renderMobileZoneContentsFromState() {
        const isLandscape = state.mobileOrientation === 'landscape';
        const zone1Key = isLandscape ? 'left' : 'top';
        const zone2Key = isLandscape ? 'right' : 'bottom';
        const zones = [
            { key: zone1Key, num: 1 },
            { key: zone2Key, num: 2 }
        ];
        
        zones.forEach(({ key, num }) => {
            const panelId = state.mobileZones[key];
            const contentEl = document.getElementById(`sl-zone-${num}-content`);
            if (!contentEl) return;
            
            contentEl.innerHTML = '';
            
            if (panelId) {
                const panel = panels.get(panelId);
                if (panel && panel.createContent) {
                    const header = document.createElement('div');
                    header.className = 'sl-zone-header';
                    header.innerHTML = `
                        <span class="sl-zone-icon">${panel.icon}</span>
                        <span class="sl-zone-title">${t(`panels.${panelId}.title`) || panel.title}</span>
                        <button class="sl-zone-close" data-panel="${panelId}">×</button>
                    `;
                    contentEl.appendChild(header);
                    
                    const contentWrapper = document.createElement('div');
                    contentWrapper.className = 'sl-zone-body';
                    contentWrapper.appendChild(panel.createContent());
                    contentEl.appendChild(contentWrapper);
                    
                    header.querySelector('.sl-zone-close').addEventListener('click', () => {
                        closePanelInZone(panelId);
                    });
                }
            }
        });
    }
    
    function remapMobileZones(prevOrientation, newOrientation) {
        const oldZones = { ...state.mobileZones };
        const portraitKeys = { primary: 'top', secondary: 'bottom' };
        const landscapeKeys = { primary: 'left', secondary: 'right' };
        
        const from = prevOrientation === 'portrait' ? portraitKeys : landscapeKeys;
        const to = newOrientation === 'portrait' ? portraitKeys : landscapeKeys;
        
        const primaryPanel = oldZones[from.primary];
        const secondaryPanel = oldZones[from.secondary];
        
        state.mobileZones[to.primary] = primaryPanel || null;
        state.mobileZones[to.secondary] = secondaryPanel || null;
        state.mobileZones.focused = to.primary;
    }
    
    function focusZone(zone) {
        state.mobileZones.focused = zone;
        
        document.querySelectorAll('.sl-mobile-zone').forEach(el => {
            el.classList.toggle('focused', el.dataset.zone === zone);
        });
    }
    
    // Universal panel open function (handles both mobile and desktop)
    function openPanel(panelId) {
        const config = panels.get(panelId);
        if (!config) return;
        
        if (state.deviceMode === 'mobile') {
            openPanelInZone(panelId);
        } else {
            // Desktop: window mode
            const winState = state.windows.get(panelId);
            if (winState) {
                openWindow(panelId);
            } else {
                // Create window
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
                });
                
                // Add to float layer if desktop, otherwise workspace
                const floatLayer = document.getElementById('sl-float-layer');
                const workspace = document.querySelector('.sl-workspace');
                if (floatLayer) {
                    floatLayer.appendChild(win);
                } else if (workspace) {
                    workspace.appendChild(win);
                }
                bringToFront(panelId);
            }
            updateToolbarItem(panelId, true, true, false);
        }
    }
    
    function openPanelInZone(panelId, zone) {
        const isLandscape = state.mobileOrientation === 'landscape';
        const zone1Key = isLandscape ? 'left' : 'top';
        const zone2Key = isLandscape ? 'right' : 'bottom';
        
        // Check if panel is already open somewhere
        const currentZone = state.mobileZones[zone1Key] === panelId ? zone1Key :
                           state.mobileZones[zone2Key] === panelId ? zone2Key : null;
        
        // Determine target zone
        let targetZone = zone;
        
        if (!targetZone) {
            // Auto-select: prefer empty zone, then focused zone
            if (!state.mobileZones[zone1Key] && state.mobileZones[zone2Key]) {
                targetZone = zone1Key;
            } else if (!state.mobileZones[zone2Key] && state.mobileZones[zone1Key]) {
                targetZone = zone2Key;
            } else {
                targetZone = state.mobileZones.focused || zone1Key;
            }
        }
        
        // If panel already in target zone, close it (toggle behavior)
        if (currentZone === targetZone) {
            closePanelInZone(panelId);
            return;
        }
        
        // Remove panel from old zone if it was open
        if (currentZone) {
            state.mobileZones[currentZone] = null;
            const oldZoneNum = currentZone === zone1Key ? 1 : 2;
            const oldContentEl = document.getElementById(`sl-zone-${oldZoneNum}-content`);
            if (oldContentEl) oldContentEl.innerHTML = '';
        }
        
        // Open in target zone
        state.mobileZones[targetZone] = panelId;
        
        // Render panel content
        const zoneNum = targetZone === zone1Key ? 1 : 2;
        const contentEl = document.getElementById(`sl-zone-${zoneNum}-content`);
        
        if (contentEl) {
            const panel = panels.get(panelId);
            if (panel && panel.createContent) {
                contentEl.innerHTML = '';
                const header = document.createElement('div');
                header.className = 'sl-zone-header';
                header.innerHTML = `
                    <span class="sl-zone-icon">${panel.icon}</span>
                    <span class="sl-zone-title">${t(`panels.${panelId}.title`) || panel.title}</span>
                    <button class="sl-zone-close" data-panel="${panelId}">×</button>
                `;
                contentEl.appendChild(header);
                
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'sl-zone-body';
                contentWrapper.appendChild(panel.createContent());
                contentEl.appendChild(contentWrapper);
                
                // Add close button handler
                header.querySelector('.sl-zone-close').addEventListener('click', () => {
                    closePanelInZone(panelId);
                });
            }
        }
        
        // Update all toolbar items to reflect current state
        updateAllToolbarItems();
        updateToolbarItem(panelId, true, true, false);
        focusZone(targetZone);
        
        // Auto-focus empty zone for next addition
        const otherZone = targetZone === zone1Key ? zone2Key : zone1Key;
        if (!state.mobileZones[otherZone]) {
            state.mobileZones.focused = otherZone;
        }
    }
    
    function closePanelInZone(panelId) {
        const isLandscape = state.mobileOrientation === 'landscape';
        const zone1Key = isLandscape ? 'left' : 'top';
        const zone2Key = isLandscape ? 'right' : 'bottom';
        
        let zoneNum = null;
        let closedZone = null;
        
        if (state.mobileZones[zone1Key] === panelId) {
            state.mobileZones[zone1Key] = null;
            zoneNum = 1;
            closedZone = zone1Key;
        }
        if (state.mobileZones[zone2Key] === panelId) {
            state.mobileZones[zone2Key] = null;
            zoneNum = 2;
            closedZone = zone2Key;
        }
        
        if (zoneNum) {
            const contentEl = document.getElementById(`sl-zone-${zoneNum}-content`);
            if (contentEl) contentEl.innerHTML = '';
            
            // Focus the now-empty zone for next addition
            state.mobileZones.focused = closedZone;
        }
        
        // Update all toolbar items
        updateAllToolbarItems();
    }
    
    function updateAllToolbarItems() {
        const isLandscape = state.mobileOrientation === 'landscape';
        const zone1Key = isLandscape ? 'left' : 'top';
        const zone2Key = isLandscape ? 'right' : 'bottom';
        
        panels.forEach((config, panelId) => {
            const isOpen = state.mobileZones[zone1Key] === panelId || 
                          state.mobileZones[zone2Key] === panelId;
            updateToolbarItem(panelId, isOpen, isOpen, false);
        });
    }
    
    function toggleSingleZone() {
        const container = document.getElementById('sl-mobile-zones');
        if (container) {
            container.classList.toggle('single-zone');
        }
    }
    
    function setupDividerDrag(divider) {
        let isDragging = false;
        let startPos, startSizes;
        
        const beginDrag = (pos) => {
            isDragging = true;
            const isLandscape = state.mobileOrientation === 'landscape';
            startPos = isLandscape ? pos.x : pos.y;
            const zones = document.querySelectorAll('.sl-mobile-zone');
            startSizes = Array.from(zones).map(z => isLandscape ? z.offsetWidth : z.offsetHeight);
        };
        
        const moveDrag = (pos) => {
            if (!isDragging) return;
            const isLandscape = state.mobileOrientation === 'landscape';
            const currentPos = isLandscape ? pos.x : pos.y;
            const delta = currentPos - startPos;
            
            const zones = document.querySelectorAll('.sl-mobile-zone');
            if (zones.length < 2) return;
            
            const total = startSizes[0] + startSizes[1];
            const newSize1 = Math.max(100, Math.min(total - 100, startSizes[0] + delta));
            const newSize2 = total - newSize1;
            
            zones[0].style.flex = `0 0 ${newSize1}px`;
            zones[1].style.flex = `0 0 ${newSize2}px`;
        };
        
        const endDrag = () => {
            isDragging = false;
        };
        
        divider.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            beginDrag({ x: touch.clientX, y: touch.clientY });
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            moveDrag({ x: touch.clientX, y: touch.clientY });
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            endDrag();
        });
        
        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            beginDrag({ x: e.clientX, y: e.clientY });
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            moveDrag({ x: e.clientX, y: e.clientY });
        });
        
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            endDrag();
        });
    }
    
    // Store panel configs for re-registration
    const panelConfigs = [];
    
    function reRegisterPanels() {
        panels.clear();
        panelConfigs.forEach(config => {
            registerPanel(config, true);
        });
    }
    
    // ========================================
    // PANEL REGISTRATION
    // ========================================
    
    const panels = new Map();
    
    function registerPanel(config, isReRegister = false) {
        const { id, icon, title, createContent, showInToolbar = true } = config;
        
        // Store config for re-registration
        if (!isReRegister) {
            panelConfigs.push(config);
        }
        
        panels.set(id, config);
        
        // Skip toolbar for hidden panels
        if (!showInToolbar) return;
        
        // Add to toolbar items container
        const itemsContainer = document.getElementById('sl-toolbar-items');
        if (itemsContainer) {
            const spacer = itemsContainer.querySelector('.sl-toolbar-spacer');
            const btn = createToolbarItem(icon, id, t(`panels.${id}.title`) || title);
            
            btn.addEventListener('click', () => {
                if (state.deviceMode === 'mobile') {
                    // Mobile: toggle panel in zone
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
                    const winState = state.windows.get(id);
                    if (winState) {
                        toggleWindow(id);
                    } else {
                        // Create window
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
                        });
                        // Add to float layer if available
                        const floatLayer = document.getElementById('sl-float-layer');
                        if (floatLayer) {
                            floatLayer.appendChild(win);
                        } else {
                            document.getElementById('sl-workspace').appendChild(win);
                        }
                        updateToolbarItem(id, true, true, false);
                    }
                }
            });
            
            itemsContainer.insertBefore(btn, spacer);
            
            // Check for overflow after adding item
            setTimeout(checkToolbarOverflow, 0);
        }
    }
    
    // ========================================
    // PUBLIC API
    // ========================================
    
    return {
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
        
        // Windows (desktop mode)
        createWindow,
        openWindow,
        closeWindow,
        toggleWindow,
        bringToFront,
        
        // Docking
        dockWindow,
        renderDockTree,
        
        // Panels
        registerPanel,
        
        // Mobile zones
        openPanel,
        openPanelInZone,
        closePanelInZone,
        focusZone,
        
        // User
        setUser,
        toggleUserMenu,
        createProfileContent,
        createSettingsContent,
        
        // Device mode
        setForceMode,
        isMobileDevice,
        
        // State access
        get state() { return state; }
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SLUI;
}

