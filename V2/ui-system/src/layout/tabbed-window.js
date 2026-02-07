/**
 * SLUI Tabbed Windows
 * Ported from monolithic ui.js for API compatibility.
 */

import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { bringToFront, setupFrameHover, setupWindowControlsHover, setupWindowDrag, setupWindowResize, setupWindowFocus } from './window.js';
import { dockWindow, undockWindow, removeFromDockTree, renderDockTree } from './dock.js';
import { updateToolbarItem } from './toolbar.js';
import { TabPane, __getTabDragState } from '../components/tabpane.js';

// Registry of tabbed windows for cross-window tab dropping
const tabbedWindows = new Map();

/**
 * Create a tabbed window - Window with integrated TabPane
 * @param {object} options
 * @returns {HTMLElement|null}
 */
export function createTabbedWindow(options = {}) {
    const {
        id = 'tabwin-' + Date.now(),
        title = null,                // If null, uses active tab label (currently unused)
        icon = null,                 // If null, uses active tab icon (currently unused)
        x = 100,
        y = 100,
        width = 450,
        height = 350,
        minWidth = 200,
        minHeight = 150,
        group = 'default',
        tabs = [],
        activeTab = null,
        closable = true,
        tabBarAddon = null,          // Custom element at end of tab bar (e.g., "Add Tab" button)
        onTabClose = null,           // Called when a tab is closed
        onWindowClose = null,        // Legacy name
        onWindowClosed = null        // New name (preferred)
    } = options;
    
    // Support both callback names
    const windowCloseCallback = onWindowClosed || onWindowClose;

    // Don't create windows in mobile mode
    if (state.deviceMode === 'mobile') return null;

    // Window container
    const container = document.createElement('div');
    container.className = 'sl-window-container sl-tabbed-window';
    container.id = `sl-window-container-${id}`;
    container.dataset.windowId = id;
    container.dataset.tabGroup = group;
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.minWidth = `${minWidth}px`;
    container.style.minHeight = `${minHeight}px`;

    // Frame
    const frame = document.createElement('div');
    frame.className = 'sl-window-frame';
    container.appendChild(frame);

    // Window element
    const win = document.createElement('div');
    win.className = 'sl-window';
    win.id = `sl-window-${id}`;
    win.dataset.windowId = id;

    // Body
    const body = document.createElement('div');
    body.className = 'sl-window-body sl-tabbed-window-body';

    // Controls
    const controls = document.createElement('div');
    controls.className = 'sl-window-controls';

    const dockBtn = document.createElement('button');
    dockBtn.className = 'sl-window-ctrl-btn dock';
    dockBtn.innerHTML = '↘';
    dockBtn.title = 'Dock';
    dockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dockWindow(id, 'right');
    });
    controls.appendChild(dockBtn);

    const undockBtn = document.createElement('button');
    undockBtn.className = 'sl-window-ctrl-btn undock';
    undockBtn.innerHTML = '↗';
    undockBtn.title = 'Undock';
    undockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        undockWindow(id);
    });
    controls.appendChild(undockBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sl-window-ctrl-btn close';
    closeBtn.innerHTML = '×';
    closeBtn.title = t('window.close');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTabbedWindow(id);
    });
    controls.appendChild(closeBtn);

    body.appendChild(controls);

    // Create the TabPane
    const tabPane = TabPane({
        id: id + '-pane',
        group,
        tabs,
        activeTab,
        closable,
        draggable: true,
        droppable: true,
        tabBarAddon,
        onTabChange: () => {
            // For now, tabbed windows show tabs instead of a title bar.
        },
        onTabClose: onTabClose,
        onTabDragOut: (tab, dragX, dragY) => {
            const newWin = createTabbedWindow({
                group,
                tabs: [tab],
                activeTab: tab.id,
                x: dragX - 100,
                y: dragY - 20,
                width,
                height,
                onWindowClosed: windowCloseCallback  // Inherit callback
            });
            if (newWin) {
                const floatLayer = document.getElementById('sl-float-layer');
                if (floatLayer) floatLayer.appendChild(newWin);
                bringToFront(newWin.dataset.windowId);
            }
        },
        onEmpty: () => {
            closeTabbedWindow(id);
        },
        onSingleTabDrag: (e, tab, pointerId) => {
            // Only 1 tab - drag the whole window instead
            startTabbedWindowDrag(container, frame, e, tabPane, pointerId);
        }
    });

    const contentEl = document.createElement('div');
    contentEl.className = 'sl-window-content sl-tabbed-window-content';
    contentEl.appendChild(tabPane);
    body.appendChild(contentEl);

    // Resize handles (corners only)
    ['nw', 'ne', 'sw', 'se'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `sl-resize-handle ${dir}`;
        handle.dataset.direction = dir;
        body.appendChild(handle);
    });

    win.appendChild(body);
    container.appendChild(win);

    // Setup interactions (reuse window.js helpers)
    setupWindowControlsHover(body, controls);
    setupFrameHover(container, body, frame);
    // Pass dockWindow so drag-to-dock actually docks (not just shows preview)
    setupWindowDrag(container, frame, dockWindow);
    setupWindowResize(container, body);
    setupWindowFocus(container);

    // Setup tab drop zone on window's tab bar
    setupWindowTabDrop(container, tabPane);

    // Register in windows + tabbedWindows
    state.windows.set(id, {
        element: container,
        window: win,
        body,
        frame,
        controls,
        options: { ...options, id },
        visible: true
    });

    tabbedWindows.set(id, {
        container,
        tabPane,
        group
    });

    bringToFront(id);

    // Attach API to container (matches ui.js)
    container.getTabPane = () => tabPane;
    container.addTab = (tab, activate) => tabPane.addTab(tab, activate);
    container.removeTab = (tabId) => tabPane.removeTab(tabId);
    container.getTabs = () => tabPane.getTabs();
    container.getActiveTab = () => tabPane.getActiveTab();
    container.setActiveTab = (tabId) => tabPane.setActiveTab(tabId);

    return container;
}

