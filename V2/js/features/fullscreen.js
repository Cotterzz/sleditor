/**
 * Fullscreen Manager
 * 
 * Handles fullscreen mode with auto-hiding controls.
 * Event-driven approach - emits events, UI components react.
 */

import { logger } from '../core/logger.js';
import { events, EVENTS } from '../core/events.js';
import { state } from '../core/state.js';

let isFullscreen = false;
let hideControlsTimeout = null;
const HIDE_DELAY = 3000; // 3 seconds

let previewContainer = null;
let movedElements = []; // Track elements moved into fullscreen container

// Store pre-fullscreen state
let beforeFullscreen = {
    controlsWereDocked: true,
    controlsPosition: null,
    uniformsPosition: null
};

/**
 * Initialize fullscreen functionality
 * @param {HTMLElement} container - The preview canvas container to make fullscreen
 */
export function init(container) {
    previewContainer = container;
    
    // Listen for fullscreen changes (user can also press Esc or F11)
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);
    
    // Mouse movement for auto-hide
    previewContainer.addEventListener('mousemove', onMouseMove);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only trigger if not typing in an input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // F key toggles fullscreen
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            toggle();
        }
    });
    
    logger.info('Fullscreen', 'Init', 'Fullscreen manager initialized');
}

/**
 * Enter fullscreen mode
 */
export async function enter() {
    if (!previewContainer) {
        logger.warn('Fullscreen', 'Enter', 'No preview container set');
        return;
    }
    
    if (isFullscreen) {
        logger.debug('Fullscreen', 'Enter', 'Already in fullscreen');
        return;
    }
    
    try {
        if (previewContainer.requestFullscreen) {
            await previewContainer.requestFullscreen();
        } else if (previewContainer.webkitRequestFullscreen) {
            await previewContainer.webkitRequestFullscreen();
        } else if (previewContainer.mozRequestFullScreen) {
            await previewContainer.mozRequestFullScreen();
        } else if (previewContainer.msRequestFullscreen) {
            await previewContainer.msRequestFullscreen();
        } else {
            logger.warn('Fullscreen', 'Enter', 'Fullscreen API not supported');
            return;
        }
        
        logger.success('Fullscreen', 'Enter', 'Entered fullscreen mode');
        
    } catch (err) {
        logger.error('Fullscreen', 'Enter', 'Failed: ' + err.message);
    }
}

/**
 * Exit fullscreen mode
 */
export function exit() {
    if (!isFullscreen) {
        logger.debug('Fullscreen', 'Exit', 'Not in fullscreen');
        return;
    }
    
    try {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        logger.info('Fullscreen', 'Exit', 'Exiting fullscreen mode');
        
    } catch (err) {
        logger.error('Fullscreen', 'Exit', 'Failed: ' + err.message);
    }
}

/**
 * Toggle fullscreen mode
 */
export function toggle() {
    if (isFullscreen) {
        exit();
    } else {
        enter();
    }
}

/**
 * Handle fullscreen change events
 */
function onFullscreenChange() {
    const isCurrentlyFullscreen = !!(
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement
    );
    
    const wasFullscreen = isFullscreen;
    isFullscreen = isCurrentlyFullscreen;
    
    if (isFullscreen && !wasFullscreen) {
        // Just entered fullscreen
        previewContainer.classList.add('fullscreen-mode');
        state.ui.isFullscreen = true;
        
        // Emit event FIRST so controls can undock (if needed)
        events.emit(EVENTS.FULLSCREEN_ENTER);
        
        // Give UI time to undock, then move and position elements
        setTimeout(() => {
            moveUIIntoFullscreen();
            positionUIForFullscreen();
            showControls();
            resetHideTimer();
        }, 100);
        
    } else if (!isFullscreen && wasFullscreen) {
        // Just exited fullscreen
        previewContainer.classList.remove('fullscreen-mode', 'hide-controls');
        state.ui.isFullscreen = false;
        clearTimeout(hideControlsTimeout);
        
        // Move UI elements back to document.body
        moveUIOutOfFullscreen();
        
        events.emit(EVENTS.FULLSCREEN_EXIT);
    }
}

/**
 * Move floating UI elements into fullscreen container
 */
