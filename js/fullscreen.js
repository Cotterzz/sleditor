// ============================================================================
// Fullscreen Mode Module
// ============================================================================

import { state, CONFIG } from './core.js';
import * as ui from './ui.js';
import * as uniformControls from './uniform-controls.js';

let isFullscreen = false;
let hideControlsTimeout = null;
const HIDE_DELAY = 3000; // 3 seconds
let previousCanvasHeight = null; // Store height before fullscreen
let previousPixelScale = null; // Store pixel scale before fullscreen

/**
 * Initialize fullscreen functionality
 */
export function init() {
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const fsExitBtn = document.getElementById('fsExitBtn');
    const canvasContainer = document.getElementById('canvasContainer');
    
    // Enter fullscreen button
    fullscreenBtn.addEventListener('click', enterFullscreen);
    
    // Exit fullscreen button
    fsExitBtn.addEventListener('click', exitFullscreen);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'f' || e.key === 'F') {
            if (!isFullscreen) {
                enterFullscreen();
            }
        }
        if (e.key === 'Escape' && isFullscreen) {
            exitFullscreen();
        }
    });
    
    // Listen for fullscreen changes (user can also press Esc)
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);
    
    // Mouse movement for auto-hide
    canvasContainer.addEventListener('mousemove', onMouseMove);
    
    // Sync fullscreen controls with regular controls
    syncControls();
}

/**
 * Enter fullscreen mode
 */
export async function enterFullscreen() {
    const canvasContainer = document.getElementById('canvasContainer');
    
    // Store current height before going fullscreen
    previousCanvasHeight = canvasContainer.offsetHeight;
    
    // Store pixel scale and boost to 2 if it's currently at 1 for performance
    previousPixelScale = state.pixelScale;
    if (state.pixelScale === 1) {
        state.pixelScale = 2;
        ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, false);
        
        // Update both sliders to reflect the new scale
        // pixelScale 2 is at index 1 in the scales array
        document.getElementById('pixelScaleSlider').value = '1';
        document.getElementById('fsPixelScaleSlider').value = '1';
    } else {
        // Sync fullscreen slider with current value
        const scales = [1, 2, 3, 4, 6, 8];
        const currentIndex = scales.indexOf(state.pixelScale);
        if (currentIndex !== -1) {
            document.getElementById('fsPixelScaleSlider').value = currentIndex.toString();
        }
    }
    
    try {
        if (canvasContainer.requestFullscreen) {
            await canvasContainer.requestFullscreen();
        } else if (canvasContainer.webkitRequestFullscreen) {
            await canvasContainer.webkitRequestFullscreen();
        } else if (canvasContainer.mozRequestFullScreen) {
            await canvasContainer.mozRequestFullScreen();
        } else if (canvasContainer.msRequestFullscreen) {
            await canvasContainer.msRequestFullscreen();
        }
        
        isFullscreen = true;
        console.log('Entered fullscreen mode');
        
        // Move uniform panel into fullscreen context
        const uniformPanel = document.getElementById('uniformControlsPanel');
        if (uniformPanel) {
            canvasContainer.appendChild(uniformPanel);
        }
        
        // Show controls initially
        showControls();
        
        // Start auto-hide timer
        resetHideTimer();
        
    } catch (err) {
        console.error('Failed to enter fullscreen:', err);
    }
}

/**
 * Exit fullscreen mode
 */
export function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
    
    isFullscreen = false;
}

/**
 * Handle fullscreen change events
 */
