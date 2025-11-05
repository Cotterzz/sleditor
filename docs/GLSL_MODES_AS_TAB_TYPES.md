# GLSL Modes - Revised Architecture: Multiple Tab Types

## Key Insight: Not Modes, but **Tab Types**

You're right - these should be **separate tab types** in the "New Shader" and "Add Pass" menus, not a mode selector. Here's why:

### Problems with Mode Selector Approach
❌ **Uniform incompatibility** - Shadertoy uses different uniform structures  
❌ **Can't mix modes** - User might want raw + shadertoy in same project  
❌ **Confusing UX** - Switching modes could break code  
❌ **Migration headaches** - Converting between modes is error-prone  

### Benefits of Tab Type Approach
✅ **Clear separation** - Each tab type has its own contract  
✅ **No conversion needed** - Add the type you want  
✅ **Mix freely** - Have both raw GLSL and Shadertoy tabs in one shader  
✅ **Familiar UX** - Same as adding GLSL vs WGSL tabs  
✅ **No breaking changes** - Existing shaders untouched  

---

## Uniform Incompatibilities Analysis

### Current SLEditor Uniforms (GLSL)
```glsl
uniform float u_time;           // Seconds (single precision, grows forever)
uniform vec2 u_resolution;      // Canvas width, height in pixels
uniform vec2 u_mouse;           // Normalized 0.0-1.0
uniform int u_frame;            // Frame counter
uniform float u_custom0;        // ... through u_custom14
```

### Shadertoy Uniforms
```glsl
uniform vec3 iResolution;       // viewport width, height, pixel aspect (1.0)
uniform float iTime;            // Shader playback time (seconds)
uniform float iTimeDelta;       // Render time for last frame
uniform float iFrame;           // Shader playback frame (int as float)
uniform vec4 iMouse;            // mouse: .xy = current pixel coords
                                //        .zw = click pixel coords (or negative if not clicked)
uniform vec4 iDate;             // year, month, day, time in seconds
uniform float iSampleRate;      // Sound sample rate (usually 44100)
uniform vec3 iChannelResolution[4]; // Input texture resolutions
uniform float iChannelTime[4];      // Input texture playback time
// + samplers: iChannel0, iChannel1, iChannel2, iChannel3
```

**Key Differences:**
- `iResolution` is vec3 (width, height, aspect)
- `iMouse` is vec4 (current xy, click xy) in **pixels**, not normalized
- `iTime` vs `u_time` - both single precision but semantically same
- Shadertoy has textures/buffers (not implementing yet)

### Proposed SLEditor Extended Uniforms (for all GLSL)
```glsl
// === CORE (already exist) ===
uniform float u_time;           // Seconds since start
uniform vec2 u_resolution;      // Canvas width, height
uniform vec2 u_mouse;           // Normalized 0.0-1.0
uniform int u_frame;            // Frame counter

// === NEW (for precision/convenience) ===
uniform float u_timeFract;      // fract(u_time) - loops every second
uniform float u_timeLooped;     // u_time % 60.0 - loops every minute
uniform float u_pixelScale;     // Current pixel scale setting
uniform vec2 u_mousePixels;     // Mouse in pixel coordinates
uniform vec4 u_mouseClick;      // .xy = current, .zw = last click (pixels)

// === CUSTOM (already exist) ===
uniform float u_custom0;        // ... through u_custom14
```

---

## Proposed Tab Types

### 1. `glsl_fragment` (Current - No Changes)
**Label**: `Fragment (GLSL)`  
**Icon**: 🔺  
**User writes**: Full shader with uniforms  

```glsl
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, sin(u_time), 1.0);
}
```

**Use case**: Education, full control, portable code

---

### 2. `glsl_main` (NEW - Boilerplate Mode)
**Label**: `Main (GLSL)`  
**Icon**: 🎨  
**User writes**: Only `main()` function  

```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, sin(u_time), 1.0);
}
```

**Hidden boilerplate** (injected):
```glsl
precision highp float;
uniform float u_time;
uniform float u_timeFract;
uniform float u_timeLooped;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_mousePixels;
uniform vec4 u_mouseClick;
uniform int u_frame;
uniform float u_pixelScale;
uniform float u_custom0;  // ... through u_custom14

#define PI 3.1415926535897932
#define TAU 6.283185307179586
```

**Use case**: Quick sketches, beginners, focus on logic

---

