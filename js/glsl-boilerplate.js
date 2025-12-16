// ============================================================================
// GLSL Boilerplate System
// ============================================================================
// Provides boilerplate code injection for different GLSL tab types:
// - Regular: Standard boilerplate with all built-in uniforms
// - S-Toy: Shadertoy compatibility layer (future)
// - Golf: Code golf compact macros (future)

import { TAB_CONFIG } from './tab-config.js';

// ============================================================================
// Uniform Counts
// ============================================================================
const CUSTOM_FLOAT_COUNT = 85;
const CUSTOM_INT_COUNT = 10;
const CUSTOM_BOOL_COUNT = 5;

// ============================================================================
// Generate Custom Uniform Declarations
// ============================================================================
function generateCustomUniforms() {
    let uniforms = '';
    
    // Float uniforms
    for (let i = 0; i < CUSTOM_FLOAT_COUNT; i++) {
        uniforms += `uniform float u_custom${i};\n`;
    }
    
    // Int uniforms
    for (let i = 0; i < CUSTOM_INT_COUNT; i++) {
        uniforms += `uniform int u_customInt${i};\n`;
    }
    
    // Bool uniforms (stored as int, 0/1)
    for (let i = 0; i < CUSTOM_BOOL_COUNT; i++) {
        uniforms += `uniform int u_customBool${i};\n`;
    }
    
    return uniforms;
}

const CUSTOM_UNIFORMS = generateCustomUniforms();

// ============================================================================
// Boilerplate Templates
// ============================================================================

export const REGULAR_BOILERPLATE = `#version 300 es
precision highp float;

// === Built-in Uniforms (automatically set each frame) ===
uniform float u_time;        // Seconds since start
uniform vec2 u_resolution;   // Canvas width, height in pixels
uniform vec2 u_mouse;        // Drag/last mouse-down position (pixels)
uniform vec2 u_click;        // Click origin (Shadertoy style, pixels w/ sign)
uniform vec2 u_hover;        // Current hover position (pixels)
uniform int u_frame;         // Frame counter
uniform float u_pixel;       // Pixel scale (1.0 = native)
uniform vec4 u_date;         // year-1, month-1, day, seconds since midnight

// === Custom Uniforms (set from JavaScript or Uniform Panel) ===
// Float: api.uniforms.setCustomFloat(0-${CUSTOM_FLOAT_COUNT - 1}, value)
// Int: api.uniforms.setCustomInt(0-${CUSTOM_INT_COUNT - 1}, value)
// Bool: u_customBool0-${CUSTOM_BOOL_COUNT - 1} (0 or 1)
${CUSTOM_UNIFORMS}
// === Math Constants ===
#define PI 3.1415926535897932
#define TAU 6.283185307179586
#define PHI 1.618033988749895

// === Output ===
out vec4 fragColor;

`;

export const STOY_BOILERPLATE = `#version 300 es
precision highp float;

// === SLEditor Native Uniforms (hidden from user) ===
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_click;
uniform vec2 u_hover;
uniform int u_frame;
uniform float u_pixel;
uniform vec4 u_date;
${CUSTOM_UNIFORMS}
// === Shadertoy Compatibility Layer ===
#define iTime u_time
#define iTimeDelta (1.0 / 60.0)
#define iFrame u_frame
#define iResolution vec3(u_resolution, u_pixel)
#define iMouse vec4(u_mouse, u_click)
#define iDate u_date
#define iSampleRate 48000.0

// === Output ===
out vec4 fragColor;

// User's mainImage function (defined below by user code)
void mainImage(out vec4 fragColor, in vec2 fragCoord);

// Wrapper that calls user's mainImage
void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}

`;

export const GOLF_BOILERPLATE = `#version 300 es
precision highp float;

// === Native Uniforms ===
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_click;
uniform vec2 u_hover;
uniform int u_frame;
uniform float u_pixel;
uniform vec4 u_date;
${CUSTOM_UNIFORMS}
// === Ultra-Compact Macros for Code Golf ===
#define M void main()
#define T u_time
#define R u_resolution
#define U gl_FragCoord
#define F float
#define I int
#define V2 vec2
#define V vec3
#define V3 vec3
#define V4 vec4
#define O fragColor
#define D dot
#define S sin
#define C cos
#define H tanh
#define N normalize
#define L length
#define A abs
#define X mix
#define Y min
#define Z max
#define M2 mat2
#define M3 mat3
#define M4 mat4
#define W for
#define J ceil
#define K round
#define P floor
#define Q fract

// === Output ===
out V4 O;

`;

// ============================================================================
// Boilerplate Selection
// ============================================================================

/**
 * Get the appropriate boilerplate code for a given tab type
 * @param {string} tabName - The internal tab name (e.g., 'glsl_regular')
 * @returns {string} - The boilerplate code to inject, or empty string if none
 */
export function getBoilerplateForTab(tabName) {
    const config = TAB_CONFIG[tabName];
    if (!config?.boilerplate) return '';
    
    switch (config.boilerplate) {
        case 'regular':
            return REGULAR_BOILERPLATE;
        case 'stoy':
            return STOY_BOILERPLATE;
        case 'golf':
            return GOLF_BOILERPLATE;
        default:
            return '';
    }
}

/**
 * Get the number of lines in the boilerplate for a given tab type
 * Used to adjust error line numbers back to user code
 * @param {string} tabName - The internal tab name
 * @returns {number} - Number of lines in the boilerplate
 */
export function getBoilerplateLineCount(tabName) {
    const boilerplate = getBoilerplateForTab(tabName);
    return boilerplate ? boilerplate.split('\n').length : 0;
}

/**
 * Check if a tab type uses boilerplate injection
 * @param {string} tabName - The internal tab name
 * @returns {boolean} - True if this tab type injects boilerplate
 */
export function tabUsesBoilerplate(tabName) {
    const config = TAB_CONFIG[tabName];
    return !!config?.boilerplate;
}

// Export counts for other modules
export { CUSTOM_FLOAT_COUNT, CUSTOM_INT_COUNT, CUSTOM_BOOL_COUNT };
