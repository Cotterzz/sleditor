# Phase 4: Foundation Work - Organize Before Dynamism

**Date:** November 4, 2025  
**Status:** Planning  
**Goal:** Make codebase ready for plugin architecture without implementing it yet

## Current State Assessment

### 🔴 Issues to Address

1. **WebGL/WebGPU mixed together** - Need clear separation
2. **Sanitizer.js might be unnecessary** - Evaluate if needed
3. **JS security inadequate** - Need proper sandboxing
4. **GLSL boilerplate missing** - Only WGSL has it
5. **No optional boilerplate** - Users can't write raw shaders
6. **WGSL compute not implemented** - Can't create custom entry points
7. **Code organization unclear** - Backend files mixed responsibilities

### ✅ What's Working

- Tab system (after Phase 3 refactoring)
- Save/load functionality
- Editor integration
- Basic compilation

---

## Phase 4 Work Breakdown

### 4A: Simple Lazy Loading (Foundation) ⚡
**Goal:** Establish lazy-loading pattern for future use

**Files to make lazy:**
```
js/
├── plugins/              (NEW FOLDER)
│   ├── vim.js           (MOVE from js/vim.js)
│   ├── perf-monitor.js  (MOVE from js/perf-monitor.js)
│   └── plugin-loader.js (NEW - generic loader)
```

**Benefits:**
- ✅ Establishes pattern for future tab-type plugins
- ✅ Faster initial load
- ✅ Clear "optional" vs "core" boundary

**Effort:** 1-2 hours  
**Risk:** Low (these features are isolated)

---

### 4B: Backend Separation ⚙️
**Goal:** Clear WebGL vs WebGPU boundaries

**Current structure:**
```
js/backends/
├── webgl.js           (273 lines - WebGL graphics)
├── webgpu.js          (304 lines - WebGPU graphics + audio)
├── audio-worklet.js   (186 lines - Web Audio API)
```

**Proposed structure:**
```
js/backends/
├── webgl/                    (NEW FOLDER)
│   ├── webgl-graphics.js    (WebGL fragment shaders)
│   ├── webgl-boilerplate.js (GLSL boilerplate generation)
│   └── webgl-uniforms.js    (WebGL-specific uniforms)
│
├── webgpu/                   (NEW FOLDER)
│   ├── webgpu-graphics.js   (WebGPU graphics shaders)
│   ├── webgpu-audio.js      (WebGPU audio shaders)
│   ├── webgpu-compute.js    (NEW - compute shaders)
│   ├── webgpu-boilerplate.js (WGSL boilerplate generation)
│   └── webgpu-unified.js    (Unified compile for gfx+audio)
│
└── audio-worklet.js          (Stays as-is, Web Audio API)
```

**Benefits:**
- ✅ Clear which files handle which API
- ✅ Easy to conditionally load WebGPU only if supported
- ✅ Room for compute shaders
- ✅ Boilerplate separated from compilation

**Effort:** 2-3 hours  
**Risk:** Medium (need to update imports carefully)

---

### 4C: Boilerplate System Refactor 📝
**Goal:** Consistent, optional boilerplate for both GLSL and WGSL

**Current state:**
- WGSL has boilerplate tab ✓
- GLSL has inline boilerplate (in webgl.js) ✗
- No way to disable boilerplate ✗

**Proposed:**
```javascript
// js/boilerplate/glsl-boilerplate.js
export function getGLSLBoilerplate(config) {
    return `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_mouse;

${config.customUniforms || ''}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    ${config.entryPoint || 'mainImage(gl_FragColor, uv);'}
}
`;
}

// js/boilerplate/wgsl-boilerplate.js
export function getWGSLBoilerplate(config) {
    // Current boilerplate editor content
    return `...`;
}

// js/boilerplate/boilerplate-manager.js
export class BoilerplateManager {
    constructor() {
        this.enabled = {
            glsl: true,   // Can be toggled
            wgsl: true
        };
    }
    
    getFullShaderCode(language, userCode, config = {}) {
        if (language === 'glsl' && this.enabled.glsl) {
            return getGLSLBoilerplate(config) + '\n' + userCode;
        }
        if (language === 'wgsl' && this.enabled.wgsl) {
            return getWGSLBoilerplate(config) + '\n' + userCode;
        }
        return userCode; // Raw mode
    }
}
```

