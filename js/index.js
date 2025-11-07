'use strict';

// Import all modules
import { state, CONFIG, DERIVED, AUDIO_MODES, loadSettings, saveSettings, logStatus, updateDerived } from './core.js';
import * as webgpu from './backends/webgpu.js';
import * as webgl from './backends/webgl.js';
import * as audioWorklet from './backends/audio-worklet.js';
import * as backend from './backend.js';
import * as render from './render.js';
import * as editor from './editor.js';
import * as jsRuntime from './js-runtime.js';
import * as tabs from './tabs.js';
import * as save from './save.js';
import * as comments from './comments.js';
import * as perfMonitor from './performance-monitor.js';
import * as uniformControls from './uniform-controls.js';
import * as fullscreen from './fullscreen.js';
import * as vim from './vim.js';
import { getBoilerplate, MINIMAL_JS, MINIMAL_GLSL, MINIMAL_GLSL_REGULAR, MINIMAL_GLSL_STOY, MINIMAL_GLSL_GOLF, MINIMAL_WGSL } from './examples.js';
import { HELP_SECTIONS } from './help-sections.js';
import * as tabConfig from './tab-config.js';
import * as ui from './ui.js';
import * as shaderManagement from './shader-management.js';
import * as compiler from './compiler.js';
import * as audio from './audio.js';
import * as routing from './routing.js';
import { UniformBuilder } from './uniforms.js';
import * as community from './community.js';

// Expose modules globally for inline functions and backwards compatibility
window.tabConfig = tabConfig;
window.ui = ui;
window.shaderManagement = shaderManagement;
window.HELP_SECTIONS = HELP_SECTIONS;

// ============================================================================
// Helper function for createNewShader that needs reloadShader reference
// ============================================================================

function createNewShader(type) {
    // Determine which minimal GLSL code to use
    const minimalGLSL = (type === 'glsl_regular') ? MINIMAL_GLSL_REGULAR : 
                       (type === 'glsl_stoy') ? MINIMAL_GLSL_STOY :
                       (type === 'glsl_golf') ? MINIMAL_GLSL_GOLF :
                       MINIMAL_GLSL;
    shaderManagement.createNewShader(type, minimalGLSL, MINIMAL_WGSL, compiler.reloadShader); 
}

// ============================================================================
// Create New Shader
// ============================================================================

// ============================================================================
// Load Example
// ============================================================================

function loadExample(exampleId) {
    const example = EXAMPLES[exampleId];
    if (!example) return;
    
    // Temporarily disable dirty tracking while loading
    const wasInitializing = state.isInitializing;
    state.isInitializing = true;
    
    state.currentExample = exampleId;
    state.currentDatabaseShader = null;
    state.isDirty = false;
    shaderManagement.updateSaveButton();
    
    // Convert old 'audio' tab to new format
    const updatedTabs = example.tabs.map(tab => {
        if (tab === 'audio') {
            const isWorklet = example.audio && (example.audio.includes('AudioWorkletProcessor') || 
                             example.audio.includes('registerProcessor'));
            return isWorklet ? 'audio_worklet' : 'audio_gpu';
        }
        return tab;
    });
    
    state.activeTabs = [...updatedTabs];
    
    // Determine audio type
    if (state.activeTabs.includes('audio_gpu')) {
        state.currentAudioType = 'gpu';
    } else if (state.activeTabs.includes('audio_worklet')) {
        state.currentAudioType = 'worklet';
    } else {
        state.currentAudioType = null;
    }
    
    // Load code into editors
    if (state.graphicsEditor) {
        state.graphicsEditor.setValue(example.graphics || '');
    }
    if (state.audioEditor && example.audio) {
        state.audioEditor.setValue(example.audio);
    }
    if (state.jsEditor) {
        state.jsEditor.setValue(example.js || MINIMAL_JS);
    }
    
    // Update UI
    tabs.renderTabs();
    tabs.switchTab(updatedTabs[0] || 'graphics');
    
    // Update shader info
    document.getElementById('shaderTitleDisplay').textContent = example.name;
    document.getElementById('shaderCreator').textContent = example.creator ? `by ${example.creator}` : '';
    document.getElementById('shaderDescriptionDisplay').textContent = example.description || '';
    
    // Reload shader and restart (maintains play/pause state)
    if (state.isRunning) {
        compiler.reloadShader().then((success) => {
            ui.restart();
            // Re-enable dirty tracking after load completes
            setTimeout(() => {
                state.isInitializing = wasInitializing;
            }, 100);
        });
    } else {
        // Re-enable dirty tracking immediately if not running
        setTimeout(() => {
            state.isInitializing = wasInitializing;
        }, 100);
    }
    
    // Update URL for sharing
    routing.updateURLForShader(exampleId, true);
}

