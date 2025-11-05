# Multiple GLSL Presentation Modes - Feasibility Analysis

## TL;DR: **Highly Feasible** ⭐⭐⭐⭐⭐

The architecture is **perfectly suited** for this! Here's why:

## Current Architecture Strengths

### 1. **Uniform System is Already Abstracted**
```javascript
// js/uniforms.js - Works for ALL backends
uniforms.setTime(elapsedSec);
uniforms.setResolution(width, height);
uniforms.setMouse(x, y);
```

The uniform system doesn't care about naming - it just fills buffer slots!

### 2. **Compilation is Centralized**
```javascript
// js/backends/webgl.js - Single compile entry point
export async function compile(fragmentSource) {
    // We can inject boilerplate HERE before compilation
}
```

### 3. **Examples Already Use Boilerplate**
```javascript
// js/examples.js - Already has WGSL boilerplate
export function getBoilerplate() {
    return `const SCREEN_WIDTH = ${state.canvasWidth};
    struct Uniforms { ... }`;
}
```

## Proposed Implementation

### Storage Structure
```javascript
// Add to shader data in database
{
    code: {
        glsl_fragment: "...",
        graphics: "..."
    },
    glsl_mode: "raw" | "boilerplate" | "shadertoy" | "golfed",  // NEW
    code_types: ["glsl_fragment", "js"]
}
```

### Mode Definitions

#### 1. **Raw Mode** (Current - Default)
```glsl
// User writes EVERYTHING
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, sin(u_time), 1.0);
}
```

**Pros**: Full control, educational, portable  
**Cons**: Verbose, intimidating for beginners

---

#### 2. **Boilerplate Mode**
```glsl
// User writes ONLY main()
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, sin(u_time), 1.0);
}
```

**Hidden boilerplate** (injected before compilation):
```glsl
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;
// ... u_custom0 through u_custom14 ...
#define PI 3.1415926535897932
#define TAU 6.283185307179586
```

**Pros**: Clean, focused on logic  
**Cons**: Hides details, less educational

---

#### 3. **Shadertoy Mode**
```glsl
// Shadertoy-compatible API
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, sin(iTime), 1.0);
}
```

**Hidden boilerplate** (injected):
```glsl
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;

// Shadertoy compatibility layer
#define iTime u_time
#define iResolution vec3(u_resolution, 1.0)
#define iMouse vec4(u_mouse * u_resolution, 0.0, 0.0)
#define iFrame u_frame

void mainImage(out vec4, in vec2);

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
```

**Pros**: Import Shadertoy shaders directly, huge community  
**Cons**: Different naming, fragCoord vs gl_FragCoord

---

#### 4. **Golfed Mode** (Code Golf)
```glsl
// Ultra-compact for size-coding competitions
m(){
    vec2 u=gl_FragCoord.xy/r;
    gl_FragColor=vec4(u,sin(t),1.);
}
```

**Hidden boilerplate**:
```glsl
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
#define t u_time
#define r u_resolution
#define m main
#define P gl_FragColor
#define C gl_FragCoord
#define v2 vec2
#define v3 vec3
#define v4 vec4
#define PI 3.14159
```

**Pros**: Minimal characters, fun for competitions  
**Cons**: Unreadable, only for experts

---

## Implementation Plan

### Phase 1: Infrastructure (2 hours)

#### 1.1: Add Mode Selector UI
```javascript
// js/tabs.js - Add mode selector below tab bar
function renderGLSLModeSelector(tabName) {
    if (tabName !== 'glsl_fragment') return;
    
    const modes = ['raw', 'boilerplate', 'shadertoy', 'golfed'];
    // Render radio buttons or dropdown
}
```

#### 1.2: Store Mode with Shader
```javascript
// js/save.js - Add glsl_mode to saved data
const shaderData = {
    code: {...},
    code_types: [...],
    glsl_mode: state.currentGLSLMode || 'raw'  // NEW
};
```

