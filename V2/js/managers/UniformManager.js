/**
 * UniformManager - Detects and manages custom shader uniforms
 * 
 * Parses shader code to find uniform declarations, creates appropriate
 * default values, and syncs values with the renderer.
 * 
 * Follows the Manager pattern (Pillar 3)
 */

import { logger } from '../core/logger.js';
import { events, EVENTS } from '../core/events.js';

// Built-in Shadertoy uniforms (excluded from custom uniform detection)
const BUILTIN_UNIFORMS = new Set([
    'iResolution',
    'iTime',
    'iTimeDelta',
    'iFrame',
    'iMouse',
    'iDate',
    'iSampleRate',
    'iChannelTime',
    'iChannelResolution',
    'iChannel0',
    'iChannel1',
    'iChannel2',
    'iChannel3',
]);

// GLSL type info for parsing and defaults
const TYPE_INFO = {
    'float': { components: 1, default: 0.5, min: 0, max: 1, step: 0.01 },
    'int': { components: 1, default: 0, min: 0, max: 100, step: 1 },
    'bool': { components: 1, default: false },
    'vec2': { components: 2, default: [0.5, 0.5], min: 0, max: 1, step: 0.01 },
    'vec3': { components: 3, default: [0.5, 0.5, 0.5], min: 0, max: 1, step: 0.01 },
    'vec4': { components: 4, default: [0.5, 0.5, 0.5, 1.0], min: 0, max: 1, step: 0.01 },
    'ivec2': { components: 2, default: [0, 0], min: 0, max: 100, step: 1 },
    'ivec3': { components: 3, default: [0, 0, 0], min: 0, max: 100, step: 1 },
    'ivec4': { components: 4, default: [0, 0, 0, 0], min: 0, max: 100, step: 1 },
    'mat2': { components: 4, default: [1, 0, 0, 1] },
    'mat3': { components: 9, default: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
    'mat4': { components: 16, default: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
};

// Current uniform values
const uniformValues = new Map();

// Detected uniforms from last parse
let detectedUniforms = [];

// Reference to renderer (set via init)
let renderer = null;

/**
 * Parse shader code to extract uniform declarations
 * @param {string} code - GLSL shader code
 * @returns {Array} Array of uniform objects { name, type, isColor, range, step }
 */
export function parseUniforms(code) {
    const uniforms = [];
    
    // Match uniform declarations: uniform <type> <name>;
    // Also capture optional comment hints on same line
    const uniformRegex = /uniform\s+(\w+)\s+(\w+)\s*;(?:\s*\/\/\s*(.*))?/g;
    let match;
    
    while ((match = uniformRegex.exec(code)) !== null) {
        const type = match[1];
        const name = match[2];
        const comment = match[3] || '';
        
        // Skip built-in uniforms
        if (BUILTIN_UNIFORMS.has(name)) continue;
        
        // Skip unsupported types (samplers, etc.)
        if (!TYPE_INFO[type]) continue;
        
        const typeInfo = TYPE_INFO[type];
        const uniform = {
            name,
            type,
            components: typeInfo.components,
            isColor: false,
            min: typeInfo.min,
            max: typeInfo.max,
            step: typeInfo.step,
        };
        
        // Parse comment hints
        // Examples: "// color", "// range: 0.0, 10.0", "// range: 0, 100, step: 5"
        if (comment) {
            const lowerComment = comment.toLowerCase();
            
            // Check for color hint
            if (lowerComment.includes('color') || lowerComment.includes('colour')) {
                uniform.isColor = true;
            }
            
            // Check for range hint: "range: min, max" or "range: min, max, step: value"
            const rangeMatch = comment.match(/range:\s*([\d.-]+)\s*,\s*([\d.-]+)/i);
            if (rangeMatch) {
                uniform.min = parseFloat(rangeMatch[1]);
                uniform.max = parseFloat(rangeMatch[2]);
            }
            
            // Check for step hint
            const stepMatch = comment.match(/step:\s*([\d.-]+)/i);
            if (stepMatch) {
                uniform.step = parseFloat(stepMatch[1]);
            }
        }
        
        // Auto-detect color for vec3/vec4 with color-like names
        if ((type === 'vec3' || type === 'vec4') && !uniform.isColor) {
            const colorNames = ['color', 'colour', 'tint', 'rgb', 'rgba', 'albedo', 'diffuse', 'ambient', 'specular'];
            if (colorNames.some(c => name.toLowerCase().includes(c))) {
                uniform.isColor = true;
            }
        }
        
        uniforms.push(uniform);
    }
    
    return uniforms;
}

/**
 * Initialize uniform values with defaults
 * @param {Array} uniforms - Array of uniform objects from parseUniforms
 */
function initializeDefaults(uniforms) {
    for (const uniform of uniforms) {
        // Don't overwrite existing values (preserve user changes across recompiles)
        if (!uniformValues.has(uniform.name)) {
            const typeInfo = TYPE_INFO[uniform.type];
            if (typeInfo) {
                // Clone default to avoid reference issues
                const defaultValue = Array.isArray(typeInfo.default) 
                    ? [...typeInfo.default] 
                    : typeInfo.default;
                uniformValues.set(uniform.name, defaultValue);
            }
        }
    }
    
    // Remove uniforms that no longer exist in code
    for (const name of uniformValues.keys()) {
        if (!uniforms.find(u => u.name === name)) {
            uniformValues.delete(name);
        }
    }
}

/**
 * Get current value of a uniform
 * @param {string} name - Uniform name
 * @returns {*} Current value or undefined
 */
export function get(name) {
    return uniformValues.get(name);
}

/**
 * Set value of a uniform
 * @param {string} name - Uniform name
 * @param {*} value - New value
 */
export function set(name, value) {
    const oldValue = uniformValues.get(name);
    uniformValues.set(name, value);
    
    // Sync with renderer if available
    if (renderer && renderer.setUniform) {
        renderer.setUniform(name, value);
    }
    
    // Emit change event
    events.emit(EVENTS.UNIFORM_CHANGED, { name, value, oldValue });
}

/**
 * Get all current uniform values
 * @returns {Object} Object with uniform names as keys
 */
export function getAll() {
    const result = {};
    for (const [name, value] of uniformValues) {
        result[name] = value;
    }
    return result;
}

/**
 * Get list of detected uniforms (from last parse)
 * @returns {Array} Array of uniform objects
 */
export function getDetectedUniforms() {
    return [...detectedUniforms];
}

/**
 * Sync all uniform values to renderer
 */
export function syncWithRenderer() {
    if (!renderer || !renderer.setUniform) return;
    
    for (const [name, value] of uniformValues) {
        renderer.setUniform(name, value);
    }
}

/**
 * Initialize the uniform manager
 * @param {Object} rendererInstance - WebGL renderer
 */
export function init(rendererInstance) {
    renderer = rendererInstance;
    
    // Listen for compile success to parse uniforms
    events.on(EVENTS.COMPILE_SUCCESS, async () => {
        // Get the current shader code from state (dynamic import to avoid circular deps)
        const { state } = await import('../core/state.js');
        const shaderCode = state.shader?.code || {};
        
        // Collect all code sources to parse: Common, Image, and all buffers
        const codeSources = [];
        
        // Common is most important - uniforms there are shared across all passes
        if (shaderCode.Common?.trim()) {
            codeSources.push(shaderCode.Common);
        }
        
        // Get code from all passes defined in state.project.code
        for (const codeEl of state.project.code) {
            const passId = codeEl.id;
            if (shaderCode[passId]?.trim()) {
                codeSources.push(shaderCode[passId]);
            }
        }
        
        // Parse uniforms from all code sources, deduplicating by name
        const uniformMap = new Map();
        for (const code of codeSources) {
            const uniforms = parseUniforms(code);
            for (const uniform of uniforms) {
                // First declaration wins (Common takes precedence)
                if (!uniformMap.has(uniform.name)) {
                    uniformMap.set(uniform.name, uniform);
                }
            }
        }
        
        detectedUniforms = Array.from(uniformMap.values());
        initializeDefaults(detectedUniforms);
        
        // Sync values to renderer
        syncWithRenderer();
        
        // Emit event for UI to update
        events.emit(EVENTS.UNIFORMS_DETECTED, { uniforms: detectedUniforms });
        
        logger.debug('UniformManager', 'Parse', `Detected ${detectedUniforms.length} custom uniforms`);
    });
    
    logger.info('UniformManager', 'Init', 'Uniform manager initialized');
}

/**
 * Reset all uniforms to defaults
 */
export function resetToDefaults() {
    for (const uniform of detectedUniforms) {
        const typeInfo = TYPE_INFO[uniform.type];
        if (typeInfo) {
            const defaultValue = Array.isArray(typeInfo.default) 
                ? [...typeInfo.default] 
                : typeInfo.default;
            set(uniform.name, defaultValue);
        }
    }
}

export const uniformManager = {
    init,
    parseUniforms,
    get,
    set,
    getAll,
    getDetectedUniforms,
    syncWithRenderer,
    resetToDefaults,
};

export default uniformManager;
