// ============================================================================
// EXAMPLES AND TEMPLATES
// External file to keep main HTML clean
// ============================================================================

import { CONFIG, DERIVED, state } from './core.js';
import { getThumbnailUrl } from './backend.js';

// Load help content from external file
export async function getHelpContent() {
    try {
        const response = await fetch('content/help.txt');
        if (!response.ok) throw new Error('Help file not found');
        return await response.text();
    } catch (err) {
        console.error('Failed to load help content:', err);
        return 'Help content failed to load. Check console for errors.';
    }
}

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
}

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@binding(1) @group(0) var<storage, read_write> computeBuffer: array<f32>;
@binding(2) @group(0) var<storage, read_write> audioBuffer: array<f32>;
@binding(3) @group(0) var screenTexture: texture_storage_2d<bgra8unorm, write>;
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
// Your code is wrapped in an AudioWorkletProcessor class

init() {
    // Initialize your audio processor
    this.phase = [0, 0]; // Separate phase for left and right channels
    this.frequency = 440;
}

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
}

receiveMessage(data) {
    // Handle messages from main thread
    // Example: if (data.frequency) this.frequency = data.frequency;
}`;


// ============================================================================
// EXAMPLES LIBRARY
// ============================================================================

export const EXAMPLES = {


    glsl_hello: {
        name: "Hello World (GLSL)",
        description: "Your first GLSL fragment shader - a simple colorful gradient",
        thumbnail: getThumbnailUrl("new.png"),
        tabs: ["glsl_fragment", "help"],
        webgpuRequired: false,
        graphics: `#version 300 es
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
}`,
        audio: null,
        js: null
    },
    
    hello_world: {
        name: "Hello World (WGSL)",
        description: "A simple gradient - perfect first shader to understand coordinates and colors",
        thumbnail: getThumbnailUrl("new.png"),
        tabs: ["graphics", "help"],
        webgpuRequired: true,
        graphics: `// Simple gradient - your first shader!
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) {
        return;
    }
    
    let uv = vec2f(gid.xy) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    let color = vec3f(uv.x, uv.y, 0.5);
    
    textureStore(screenTexture, gid.xy, vec4f(color, 1.0));
}`,
        audio: null,
        js: null
    }, 
    wgsl_gfx_audio: {
        name: "WGSL GFX & Audio",
        description: "Basic example mixing WGSL compute for texture output and WGSL compute for audio input",
        thumbnail: getThumbnailUrl("wcaudiogfx.png"),
        tabs: ["graphics", "audio"],
        webgpuRequired: true,
        graphics: `// Simple gradient - your first shader!
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) {
        return;
    }
    
    var uv = vec2f(gid.xy) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    uv.y*=3.0;
    uv.y+=-1.3+sin(uv.x*30.0)/2.0;
    let color = vec3f(uv.x, uv.y, 0.5);
    
    textureStore(screenTexture, gid.xy, vec4f(color, 1.0));
}`,
        audio: `// Simple sine wave (GPU)
@compute @workgroup_size(128, 1, 1)
fn audio_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sampleIndex = i32(gid.x);
    if (sampleIndex >= SAMPLES_PER_BLOCK) { return; }
    
    let t = f32(sampleIndex) / SAMPLE_RATE;
    let sample = sin(t * 440.0 * TAU) * 0.3;
    
    audioBuffer[sampleIndex] = sample;
    audioBuffer[SAMPLES_PER_BLOCK + sampleIndex] = sample;
}`,
        js: null
    },
    glsl_worklet: {
        name: "GLSL & Worklet",
        description: "Basic example mixing GLSL and AudioWorklet",
        thumbnail: getThumbnailUrl("audiogfx.png"),
        tabs: ["glsl_fragment", "audio"],
        webgpuRequired: false,
        graphics: `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

out vec4 fragColor;

void main() {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv.y*=3.;
    uv.y+=-1.3+sin(uv.x*30.0)/2.0;
    // Time-varying color gradient
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(u_time));
    
    // Output to screen
    fragColor = vec4(col, 1.0);
}`,
        audio: `// Simple sine wave (AudioWorklet)
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.phase = 0;
        this.frequency = 440;
        
        // Listen for parameter updates from JS
        this.port.onmessage = (e) => {
            this.receiveMessage(e.data);
            
        };
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            
            for (let i = 0; i < outputChannel.length; i++) {
                // Generate sine wave
                outputChannel[i] = Math.sin(this.phase) * 0.3;
                
                // Increment phase
                this.phase += (this.frequency * Math.PI * 2) / sampleRate;
                if (this.phase > Math.PI * 2) {
                    this.phase -= Math.PI * 2;
                }
            }
        }
        
        return true; // Keep processor alive
    }

    receiveMessage(data) {
        //if (data.frequency !== undefined) { this.frequency = e.data.frequency;}
    }

    sendMessage(data) { // this doesn't work yet, but is on sleditor todo list....
        //this.port.postMessage(data);
    }
}

