// ============================================================================
// UI - User Interface Controls and Interactions
// ============================================================================
// Handles:
// - Theme switching
// - Play/Pause controls  
// - Help panel dragging
// - Panel dividers/resizing
// - Canvas resizing
// - Render mode controls
// - Top-level panel switching
// ============================================================================

import { state, CONFIG, saveSettings, logStatus } from './core.js';
import * as vim from './vim.js';
import * as render from './render.js';
import * as editor from './editor.js';
import * as compiler from './compiler.js';
import * as comments from './comments.js';
import * as channels from './channels.js';
import * as webgl from './backends/webgl.js';

let compileOverlay;
let compileOverlayText;

// ============================================================================
// Theme
// ============================================================================

export function applyTheme() {
    if (state.isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
    
    if (state.graphicsEditor) {
        editor.setTheme(state.isDarkMode);
    }
}

export function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    saveSettings({ isDarkMode: state.isDarkMode });
    applyTheme();
}

export function setupUI() {
    createCompileOverlay();
    setCompileTime(0);
}
function createCompileOverlay() {
    if (compileOverlay) return;
    compileOverlay = document.createElement('div');
    compileOverlay.id = 'compileOverlay';
    compileOverlay.style.position = 'absolute';
    compileOverlay.style.top = '0';
    compileOverlay.style.left = '0';
    compileOverlay.style.right = '0';
    compileOverlay.style.bottom = '0';
    compileOverlay.style.background = 'rgba(0,0,0,0.4)';
    compileOverlay.style.display = 'none';
    compileOverlay.style.alignItems = 'center';
    compileOverlay.style.justifyContent = 'center';
    compileOverlay.style.color = '#fff';
    compileOverlay.style.fontSize = '14px';
    compileOverlay.style.zIndex = '50';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    compileOverlayText = document.createElement('div');
    compileOverlayText.textContent = 'Compiling...';
    compileOverlay.appendChild(spinner);
    compileOverlay.appendChild(compileOverlayText);
    
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.appendChild(compileOverlay);
    }
}

export function setCompileOverlay(visible, message = 'Compiling...') {
    if (!compileOverlay) {
        createCompileOverlay();
    }
    if (!compileOverlay) return;
    compileOverlay.style.display = visible ? 'flex' : 'none';
    if (compileOverlayText) {
        compileOverlayText.textContent = message;
    }
}

export function setCompileTime(milliseconds) {
    const formatted = Number.isFinite(milliseconds) ? `${milliseconds.toFixed(1)}ms` : '—';
    const el = document.getElementById('compileTimeDisplay');
    if (el) {
        el.textContent = formatted;
    }
    const fsEl = document.getElementById('fsCompileTime');
    if (fsEl) {
        fsEl.textContent = formatted;
    }
}

// ============================================================================
// Playback Controls
// ============================================================================

export function togglePlayPause() {
    if (!state.isRunning) return;
    
    state.isPlaying = !state.isPlaying;
    
    if (state.isPlaying) {
        // Resuming - account for time spent paused
        const pauseDuration = performance.now() - state.lastPauseTime;
        state.pausedTime += pauseDuration;
        state.audioContext.resume();
    } else {
        // Pausing - record when we paused
        state.lastPauseTime = performance.now();
        state.audioContext.suspend();
    }
    
    updatePlayPauseButton();
}

export function updatePlayPauseButton() {
    const btn = document.getElementById('playPauseBtn');
    if (state.isPlaying) {
        btn.textContent = '⏸';
        btn.classList.add('playing');
        btn.classList.remove('paused');
    } else {
        btn.textContent = '▶';
        btn.classList.remove('playing');
        btn.classList.add('paused');
    }
    
    // Update fullscreen play/pause button
    const fsBtn = document.getElementById('fsPlayPauseBtn');
    if (fsBtn) {
        if (state.isPlaying) {
            fsBtn.textContent = '⏸';
            fsBtn.classList.add('playing');
            fsBtn.classList.remove('paused');
        } else {
            fsBtn.textContent = '▶';
            fsBtn.classList.remove('playing');
            fsBtn.classList.add('paused');
        }
    }
}

