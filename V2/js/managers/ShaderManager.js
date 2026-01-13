/**
 * ShaderManager - Orchestrates shader editing, compilation, and rendering
 * 
 * Connects: Editor → Compiler → Preview
 * Follows the Manager pattern (Pillar 3)
 * 
 * Single Source of Truth: state.shader.code (no codeCache!)
 */

import { logger } from '../core/logger.js';
import { events, EVENTS } from '../core/events.js';
import { state } from '../core/state.js';

// ============================================================================
// DEFAULT SHADER CODE - Single source of truth for initial state
// ============================================================================

const DEFAULT_SHADER_CODE = {
    Image: `// Sleditor V2 - Default Shader
// Shadertoy-compatible format

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    // Animated gradient
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
    
    // Add some visual interest with the SL logo shape
    vec2 p = uv - 0.5;
    float d = length(p);
    float ring = smoothstep(0.3, 0.28, d) * smoothstep(0.2, 0.22, d);
    col = mix(col, vec3(1.0), ring * 0.5);
    
    fragColor = vec4(col, 1.0);
}`,
    Common: `// Common code - shared between all passes
// Functions here are prepended to every shader

#define PI 3.14159265359
#define TAU 6.28318530718

mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}`,
    BufferA: '',
    BufferB: '',
    BufferC: '',
    BufferD: ''
};

// Debounce timer for live compilation
let compileTimeout = null;
const COMPILE_DELAY = 500; // ms after typing stops

// Reference to renderer (set via init)
let renderer = null;

/**
 * Initialize the shader manager
 */
export function init(rendererInstance) {
    renderer = rendererInstance;
    
    // Listen for code changes from editor (only when auto-compile enabled)
    events.on(EVENTS.EDITOR_CODE_CHANGED, handleCodeChange);
    
    // Listen for manual compile requests (Ctrl+S, button click)
    events.on(EVENTS.COMPILE_REQUEST, () => {
        logger.debug('ShaderManager', 'Compile', 'COMPILE_REQUEST received');
        clearTimeout(compileTimeout); // Cancel any pending auto-compile
        compileNow();
    });
    
    logger.info('ShaderManager', 'Init', 'Shader manager initialized');
}

/**
 * Handle code change from editor (only fires with auto-compile)
 */
function handleCodeChange({ tabId, code }) {
    // State is already updated by editor - just mark dirty and debounce compile
    state.shader.isDirty = true;
    events.emit(EVENTS.SHADER_DIRTY, true);
    
    // Debounced compile
    if (compileTimeout) {
        clearTimeout(compileTimeout);
    }
    compileTimeout = setTimeout(() => {
        compileNow();
    }, COMPILE_DELAY);
}

/**
 * Compile shader immediately (all passes)
 */
export function compileNow() {
    if (!renderer) {
        logger.warn('ShaderManager', 'Compile', 'No renderer available');
        return false;
    }
    
    // Build code map from state (single source of truth)
    const codeMap = {};
    const code = state.shader.code || {};
    
    // Always include Image
    codeMap.Image = code.Image || '';
    
    // Include Common if present
    if (code.Common?.trim()) {
        codeMap.Common = code.Common;
    }
    
    // Include buffers that have code
    const bufferIds = ['BufferA', 'BufferB', 'BufferC', 'BufferD', 'BufferE', 'BufferF'];
    for (const bufferId of bufferIds) {
        if (code[bufferId]?.trim()) {
            codeMap[bufferId] = code[bufferId];
        }
    }
    
    // Count active passes for logging
    const passCount = Object.keys(codeMap).filter(k => k !== 'Common' && codeMap[k]?.trim()).length;
    
    if (!codeMap.Image?.trim()) {
        logger.warn('ShaderManager', 'Compile', 'No Image code to compile');
        return false;
    }
    
    logger.info('ShaderManager', 'Compile', `Compiling ${passCount} pass(es)...`);
    
    // Use multipass compilation
    const result = renderer.compileAll(codeMap);
    
    if (result.success) {
        state.shader.isDirty = false;
        events.emit(EVENTS.SHADER_DIRTY, false);
        logger.success('ShaderManager', 'Compile', `✓ Compiled ${passCount} pass(es)`);
    }
    
    return result.success;
}

/**
 * Load shader code into manager and editor
 */
export function loadShader(shaderData) {
    // Ensure state.shader.code exists
    if (!state.shader.code) state.shader.code = {};
    
    // Update state (single source of truth)
    Object.entries(shaderData.code || {}).forEach(([tabId, code]) => {
        state.shader.code[tabId] = code;
    });
    
    // Update metadata
    if (shaderData.title) state.shader.title = shaderData.title;
    if (shaderData.id) state.shader.id = shaderData.id;
    
    state.shader.isDirty = false;
    
    events.emit(EVENTS.SHADER_LOADED, shaderData);
    logger.info('ShaderManager', 'Load', `Loaded: ${shaderData.title || 'Untitled'}`);
    
    // Compile immediately
    compileNow();
}

/**
 * Load shader from file
 */
export async function loadShaderFromFile(url) {
    try {
        logger.info('ShaderManager', 'Load', `Loading from ${url}...`);
        const response = await fetch(url);
        const code = await response.text();
        
        loadShader({
            title: url.split('/').pop().replace('.glsl', ''),
            code: { Image: code }
        });
        
        return true;
    } catch (err) {
        logger.error('ShaderManager', 'Load', `Failed to load: ${err.message}`);
        return false;
    }
}

/**
 * Get current code for a tab
 */
export function getCode(tabId = 'Image') {
    return state.shader.code?.[tabId] || '';
}

/**
 * Set code for a tab (from external source)
 */
