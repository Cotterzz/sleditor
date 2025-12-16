// ============================================================================
// EXAMPLES AND TEMPLATES
// External file to keep main HTML clean
// ============================================================================

import { CONFIG, DERIVED, state } from './core.js';
import { getThumbnailUrl } from './backend.js';

export function getBoilerplate() {
    return `// ============================================================================
// AUTO-GENERATED BOILERPLATE
// This section is read-only and updates when settings change
// ============================================================================

const SAMPLE_RATE = ${DERIVED.sampleRate}f;
const SAMPLES_PER_BLOCK = ${DERIVED.samplesPerBlock};
const COMPUTE_THREADS = ${CONFIG.computeThreads};
const SCREEN_WIDTH = ${Math.floor(state.canvasWidth / state.pixelScale)};
const SCREEN_HEIGHT = ${Math.floor(state.canvasHeight / state.pixelScale)};
const SCREEN_SIZE = ${CONFIG.screenSize};  // Kept for backward compatibility
const PI = 3.1415926535897932f;
const TAU = 6.283185307179586f;

struct Uniforms {
    time: f32,              // 0  - auto-set
    audioCurrentTime: f32,  // 1  - auto-set
    audioPlayTime: f32,     // 2  - auto-set
    audioFractTime: f32,    // 3  - auto-set
    audioFrame: i32,        // 4  - auto-set
    mouseX: f32,            // 5  - auto-set
    mouseY: f32,            // 6  - auto-set
    
    // Custom uniforms (set via api.uniforms.setCustomFloat(slot, value))
    custom0: f32,           // 7  - api.uniforms.setCustomFloat(0, ...)
    custom1: f32,           // 8  - api.uniforms.setCustomFloat(1, ...)
    custom2: f32,           // 9  - api.uniforms.setCustomFloat(2, ...)
    custom3: f32,           // 10 - api.uniforms.setCustomFloat(3, ...)
    custom4: f32,           // 11 - api.uniforms.setCustomFloat(4, ...)
    custom5: f32,           // 12 - api.uniforms.setCustomFloat(5, ...)
    custom6: f32,           // 13 - api.uniforms.setCustomFloat(6, ...)
    custom7: f32,           // 14 - api.uniforms.setCustomFloat(7, ...)
    custom8: f32,           // 15 - api.uniforms.setCustomFloat(8, ...)
    custom9: f32,           // 16 - api.uniforms.setCustomFloat(9, ...)
    custom10: f32,          // 17 - api.uniforms.setCustomFloat(10, ...)
    custom11: f32,          // 18 - api.uniforms.setCustomFloat(11, ...)
    custom12: f32,          // 19 - api.uniforms.setCustomFloat(12, ...)
    custom13: f32,          // 20 - api.uniforms.setCustomFloat(13, ...)
    custom14: f32,          // 21 - api.uniforms.setCustomFloat(14, ...)
    
    // Integer custom uniforms
    customInt0: i32,        // 22 - api.uniforms.setCustomInt(0, ...)
    customInt1: i32,        // 23 - api.uniforms.setCustomInt(1, ...)
    customInt2: i32,        // 24 - api.uniforms.setCustomInt(2, ...)
    
    // Boolean custom uniforms (0 = false, 1 = true)
    customBool0: i32,       // 25 - api.uniforms.setCustomBool(0, ...)
    customBool1: i32,       // 26 - api.uniforms.setCustomBool(1, ...)
}

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@binding(1) @group(0) var<storage, read_write> computeBuffer: array<f32>;
@binding(2) @group(0) var<storage, read_write> audioBuffer: array<f32>;
@binding(3) @group(0) var screenTexture: texture_storage_2d<rgba16float, write>;
@binding(4) @group(0) var<storage, read_write> phaseState: array<f32>;
`;
}


// Minimal starter code for when user adds a new tab
export const MINIMAL_JS = `function init() {
    // populate state object with values
    return {
        // parameter: 440,
    };
}

function enterframe(state, api) {
    // modify state values each frame
    //state.parameter += 1;

    // Send message object to AudioWorklet:
    //api.audio.send({ frequency: state.parameter });

    // Set shader uniforms - works for all shaders
    //api.uniforms.setCustomFloat(0, state.parameter);
}`;