export function restart(userInitiated = false) {
    if (!state.isRunning) return;
    
    // Reset time counters
    state.startTime = performance.now();
    state.pausedTime = 0;
    state.visualFrame = 0;
    state.audioFrame = 0;
    
    // Clear main buffer feedback textures if WebGL is active
    if (state.glContext) {
        channels.clearMainBuffer();
        channels.resizeAllBufferChannels(state.canvasWidth, state.canvasHeight);
    }
    
    // If currently paused, set lastPauseTime to NOW so unpause timing works correctly
    if (!state.isPlaying) {
        state.lastPauseTime = performance.now();
    } else {
        state.lastPauseTime = 0;
    }
    
    // Reset audio time tracking
    if (state.audioContext) {
        state.nextAudioTime = state.audioContext.currentTime;
    }
    
    // Reset user state
    if (state.userState && state.userInit) {
        try {
            state.userState = state.userInit();
        } catch (e) {
            console.error('Error re-initializing user state:', e);
        }
    }
    
    // If paused, render a single frame to show the restart
    if (!state.isPlaying) {
        render.renderOnce();
    }
    
    if (userInitiated) {
        logStatus('✓ Restarted', 'success');
    }
}

// ============================================================================
// Help Panel
// ============================================================================

// Help panel state
let isHelpPanelOpen = false;
let helpPanelHeight = 33.33; // percentage of viewport height
let isHelpDragging = false;
let helpDragStartY = 0;
let helpDragStartHeight = 0;
let helpHasMoved = false;

export function toggleHelpPanel() {
    const helpPanel = document.getElementById('helpPanel');
    const mainWrapper = document.getElementById('mainWrapper');
    const helpBtn = document.getElementById('helpToggleBtn');
    
    isHelpPanelOpen = !isHelpPanelOpen;
    
    if (isHelpPanelOpen) {
        // Show help panel and push main wrapper (top bar + content) down
        helpPanel.style.transform = 'translateY(0)';
        helpPanel.style.height = helpPanelHeight + 'vh';
        mainWrapper.style.top = helpPanelHeight + 'vh';
        helpBtn.textContent = 'Help ▲';
        
        // Initialize help content on first open
        if (!window.helpInitialized) {
            initializeHelp();
            window.helpInitialized = true;
        }
    } else {
        // Hide help panel and restore main wrapper
        helpPanel.style.transform = 'translateY(-100%)';
        mainWrapper.style.top = '0';
        helpBtn.textContent = 'Help ▼';
    }
}

export function startHelpDrag(e) {
    // If panel is closed, a click will open it (handled in stopHelpDrag)
    // If panel is open, prepare for potential drag
    isHelpDragging = true;
    helpHasMoved = false;
    helpDragStartY = e.clientY;
    helpDragStartHeight = helpPanelHeight;
    
    if (isHelpPanelOpen) {
        document.body.style.cursor = 'ns-resize';
    }
    document.body.style.userSelect = 'none';
    
    e.preventDefault();
}

export function doHelpDrag(e) {
    if (!isHelpDragging || !isHelpPanelOpen) return; // Only drag when open
    
    const deltaY = e.clientY - helpDragStartY;
    const viewportHeight = window.innerHeight;
    const deltaPercent = (deltaY / viewportHeight) * 100;
    
    // Track if user has moved enough to consider it a drag (not a click)
    if (Math.abs(deltaY) > 3) {
        helpHasMoved = true;
    }
    
    // Calculate new height (min 15%, max 80%)
    const newHeight = Math.max(15, Math.min(80, helpDragStartHeight + deltaPercent));
    helpPanelHeight = newHeight;
    
    const helpPanel = document.getElementById('helpPanel');
    const mainWrapper = document.getElementById('mainWrapper');
    
    helpPanel.style.height = helpPanelHeight + 'vh';
    mainWrapper.style.top = helpPanelHeight + 'vh';
    
    e.preventDefault();
}

export function stopHelpDrag(e) {
    if (!isHelpDragging) return;
    
    isHelpDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // If user didn't move much, treat it as a click (toggle)
    if (!helpHasMoved) {
        toggleHelpPanel();
    }
    
    e.preventDefault();
}

