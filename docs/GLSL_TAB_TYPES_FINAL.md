# GLSL Tab Types - Final Implementation Plan

## 🎯 Simplified Approach

### Tab Types (Phased Rollout)

1. **`glsl_fragment`** - "Raw (GLSL)" - NO CHANGES (existing)
2. **`glsl_regular`** - "Regular (GLSL)" - Boilerplate (Phase 1)
3. **`glsl_stoy`** - "S-Toy (GLSL)" - Shadertoy-compatible (Phase 2)
4. **`glsl_golf`** - "Golf (GLSL)" - Code golf (Phase 3)

**Key insight**: Only change the **display name** for `glsl_fragment`, keep the identifier!

---

## Uniform System - Minimal Changes

### iMouse Implementation (Shadertoy-exact behavior)

```glsl
uniform vec4 iMouse;  // Available to ALL GLSL tabs
```

**Behavior** (matches Shadertoy exactly):
- **xy**: Current mouse position (while dragging) OR last clicked position (when not dragging)
- **zw**: Start drag position (while dragging) OR negative of start position (after release)
- **Special**: For 1 frame after mouse up: z is positive, w is negative

**Why this is good**:
✅ Exact Shadertoy compatibility  
✅ Single vec4 (no multiple vectors)  
✅ Rarely used outside Shadertoy context  
✅ Still useful for non-Shadertoy shaders (optional)  

### Other New Uniforms (Optional for precision)

```glsl
uniform float u_timeFract;   // fract(u_time) - loops every second
uniform float u_pixelScale;  // Current pixel scale (for iResolution.z)
```

**Note**: These can be added later if needed. For now, focus on tab types.

---

## Phase 1: Raw vs Regular (No Uniform Changes!)

### Step 1.1: Update TAB_CONFIG

```javascript
// js/tab-config.js

export const TAB_CONFIG = {
    // === EXISTING - RENAME ONLY ===
    glsl_fragment: {
        label: 'Raw (GLSL)',           // CHANGED from 'Fragment (GLSL)'
        icon: '🔺',
        dbKey: 'glsl_fragment',        // UNCHANGED
        editor: 'graphics',
        type: 'webgl',
        boilerplate: null              // No injection
    },
    
    // === NEW - BOILERPLATE MODE ===
    glsl_regular: {
        label: 'Regular (GLSL)',
        icon: '🎨',
        dbKey: 'glsl_regular',
        editor: 'graphics',
        type: 'webgl',
        boilerplate: 'regular'         // Inject standard boilerplate
    },
    
    // ... other tabs unchanged ...
};
```

### Step 1.2: Create Boilerplate Module

```javascript
// js/glsl-boilerplate.js - NEW FILE

export const REGULAR_BOILERPLATE = `precision highp float;

// === Built-in Uniforms (automatically set each frame) ===
uniform float u_time;        // Seconds since start
uniform vec2 u_resolution;   // Canvas width, height in pixels
uniform vec2 u_mouse;        // Mouse position (normalized 0.0-1.0)
uniform int u_frame;         // Frame counter

// === Custom Uniforms (set from JavaScript) ===
// Use api.uniforms.setCustomFloat(slot, value) in JS
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

// === Helper Functions ===
// Add common helpers here later if needed

`;

export function getBoilerplateForTab(tabName) {
    const config = TAB_CONFIG[tabName];
    if (!config?.boilerplate) return '';
    
    switch (config.boilerplate) {
        case 'regular': return REGULAR_BOILERPLATE;
        // Add 'stoy' and 'golf' later
        default: return '';
    }
}

export function getBoilerplateLineCount(tabName) {
    const boilerplate = getBoilerplateForTab(tabName);
    return boilerplate ? boilerplate.split('\n').length : 0;
}
```

### Step 1.3: Update Compiler to Inject Boilerplate

