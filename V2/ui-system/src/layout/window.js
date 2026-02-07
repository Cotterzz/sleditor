/**
 * SLUI Window Management
 * Floating window creation and interaction
 */

import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { emit, EVENTS } from '../core/events.js';
import { updateToolbarItem } from './toolbar.js';
import { detectDropZone, showDropPreview, hideDropPreview, undockWindow } from './dock.js';

/**
 * Create a new floating window
 * @param {object} options - Window configuration
 * @param {Function} dockWindow - Dock window callback
 * @param {Function} closeDockWindow - Close dock window callback
 * @returns {HTMLElement|null}
 */
export function createWindow(options, dockWindow, closeDockWindow) {
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
    dockBtn.innerHTML = '↘';
    dockBtn.title = 'Dock';
    dockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dockWindow) dockWindow(id, 'right');
    });
    controls.appendChild(dockBtn);
    
    // Undock button (only shown when docked)
    const undockBtn = document.createElement('button');
    undockBtn.className = 'sl-window-ctrl-btn undock';
    undockBtn.innerHTML = '↗';
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
        if (closeDockWindow) closeDockWindow(id);
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
    
    // Store window state
    state.windows.set(id, {
        element: container,
        window: win,
        body: body,
        frame: frame,
        options,
        visible: true,
        controls: controls
    });
    
    // Setup interactions
    setupFrameHover(container, body, frame);
    setupWindowDrag(container, frame, dockWindow);
    if (resizable) setupWindowResize(container, body);
    setupWindowFocus(container);
    
    // Always bring new windows to front
    bringToFront(id);
    
    // Reflect state in toolbar
    updateToolbarItem(id, true, true, false);
    
    emit(EVENTS.WINDOW_OPEN, { id });
    
    return container;
}

/**
 * Frame hover - show frame when cursor is near window but not inside body
 */
export function setupFrameHover(container, body, frame) {
    let isInsideBody = false;
    
    body.addEventListener('mouseenter', () => {
        isInsideBody = true;
        container.classList.remove('frame-visible');
    });
    
    body.addEventListener('mouseleave', () => {
        isInsideBody = false;
    });
    
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
    
    container.addEventListener('mousemove', (e) => {
        if (container.classList.contains('dragging') || container.classList.contains('resizing')) return;
        
        const bodyRect = body.getBoundingClientRect();
        const inBody = e.clientX >= bodyRect.left && e.clientX <= bodyRect.right &&
                      e.clientY >= bodyRect.top && e.clientY <= bodyRect.bottom;
        
        container.classList.toggle('frame-visible', !inBody);
    });
}

/**
 * Setup window drag behavior
 */
export function setupWindowDrag(container, frame, dockWindow) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let currentDropInfo = null;
    
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

        // Docking preview
        const windowId = container.dataset.windowId;
        currentDropInfo = detectDropZone(e.clientX, e.clientY, windowId);
        if (currentDropInfo) {
            showDropPreview(currentDropInfo);
        } else {
            hideDropPreview();
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            container.style.transition = '';
            container.classList.remove('dragging');

            // Perform docking if we had a valid drop target
            const windowId = container.dataset.windowId;
            if (currentDropInfo && dockWindow) {
                dockWindow(windowId, currentDropInfo.side, currentDropInfo.targetPanel || null);
            }
            // Persist bounds back into state (robust restore)
            const winState = state.windows.get(windowId);
            if (winState?.options) {
                winState.options.x = container.offsetLeft;
                winState.options.y = container.offsetTop;
                winState.options.width = container.offsetWidth;
                winState.options.height = container.offsetHeight;
            }
            currentDropInfo = null;
            hideDropPreview();
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

        // Docking preview
        const windowId = container.dataset.windowId;
        currentDropInfo = detectDropZone(touch.clientX, touch.clientY, windowId);
        if (currentDropInfo) {
            showDropPreview(currentDropInfo);
        } else {
            hideDropPreview();
        }
    });
    
    document.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            container.classList.remove('dragging');

            const windowId = container.dataset.windowId;
            if (currentDropInfo && dockWindow) {
                dockWindow(windowId, currentDropInfo.side, currentDropInfo.targetPanel || null);
            }
            const winState = state.windows.get(windowId);
            if (winState?.options) {
                winState.options.x = container.offsetLeft;
                winState.options.y = container.offsetTop;
                winState.options.width = container.offsetWidth;
                winState.options.height = container.offsetHeight;
            }
            currentDropInfo = null;
            hideDropPreview();
        }
    });
}

/**
 * Setup window resize behavior
 */
export function setupWindowResize(container, body) {
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

            const windowId = container.dataset.windowId;
            const winState = state.windows.get(windowId);
            if (winState?.options) {
                winState.options.x = container.offsetLeft;
                winState.options.y = container.offsetTop;
                winState.options.width = container.offsetWidth;
                winState.options.height = container.offsetHeight;
            }
        }
    });
}

/**
 * Setup window focus on click
 */
export function setupWindowFocus(container) {
    container.addEventListener('mousedown', () => {
        bringToFront(container.dataset.windowId);
    });
}

/**
 * Setup hover detection for window controls
 */
export function setupWindowControlsHover(body, controls) {
    const hoverZone = 60;
    
    body.addEventListener('mousemove', (e) => {
        const rect = body.getBoundingClientRect();
        const fromRight = rect.right - e.clientX;
        const fromTop = e.clientY - rect.top;
        
        const nearControls = fromRight < hoverZone && fromTop < hoverZone;
        controls.classList.toggle('visible', nearControls);
    });
    
    body.addEventListener('mouseleave', () => {
        controls.classList.remove('visible');
    });
    
    controls.addEventListener('mouseenter', () => {
        controls.classList.add('visible');
    });
}

/**
 * Bring window to front
 * @param {string} windowId - Window ID
 */
export function bringToFront(windowId) {
    const winState = state.windows.get(windowId);
    if (!winState) return;
    
    document.querySelectorAll('.sl-window-container').forEach(c => c.classList.remove('focused'));
    
    winState.element.classList.add('focused');
    winState.element.style.zIndex = ++state.zIndex;
    state.activeWindow = windowId;
    
    emit(EVENTS.WINDOW_FOCUS, { id: windowId });
}

/**
 * Close window permanently
 * @param {string} windowId - Window ID
 */
export function closeWindow(windowId) {
    const winState = state.windows.get(windowId);
    if (!winState) return;
    
    winState.element.remove();
    state.windows.delete(windowId);
    
    updateToolbarItem(windowId, false, false, false);
    emit(EVENTS.WINDOW_CLOSE, { id: windowId });
}

/**
 * Open/show a window
 * @param {string} windowId - Window ID
 */
export function openWindow(windowId) {
    const winState = state.windows.get(windowId);
    if (!winState) return;
    
    winState.visible = true;
    winState.element.style.display = '';
    
    if (!document.body.contains(winState.element)) {
        const floatLayer = document.getElementById('sl-float-layer');
        if (floatLayer) {
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

/**
 * Toggle window visibility
 * @param {string} windowId - Window ID
 * @param {Function} closeDockWindow - Close callback
 */
export function toggleWindow(windowId, closeDockWindow) {
    const winState = state.windows.get(windowId);
    
    if (!winState) return;
    
    if (winState.visible) {
        if (closeDockWindow) closeDockWindow(windowId);
    } else {
        openWindow(windowId);
    }
}