### 3. `glsl_shadertoy` (NEW - Shadertoy Compatible)
**Label**: `Shadertoy (GLSL)`  
**Icon**: 🔺  
**User writes**: `mainImage()` function  

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, sin(iTime), 1.0);
}
```

**Hidden boilerplate**:
```glsl
precision highp float;

// SLEditor uniforms (hidden from user)
uniform float u_time;
uniform float u_timeFract;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_mousePixels;
uniform vec4 u_mouseClick;
uniform int u_frame;
uniform float u_pixelScale;
uniform float u_custom0;  // through u_custom14

// Shadertoy compatibility layer
#define iTime u_time
#define iTimeDelta (1.0 / 60.0)  // Approximate, or track actual delta
#define iFrame float(u_frame)
#define iResolution vec3(u_resolution, u_pixelScale)

// iMouse: xy = current pixels, zw = click pixels (or -1,-1 if no click)
vec4 iMouse = vec4(u_mousePixels, u_mouseClick.zw);

// Date/audio not supported yet
vec4 iDate = vec4(0.0);
float iSampleRate = 48000.0;  // Fixed

// User's shader function
void mainImage(out vec4 fragColor, in vec2 fragCoord);

// Wrapper
void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
```

**Use case**: Import Shadertoy shaders, community compatibility

---

### 4. `glsl_golfed` (NEW - Code Golf)
**Label**: `Golf (GLSL)`  
**Icon**: ⛳  
**User writes**: Ultra-compact code  

```glsl
m(){
    v2 u=C.xy/r;
    P=v4(u,sin(t),1.);
}
```

**Hidden boilerplate**:
```glsl
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;
uniform float u_custom0;  // through u_custom14

// Shorthand macros
#define t u_time
#define r u_resolution
#define m u_mouse
#define f u_frame
#define P gl_FragColor
#define C gl_FragCoord
#define v2 vec2
#define v3 vec3
#define v4 vec4
#define m main
#define s sin
#define c cos
#define a abs
#define n normalize
#define l length
#define d dot
#define x cross
#define mn min
#define mx max
#define md mod
#define fl floor
#define fr fract
#define mx mix
#define sm smoothstep
#define st step
#define sg sign
#define PI 3.14159
#define T TAU
```

**Use case**: Size-coding competitions, fun challenges

---

## Implementation Changes

### TAB_CONFIG Updates

```javascript
// js/tab-config.js

export const TAB_CONFIG = {
    // === EXISTING TABS (unchanged) ===
    graphics: { ... },
    glsl_fragment: {
        label: 'Fragment (GLSL)',
        icon: '🔺',
        dbKey: 'glsl_fragment',
        editor: 'graphics',
        type: 'webgl',
        boilerplate: null  // No injection
    },
    
    // === NEW TABS ===
    glsl_main: {
        label: 'Main (GLSL)',
        icon: '🎨',
        dbKey: 'glsl_main',
        editor: 'graphics',
        type: 'webgl',
        boilerplate: 'standard'  // Inject standard boilerplate
    },
    
    glsl_shadertoy: {
        label: 'Shadertoy (GLSL)',
        icon: '🔺',
        dbKey: 'glsl_shadertoy',
        editor: 'graphics',
        type: 'webgl',
        boilerplate: 'shadertoy'  // Inject Shadertoy wrapper
    },
    
    glsl_golfed: {
        label: 'Golf (GLSL)',
        icon: '⛳',
        dbKey: 'glsl_golfed',
        editor: 'graphics',
        type: 'webgl',
        boilerplate: 'golfed'  // Inject shorthand macros
    },
    
    // Audio tabs, etc...
};
```

### New Shader Menu Updates

```javascript
// index.html or js/shader-management.js

function showNewShaderMenu() {
    const menu = `
        <div class="shader-menu">
            <div class="shader-menu-section">
                <h4>GLSL (WebGL)</h4>
                <button onclick="createNewShader('glsl_fragment')">
                    🔺 Fragment (Full Control)
                </button>
                <button onclick="createNewShader('glsl_main')">
                    🎨 Main Only (Boilerplate)
                </button>
                <button onclick="createNewShader('glsl_shadertoy')">
                    🔺 Shadertoy Compatible
                </button>
                <button onclick="createNewShader('glsl_golfed')">
                    ⛳ Code Golf (Compact)
                </button>
            </div>
            
            <div class="shader-menu-section">
                <h4>WGSL (WebGPU)</h4>
                <button onclick="createNewShader('graphics')">
                    🎨 Graphics (WGSL)
                </button>
            </div>
        </div>
    `;
}
```

### Add Pass Menu Updates

```javascript
// js/tabs.js - showAddPassMenu()