registerProcessor('user-audio', AudioProcessor);`,
        js: null
    },
    grey_blob_glsl: {
        name: "Grey Blob GLSL",
        description: "Original GLSL version of the Grey Blob WGSL example",
        thumbnail: getThumbnailUrl("greyblob.png"),
        tabs: ["glsl_fragment", "help"],
        webgpuRequired: false,
        graphics: `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

out vec4 fragColor;
// by diatribes
void main() {
    vec2 u = gl_FragCoord.xy;
    vec4 o;
    float i, d, s, n,T = u_time;
    vec3 p;
    vec2 r = u_resolution;
    for(o = vec4(0); i++<1e2;
        d += s = .004+.3*abs(s),
        o += 1./s)
        for (p = vec3((u-r/2.)/r.y * d, d - 8.),
             p += .1*(cos(2.*T+dot(cos(3.*T+p+cos(.3*p)), p) *  p )),
             s = length(p) - 1.5,
             n = .01; n <.4; n += n )
                 s -= abs(dot(cos(T+p/n),sin(4.*p.yzx)*.2)) * n;
    fragColor = tanh(o/8e3);
}`,
        audio: null,
        js: null
    },
    grey_blob: {
        name: "Grey Blob WGSL",
        description: "Imported GLSL raymarching shader with mesmerizing organic motion",
        thumbnail: getThumbnailUrl("greyblob.png"),
        tabs: ["graphics", "help"],
        webgpuRequired: true,
        graphics: `
//port of the glsl shader by diatribes