export function closeTabbedWindow(id) {
    const windowData = state.windows.get(id);
    if (!windowData) return;

    // Call window close callback if provided (support both names)
    const closeCallback = windowData.options?.onWindowClosed || windowData.options?.onWindowClose;
    if (closeCallback) {
        try {
            closeCallback(id);
        } catch (e) {
            console.error('onWindowClosed callback error:', e);
        }
    }

    // If docked, remove from dock tree first
    if (state.dockedWindows.has(id)) {
        removeFromDockTree(id);
        state.dockedWindows.delete(id);
        renderDockTree();
    }

    if (windowData.element) {
        windowData.element.remove();
    }

    state.windows.delete(id);
    tabbedWindows.delete(id);

    updateToolbarItem(id, false, false, false);
}

// Start dragging a tabbed window (when only 1 tab, drag from tab bar)
// Allows tab-merging when dropped on another window's tab bar
function startTabbedWindowDrag(container, frame, startEvent, sourceTabPane, pointerId) {
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const startLeft = container.offsetLeft;
    const startTop = container.offsetTop;
    const sourceGroup = sourceTabPane.getGroup();

    container.style.transition = 'none';
    container.classList.add('dragging');
    bringToFront(container.dataset.windowId);

    if (pointerId !== undefined) {
        try { container.setPointerCapture(pointerId); } catch {}
    }

    let currentDropTarget = null;

    function onMove(e) {
        const clientX = e.clientX !== undefined ? e.clientX : startX;
        const clientY = e.clientY !== undefined ? e.clientY : startY;
        const dx = clientX - startX;
        const dy = clientY - startY;
        container.style.left = `${startLeft + dx}px`;
        container.style.top = `${startTop + dy}px`;

        currentDropTarget = findTabbedWindowDropTarget(clientX, clientY, container.dataset.windowId, sourceGroup);

        document.querySelectorAll('.sl-tabbed-window-body.tab-drop-ready').forEach(el => {
            el.classList.remove('tab-drop-ready');
        });

        if (currentDropTarget) {
            currentDropTarget.body.classList.add('tab-drop-ready');
        }
    }

    function cleanup() {
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerup', onUp);
        container.removeEventListener('pointercancel', onUp);

        if (pointerId !== undefined) {
            try { container.releasePointerCapture(pointerId); } catch {}
        }

        container.style.transition = '';
        container.classList.remove('dragging');

        document.querySelectorAll('.sl-tabbed-window-body.tab-drop-ready').forEach(el => {
            el.classList.remove('tab-drop-ready');
        });
    }

    function onUp() {
        cleanup();

        if (currentDropTarget) {
            mergeTabbedWindows(container.dataset.windowId, currentDropTarget.windowId);
        }
    }

    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
}

function findTabbedWindowDropTarget(x, y, excludeWindowId, requiredGroup) {
    for (const [windowId, data] of tabbedWindows) {
        if (windowId === excludeWindowId) continue;
        if (data.group !== requiredGroup) continue;

        const tabBar = data.tabPane.querySelector('.sl-tabpane-bar');
        if (!tabBar) continue;

        const rect = tabBar.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return {
                windowId,
                tabPane: data.tabPane,
                body: data.container.querySelector('.sl-window-body')
            };
        }
    }
    return null;
}

function mergeTabbedWindows(sourceWindowId, targetWindowId) {
    const sourceData = tabbedWindows.get(sourceWindowId);
    const targetData = tabbedWindows.get(targetWindowId);
    if (!sourceData || !targetData) return;

    const sourceTabs = sourceData.tabPane.getTabs();
    for (const tab of sourceTabs) {
        targetData.tabPane.addTab(tab, false);
    }
    if (sourceTabs.length > 0) {
        targetData.tabPane.setActiveTab(sourceTabs[0].id);
    }

    closeTabbedWindow(sourceWindowId);
    bringToFront(targetWindowId);
}

function setupWindowTabDrop(container, tabPane) {
    const body = container.querySelector('.sl-window-body');
    if (!body) return;

    body.addEventListener('mouseenter', () => {
        const drag = __getTabDragState();
        if (drag && drag.sourceGroup === tabPane.getGroup()) {
            body.classList.add('tab-drop-ready');
        }
    });

    body.addEventListener('mouseleave', () => {
        body.classList.remove('tab-drop-ready');
    });
}