export function initializeHelp() {
    const helpTOCLinks = document.getElementById('helpTOCLinks');
    const helpContent = document.getElementById('helpContent');
    
    // Get HELP_SECTIONS from window (set by index.html)
    const HELP_SECTIONS = window.HELP_SECTIONS;
    if (!HELP_SECTIONS) return;
    
    // Group sections by category
    const categories = {};
    Object.keys(HELP_SECTIONS).forEach(key => {
        const section = HELP_SECTIONS[key];
        if (!categories[section.category]) {
            categories[section.category] = [];
        }
        categories[section.category].push({ key, ...section });
    });
    
    // Render table of contents
    helpTOCLinks.innerHTML = '';
    Object.keys(categories).forEach(category => {
        const categoryHeader = document.createElement('div');
        categoryHeader.style.cssText = 'font-weight: 600; margin-top: 10px; margin-bottom: 4px; color: var(--text-primary);';
        categoryHeader.textContent = category;
        helpTOCLinks.appendChild(categoryHeader);
        
        categories[category].forEach(section => {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = section.title;
            link.style.cssText = 'display: block; padding: 3px 8px; color: var(--text-secondary); text-decoration: none;';
            link.onmouseenter = () => link.style.background = 'var(--bg-primary)';
            link.onmouseleave = () => link.style.background = 'transparent';
            link.onclick = (e) => {
                e.preventDefault();
                showHelpSection(section.key);
            };
            helpTOCLinks.appendChild(link);
        });
    });
    
    // Show first section by default
    const firstKey = Object.keys(HELP_SECTIONS)[0];
    if (firstKey) {
        showHelpSection(firstKey);
    }
    
    function showHelpSection(key) {
        const section = HELP_SECTIONS[key];
        if (!section) return;
        
        // Convert markdown to HTML using marked
        if (typeof marked !== 'undefined') {
            helpContent.innerHTML = marked.parse(section.content);
        } else {
            helpContent.innerHTML = '<pre>' + section.content + '</pre>';
        }
        
        // Highlight current section in TOC
        helpTOCLinks.querySelectorAll('a').forEach(link => {
            if (link.textContent === section.title) {
                link.style.background = 'var(--bg-primary)';
                link.style.color = 'var(--text-primary)';
            } else {
                link.style.background = 'transparent';
                link.style.color = 'var(--text-secondary)';
            }
        });
    }
}

// ============================================================================
// Panel Dividers (Resizing)
// ============================================================================

