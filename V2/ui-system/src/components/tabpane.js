/**
 * SLUI TabPane (advanced draggable tabs)
 * Ported from monolithic ui.js for API compatibility.
 */

import { state } from '../core/state.js';

// Global drag state for tab dragging across panes
let tabDragState = null;

// Compat hook for tabbed-window hover/merge behaviors (matches ui.js shared scope)
export function __getTabDragState() {
    return tabDragState;
}

export function TabPane(options = {}) {
    const {
        id = 'tabpane-' + Date.now(),
        tabs = [],
        activeTab = null,
        group = 'default',           // Tab group - only tabs of same group can be combined
        closable = true,
        draggable = true,            // Allow tab reordering and drag-out
        droppable = true,            // Accept tabs from other panes
        onTabChange = null,
        onTabClose = null,
        onTabDragOut = null,         // Called when tab is dragged out (for creating new window)
        onTabDrop = null,            // Called when tab is dropped from another pane
        onEmpty = null,              // Called when last tab is closed
        onSingleTabDrag = null,      // Called when only 1 tab and user drags it (for window dragging)
        tabBarAddon = null,          // Custom element to add at end of tab bar (e.g., "Add Tab" button)
        className = ''
    } = options;

    const container = document.createElement('div');
    container.className = `sl-tabpane ${className}`.trim();
    container.dataset.tabpaneId = id;
    container.dataset.tabGroup = group;

    const tabBar = document.createElement('div');
    tabBar.className = 'sl-tabpane-bar';

    const tabContent = document.createElement('div');
    tabContent.className = 'sl-tabpane-content';

    let currentTabs = [...tabs];
    let activeId = activeTab || (tabs.length > 0 ? tabs[0].id : null);

    // ---- Rendering ----

    function render() {
        renderTabBar();
        renderContent();
    }

    function renderTabBar() {
        tabBar.innerHTML = '';

        currentTabs.forEach((tab, index) => {
            const tabEl = document.createElement('div');
            tabEl.className = 'sl-tabpane-tab';
            tabEl.dataset.tabId = tab.id;
            tabEl.dataset.tabIndex = index;
            if (tab.id === activeId) tabEl.classList.add('active');

            // Icon
            if (tab.icon) {
                const iconEl = document.createElement('span');
                iconEl.className = 'sl-tabpane-tab-icon';
                if (tab.icon.startsWith('<')) {
                    iconEl.innerHTML = tab.icon;
                } else {
                    iconEl.textContent = tab.icon;
                }
                tabEl.appendChild(iconEl);
            }

            // Label
            const labelEl = document.createElement('span');
            labelEl.className = 'sl-tabpane-tab-label';
            labelEl.textContent = tab.label || tab.id;
            tabEl.appendChild(labelEl);

            // Close button
            if (closable && tab.closable !== false) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'sl-tabpane-tab-close';
                closeBtn.innerHTML = '×';
                closeBtn.title = 'Close tab';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                });
                tabEl.appendChild(closeBtn);
            }

            // Click to activate
            tabEl.addEventListener('click', (e) => {
                if (!e.target.closest('.sl-tabpane-tab-close')) {
                    setActiveTab(tab.id);
                }
            });

            // Drag support (desktop only)
            if (draggable && state.deviceMode !== 'mobile') {
                setupTabDrag(tabEl, tab, index);
            }

            tabBar.appendChild(tabEl);
        });

        // Add tab bar addon (e.g., "Add Tab" button) if provided
        if (tabBarAddon) {
            const addon = typeof tabBarAddon === 'function' ? tabBarAddon() : tabBarAddon;
            if (addon instanceof HTMLElement) {
                addon.classList.add('sl-tabpane-addon');
                tabBar.appendChild(addon);
            }
        }

        // Drop zone indicator (between tabs and at end)
        if (droppable && state.deviceMode !== 'mobile') {
            setupTabBarDrop();
        }
    }

    function renderContent() {
        tabContent.innerHTML = '';
        const activeTabData = currentTabs.find(t => t.id === activeId);
        
        if (activeTabData) {
            const panel = document.createElement('div');
            panel.className = 'sl-tabpane-panel';
            panel.dataset.tabId = activeTabData.id;

            if (activeTabData.content) {
                if (typeof activeTabData.content === 'function') {
                    const content = activeTabData.content();
                    if (typeof content === 'string') {
                        panel.innerHTML = content;
                    } else if (content) {
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

    // ---- Tab Drag & Drop ----

    function setupTabDrag(tabEl, tab, index) {
        let isDragging = false;
        let startX, startY;
        let dragThreshold = 5;
        let hasMoved = false;
        let handedOffToWindow = false;

        tabEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.sl-tabpane-tab-close')) return;
            if (e.button !== 0) return;

            isDragging = true;
            hasMoved = false;
            handedOffToWindow = false;
            startX = e.clientX;
            startY = e.clientY;

            tabEl.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        tabEl.addEventListener('pointermove', (e) => {
            if (!isDragging || handedOffToWindow) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (!hasMoved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
                hasMoved = true;

                // If only 1 tab and we have a window drag handler, use that instead
                if (currentTabs.length === 1 && onSingleTabDrag) {
                    handedOffToWindow = true;
                    tabEl.releasePointerCapture(e.pointerId);
                    // Pass the pointerId so the window drag can capture it
                    onSingleTabDrag(e, tab, e.pointerId);
                    return;
                }

                startTabDrag(tab, e.clientX, e.clientY);
            }

            if (hasMoved && tabDragState) {
                updateTabDrag(e.clientX, e.clientY);
            }
        });

        tabEl.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            if (!handedOffToWindow) {
                tabEl.releasePointerCapture(e.pointerId);
            }

            if (hasMoved && tabDragState) {
                endTabDrag(e.clientX, e.clientY);
            }
        });

        tabEl.addEventListener('pointercancel', (e) => {
            if (!isDragging) return;
            isDragging = false;
            if (!handedOffToWindow) {
                cancelTabDrag();
            }
        });
    }

    function startTabDrag(tab, x, y) {
        // Create ghost element
        const ghost = document.createElement('div');
        ghost.className = 'sl-tabpane-drag-ghost';
        ghost.innerHTML = `<span class="sl-tabpane-tab-icon">${tab.icon || ''}</span><span>${tab.label || tab.id}</span>`;
        ghost.style.left = x + 'px';
        ghost.style.top = y + 'px';
        document.body.appendChild(ghost);

        tabDragState = {
            tab,
            sourcePane: container,
            sourcePaneId: id,
            sourceGroup: group,
            ghost,
            startX: x,
            startY: y
        };

        container.classList.add('dragging-tab');
        document.body.classList.add('sl-tab-dragging');
    }

    function updateTabDrag(x, y) {
        if (!tabDragState || !tabDragState.ghost) return;

        tabDragState.ghost.style.left = x + 'px';
        tabDragState.ghost.style.top = y + 'px';

        // Find drop target
        const target = findDropTarget(x, y);
        clearDropIndicators();

        if (target) {
            showDropIndicator(target);
        }
    }

    function endTabDrag(x, y) {
        if (!tabDragState) return;

        const target = findDropTarget(x, y);
        clearDropIndicators();

        if (target) {
            handleTabDrop(target);
        } else {
            // Dragged outside all panes
            if (onTabDragOut) {
                // Only remove tab if callback is provided (meaning something will handle it)
                const tab = tabDragState.tab;
                onTabDragOut(tab, x, y);
                // Pass true to trigger onEmpty if this was the last tab
                removeTab(tab.id, true);
            }
            // If no onTabDragOut callback, just cancel the drag (tab stays)
        }

        cleanupTabDrag();
    }

    function cancelTabDrag() {
        clearDropIndicators();
        cleanupTabDrag();
    }

    function cleanupTabDrag() {
        if (tabDragState && tabDragState.ghost) {
            tabDragState.ghost.remove();
        }
        container.classList.remove('dragging-tab');
        document.body.classList.remove('sl-tab-dragging');
        tabDragState = null;
    }

    function findDropTarget(x, y) {
        const panes = document.querySelectorAll('.sl-tabpane');
        
        for (const pane of panes) {
            if (!pane.dataset.tabGroup) continue;
            
            // Check group compatibility
            if (tabDragState && pane.dataset.tabGroup !== tabDragState.sourceGroup) continue;

            const bar = pane.querySelector('.sl-tabpane-bar');
            if (!bar) continue;

            const barRect = bar.getBoundingClientRect();
            
            // Check if over the tab bar
            if (x >= barRect.left && x <= barRect.right && 
                y >= barRect.top && y <= barRect.bottom) {
                
                // Find insertion position
                const tabs = bar.querySelectorAll('.sl-tabpane-tab');
                let insertIndex = tabs.length;
                
                for (let i = 0; i < tabs.length; i++) {
                    const tabRect = tabs[i].getBoundingClientRect();
                    const midX = tabRect.left + tabRect.width / 2;
                    
                    if (x < midX) {
                        insertIndex = i;
                        break;
                    }
                }

                return {
                    pane,
                    paneId: pane.dataset.tabpaneId,
                    insertIndex,
                    isOwnPane: pane === container
                };
            }
        }

        return null;
    }

    function showDropIndicator(target) {
        const bar = target.pane.querySelector('.sl-tabpane-bar');
        if (!bar) return;

        // Create or update indicator
        let indicator = bar.querySelector('.sl-tabpane-drop-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'sl-tabpane-drop-indicator';
            bar.appendChild(indicator);
        }

        const tabs = bar.querySelectorAll('.sl-tabpane-tab');
        
        if (tabs.length === 0 || target.insertIndex >= tabs.length) {
            // At end
            const lastTab = tabs[tabs.length - 1];
            if (lastTab) {
                const rect = lastTab.getBoundingClientRect();
                const barRect = bar.getBoundingClientRect();
                indicator.style.left = (rect.right - barRect.left) + 'px';
            } else {
                indicator.style.left = '0px';
            }
        } else {
            // Before a tab
            const tabRect = tabs[target.insertIndex].getBoundingClientRect();
            const barRect = bar.getBoundingClientRect();
            indicator.style.left = (tabRect.left - barRect.left) + 'px';
        }

        indicator.classList.add('visible');
        target.pane.classList.add('drop-target');
    }

    function clearDropIndicators() {
        document.querySelectorAll('.sl-tabpane-drop-indicator').forEach(el => {
            el.classList.remove('visible');
        });
        document.querySelectorAll('.sl-tabpane.drop-target').forEach(el => {
            el.classList.remove('drop-target');
        });
    }

    function handleTabDrop(target) {
        if (!tabDragState) return;

        const tab = tabDragState.tab;
        const sourcePane = tabDragState.sourcePane;
        const targetPane = target.pane;

        if (sourcePane === targetPane) {
            // Reorder within same pane
            reorderTab(tab.id, target.insertIndex);
        } else {
            // Move to different pane
            if (sourcePane.removeTab) {
                // Pass true to trigger onEmpty if this was the last tab
                sourcePane.removeTab(tab.id, true);
            }
            if (targetPane.insertTab) {
                targetPane.insertTab(tab, target.insertIndex);
            }
            if (onTabDrop) {
                onTabDrop(tab, target.paneId);
            }
        }
    }

    function setupTabBarDrop() {
        // The drop handling is done globally during drag
        // This just marks the bar as a drop target
        tabBar.dataset.droppable = 'true';
    }

    // ---- Tab Management ----

    function setActiveTab(tabId) {
        if (!currentTabs.find(t => t.id === tabId)) return;
        const prevId = activeId;
        activeId = tabId;

        tabBar.querySelectorAll('.sl-tabpane-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tabId === tabId);
        });

        renderContent();
        if (onTabChange && prevId !== tabId) onTabChange(tabId, prevId);
    }

    function addTab(tab, activate = true) {
        currentTabs.push(tab);
        render();
        if (activate) setActiveTab(tab.id);
        return tab.id;
    }

    function insertTab(tab, index, activate = true) {
        index = Math.max(0, Math.min(index, currentTabs.length));
        currentTabs.splice(index, 0, tab);
        render();
        if (activate) setActiveTab(tab.id);
        return tab.id;
    }

    function removeTab(tabId, triggerEmpty = true) {
        const index = currentTabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        currentTabs.splice(index, 1);

        if (activeId === tabId && currentTabs.length > 0) {
            const newIndex = Math.min(index, currentTabs.length - 1);
            activeId = currentTabs[newIndex].id;
        } else if (currentTabs.length === 0) {
            activeId = null;
            if (triggerEmpty && onEmpty) onEmpty();
        }

        render();
    }

    function closeTab(tabId) {
        if (onTabClose) {
            const result = onTabClose(tabId);
            if (result === false) return;
        }
        removeTab(tabId, true);
    }

    function reorderTab(tabId, newIndex) {
        const oldIndex = currentTabs.findIndex(t => t.id === tabId);
        if (oldIndex === -1 || oldIndex === newIndex) return;

        const [tab] = currentTabs.splice(oldIndex, 1);
        // Adjust index if moving forward
        if (newIndex > oldIndex) newIndex--;
        newIndex = Math.max(0, Math.min(newIndex, currentTabs.length));
        currentTabs.splice(newIndex, 0, tab);

        render();
    }

    function updateTab(tabId, updates) {
        const tab = currentTabs.find(t => t.id === tabId);
        if (tab) {
            Object.assign(tab, updates);
            render();
        }
    }

    function getTab(tabId) {
        return currentTabs.find(t => t.id === tabId);
    }

    // ---- Initialize ----

    container.appendChild(tabBar);
    container.appendChild(tabContent);
    render();

    // Public API
    container.setActiveTab = setActiveTab;
    container.addTab = addTab;
    container.insertTab = insertTab;
    container.removeTab = removeTab;
    container.closeTab = closeTab;
    container.reorderTab = reorderTab;
    container.updateTab = updateTab;
    container.getTab = getTab;
    container.getTabs = () => [...currentTabs];
    container.getActiveTab = () => activeId;
    container.getGroup = () => group;
    container.getId = () => id;
    container.render = render;

    return container;
}