export function setCode(tabId, code, compile = true) {
    if (!state.shader.code) state.shader.code = {};
    state.shader.code[tabId] = code;
    state.shader.isDirty = true;
    
    events.emit(EVENTS.SHADER_CODE_SET, { tabId, code });
    
    if (compile) {
        compileNow();
    }
}

/**
 * Create new shader with defaults
 */
export function createNew() {
    loadShader({
        title: 'New Shader',
        code: { ...DEFAULT_SHADER_CODE }
    });
}

/**
 * Ensure state.shader.code has default values
 * Called BEFORE UI initialization to ensure editor has content
 */
export function ensureDefaults() {
    if (!state.shader.code) {
        state.shader.code = {};
    }
    
    // Only set defaults for tabs that don't have content
    Object.entries(DEFAULT_SHADER_CODE).forEach(([tabId, code]) => {
        if (!state.shader.code[tabId]) {
            state.shader.code[tabId] = code;
        }
    });
    
    logger.debug('ShaderManager', 'Defaults', 'Default shader code ensured');
}

/**
 * Get the default code for a specific tab
 * Used by editor when creating new models
 */
export function getDefaultCode(tabId) {
    return DEFAULT_SHADER_CODE[tabId] || '';
}

/**
 * Get minimal buffer code template
 */
export function getBufferTemplate(bufferId) {
    return `// ${bufferId} - Render pass
// Output: iChannel${getBufferChannelNumber(bufferId)}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5, 1.0);
}`;
}

/**
 * Get channel number for a buffer ID
 */
function getBufferChannelNumber(bufferId) {
    const match = bufferId.match(/Buffer([A-Z])/);
    if (match) {
        return match[1].charCodeAt(0) - 64; // A=1, B=2, etc.
    }
    return 0;
}

/**
 * Add a new buffer pass
 * @param {string} [letter] - Optional specific letter (A, B, C...)
 * @returns {string} The buffer ID created (e.g., 'BufferA')
 */
export function addBuffer(letter = null) {
    // Find next available letter if not specified
    if (!letter) {
        const usedLetters = new Set();
        const code = state.shader.code || {};
        for (const key of Object.keys(code)) {
            const match = key.match(/Buffer([A-Z])/);
            if (match && code[key]?.trim()) {
                usedLetters.add(match[1]);
            }
        }
        
        for (let i = 0; i < 26; i++) {
            const l = String.fromCharCode(65 + i);
            if (!usedLetters.has(l)) {
                letter = l;
                break;
            }
        }
    }
    
    if (!letter) {
        logger.warn('ShaderManager', 'Buffer', 'No available buffer slots');
        return null;
    }
    
    const bufferId = `Buffer${letter}`;
    
    // Initialize code for this buffer
    if (!state.shader.code) state.shader.code = {};
    state.shader.code[bufferId] = getBufferTemplate(bufferId);
    
    // Add to active tabs if not present
    if (!state.shader.activeTabs.includes(bufferId)) {
        state.shader.activeTabs.push(bufferId);
    }
    
    state.shader.isDirty = true;
    
    logger.info('ShaderManager', 'Buffer', `Added ${bufferId}`);
    events.emit(EVENTS.TAB_ADDED, { tabId: bufferId, type: 'buffer' });
    
    return bufferId;
}

/**
 * Add Common tab
 */
export function addCommon() {
    if (!state.shader.code) state.shader.code = {};
    
    // Only add if not already present with content
    if (!state.shader.code.Common?.trim()) {
        state.shader.code.Common = DEFAULT_SHADER_CODE.Common;
    }
    
    if (!state.shader.activeTabs.includes('Common')) {
        state.shader.activeTabs.push('Common');
    }
    
    state.shader.isDirty = true;
    
    logger.info('ShaderManager', 'Common', 'Added Common tab');
    events.emit(EVENTS.TAB_ADDED, { tabId: 'Common', type: 'common' });
    
    return 'Common';
}

/**
 * Remove a buffer pass
 */
export function removeBuffer(bufferId) {
    if (!bufferId.startsWith('Buffer')) {
        logger.warn('ShaderManager', 'Buffer', `Cannot remove: ${bufferId}`);
        return false;
    }
    
    // Clear code
    if (state.shader.code) {
        state.shader.code[bufferId] = '';
    }
    
    // Remove from active tabs
    const idx = state.shader.activeTabs.indexOf(bufferId);
    if (idx !== -1) {
        state.shader.activeTabs.splice(idx, 1);
    }
    
    state.shader.isDirty = true;
    
    logger.info('ShaderManager', 'Buffer', `Removed ${bufferId}`);
    events.emit(EVENTS.TAB_REMOVED, { tabId: bufferId });
    
    return true;
}

/**
 * Get list of active passes (for UI)
 */
export function getActivePasses() {
    const code = state.shader.code || {};
    const passes = [];
    
    // Image is always first
    passes.push({ id: 'Image', label: 'Image', channel: 0, type: 'main' });
    
    // Buffers in order
    const bufferIds = ['BufferA', 'BufferB', 'BufferC', 'BufferD', 'BufferE', 'BufferF'];
    let channelNum = 1;
    for (const bufferId of bufferIds) {
        if (code[bufferId]?.trim()) {
            passes.push({
                id: bufferId,
                label: bufferId.replace('Buffer', 'Buf '),
                channel: channelNum++,
                type: 'buffer'
            });
        }
    }
    
    return passes;
}

export const shaderManager = {
    init,
    compileNow,
    loadShader,
    loadShaderFromFile,
    getCode,
    setCode,
    createNew,
    ensureDefaults,
    getDefaultCode,
    getBufferTemplate,
    addBuffer,
    addCommon,
    removeBuffer,
    getActivePasses
};

export default shaderManager;
