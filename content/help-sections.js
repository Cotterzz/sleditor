// ============================================================================
// HELP CONTENT - SLEditor Documentation
// ============================================================================
// Each section has:
// - title: Display name
// - category: Group name (appears in left sidebar)
// - content: Markdown content (supports full markdown + code blocks)
// ============================================================================

export const HELP_SECTIONS = {
    intro: {
        title: 'Introduction',
        category: 'Getting Started',
        content: `
# Welcome to SLEditor!

![SLEditor Logo](/favicon/biglogo.png)

SLEditor is a powerful browser-based shader editor supporting:
- **GLSL** fragment shaders (WebGL)
- **WGSL** compute graphics and audio (WebGPU)
- **AudioWorklet** for advanced audio synthesis
- **JavaScript** for interactive control

## Quick Actions
- 📚 Check out the **[QuickStart](#quickstart)** to get coding immediately
- 📖 Browse the **Contents** to learn specific features
`
    },
    quickstart: {
        title: 'QuickStart',
        category: 'Getting Started',
        content: `
# QuickStart Guide

## Interface Overview
- **Top Bar**: Controls, performance stats, help, and account
- **Left Panel**: Code editors with tabbed interface
- **Center**: Live shader preview canvas
- **Right Panel**: Gallery and comments

## Getting Started

### 1. Select an Example
Click on any shader in the **Examples** gallery to load it.

### 2. Fork and Edit
- Click the **Fork** button to create your own copy
- Edit the code in the Monaco editor
- Changes compile automatically

### 3. Save Your Work
- **Logged out**: Saves to browser localStorage
- **Logged in**: Saves to cloud with shareable links
`
    },
    membership: {
        title: 'Membership',
        category: 'Getting Started',
        content: `
# Membership & Accounts

## Sign Up Options
- **Email/Password**: Traditional signup
- **GitHub OAuth**: Sign in with your GitHub account
- **Google** *(coming soon)*
- **Facebook** *(coming soon)*

## Anonymous vs Logged In

### Anonymous Users Can:
- ✅ View and fork example shaders
- ✅ Save shaders to localStorage
- ✅ View published shaders via direct link
- ❌ Cannot share shaders
- ❌ Cannot comment or like

### Logged In Members Can:
- ✅ All anonymous features
- ✅ Save shaders to the cloud
- ✅ Share shaders with unique URLs
- ✅ Like and comment on shaders
- ✅ View community gallery
`
    },
    loadsave: {
        title: 'Load & Save',
        category: 'Getting Started',
        content: `
# Loading & Saving Shaders

## Saving Your Work

### When Logged Out
Shaders are saved to **browser localStorage**. They persist until you clear browser data.

### When Logged In
Shaders are saved to the **cloud** with these options:

#### Visibility Settings
- **Private**: Only you can see it
- **Published**: Visible in community gallery + shareable link
- **Example**: *(Admin only)* Listed for all users

### Forking Shaders
Click the **Fork** button on any shader to create your own copy. The title will be prefixed with "Fork of:".

## Deleting Shaders
Click the 🗑️ trash icon on any shader thumbnail in "My Shaders" to delete it.

## Sharing
Published shaders get a unique URL like: \`sleditor.com/#id=abc123def\`
`
    },
    support: {
        title: 'Support',
        category: 'Getting Started',
        content: `
# Support & Community

## Report Issues
- **GitHub**: [github.com/Cotterzz/sleditor](https://github.com/Cotterzz/sleditor)
- **Discord**: [Join our server](https://discord.gg/embXuftRKx)
- **Bluesky**: [@cotterzz.bsky.social](https://bsky.app/profile/cotterzz.bsky.social)

## Get Help
Ask questions in our Discord server or check the documentation sections below.

## Feature Requests
Open an issue on GitHub or discuss on Discord.
`
    },
    
    // PART 2: Shader Types
    glsl_intro: {
        title: 'GLSL Introduction',
        category: 'Shader Types',
        content: `
# GLSL (OpenGL Shading Language)

GLSL is the shading language for WebGL, allowing you to write fragment shaders that run on the GPU.

## Why GLSL?
- ✅ **Widely supported**: Works on all browsers
- ✅ **Well documented**: Lots of resources online
- ✅ **ShaderToy compatible**: Easy to port existing shaders
- ⚠️ **Graphics only**: No compute or audio support

## What You Can Build
- Real-time visual effects
- Ray marching scenes
- Image processing filters
- Animated patterns
`
    },
    glsl_frag: {
        title: 'GLSL Fragment Shader',
        category: 'Shader Types',
        content: `
# GLSL Fragment Shaders

## Basic Structure
\`\`\`glsl
void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec3 col = vec3(uv.x, uv.y, 0.5);
    gl_FragColor = vec4(col, 1.0);
}
\`\`\`

## Available Uniforms
- \`iResolution\` - Canvas size (vec3)
- \`iTime\` - Elapsed time in seconds
- \`iFrame\` - Frame number
- \`iMouse\` - Mouse position (vec4)

## Tips
- Normalize coordinates: \`uv = gl_FragCoord.xy / iResolution.xy\`
- Center coordinates: \`uv = (uv - 0.5) * 2.0\`
- Maintain aspect ratio: multiply by \`iResolution.xy / iResolution.y\`
`
    },
    wgsl_intro: {
        title: 'WGSL Introduction',
        category: 'Shader Types',
        content: `
# WGSL (WebGPU Shading Language)

WGSL is the modern shading language for WebGPU, offering compute shaders for graphics and audio.

## Why WGSL?
- ✅ **Compute shaders**: Full GPU compute capabilities
- ✅ **Audio synthesis**: Generate audio on the GPU
- ✅ **Modern**: Future-proof technology
- ⚠️ **Limited support**: Chrome 113+, Safari 18+, Edge 113+

## What You Can Build
- GPU-accelerated graphics
- Real-time audio synthesis
- Compute-based effects
- Advanced parallel processing
`
    },
    wgsl_compute: {
        title: 'WGSL Compute Graphics',
        category: 'Shader Types',
        content: `
# WGSL Compute Graphics

Compute shaders process each pixel in parallel using workgroups.

## Basic Structure
\`\`\`wgsl
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let pos = vec2<f32>(id.xy);
    let uv = pos / vec2<f32>(resolution);
    
    let color = vec4<f32>(uv.x, uv.y, 0.5, 1.0);
    textureStore(outputTex, id.xy, color);
}
\`\`\`

## Available Uniforms
- \`resolution\` - Canvas size
- \`time\` - Elapsed time
- \`frame\` - Frame number
- \`mouse\` - Mouse position

## Workgroup Sizes
Automatically recalculated when canvas size changes to ensure full coverage.
`
    },
    wgsl_audio: {
        title: 'WGSL Audio',
        category: 'Shader Types',
        content: `
# WGSL Audio Synthesis

Generate audio using GPU compute shaders for extremely efficient synthesis.

## Basic Structure
\`\`\`wgsl
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let sampleIndex = id.x;
    let t = f32(audioFrame + sampleIndex) / 44100.0;
    
    let freq = 440.0; // A4 note
    let sample = sin(t * freq * 6.28318);
    
    audioBuffer[sampleIndex] = sample;
    audioBuffer[SAMPLES_PER_BLOCK + sampleIndex] = sample; // Stereo
}
\`\`\`

## Performance
Capable of synthesizing thousands of oscillators in real-time!
`
    },
    audioworklet: {
        title: 'AudioWorklet',
        category: 'Shader Types',
        content: `
# AudioWorklet

Modern Web Audio API for custom audio processing in a separate thread.

## Code Structure
\`\`\`javascript
const audioProcessor = {
    init() {
        // Initialize your processor
        this.phase = [0, 0]; // Stereo channels
        this.frequency = 440;
    },
    
    userProcess(output, inputs, parameters) {
        // Generate audio samples
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            for (let i = 0; i < outputChannel.length; i++) {
                outputChannel[i] = Math.sin(this.phase[channel]) * 0.3;
                this.phase[channel] += (this.frequency * Math.PI * 2) / sampleRate;
            }
        }
    },
    
    receiveMessage(data) {
        // Handle messages from main thread
        if (data.frequency) this.frequency = data.frequency;
    }
};
\`\`\`

## Available Variables
- \`sampleRate\` - Audio sample rate (usually 44100 or 48000)
- \`this.port.postMessage(data)\` - Send messages to main thread via \`sendMessage()\`
`
    },
    javascript: {
        title: 'JavaScript',
        category: 'Shader Types',
        content: `
# JavaScript Tab

Add interactivity and control to your shaders with JavaScript.

## Available Functions

### \`init()\`
Called once when shader loads.
\`\`\`javascript
function init() {
    console.log('Shader initialized!');
}
\`\`\`

### \`enterframe(elapsed, uniforms)\`
Called every frame.
\`\`\`javascript
function enterframe(elapsed, uniforms) {
    // elapsed: time in seconds
    // uniforms: object to set custom uniforms
    uniforms.customValue = Math.sin(elapsed) * 0.5 + 0.5;
}
\`\`\`

## Custom Uniforms
Set values in \`enterframe\` to pass data to your shaders:
\`\`\`javascript
uniforms.myFloat = 1.5;
uniforms.myVec2 = [x, y];
uniforms.myVec3 = [r, g, b];
\`\`\`

## Security Note
⚠️ JavaScript shaders are currently **private only** for security reasons.
`
    },
    
    // Appendix
    wgsl_boilerplate: {
        title: 'WGSL Boilerplate',
        category: 'Reference',
        content: `
# WGSL Boilerplate

The full boilerplate code wrapped around your WGSL compute shaders.

## Graphics Boilerplate
\`\`\`wgsl
@group(0) @binding(0) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    frame: u32,
    mouse: vec4<f32>,
}

// Your code here

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Your main function
}
\`\`\`

## Audio Boilerplate
Similar structure with audio-specific uniforms and buffer bindings.
`
    },
    audioworklet_boilerplate: {
        title: 'AudioWorklet Boilerplate',
        category: 'Reference',
        content: `
# AudioWorklet Boilerplate

Your code is wrapped in an AudioWorkletProcessor class.

\`\`\`javascript
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = sampleRate;
        this.audioProcessor = audioProcessor; // Your object
        
        // Bind your methods
        if (this.audioProcessor.init) {
            this.audioProcessor.init = this.audioProcessor.init.bind(this);
            this.audioProcessor.init();
        }
        // ... more binding
        
        this.port.onmessage = (e) => {
            if (this.audioProcessor.receiveMessage) {
                this.audioProcessor.receiveMessage(e.data);
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (this.audioProcessor.userProcess) {
            const output = outputs[0];
            this.audioProcessor.userProcess(output, inputs, parameters);
        }
        return true;
    }

    sendMessage(data) {
        this.port.postMessage(data);
    }
}
registerProcessor('user-audio-...', AudioProcessor);
\`\`\`
`
    },
    credits: {
        title: 'Credits & Links',
        category: 'Reference',
        content: `
# Credits & Useful Links

## SLEditor
Created by [John Cotterell aka Cotterzz](https://johnc.pro)

Special thanks to:
Diatribes, Konsumer, Kuko Visuals, Vipits, Peter0x044, Jae and others
for feedback, suggestions and encouragement in the Discord channel

## Technologies
- **Monaco Editor** - Code editing
- **Supabase** - Backend & auth
- **Marked.js** - Markdown rendering
- **WebGPU/WGSL** - Modern GPU compute
- **WebGL/GLSL** - Graphics rendering
- **Sublime Text** - Code editing
- **Cursor** - Code editing
- **Claude 4.5 Sonnet** - Refactoring and DB assistance


## Community
- 💬 [Discord](https://discord.gg/embXuftRKx)
- 🦋 [Bluesky](https://bsky.app/profile/cotterzz.bsky.social)
- 🐙 [GitHub](https://github.com/Cotterzz/sleditor)
`
    }
};