function showAddPassMenu(btn) {
    // ... existing menu ...
    
    // Add GLSL submenu
    <div class="submenu">
        <button>🔺 Fragment (Full)</button>
        <button>🎨 Main (Boilerplate)</button>
        <button>🔺 Shadertoy</button>
        <button>⛳ Golf</button>
    </div>
}
```

---

## Uniform System Updates

### UniformBuilder Extension

```javascript
// js/uniforms.js

export class UniformBuilder {
    constructor() {
        this.data = {
            time: 0,
            timeFract: 0,           // NEW
            timeLooped: 0,          // NEW
            resolution: [0, 0],
            mouse: [0, 0],
            mousePixels: [0, 0],    // NEW
            mouseClick: [0, 0, -1, -1],  // NEW: xy = current, zw = click
            frame: 0,
            pixelScale: 1,          // NEW
            // ... audio, custom ...
        };
    }
    
    setTime(seconds) {
        this.data.time = seconds;
        this.data.timeFract = seconds % 1.0;           // NEW
        this.data.timeLooped = seconds % 60.0;         // NEW
        // ... buffer updates ...
    }
    
    setMouse(normalizedX, normalizedY, resX, resY) {
        this.data.mouse = [normalizedX, normalizedY];
        this.data.mousePixels = [                      // NEW
            normalizedX * resX,
            normalizedY * resY
        ];
        // ... buffer updates ...
    }
    
    setMouseClick(clickX, clickY) {                    // NEW
        this.data.mouseClick[2] = clickX;
        this.data.mouseClick[3] = clickY;
        // ... buffer updates ...
    }
    
    setPixelScale(scale) {                             // NEW
        this.data.pixelScale = scale;
        // ... buffer updates ...
    }
    
    applyWebGL(gl, locations) {
        // ... existing uniforms ...
        
        // NEW uniforms
        if (locations.u_timeFract) {
            gl.uniform1f(locations.u_timeFract, this.data.timeFract);
        }
        if (locations.u_timeLooped) {
            gl.uniform1f(locations.u_timeLooped, this.data.timeLooped);
        }
        if (locations.u_mousePixels) {
            gl.uniform2f(locations.u_mousePixels, 
                this.data.mousePixels[0], 
                this.data.mousePixels[1]);
        }
        if (locations.u_mouseClick) {
            gl.uniform4f(locations.u_mouseClick,
                this.data.mouseClick[0],
                this.data.mouseClick[1],
                this.data.mouseClick[2],
                this.data.mouseClick[3]);
        }
        if (locations.u_pixelScale) {
            gl.uniform1f(locations.u_pixelScale, this.data.pixelScale);
        }
    }
}
```

### Mouse Click Tracking

```javascript
// js/index.js - Add mouse click listener

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = canvas.height - (e.clientY - rect.top);  // Flip Y
    
    state.lastClickX = clickX;
    state.lastClickY = clickY;
});

// In render loop
uniforms.setMouseClick(state.lastClickX || -1, state.lastClickY || -1);
```

---

## Compilation with Boilerplate Injection

### Boilerplate Module

```javascript
// js/glsl-boilerplate.js - NEW FILE

export const STANDARD_BOILERPLATE = `precision highp float;

// Time uniforms
uniform float u_time;
uniform float u_timeFract;
uniform float u_timeLooped;

// Space uniforms
uniform vec2 u_resolution;
uniform float u_pixelScale;

// Mouse uniforms
uniform vec2 u_mouse;
uniform vec2 u_mousePixels;
uniform vec4 u_mouseClick;

// Frame counter
uniform int u_frame;

// Custom uniforms (JS-controlled)
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

// Math constants
#define PI 3.1415926535897932
#define TAU 6.283185307179586
#define PHI 1.618033988749895

`;