```javascript
// js/compiler.js

import { getBoilerplateForTab, getBoilerplateLineCount } from './glsl-boilerplate.js';

export async function compileGLSL(code, currentTab) {
    const boilerplate = getBoilerplateForTab(currentTab);
    const fullSource = boilerplate + code;
    
    console.log(`Compiling GLSL (${currentTab})...`);
    if (boilerplate) {
        console.log(`  Injecting ${getBoilerplateLineCount(currentTab)} lines of boilerplate`);
    }
    
    const result = await webgl.compile(fullSource);
    
    // Adjust error line numbers if boilerplate was added
    if (!result.success && boilerplate) {
        const boilerplateLines = getBoilerplateLineCount(currentTab);
        result.errors = result.errors.map(err => {
            const userLine = Math.max(1, err.lineNum - boilerplateLines);
            return {
                ...err,
                lineNum: userLine,
                message: err.message.replace(/\d+/, userLine)  // Replace line number in message
            };
        });
        console.warn(`  Compilation errors (line numbers adjusted for user code):`, result.errors);
    }
    
    return result;
}
```

### Step 1.4: Update New Shader Menu

```javascript
// js/shader-management.js or index.html

function showNewShaderMenu() {
    const menu = document.createElement('div');
    menu.className = 'new-shader-menu';
    menu.innerHTML = `
        <div class="menu-section">
            <h4>GLSL (WebGL)</h4>
            <button data-type="glsl_regular">
                🎨 Regular (GLSL)
                <span class="menu-hint">Boilerplate included</span>
            </button>
            <button data-type="glsl_fragment">
                🔺 Raw (GLSL)
                <span class="menu-hint">Full control</span>
            </button>
        </div>
        
        <div class="menu-section">
            <h4>WGSL (WebGPU)</h4>
            <button data-type="graphics">
                🎨 Graphics (WGSL)
            </button>
        </div>
    `;
    
    // Position and show menu...
    
    menu.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            createNewShader(type);
            menu.remove();
        };
    });
    
    return menu;
}
```

### Step 1.5: Update Add Pass Menu

```javascript
// js/tabs.js - showAddPassMenu()

function showAddPassMenu(btn) {
    const menu = document.createElement('div');
    menu.className = 'add-pass-menu';
    menu.innerHTML = `
        <button class="menu-item" data-tab="glsl_regular">
            🎨 Regular (GLSL)
        </button>
        <button class="menu-item" data-tab="glsl_fragment">
            🔺 Raw (GLSL)
        </button>
        <button class="menu-item" data-tab="js">
            ⚡ JavaScript
        </button>
        <button class="menu-item" data-tab="audio_worklet">
            🎵 Audio (Worklet)
        </button>
        ${state.webgpu ? `
            <button class="menu-item" data-tab="graphics">
                🎨 Graphics (WGSL)
            </button>
            <button class="menu-item" data-tab="audio_gpu">
                🔊 Audio (WGSL)
            </button>
        ` : ''}
    `;
    
    // Position menu, add click handlers...
}
```

### Step 1.6: Add Minimal Example for Regular Mode

```javascript
// js/examples.js

export const MINIMAL_GLSL_REGULAR = `void main() {
    // Normalized coordinates (0.0 to 1.0)
    vec2 uv = gl_FragCoord.xy / u_resolution;
    
    // Animated color
    vec3 color = vec3(uv, sin(u_time));
    
    gl_FragColor = vec4(color, 1.0);
}`;

export const MINIMAL_GLSL_RAW = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec3 color = vec3(uv, sin(u_time));
    gl_FragColor = vec4(color, 1.0);
}`;

// Update getMinimalCode()
export function getMinimalCode(tabName) {
    switch (tabName) {
        case 'glsl_regular':
            return MINIMAL_GLSL_REGULAR;
        case 'glsl_fragment':
            return MINIMAL_GLSL_RAW;
        case 'graphics':
            return MINIMAL_WGSL;
        // ... etc
    }
}
```

---

## Phase 1 Testing Checklist

Before moving to Phase 2, verify:

- [ ] **Raw mode unchanged**: Existing `glsl_fragment` shaders compile identically
- [ ] **Display name updated**: "Raw (GLSL)" shows in tab bar
- [ ] **Regular mode works**: Boilerplate injected, compiles successfully
- [ ] **Error line numbers**: Errors report correct line in user code (not full source)
- [ ] **New shader menu**: Both Raw and Regular options appear
- [ ] **Add pass menu**: Both Raw and Regular options appear
- [ ] **Save/load**: Regular shaders save with `dbKey: 'glsl_regular'`
- [ ] **Legacy handling**: No `LEGACY_DB_KEYS` needed (new tab type)
- [ ] **Tab switching**: Can switch between Raw and Regular tabs
- [ ] **Code persistence**: Code doesn't get lost when switching tabs

---

## Phase 2: Add S-Toy Mode

### Boilerplate Addition

```javascript
// js/glsl-boilerplate.js