@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) { return; }
    let u = vec2f(gid.xy);
    let r = vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    let T = uniforms.time;
    
    var o = vec4f(0.0);
    var d = 0.0;
    var s = 0.0;
    var p = vec3f(0.0);
    // Main ray marching loop
    for (var i = 0.0; i < 100.0; i += 1.0) {
        // Calculate p for this iteration
        p = vec3f((u - r / 2.0) / r.y * d, d - 8.0);
        p += 0.1 * (cos(2.0 * T + dot(cos(3.0 * T + p + cos(0.3 * p)), p) * p)); 
        // Calculate s (distance field)
        s = length(p) - 1.5;
        // Detail loop
        var n = 0.01;
        while (n < 0.4) {
            s -= abs(dot(cos(T + p / n), sin(4.0 * p.yzx) * 0.2)) * n;
            n += n;
        }
        // Update d and accumulate color
        d += 0.004 + 0.3 * abs(s);
        o += 1.0 / (0.004 + 0.3 * abs(s));
    }
    // Apply tone mapping
    o = tanh(o / 8000.0);
    textureStore(screenTexture, gid.xy, o);
}`,
        audio: null,
        js: null
    },

    
    animated_pattern: {
        name: "Light Arc WGSL",
        description: "Time-based animation originally written for compute.toys",
        thumbnail: getThumbnailUrl("arc.png"),
        tabs: ["graphics"],
        webgpuRequired: true,
        graphics: `@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Viewport resolution (in pixels)
    let screen_size = vec2f(SCREEN_WIDTH,SCREEN_HEIGHT);
    // Prevent overdraw for workgroups on the edge of the viewport
    if (id.x >= u32(screen_size.x) || id.y >= u32(screen_size.y)) { return; }
    // Pixel coordinates (centre of pixel, origin at bottom left)
    let fragCoord = vec2f(f32(id.x) + .5, screen_size.y - f32(id.y) - .5);
    // Normalised pixel coordinates (from 0 to 1)
    let uv = fragCoord / vec2f(screen_size);
    // Time varying pixel colour
    var col = vec3f(1.0-uv.y);
    var pos = vec2i(i32(id.x),i32(screen_size.y/2));
    var dify = vec2i(0,0);
    var roty = f32(uv.y*150.0);
    dify.y = i32(sin(roty)*uv.y*150.0*uv.y*uv.y);
    dify.x = i32(cos(roty)*uv.y*150.0*uv.y*uv.y);
    var rol = sin(uniforms.time);
    var difa = vec2i(0,0);
    var difb = vec2i(0,0);
    var difc = vec2i(0,0);
    var difd = vec2i(0,0);
    var amp = f32(11.0*sin(uv.x*3.1415926535));
    var cent = f32(uv.x-0.5)+sin(uniforms.time/4)/4;
    var rota = f32(sin(cent*17.0*sin(uniforms.time*20.0/180.0)));
    var rotb = f32(sin(cent*70.0*sin(uniforms.time*50.0/100.0)));
    var rotc = f32(sin(cent*270.0*sin(uniforms.time*200.0/50.0)));
    var rotd = f32(sin(cent*550.0*sin(uniforms.time*600.0/130.0)));
    difa.y = i32(cos(rota)*amp*2);
    difa.x = i32(sin(rota)*amp*2);
    difb.y = i32(sin(rotb)*amp);
    difb.x = i32(cos(rotb)*amp);
    difc.y = i32(sin(rotc)*amp/2);
    difc.x = i32(cos(rotc)*amp/2);
    difd.y = i32(sin(rotd)*amp/3);
    difd.x = i32(cos(rotd)*amp/3);
    col.r += rota/5.;
    col.g += rotb/5.;
    col.b += rotc/5.;
    var dife = difa*difb*difc*difd;
    pos += difa;
    pos += difb;
    pos += difc;
    pos += dife/i32(386.0);
    pos += dify;
    col=col*col*1.7*((amp)/20);
    col = col * (col.r+col.g+col.b) * (col.r+col.g+col.b);
    textureStore(screenTexture, vec2u(pos), vec4f(col, 1.));
}`,
        audio: null,
        js: null
    },
    
    mouse_interactive: {
        name: "Pattern with Mouse WGSL",
        description: "Uses built-in mouse uniforms",
        thumbnail: getThumbnailUrl("animatedpattern.png"),
        tabs: ["graphics", "js"],
        webgpuRequired: true,
        graphics: `// Animated pattern using time & mouse
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) {
        return;
    }
    
    var uv = vec2f(gid.xy) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    let mouse = vec2f(uniforms.mouseX, -uniforms.mouseY);
    let t = uniforms.time;
    uv -= mouse+vec2f(-0.5, 0.5);
    // Rotating pattern
    let angle = atan2(uv.y - 0.5, uv.x - 0.5);
    let radius = length(uv - 0.5);
    let pattern = sin(angle * 5.0 + t) * cos(radius * 20.0 - t * 2.0);
    
    let color = vec3f(
        pattern * 0.5 + 0.5,
        sin(t * 0.5) * 0.5 + 0.5,
        cos(t * 0.3) * 0.5 + 0.5
    );
    
    textureStore(screenTexture, gid.xy, vec4f(color, 1.0));
}`,
        audio: null,
        js: `function init() {
    return {
        mouseX: 0.5,
        mouseY: 0.5,
    };
}

function enterframe(state, api) {
    // Smooth mouse tracking
    state.mouseX += (api.mouse.x - state.mouseX) * 0.1;
    state.mouseY += (api.mouse.y - state.mouseY) * 0.1;
    
    api.uniforms.setFloat(5, state.mouseX);
    api.uniforms.setFloat(6, state.mouseY);
}`
    },
    
    variable_tone: {
        name: "Variable Tone (AudioWorklet)",
        description: "Basic audio synthesis with AudioWorklet - pure sine wave generation",
        thumbnail: getThumbnailUrl("audioworklet.png"),
        tabs: ["graphics", "audio", "js"],
        webgpuRequired: true,
        graphics: `// Visualize the frequency
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) {
        return;
    }
    
    let uv = vec2f(gid.xy) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    let freq = uniforms.custom0;
    
    // Frequency visualization
    let normalizedFreq = (freq - 220.0) / 660.0;  // Range: 220-880 Hz
    let freqLine = smoothstep(0.02, 0.01, abs(uv.y - normalizedFreq));
    
    // Background gradient
    var color = vec3f(uv.x * 0.2, uv.y * 0.2, 0.3);
    
    // Frequency indicator line
    color += vec3f(0.0, 1.0, 0.5) * freqLine;
    
    // Mouse position indicator
    let mouseDist = length(uv - vec2f(uniforms.mouseX, uniforms.mouseY));
    let mouseCircle = smoothstep(0.05, 0.04, mouseDist);
    color += vec3f(1.0, 0.5, 0.0) * mouseCircle;
    
    textureStore(screenTexture, gid.xy, vec4f(color, 1.0));
}`,
        audio: `// AudioWorklet sine wave synthesizer
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.phase = 0;
        this.frequency = 440;
        
        // Listen for frequency updates from JS
        this.port.onmessage = (e) => {
            if (e.data.frequency !== undefined) {
                this.frequency = e.data.frequency;
            }
        };
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            
            for (let i = 0; i < outputChannel.length; i++) {
                // Generate sine wave
                outputChannel[i] = Math.sin(this.phase) * 0.3;
                
                // Increment phase
                this.phase += (this.frequency * Math.PI * 2) / sampleRate;
                if (this.phase > Math.PI * 2) {
                    this.phase -= Math.PI * 2;
                }
            }
        }
        
        return true; // Keep processor alive
    }
}