export function setupPanelDividers() {
    const container = document.getElementById('container');
    const devPanel = document.getElementById('devPanel');
    const displayPanel = document.getElementById('displayPanel');
    const galleryPanel = document.getElementById('galleryPanel');
    const divider1 = document.getElementById('divider1');
    const divider2 = document.getElementById('divider2');
    
    let activeDivider = null;
    let startX = 0;
    let startDevWidth = 0;
    let startDisplayWidth = 0;
    let startGalleryWidth = 0;
    let hasMoved = false;
    
    const panelState = {
        devCollapsed: false,
        galleryCollapsed: false
    };
    
    function startDrag(divider, e) {
        e.preventDefault();
        activeDivider = divider;
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        startX = clientX;
        hasMoved = false;
        
        const containerWidth = container.offsetWidth;
        startDevWidth = (devPanel.offsetWidth / containerWidth) * 100;
        startDisplayWidth = (displayPanel.offsetWidth / containerWidth) * 100;
        startGalleryWidth = (galleryPanel.offsetWidth / containerWidth) * 100;
        
        devPanel.style.transition = 'none';
        displayPanel.style.transition = 'none';
        galleryPanel.style.transition = 'none';
        
        divider.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }
    
    function onDrag(e) {
        if (!activeDivider) return;
        if (activeDivider === divider1 && panelState.devCollapsed) return;
        if (activeDivider === divider2 && panelState.galleryCollapsed) return;
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        
        const containerWidth = container.offsetWidth;
        const deltaX = clientX - startX;
        const deltaPercent = (deltaX / containerWidth) * 100;
        
        if (Math.abs(deltaX) > 3) hasMoved = true;
        
        if (activeDivider === divider1) {
            let newDevWidth = startDevWidth + deltaPercent;
            let newDisplayWidth = startDisplayWidth - deltaPercent;
            
            const minDevPercent = (300 / containerWidth) * 100;
            const minDisplayPercent = (250 / containerWidth) * 100;
            
            if (newDevWidth < minDevPercent) {
                newDevWidth = minDevPercent;
                newDisplayWidth = startDisplayWidth + (startDevWidth - minDevPercent);
            } else if (newDisplayWidth < minDisplayPercent) {
                newDisplayWidth = minDisplayPercent;
                newDevWidth = startDevWidth + (startDisplayWidth - minDisplayPercent);
            }
            
            devPanel.style.width = newDevWidth + '%';
            displayPanel.style.width = newDisplayWidth + '%';
        } else if (activeDivider === divider2) {
            let newDisplayWidth = startDisplayWidth + deltaPercent;
            let newGalleryWidth = startGalleryWidth - deltaPercent;
            
            const minDisplayPercent = (250 / containerWidth) * 100;
            const minGalleryPercent = (200 / containerWidth) * 100;
            
            if (newDisplayWidth < minDisplayPercent) {
                newDisplayWidth = minDisplayPercent;
                newGalleryWidth = startGalleryWidth + (startDisplayWidth - minDisplayPercent);
            } else if (newGalleryWidth < minGalleryPercent) {
                newGalleryWidth = minGalleryPercent;
                newDisplayWidth = startDisplayWidth + (startGalleryWidth - minGalleryPercent);
            }
            
            displayPanel.style.width = newDisplayWidth + '%';
            galleryPanel.style.width = newGalleryWidth + '%';
        }
    }
    
    function stopDrag() {
        if (!activeDivider) return;
        
        const divider = activeDivider;
        activeDivider.classList.remove('dragging');
        activeDivider = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        devPanel.style.transition = '';
        displayPanel.style.transition = '';
        galleryPanel.style.transition = '';
        
        if (!hasMoved) {
            if (divider === divider1) togglePanelCollapse('dev');
            else if (divider === divider2) togglePanelCollapse('gallery');
        }
    }
    
    function togglePanelCollapse(panel) {
        const containerWidth = container.offsetWidth;
        const currentDevWidth = (devPanel.offsetWidth / containerWidth) * 100;
        const currentDisplayWidth = (displayPanel.offsetWidth / containerWidth) * 100;
        const currentGalleryWidth = (galleryPanel.offsetWidth / containerWidth) * 100;
        
        if (panel === 'dev') {
            panelState.devCollapsed = !panelState.devCollapsed;
            if (panelState.devCollapsed) {
                devPanel.style.width = '0%';
                devPanel.style.minWidth = '0';
                displayPanel.style.width = (currentDisplayWidth + currentDevWidth) + '%';
            } else {
                devPanel.style.width = '50%';
                devPanel.style.minWidth = '300px';
                displayPanel.style.width = (currentDisplayWidth + currentDevWidth - 50) + '%';
            }
        } else if (panel === 'gallery') {
            panelState.galleryCollapsed = !panelState.galleryCollapsed;
            if (panelState.galleryCollapsed) {
                galleryPanel.style.width = '0%';
                galleryPanel.style.minWidth = '0';
                displayPanel.style.width = (currentDisplayWidth + currentGalleryWidth) + '%';
            } else {
                galleryPanel.style.width = '20%';
                galleryPanel.style.minWidth = '200px';
                displayPanel.style.width = (currentDisplayWidth + currentGalleryWidth - 20) + '%';
            }
        }
    }
    
    // Mouse events
    divider1.addEventListener('mousedown', (e) => startDrag(divider1, e));
    divider2.addEventListener('mousedown', (e) => startDrag(divider2, e));
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    
    // Touch events
    divider1.addEventListener('touchstart', (e) => startDrag(divider1, e), { passive: false });
    divider2.addEventListener('touchstart', (e) => startDrag(divider2, e), { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
    document.addEventListener('touchcancel', stopDrag);
}

export function setupHorizontalCanvasDivider() {
    const divider = document.getElementById('canvasResizeDivider');
    const canvasContainer = document.getElementById('canvasContainer');
    
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;
    
    function startDrag(e) {
        e.preventDefault();
        isDragging = true;
        
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        startY = clientY;
        startHeight = canvasContainer.offsetHeight;
        
        divider.classList.add('dragging');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }
    
    function onDrag(e) {
        if (!isDragging) return;
        
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const deltaY = clientY - startY;
        let newHeight = startHeight + deltaY;
        
        const maxHeight = window.innerHeight * 0.75;
        newHeight = Math.max(256, Math.min(newHeight, maxHeight));
        newHeight = Math.round(newHeight / 16) * 16;
        
        canvasContainer.classList.add('explicit-height');
        canvasContainer.style.height = newHeight + 'px';
    }
    
    function stopDrag() {
        if (!isDragging) return;
        
        isDragging = false;
        divider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
    
    // Mouse events
    divider.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    
    // Touch events
    divider.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
    document.addEventListener('touchcancel', stopDrag);
}

export function setupCanvasResizeObserver() {
    const canvasContainer = document.getElementById('canvasContainer');
    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            const newWidth = Math.round(width / 16) * 16;
            const newHeight = Math.round(height / 16) * 16;
            
            if (newWidth !== state.canvasWidth || newHeight !== state.canvasHeight) {
                if (window.updateCanvasSize) {
                    window.updateCanvasSize(newWidth, newHeight, true);
                }
            }
        }
    });
    resizeObserver.observe(canvasContainer);
}