#### 1.3: Create Boilerplate Generator
```javascript
// js/glsl-boilerplate.js - NEW FILE
export function getGLSLBoilerplate(mode) {
    const boilerplates = {
        raw: '',  // No boilerplate
        boilerplate: STANDARD_BOILERPLATE,
        shadertoy: SHADERTOY_BOILERPLATE,
        golfed: GOLFED_BOILERPLATE
    };
    return boilerplates[mode] || '';
}

const STANDARD_BOILERPLATE = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;
// ... custom uniforms ...
#define PI 3.1415926535897932
#define TAU 6.283185307179586
`;
```

### Phase 2: Compilation Integration (1 hour)

#### 2.1: Inject Boilerplate Before Compile
```javascript
// js/compiler.js - Modify compileGLSL()
async function compileGLSL(userCode, mode = 'raw') {
    const boilerplate = getGLSLBoilerplate(mode);
    const fullSource = boilerplate + userCode;
    
    const result = await webgl.compile(fullSource);
    
    // If error, adjust line numbers to account for boilerplate
    if (!result.success && mode !== 'raw') {
        result.errors = adjustLineNumbers(result.errors, boilerplate);
    }
    
    return result;
}
```

#### 2.2: Error Line Number Adjustment
```javascript
// Map error line numbers back to user code
function adjustLineNumbers(errors, boilerplate) {
    const boilerplateLines = boilerplate.split('\n').length;
    return errors.map(err => ({
        ...err,
        lineNum: Math.max(1, err.lineNum - boilerplateLines),
        message: err.message + ` (in user code, line ${err.lineNum})`
    }));
}
```

### Phase 3: UI Updates (30 min)

#### 3.1: Mode Selector
Add to shader info panel (above editor):
```
GLSL Mode: [Raw] [Boilerplate] [Shadertoy] [Golfed]
```

#### 3.2: Visual Indication
Show current mode in editor (top-right badge):
```
📝 Raw Mode
🎨 Boilerplate Mode  
🔺 Shadertoy Mode
⛳ Golfed Mode
```

### Phase 4: Migration & Compatibility (30 min)

#### 4.1: Existing Shaders
```javascript
// All existing shaders default to 'raw' mode
if (!shader.glsl_mode) {
    shader.glsl_mode = 'raw';  // Backward compatible
}
```

#### 4.2: Import/Export
```javascript
// When importing Shadertoy shaders
if (importSource === 'shadertoy') {
    shader.glsl_mode = 'shadertoy';
}
```

---

## Challenges & Solutions

### Challenge 1: Error Line Numbers
**Problem**: Compiler reports errors in full source (with boilerplate)  
**Solution**: Subtract boilerplate line count from error line numbers

### Challenge 2: Autocomplete
**Problem**: Monaco editor doesn't know about hidden uniforms  
**Solution**: Inject boilerplate into Monaco's model (invisibly) or add to language server

### Challenge 3: Mode Switching
**Problem**: Switching modes might break code  
**Solution**: Warn user + offer to auto-convert (if possible)

### Challenge 4: Shadertoy Compatibility
**Problem**: Shadertoy has textures, multiple buffers, etc.  
**Solution**: Start with basic mainImage() only, add buffers later

---

## API Consistency

### Good News: Uniforms Don't Change!
```javascript
// JavaScript API is IDENTICAL for all modes
function enterframe(state, api) {
    api.uniforms.setCustomFloat(0, value);  // Works for all modes
}
```

The uniform **names** in GLSL change, but the **buffer slots** stay the same!

| Raw | Boilerplate | Shadertoy | Golfed |
|-----|-------------|-----------|--------|
| `u_time` | `u_time` | `iTime` | `t` |
| `u_resolution` | `u_resolution` | `iResolution.xy` | `r` |
| `u_custom0` | `u_custom0` | `u_custom0` | `u_custom0` |

All map to the **same buffer slots** - no JS changes needed!

---

## Estimated Effort

| Phase | Time | Complexity |
|-------|------|------------|
| Infrastructure | 2 hours | Easy |
| Compilation | 1 hour | Moderate |
| UI | 30 min | Easy |
| Migration | 30 min | Easy |
| **Total** | **4 hours** | **Moderate** |

---

## Recommendation

### Start Small
1. **Phase 1**: Add "Raw" vs "Boilerplate" toggle only
2. **Test**: Ensure error line numbers work
3. **Phase 2**: Add Shadertoy mode
4. **Phase 3**: Add Golfed mode (if wanted)

### Quick Win
Just implementing **Boilerplate mode** would make GLSL much more approachable for beginners while keeping the current system for advanced users.

---

## Example Implementation Flow

```javascript
// 1. User selects "Boilerplate" mode
state.glslMode = 'boilerplate';

// 2. User writes simple code
const userCode = `void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, sin(u_time), 1.0);
}`;

// 3. Compiler injects boilerplate
const fullCode = BOILERPLATE + userCode;

// 4. WebGL compiles full code
webgl.compile(fullCode);

// 5. If error at line 15, report line 8 to user (minus boilerplate)

// 6. Save with mode
save({
    code: { glsl_fragment: userCode },  // Save ONLY user code
    glsl_mode: 'boilerplate'
});
```

---

## Benefits

✅ **Backwards Compatible**: All existing shaders work (default to 'raw')  
✅ **Flexible**: Users choose their preferred style  
✅ **Educational**: Can start with boilerplate, graduate to raw  
✅ **Community**: Shadertoy imports become trivial  
✅ **Fun**: Golfed mode for competitions  
✅ **No API Changes**: JavaScript API stays identical  
✅ **Clean Database**: Only store user code, not boilerplate  

---

## Answer: YES, Very Feasible!

The architecture is **perfect** for this. The uniform system abstraction means you can change GLSL variable names without touching JavaScript. The centralized compilation means one injection point. Storage already handles metadata.

**I'd estimate 4-6 hours to implement all four modes properly.**

Want me to start with a basic "Raw vs Boilerplate" toggle to prove the concept?

