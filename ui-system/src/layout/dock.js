/**
 * SLUI Docking System
 * BSP tree-based window docking
 */

import { state } from '../core/state.js';
import { updateToolbarItem } from './toolbar.js';
import { bringToFront } from './window.js';

/**
 * Dock a window to a specific edge
 * @param {string} windowId - Window ID
 * @param {string} side - 'left' | 'right' | 'top' | 'bottom'
 * @param {string} targetPanelId - Optional panel to split
 */
export function dockWindow(windowId, side, targetPanelId = null) {
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
        state.dockTree = newLeaf;
    } else if (targetPanelId) {
        splitNodeByPanelId(state.dockTree, targetPanelId, newLeaf, side);
    } else {
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
    
    renderDockTree();
    updateToolbarItem(windowId, true, true, false);
}

/**
 * Find and split a specific node by panelId
 */
function splitNodeByPanelId(tree, targetPanelId, newLeaf, side, parent = null, parentKey = null) {
    if (!tree) return false;
    
    if (tree.type === 'leaf' && tree.panelId === targetPanelId) {
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

/**
 * Remove a window from the dock tree
 * @param {string} panelId - Panel ID
 */
export function removeFromDockTree(panelId) {
    if (!state.dockTree) return;
    
    if (state.dockTree.type === 'leaf' && state.dockTree.panelId === panelId) {
        state.dockTree = null;
        return;
    }
    
    removeNodeByPanelId(state.dockTree, panelId, null, null);
}

function removeNodeByPanelId(tree, panelId, parent, parentKey) {
    if (!tree || tree.type !== 'split') return false;
    
    if (tree.first.type === 'leaf' && tree.first.panelId === panelId) {
        if (parent && parentKey) {
            parent[parentKey] = tree.second;
        } else {
            state.dockTree = tree.second;
        }
        return true;
    }
    
    if (tree.second.type === 'leaf' && tree.second.panelId === panelId) {
        if (parent && parentKey) {
            parent[parentKey] = tree.first;
        } else {
            state.dockTree = tree.first;
        }
        return true;
    }
    
    if (tree.first.type === 'split') {
        if (removeNodeByPanelId(tree.first, panelId, tree, 'first')) return true;
    }
    if (tree.second.type === 'split') {
        if (removeNodeByPanelId(tree.second, panelId, tree, 'second')) return true;
    }
    
    return false;
}

/**
 * Undock a window - remove from tree and float it
 * @param {string} windowId - Window ID
 */
export function undockWindow(windowId) {
    const winState = state.windows.get(windowId);
    if (!winState || !state.dockedWindows.has(windowId)) return;
    
    removeFromDockTree(windowId);
    state.dockedWindows.delete(windowId);
    
    renderDockTree();
    
    const floatLayer = document.getElementById('sl-float-layer');
    if (floatLayer) {
        const width = winState.options.width || 400;
        const height = winState.options.height || 300;
        winState.element.style.left = `${(window.innerWidth - width) / 2}px`;
        winState.element.style.top = `${(window.innerHeight - height) / 2}px`;
        winState.element.style.width = `${width}px`;
        winState.element.style.height = `${height}px`;
        
        floatLayer.appendChild(winState.element);
        
        // Bring to front
        bringToFront(windowId);
    }
    
    updateToolbarItem(windowId, true, true, false);
}

/**
 * Close a window - remove from dock tree if docked, then hide
 * @param {string} windowId - Window ID
 */
export function closeDockWindow(windowId) {
    const winState = state.windows.get(windowId);
    if (!winState) return;
    
    if (state.dockedWindows.has(windowId)) {
        removeFromDockTree(windowId);
        state.dockedWindows.delete(windowId);
        renderDockTree();
    }
    
    const floatLayer = document.getElementById('sl-float-layer');
    if (floatLayer && winState.element.parentNode === floatLayer) {
        floatLayer.removeChild(winState.element);
    }
    
    winState.visible = false;
    winState.element.style.display = 'none';
    
    updateToolbarItem(windowId, false, false, false);
}

/**
 * Render the dock tree to the DOM
 */
export function renderDockTree() {
    const dockLayer = document.getElementById('sl-dock-layer');
    if (!dockLayer) return;
    
    dockLayer.innerHTML = '';
    
    if (!state.dockTree) return;
    
    const element = buildDockNode(state.dockTree);
    if (element) {
        dockLayer.appendChild(element);
    }
}

/**
 * Recursively build dock node DOM
 */
function buildDockNode(node) {
    if (!node) return null;
    
    if (node.type === 'leaf') {
        const panel = document.createElement('div');
        panel.className = 'sl-dock-panel';
        panel.dataset.panelId = node.panelId;
        
        ['left', 'right', 'top', 'bottom'].forEach(side => {
            const dropZone = document.createElement('div');
            dropZone.className = `sl-panel-drop-zone ${side}`;
            dropZone.dataset.side = side;
            dropZone.dataset.targetPanel = node.panelId;
            panel.appendChild(dropZone);
        });
        
        const winState = state.windows.get(node.panelId);
        if (winState && winState.element) {
            panel.appendChild(winState.element);
        }
        
        return panel;
    }
    
    if (node.type === 'split') {
        const container = document.createElement('div');
        container.className = 'sl-dock-container';
        container.dataset.direction = node.direction;
        
        const first = buildDockNode(node.first);
        const second = buildDockNode(node.second);
        
        if (first) {
            first.style.flex = node.ratio;
            container.appendChild(first);
        }
        
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

/**
 * Setup divider drag to resize splits
 */
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

/**
 * Detect drop zone during drag
 * @returns {{ side: string, targetPanel: string|null } | null}
 */
export function detectDropZone(x, y, draggedWindowId) {
    const workspace = document.getElementById('sl-workspace');
    if (!workspace) return null;
    
    const workspaceRect = workspace.getBoundingClientRect();
    const screenEdge = 40;
    const panelEdge = 30;
    
    const panels = document.querySelectorAll('.sl-dock-panel');
    
    for (const panel of panels) {
        const panelId = panel.dataset.panelId;
        if (panelId === draggedWindowId) continue;
        
        const rect = panel.getBoundingClientRect();
        
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            const fromLeft = x - rect.left;
            const fromRight = rect.right - x;
            const fromTop = y - rect.top;
            const fromBottom = rect.bottom - y;
            
            if (fromLeft < panelEdge) return { side: 'left', targetPanel: panelId };
            if (fromRight < panelEdge) return { side: 'right', targetPanel: panelId };
            if (fromTop < panelEdge) return { side: 'top', targetPanel: panelId };
            if (fromBottom < panelEdge) return { side: 'bottom', targetPanel: panelId };
        }
    }
    
    if (panels.length === 0 || !state.dockTree) {
        if (x - workspaceRect.left < screenEdge) return { side: 'left', targetPanel: null };
        if (workspaceRect.right - x < screenEdge) return { side: 'right', targetPanel: null };
        if (y - workspaceRect.top < screenEdge) return { side: 'top', targetPanel: null };
        if (workspaceRect.bottom - y < screenEdge) return { side: 'bottom', targetPanel: null };
    }
    
    return null;
}

/**
 * Show drop preview
 */
export function showDropPreview(dropInfo) {
    const preview = document.getElementById('sl-drop-preview');
    const workspace = document.getElementById('sl-workspace');
    if (!preview || !workspace || !dropInfo) return;
    
    const { side, targetPanel } = dropInfo;
    let targetRect;
    
    if (targetPanel) {
        const panel = document.querySelector(`.sl-dock-panel[data-panel-id="${targetPanel}"]`);
        if (panel) {
            targetRect = panel.getBoundingClientRect();
        } else {
            return;
        }
    } else {
        targetRect = workspace.getBoundingClientRect();
    }
    
    let previewRect = { left: 0, top: 0, width: 0, height: 0 };
    
    if (!state.dockTree && !targetPanel) {
        previewRect = { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height };
    } else {
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
}

/**
 * Hide drop preview
 */
export function hideDropPreview() {
    const preview = document.getElementById('sl-drop-preview');
    if (preview) preview.classList.remove('visible');
    document.querySelectorAll('.sl-drop-zone').forEach(z => z.classList.remove('active'));
    document.querySelectorAll('.sl-panel-drop-zone').forEach(z => z.classList.remove('active'));
}
