// ============================================================================
// Tabs - Tab Management and UI
// ============================================================================

import { state } from './core.js';
import { MINIMAL_AUDIO_GPU, MINIMAL_AUDIO_WORKLET } from './examples.js';

// ============================================================================
// Tab Information
// ============================================================================

function getTabIcon(tabName) {
    const icons = {
        boilerplate: '📄',
        graphics: '🎨',
        glsl_fragment: '🔺',
        audio_gpu: '🔊',
        audio_worklet: '🎵',
        js: '⚡',
        help: '❓'
    };
    return icons[tabName] || '📝';
}

function getTabLabel(tabName) {
    const labels = {
        boilerplate: 'Boilerplate',
        graphics: 'Graphics (WGSL)',
        glsl_fragment: 'Fragment (GLSL)',
        audio_gpu: 'Audio (WGSL)',
        audio_worklet: 'Audio (Worklet)',
        js: 'JavaScript',
        help: 'Help'
    };
    return labels[tabName] || tabName;
}

// ============================================================================
// Tab Rendering
// ============================================================================

export function renderTabs() {
    const tabsContainer = document.getElementById('editorTabs');
    
    // Remove all tab buttons but keep the action buttons
    const addPassBtn = document.getElementById('addPassBtn');
    const optionsBtn = document.getElementById('optionsBtn');
    tabsContainer.innerHTML = '';
    
    // Add tab buttons
    state.activeTabs.forEach(tabName => {
        const button = document.createElement('button');
        button.className = 'editorTab' + (state.currentTab === tabName ? ' active' : '');
        button.textContent = `${getTabIcon(tabName)} ${getTabLabel(tabName)}`;
        button.onclick = () => switchTab(tabName);
        
        // Add close button (graphics is still mandatory, can't be closed)
        if (tabName !== 'graphics') {
            const closeBtn = document.createElement('span');
            closeBtn.textContent = ' ×';
            closeBtn.style.marginLeft = '6px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                removeTab(tabName);
            };
            button.appendChild(closeBtn);
        }
        
        tabsContainer.appendChild(button);
    });
    
    // Re-add the action buttons at the end
    if (addPassBtn) {
        tabsContainer.appendChild(addPassBtn);
    }
    if (optionsBtn) {
        tabsContainer.appendChild(optionsBtn);
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

export function switchTab(tabName) {
    if (!state.activeTabs.includes(tabName)) {
        return;
    }
    
    state.currentTab = tabName;
    
    const containers = {
        boilerplate: document.getElementById('boilerplateContainer'),
        graphics: document.getElementById('graphicsContainer'),
        glsl_fragment: document.getElementById('graphicsContainer'),  // GLSL uses graphics container
        audio_gpu: document.getElementById('audioContainer'),
        audio_worklet: document.getElementById('audioContainer'),  // Both audio tabs use same container
        js: document.getElementById('jsEditorContainer'),
        help: document.getElementById('helpContainer')
    };
    
    const editors = {
        boilerplate: state.boilerplateEditor,
        graphics: state.graphicsEditor,
        glsl_fragment: state.graphicsEditor,  // GLSL uses graphics editor
        audio_gpu: state.audioEditor,
        audio_worklet: state.audioEditor,  // Both audio tabs use same editor
        js: state.jsEditor,
        help: state.helpEditor
    };
    
    // Hide all containers (use unique set to avoid hiding/showing same container twice)
    const uniqueContainers = [...new Set(Object.values(containers))];
    uniqueContainers.forEach(c => c.style.display = 'none');
    
    // Show selected container
    if (containers[tabName]) {
        containers[tabName].style.display = 'block';
    }
    
    // Update editor language mode based on tab
    if (tabName === 'graphics' && state.graphicsEditor) {
        monaco.editor.setModelLanguage(state.graphicsEditor.getModel(), 'wgsl');
    } else if (tabName === 'glsl_fragment' && state.graphicsEditor) {
        monaco.editor.setModelLanguage(state.graphicsEditor.getModel(), 'glsl');
    } else if (tabName === 'audio_gpu' && state.audioEditor) {
        monaco.editor.setModelLanguage(state.audioEditor.getModel(), 'wgsl');
    } else if (tabName === 'audio_worklet' && state.audioEditor) {
        monaco.editor.setModelLanguage(state.audioEditor.getModel(), 'javascript');
    }
    
    // Force layout update
    if (editors[tabName]) {
        editors[tabName].layout();
    }
    
    // Update tab buttons
    renderTabs();
}

// ============================================================================
// Add/Remove Tabs
// ============================================================================

export function addTab(tabName) {
    if (state.activeTabs.includes(tabName)) {
        switchTab(tabName);
        return;
    }
    
    // Audio tabs are mutually exclusive - remove the other if adding one
    if (tabName === 'audio_gpu' || tabName === 'audio_worklet') {
        const otherAudioTab = tabName === 'audio_gpu' ? 'audio_worklet' : 'audio_gpu';
        const otherIndex = state.activeTabs.indexOf(otherAudioTab);
        if (otherIndex !== -1) {
            state.activeTabs.splice(otherIndex, 1);
        }
    }
    
    state.activeTabs.push(tabName);
    
    // Initialize new audio tabs with starter code
    if (state.audioEditor) {
        if (tabName === 'audio_gpu') {
            state.audioEditor.setValue(MINIMAL_AUDIO_GPU);
        } else if (tabName === 'audio_worklet') {
            state.audioEditor.setValue(MINIMAL_AUDIO_WORKLET);
        }
    }
    
    switchTab(tabName);
}

export function removeTab(tabName) {
    // Can't remove graphics (it's mandatory)
    if (tabName === 'graphics') {
        return;
    }
    
    const index = state.activeTabs.indexOf(tabName);
    if (index === -1) return;
    
    state.activeTabs.splice(index, 1);
    
    // If removing an audio tab, clear audio type and stop audio
    if (tabName === 'audio_gpu' || tabName === 'audio_worklet') {
        state.currentAudioType = null;
        // Dispatch event for audio cleanup
        window.dispatchEvent(new CustomEvent('stop-audio'));
    }
    
    // If removing JS tab, trigger recompilation to reset JS runtime
    if (tabName === 'js') {
        // Dispatch event to trigger shader recompilation
        window.dispatchEvent(new CustomEvent('tab-removed-recompile'));
    }
    
    // If we removed the current tab, switch to another
    if (state.currentTab === tabName) {
        switchTab(state.activeTabs[Math.max(0, index - 1)]);
    }
    
    renderTabs();
}

// ============================================================================
// Add Pass Menu
// ============================================================================

export function showAddPassMenu() {
    const btn = document.getElementById('addPassBtn');
    
    // Create menu if it doesn't exist
    let menu = document.getElementById('addPassMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'addPassMenu';
        menu.style.cssText = `
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            padding: 4px;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(menu);
    }
    
    // Build menu options
    const availableTabs = [
        { name: 'boilerplate', label: '📄 Boilerplate' },
        { name: 'audio_gpu', label: '🔊 Audio (WGSL)' },
        { name: 'audio_worklet', label: '🎵 Audio (Worklet)' },
        { name: 'js', label: '⚡ JavaScript' },
        { name: 'help', label: '❓ Help' }
    ];
    
    menu.innerHTML = '';
    
    // Check if any audio tab is active for mutual exclusion
    const hasAudioGpu = state.activeTabs.includes('audio_gpu');
    const hasAudioWorklet = state.activeTabs.includes('audio_worklet');
    
    availableTabs.forEach(tab => {
        const isActive = state.activeTabs.includes(tab.name);
        
        // Grey out the other audio tab if one is active
        const isDisabled = (tab.name === 'audio_gpu' && hasAudioWorklet) || 
                          (tab.name === 'audio_worklet' && hasAudioGpu);
        
        const option = document.createElement('div');
        option.textContent = tab.label + (isActive ? ' ✓' : '');
        option.style.cssText = `
            padding: 6px 12px;
            cursor: ${(isActive || isDisabled) ? 'default' : 'pointer'};
            color: ${(isActive || isDisabled) ? 'var(--text-secondary)' : 'var(--text-primary)'};
            pointer-events: ${(isActive || isDisabled) ? 'none' : 'auto'};
        `;
        option.onmouseenter = () => {
            if (!isActive && !isDisabled) {
                option.style.background = 'var(--bg-primary)';
            }
        };
        option.onmouseleave = () => {
            option.style.background = 'transparent';
        };
        option.onclick = () => {
            addTab(tab.name);
            menu.style.display = 'none';
        };
        
        menu.appendChild(option);
    });
    
    // Position menu below button
    const rect = btn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.display = 'block';
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// ============================================================================
// Options Menu
// ============================================================================

export function showOptionsMenu() {
    // Remove any existing menu
    const existingMenu = document.getElementById('optionsMenu');
    if (existingMenu) {
        existingMenu.remove();
        return; // Toggle off if already open
    }
    
    const optionsBtn = document.getElementById('optionsBtn');
    const rect = optionsBtn.getBoundingClientRect();
    
    const menu = document.createElement('div');
    menu.id = 'optionsMenu';
    menu.style.cssText = `
        position: fixed;
        top: ${rect.bottom + 5}px;
        left: ${rect.left}px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 8px 0;
        min-width: 200px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    // Theme toggle
    const themeItem = document.createElement('div');
    themeItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-primary);
        font-size: 13px;
    `;
    themeItem.innerHTML = `
        <span style="width: 20px;">${state.isDarkMode ? '💡' : '🕯'}</span>
        <span style="flex: 1;">${state.isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
    `;
    themeItem.onmouseenter = () => themeItem.style.background = 'var(--bg-primary)';
    themeItem.onmouseleave = () => themeItem.style.background = '';
    themeItem.onclick = () => {
        // Dispatch event for theme toggle
        window.dispatchEvent(new CustomEvent('toggle-theme'));
        menu.remove();
    };
    
    // Vim mode toggle
    const vimItem = document.createElement('div');
    vimItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-primary);
        font-size: 13px;
    `;
    vimItem.innerHTML = `
        <span style="width: 20px;">⌨</span>
        <span style="flex: 1;">Vim Mode</span>
        <span style="color: var(--text-secondary);">${state.isVimMode ? '✓' : ''}</span>
    `;
    vimItem.onmouseenter = () => vimItem.style.background = 'var(--bg-primary)';
    vimItem.onmouseleave = () => vimItem.style.background = '';
    vimItem.onclick = () => {
        // Dispatch event for vim toggle
        window.dispatchEvent(new CustomEvent('toggle-vim'));
        menu.remove();
    };
    
    // JS execution mode toggle
    const jsExecItem = document.createElement('div');
    jsExecItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-primary);
        font-size: 13px;
    `;
    const isModule = state.jsExecutionMode === 'module';
    jsExecItem.innerHTML = `
        <span style="width: 20px;">⚡</span>
        <span style="flex: 1;">${isModule ? 'JS: Function Eval' : 'JS: Module Import'}</span>
        <span style="color: var(--text-secondary); font-size: 11px;">${isModule ? '' : '(faster)'}</span>
    `;
    jsExecItem.onmouseenter = () => jsExecItem.style.background = 'var(--bg-primary)';
    jsExecItem.onmouseleave = () => jsExecItem.style.background = '';
    jsExecItem.onclick = () => {
        // Dispatch event for JS execution mode toggle
        window.dispatchEvent(new CustomEvent('toggle-js-exec-mode'));
        menu.remove();
    };
    
    menu.appendChild(themeItem);
    menu.appendChild(vimItem);
    menu.appendChild(jsExecItem);
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== optionsBtn) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