registerProcessor('user-audio', AudioProcessor);`,
        js: `function init() {
    return {
        mouseX: 0.5,
        mouseY: 0.5,
        frequency: 440,
    };
}

function enterframe(state, api) {
    state.mouseX += (api.mouse.x - state.mouseX) * 0.1;
    state.mouseY += (api.mouse.y - state.mouseY) * 0.1;
    
    // Mouse X controls frequency (220-880 Hz)
    state.frequency = 220 + state.mouseX * 660;
    
    // Send frequency to AudioWorklet
    api.audio.send({ frequency: state.frequency });
    

    api.uniforms.setCustomFloat(0, state.frequency);
}`
    },
    
    waveform_viz: {
        name: "WGSL Waveforms",
        description: "Interactive frequency variation, use of phase accumulation, buffer reading and waveform visualisation",
        thumbnail: getThumbnailUrl("audiowgsl.png"),
        tabs: ["graphics", "audio", "js", "boilerplate"],
        webgpuRequired: true,
        graphics: `// ============================================================================
// GRAPHICS SHADER - Edit this to create visuals
// ============================================================================
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) {
        return;
    }
    
    let uv = vec2f(gid.xy) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    let t = uniforms.time;
    
    // Background pattern (dimmed)
    let mouseOffset = vec2f(uniforms.mouseX, uniforms.mouseY) * 5.0;
    let pattern = cos((uv + mouseOffset) * 10.0 + t);
    var color = vec3f(
        pattern.x * 0.15 + 0.15,
        pattern.y * 0.15 + 0.15,
        0.2
    );
    
    // Draw multi-scale waveforms
    let waveformCount = 4;
    let waveformColors = array<vec3f, 4>(
        vec3f(0.0, 1.0, 0.5),   // Cyan-green
        vec3f(1.0, 0.8, 0.0),   // Yellow
        vec3f(1.0, 0.3, 0.5),   // Pink
        vec3f(0.5, 0.5, 1.0)    // Light blue
    );
    
    for (var i = 0; i < waveformCount; i++) {
        let waveformY = (f32(i) + 0.5) / f32(waveformCount);  // Vertical position
        let zoom = pow(4.0, f32(i));  // 1x, 4x, 16x, 64x zoom
        
        // Sample audio buffer at current X position with zoom
        let samplePos = i32(uv.x * f32(SAMPLES_PER_BLOCK) / zoom) % SAMPLES_PER_BLOCK;
        let audioSample = audioBuffer[samplePos];  // Left channel (mono for simplicity)
        
        // Convert audio sample (-1 to 1) to screen space around waveformY
        let waveformHeight = 0.15 / f32(waveformCount);  // Height of each waveform strip
        let sampleY = waveformY + audioSample * waveformHeight;
        
        // Anti-aliased line drawing
        let distToWaveform = abs(uv.y - sampleY);
        let lineThickness = 0.003;
        let lineIntensity = smoothstep(lineThickness * 2.0, lineThickness * 0.5, distToWaveform);
        
        // Add waveform to color
        color += waveformColors[i] * lineIntensity * 0.8;
        
        // Draw center line for reference
        let centerDist = abs(uv.y - waveformY);
        let centerLine = smoothstep(0.002, 0.001, centerDist) * 0.2;
        color += vec3f(0.3) * centerLine;
    }
    
    // Draw scale labels (grid lines at divisions)
    for (var i = 0; i < waveformCount + 1; i++) {
        let divY = f32(i) / f32(waveformCount);
        let divDist = abs(uv.y - divY);
        let divLine = smoothstep(0.002, 0.001, divDist) * 0.3;
        color += vec3f(0.5) * divLine;
    }
    
    textureStore(screenTexture, gid.xy, vec4f(color, 1.0));
}
`,
        audio: `// ============================================================================