**UI Addition:**
- Checkbox in options: "Use boilerplate for GLSL" ☑
- Checkbox in options: "Use boilerplate for WGSL" ☑
- When unchecked, user writes complete shader with entry point

**Benefits:**
- ✅ Consistent between GLSL and WGSL
- ✅ Users can write raw shaders if they want
- ✅ Easier to add Shadertoy-style wrappers later
- ✅ Boilerplate is configuration, not hardcoded

**Effort:** 2-3 hours  
**Risk:** Medium (changes compilation flow)

---

### 4D: JS Security & Sandboxing 🔒
**Goal:** Proper JavaScript execution isolation

**Current state:**
- JS tab exists
- Execution mode toggle exists
- Security is... questionable

**Problems:**
1. Direct `eval()` or `Function()` is dangerous
2. No real isolation from main thread
3. Can access `window`, `document`, etc.

**Solution: Web Worker Sandbox**

```javascript
// js/sandbox/js-worker.js (NEW)
// This runs in a Web Worker - isolated from main thread

self.onmessage = function(e) {
    const { code, state, time } = e.data;
    
    try {
        // Create sandboxed context
        const sandbox = {
            // Safe APIs
            console: {
                log: (...args) => self.postMessage({ type: 'log', args }),
                error: (...args) => self.postMessage({ type: 'error', args })
            },
            Math,
            Date,
            
            // Shader state (read-only)
            time: time,
            frame: state.frame,
            resolution: state.resolution,
            
            // NO access to:
            // - window, document, localStorage
            // - fetch, XMLHttpRequest
            // - Other dangerous APIs
        };
        
        // Execute in sandbox
        const fn = new Function(...Object.keys(sandbox), code);
        const result = fn(...Object.values(sandbox));
        
        self.postMessage({ type: 'result', result });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};

// js/sandbox/js-sandbox.js (NEW)
export class JSSandbox {
    constructor() {
        this.worker = null;
    }
    
    async execute(code, state, time) {
        if (!this.worker) {
            this.worker = new Worker('/js/sandbox/js-worker.js');
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.worker.terminate();
                this.worker = null;
                reject(new Error('JS execution timeout'));
            }, 1000); // 1 second max
            
            this.worker.onmessage = (e) => {
                clearTimeout(timeout);
                if (e.data.type === 'error') {
                    reject(new Error(e.data.error));
                } else {
                    resolve(e.data.result);
                }
            };
            
            this.worker.postMessage({ code, state, time });
        });
    }
    
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
```

**Benefits:**
- ✅ True isolation (separate thread)
- ✅ Timeout protection
- ✅ No access to DOM or sensitive APIs
- ✅ Can still do useful compute
- ✅ Can return results to shader

**Effort:** 2-3 hours  
**Risk:** Medium (changes JS execution flow)

---

### 4E: Remove Unnecessary Code 🗑️
**Goal:** Delete what we don't need

**Candidates for removal:**

1. **js/sanitizer.js (188 lines)**
   - **Purpose:** Sanitizes user shader code?
   - **Question:** What does this actually do? Is it security theater?
   - **Action:** Review, likely remove if not adding real security

2. **Unused functions in various modules**
   - Dead code from previous refactors
   - Functions that were replaced but not deleted

3. **Legacy compatibility code**
   - Old shader format support
   - Can we drop some legacy keys?

**Process:**
1. Audit `sanitizer.js` - what does it actually prevent?
2. Search for unused exports
3. Remove dead code
4. Test thoroughly

**Benefits:**
- ✅ Less code to maintain
- ✅ Clearer what's actually used
- ✅ Smaller bundle size

**Effort:** 1-2 hours  
**Risk:** Low (but test thoroughly)

---

### 4F: WGSL Compute Shaders 🖥️
**Goal:** Enable full WGSL compute functionality

**Current limitation:** 
- Graphics shader assumes specific entry point
- Can't create custom compute pipelines
- No buffer management for compute

**What's needed:**

```javascript
// js/backends/webgpu/webgpu-compute.js (NEW)
export class WebGPUCompute {
    async compileCompute(code, config) {
        // Allow user to specify:
        // - Entry point name
        // - Workgroup size
        // - Buffer bindings
        // - Storage buffers vs uniform buffers
        
        const module = device.createShaderModule({
            code: code,
            // No boilerplate - user provides everything
        });
        
        const pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module,
                entryPoint: config.entryPoint || '@compute @workgroup_size(8, 8, 1) fn main',
            }
        });
        
        return pipeline;
    }
    
    async dispatch(pipeline, workgroups) {
        // Execute compute shader
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.dispatchWorkgroups(...workgroups);
        pass.end();
        device.queue.submit([encoder.finish()]);
    }
}
```