function onFullscreenChange() {
    const isCurrentlyFullscreen = !!(document.fullscreenElement || 
                                      document.webkitFullscreenElement || 
                                      document.mozFullScreenElement || 
                                      document.msFullscreenElement);
    
    isFullscreen = isCurrentlyFullscreen;
    
    if (!isFullscreen) {
        // Clean up when exiting fullscreen
        clearTimeout(hideControlsTimeout);
        const canvasContainer = document.getElementById('canvasContainer');
        canvasContainer.classList.remove('hide-controls');
        
        // Restore canvas height
        if (previousCanvasHeight !== null) {
            canvasContainer.style.height = previousCanvasHeight + 'px';
            console.log('Restored canvas height to:', previousCanvasHeight);
            
            // Trigger resize observer to update canvas size
            ui.updateCanvasSize(canvasContainer.offsetWidth, previousCanvasHeight, false);
            previousCanvasHeight = null;
        }
        
        // Restore pixel scale if it was changed
        if (previousPixelScale !== null) {
            state.pixelScale = previousPixelScale;
            ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, false);
            
            // Update slider to reflect restored scale
            const scales = [1, 2, 3, 4, 6, 8];
            const restoredIndex = scales.indexOf(previousPixelScale);
            if (restoredIndex !== -1) {
                document.getElementById('pixelScaleSlider').value = restoredIndex.toString();
            }
            
            console.log('Restored pixel scale to:', previousPixelScale);
            previousPixelScale = null;
        }
        
        // Move uniform panel back to body
        const uniformPanel = document.getElementById('uniformControlsPanel');
        if (uniformPanel && uniformPanel.parentElement === canvasContainer) {
            document.body.appendChild(uniformPanel);
        }
    }
}

/**
 * Mouse move handler for auto-hide
 */
function onMouseMove() {
    if (!isFullscreen) return;
    
    showControls();
    resetHideTimer();
}

/**
 * Show fullscreen controls
 */
function showControls() {
    const canvasContainer = document.getElementById('canvasContainer');
    canvasContainer.classList.remove('hide-controls');
}

/**
 * Hide fullscreen controls
 */
function hideControls() {
    if (!isFullscreen) return;
    
    const canvasContainer = document.getElementById('canvasContainer');
    canvasContainer.classList.add('hide-controls');
}

/**
 * Reset auto-hide timer
 */
function resetHideTimer() {
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = setTimeout(hideControls, HIDE_DELAY);
}

/**
 * Sync fullscreen controls with regular controls
 * Called on init and whenever controls change
 */
function syncControls() {
    // Play/Pause
    const fsPlayPauseBtn = document.getElementById('fsPlayPauseBtn');
    fsPlayPauseBtn.addEventListener('click', () => {
        ui.togglePlayPause();
        updatePlayPauseButton();
    });
    
    // Restart
    const fsRestartBtn = document.getElementById('fsRestartBtn');
    fsRestartBtn.addEventListener('click', () => ui.restart(true));
    
    // Uniform controls
    const fsUniformsBtn = document.getElementById('fsUniformsBtn');
    fsUniformsBtn.addEventListener('click', () => uniformControls.toggle());
    
    // Volume slider
    const fsVolumeSlider = document.getElementById('fsVolumeSlider');
    fsVolumeSlider.addEventListener('input', (e) => {
        const vol = parseInt(e.target.value) / 100;
        CONFIG.volume = vol;
        if (state.gainNode) state.gainNode.gain.value = vol;
        // Sync with regular volume slider
        document.getElementById('volumeSlider').value = e.target.value;
    });
    
    // Pixel scale slider
    const fsPixelScaleSlider = document.getElementById('fsPixelScaleSlider');
    fsPixelScaleSlider.addEventListener('input', (e) => {
        const scaleIndex = parseInt(e.target.value);
        const scales = [1, 2, 3, 4, 6, 8];
        state.pixelScale = scales[scaleIndex];
        ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, true);
        // Sync with regular slider
        document.getElementById('pixelScaleSlider').value = e.target.value;
    });
}

/**
 * Update play/pause button state in fullscreen
 */
export function updatePlayPauseButton() {
    const fsPlayPauseBtn = document.getElementById('fsPlayPauseBtn');
    if (state.isPlaying) {
        fsPlayPauseBtn.textContent = '⏸';
        fsPlayPauseBtn.classList.add('playing');
    } else {
        fsPlayPauseBtn.textContent = '▶';
        fsPlayPauseBtn.classList.remove('playing');
    }
}

/**
 * Update fullscreen stats displays
 * Called from render loop or counter updates
 */
export function updateStats(resolution, fps, frame, time) {
    if (!isFullscreen) return;
    
    document.getElementById('fsResolution').textContent = resolution;
    document.getElementById('fsFps').textContent = fps;
    document.getElementById('fsFrame').textContent = frame;
    document.getElementById('fsTime').textContent = time;
}

/**
 * Check if currently in fullscreen
 */
export function isInFullscreen() {
    return isFullscreen;
}