// ============================================================================
// Setup UI
// ============================================================================

function setupUI() {
    // Canvas elements (separate for WebGPU and WebGL)
    state.canvasWebGPU = document.getElementById('canvasWebGPU');
    state.canvasWebGL = document.getElementById('canvasWebGL');
    const canvasContainer = document.getElementById('canvasContainer');
    canvasContainer.classList.add('explicit-height');
    canvasContainer.style.height = state.canvasHeight + 'px';
    
    // Set initial canvas size
    ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, false);
    
    // Setup panel dividers and canvas observer (using ui module)
    ui.setupPanelDividers();
    ui.setupHorizontalCanvasDivider();
    ui.setupCanvasResizeObserver();
    
    // Setup help drag listeners
    document.addEventListener('mousemove', ui.doHelpDrag);
    document.addEventListener('mouseup', ui.stopHelpDrag);
    
    // Event listeners
    document.getElementById('playPauseBtn').addEventListener('click', ui.togglePlayPause);
    document.getElementById('restartBtn').addEventListener('click', () => ui.restart(true));
    document.getElementById('reloadBtn').addEventListener('click', () => compiler.reloadShader());
    document.getElementById('newShaderBtn').addEventListener('click', shaderManagement.showNewShaderMenu);
    document.getElementById('addPassBtn').addEventListener('click', tabs.showAddPassMenu);
    document.getElementById('optionsBtn').addEventListener('click', tabs.showOptionsMenu);
    document.getElementById('perfMonitorBtn').addEventListener('click', () => perfMonitor.togglePanel());
    document.getElementById('uniformControlsBtn').addEventListener('click', () => uniformControls.toggle());
    // Help button - draggable divider
    const helpToggleBtn = document.getElementById('helpToggleBtn');
    helpToggleBtn.addEventListener('mousedown', (e) => ui.startHelpDrag(e));
    helpToggleBtn.style.cursor = 'ns-resize';
    
    // Auth buttons
    document.getElementById('signInBtn').addEventListener('click', () => {
        document.getElementById('signInModal').style.display = 'flex';
    });
    
    document.getElementById('signOutBtn').addEventListener('click', () => {
        backend.signOut();
    });
    
    document.getElementById('closeSignInModal').addEventListener('click', () => {
        document.getElementById('signInModal').style.display = 'none';
        hideAuthMessage();
        // Clear form fields
        document.getElementById('emailInput').value = '';
        document.getElementById('passwordInput').value = '';
        document.getElementById('displayNameInput').value = '';
    });
    
    // OAuth sign-in
    document.getElementById('signInGitHub').addEventListener('click', () => {
        backend.signInWithOAuth('github');
    });
    
    // Edit shader button
    document.getElementById('editShaderButton').addEventListener('click', () => {
        shaderManagement.enterEditMode(false); // false = editing owned shader, not forking
    });
    
    // Like button
    document.getElementById('likeButton').addEventListener('click', community.handleLikeClick);
    
    // Top-level tab switching (Comments / Gallery)
    document.querySelectorAll('.top-level-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.dataset.panel;
            ui.switchTopLevelPanel(panel);
        });
    });
    
    // Gallery tab switching
    document.querySelectorAll('.gallery-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // If clicking the refresh button, force refresh
            if (e.target.classList.contains('gallery-refresh-btn')) {
                e.stopPropagation();
                const tabName = tab.dataset.tab;
                save.populateGallery(tabName, true); // Force refresh
                return;
            }
            
            // Otherwise, normal tab switch (uses cache if available)
            const tabName = tab.dataset.tab;
            save.populateGallery(tabName);
        });
    });
    
    document.getElementById('signInGoogle').addEventListener('click', () => {
        backend.signInWithOAuth('google');
    });
    
    document.getElementById('signInFacebook').addEventListener('click', () => {
        backend.signInWithOAuth('facebook');
    });
    
    // Email/password sign-in
    document.getElementById('emailSignIn').addEventListener('click', async () => {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        
        if (!email || !password) {
            showAuthMessage('Please enter email and password', 'error');
            return;
        }
        
        const result = await backend.signInWithEmail(email, password);
        if (result.success) {
            hideAuthMessage();
            document.getElementById('signInModal').style.display = 'none';
        }
    });
    
    // Email/password sign-up
    document.getElementById('emailSignUp').addEventListener('click', async () => {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        const displayName = document.getElementById('displayNameInput').value;
        
        if (!email || !password) {
            showAuthMessage('Please enter email and password', 'error');
            return;
        }
        
        if (!displayName) {
            showAuthMessage('Please enter a display name', 'error');
            return;
        }
        
        const result = await backend.signUpWithEmail(email, password, displayName);
        // Don't close modal on success - user needs to see the "check your email" message
    });
    
    // Volume control
    document.getElementById('volumeSlider').addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        CONFIG.volume = vol;
        if (state.gainNode) state.gainNode.gain.value = vol;
    });
    
    // Pixel scale control
    document.getElementById('pixelScaleSlider').addEventListener('input', (e) => {
        const scaleIndex = parseInt(e.target.value);
        const scales = [1, 2, 3, 4, 6, 8];
        state.pixelScale = scales[scaleIndex];
        ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, true);
    });
    
    // Render mode cycling
    document.getElementById('renderModeIcon').addEventListener('click', () => {
        console.log('Render mode button clicked, current mode:', state.renderMode);
        state.renderMode = (state.renderMode + 1) % 2;
        console.log('  -> New mode:', state.renderMode);
        ui.updateRenderMode();
    });
    
    // Mouse tracking (use whichever canvas is visible)
    document.addEventListener('mousemove', (e) => {
        const activeCanvas = state.graphicsBackend === 'webgl' ? state.canvasWebGL : state.canvasWebGPU;
        const rect = activeCanvas.getBoundingClientRect();
        state.mouseX = (e.clientX - rect.left) / rect.width;
        state.mouseY = 1.0 - (e.clientY - rect.top) / rect.height; // Flip Y
    });
    
    // Handle visibility change - resync audio timing when tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.audioContext && state.isPlaying) {
            const ctx = state.audioContext;
            state.nextAudioTime = Math.ceil(ctx.currentTime / CONFIG.audioBlockDuration) * CONFIG.audioBlockDuration;
            state.pendingAudio = false;
        }
    });
    
    // Custom events
    window.addEventListener('toggle-theme', ui.toggleTheme);
    window.addEventListener('toggle-vim', vim.toggleVimMode);
    window.addEventListener('toggle-js-exec-mode', audio.toggleJSExecMode);
    window.addEventListener('load-example', (e) => loadExample(e.detail));
    
    // Browser back/forward navigation support (for OLD example URLs - deprecated)
    window.addEventListener('hashchange', () => {
        const urlShader = routing.getShaderFromURL();
        // Only load if it's an old-style example URL (no 'id=' present)
        if (urlShader && !window.location.hash.includes('id=') && urlShader !== state.currentExample) {
            console.log('[OLD FORMAT] Navigating to example from URL:', urlShader);
            loadExample(urlShader);
        }
    });
    window.addEventListener('stop-audio', compiler.stopAudio);
    window.addEventListener('tab-removed-recompile', () => {
        if (state.isRunning) {
            compiler.reloadShader();
        }
    });
    
    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (state.isDirty) {
            e.preventDefault();
            e.returnValue = ''; // Chrome requires returnValue to be set
            return ''; // Some browsers need a return value
        }
    });
}

