/**
 * SLUI Tabs Component
 * Tab bar with content panels
 */

/**
 * Create a tabs component
 * @param {object} options - Configuration
 * @returns {HTMLElement}
 */
export function Tabs(options = {}) {
    const {
        tabs = [], // [{ id, label, icon?, content?, closable? }]
        activeTab = null,
        position = 'top', // 'top', 'bottom', 'left', 'right'
        variant = 'default', // 'default', 'pills', 'underline'
        closable = false,
        addable = false,
        reorderable = false,
        onTabChange = null,
        onTabClose = null,
        onTabAdd = null,
        onTabReorder = null,
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
    
    /**
     * Render the tab bar
     */
    function renderTabBar() {
        tabBar.innerHTML = '';
        
        currentTabs.forEach((tab, index) => {
            const tabEl = document.createElement('button');
            tabEl.className = 'sl-tab';
            tabEl.setAttribute('role', 'tab');
            tabEl.setAttribute('aria-selected', tab.id === activeId);
            tabEl.dataset.tabId = tab.id;
            
            if (tab.id === activeId) {
                tabEl.classList.add('active');
            }
            
            // Icon
            if (tab.icon) {
                const iconEl = document.createElement('span');
                iconEl.className = 'sl-tab-icon';
                iconEl.textContent = tab.icon;
                tabEl.appendChild(iconEl);
            }
            
            // Label
            const labelEl = document.createElement('span');
            labelEl.className = 'sl-tab-label';
            labelEl.textContent = tab.label;
            tabEl.appendChild(labelEl);
            
            // Close button
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
            
            // Click to activate
            tabEl.addEventListener('click', () => {
                setActiveTab(tab.id);
            });
            
            // Drag for reordering
            if (reorderable) {
                tabEl.draggable = true;
                tabEl.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', tab.id);
                    tabEl.classList.add('dragging');
                });
                tabEl.addEventListener('dragend', () => {
                    tabEl.classList.remove('dragging');
                });
                tabEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    tabEl.classList.add('drag-over');
                });
                tabEl.addEventListener('dragleave', () => {
                    tabEl.classList.remove('drag-over');
                });
                tabEl.addEventListener('drop', (e) => {
                    e.preventDefault();
                    tabEl.classList.remove('drag-over');
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (draggedId !== tab.id) {
                        reorderTabs(draggedId, tab.id);
                    }
                });
            }
            
            tabBar.appendChild(tabEl);
        });
        
        // Add button
        if (addable) {
            const addBtn = document.createElement('button');
            addBtn.className = 'sl-tab-add';
            addBtn.innerHTML = '+';
            addBtn.title = 'Add tab';
            addBtn.addEventListener('click', () => {
                if (onTabAdd) {
                    const newTab = onTabAdd();
                    if (newTab) {
                        addTab(newTab);
                    }
                }
            });
            tabBar.appendChild(addBtn);
        }
    }
    
    /**
     * Render the content for active tab
     */
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
    
    /**
     * Set the active tab
     * @param {string} id - Tab ID
     */
    function setActiveTab(id) {
        if (!currentTabs.find(t => t.id === id)) return;
        
        const prevId = activeId;
        activeId = id;
        
        // Update tab bar
        tabBar.querySelectorAll('.sl-tab').forEach(tab => {
            const isActive = tab.dataset.tabId === id;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });
        
        renderContent();
        
        if (onTabChange && prevId !== id) {
            onTabChange(id, prevId);
        }
    }
    
    /**
     * Add a new tab
     * @param {object} tab - Tab configuration
     */
    function addTab(tab) {
        currentTabs.push(tab);
        renderTabBar();
        setActiveTab(tab.id);
    }
    
    /**
     * Close a tab
     * @param {string} id - Tab ID
     */
    function closeTab(id) {
        const index = currentTabs.findIndex(t => t.id === id);
        if (index === -1) return;
        
        const closingTab = currentTabs[index];
        
        // Allow cancellation
        if (onTabClose) {
            const result = onTabClose(id);
            if (result === false) return;
        }
        
        currentTabs.splice(index, 1);
        
        // If closing active tab, activate adjacent
        if (activeId === id && currentTabs.length > 0) {
            const newIndex = Math.min(index, currentTabs.length - 1);
            activeId = currentTabs[newIndex].id;
        } else if (currentTabs.length === 0) {
            activeId = null;
        }
        
        renderTabBar();
        renderContent();
    }
    
    /**
     * Reorder tabs
     * @param {string} draggedId - Dragged tab ID
     * @param {string} targetId - Target tab ID
     */
    function reorderTabs(draggedId, targetId) {
        const draggedIndex = currentTabs.findIndex(t => t.id === draggedId);
        const targetIndex = currentTabs.findIndex(t => t.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        const [draggedTab] = currentTabs.splice(draggedIndex, 1);
        currentTabs.splice(targetIndex, 0, draggedTab);
        
        renderTabBar();
        
        if (onTabReorder) {
            onTabReorder(currentTabs.map(t => t.id));
        }
    }
    
    /**
     * Update a tab's properties
     * @param {string} id - Tab ID
     * @param {object} updates - Properties to update
     */
    function updateTab(id, updates) {
        const tab = currentTabs.find(t => t.id === id);
        if (tab) {
            Object.assign(tab, updates);
            renderTabBar();
            if (id === activeId) {
                renderContent();
            }
        }
    }
    
    // Build structure based on position
    if (position === 'bottom' || position === 'right') {
        container.appendChild(tabContent);
        container.appendChild(tabBar);
    } else {
        container.appendChild(tabBar);
        container.appendChild(tabContent);
    }
    
    // Initial render
    renderTabBar();
    renderContent();
    
    // Public API
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
