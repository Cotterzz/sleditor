// ============================================================================
// Keyboard Input - Shadertoy-compatible keyboard texture and JS API
// ============================================================================
//
// Provides a 256x3 texture where:
//   Row 0: Key down state (1 if currently held, 0 if not)
//   Row 1: Key hit state (1 only on the frame the key was pressed)
//   Row 2: Key toggle state (flips each time key is pressed)
//
// Uses JavaScript keyCodes (based on ASCII):
//   'A' = 65, 'Z' = 90, '0' = 48, '9' = 57, Space = 32, etc.
//
// Red channel holds the value (0 or 255), other channels are 0.
// ============================================================================

import { state } from './core.js';

// Keyboard state arrays (256 keys)
const keysDown = new Uint8Array(256);      // Currently held
const keysHit = new Uint8Array(256);       // Pressed this frame
const keysToggle = new Uint8Array(256);    // Toggle state
const keysPrevDown = new Uint8Array(256);  // Previous frame state (for hit detection)

// Texture data (256 x 3, RGBA)
const textureData = new Uint8Array(256 * 3 * 4);

// WebGL texture
let keyboardTexture = null;
let isInitialized = false;
let isListening = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize keyboard input system
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @returns {Object} Keyboard data with texture
 */
export function createKeyboardChannel(gl) {
    if (!gl) {
        throw new Error('WebGL context required for keyboard input');
    }
    
    // Create texture
    keyboardTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, keyboardTexture);
    
    // Initialize with zeros
    textureData.fill(0);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        3,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        textureData
    );
    
    // Texture parameters - nearest filtering, no mipmaps
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    // Start listening for keyboard events
    startListening();
    
    isInitialized = true;
    
    console.log('✓ Keyboard input initialized (256×3 texture)');
    
    return {
        texture: keyboardTexture,
        width: 256,
        height: 3,
        active: true
    };
}

/**
 * Start listening for keyboard events
 */
function startListening() {
    if (isListening) return;
    
    // Make canvas focusable
    const canvas = state.canvasWebGL || state.canvasGPU;
    if (canvas) {
        canvas.setAttribute('tabindex', '0');
        canvas.style.outline = 'none'; // Remove focus outline
    }
    
    // Add event listeners to window (we'll check focus in handlers)
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Prevent default for game-like keys when canvas is focused
    window.addEventListener('keydown', preventDefaultForGameKeys);
    
    isListening = true;
}

/**
 * Stop listening for keyboard events
 */
export function stopListening() {
    if (!isListening) return;
    
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('keydown', preventDefaultForGameKeys);
    
    isListening = false;
}

/**
 * Check if canvas is focused
 */
function isCanvasFocused() {
    const canvas = state.canvasWebGL || state.canvasGPU;
    const focused = document.activeElement === canvas;
    return focused;
}

/**
 * Debug: log focus state
 */
export function debugFocusState() {
    const canvas = state.canvasWebGL || state.canvasGPU;
    console.log('Keyboard debug:', {
        canvas: canvas ? 'exists' : 'null',
        canvasId: canvas?.id,
        activeElement: document.activeElement?.tagName,
        activeElementId: document.activeElement?.id,
        isFocused: isCanvasFocused(),
        isListening,
        isInitialized
    });
}

/**
 * Prevent default for game-like keys (arrows, space) when not editing
 */
function preventDefaultForGameKeys(e) {
    // Don't prevent if focus is on an input/textarea/editor
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isEditing = activeTag === 'input' || activeTag === 'textarea' || 
                      document.activeElement?.classList?.contains('monaco-editor') ||
                      document.activeElement?.closest('.monaco-editor');
    
    if (isEditing) return;
    
    // Prevent scrolling for arrow keys and space
    const gameKeys = [32, 37, 38, 39, 40]; // Space, arrows
    if (gameKeys.includes(e.keyCode)) {
        e.preventDefault();
    }
}

/**
 * Handle keydown event
 */
function handleKeyDown(e) {
    // Don't capture if focus is on an input/textarea/editor
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isEditing = activeTag === 'input' || activeTag === 'textarea' || 
                      document.activeElement?.classList?.contains('monaco-editor') ||
                      document.activeElement?.closest('.monaco-editor');
    
    if (isEditing) {
        return; // Let editor/inputs handle keyboard
    }
    
    // Don't capture if modifier keys are held (let browser shortcuts work)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    
    const keyCode = e.keyCode;
    if (keyCode < 0 || keyCode >= 256) return;
    
    // Only set hit if key wasn't already down
    if (!keysDown[keyCode]) {
        keysHit[keyCode] = 1;
        // Toggle on press
        keysToggle[keyCode] = keysToggle[keyCode] ? 0 : 1;
    }
    
    keysDown[keyCode] = 1;
}

/**
 * Handle keyup event
 */
function handleKeyUp(e) {
    const keyCode = e.keyCode;
    if (keyCode < 0 || keyCode >= 256) return;
    
    keysDown[keyCode] = 0;
}

// ============================================================================
// Texture Update
// ============================================================================

/**
 * Update the keyboard texture with current state
 * @param {WebGL2RenderingContext} gl - WebGL context
 */
