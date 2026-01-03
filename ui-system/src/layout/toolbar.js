/**
 * SLUI Toolbar
 * Draggable, dockable toolbar management
 */

import { state, panels } from '../core/state.js';
import { t } from '../core/i18n.js';
import { emit, EVENTS } from '../core/events.js';

/**
 * Set toolbar position
 * @param {string} position - 'top' | 'bottom' | 'left' | 'right' | 'float'
 */
export function setToolbarPosition(position) {
    state.toolbarPosition = position;
    localStorage.setItem('sl-toolbar-position', position);
    
    const app = document.querySelector('.sl-app');
    if (app) {
        app.dataset.toolbarPosition = position;
    }
    
    emit(EVENTS.TOOLBAR_POSITION_CHANGE, { position });
}

/**
 * Get current toolbar position
 * @returns {string}
 */
export function getToolbarPosition() {
    return state.toolbarPosition;
}

/**
 * Build the toolbar DOM structure
 * @param {Function} toggleUserMenu - User menu toggle callback
 * @returns {HTMLElement}
 */
export function buildToolbar(toggleUserMenu) {
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

/**
 * Setup toolbar frame hover behavior
 */
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

/**
 * Setup toolbar drag behavior
 */
function setupToolbarDrag(wrapper, frame) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let pendingDockPosition = null;
    const edgeThreshold = 50;
    
    function detectToolbarDockEdge(x, y) {
        if (x < edgeThreshold) return 'left';
        if (window.innerWidth - x < edgeThreshold) return 'right';
        if (y < edgeThreshold) return 'top';
        if (window.innerHeight - y < edgeThreshold) return 'bottom';
        return null;
    }
    
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
    
    const toolbar = wrapper.querySelector('.sl-toolbar');
    
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
    toolbar.addEventListener('mousedown', (e) => {
        if (state.toolbarPosition === 'float') return;
        if (e.target.closest('.sl-toolbar-item, .sl-toolbar-user')) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        wrapper.classList.add('dragging');
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        if (state.toolbarPosition === 'float') {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            wrapper.style.left = `${startLeft + dx}px`;
            wrapper.style.top = `${startTop + dy}px`;
            wrapper.style.transform = 'none';
            
            pendingDockPosition = detectToolbarDockEdge(e.clientX, e.clientY);
            if (pendingDockPosition) {
                showToolbarDockPreview(pendingDockPosition);
            } else {
                hideToolbarDockPreview();
            }
        } else {
            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            
            if (dx > 30 || dy > 30) {
                const newLeft = e.clientX - 30;
                const newTop = e.clientY - 30;
                
                setToolbarPosition('float');
                
                wrapper.style.left = `${newLeft}px`;
                wrapper.style.top = `${newTop}px`;
                wrapper.style.transform = 'none';
                
                startLeft = newLeft;
                startTop = newTop;
                startX = e.clientX;
                startY = e.clientY;
            }
        }
    });
    
    document.addEventListener('mouseup', () => {
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

/**
 * Check for toolbar overflow
 */
export function checkToolbarOverflow() {
    const toolbar = document.getElementById('sl-toolbar');
    const itemsContainer = document.getElementById('sl-toolbar-items');
    if (!toolbar || !itemsContainer) return;
    
    const items = itemsContainer.querySelectorAll('.sl-toolbar-item');
    const itemCount = items.length;
    
    if (state.deviceMode === 'mobile') {
        const isOverflow = itemsContainer.scrollWidth > itemsContainer.clientWidth ||
                           itemsContainer.scrollHeight > itemsContainer.clientHeight;
        toolbar.classList.toggle('has-overflow', isOverflow);
    }
    
    if (state.toolbarPosition === 'float') {
        itemsContainer.classList.toggle('few-items', itemCount <= 6);
    }
}

/**
 * Create a toolbar item button
 * @param {string} icon - Icon character/emoji
 * @param {string} id - Panel ID
 * @param {string} title - Tooltip title
 * @returns {HTMLElement}
 */
export function createToolbarItem(icon, id, title) {
    const btn = document.createElement('button');
    btn.className = 'sl-toolbar-item';
    btn.dataset.panelId = id;
    btn.innerHTML = icon;
    btn.title = title;
    return btn;
}

/**
 * Update toolbar item state
 * @param {string} panelId - Panel ID
 * @param {boolean} isLoaded - Whether panel is loaded
 * @param {boolean} isVisible - Whether panel is visible
 * @param {boolean} isMinimized - Whether panel is minimized
 */
export function updateToolbarItem(panelId, isLoaded, isVisible, isMinimized) {
    const btn = document.querySelector(`.sl-toolbar-item[data-panel-id="${panelId}"]`);
    if (!btn) return;
    
    btn.classList.toggle('loaded', isLoaded);
    btn.classList.toggle('active', isVisible && !isMinimized);
}

/**
 * Update all toolbar items based on current state
 */
export function updateAllToolbarItems() {
    const isLandscape = state.mobileOrientation === 'landscape';
    const zone1Key = isLandscape ? 'left' : 'top';
    const zone2Key = isLandscape ? 'right' : 'bottom';
    
    panels.forEach((config, panelId) => {
        const isOpen = state.mobileZones[zone1Key] === panelId || 
                      state.mobileZones[zone2Key] === panelId;
        updateToolbarItem(panelId, isOpen, isOpen, false);
    });
}
