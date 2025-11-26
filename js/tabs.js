// ============================================================================
// Tabs - Tab Management and UI
// ============================================================================

import { state, logStatus } from './core.js';
import { MINIMAL_AUDIO_GPU, MINIMAL_AUDIO_WORKLET, MINIMAL_GLSL, MINIMAL_GLSL_REGULAR, MINIMAL_GLSL_STOY, MINIMAL_GLSL_GOLF } from './examples.js';
import { getTabIcon, getTabLabel, tabRequiresWebGPU, tabsAreMutuallyExclusive, isImageChannel, isVideoChannel, isAudioChannel, isBufferChannel, getChannelNumber, createImageChannelTabName, createVideoChannelTabName, createAudioChannelTabName, createBufferChannelTabName } from './tab-config.js';
import * as mediaSelector from './ui/media-selector.js';
import * as audioSelector from './ui/audio-selector.js';
import * as videoSelector from './ui/video-selector.js';
import * as channels from './channels.js';

// ============================================================================
// Tab Rendering
// ============================================================================

/**
 * Count characters in code, excluding comments and trailing whitespace
 * @param {string} code - The code to count
 * @returns {number} - Character count excluding comments
 */
function countCodeChars(code) {
    // Remove single-line comments (// ...) including the newline at the end
    let withoutComments = code.replace(/\/\/.*?(\r?\n|$)/g, '');
    
    // Remove multi-line comments (/* ... */)
    withoutComments = withoutComments.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove leading/trailing whitespace from the entire code
    withoutComments = withoutComments.trim();
    
    // Remove multiple consecutive newlines (keep single newlines as they might be needed)
    withoutComments = withoutComments.replace(/\n\n+/g, '\n');
    
    return withoutComments.length;
}

export const GLSL_TAB_ORDER = ['glsl_stoy', 'glsl_regular', 'glsl_golf', 'glsl_fragment'];

function usesGraphicsEditor(tabName) {
    if (!tabName) return false;
    return tabName === 'graphics' ||
        tabName.startsWith('glsl_') ||
        isBufferChannel(tabName);
}

function saveCurrentGraphicsTabCode() {
    if (!state.graphicsEditor) return;
    const currentTab = state.currentTab;
    if (!usesGraphicsEditor(currentTab)) return;
    state.tabCodeCache[currentTab] = state.graphicsEditor.getValue();
}

export function getActiveGlslTab() {
    for (const tabName of GLSL_TAB_ORDER) {
        if (state.activeTabs.includes(tabName)) {
            return tabName;
        }
    }
    return null;
}

function getMinimalCodeForGlslTab(tabName) {
    switch (tabName) {
        case 'glsl_regular':
            return MINIMAL_GLSL_REGULAR;
        case 'glsl_golf':
            return MINIMAL_GLSL_GOLF;
        case 'glsl_fragment':
            return MINIMAL_GLSL;
        case 'glsl_stoy':
        default:
            return MINIMAL_GLSL_STOY;
    }
}

function getDefaultBufferCode() {
    const baseTab = getActiveGlslTab();
    if (baseTab) {
        return getMinimalCodeForGlslTab(baseTab);
    }
    // Fallback if no GLSL tab is active
    return MINIMAL_GLSL_STOY;
}

function loadGraphicsTabCode(tabName) {
    if (!state.graphicsEditor || !usesGraphicsEditor(tabName)) return;
    if (state.tabCodeCache[tabName] === undefined) {
        if (isBufferChannel(tabName)) {
            state.tabCodeCache[tabName] = getDefaultBufferCode();
        } else {
            // For built-in tabs, default to current editor content if cache missing
            state.tabCodeCache[tabName] = state.graphicsEditor.getValue();
            return;
        }
    }
    const cached = state.tabCodeCache[tabName];
    if (state.graphicsEditor.getValue() !== cached) {
        state.graphicsEditor.setValue(cached);
    }
}

export function syncCurrentGraphicsTabCode() {
    saveCurrentGraphicsTabCode();
}