function moveUIIntoFullscreen() {
    movedElements = [];
    
    // Move floating shader controls
    const floatingControls = document.querySelector('.v2-shader-controls-floating');
    if (floatingControls && floatingControls.parentNode !== previewContainer) {
        // Save original position before moving
        const rect = floatingControls.getBoundingClientRect();
        beforeFullscreen.controlsPosition = {
            left: floatingControls.style.left,
            top: floatingControls.style.top,
            bottom: floatingControls.style.bottom,
            transform: floatingControls.style.transform
        };
        
        movedElements.push({
            element: floatingControls,
            originalParent: floatingControls.parentNode,
            originalNextSibling: floatingControls.nextSibling
        });
        previewContainer.appendChild(floatingControls);
        logger.debug('Fullscreen', 'UI', 'Moved shader controls into fullscreen');
    } else {
        logger.debug('Fullscreen', 'UI', 'Shader controls not found or already in container');
    }
    
    // Move ONLY the uniforms panel into fullscreen (if it's open)
    let uniformsWindow = document.querySelector('[data-window-id="uniforms"]');
    if (!uniformsWindow) {
        uniformsWindow = document.querySelector('.sl-window-container[data-window-id*="uniforms"]');
    }
    if (!uniformsWindow) {
        // Fallback: search all windows
        const allWindows = document.querySelectorAll('.sl-window-container');
        allWindows.forEach(win => {
            const id = win.getAttribute('data-window-id');
            if (id && id.includes('uniforms')) {
                uniformsWindow = win;
            }
        });
    }
    
    if (uniformsWindow && uniformsWindow.parentNode !== previewContainer) {
        // Save original position
        beforeFullscreen.uniformsPosition = {
            left: uniformsWindow.style.left,
            top: uniformsWindow.style.top,
            right: uniformsWindow.style.right,
            bottom: uniformsWindow.style.bottom
        };
        
        movedElements.push({
            element: uniformsWindow,
            originalParent: uniformsWindow.parentNode,
            originalNextSibling: uniformsWindow.nextSibling
        });
        previewContainer.appendChild(uniformsWindow);
        logger.success('Fullscreen', 'UI', 'Moved uniforms panel into fullscreen');
    } else if (!uniformsWindow) {
        logger.info('Fullscreen', 'UI', 'Uniforms panel not open');
    }
    
    logger.info('Fullscreen', 'UI', `Moved ${movedElements.length} UI elements into fullscreen`);
}

/**
 * Position UI elements for fullscreen layout
 */
function positionUIForFullscreen() {
    // Position shader controls at bottom center
    const floatingControls = previewContainer.querySelector('.v2-shader-controls-floating');
    if (floatingControls) {
        floatingControls.style.position = 'fixed';
        floatingControls.style.bottom = '20px';
        floatingControls.style.left = '50%';
        floatingControls.style.top = 'auto';
        floatingControls.style.transform = 'translateX(-50%)';
        logger.debug('Fullscreen', 'Position', 'Controls positioned at bottom center');
    }
    
    // Position uniforms at left side
    const uniformsWindow = previewContainer.querySelector('[data-window-id="uniforms"]') || 
                          previewContainer.querySelector('.sl-window-container[data-window-id*="uniforms"]');
    if (uniformsWindow) {
        uniformsWindow.style.position = 'fixed';
        uniformsWindow.style.left = '20px';
        uniformsWindow.style.top = '20px';
        uniformsWindow.style.bottom = 'auto';
        uniformsWindow.style.right = 'auto';
        logger.debug('Fullscreen', 'Position', 'Uniforms positioned at left side');
    }
}

/**
 * Move UI elements back to their original positions
 */
function moveUIOutOfFullscreen() {
    movedElements.forEach(({ element, originalParent, originalNextSibling }) => {
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
            originalParent.insertBefore(element, originalNextSibling);
        } else {
            originalParent.appendChild(element);
        }
    });
    
    // Restore control positions
    const floatingControls = document.querySelector('.v2-shader-controls-floating');
    if (floatingControls && beforeFullscreen.controlsPosition) {
        floatingControls.style.left = beforeFullscreen.controlsPosition.left;
        floatingControls.style.top = beforeFullscreen.controlsPosition.top;
        floatingControls.style.bottom = beforeFullscreen.controlsPosition.bottom;
        floatingControls.style.transform = beforeFullscreen.controlsPosition.transform;
        logger.debug('Fullscreen', 'Restore', 'Controls position restored');
    }
    
    // Restore uniforms position
    const uniformsWindow = document.querySelector('[data-window-id="uniforms"]') || 
                          document.querySelector('.sl-window-container[data-window-id*="uniforms"]');
    if (uniformsWindow && beforeFullscreen.uniformsPosition) {
        uniformsWindow.style.left = beforeFullscreen.uniformsPosition.left;
        uniformsWindow.style.top = beforeFullscreen.uniformsPosition.top;
        uniformsWindow.style.right = beforeFullscreen.uniformsPosition.right;
        uniformsWindow.style.bottom = beforeFullscreen.uniformsPosition.bottom;
        logger.debug('Fullscreen', 'Restore', 'Uniforms position restored');
    }
    
    logger.debug('Fullscreen', 'UI', `Restored ${movedElements.length} elements from fullscreen`);
    movedElements = [];
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
    if (!isFullscreen) return;
    
    previewContainer.classList.remove('hide-controls');
    events.emit(EVENTS.FULLSCREEN_CONTROLS_VISIBLE, { visible: true });
}

/**
 * Hide fullscreen controls
 */
function hideControls() {
    if (!isFullscreen) return;
    
    previewContainer.classList.add('hide-controls');
    events.emit(EVENTS.FULLSCREEN_CONTROLS_VISIBLE, { visible: false });
}

/**
 * Reset auto-hide timer
 */
function resetHideTimer() {
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = setTimeout(hideControls, HIDE_DELAY);
}

/**
 * Check if currently in fullscreen
 */
export function isInFullscreen() {
    return isFullscreen;
}

/**
 * Save controls docked state before fullscreen
 */
export function saveControlsState(wasDocked) {
    beforeFullscreen.controlsWereDocked = wasDocked;
}

/**
 * Get saved controls docked state
 */
export function getControlsState() {
    return beforeFullscreen.controlsWereDocked;
}

export default {
    init,
    enter,
    exit,
    toggle,
    isInFullscreen,
    saveControlsState,
    getControlsState
};