**UI for compute:**
- New tab type: "Compute (WGSL)"
- User writes full compute shader
- Options for workgroup size, buffer config
- Button to dispatch (instead of continuous render)

**Benefits:**
- ✅ Full WGSL power unlocked
- ✅ GPGPU capabilities
- ✅ Advanced users can do anything
- ✅ Foundation for multi-pass later

**Effort:** 3-4 hours  
**Risk:** Medium-High (new feature, complex)

---

### 4G: Clear WebGL/WebGPU Distinction 🔀
**Goal:** Never mix WebGL and WebGPU

**Current issue:** 
- User can have GLSL and WGSL tabs open at same time
- Only one actually renders
- Confusing

**Solution:**

```javascript
// js/backends/backend-manager.js (NEW)
export class BackendManager {
    constructor() {
        this.activeBackend = null; // 'webgl' | 'webgpu'
    }
    
    canAddTab(tabType) {
        const newBackend = tabType.backend; // 'webgl' or 'webgpu'
        
        if (!this.activeBackend) {
            // No backend yet, check browser support
            if (newBackend === 'webgpu' && !navigator.gpu) {
                return { ok: false, reason: 'WebGPU not supported' };
            }
            return { ok: true };
        }
        
        if (this.activeBackend !== newBackend) {
            return { 
                ok: false, 
                reason: `Cannot mix ${this.activeBackend} and ${newBackend} tabs. Close ${this.activeBackend} tabs first.` 
            };
        }
        
        return { ok: true };
    }
    
    setBackend(backend) {
        this.activeBackend = backend;
    }
    
    clearBackend() {
        this.activeBackend = null;
    }
}
```

**UI Changes:**
- "Add Tab" menu grays out incompatible tabs
- Tooltip explains why: "Close GLSL tabs to use WGSL"
- Clear visual indicator of current backend

**Benefits:**
- ✅ No user confusion
- ✅ Clear backend separation
- ✅ Enforces mutual exclusion
- ✅ Easier to implement conditional loading later

**Effort:** 1-2 hours  
**Risk:** Low (just validation logic)

---

## Recommended Order

### Week 1: Foundation & Cleanup
1. **4A: Lazy Loading Plugin Pattern** (1-2h) - Quick win, establishes pattern
2. **4E: Remove Unnecessary Code** (1-2h) - Clean up
3. **4G: Backend Distinction** (1-2h) - Prevent confusion

**Total: ~4-6 hours, all low-risk**

### Week 2: Backend Organization
4. **4B: Backend Separation** (2-3h) - Organize WebGL/WebGPU
5. **4C: Boilerplate System** (2-3h) - Consistent boilerplate

**Total: ~4-6 hours, medium risk**

### Week 3: New Capabilities
6. **4D: JS Sandboxing** (2-3h) - Security
7. **4F: WGSL Compute** (3-4h) - New feature

**Total: ~5-7 hours, medium-high risk**

---

## After Phase 4

Once this is done, the codebase will have:
- ✅ Clear plugin pattern established
- ✅ Organized backend structure (ready for conditional loading)
- ✅ Consistent boilerplate system (ready for variants)
- ✅ Secure JS execution
- ✅ Full WGSL capabilities
- ✅ Clean separation of concerns

**Then** we can tackle the dynamic tab system with confidence, because:
- We'll know exactly what needs to be in each layer
- We'll have the plugin loading pattern proven
- We'll have clear boundaries between backends
- We'll have less technical debt

---

## Decision Point

**What should we start with?**

**Option 1: Quick Wins (4A + 4E + 4G)** - 4-6 hours, low risk  
→ Clean up, establish patterns, prevent issues

**Option 2: Backend Focus (4B + 4C)** - 4-6 hours, medium risk  
→ Organize the core compilation system

**Option 3: Just 4A (Lazy Loading)** - 1-2 hours, lowest risk  
→ Prove the plugin pattern works, then reassess

I recommend **Option 1** - it gives you the most benefit with the least risk, and establishes good patterns for everything else.

What do you think? 🎯