export function renderTabs() {
    const tabsContainer = document.getElementById('editorTabs');
    
    // Clear all tab buttons (action buttons are now in top bar)
    tabsContainer.innerHTML = '';
    
    // Add tab buttons
    state.activeTabs.forEach(tabName => {
        const button = document.createElement('button');
        button.className = 'editorTab' + (state.currentTab === tabName ? ' active' : '');
        button.id = `tab-${tabName}`; // Add ID for later updates
        
        // For Golf mode, add character count
        if (tabName === 'glsl_golf') {
            const code = state.graphicsEditor?.getValue() || '';
            const charCount = countCodeChars(code);
            button.innerHTML = `${getTabIcon(tabName)} ${getTabLabel(tabName)} <strong>[${charCount}c]</strong>`;
        } else {
            button.textContent = `${getTabIcon(tabName)} ${getTabLabel(tabName)}`;
        }
        
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
}

/**
 * Update Golf tab label with current character count
 * Called on every editor change when in Golf mode
 */
export function updateGolfCharCount() {
    if (state.currentTab !== 'glsl_golf') return;
    
    const button = document.getElementById('tab-glsl_golf');
    if (!button) return;
    
    const code = state.graphicsEditor?.getValue() || '';
    const charCount = countCodeChars(code);
    
    // Preserve the close button by only updating the text content
    const closeBtn = button.querySelector('span');
    button.innerHTML = `${getTabIcon('glsl_golf')} ${getTabLabel('glsl_golf')} <strong>[${charCount}c]</strong>`;
    
    // Re-append the close button if it existed
    if (closeBtn) {
        button.appendChild(closeBtn);
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

export function switchTab(tabName) {
    if (!state.activeTabs.includes(tabName)) {
        return;
    }
    
    if (state.currentTab === tabName) {
        return;
    }
    
    saveCurrentGraphicsTabCode();
    
    state.currentTab = tabName;
    
    // Handle channel tabs separately
    if (isImageChannel(tabName) || isVideoChannel(tabName) || isAudioChannel(tabName)) {
        // Hide ALL editor containers first
        document.getElementById('graphicsContainer').style.display = 'none';
        document.getElementById('audioContainer').style.display = 'none';
        document.getElementById('jsEditorContainer').style.display = 'none';
        
        // Hide ALL channel containers
        document.querySelectorAll('[id$="Container"][id^="image_"], [id$="Container"][id^="video_"], [id$="Container"][id^="audio_"]').forEach(c => {
            c.style.display = 'none';
        });
        
        // Get or create channel container
        let channelContainer = document.getElementById(`${tabName}Container`);
        if (!channelContainer) {
            channelContainer = document.createElement('div');
            channelContainer.id = `${tabName}Container`;
            channelContainer.className = 'editor-panel';
            channelContainer.style.display = 'flex';
            channelContainer.style.flexDirection = 'column';
            document.getElementById('devPanel').appendChild(channelContainer);
            
            // Add loading indicator
            channelContainer.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">Loading selector...</div>';
            
            // Load appropriate selector
            const channelNumber = getChannelNumber(tabName);
            if (isAudioChannel(tabName)) {
                audioSelector.createAudioSelector(tabName, channelNumber).then(selector => {
                    channelContainer.innerHTML = '';
                    channelContainer.appendChild(selector);
                });
            } else if (isVideoChannel(tabName)) {
                videoSelector.createVideoSelector(tabName, channelNumber).then(selector => {
                    channelContainer.innerHTML = '';
                    channelContainer.appendChild(selector);
                });
            } else {
                const channelType = 'image';
                mediaSelector.createMediaSelector(tabName, channelType, channelNumber).then(selector => {
                    channelContainer.innerHTML = '';
                    channelContainer.appendChild(selector);
                });
            }
        } else {
            // Show existing container
            channelContainer.style.display = 'block';
        }
        
        // Update tabs
        renderTabs();
        return;
    }
    
    // Regular code editor tabs
    const containers = {
        graphics: document.getElementById('graphicsContainer'),
        glsl_fragment: document.getElementById('graphicsContainer'),  // GLSL uses graphics container
        glsl_regular: document.getElementById('graphicsContainer'),   // Regular GLSL also uses graphics container
        glsl_stoy: document.getElementById('graphicsContainer'),      // S-Toy GLSL also uses graphics container
        glsl_golf: document.getElementById('graphicsContainer'),      // Golf GLSL also uses graphics container
        audio_gpu: document.getElementById('audioContainer'),
        audio_worklet: document.getElementById('audioContainer'),  // Both audio tabs use same container
        js: document.getElementById('jsEditorContainer')
    };
    
    if (isBufferChannel(tabName)) {
        containers[tabName] = document.getElementById('graphicsContainer');
    }
    
    const editors = {
        graphics: state.graphicsEditor,
        glsl_fragment: state.graphicsEditor,  // GLSL uses graphics editor
        glsl_regular: state.graphicsEditor,   // Regular GLSL also uses graphics editor
        glsl_stoy: state.graphicsEditor,      // S-Toy GLSL also uses graphics editor
        glsl_golf: state.graphicsEditor,      // Golf GLSL also uses graphics editor
        audio_gpu: state.audioEditor,
        audio_worklet: state.audioEditor,  // Both audio tabs use same editor
        js: state.jsEditor
    };
    
    if (isBufferChannel(tabName)) {
        editors[tabName] = state.graphicsEditor;
    }
    
    // Hide all containers
    const allContainers = [...new Set(Object.values(containers))];
    allContainers.forEach(c => c.style.display = 'none');
    
    // Hide channel containers
    document.querySelectorAll('[id$="Container"][id^="image_"], [id$="Container"][id^="video_"], [id$="Container"][id^="audio_"]').forEach(c => {
        c.style.display = 'none';
    });
    
    // Show selected container
    if (containers[tabName]) {
        containers[tabName].style.display = 'block';
    }
    
    // Update editor language mode based on tab
    if (tabName === 'graphics' && state.graphicsEditor) {
        monaco.editor.setModelLanguage(state.graphicsEditor.getModel(), 'wgsl');
    } else if (tabName === 'glsl_fragment' && state.graphicsEditor) {
        // Use custom GLSL language definition (registered in editor.js)
        monaco.editor.setModelLanguage(state.graphicsEditor.getModel(), 'glsl');
    } else if ((tabName === 'glsl_regular' || tabName === 'glsl_stoy' || tabName === 'glsl_golf' || isBufferChannel(tabName)) && state.graphicsEditor) {
        monaco.editor.setModelLanguage(state.graphicsEditor.getModel(), 'glsl');
    } else if (tabName === 'audio_gpu' && state.audioEditor) {
        monaco.editor.setModelLanguage(state.audioEditor.getModel(), 'wgsl');
    } else if (tabName === 'audio_worklet' && state.audioEditor) {
        monaco.editor.setModelLanguage(state.audioEditor.getModel(), 'javascript');
    }
    
    if (usesGraphicsEditor(tabName)) {
        loadGraphicsTabCode(tabName);
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
    
    // Prevent WGSL audio with GLSL graphics (incompatible backends)
    if (tabRequiresWebGPU(tabName)) {
        const hasGLSL = state.activeTabs.some(t => t === 'glsl_fragment' || t.includes('glsl'));
        if (hasGLSL) {
            logStatus('⚠ WGSL tabs require WebGPU graphics (not compatible with GLSL)', 'error');
            return;
        }
    }
    
    // Handle mutually exclusive tabs (e.g., audio tabs)
    const toRemove = state.activeTabs.filter(existing => 
        tabsAreMutuallyExclusive(tabName, existing)
    );
    
    toRemove.forEach(tab => {
        const index = state.activeTabs.indexOf(tab);
        if (index !== -1) {
            state.activeTabs.splice(index, 1);
        }
    });
    
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

/**
 * Add an image channel
 */
export async function addImageChannel() {
    // Create channel first, then get the actual channel number it was assigned
    const channelNumber = await channels.createChannel('image', {
        mediaId: null,
        tabName: null // Will be set below
    });
    
    if (channelNumber === -1) {
        console.error('Failed to create image channel');
        return;
    }
    
    // Create tab name with the actual channel number
    const tabName = createImageChannelTabName(channelNumber);
    
    // Update the channel's tab name
    const channel = channels.getChannel(channelNumber);
    if (channel) {
        channel.tabName = tabName;
    }
    
    // Add tab to active tabs
    state.activeTabs.push(tabName);
    
    // Refresh UI
    renderTabs();
    switchTab(tabName);
    
    console.log(`✓ Image channel tab added: ${tabName} (ch${channelNumber})`);
}

/**
 * Add an audio channel
 */
export async function addAudioChannel() {
    // Create channel first, then get the actual channel number it was assigned
    const channelNumber = await channels.createChannel('audio', {
        mediaId: null,
        tabName: null // Will be set below
    });
    
    if (channelNumber === -1) {
        console.error('Failed to create audio channel');
        return;
    }
    
    // Create tab name with the actual channel number
    const tabName = createAudioChannelTabName(channelNumber);
    
    // Update the channel's tab name
    const channel = channels.getChannel(channelNumber);
    if (channel) {
        channel.tabName = tabName;
    }
    
    // Add tab to active tabs
    state.activeTabs.push(tabName);
    
    // Refresh UI
    renderTabs();
    switchTab(tabName);
    
    console.log(`✓ Audio channel tab added: ${tabName} (ch${channelNumber})`);
}

export async function addVideoChannel() {
    // Create channel first, then get the actual channel number it was assigned
    const channelNumber = await channels.createChannel('video', {
        mediaId: null,
        tabName: null // Will be set below
    });
    
    if (channelNumber === -1) {
        console.error('Failed to create video channel');
        return;
    }
    
    // Create tab name with the actual channel number
    const tabName = createVideoChannelTabName(channelNumber);
    
    // Update the channel's tab name
    const channel = channels.getChannel(channelNumber);
    if (channel) {
        channel.tabName = tabName;
    }
    
    // Add tab to active tabs
    state.activeTabs.push(tabName);
    
    // Refresh UI
    renderTabs();
    switchTab(tabName);
    
    console.log(`✓ Video channel tab added: ${tabName} (ch${channelNumber})`);
}

export async function addBufferChannelTab() {
    const baseGlslTab = getActiveGlslTab();
    if (!baseGlslTab) {
        logStatus('Add a GLSL tab before creating buffer passes', 'error');
        return;
    }
    
    const channelNumber = await channels.createChannel('buffer', {
        tabName: null
    });
    
    if (channelNumber === -1) {
        console.error('Failed to create buffer channel');
        return;
    }
    
    const tabName = createBufferChannelTabName(channelNumber);
    const channel = channels.getChannel(channelNumber);
    if (channel) {
        channel.tabName = tabName;
    }
    
    state.tabCodeCache[tabName] = getMinimalCodeForGlslTab(baseGlslTab);
    
    state.activeTabs.push(tabName);
    renderTabs();
    switchTab(tabName);
    
    console.log(`✓ Buffer channel tab added: ${tabName} (ch${channelNumber})`);
}

export function removeTab(tabName) {
    // Can't remove graphics (it's mandatory)
    if (tabName === 'graphics') {
        return;
    }
    
    const index = state.activeTabs.indexOf(tabName);
    if (index === -1) return;
    
    state.activeTabs.splice(index, 1);
    
    if (usesGraphicsEditor(tabName)) {
        delete state.tabCodeCache[tabName];
    }
    
    if (isBufferChannel(tabName)) {
        const chNum = getChannelNumber(tabName);
        if (chNum >= 0) {
            channels.deleteChannel(chNum);
        }
    }
    
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
        { name: 'glsl_regular', label: '🎨 Regular (GLSL)' },
        { name: 'glsl_stoy', label: '🔺 S-Toy (GLSL)' },
        { name: 'glsl_golf', label: '⛳ Golf (GLSL)' },
        { name: 'glsl_fragment', label: '🔺 Raw (GLSL)' },
        { name: 'audio_gpu', label: '🔊 Audio (WGSL)' },
        { name: 'audio_worklet', label: '🎵 Audio (Worklet)' },
        { name: 'js', label: '⚡ JavaScript' },
        { name: '_image_channel', label: '🖼️ Image Channel' }, // Special action
        { name: '_audio_channel', label: '🎵 Audio Channel' }, // Special action
        { name: '_video_channel', label: '🎬 Video Channel' }, // Special action
        { name: '_buffer_channel', label: '🎚️ Buffer Pass' }
    ];
    
    menu.innerHTML = '';
    
    // Check if any audio tab is active for mutual exclusion
    const hasAudioGpu = state.activeTabs.includes('audio_gpu');
    const hasAudioWorklet = state.activeTabs.includes('audio_worklet');
    const hasGLSL = state.activeTabs.some(t => t === 'glsl_fragment' || t === 'glsl_regular' || t === 'glsl_stoy' || t === 'glsl_golf');
    
    availableTabs.forEach(tab => {
        const isActive = state.activeTabs.includes(tab.name);
        
        // Grey out incompatible tabs:
        // - Other audio tab if one is active (mutual exclusion)
        // - WGSL audio if GLSL graphics is active (incompatible backends)
        // - GLSL tabs if already have another GLSL tab active
        const isDisabled = (tab.name === 'audio_gpu' && (hasAudioWorklet || hasGLSL)) || 
                          (tab.name === 'audio_worklet' && hasAudioGpu) ||
                          ((tab.name === 'glsl_fragment' || tab.name === 'glsl_regular' || tab.name === 'glsl_stoy' || tab.name === 'glsl_golf') && hasGLSL) ||
                          (tab.name === '_buffer_channel' && !getActiveGlslTab());
        
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
        option.onclick = async () => {
            // Handle image channel as special action
            if (tab.name === '_image_channel') {
                await addImageChannel();
            } else if (tab.name === '_audio_channel') {
                await addAudioChannel();
            } else if (tab.name === '_video_channel') {
                await addVideoChannel();
            } else if (tab.name === '_buffer_channel') {
                await addBufferChannelTab();
            } else {
                addTab(tab.name);
            }
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