// ============================================================================
// Canvas Size Management
// ============================================================================

export async function updateCanvasSize(width, height, recompile = true) {
    state.canvasWidth = width;
    state.canvasHeight = height;
    
    const renderWidth = Math.floor(width / state.pixelScale);
    const renderHeight = Math.floor(height / state.pixelScale);
    
    // Update both canvases - buffer dimensions
    state.canvasWebGPU.width = renderWidth;
    state.canvasWebGPU.height = renderHeight;
    state.canvasWebGL.width = renderWidth;
    state.canvasWebGL.height = renderHeight;
    
    // Set canvas CSS dimensions to quantized values (for pixel-perfect rendering)
    // The canvas will be centered in the container with letterboxing if needed
    state.canvasWebGPU.style.width = width + 'px';
    state.canvasWebGPU.style.height = height + 'px';
    state.canvasWebGL.style.width = width + 'px';
    state.canvasWebGL.style.height = height + 'px';
    
    // Update canvas container size
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.style.height = height + 'px';
    }
    
    document.getElementById('resolutionDisplay').textContent = 
        `${renderWidth} × ${renderHeight} × ${state.pixelScale}`;
    
    // Update fullscreen resolution display
    const fsResolutionEl = document.getElementById('fsResolution');
    if (fsResolutionEl) {
        fsResolutionEl.textContent = `${renderWidth}×${renderHeight}×${state.pixelScale}`;
    }
    
    // Resize buffer textures if WebGL is active
    if (state.glContext) {
        channels.resizeMainBuffer(renderWidth, renderHeight);
        channels.resizeAllBufferChannels(renderWidth, renderHeight);
    }
    
    // Skip recompilation if editors aren't initialized yet (happens during startup)
    if (recompile && state.graphicsEditor) {
        // Check if we're using WebGPU (which needs recompilation for workgroup size)
        const needsRecompile = state.activeTabs.includes('graphics') || state.activeTabs.includes('audio_gpu');
        
        if (needsRecompile) {
            // WebGPU/WGSL needs full recompilation for workgroup size changes
            if (state.isPlaying) {
                // Pause rendering during recompilation to prevent flicker
                state.isRecompiling = true;
                await compiler.reloadShader(true);
                state.isRecompiling = false;
            } else {
                // If paused, recompile shader and render a single frame
                await compiler.reloadShader(true);
                // Wait for layout update before rendering
                requestAnimationFrame(() => {
                    render.renderOnce();
                });
            }
        } else {
            // WebGL/GLSL doesn't need recompilation, just render a frame
            if (!state.isPlaying) {
                // If paused, render once to show the resize
                requestAnimationFrame(() => {
                    render.renderOnce();
                });
            }
            // If playing, it will automatically render with new canvas size
        }
    }
}

// ============================================================================
// Render Mode
// ============================================================================

export function updateRenderMode() {
    const activeCanvas = state.graphicsBackend === 'webgl' ? state.canvasWebGL : state.canvasWebGPU;
    const icon = document.getElementById('renderModeIcon');
    
    console.log('updateRenderMode called:', {
        renderMode: state.renderMode,
        graphicsBackend: state.graphicsBackend,
        activeCanvas: activeCanvas?.id,
        iconElement: icon
    });
    
    if (!activeCanvas) {
        console.warn('updateRenderMode: No active canvas available');
        return;
    }
    
    // Remove all render mode classes
    activeCanvas.classList.remove('render-pixelated', 'render-smooth');
    
    // Add current mode class and update icon
    if (state.renderMode === 0) {
        activeCanvas.classList.add('render-pixelated');
        icon.textContent = '▦';
        icon.title = 'Render mode: Pixelated (click to cycle)';
        console.log('  -> Set to mode 0 (pixelated), icon: ▦');
    } else {
        activeCanvas.classList.add('render-smooth');
        icon.textContent = '▩';
        icon.title = 'Render mode: Smooth (Bilinear) (click to cycle)';
        console.log('  -> Set to mode 1 (smooth), icon: ▩');
    }
}

