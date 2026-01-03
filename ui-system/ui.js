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
        
        const newOrientation = detectOrientation();
        
        // Skip if nothing meaningful changed (prevents keyboard-triggered redraws)
        const modeChanged = prevMode !== state.deviceMode;
        const orientationChanged = prevOrientation !== newOrientation;
        
        state.mobileOrientation = newOrientation;
        
        const app = document.querySelector('.sl-app');
        if (app) {
            app.dataset.mode = state.deviceMode;
            app.dataset.orientation = state.mobileOrientation;
            
            // Update toolbar position for mobile
            if (state.deviceMode === 'mobile') {
                app.dataset.toolbarPosition = state.mobileOrientation === 'portrait' ? 'top' : 'left';
            }
        }
        
        // Only rebuild mobile zones if mode or orientation actually changed
        if (state.deviceMode === 'mobile' && (modeChanged || orientationChanged)) {
            // If orientation changed, remap existing zone assignments
            if (prevMode === 'mobile' && orientationChanged) {
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
        
        // Window controls (dock/undock/close) - appear on hover
        const controls = document.createElement('div');
        controls.className = 'sl-window-controls';
        
        // Dock button (only shown when floating)
        const dockBtn = document.createElement('button');
        dockBtn.className = 'sl-window-ctrl-btn dock';
        dockBtn.innerHTML = '↘'; // Down-right arrow for dock
        dockBtn.title = 'Dock';
        dockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dockWindow(id, 'right'); // Dock to right by default
        });
        controls.appendChild(dockBtn);
        
        // Undock button (only shown when docked)
        const undockBtn = document.createElement('button');
        undockBtn.className = 'sl-window-ctrl-btn undock';
        undockBtn.innerHTML = '↗'; // Up-left arrow for undock
        undockBtn.title = 'Undock';
        undockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            undockWindow(id);
        });
        controls.appendChild(undockBtn);
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sl-window-ctrl-btn close';
        closeBtn.innerHTML = '×';
        closeBtn.title = t('window.close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDockWindow(id);
        });
        controls.appendChild(closeBtn);
        
        body.appendChild(controls);
        
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
        
        // Setup window controls hover
        setupWindowControlsHover(body, controls);
        
        // Store window state (store container as the main element)
        state.windows.set(id, {
            element: container,
            window: win,
            body: body,
            frame: frame,
            options,
            visible: true
        });
        
        // Setup interactions
        setupFrameHover(container, body, frame);
        setupWindowDrag(container, frame);
        if (resizable) setupWindowResize(container, body);
        setupWindowFocus(container);
        
        // Store controls reference for docked state updates
        state.windows.get(id).controls = controls;
        
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
    
    // Setup hover detection for window controls
    function setupWindowControlsHover(body, controls) {
        const hoverZone = 60; // pixels from corner
        
        body.addEventListener('mousemove', (e) => {
            const rect = body.getBoundingClientRect();
            const fromRight = rect.right - e.clientX;
            const fromTop = e.clientY - rect.top;
            
            // Show controls when near top-right corner
            const nearControls = fromRight < hoverZone && fromTop < hoverZone;
            controls.classList.toggle('visible', nearControls);
        });
        
        body.addEventListener('mouseleave', () => {
            controls.classList.remove('visible');
        });
        
        // Keep controls visible while hovering them
        controls.addEventListener('mouseenter', () => {
            controls.classList.add('visible');
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
        winState.element.style.display = '';
        
        // If element is not in document (orphaned or never added), add to float layer
        if (!document.body.contains(winState.element)) {
            const floatLayer = document.getElementById('sl-float-layer');
            if (floatLayer) {
                // Reset position to center
                const width = winState.options.width || 400;
                const height = winState.options.height || 300;
                winState.element.style.left = `${(window.innerWidth - width) / 2}px`;
                winState.element.style.top = `${(window.innerHeight - height) / 2}px`;
                winState.element.style.width = `${width}px`;
                winState.element.style.height = `${height}px`;
                
                floatLayer.appendChild(winState.element);
            }
        }
        
        bringToFront(windowId);
        
        updateToolbarItem(windowId, true, true, false);
    }
    
    function toggleWindow(windowId) {
        const winState = state.windows.get(windowId);
        
        if (!winState) {
            return;
        }
        
        if (winState.visible) {
            // Use closeDockWindow to properly handle docked windows
            closeDockWindow(windowId);
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
    
    // Remove a window from the dock tree, sibling takes parent's place
    function removeFromDockTree(panelId) {
        if (!state.dockTree) return;
        
        // Special case: only one window docked
        if (state.dockTree.type === 'leaf' && state.dockTree.panelId === panelId) {
            state.dockTree = null;
            return;
        }
        
        // Recursive search and removal
        removeNodeByPanelId(state.dockTree, panelId, null, null);
    }
    
    function removeNodeByPanelId(tree, panelId, parent, parentKey) {
        if (!tree || tree.type !== 'split') return false;
        
        // Check if first child is the target
        if (tree.first.type === 'leaf' && tree.first.panelId === panelId) {
            // Replace parent split with second child
            if (parent && parentKey) {
                parent[parentKey] = tree.second;
            } else {
                state.dockTree = tree.second;
            }
            return true;
        }
        
        // Check if second child is the target
        if (tree.second.type === 'leaf' && tree.second.panelId === panelId) {
            // Replace parent split with first child
            if (parent && parentKey) {
                parent[parentKey] = tree.first;
            } else {
                state.dockTree = tree.first;
            }
            return true;
        }
        
        // Recurse into children
        if (tree.first.type === 'split') {
            if (removeNodeByPanelId(tree.first, panelId, tree, 'first')) return true;
        }
        if (tree.second.type === 'split') {
            if (removeNodeByPanelId(tree.second, panelId, tree, 'second')) return true;
        }
        
        return false;
    }
    
    // Undock a window - remove from tree and float it
    function undockWindow(windowId) {
        const winState = state.windows.get(windowId);
        if (!winState || !state.dockedWindows.has(windowId)) return;
        
        // Remove from dock tree
        removeFromDockTree(windowId);
        state.dockedWindows.delete(windowId);
        
        // Re-render dock layer
        renderDockTree();
        
        // Move to float layer
        const floatLayer = document.getElementById('sl-float-layer');
        if (floatLayer) {
            // Position in center of screen
            const width = winState.options.width || 400;
            const height = winState.options.height || 300;
            winState.element.style.left = `${(window.innerWidth - width) / 2}px`;
            winState.element.style.top = `${(window.innerHeight - height) / 2}px`;
            winState.element.style.width = `${width}px`;
            winState.element.style.height = `${height}px`;
            
            floatLayer.appendChild(winState.element);
            bringToFront(windowId);
        }
        
        updateToolbarItem(windowId, true, true, false);
    }
    
    // Close a window - remove from dock tree if docked, then hide
    function closeDockWindow(windowId) {
        const winState = state.windows.get(windowId);
        if (!winState) return;
        
        if (state.dockedWindows.has(windowId)) {
            // Remove from dock tree first
            removeFromDockTree(windowId);
            state.dockedWindows.delete(windowId);
            renderDockTree();
        }
        
        // Remove from float layer if there
        const floatLayer = document.getElementById('sl-float-layer');
        if (floatLayer && winState.element.parentNode === floatLayer) {
            floatLayer.removeChild(winState.element);
        }
        
        // Hide the window
        winState.visible = false;
        winState.element.style.display = 'none';
        
        // Mark as not loaded/visible in toolbar
        updateToolbarItem(windowId, false, false, false);
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
    // SLIDER COMPONENTS
    // ========================================

    // Helper for drag interactions (reduces duplication)
    function setupDrag(element, onMove, onStart, onEnd) {
        element.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            element.setPointerCapture(e.pointerId);
            if (onStart) onStart(e);
            onMove(e);
            
            const moveHandler = (e) => onMove(e);
            const upHandler = (e) => {
                element.releasePointerCapture(e.pointerId);
                element.removeEventListener('pointermove', moveHandler);
                element.removeEventListener('pointerup', upHandler);
                element.removeEventListener('pointercancel', upHandler);
                if (onEnd) onEnd(e);
            };
            
            element.addEventListener('pointermove', moveHandler);
            element.addEventListener('pointerup', upHandler);
            element.addEventListener('pointercancel', upHandler);
        });
    }

    function Slider(options = {}) {
        const {
            min = 0,
            max = 100,
            value = 50,
            step = 1,
            disabled = false,
            showValue = true,
            valueFormat = (v) => v.toFixed(step < 1 ? 2 : 0),
            onChange = null,
            onInput = null,
            className = ''
        } = options;
        
        const container = document.createElement('div');
        container.className = `sl-slider ${className}`.trim();
        
        const track = document.createElement('div');
        track.className = 'sl-slider-track';
        if (disabled) track.classList.add('disabled');
        
        const trackBg = document.createElement('div');
        trackBg.className = 'sl-slider-track-bg';
        
        const fill = document.createElement('div');
        fill.className = 'sl-slider-track-fill';
        
        const thumb = document.createElement('div');
        thumb.className = 'sl-slider-thumb';
        thumb.tabIndex = disabled ? -1 : 0;
        
        const input = document.createElement('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;
        input.disabled = disabled;
        input.className = 'sl-slider-input';
        
        trackBg.appendChild(fill);
        trackBg.appendChild(thumb);
        track.appendChild(trackBg);
        track.appendChild(input);
        container.appendChild(track);
        
        let valueDisplay = null;
        if (showValue) {
            valueDisplay = document.createElement('span');
            valueDisplay.className = 'sl-slider-value';
            valueDisplay.textContent = valueFormat(value);
            container.appendChild(valueDisplay);
        }
        
        function updateVisuals() {
            const percent = ((input.value - min) / (max - min)) * 100;
            fill.style.width = `${percent}%`;
            thumb.style.left = `${percent}%`;
        }
        
        input.addEventListener('input', (e) => {
            updateVisuals();
            if (valueDisplay) valueDisplay.textContent = valueFormat(parseFloat(input.value));
            if (onInput) onInput(parseFloat(input.value), e);
        });
        
        input.addEventListener('change', (e) => {
            if (onChange) onChange(parseFloat(input.value), e);
        });
        
        trackBg.addEventListener('click', (e) => {
            if (disabled) return;
            const rect = trackBg.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const newValue = min + percent * (max - min);
            const stepped = Math.round(newValue / step) * step;
            input.value = Math.max(min, Math.min(max, stepped));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        updateVisuals();
        
        container.getValue = () => parseFloat(input.value);
        container.setValue = (v) => {
            input.value = Math.max(min, Math.min(max, v));
            updateVisuals();
            if (valueDisplay) valueDisplay.textContent = valueFormat(v);
        };
        container.setDisabled = (d) => {
            input.disabled = d;
            track.classList.toggle('disabled', d);
        };
        
        return container;
    }
    
    function LabeledSlider(options = {}) {
        const {
            min = 0,
            max = 100,
            value = 50,
            step = 1,
            disabled = false,
            showValue = true,
            showMinMax = true,
            minLabel = null,
            maxLabel = null,
            valueFormat = (v) => v.toFixed(step < 1 ? 2 : 0),
            onChange = null,
            onInput = null,
            className = ''
        } = options;
        
        const container = document.createElement('div');
        container.className = `sl-labeled-slider ${className}`.trim();
        
        const slider = Slider({ min, max, value, step, disabled, showValue, valueFormat, onChange, onInput });
        container.appendChild(slider);
        
        if (showMinMax) {
            const labels = document.createElement('div');
            labels.className = 'sl-slider-labels';
            labels.innerHTML = `
                <span class="sl-slider-label-min">${minLabel !== null ? minLabel : valueFormat(min)}</span>
                <span class="sl-slider-label-max">${maxLabel !== null ? maxLabel : valueFormat(max)}</span>
            `;
            container.appendChild(labels);
        }
        
        container.getValue = () => slider.getValue();
        container.setValue = (v) => slider.setValue(v);
        container.setDisabled = (d) => slider.setDisabled(d);
        
        return container;
    }
    
    function SliderGroup(options = {}) {
        const {
            label = 'Value',
            min = 0,
            max = 100,
            value = 50,
            step = 1,
            disabled = false,
            showInput = true,
            showMinMax = false,
            valueFormat = (v) => v.toFixed(step < 1 ? 2 : 0),
            onChange = null,
            onInput = null,
            className = ''
        } = options;
        
        const container = document.createElement('div');
        container.className = `sl-slider-group ${className}`.trim();
        if (disabled) container.classList.add('disabled');
        
        const labelEl = document.createElement('label');
        labelEl.className = 'sl-slider-group-label';
        labelEl.textContent = label;
        
        const row = document.createElement('div');
        row.className = 'sl-slider-group-row';
        
        const slider = LabeledSlider({
            min, max, value, step, disabled,
            showValue: !showInput,
            showMinMax,
            valueFormat,
            onInput: (v, e) => {
                if (numberInput) numberInput.value = valueFormat(v);
                if (onInput) onInput(v, e);
            },
            onChange
        });
        row.appendChild(slider);
        
        let numberInput = null;
        if (showInput) {
            numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.className = 'sl-slider-group-input';
            numberInput.min = min;
            numberInput.max = max;
            numberInput.step = step;
            numberInput.value = valueFormat(value);
            numberInput.disabled = disabled;
            
            numberInput.addEventListener('change', () => {
                let v = parseFloat(numberInput.value);
                if (isNaN(v)) v = min;
                v = Math.max(min, Math.min(max, v));
                slider.setValue(v);
                numberInput.value = valueFormat(v);
                if (onChange) onChange(v);
            });
            
            row.appendChild(numberInput);
        }
        
        container.appendChild(labelEl);
        container.appendChild(row);
        
        container.getValue = () => slider.getValue();
        container.setValue = (v) => {
            slider.setValue(v);
            if (numberInput) numberInput.value = valueFormat(v);
        };
        container.setDisabled = (d) => {
            slider.setDisabled(d);
            if (numberInput) numberInput.disabled = d;
            container.classList.toggle('disabled', d);
        };
        container.setLabel = (l) => { labelEl.textContent = l; };
        
        return container;
    }
    
    // ========================================
    // UNIFORM SLIDER - Expandable uniform control
    // ========================================
    
    function UniformSlider(options = {}) {
        const {
            name = 'u_custom0',
            min = 0,
            max = 1,
            value = 0.5,
            step = 0.01,
            isInt = false,
            locked = false,
            expanded = false,
            onChange = null,
            onNameChange = null,
            onRangeChange = null,
            onExpand = null,
            onCollapse = null,
            onRemove = null
        } = options;
        
        const decimals = 4;
        const stepDecimals = isInt ? 0 : 4; // Int sliders show integer step
        let currentName = name;
        let currentMin = min;
        let currentMax = max;
        let currentValue = Math.max(min, Math.min(max, value));
        let currentStep = isInt ? 1 : step;
        let isLocked = locked;
        let isExpanded = expanded;
        
        const container = document.createElement('div');
        container.className = 'sl-uniform-slider';
        if (isExpanded) container.classList.add('expanded');
        
        // Toggle button (used in both top row when expanded, middle row when minimized)
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sl-uniform-toggle';
        toggleBtn.textContent = '▼';
        toggleBtn.title = 'Expand';
        toggleBtn.style.cursor = 'pointer';
        
        // Top row: Start | Value | End | Toggle(▲)
        const topRow = document.createElement('div');
        topRow.className = 'sl-uniform-row sl-uniform-row-top';
        
        const startInput = createEditableNum(currentMin, (v) => {
            currentMin = v;
            if (currentMin > currentMax) { currentMax = currentMin; endInput.setValue(currentMax); }
            if (currentValue < currentMin) {
                currentValue = currentMin;
                valueInput.setValue(currentValue);
                updateTrackVisuals();
            }
            if (onRangeChange) onRangeChange(currentMin, currentMax);
        }, isInt, decimals);
        startInput.classList.add('sl-uniform-start');
        
        const valueInput = createEditableNum(currentValue, (v) => {
            currentValue = Math.max(currentMin, Math.min(currentMax, v));
            valueInput.setValue(currentValue);
            updateTrackVisuals();
            if (onChange) onChange(currentValue, currentName);
        }, isInt, decimals);
        valueInput.classList.add('sl-uniform-value');
        
        const endInput = createEditableNum(currentMax, (v) => {
            currentMax = v;
            if (currentMax < currentMin) { currentMin = currentMax; startInput.setValue(currentMin); }
            if (currentValue > currentMax) {
                currentValue = currentMax;
                valueInput.setValue(currentValue);
                updateTrackVisuals();
            }
            if (onRangeChange) onRangeChange(currentMin, currentMax);
        }, isInt, decimals);
        endInput.classList.add('sl-uniform-end');
        
        // Toggle button clone for top row (minimize button)
        const topToggleBtn = document.createElement('button');
        topToggleBtn.className = 'sl-uniform-toggle';
        topToggleBtn.textContent = '▲';
        topToggleBtn.title = 'Collapse';
        topToggleBtn.style.cursor = 'pointer';
        
        topRow.appendChild(startInput);
        topRow.appendChild(valueInput);
        topRow.appendChild(endInput);
        topRow.appendChild(topToggleBtn);
        
        // Middle row: Label | Slider Track | Toggle(▼) (toggle only when minimized)
        const middleRow = document.createElement('div');
        middleRow.className = 'sl-uniform-row sl-uniform-row-middle';
        
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'sl-uniform-label';
        labelInput.value = currentName;
        // Don't use readOnly toggle - causes mobile keyboard issues
        labelInput.addEventListener('blur', () => {
            currentName = labelInput.value || 'u_custom';
            if (onNameChange) onNameChange(currentName);
        });
        labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        labelInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        
        // Slider track
        const track = document.createElement('div');
        track.className = 'sl-slider-track';
        track.style.cursor = 'pointer';
        
        const trackBg = document.createElement('div');
        trackBg.className = 'sl-slider-track-bg';
        
        const fill = document.createElement('div');
        fill.className = 'sl-slider-track-fill';
        
        const thumb = document.createElement('div');
        thumb.className = 'sl-slider-thumb';
        thumb.style.cursor = 'pointer';
        
        trackBg.appendChild(fill);
        trackBg.appendChild(thumb);
        track.appendChild(trackBg);
        
        function updateTrackVisuals() {
            const percent = ((currentValue - currentMin) / (currentMax - currentMin)) * 100;
            fill.style.width = `${percent}%`;
            thumb.style.left = `${percent}%`;
        }
        
        // Track interaction
        function handleTrackPointer(e) {
            if (isLocked) return;
            const rect = trackBg.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            let newValue = currentMin + percent * (currentMax - currentMin);
            newValue = Math.round(newValue / currentStep) * currentStep;
            currentValue = Math.max(currentMin, Math.min(currentMax, newValue));
            updateTrackVisuals();
            valueInput.setValue(currentValue);
            if (onChange) onChange(currentValue, currentName);
        }
        
        track.addEventListener('pointerdown', (e) => {
            if (isLocked) return;
            e.preventDefault();
            track.setPointerCapture(e.pointerId); // Capture for reliable mobile tracking
            track.classList.add('dragging');
            handleTrackPointer(e);

            const moveHandler = (e) => handleTrackPointer(e);
            const upHandler = (e) => {
                track.releasePointerCapture(e.pointerId);
                track.classList.remove('dragging');
                track.removeEventListener('pointermove', moveHandler);
                track.removeEventListener('pointerup', upHandler);
                track.removeEventListener('pointercancel', upHandler);
            };

            track.addEventListener('pointermove', moveHandler);
            track.addEventListener('pointerup', upHandler);
            track.addEventListener('pointercancel', upHandler);
        });
        
        middleRow.appendChild(labelInput);
        middleRow.appendChild(track);
        middleRow.appendChild(toggleBtn);
        
        // Bottom row: Lock | Step | Incrementer | Close
        const bottomRow = document.createElement('div');
        bottomRow.className = 'sl-uniform-row sl-uniform-row-bottom';
        
        const lockBtn = document.createElement('button');
        lockBtn.className = 'sl-uniform-lock';
        lockBtn.textContent = isLocked ? '🔒' : '🔓';
        lockBtn.title = 'Lock value';
        lockBtn.style.cursor = 'pointer';
        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isLocked = !isLocked;
            lockBtn.textContent = isLocked ? '🔒' : '🔓';
            container.classList.toggle('locked', isLocked);
        });
        
        // Step input (aligned with End)
        const stepInput = createEditableNum(currentStep, (v) => {
            currentStep = Math.max(isInt ? 1 : 0.0001, v);
            if (isInt) currentStep = Math.round(currentStep);
            stepInput.setValue(currentStep);
        }, isInt, stepDecimals);
        stepInput.classList.add('sl-uniform-step');
        
        // Incrementer (aligned with Value)
        const incrementer = document.createElement('div');
        incrementer.className = 'sl-uniform-incrementer';
        
        const decBtn = document.createElement('button');
        decBtn.className = 'sl-uniform-inc-btn';
        decBtn.textContent = '<';
        decBtn.style.cursor = 'pointer';
        decBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isLocked) return;
            currentValue = Math.max(currentMin, currentValue - currentStep);
            updateTrackVisuals();
            valueInput.setValue(currentValue);
            if (onChange) onChange(currentValue, currentName);
        });
        
        const incBtn = document.createElement('button');
        incBtn.className = 'sl-uniform-inc-btn';
        incBtn.textContent = '>';
        incBtn.style.cursor = 'pointer';
        incBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isLocked) return;
            currentValue = Math.min(currentMax, currentValue + currentStep);
            updateTrackVisuals();
            valueInput.setValue(currentValue);
            if (onChange) onChange(currentValue, currentName);
        });
        
        incrementer.appendChild(decBtn);
        incrementer.appendChild(incBtn);
        
        // Close button (aligned with Toggle position)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sl-uniform-close';
        closeBtn.textContent = '×';
        closeBtn.title = 'Remove';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onRemove) onRemove(container);
        });
        
        bottomRow.appendChild(lockBtn);
        bottomRow.appendChild(stepInput);
        bottomRow.appendChild(incrementer);
        bottomRow.appendChild(closeBtn);
        
        // Assemble
        container.appendChild(topRow);
        container.appendChild(middleRow);
        container.appendChild(bottomRow);
        
        updateTrackVisuals();
        
        // Expand/Collapse functions
        function expand() {
            if (isExpanded) return;
            isExpanded = true;
            container.classList.add('expanded');
            toggleBtn.textContent = '▲';
            toggleBtn.title = 'Collapse';
            if (onExpand) onExpand(container);
        }
        
        function collapse() {
            if (!isExpanded) return;
            isExpanded = false;
            container.classList.remove('expanded');
            toggleBtn.textContent = '▼';
            toggleBtn.title = 'Expand';
            if (onCollapse) onCollapse(container);
        }
        
        function toggle() {
            if (isExpanded) collapse();
            else expand();
        }
        
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });
        
        topToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            collapse();
        });
        
        // Public API
        container.expand = expand;
        container.collapse = collapse;
        container.isExpanded = () => isExpanded;
        container.getValue = () => currentValue;
        container.setValue = (v) => {
            currentValue = Math.max(currentMin, Math.min(currentMax, v));
            updateTrackVisuals();
            valueInput.setValue(currentValue);
        };
        container.getName = () => currentName;
        container.setName = (n) => { currentName = n; labelInput.value = n; };
        container.getRange = () => ({ min: currentMin, max: currentMax });
        container.setRange = (newMin, newMax) => {
            currentMin = newMin;
            currentMax = newMax;
            startInput.setValue(currentMin);
            endInput.setValue(currentMax);
        };
        container.isLocked = () => isLocked;
        container.setLocked = (l) => {
            isLocked = l;
            lockBtn.textContent = isLocked ? '🔒' : '🔓';
            container.classList.toggle('locked', isLocked);
        };
        container.getData = () => ({
            name: currentName,
            value: currentValue,
            min: currentMin,
            max: currentMax,
            step: currentStep,
            locked: isLocked
        });
        
        return container;
    }
    
    function createEditableNum(value, onChange, isInt = false, decimals = 2) {
        const container = document.createElement('div');
        container.className = 'sl-editable-number';
        
        const display = document.createElement('span');
        display.className = 'sl-editable-number-display';
        display.textContent = isInt ? Math.round(value).toString() : value.toFixed(decimals);
        
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'sl-editable-number-input';
        input.value = value;
        input.step = isInt ? 1 : Math.pow(10, -decimals);
        input.inputMode = isInt ? 'numeric' : 'decimal'; // Mobile keyboard hint
        
        container.appendChild(display);
        container.appendChild(input);
        
        let isEditing = false;
        let currentValue = value;
        let focusTimeout = null;
        
        function startEditing(e) {
            e.stopPropagation();
            e.preventDefault();
            if (isEditing) return;
            
            isEditing = true;
            container.classList.add('editing');
            input.value = currentValue;
            
            // Delay focus slightly for mobile to settle
            focusTimeout = setTimeout(() => {
                input.focus();
                input.select();
            }, 50);
        }
        
        display.addEventListener('click', startEditing);
        display.addEventListener('touchend', startEditing);
        
        // Prevent pointer events from bubbling to slider handlers
        container.addEventListener('pointerdown', (e) => e.stopPropagation());
        container.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        
        input.addEventListener('blur', () => {
            if (focusTimeout) clearTimeout(focusTimeout);
            // Small delay to ensure we're not in a focus-blur loop
            setTimeout(() => {
                if (document.activeElement === input) return; // Still focused
                isEditing = false;
                container.classList.remove('editing');
                let v = parseFloat(input.value);
                if (isNaN(v)) v = currentValue;
                if (isInt) v = Math.round(v);
                currentValue = v;
                display.textContent = isInt ? Math.round(currentValue).toString() : currentValue.toFixed(decimals);
                if (onChange) onChange(currentValue);
            }, 10);
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            else if (e.key === 'Escape') { input.value = currentValue; input.blur(); }
        });
        
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        
        container.getValue = () => currentValue;
        container.setValue = (v) => {
            currentValue = v;
            display.textContent = isInt ? Math.round(currentValue).toString() : currentValue.toFixed(decimals);
            if (!isEditing) input.value = v;
        };
        
        return container;
    }
    
    // ========================================
    // SLIDER STACK - Container for uniforms
    // ========================================
    
    function SliderStack(options = {}) {
        const {
            sliders = [],
            addable = true,
            removable = true,
            onChange = null,
            onAdd = null,
            onRemove = null
        } = options;
        
        const container = document.createElement('div');
        container.className = 'sl-slider-stack';
        
        const slidersContainer = document.createElement('div');
        slidersContainer.className = 'sl-slider-stack-sliders';
        container.appendChild(slidersContainer);
        
        let addBtn = null;
        if (addable) {
            addBtn = document.createElement('button');
            addBtn.className = 'sl-slider-stack-add';
            addBtn.textContent = '+ Add';
            addBtn.style.cursor = 'pointer';
            addBtn.addEventListener('click', () => {
                const newSlider = addSlider({
                    name: `u_custom${sliderElements.length}`,
                    value: 0.5,
                    min: 0,
                    max: 1
                });
                if (onAdd) onAdd(newSlider.getData());
            });
            container.appendChild(addBtn);
        }
        
        const sliderElements = [];
        
        function addSlider(config) {
            const wrapper = document.createElement('div');
            wrapper.className = 'sl-slider-stack-item';

            const slider = UniformSlider({
                ...config,
                onChange: (value, name) => {
                    if (onChange) onChange(value, name, sliderElements.indexOf(wrapper));
                },
                onRemove: removable ? () => {
                    removeSlider(sliderElements.indexOf(wrapper));
                } : null
            });

            wrapper.appendChild(slider);

            sliderElements.push(wrapper);
            slidersContainer.appendChild(wrapper);

            wrapper.sliderAPI = slider;
            return slider;
        }
        
        function removeSlider(index) {
            if (index < 0 || index >= sliderElements.length) return;
            
            const wrapper = sliderElements[index];
            const data = wrapper.sliderAPI.getData();
            
            wrapper.remove();
            sliderElements.splice(index, 1);
            
            if (onRemove) onRemove(data, index);
        }
        
        sliders.forEach(config => addSlider(config));
        
        container.addSlider = addSlider;
        container.removeSlider = removeSlider;
        container.getSliders = () => sliderElements.map(w => w.sliderAPI);
        container.getData = () => sliderElements.map(w => w.sliderAPI.getData());
        container.setData = (data) => {
            while (sliderElements.length > 0) removeSlider(0);
            data.forEach(config => addSlider(config));
        };
        container.collapseAll = () => {
            if (expandedIndex >= 0) {
                sliderElements[expandedIndex].sliderAPI.collapse();
            }
        };

        return container;
    }

    // ========================================
    // PARAMETER SLIDER - Title + Slider + Value + Incrementer
    // ========================================
    
    function ParameterSlider(options = {}) {
        const {
            title = 'Parameter',
            min = 0,
            max = 1,
            value = 0.5,
            step = 0.01,
            isInt = false,
            showIncrementer = true,
            valueFormat = null,
            disabled = false,
            onChange = null
        } = options;
        
        let currentValue = Math.max(min, Math.min(max, value));
        let currentStep = isInt ? Math.max(1, Math.round(step)) : step;
        
        const container = document.createElement('div');
        container.className = 'sl-param-slider';
        if (disabled) container.classList.add('disabled');
        
        // Title
        const titleEl = document.createElement('span');
        titleEl.className = 'sl-param-title';
        titleEl.textContent = title;
        container.appendChild(titleEl);
        
        // Slider track
        const track = document.createElement('div');
        track.className = 'sl-slider-track';
        track.style.cursor = disabled ? 'default' : 'pointer';
        
        const trackBg = document.createElement('div');
        trackBg.className = 'sl-slider-track-bg';
        
        const fill = document.createElement('div');
        fill.className = 'sl-slider-track-fill';
        
        const thumb = document.createElement('div');
        thumb.className = 'sl-slider-thumb';
        thumb.style.cursor = disabled ? 'default' : 'pointer';
        
        trackBg.appendChild(fill);
        trackBg.appendChild(thumb);
        track.appendChild(trackBg);
        container.appendChild(track);
        
        function formatValue(v) {
            if (valueFormat) return valueFormat(v);
            if (isInt) return Math.round(v).toString();
            return v.toFixed(step < 0.01 ? 3 : 2);
        }
        
        function updateVisuals() {
            const percent = ((currentValue - min) / (max - min)) * 100;
            fill.style.width = `${percent}%`;
            thumb.style.left = `${percent}%`;
            valueEl.textContent = formatValue(currentValue);
        }
        
        // Value display
        const valueEl = document.createElement('span');
        valueEl.className = 'sl-param-value';
        valueEl.textContent = formatValue(currentValue);
        container.appendChild(valueEl);
        
        // Optional incrementer
        if (showIncrementer) {
            const incrementer = document.createElement('div');
            incrementer.className = 'sl-param-incrementer';
            
            const decBtn = document.createElement('button');
            decBtn.className = 'sl-param-inc-btn';
            decBtn.textContent = '−';
            decBtn.addEventListener('click', () => {
                if (disabled) return;
                currentValue = Math.max(min, currentValue - currentStep);
                if (isInt) currentValue = Math.round(currentValue);
                updateVisuals();
                if (onChange) onChange(currentValue);
            });
            
            const incBtn = document.createElement('button');
            incBtn.className = 'sl-param-inc-btn';
            incBtn.textContent = '+';
            incBtn.addEventListener('click', () => {
                if (disabled) return;
                currentValue = Math.min(max, currentValue + currentStep);
                if (isInt) currentValue = Math.round(currentValue);
                updateVisuals();
                if (onChange) onChange(currentValue);
            });
            
            incrementer.appendChild(decBtn);
            incrementer.appendChild(incBtn);
            container.appendChild(incrementer);
        }
        
        // Track interaction
        function handleTrackPointer(e) {
            if (disabled) return;
            const rect = trackBg.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            let newValue = min + percent * (max - min);
            newValue = Math.round(newValue / currentStep) * currentStep;
            if (isInt) newValue = Math.round(newValue);
            currentValue = Math.max(min, Math.min(max, newValue));
            updateVisuals();
            if (onChange) onChange(currentValue);
        }
        
        track.addEventListener('pointerdown', (e) => {
            if (disabled) return;
            e.preventDefault();
            track.setPointerCapture(e.pointerId);
            track.classList.add('dragging');
            handleTrackPointer(e);
            
            const moveHandler = (e) => handleTrackPointer(e);
            const upHandler = (e) => {
                track.releasePointerCapture(e.pointerId);
                track.classList.remove('dragging');
                track.removeEventListener('pointermove', moveHandler);
                track.removeEventListener('pointerup', upHandler);
                track.removeEventListener('pointercancel', upHandler);
            };
            
            track.addEventListener('pointermove', moveHandler);
            track.addEventListener('pointerup', upHandler);
            track.addEventListener('pointercancel', upHandler);
        });
        
        updateVisuals();
        
        // Public API
        container.getValue = () => currentValue;
        container.setValue = (v) => {
            currentValue = Math.max(min, Math.min(max, v));
            if (isInt) currentValue = Math.round(currentValue);
            updateVisuals();
        };
        container.setDisabled = (d) => {
            container.classList.toggle('disabled', d);
            track.style.cursor = d ? 'default' : 'pointer';
            thumb.style.cursor = d ? 'default' : 'pointer';
        };
        container.setTitle = (t) => { titleEl.textContent = t; };
        
        return container;
    }
    
    // ========================================
    // ICON SLIDER - Icon + Slider
    // ========================================
    
    function IconSlider(options = {}) {
        const {
            icon = '🔊',
            min = 0,
            max = 1,
            value = 0.5,
            step = 0.01,
            isInt = false,
            compact = false,
            disabled = false,
            onChange = null
        } = options;
        
        let currentValue = Math.max(min, Math.min(max, value));
        let currentStep = isInt ? Math.max(1, Math.round(step)) : step;
        
        const container = document.createElement('div');
        container.className = 'sl-icon-slider';
        if (compact) container.classList.add('compact');
        if (disabled) container.classList.add('disabled');
        
        // Icon
        const iconEl = document.createElement('span');
        iconEl.className = 'sl-icon-slider-icon';
        iconEl.innerHTML = icon;
        container.appendChild(iconEl);
        
        // Slider track
        const track = document.createElement('div');
        track.className = 'sl-slider-track';
        track.style.cursor = disabled ? 'default' : 'pointer';
        
        const trackBg = document.createElement('div');
        trackBg.className = 'sl-slider-track-bg';
        
        const fill = document.createElement('div');
        fill.className = 'sl-slider-track-fill';
        
        const thumb = document.createElement('div');
        thumb.className = 'sl-slider-thumb';
        thumb.style.cursor = disabled ? 'default' : 'pointer';
        
        trackBg.appendChild(fill);
        trackBg.appendChild(thumb);
        track.appendChild(trackBg);
        container.appendChild(track);
        
        function updateVisuals() {
            const percent = ((currentValue - min) / (max - min)) * 100;
            fill.style.width = `${percent}%`;
            thumb.style.left = `${percent}%`;
        }
        
        // Track interaction
        function handleTrackPointer(e) {
            if (disabled) return;
            const rect = trackBg.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            let newValue = min + percent * (max - min);
            newValue = Math.round(newValue / currentStep) * currentStep;
            if (isInt) newValue = Math.round(newValue);
            currentValue = Math.max(min, Math.min(max, newValue));
            updateVisuals();
            if (onChange) onChange(currentValue);
        }
        
        track.addEventListener('pointerdown', (e) => {
            if (disabled) return;
            e.preventDefault();
            track.setPointerCapture(e.pointerId);
            track.classList.add('dragging');
            handleTrackPointer(e);
            
            const moveHandler = (e) => handleTrackPointer(e);
            const upHandler = (e) => {
                track.releasePointerCapture(e.pointerId);
                track.classList.remove('dragging');
                track.removeEventListener('pointermove', moveHandler);
                track.removeEventListener('pointerup', upHandler);
                track.removeEventListener('pointercancel', upHandler);
            };
            
            track.addEventListener('pointermove', moveHandler);
            track.addEventListener('pointerup', upHandler);
            track.addEventListener('pointercancel', upHandler);
        });
        
        updateVisuals();
        
        // Public API
        container.getValue = () => currentValue;
        container.setValue = (v) => {
            currentValue = Math.max(min, Math.min(max, v));
            if (isInt) currentValue = Math.round(currentValue);
            updateVisuals();
        };
        container.setIcon = (i) => { iconEl.innerHTML = i; };
        container.setDisabled = (d) => {
            container.classList.toggle('disabled', d);
            track.style.cursor = d ? 'default' : 'pointer';
            thumb.style.cursor = d ? 'default' : 'pointer';
        };
        
        return container;
    }
    
    // ========================================
    // TIMELINE SLIDER - Time scrubber
    // ========================================
    
    function TimelineSlider(options = {}) {
        const {
            duration = 60,  // Total duration in seconds
            value = 0,      // Current time in seconds
            onChange = null,
            onSeekStart = null,
            onSeekEnd = null
        } = options;
        
        let currentTime = Math.max(0, Math.min(duration, value));
        let currentDuration = duration;
        
        const container = document.createElement('div');
        container.className = 'sl-timeline-slider';
        
        // Track container (for positioning time tooltip)
        const trackContainer = document.createElement('div');
        trackContainer.className = 'sl-timeline-track-container';
        
        // Current time tooltip
        const currentTimeEl = document.createElement('div');
        currentTimeEl.className = 'sl-timeline-current';
        currentTimeEl.textContent = formatTime(currentTime);
        trackContainer.appendChild(currentTimeEl);
        
        // Slider track
        const track = document.createElement('div');
        track.className = 'sl-slider-track';
        track.style.cursor = 'pointer';
        
        const trackBg = document.createElement('div');
        trackBg.className = 'sl-slider-track-bg';
        
        const fill = document.createElement('div');
        fill.className = 'sl-slider-track-fill';
        
        const thumb = document.createElement('div');
        thumb.className = 'sl-slider-thumb';
        thumb.style.cursor = 'pointer';
        
        trackBg.appendChild(fill);
        trackBg.appendChild(thumb);
        track.appendChild(trackBg);
        trackContainer.appendChild(track);
        container.appendChild(trackContainer);
        
        // Start/End times
        const timesRow = document.createElement('div');
        timesRow.className = 'sl-timeline-times';
        
        const startTimeEl = document.createElement('span');
        startTimeEl.className = 'sl-timeline-start';
        startTimeEl.textContent = formatTime(0);
        
        const endTimeEl = document.createElement('span');
        endTimeEl.className = 'sl-timeline-end';
        endTimeEl.textContent = formatTime(currentDuration);
        
        timesRow.appendChild(startTimeEl);
        timesRow.appendChild(endTimeEl);
        container.appendChild(timesRow);
        
        function formatTime(seconds) {
            const s = Math.ceil(seconds);
            const mins = Math.floor(s / 60);
            const secs = s % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        function updateVisuals() {
            const percent = currentDuration > 0 ? (currentTime / currentDuration) * 100 : 0;
            fill.style.width = `${percent}%`;
            thumb.style.left = `${percent}%`;
            currentTimeEl.textContent = formatTime(currentTime);
            currentTimeEl.style.left = `${percent}%`;
        }
        
        // Track interaction
        function handleTrackPointer(e) {
            const rect = trackBg.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            currentTime = percent * currentDuration;
            updateVisuals();
            if (onChange) onChange(currentTime);
        }
        
        track.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            track.setPointerCapture(e.pointerId);
            container.classList.add('dragging');
            track.classList.add('dragging');
            if (onSeekStart) onSeekStart();
            handleTrackPointer(e);
            
            const moveHandler = (e) => handleTrackPointer(e);
            const upHandler = (e) => {
                track.releasePointerCapture(e.pointerId);
                container.classList.remove('dragging');
                track.classList.remove('dragging');
                if (onSeekEnd) onSeekEnd();
                track.removeEventListener('pointermove', moveHandler);
                track.removeEventListener('pointerup', upHandler);
                track.removeEventListener('pointercancel', upHandler);
            };
            
            track.addEventListener('pointermove', moveHandler);
            track.addEventListener('pointerup', upHandler);
            track.addEventListener('pointercancel', upHandler);
        });
        
        updateVisuals();
        
        // Public API
        container.getTime = () => currentTime;
        container.setTime = (t) => {
            currentTime = Math.max(0, Math.min(currentDuration, t));
            updateVisuals();
        };
        container.getDuration = () => currentDuration;
        container.setDuration = (d) => {
            currentDuration = Math.max(0, d);
            endTimeEl.textContent = formatTime(currentDuration);
            currentTime = Math.min(currentTime, currentDuration);
            updateVisuals();
        };

        return container;
    }

    // ========================================
    // CHECKBOX - Standard tick box
    // ========================================
    
    function Checkbox(options = {}) {
        const {
            label = '',
            checked = false,
            disabled = false,
            onChange = null
        } = options;
        
        let isChecked = checked;
        let isDisabled = disabled;
        
        const container = document.createElement('div');
        container.className = 'sl-checkbox';
        if (isChecked) container.classList.add('checked');
        if (isDisabled) container.classList.add('disabled');
        
        const box = document.createElement('span');
        box.className = 'sl-checkbox-box';
        
        const check = document.createElement('span');
        check.className = 'sl-checkbox-check';
        check.textContent = '✓';
        box.appendChild(check);
        
        container.appendChild(box);
        
        if (label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'sl-checkbox-label';
            labelEl.textContent = label;
            container.appendChild(labelEl);
        }
        
        function toggle() {
            if (isDisabled) return;
            isChecked = !isChecked;
            container.classList.toggle('checked', isChecked);
            if (onChange) onChange(isChecked);
        }
        
        // Simple click handler works on both desktop and mobile
        container.addEventListener('click', toggle);
        
        // Public API
        container.isChecked = () => isChecked;
        container.setChecked = (c) => {
            isChecked = c;
            container.classList.toggle('checked', isChecked);
        };
        container.setDisabled = (d) => {
            isDisabled = d;
            container.classList.toggle('disabled', d);
        };
        
        return container;
    }

    // ========================================
    // UNIFORM BOOL - Checkbox with editable title
    // ========================================
    
    function UniformBool(options = {}) {
        const {
            name = 'u_bool0',
            checked = false,
            onChange = null,
            onNameChange = null,
            onRemove = null
        } = options;
        
        let isChecked = checked;
        let currentName = name;
        
        const container = document.createElement('div');
        container.className = 'sl-uniform-bool';
        if (isChecked) container.classList.add('checked');
        
        const box = document.createElement('span');
        box.className = 'sl-checkbox-box';
        
        const check = document.createElement('span');
        check.className = 'sl-checkbox-check';
        check.textContent = '✓';
        box.appendChild(check);
        
        container.appendChild(box);
        
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'sl-uniform-bool-label';
        labelInput.value = currentName;

        labelInput.addEventListener('blur', () => {
            currentName = labelInput.value || 'u_bool';
            if (onNameChange) onNameChange(currentName);
        });
        
        container.appendChild(labelInput);
        
        function toggle() {
            isChecked = !isChecked;
            container.classList.toggle('checked', isChecked);
            if (onChange) onChange(isChecked, currentName);
        }
        
        // Click on box to toggle
        box.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });
        
        // Public API
        container.isChecked = () => isChecked;
        container.setChecked = (c) => {
            isChecked = c;
            container.classList.toggle('checked', isChecked);
        };
        container.getName = () => currentName;
        container.setName = (n) => { currentName = n; labelInput.value = n; };
        container.getData = () => ({ name: currentName, value: isChecked });
        container.triggerRemove = () => { if (onRemove) onRemove(container); };
        
        return container;
    }

    // ========================================
    // BOOL STACK - Fluid row container
    // ========================================
    
    function BoolStack(options = {}) {
        const {
            bools = [],
            addable = true,
            removable = true,
            onChange = null,
            onAdd = null,
            onRemove = null
        } = options;
        
        const container = document.createElement('div');
        container.className = 'sl-bool-stack';
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'sl-bool-stack-items';
        container.appendChild(itemsContainer);
        
        let addBtn = null;
        if (addable) {
            addBtn = document.createElement('button');
            addBtn.className = 'sl-bool-stack-add';
            addBtn.textContent = '+ Add Bool';
            addBtn.style.cursor = 'pointer';
            addBtn.addEventListener('click', () => {
                const newBool = addBool({ name: `u_bool${boolElements.length}`, checked: false });
                if (onAdd) onAdd(newBool.getData());
            });
            container.appendChild(addBtn);
        }
        
        const boolElements = [];
        
        function addBool(config) {
            const bool = UniformBool({
                ...config,
                onChange: (checked, name) => {
                    if (onChange) onChange(checked, name, boolElements.indexOf(bool));
                },
                onRemove: removable ? () => {
                    removeBool(boolElements.indexOf(bool));
                } : null
            });
            
            // Add context menu for removal
            if (removable) {
                bool.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm(`Remove ${bool.getName()}?`)) {
                        removeBool(boolElements.indexOf(bool));
                    }
                });
            }
            
            boolElements.push(bool);
            itemsContainer.appendChild(bool);
            
            return bool;
        }
        
        function removeBool(index) {
            if (index < 0 || index >= boolElements.length) return;
            const bool = boolElements[index];
            const data = bool.getData();
            bool.remove();
            boolElements.splice(index, 1);
            if (onRemove) onRemove(data, index);
        }
        
        // Initialize
        bools.forEach(config => addBool(config));
        
        // Public API
        container.addBool = addBool;
        container.removeBool = removeBool;
        container.getBools = () => boolElements;
        container.getData = () => boolElements.map(b => b.getData());
        container.setData = (data) => {
            while (boolElements.length > 0) removeBool(0);
            data.forEach(config => addBool(config));
        };
        container.randomize = () => {
            // Booleans are excluded from randomization per spec
        };
        
        return container;
    }

    // ========================================
    // FLOAT STACK - Slider stack for floats only
    // ========================================
    
    function FloatStack(options = {}) {
        const {
            sliders = [],
            addable = true,
            removable = true,
            onChange = null,
            onAdd = null,
            onRemove = null
        } = options;
        
        // Use existing SliderStack but enforce float
        const stack = SliderStack({
            sliders: sliders.map(s => ({ ...s, isInt: false })),
            addable,
            removable,
            onChange,
            onAdd,
            onRemove
        });
        
        // Override addSlider to enforce float
        const originalAddSlider = stack.addSlider;
        stack.addSlider = (config) => {
            return originalAddSlider({ ...config, isInt: false });
        };
        
        // Add randomize method
        stack.randomize = () => {
            stack.getSliders().forEach(slider => {
                if (!slider.isLocked()) {
                    const range = slider.getRange();
                    const randomValue = range.min + Math.random() * (range.max - range.min);
                    slider.setValue(randomValue);
                }
            });
        };
        
        return stack;
    }

    // ========================================
    // INT STACK - Slider stack for ints only
    // ========================================
    
    function IntStack(options = {}) {
        const {
            sliders = [],
            addable = true,
            removable = true,
            onChange = null,
            onAdd = null,
            onRemove = null
        } = options;
        
        // Use existing SliderStack but enforce int
        const stack = SliderStack({
            sliders: sliders.map(s => ({ ...s, isInt: true, step: 1 })),
            addable,
            removable,
            onChange,
            onAdd,
            onRemove
        });
        
        // Override addSlider to enforce int
        const originalAddSlider = stack.addSlider;
        stack.addSlider = (config) => {
            return originalAddSlider({ ...config, isInt: true, step: 1 });
        };
        
        // Add randomize method
        stack.randomize = () => {
            stack.getSliders().forEach(slider => {
                if (!slider.isLocked()) {
                    const range = slider.getRange();
                    const randomValue = Math.floor(range.min + Math.random() * (range.max - range.min + 1));
                    slider.setValue(Math.min(randomValue, range.max));
                }
            });
        };
        
        return stack;
    }

    // ========================================
    // UNIFORM PANEL - Complete uniform editor
    // ========================================
    
    function UniformPanel(options = {}) {
        const {
            floats = [],
            ints = [],
            bools = [],
            onFloatChange = null,
            onIntChange = null,
            onBoolChange = null,
            onRandomize = null,
            onPresetSave = null,
            onPresetLoad = null
        } = options;
        
        const container = document.createElement('div');
        container.className = 'sl-uniform-panel';
        
        // Float section
        const floatSection = document.createElement('div');
        floatSection.className = 'sl-uniform-section';
        
        const floatTitle = document.createElement('div');
        floatTitle.className = 'sl-uniform-section-title';
        floatTitle.textContent = 'Float Uniforms';
        floatSection.appendChild(floatTitle);
        
        const floatStack = FloatStack({
            sliders: floats,
            onChange: (value, name, index) => {
                if (onFloatChange) onFloatChange(value, name, index);
            }
        });
        floatSection.appendChild(floatStack);
        container.appendChild(floatSection);
        
        // Int section
        const intSection = document.createElement('div');
        intSection.className = 'sl-uniform-section';
        
        const intTitle = document.createElement('div');
        intTitle.className = 'sl-uniform-section-title';
        intTitle.textContent = 'Int Uniforms';
        intSection.appendChild(intTitle);
        
        const intStack = IntStack({
            sliders: ints,
            onChange: (value, name, index) => {
                if (onIntChange) onIntChange(value, name, index);
            }
        });
        intSection.appendChild(intStack);
        container.appendChild(intSection);
        
        // Bool section
        const boolSection = document.createElement('div');
        boolSection.className = 'sl-uniform-section';
        
        const boolTitle = document.createElement('div');
        boolTitle.className = 'sl-uniform-section-title';
        boolTitle.textContent = 'Bool Uniforms';
        boolSection.appendChild(boolTitle);
        
        const boolStack = BoolStack({
            bools,
            onChange: (checked, name, index) => {
                if (onBoolChange) onBoolChange(checked, name, index);
            }
        });
        boolSection.appendChild(boolStack);
        container.appendChild(boolSection);
        
        // Actions row
        const actions = document.createElement('div');
        actions.className = 'sl-uniform-panel-actions';
        
        const randomizeBtn = document.createElement('button');
        randomizeBtn.className = 'sl-uniform-randomize';
        randomizeBtn.innerHTML = '🎲 Randomize';
        randomizeBtn.style.cursor = 'pointer';
        randomizeBtn.addEventListener('click', () => {
            floatStack.randomize();
            intStack.randomize();
            // Bools excluded per spec
            if (onRandomize) onRandomize(container.getData());
        });
        actions.appendChild(randomizeBtn);
        
        const presetBtn = document.createElement('button');
        presetBtn.className = 'sl-uniform-preset';
        presetBtn.innerHTML = '💾 Preset';
        presetBtn.style.cursor = 'pointer';
        presetBtn.addEventListener('click', () => {
            if (onPresetSave) onPresetSave(container.getData());
        });
        actions.appendChild(presetBtn);
        
        container.appendChild(actions);
        
        // Public API
        container.getFloatStack = () => floatStack;
        container.getIntStack = () => intStack;
        container.getBoolStack = () => boolStack;
        container.getData = () => ({
            floats: floatStack.getData(),
            ints: intStack.getData(),
            bools: boolStack.getData()
        });
        container.setData = (data) => {
            if (data.floats) floatStack.setData(data.floats);
            if (data.ints) intStack.setData(data.ints);
            if (data.bools) boolStack.setData(data.bools);
        };
        container.randomize = () => {
            floatStack.randomize();
            intStack.randomize();
        };
        
        return container;
    }

    // ========================================
    // COLOR PICKER - RGB + HSV with gradient sliders
    // ========================================
    
    // Color conversion utilities
    function rgbToHsv(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return { h, s, v };
    }
    
    function hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return { r, g, b };
    }
    
    function ColorPicker(options = {}) {
        const {
            name = 'u_color',
            r = 1.0,
            g = 0.5,
            b = 0.2,
            onChange = null,
            onNameChange = null,
            onRemove = null
        } = options;
        
        let currentName = name;
        let rgb = { r, g, b };
        let hsv = rgbToHsv(r, g, b);
        let isExpanded = false;
        
        const container = document.createElement('div');
        container.className = 'sl-color-picker';
        
        // Header row
        const header = document.createElement('div');
        header.className = 'sl-color-picker-header';
        
        const swatch = document.createElement('div');
        swatch.className = 'sl-color-picker-swatch';
        swatch.addEventListener('click', () => {
            isExpanded = !isExpanded;
            container.classList.toggle('expanded', isExpanded);
            toggleBtn.textContent = isExpanded ? '▲' : '▼';
        });
        header.appendChild(swatch);
        
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'sl-color-picker-label';
        labelInput.value = currentName;
        labelInput.addEventListener('blur', () => {
            currentName = labelInput.value || 'u_color';
            if (onNameChange) onNameChange(currentName);
        });
        labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        labelInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        header.appendChild(labelInput);
        
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'sl-color-picker-hex';
        hexInput.addEventListener('change', () => {
            const hex = hexInput.value.replace('#', '');
            if (hex.length === 6) {
                rgb.r = parseInt(hex.substr(0, 2), 16) / 255;
                rgb.g = parseInt(hex.substr(2, 2), 16) / 255;
                rgb.b = parseInt(hex.substr(4, 2), 16) / 255;
                hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                updateAllVisuals();
                if (onChange) onChange({ ...rgb }, currentName);
            }
        });
        header.appendChild(hexInput);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sl-color-picker-toggle';
        toggleBtn.textContent = '▼';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            container.classList.toggle('expanded', isExpanded);
            toggleBtn.textContent = isExpanded ? '▲' : '▼';
        });
        header.appendChild(toggleBtn);
        
        container.appendChild(header);
        
        // Sliders container
        const sliders = document.createElement('div');
        sliders.className = 'sl-color-picker-sliders';
        
        const channels = {};
        
        function toHex(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }
        function rgbToCss(r, g, b) { return '#' + toHex(r) + toHex(g) + toHex(b); }
        
        function createChannel(label, labelColor, getValue, setValue, getGradient) {
            const row = document.createElement('div');
            row.className = 'sl-color-channel';
            
            const lbl = document.createElement('span');
            lbl.className = 'sl-color-channel-label';
            lbl.textContent = label;
            lbl.style.color = labelColor;
            row.appendChild(lbl);
            
            const track = document.createElement('div');
            track.className = 'sl-slider-track sl-color-gradient-track';
            track.style.cursor = 'pointer';
            
            const trackBg = document.createElement('div');
            trackBg.className = 'sl-slider-track-bg sl-color-gradient-bg';
            trackBg.style.borderRadius = '3px';
            trackBg.style.overflow = 'hidden';
            
            const thumb = document.createElement('div');
            thumb.className = 'sl-slider-thumb';
            thumb.style.cursor = 'pointer';
            thumb.style.border = '2px solid white';
            thumb.style.boxShadow = '0 0 2px rgba(0,0,0,0.5)';
            
            trackBg.appendChild(thumb);
            track.appendChild(trackBg);
            row.appendChild(track);
            
            const valInput = document.createElement('input');
            valInput.type = 'text';
            valInput.className = 'sl-color-channel-value';
            row.appendChild(valInput);
            
            function update() {
                const val = getValue();
                thumb.style.left = (val * 100) + '%';
                valInput.value = val.toFixed(2);
                trackBg.style.background = getGradient();
            }
            
            function handlePointer(e) {
                const rect = trackBg.getBoundingClientRect();
                const val = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setValue(val);
                updateAllVisuals();
                if (onChange) onChange({ ...rgb }, currentName);
            }
            
            track.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                track.setPointerCapture(e.pointerId);
                handlePointer(e);
                const move = (ev) => handlePointer(ev);
                const up = (ev) => { 
                    track.releasePointerCapture(ev.pointerId);
                    track.removeEventListener('pointermove', move); 
                    track.removeEventListener('pointerup', up);
                    track.removeEventListener('pointercancel', up);
                };
                track.addEventListener('pointermove', move);
                track.addEventListener('pointerup', up);
                track.addEventListener('pointercancel', up);
            });
            
            valInput.addEventListener('change', () => {
                const v = parseFloat(valInput.value);
                if (!isNaN(v)) {
                    setValue(Math.max(0, Math.min(1, v)));
                    updateAllVisuals();
                    if (onChange) onChange({ ...rgb }, currentName);
                }
            });
            
            sliders.appendChild(row);
            return { update };
        }
        
        // RGB channels with dynamic gradients
        channels.r = createChannel('R', '#e74c3c',
            () => rgb.r,
            (v) => { rgb.r = v; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); },
            () => `linear-gradient(to right, ${rgbToCss(0, rgb.g, rgb.b)}, ${rgbToCss(1, rgb.g, rgb.b)})`
        );
        channels.g = createChannel('G', '#2ecc71',
            () => rgb.g,
            (v) => { rgb.g = v; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); },
            () => `linear-gradient(to right, ${rgbToCss(rgb.r, 0, rgb.b)}, ${rgbToCss(rgb.r, 1, rgb.b)})`
        );
        channels.b = createChannel('B', '#3498db',
            () => rgb.b,
            (v) => { rgb.b = v; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); },
            () => `linear-gradient(to right, ${rgbToCss(rgb.r, rgb.g, 0)}, ${rgbToCss(rgb.r, rgb.g, 1)})`
        );
        
        // Separator
        const sep = document.createElement('div');
        sep.style.height = '4px';
        sliders.appendChild(sep);
        
        // HSV channels with dynamic gradients
        channels.h = createChannel('H', '#9b59b6',
            () => hsv.h,
            (v) => { hsv.h = v; const c = hsvToRgb(hsv.h, hsv.s, hsv.v); rgb.r = c.r; rgb.g = c.g; rgb.b = c.b; },
            () => {
                // Hue rainbow gradient at current S and V
                const stops = [];
                for (let i = 0; i <= 6; i++) {
                    const c = hsvToRgb(i / 6, hsv.s, hsv.v);
                    stops.push(rgbToCss(c.r, c.g, c.b));
                }
                return `linear-gradient(to right, ${stops.join(', ')})`;
            }
        );
        channels.s = createChannel('S', '#f39c12',
            () => hsv.s,
            (v) => { hsv.s = v; const c = hsvToRgb(hsv.h, hsv.s, hsv.v); rgb.r = c.r; rgb.g = c.g; rgb.b = c.b; },
            () => {
                const c0 = hsvToRgb(hsv.h, 0, hsv.v);
                const c1 = hsvToRgb(hsv.h, 1, hsv.v);
                return `linear-gradient(to right, ${rgbToCss(c0.r, c0.g, c0.b)}, ${rgbToCss(c1.r, c1.g, c1.b)})`;
            }
        );
        channels.v = createChannel('V', '#95a5a6',
            () => hsv.v,
            (v) => { hsv.v = v; const c = hsvToRgb(hsv.h, hsv.s, hsv.v); rgb.r = c.r; rgb.g = c.g; rgb.b = c.b; },
            () => {
                const c0 = hsvToRgb(hsv.h, hsv.s, 0);
                const c1 = hsvToRgb(hsv.h, hsv.s, 1);
                return `linear-gradient(to right, ${rgbToCss(c0.r, c0.g, c0.b)}, ${rgbToCss(c1.r, c1.g, c1.b)})`;
            }
        );
        
        container.appendChild(sliders);
        
        function updateAllVisuals() {
            const hex = rgbToCss(rgb.r, rgb.g, rgb.b);
            swatch.style.background = hex;
            hexInput.value = hex;
            channels.r.update();
            channels.g.update();
            channels.b.update();
            channels.h.update();
            channels.s.update();
            channels.v.update();
        }
        
        updateAllVisuals();
        
        // Public API
        container.getColor = () => ({ ...rgb });
        container.setColor = (c) => { rgb = { ...c }; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); updateAllVisuals(); };
        container.getName = () => currentName;
        container.setName = (n) => { currentName = n; labelInput.value = n; };
        container.getData = () => ({ name: currentName, r: rgb.r, g: rgb.g, b: rgb.b });
        container.triggerRemove = () => { if (onRemove) onRemove(container); };
        
        return container;
    }

    // ========================================
    // VEC3 PICKER - 3D Position/Normal
    // ========================================
    
    function Vec3Picker(options = {}) {
        const {
            name = 'u_position',
            x = 0,
            y = 0,
            z = 0,
            min = -1,
            max = 1,
            normalize = false,
            onChange = null,
            onNameChange = null,
            onRemove = null
        } = options;
        
        let currentName = name;
        let vec = { x, y, z };
        let isNormalized = normalize;
        let isExpanded = false;
        const range = { min, max };
        
        const container = document.createElement('div');
        container.className = 'sl-vec3-picker';
        
        // Header row
        const header = document.createElement('div');
        header.className = 'sl-vec3-picker-header';
        
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'sl-vec3-picker-label';
        labelInput.value = currentName;
        labelInput.addEventListener('blur', () => {
            currentName = labelInput.value || 'u_position';
            if (onNameChange) onNameChange(currentName);
        });
        labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        labelInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        header.appendChild(labelInput);
        
        const values = document.createElement('div');
        values.className = 'sl-vec3-picker-values';
        
        function createValueInput(key, cls) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'sl-vec3-picker-value ' + cls;
            input.addEventListener('change', () => {
                const v = parseFloat(input.value);
                if (!isNaN(v)) {
                    vec[key] = Math.max(range.min, Math.min(range.max, v));
                    if (isNormalized) normalizeVec();
                    updateVisuals();
                    if (onChange) onChange({ ...vec }, currentName);
                }
            });
            values.appendChild(input);
            return input;
        }
        
        const xInput = createValueInput('x', 'x');
        const yInput = createValueInput('y', 'y');
        const zInput = createValueInput('z', 'z');
        
        header.appendChild(values);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sl-vec3-picker-toggle';
        toggleBtn.textContent = '▼';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            container.classList.toggle('expanded', isExpanded);
            toggleBtn.textContent = isExpanded ? '▲' : '▼';
        });
        header.appendChild(toggleBtn);
        
        container.appendChild(header);
        
        // Canvas container
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'sl-vec3-picker-canvas-container';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'sl-vec3-picker-canvas';
        canvas.width = 200;
        canvas.height = 120;
        canvasContainer.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        
        // Z slider row
        const zRow = document.createElement('div');
        zRow.className = 'sl-vec3-picker-z-row';
        
        const zLabel = document.createElement('span');
        zLabel.className = 'sl-vec3-picker-z-label';
        zLabel.textContent = 'Z';
        zRow.appendChild(zLabel);
        
        const zTrack = document.createElement('div');
        zTrack.className = 'sl-slider-track sl-vec3-picker-z-slider';
        zTrack.style.cursor = 'pointer';
        
        const zTrackBg = document.createElement('div');
        zTrackBg.className = 'sl-slider-track-bg';
        const zFill = document.createElement('div');
        zFill.className = 'sl-slider-track-fill';
        zFill.style.background = '#3498db';
        const zThumb = document.createElement('div');
        zThumb.className = 'sl-slider-thumb';
        zThumb.style.cursor = 'pointer';
        
        zTrackBg.appendChild(zFill);
        zTrackBg.appendChild(zThumb);
        zTrack.appendChild(zTrackBg);
        zRow.appendChild(zTrack);
        
        const normalizeBtn = document.createElement('button');
        normalizeBtn.className = 'sl-vec3-picker-normalize';
        normalizeBtn.textContent = 'Normalize';
        normalizeBtn.style.cursor = 'pointer';
        if (isNormalized) normalizeBtn.classList.add('active');
        normalizeBtn.addEventListener('click', () => {
            isNormalized = !isNormalized;
            normalizeBtn.classList.toggle('active', isNormalized);
            if (isNormalized) normalizeVec();
            updateVisuals();
            if (onChange) onChange({ ...vec }, currentName);
        });
        zRow.appendChild(normalizeBtn);
        
        canvasContainer.appendChild(zRow);
        container.appendChild(canvasContainer);
        
        function normalizeVec() {
            const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
            if (len > 0.0001) {
                vec.x /= len;
                vec.y /= len;
                vec.z /= len;
            }
        }
        
        function vecToCanvas(v) {
            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const scale = Math.min(w, h) / 2 - 10;
            return {
                x: cx + (v.x / (range.max - range.min)) * scale * 2,
                y: cy - (v.y / (range.max - range.min)) * scale * 2
            };
        }
        
        function canvasToVec(px, py) {
            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const scale = Math.min(w, h) / 2 - 10;
            return {
                x: ((px - cx) / (scale * 2)) * (range.max - range.min),
                y: -((py - cy) / (scale * 2)) * (range.max - range.min)
            };
        }
        
        function drawCanvas() {
            const w = canvas.width;
            const h = canvas.height;
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary') || '#1a1a1a';
            ctx.fillRect(0, 0, w, h);
            
            // Grid
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(w / 2, 0);
            ctx.lineTo(w / 2, h);
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
            
            // Point
            const pt = vecToCanvas(vec);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#3498db';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        function updateVisuals() {
            xInput.value = vec.x.toFixed(3);
            yInput.value = vec.y.toFixed(3);
            zInput.value = vec.z.toFixed(3);
            
            const zPct = ((vec.z - range.min) / (range.max - range.min)) * 100;
            zFill.style.width = zPct + '%';
            zThumb.style.left = zPct + '%';
            
            drawCanvas();
        }
        
        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            function handlePointer(e) {
                const px = (e.clientX - rect.left) * scaleX;
                const py = (e.clientY - rect.top) * scaleY;
                const v = canvasToVec(px, py);
                vec.x = Math.max(range.min, Math.min(range.max, v.x));
                vec.y = Math.max(range.min, Math.min(range.max, v.y));
                if (isNormalized) normalizeVec();
                updateVisuals();
                if (onChange) onChange({ ...vec }, currentName);
            }
            
            handlePointer(e);
            const move = (e) => handlePointer(e);
            const up = (e) => { 
                canvas.releasePointerCapture(e.pointerId);
                canvas.removeEventListener('pointermove', move); 
                canvas.removeEventListener('pointerup', up);
                canvas.removeEventListener('pointercancel', up);
            };
            canvas.addEventListener('pointermove', move);
            canvas.addEventListener('pointerup', up);
            canvas.addEventListener('pointercancel', up);
        });
        
        zTrack.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            zTrack.setPointerCapture(e.pointerId);
            
            function handleZ(e) {
                const rect = zTrackBg.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                vec.z = range.min + pct * (range.max - range.min);
                if (isNormalized) normalizeVec();
                updateVisuals();
                if (onChange) onChange({ ...vec }, currentName);
            }
            
            handleZ(e);
            const move = (e) => handleZ(e);
            const up = (e) => { 
                zTrack.releasePointerCapture(e.pointerId);
                zTrack.removeEventListener('pointermove', move); 
                zTrack.removeEventListener('pointerup', up);
                zTrack.removeEventListener('pointercancel', up);
            };
            zTrack.addEventListener('pointermove', move);
            zTrack.addEventListener('pointerup', up);
            zTrack.addEventListener('pointercancel', up);
        });
        
        // Resize observer
        const resizeObs = new ResizeObserver(() => {
            canvas.width = canvas.offsetWidth || 200;
            canvas.height = canvas.offsetHeight || 120;
            drawCanvas();
        });
        resizeObs.observe(canvas);
        
        updateVisuals();
        
        // Public API
        container.getVec = () => ({ ...vec });
        container.setVec = (v) => { vec = { ...v }; updateVisuals(); };
        container.getName = () => currentName;
        container.setName = (n) => { currentName = n; labelInput.value = n; };
        container.getData = () => ({ name: currentName, x: vec.x, y: vec.y, z: vec.z, normalize: isNormalized });
        container.triggerRemove = () => { if (onRemove) onRemove(container); };
        container.isNormalized = () => isNormalized;
        container.setNormalized = (n) => { isNormalized = n; normalizeBtn.classList.toggle('active', n); if (n) normalizeVec(); updateVisuals(); };
        
        return container;
    }

    // ========================================
    // COLOR STACK - Container for color pickers
    // ========================================
    
    function ColorStack(options = {}) {
        const { colors = [], addable = true, removable = true, onChange = null, onAdd = null, onRemove = null } = options;
        
        const container = document.createElement('div');
        container.className = 'sl-color-stack';
        
        const colorElements = [];
        
        function addColor(config) {
            const picker = ColorPicker({
                ...config,
                onChange: (color, name) => {
                    if (onChange) onChange(color, name, colorElements.indexOf(picker));
                }
            });
            
            if (removable) {
                picker.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm(`Remove ${picker.getName()}?`)) removeColor(colorElements.indexOf(picker));
                });
            }
            
            colorElements.push(picker);
            container.insertBefore(picker, addBtn);
            return picker;
        }
        
        function removeColor(index) {
            if (index < 0 || index >= colorElements.length) return;
            const p = colorElements[index];
            const d = p.getData();
            p.remove();
            colorElements.splice(index, 1);
            if (onRemove) onRemove(d, index);
        }
        
        let addBtn = null;
        if (addable) {
            addBtn = document.createElement('button');
            addBtn.className = 'sl-color-stack-add';
            addBtn.textContent = '+ Add Color';
            addBtn.style.cursor = 'pointer';
            addBtn.addEventListener('click', () => {
                const n = addColor({ name: `u_color${colorElements.length}`, r: Math.random(), g: Math.random(), b: Math.random() });
                if (onAdd) onAdd(n.getData());
            });
            container.appendChild(addBtn);
        }
        
        colors.forEach(c => addColor(c));
        
        container.addColor = addColor;
        container.removeColor = removeColor;
        container.getColors = () => colorElements;
        container.getData = () => colorElements.map(c => c.getData());
        container.setData = (data) => { while (colorElements.length > 0) removeColor(0); data.forEach(c => addColor(c)); };
        container.randomize = () => { colorElements.forEach(c => c.setColor({ r: Math.random(), g: Math.random(), b: Math.random() })); };
        
        return container;
    }

    // ========================================
    // VEC3 STACK - Container for vec3 pickers
    // ========================================
    
    function Vec3Stack(options = {}) {
        const { vecs = [], addable = true, removable = true, min = -1, max = 1, onChange = null, onAdd = null, onRemove = null } = options;
        
        const container = document.createElement('div');
        container.className = 'sl-vec3-stack';
        
        const vecElements = [];
        
        function addVec(config) {
            const picker = Vec3Picker({
                min,
                max,
                ...config,
                onChange: (vec, name) => {
                    if (onChange) onChange(vec, name, vecElements.indexOf(picker));
                }
            });
            
            if (removable) {
                picker.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm(`Remove ${picker.getName()}?`)) removeVec(vecElements.indexOf(picker));
                });
            }
            
            vecElements.push(picker);
            container.insertBefore(picker, addBtn);
            return picker;
        }
        
        function removeVec(index) {
            if (index < 0 || index >= vecElements.length) return;
            const p = vecElements[index];
            const d = p.getData();
            p.remove();
            vecElements.splice(index, 1);
            if (onRemove) onRemove(d, index);
        }
        
        let addBtn = null;
        if (addable) {
            addBtn = document.createElement('button');
            addBtn.className = 'sl-vec3-stack-add';
            addBtn.textContent = '+ Add Vec3';
            addBtn.style.cursor = 'pointer';
            addBtn.addEventListener('click', () => {
                const n = addVec({ name: `u_vec${vecElements.length}`, x: 0, y: 0, z: 0 });
                if (onAdd) onAdd(n.getData());
            });
            container.appendChild(addBtn);
        }
        
        vecs.forEach(v => addVec(v));
        
        container.addVec = addVec;
        container.removeVec = removeVec;
        container.getVecs = () => vecElements;
        container.getData = () => vecElements.map(v => v.getData());
        container.setData = (data) => { while (vecElements.length > 0) removeVec(0); data.forEach(v => addVec(v)); };
        container.randomize = () => {
            vecElements.forEach(v => {
                if (!v.isNormalized()) {
                    v.setVec({ x: min + Math.random() * (max - min), y: min + Math.random() * (max - min), z: min + Math.random() * (max - min) });
                } else {
                    // Random normalized
                    const rx = Math.random() * 2 - 1;
                    const ry = Math.random() * 2 - 1;
                    const rz = Math.random() * 2 - 1;
                    const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
                    v.setVec({ x: rx / len, y: ry / len, z: rz / len });
                }
            });
        };
        
        return container;
    }

    // ========================================
    // PRESET MANAGER - Save/Load presets
    // ========================================
    
    function PresetManager(options = {}) {
        const {
            defaultPreset = null,
            onLoad = null,
            onSave = null,
            onDelete = null
        } = options;
        
        const presets = new Map();
        let presetCounter = 1;
        
        const container = document.createElement('div');
        container.className = 'sl-preset-controls';
        
        // Load row
        const loadRow = document.createElement('div');
        loadRow.className = 'sl-preset-row';
        
        const select = document.createElement('select');
        select.className = 'sl-preset-select';
        loadRow.appendChild(select);
        
        const loadBtn = document.createElement('button');
        loadBtn.className = 'sl-preset-load';
        loadBtn.textContent = 'Load';
        loadBtn.style.cursor = 'pointer';
        loadBtn.addEventListener('click', () => {
            const presetName = select.value;
            if (presetName && presets.has(presetName)) {
                if (onLoad) onLoad(presets.get(presetName), presetName);
            }
        });
        loadRow.appendChild(loadBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'sl-preset-delete';
        deleteBtn.textContent = '×';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.addEventListener('click', () => {
            const presetName = select.value;
            if (presetName && presetName !== 'Default' && presets.has(presetName)) {
                presets.delete(presetName);
                updateSelect();
                if (onDelete) onDelete(presetName);
            }
        });
        loadRow.appendChild(deleteBtn);
        
        container.appendChild(loadRow);
        
        // Save row
        const saveRow = document.createElement('div');
        saveRow.className = 'sl-preset-row';
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'sl-preset-name';
        nameInput.placeholder = 'Preset name...';
        nameInput.value = `preset${presetCounter}`;
        saveRow.appendChild(nameInput);
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'sl-preset-save';
        saveBtn.textContent = '💾 Save';
        saveBtn.style.cursor = 'pointer';
        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim() || `preset${presetCounter}`;
            if (onSave) {
                const data = onSave(name);
                if (data) {
                    presets.set(name, JSON.parse(JSON.stringify(data)));
                    updateSelect();
                    presetCounter++;
                    nameInput.value = `preset${presetCounter}`;
                    select.value = name;
                }
            }
        });
        saveRow.appendChild(saveBtn);
        
        container.appendChild(saveRow);
        
        function updateSelect() {
            select.innerHTML = '';
            for (const [name] of presets) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            }
        }
        
        // Initialize with default
        if (defaultPreset) {
            presets.set('Default', JSON.parse(JSON.stringify(defaultPreset)));
            updateSelect();
            select.value = 'Default';
        }
        
        // Public API
        container.getPresets = () => presets;
        container.addPreset = (name, data) => { presets.set(name, JSON.parse(JSON.stringify(data))); updateSelect(); };
        container.removePreset = (name) => { presets.delete(name); updateSelect(); };
        container.setDefaultPreset = (data) => { presets.set('Default', JSON.parse(JSON.stringify(data))); updateSelect(); };
        
        return container;
    }

    // ========================================
    // TABS COMPONENT
    // ========================================
    
    function Tabs(options = {}) {
        const {
            tabs = [],
            activeTab = null,
            position = 'top',
            variant = 'default',
            closable = false,
            addable = false,
            onTabChange = null,
            onTabClose = null,
            onTabAdd = null,
            className = ''
        } = options;
        
        const container = document.createElement('div');
        container.className = `sl-tabs ${position} ${variant} ${className}`.trim();
        
        const tabBar = document.createElement('div');
        tabBar.className = 'sl-tabs-bar';
        tabBar.setAttribute('role', 'tablist');
        
        const tabContent = document.createElement('div');
        tabContent.className = 'sl-tabs-content';
        
        let currentTabs = [...tabs];
        let activeId = activeTab || (tabs.length > 0 ? tabs[0].id : null);
        
        function renderTabBar() {
            tabBar.innerHTML = '';
            
            currentTabs.forEach((tab) => {
                const tabEl = document.createElement('button');
                tabEl.className = 'sl-tab';
                tabEl.setAttribute('role', 'tab');
                tabEl.setAttribute('aria-selected', tab.id === activeId);
                tabEl.dataset.tabId = tab.id;
                
                if (tab.id === activeId) tabEl.classList.add('active');
                
                if (tab.icon) {
                    const iconEl = document.createElement('span');
                    iconEl.className = 'sl-tab-icon';
                    iconEl.textContent = tab.icon;
                    tabEl.appendChild(iconEl);
                }
                
                const labelEl = document.createElement('span');
                labelEl.className = 'sl-tab-label';
                labelEl.textContent = tab.label;
                tabEl.appendChild(labelEl);
                
                if (tab.closable !== false && closable) {
                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'sl-tab-close';
                    closeBtn.innerHTML = '×';
                    closeBtn.title = 'Close tab';
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                    });
                    tabEl.appendChild(closeBtn);
                }
                
                tabEl.addEventListener('click', () => setActiveTab(tab.id));
                tabBar.appendChild(tabEl);
            });
            
            if (addable) {
                const addBtn = document.createElement('button');
                addBtn.className = 'sl-tab-add';
                addBtn.innerHTML = '+';
                addBtn.title = 'Add tab';
                addBtn.addEventListener('click', () => {
                    if (onTabAdd) {
                        const newTab = onTabAdd();
                        if (newTab) addTab(newTab);
                    }
                });
                tabBar.appendChild(addBtn);
            }
        }
        
        function renderContent() {
            tabContent.innerHTML = '';
            const activeTabData = currentTabs.find(t => t.id === activeId);
            if (activeTabData) {
                const panel = document.createElement('div');
                panel.className = 'sl-tab-panel';
                panel.setAttribute('role', 'tabpanel');
                panel.dataset.tabId = activeTabData.id;
                
                if (activeTabData.content) {
                    if (typeof activeTabData.content === 'function') {
                        const content = activeTabData.content();
                        if (typeof content === 'string') {
                            panel.innerHTML = content;
                        } else {
                            panel.appendChild(content);
                        }
                    } else if (typeof activeTabData.content === 'string') {
                        panel.innerHTML = activeTabData.content;
                    } else {
                        panel.appendChild(activeTabData.content);
                    }
                }
                
                tabContent.appendChild(panel);
            }
        }
        
        function setActiveTab(id) {
            if (!currentTabs.find(t => t.id === id)) return;
            const prevId = activeId;
            activeId = id;
            
            tabBar.querySelectorAll('.sl-tab').forEach(tab => {
                const isActive = tab.dataset.tabId === id;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive);
            });
            
            renderContent();
            if (onTabChange && prevId !== id) onTabChange(id, prevId);
        }
        
        function addTab(tab) {
            currentTabs.push(tab);
            renderTabBar();
            setActiveTab(tab.id);
        }
        
        function closeTab(id) {
            const index = currentTabs.findIndex(t => t.id === id);
            if (index === -1) return;
            
            if (onTabClose) {
                const result = onTabClose(id);
                if (result === false) return;
            }
            
            currentTabs.splice(index, 1);
            
            if (activeId === id && currentTabs.length > 0) {
                const newIndex = Math.min(index, currentTabs.length - 1);
                activeId = currentTabs[newIndex].id;
            } else if (currentTabs.length === 0) {
                activeId = null;
            }
            
            renderTabBar();
            renderContent();
        }
        
        function updateTab(id, updates) {
            const tab = currentTabs.find(t => t.id === id);
            if (tab) {
                Object.assign(tab, updates);
                renderTabBar();
                if (id === activeId) renderContent();
            }
        }
        
        if (position === 'bottom' || position === 'right') {
            container.appendChild(tabContent);
            container.appendChild(tabBar);
        } else {
            container.appendChild(tabBar);
            container.appendChild(tabContent);
        }
        
        renderTabBar();
        renderContent();
        
        container.setActiveTab = setActiveTab;
        container.addTab = addTab;
        container.closeTab = closeTab;
        container.updateTab = updateTab;
        container.getTabs = () => [...currentTabs];
        container.getActiveTab = () => activeId;
        container.setTabs = (newTabs) => {
            currentTabs = [...newTabs];
            if (!currentTabs.find(t => t.id === activeId) && currentTabs.length > 0) {
                activeId = currentTabs[0].id;
            }
            renderTabBar();
            renderContent();
        };
        
        return container;
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
        undockWindow,
        closeDockWindow,
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
        ColorStack,
        Vec3Picker,
        Vec3Stack,
        PresetManager,
        Tabs,

        // State access
        get state() { return state; }
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SLUI;
}

