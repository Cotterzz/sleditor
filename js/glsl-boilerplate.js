// ============================================================================
// GLSL Boilerplate System
// ============================================================================
// Provides boilerplate code injection for different GLSL tab types:
// - Regular: Standard boilerplate with all built-in uniforms
// - S-Toy: Shadertoy compatibility layer (future)
// - Golf: Code golf compact macros (future)

import { TAB_CONFIG } from './tab-config.js';

// ============================================================================
// Boilerplate Templates
// ============================================================================

export const REGULAR_BOILERPLATE = `#version 300 es
precision highp float;

// === Built-in Uniforms (automatically set each frame) ===
uniform float u_time;        // Seconds since start
uniform vec2 u_resolution;   // Canvas width, height in pixels
uniform vec2 u_mouse;        // Mouse position (normalized 0.0-1.0)
uniform int u_frame;         // Frame counter

// === Custom Uniforms (set from JavaScript) ===
// Use api.uniforms.setCustomFloat(slot, value) in JS tab
uniform float u_custom0;
uniform float u_custom1;
uniform float u_custom2;
uniform float u_custom3;
uniform float u_custom4;
uniform float u_custom5;
uniform float u_custom6;
uniform float u_custom7;
uniform float u_custom8;
uniform float u_custom9;
uniform float u_custom10;
uniform float u_custom11;
uniform float u_custom12;
uniform float u_custom13;
uniform float u_custom14;

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
uniform int u_frame;
uniform float u_custom0;
uniform float u_custom1;
uniform float u_custom2;
uniform float u_custom3;
uniform float u_custom4;
uniform float u_custom5;
uniform float u_custom6;
uniform float u_custom7;
uniform float u_custom8;
uniform float u_custom9;
uniform float u_custom10;
uniform float u_custom11;
uniform float u_custom12;
uniform float u_custom13;
uniform float u_custom14;

// === Shadertoy Compatibility Layer ===
#define iTime u_time
#define iTimeDelta (1.0 / 60.0)
#define iFrame u_frame
#define iResolution vec3(u_resolution, 1.0)
#define iMouse (u_mouse.xyxy*u_resolution.xyxy)

// Placeholder values for unsupported Shadertoy features
#define iDate vec4(0.0)
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
uniform int u_frame;

// === Ultra-Compact Macros for Code Golf ===
#define M void main()
#define T u_time
#define R u_resolution
#define U gl_FragCoord
#define F float
#define I int
#define V2 vec2
#define V3 vec3
#define V4 vec4
#define O fragColor

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