// ============================================================================
// Channel Viewer
// ============================================================================

let channelViewerSelect = null;

export function initChannelViewer() {
    channelViewerSelect = document.getElementById('channelViewerSelect');
    if (!channelViewerSelect) return;
    
    channelViewerSelect.addEventListener('change', handleChannelViewerChange);
    window.addEventListener('channels-changed', refreshChannelViewerOptions);
    refreshChannelViewerOptions();
}

function refreshChannelViewerOptions() {
    if (!channelViewerSelect) return;
    
    const channelsList = channels.getAvailableViewerChannels();
    const currentSelection = channels.getSelectedOutputChannel();
    
    channelViewerSelect.innerHTML = '';
    channelsList.forEach(ch => {
        const option = document.createElement('option');
        option.value = ch.number;
        option.textContent = ch.label;
        channelViewerSelect.appendChild(option);
    });
    
    const hasCurrent = channelsList.some(ch => ch.number === currentSelection);
    const targetValue = hasCurrent ? currentSelection : (channelsList[0]?.number ?? 0);
    channelViewerSelect.value = targetValue;
    
    if (!hasCurrent && channelsList.length > 0) {
        channels.setSelectedOutputChannel(targetValue);
    }
}

function handleChannelViewerChange() {
    if (!channelViewerSelect) return;
    const selected = parseInt(channelViewerSelect.value, 10);
    if (Number.isNaN(selected)) return;
    channels.setSelectedOutputChannel(selected);
    if (!state.isPlaying) {
        render.renderOnce();
    }
}

// ============================================================================
// Top-Level Panel Switching
// ============================================================================

export function switchTopLevelPanel(panelName) {
    const commentsPanel = document.getElementById('commentsPanel');
    const gallerySection = document.getElementById('gallerySection');
    const commentsTab = document.getElementById('topTabComments');
    const galleryTab = document.getElementById('topTabGallery');

    if (panelName === 'comments') {
        // Show comments, hide gallery
        commentsPanel.style.display = 'flex';
        gallerySection.style.display = 'none';
        
        // Update tab styles
        commentsTab.classList.add('active');
        commentsTab.style.borderBottomColor = 'var(--accent-color)';
        commentsTab.style.color = 'var(--accent-color)';
        
        galleryTab.classList.remove('active');
        galleryTab.style.borderBottomColor = 'transparent';
        galleryTab.style.color = 'var(--text-secondary)';
        
        // Load comments for current shader
        if (state.currentDatabaseShader) {
            comments.loadCommentsForShader(state.currentDatabaseShader);
        }
    } else {
        // Show gallery, hide comments
        gallerySection.style.display = 'flex';
        commentsPanel.style.display = 'none';
        
        // Update tab styles
        galleryTab.classList.add('active');
        galleryTab.style.borderBottomColor = 'var(--accent-color)';
        galleryTab.style.color = 'var(--accent-color)';
        
        commentsTab.classList.remove('active');
        commentsTab.style.borderBottomColor = 'transparent';
        commentsTab.style.color = 'var(--text-secondary)';
        
        // Unload comments to clean up subscriptions
        comments.unloadComments();
    }
}

// ============================================================================
// Auth Messages
// ============================================================================

export function showAuthMessage(message, type = 'info') {
    const authMessage = document.getElementById('authMessage');
    const authMessageText = document.getElementById('authMessageText');
    
    if (authMessage && authMessageText) {
        authMessageText.textContent = message;
        authMessage.style.display = 'block';
        
        // Auto-hide success messages after 30 seconds
        if (type === 'success') {
            setTimeout(hideAuthMessage, 30000);
        }
    }
}

export function hideAuthMessage() {
    const authMessage = document.getElementById('authMessage');
    if (authMessage) {
        authMessage.style.display = 'none';
    }
}