export const MINIMAL_AUDIO_GLSL = `
// This should work the same as exising shadertoy audio shaders.
//   samp = absolute sample index
//   time = time in seconds
//   iSampleRate = sample rate uniform (e.g. 48000.0)

vec2 mainSound(int samp, float time) {
    float freq = 440.0;
    
    // Use samp for phase (works forever, no precision loss)
    float phase = fract(float(samp) * freq / iSampleRate);
    float wave = sin(6.2831 * phase);
    
    // Envelope uses time (OK for slow changes)
    float envelope = exp(-0.5 * time);
    
    return vec2(wave * envelope * 0.5);
}

// IMPORTANT: For oscillators, use samp to avoid float precision issues:
//   float phase = fract(float(samp) * freq / iSampleRate);
//   float wave = sin(6.2831 * phase);
//   return vec2(wave);
// DO NOT USE:
//   float wave = sin(6.2831 * freq * time)
// This will degrade very quickly
// ~40 seconds on intel GPU, maybe a few minutes on Nvidia
// To test: add an offset to time, eg 600.0
`;

export const MINIMAL_AUDIO_GPU = `// Simple sine wave (GPU)
@compute @workgroup_size(128, 1, 1)
fn audio_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sampleIndex = i32(gid.x);
    if (sampleIndex >= SAMPLES_PER_BLOCK) { return; }
    
    let t = f32(sampleIndex) / SAMPLE_RATE;
    let sample = sin(t * 440.0 * TAU) * 0.3;
    
    audioBuffer[sampleIndex] = sample;
    audioBuffer[SAMPLES_PER_BLOCK + sampleIndex] = sample;
}`;

export const MINIMAL_AUDIO_WORKLET = `// Simple sine wave (AudioWorklet)
// Define your audio processor methods in this object

const audioProcessor = {
    init() {
        // Initialize your audio processor
        this.phase = [0, 0]; // Separate phase for left and right channels
        this.frequency = 440;
    },
    
    userProcess(output, inputs, parameters) {
        // Generate audio samples
        // output[channel][sample] = value (range: -1 to 1)
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            
            for (let i = 0; i < outputChannel.length; i++) {
                // Generate sine wave
                outputChannel[i] = Math.sin(this.phase[channel]) * 0.3;
                
                // Increment phase
                this.phase[channel] += (this.frequency * Math.PI * 2) / sampleRate;
                if (this.phase[channel] > Math.PI * 2) {
                    this.phase[channel] -= Math.PI * 2;
                }
            }
        }
    },
    
    receiveMessage(data) {
        // Handle messages from main thread
        // Example: if (data.frequency) this.frequency = data.frequency;
    }
};`;

export const MINIMAL_GLSL = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

out vec4 fragColor;

void main() {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = gl_FragCoord.xy / u_resolution;
    
    // Time-varying color gradient
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(u_time));
    
    // Output to screen
    fragColor = vec4(col, 1.0);
}`;

export const MINIMAL_GLSL_REGULAR = `// Boilerplate mode - just write your main() function!
// All uniforms and constants are already defined for you.

void main() {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = gl_FragCoord.xy / u_resolution;
    
    // Time-varying color gradient
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(u_time));
    
    // Output to screen
    fragColor = vec4(col, 1.0);
}`;

export const MINIMAL_GLSL_STOY = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord / iResolution.xy;
    
    // Time-varying color gradient
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(iTime));
    
    // Output to screen
    fragColor = vec4(col, 1.0);
}`;

export const MINIMAL_GLSL_GOLF = `// Macros: M=main T=time R=resolution U=fragCoord O=fragColor F=float I=int
// V2=vec2 V=vec3 V3=vec3 V4=vec4 D=dot S=sin C=cos H=tanh N=normalize L=length
// A=abs X=mix Y=min Z=max M2=mat2 M3=mat3 M4=mat4 W=for J=ceil K=round P=floor Q=fract
M{V2 u=U.xy/R;O=V4(u,S(T),1.);}`;

export const MINIMAL_WGSL = `// Simple WGSL graphics shader
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    // Get pixel coordinates
    let coord = vec2<i32>(i32(gid.x), i32(gid.y));
    
    // Check bounds
    if (coord.x >= SCREEN_WIDTH || coord.y >= SCREEN_HEIGHT) {
        return;
    }
    
    // Normalized coordinates (0.0 to 1.0)
    let uv = vec2<f32>(f32(coord.x), f32(coord.y)) / vec2<f32>(f32(SCREEN_WIDTH), f32(SCREEN_HEIGHT));
    
    // Simple gradient
    let color = vec4<f32>(uv.x, uv.y, 0.5, 1.0);
    
    // Write to screen
    textureStore(screenTexture, coord, color);
}`;


// ============================================================================
// EXAMPLES LIBRARY
// ============================================================================

// Note: Built-in EXAMPLES were removed - all examples are now in the database.
// This file only contains template code (boilerplate, minimal examples, default JS).