// AUDIO SHADER - Edit this to create sound
// ============================================================================
@compute @workgroup_size(128, 1, 1)
fn audio_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sampleIndex = i32(gid.x);
    
    // Early exit for threads beyond sample count
    if (sampleIndex >= SAMPLES_PER_BLOCK) {
        return;
    }
    
    // GPU-SIDE PHASE ACCUMULATION - Perfect timing!
    // Read persistent phase from previous block (stored on GPU)
    let basePhase = phaseState[0];
    
    // Calculate phase increment per sample using CURRENT frequency
     let phaseIncrement = uniforms.custom0 * TAU / SAMPLE_RATE;
    
    // Calculate phase for THIS specific sample
    var phase = basePhase + f32(sampleIndex) * phaseIncrement;
    
    // Generate audio sample
    let sample = sin(phase) * 0.3;
    
    // Write to interleaved stereo buffer
    audioBuffer[sampleIndex] = sample;
    audioBuffer[SAMPLES_PER_BLOCK + sampleIndex] = sample;
    
    // CRITICAL: Only the very last thread updates phase state
    // This ensures one and only one write happens
    if (sampleIndex == SAMPLES_PER_BLOCK - 1) {
        // Calculate final phase after all samples
        var finalPhase = basePhase + f32(SAMPLES_PER_BLOCK) * phaseIncrement;
        
        // Wrap phase to [0, TAU) range to prevent precision loss
        // Use while loop for robust wrapping
        while (finalPhase >= TAU) {
            finalPhase -= TAU;
        }
        while (finalPhase < 0.0) {
            finalPhase += TAU;
        }
        
        phaseState[0] = finalPhase;
    }
}
`,
        js: `// This code runs alongside your shader
// Use 'state' to persist data between each frame

function init() {
    // Called once when you press Play
    return {
        mouseX: 0,
        mouseY: 0,
        targetFreq: 440,
        smoothFreq: 440,
    };
}

function enterframe(state, api) {
    // Called every frame while playing
    
    // Smooth mouse movement
    state.mouseX += (api.mouse.x - state.mouseX) * 0.1;
    state.mouseY += (api.mouse.y - state.mouseY) * 0.1;
    
    // Change frequency
    state.targetFreq = 440 + (1. + state.mouseX) * 220 ;
    
    // Optional: smooth frequency changes for even cleaner sound
    state.smoothFreq += (state.targetFreq - state.smoothFreq) * 0.3;
    
    // Pass data to shader uniforms

    api.uniforms.setCustomFloat(0, state.smoothFreq);
    
}`
    }, 
    audioworklet_demo: {
        name: "AudioWorklet Only",
        description: "JavaScript-based audio synthesis without WebGPU - works on all browsers",
        thumbnail: getThumbnailUrl("default.png"),
        tabs: ["audio", "js"],
        webgpuRequired: false,
        graphics: null,
        audio: `// AudioWorklet beep synthesizer
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.phase = 0;
        this.frequency = 440;
        this.gain = 0.3;
        
        // Listen for updates from JS
        this.port.onmessage = (e) => {
            if (e.data.frequency !== undefined) {
                this.frequency = e.data.frequency;
            }
            if (e.data.gain !== undefined) {
                this.gain = e.data.gain;
            }
        };
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            
            for (let i = 0; i < outputChannel.length; i++) {
                // Generate sine wave with envelope
                const envelope = Math.sin(this.phase * 0.05) * 0.5 + 0.5;
                outputChannel[i] = Math.sin(this.phase) * this.gain * envelope;
                
                // Increment phase
                this.phase += (this.frequency * Math.PI * 2) / sampleRate;
                if (this.phase > Math.PI * 2) {
                    this.phase -= Math.PI * 2;
                }
            }
        }
        
        return true; // Keep processor alive
    }
}

registerProcessor('user-audio', AudioProcessor);`,
        js: `function init() {
    return {
        time: 0,
        frequency: 440,
        gain: 0.3,
    };
}

function enterframe(state, api) {
    state.time += 1/60;
    
    // Modulate frequency over time
    state.frequency = 440 + Math.sin(state.time * 0.5) * 110;
    state.gain = 0.2 + Math.sin(state.time * 0.3) * 0.1;
    
    // Send to AudioWorklet
    api.audio.send({ 
        frequency: state.frequency,
        gain: state.gain 
    });
}`
    }
};