export const SHADERTOY_BOILERPLATE = `precision highp float;

// SLEditor native uniforms (hidden)
uniform float u_time;
uniform float u_timeFract;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_mousePixels;
uniform vec4 u_mouseClick;
uniform int u_frame;
uniform float u_pixelScale;
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

// Shadertoy compatibility layer
#define iTime u_time
#define iTimeDelta (1.0 / 60.0)
#define iFrame float(u_frame)
#define iResolution vec3(u_resolution, u_pixelScale)

// iMouse: xy = current pixel, zw = click pixel (or -1 if no click)
#define iMouse vec4(u_mousePixels, u_mouseClick.zw)

// Placeholder values for unsupported Shadertoy features
#define iDate vec4(0.0)
#define iSampleRate 48000.0

// User's mainImage function
void mainImage(out vec4 fragColor, in vec2 fragCoord);

// Wrapper
void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

`;

export const GOLFED_BOILERPLATE = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;

// Ultra-compact macros
#define t u_time
#define r u_resolution
#define m u_mouse
#define f u_frame
#define P gl_FragColor
#define C gl_FragCoord
#define v2 vec2
#define v3 vec3
#define v4 vec4
#define s sin
#define c cos
#define a abs
#define n normalize
#define l length
#define d dot
#define x cross
#define mn min
#define mx max
#define md mod
#define fl floor
#define fr fract
#define mi mix
#define sm smoothstep
#define st step
#define sg sign
#define PI 3.14159
#define T 6.28318

// Redefine main as m (so user can write m(){...})
#define m main

`;

export function getBoilerplateForTab(tabName) {
    const config = TAB_CONFIG[tabName];
    if (!config?.boilerplate) return '';
    
    switch (config.boilerplate) {
        case 'standard': return STANDARD_BOILERPLATE;
        case 'shadertoy': return SHADERTOY_BOILERPLATE;
        case 'golfed': return GOLFED_BOILERPLATE;
        default: return '';
    }
}
```

### Compiler Integration

```javascript
// js/compiler.js

import { getBoilerplateForTab } from './glsl-boilerplate.js';

export async function compileGLSL(code, currentTab) {
    const boilerplate = getBoilerplateForTab(currentTab);
    const fullSource = boilerplate + code;
    
    const result = await webgl.compile(fullSource);
    
    // Adjust error line numbers if boilerplate was added
    if (!result.success && boilerplate) {
        const boilerplateLines = boilerplate.split('\n').length;
        result.errors = result.errors.map(err => ({
            ...err,
            lineNum: Math.max(1, err.lineNum - boilerplateLines),
            message: `Line ${err.lineNum - boilerplateLines}: ${err.message}`
        }));
    }
    
    return result;
}
```

---

## Benefits of Tab Type Approach

✅ **No mode confusion** - Each tab is clearly labeled  
✅ **Mix tab types** - Use Fragment + Shadertoy in same project  
✅ **Uniform extensions** - New uniforms available to ALL GLSL tabs  
✅ **Shadertoy import** - Paste Shadertoy code directly  
✅ **Golf competitions** - Ultra-compact coding challenges  
✅ **Backwards compatible** - `glsl_fragment` unchanged  
✅ **Future-proof** - Easy to add more tab types later  

---

## Migration Path

### Existing Shaders
All existing shaders use `glsl_fragment` - **no changes needed**.

### New Shaders
User chooses tab type when creating shader:
- **Beginner**: Start with `glsl_main` (boilerplate)
- **Shadertoy user**: Use `glsl_shadertoy`
- **Advanced**: Use `glsl_fragment` (full control)
- **Code golfer**: Use `glsl_golfed`

---

## Estimated Effort

| Task | Time | Complexity |
|------|------|------------|
| Add new uniforms (fract, looped, pixels, click) | 1 hour | Easy |
| Create boilerplate module | 1 hour | Easy |
| Update TAB_CONFIG | 30 min | Easy |
| Compiler injection + error mapping | 1 hour | Moderate |
| Update New Shader menu | 30 min | Easy |
| Update Add Pass menu | 30 min | Easy |
| Mouse click tracking | 30 min | Easy |
| Testing all modes | 1 hour | Moderate |
| **Total** | **6 hours** | **Moderate** |

---

## Recommendation

**Start with 2 new tab types:**

1. **`glsl_main`** - Boilerplate mode (biggest usability win)
2. **`glsl_shadertoy`** - Community compatibility (import existing shaders)

Hold off on **`glsl_golfed`** unless there's demand.

---

## Your Call

Should I:
1. **Implement uniform extensions first** (timeFract, mousePixels, etc.)
2. **Add `glsl_main` tab type** (boilerplate)
3. **Add `glsl_shadertoy` tab type** (Shadertoy compat)
4. **All at once**

What do you think? 🎯