export const STOY_BOILERPLATE = `precision highp float;

// === SLEditor Native Uniforms ===
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

// === S-Toy Compatibility Layer ===
#define iTime u_time
#define iTimeDelta (1.0 / 60.0)
#define iFrame float(u_frame)
#define iResolution vec3(u_resolution, 1.0)  // Add u_pixelScale later

// iMouse: Will be implemented properly in uniform system
// For now, use normalized mouse converted to pixels
vec4 iMouse = vec4(u_mouse * u_resolution, u_mouse * u_resolution);

// Placeholder for unsupported features
#define iDate vec4(0.0)
#define iSampleRate 48000.0

// User's mainImage function (defined below)
void mainImage(out vec4 fragColor, in vec2 fragCoord);

// Wrapper that calls user's mainImage
void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

`;
```

### TAB_CONFIG Addition

```javascript
glsl_stoy: {
    label: 'S-Toy (GLSL)',
    icon: '🔺',
    dbKey: 'glsl_stoy',
    editor: 'graphics',
    type: 'webgl',
    boilerplate: 'stoy'
},
```

### Minimal Example

```javascript
export const MINIMAL_GLSL_STOY = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normalized coordinates
    vec2 uv = fragCoord / iResolution.xy;
    
    // Animated color
    vec3 color = vec3(uv, sin(iTime));
    
    fragColor = vec4(color, 1.0);
}`;
```

---

## Phase 3: Add Golf Mode

### Boilerplate Addition

```javascript
export const GOLF_BOILERPLATE = `precision highp float;
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

`;
```

**Note**: Don't redefine `main` as `m` - causes issues. User writes `void m(){}` and we inject `#define m main` differently.

### Minimal Example

```javascript
export const MINIMAL_GLSL_GOLF = `void m(){
    v2 u=C.xy/r;
    P=v4(u,s(t),1.);
}`;
```

---

## Implementation Order

### Immediate (Phase 1: ~2 hours)
1. ✅ Create `js/glsl-boilerplate.js`
2. ✅ Update `js/tab-config.js` (add `glsl_regular`, rename `glsl_fragment` display)
3. ✅ Update `js/compiler.js` (inject boilerplate + error line adjustment)
4. ✅ Update New Shader menu (add Regular option)
5. ✅ Update Add Pass menu (add Regular option)
6. ✅ Add minimal examples for Regular mode
7. ✅ **TEST THOROUGHLY**

### Later (Phase 2: ~1 hour)
1. Add S-Toy boilerplate
2. Add `glsl_stoy` to TAB_CONFIG
3. Update menus
4. Add minimal example
5. Test with actual Shadertoy imports

### Future (Phase 3: ~30 min)
1. Add Golf boilerplate
2. Add `glsl_golf` to TAB_CONFIG
3. Update menus
4. Add minimal example

---

## Benefits of This Approach

✅ **Phase 1 needs ZERO uniform changes** - Use existing uniforms  
✅ **No breaking changes** - `glsl_fragment` identifier unchanged  
✅ **Incremental testing** - Test each phase independently  
✅ **Quick win** - Regular mode provides immediate usability boost  
✅ **Future-proof** - Easy to add iMouse and other uniforms later  

---

## Ready to Start?

Should I begin Phase 1 implementation? 🚀

Files to create/modify:
1. Create `js/glsl-boilerplate.js`
2. Modify `js/tab-config.js`
3. Modify `js/compiler.js`
4. Modify `js/shader-management.js` (New Shader menu)
5. Modify `js/tabs.js` (Add Pass menu)
6. Modify `js/examples.js` (minimal code)

Estimated time: **2 hours**

Go? 🎯