export function updateKeyboardTexture(gl) {
    if (!keyboardTexture || !gl) {
        return;
    }
    
    // Build texture data
    // Row 0: keysDown
    // Row 1: keysHit
    // Row 2: keysToggle
    for (let i = 0; i < 256; i++) {
        // Row 0 (y=0): key down
        const idx0 = i * 4;
        textureData[idx0] = keysDown[i] ? 255 : 0;     // R
        textureData[idx0 + 1] = 0;                      // G
        textureData[idx0 + 2] = 0;                      // B
        textureData[idx0 + 3] = 255;                    // A
        
        // Row 1 (y=1): key hit
        const idx1 = (256 + i) * 4;
        textureData[idx1] = keysHit[i] ? 255 : 0;      // R
        textureData[idx1 + 1] = 0;
        textureData[idx1 + 2] = 0;
        textureData[idx1 + 3] = 255;
        
        // Row 2 (y=2): key toggle
        const idx2 = (512 + i) * 4;
        textureData[idx2] = keysToggle[i] ? 255 : 0;   // R
        textureData[idx2 + 1] = 0;
        textureData[idx2 + 2] = 0;
        textureData[idx2 + 3] = 255;
    }
    
    // Upload to GPU
    gl.bindTexture(gl.TEXTURE_2D, keyboardTexture);
    gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0, 0,
        256, 3,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        textureData
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Clear hit states (call at end of each frame)
 */
export function clearHitStates() {
    keysHit.fill(0);
}

// ============================================================================
// JS API
// ============================================================================

/**
 * Convert key identifier to keyCode
 * @param {string|number} key - Key name (e.g., "A", "Space") or keyCode
 * @returns {number} keyCode
 */
function toKeyCode(key) {
    if (typeof key === 'number') {
        return key;
    }
    
    if (typeof key === 'string') {
        // Single character - use char code
        if (key.length === 1) {
            return key.toUpperCase().charCodeAt(0);
        }
        
        // Named keys
        const namedKeys = {
            'space': 32,
            'enter': 13,
            'escape': 27,
            'esc': 27,
            'tab': 9,
            'shift': 16,
            'ctrl': 17,
            'control': 17,
            'alt': 18,
            'backspace': 8,
            'delete': 46,
            'insert': 45,
            'home': 36,
            'end': 35,
            'pageup': 33,
            'pagedown': 34,
            'left': 37,
            'up': 38,
            'right': 39,
            'down': 40,
            'arrowleft': 37,
            'arrowup': 38,
            'arrowright': 39,
            'arrowdown': 40,
            'f1': 112, 'f2': 113, 'f3': 114, 'f4': 115,
            'f5': 116, 'f6': 117, 'f7': 118, 'f8': 119,
            'f9': 120, 'f10': 121, 'f11': 122, 'f12': 123
        };
        
        return namedKeys[key.toLowerCase()] || key.toUpperCase().charCodeAt(0);
    }
    
    return 0;
}

/**
 * Check if key is currently down
 * @param {string|number} key - Key name or keyCode
 * @returns {boolean}
 */
export function isDown(key) {
    const keyCode = toKeyCode(key);
    return keyCode >= 0 && keyCode < 256 && keysDown[keyCode] === 1;
}

/**
 * Check if key was pressed this frame
 * @param {string|number} key - Key name or keyCode
 * @returns {boolean}
 */
export function isHit(key) {
    const keyCode = toKeyCode(key);
    return keyCode >= 0 && keyCode < 256 && keysHit[keyCode] === 1;
}

/**
 * Check if key is in toggled state
 * @param {string|number} key - Key name or keyCode
 * @returns {boolean}
 */
export function isToggled(key) {
    const keyCode = toKeyCode(key);
    return keyCode >= 0 && keyCode < 256 && keysToggle[keyCode] === 1;
}

/**
 * Get the keyboard API object for JS runtime
 * @returns {Object} API object
 */
export function getKeyboardAPI() {
    return {
        isDown,
        isHit,
        isToggled,
        // Aliases
        isPressed: isHit,
        isAsciiDown: isDown
    };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Stop keyboard channel and cleanup
 * @param {Object} keyboardData - Keyboard channel data
 */
export function stopKeyboardChannel(keyboardData) {
    stopListening();
    
    // Clear all states
    keysDown.fill(0);
    keysHit.fill(0);
    keysToggle.fill(0);
    
    // Don't delete texture here - let channel cleanup handle it
    isInitialized = false;
    
    console.log('✓ Keyboard input stopped');
}

/**
 * Focus the canvas for keyboard input
 */
export function focusCanvas() {
    const canvas = state.canvasWebGL || state.canvasGPU;
    if (canvas) {
        canvas.focus();
    }
}

/**
 * Check if keyboard input is active
 */
export function isActive() {
    return isInitialized && isListening;
}

/**
 * Ensure keyboard listening is active (for JS API without texture channel)
 * Can be called without creating a texture
 */
export function ensureListening() {
    if (!isListening) {
        startListening();
    }
}

// Expose debug helper to window
if (typeof window !== 'undefined') {
    window.keyboardDebug = {
        debugFocusState,
        isActive,
        isDown,
        isHit,
        isToggled,
        focusCanvas
    };
}