// ============================================================================
// Canvas Management - Thin wrapper to ui module
// ============================================================================

// This wrapper is kept for window exposure and backwards compatibility
async function updateCanvasSize(width, height, recompile = true) {
    return await ui.updateCanvasSize(width, height, recompile);
}

// ============================================================================
// Top-Level Panel Switching - Thin wrapper to ui module
// ============================================================================

// This wrapper is kept for backwards compatibility
function switchTopLevelPanel(panelName) {
    ui.switchTopLevelPanel(panelName);
}

// ============================================================================
// Community Features - Thin wrappers to community module
// ============================================================================

// This wrapper is kept for window exposure
async function updateViewsAndLikes(shader) {
    return await community.updateViewsAndLikes(shader);
}

// ============================================================================
// Save Button Setup (Database Only)
// ============================================================================

function setupSaveButton() {
    // Main save/fork button handler
    document.getElementById('saveShaderBtn').addEventListener('click', shaderManagement.handleSaveForkClick);
    
    // Custom events
    window.addEventListener('shader-saved', (e) => {
        const shader = e.detail;
        
        if (shader && shader.id) {
            // Database save - use optimistic update
            save.addShaderToCache(shader);
        }
        
        shaderManagement.updateSaveButton();
    });
    window.addEventListener('shader-deleted', (e) => {
        const shaderId = e.detail?.id;
        if (shaderId) {
            save.removeShaderFromCache(shaderId);
        }
        // No need to call populateGallery() - optimistic update handles it
        shaderManagement.updateSaveButton();
    });
    window.addEventListener('shader-loaded', (e) => {
        const shader = e.detail;
        
        // Temporarily disable dirty tracking while loading
        const wasInitializing = state.isInitializing;
        state.isInitializing = true;
        
        // Update save button
        shaderManagement.updateSaveButton();
        
        // Don't change canvas size or pixel scale - use current values
        
        // Update shader info
        document.getElementById('shaderTitleDisplay').textContent = shader.title;
        document.getElementById('shaderCreator').textContent = shader.creator ? `by ${shader.creator}` : '';
        document.getElementById('shaderDescriptionDisplay').textContent = shader.description || '';
        
        // Update UI
        tabs.renderTabs();
        
        // Switch to saved tab (or first tab)
        if (shader.currentTab && state.activeTabs.includes(shader.currentTab)) {
            tabs.switchTab(shader.currentTab);
        } else if (state.activeTabs.length > 0) {
        tabs.switchTab(state.activeTabs[0]);
        }
        
        // Reload shader and restart (maintains play/pause state)
        if (state.isRunning) {
            compiler.reloadShader().then(() => {
                ui.restart();
                // Re-enable dirty tracking after load completes
                setTimeout(() => {
                    state.isInitializing = wasInitializing;
                }, 100);
            });
        } else {
            // Re-enable dirty tracking immediately if not running
            setTimeout(() => {
                state.isInitializing = wasInitializing;
            }, 100);
        }
    });
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    // Load settings
    const settings = loadSettings();
    if (settings.isDarkMode !== undefined) {
        state.isDarkMode = settings.isDarkMode;
    }
    if (settings.isVimMode !== undefined) {
        state.isVimMode = settings.isVimMode;
    }
    if (settings.jsExecutionMode !== undefined) {
        state.jsExecutionMode = settings.jsExecutionMode;
    }
    ui.applyTheme();
    
    setupUI();
    setupSaveButton();
    
    // Initialize backend (Supabase auth)
    backend.init();
    
    // Initialize performance monitor
    perfMonitor.init();
    
    // Initialize uniform controls
    uniformControls.init();
    
    // Initialize fullscreen mode
    fullscreen.init();
    
    // Add mini visualization to stats button
    const perfBtn = document.getElementById('perfMonitorBtn');
    const miniCanvas = perfMonitor.createMiniVisualization();
    perfBtn.appendChild(miniCanvas);
    
    // Initialize audio FIRST
    audio.initWebAudio();
    
    // Initialize uniform builder (needed for uniform controls)
    state.uniformBuilder = new UniformBuilder();
    
    // Initialize Monaco with empty initial code (actual shader will load after init)
    const initialCode = {
        boilerplate: getBoilerplate(),
        graphics: '',
        audio: '',
        audioLanguage: 'wgsl',
        js: MINIMAL_JS
    };
    
    await editor.initMonaco(null, initialCode);
    
    // Set up dirty tracking for all editors
    // (markDirty checks isInitializing flag to prevent marking during load)
    shaderManagement.setupDirtyTracking(state.graphicsEditor);
    shaderManagement.setupDirtyTracking(state.audioEditor);
    shaderManagement.setupDirtyTracking(state.jsEditor);
    shaderManagement.setupDirtyTracking(state.boilerplateEditor);
    // Help is read-only, no need to track
    
    // Load vim library asynchronously after a short delay
    // This ensures Monaco has fully loaded all its language modules first
    setTimeout(() => {
    vim.loadVimLibrary().then((success) => {
        if (success) {
            // Apply vim mode state (will show/hide status bar accordingly)
            vim.applyVimMode();
        }
    });
    }, 1000);
    
    // Try to initialize WebGPU first (hello_world is WGSL)
    const webgpuResult = await webgpu.init(state.canvasWebGPU);
    state.hasWebGPU = webgpuResult.success;
    
    // Don't initialize WebGL yet - can't share canvas context with WebGPU
    // WebGL will be initialized on-demand when a GLSL shader is loaded
    state.hasWebGL = true;  // Assume available (WebGL2 is widely supported)
    
    console.log('Graphics backends:', {
        WebGPU: state.hasWebGPU,
        WebGL: '(not initialized - will init on-demand)'
    });
    
    // Gallery will be populated by auth state change listener in backend.js
    
    // Check if a shader is specified in URL
    const urlHash = window.location.hash;
    let shaderToLoad = null;
    
    // Check for #g: (golf shader in URL) - handle this before loading defaults
    if (urlHash.startsWith('#g:')) {
        const code = decodeURIComponent(urlHash.substring(3));
        console.log('Loading golf shader from URL on init:', code.length, 'chars');
        
        // Mark as anonymous golf URL view (read-only)
        state.isAnonymousGolfURL = true;
        
        // Set up golf tab
        state.activeTabs = ['glsl_golf'];
        state.currentTab = 'glsl_golf';
        
        // Load the code
        state.graphicsEditor.setValue(code);
        
        // Update tabs and compile
        tabs.renderTabs();
        tabs.switchTab('glsl_golf');
        
        await compiler.reloadShader();
        
        // Set title and description for anonymous golf shader (set display elements BEFORE enterEditMode)
        const titleDisplay = document.getElementById('shaderTitleDisplay');
        const descDisplay = document.getElementById('shaderDescriptionDisplay');
        if (titleDisplay && descDisplay) {
            titleDisplay.textContent = `Golfed: ${code.length} chars of code from url`;
            descDisplay.textContent = `Use http://gsl.golf/#g:${code} to get here`;
        }
        
        // Start render loop
        console.log('Starting render loop for golf shader, canvas size:', state.canvasWebGL.width, 'x', state.canvasWebGL.height);
        render.start();
        
        // Set up playback state
        state.isRunning = true;
        ui.restart();
        state.isPlaying = true;
        state.audioContext.resume();
        ui.updatePlayPauseButton();
        
        // For anonymous golf URLs, do NOT enter edit mode - keep the display-only view
        // The title/description are already set in the display elements above
        
        // Mark initialization complete
        setTimeout(() => {
            state.isInitializing = false;
        }, 200);
        
        // Setup navigation listeners and return (don't load default example)
        routing.setupNavigationListeners();
        return;
    }
    
    // Check for #id=slug (database shader)
    if (urlHash.includes('id=')) {
        const slug = urlHash.split('id=')[1]?.split('&')[0];
        if (slug) {
            console.log('Loading shader from URL slug:', slug);
            const result = await backend.loadShader(slug);
            if (result.success) {
                shaderToLoad = result.shader;
            } else {
                console.warn('Failed to load shader from URL:', result.error);
            }
        }
    } 
    // If it's an old-style #shader= URL (before database migration), clear it
    else if (urlHash.includes('shader=')) {
        console.log('Clearing old example URL format');
        window.history.replaceState(null, '', window.location.pathname);
    }
    
    // If no URL shader or failed to load, get first example from database
    if (!shaderToLoad) {
        const examplesResult = await backend.loadExamples();
        if (examplesResult.success && examplesResult.shaders.length > 0) {
            shaderToLoad = examplesResult.shaders[0];
            console.log('Loading first example:', shaderToLoad.title);
        }
    }
    
    // Load the shader
    if (shaderToLoad) {
        console.log('Loading shader:', shaderToLoad.title);
        save.loadDatabaseShader(shaderToLoad);
        // Note: loadDatabaseShader() calls reloadShader() internally
    } else {
        // Fallback if no shaders in database yet
    tabs.renderTabs();
        tabs.switchTab('glsl_fragment');
        
        // Only compile if we didn't load a database shader
        const compileSuccess = await compiler.reloadShader();
        console.log('Initial shader compilation:', compileSuccess ? 'success' : 'failed');
    }
    
    // IMPORTANT: Start render loop BEFORE setting isRunning = true
    console.log('Starting render loop, canvas size:', state.canvasWebGPU.width, 'x', state.canvasWebGPU.height);
        render.start();
    
    // Initialize render mode (must be AFTER graphics backend is set)
    ui.updateRenderMode();
    
    // Now set up playback state
    state.isRunning = true;
    ui.restart();
    state.isPlaying = true;
    state.audioContext.resume();
    ui.updatePlayPauseButton();
    
    // Mark initialization complete - now dirty tracking can start
    // Small delay to ensure all initial setValue calls have completed
    setTimeout(() => {
        state.isInitializing = false;
    }, 200);
}


// Make some functions global for Monaco keyboard shortcuts and backend
window.reloadShader = compiler.reloadShader;
window.togglePlayPause = ui.togglePlayPause;
window.showAuthMessage = ui.showAuthMessage;
window.hideAuthMessage = ui.hideAuthMessage;
window.updateSaveButton = shaderManagement.updateSaveButton;
window.isShaderOwnedByUser = shaderManagement.isShaderOwnedByUser;
window.isInEditMode = shaderManagement.isInEditMode;
window.enterEditMode = shaderManagement.enterEditMode;
window.exitEditMode = shaderManagement.exitEditMode;
window.save = save; // Expose save module for backend.js
window.backend = backend; // Expose backend module for performance monitor
window.updateViewsAndLikes = updateViewsAndLikes; // Expose for save.js
window.createNewShader = createNewShader; // Expose for UI
window.updateCanvasSize = updateCanvasSize; // Expose for UI

// Setup navigation listeners
routing.setupNavigationListeners();

// Start application
window.addEventListener('load', init);

