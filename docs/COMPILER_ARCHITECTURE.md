# Compiler Architecture Analysis

## Overview: The Two-Layer Compilation Pattern

The shader compilation system has a **two-layer architecture**:

1. **Backend Layer** (`js/backends/*.js`) - Low-level API abstraction
2. **Orchestration Layer** (`index.js`) - Multi-system coordination

---

## Backend Layer: What the Backend Modules Do

### `js/backends/webgl.js`
**Responsibility**: Pure WebGL API operations

```javascript
export async function init(canvas)
export async function compile(fragmentSource)
export function renderFrame(uniformBuilder)
export function cleanup()
```

**What it does:**
- ✅ Initialize WebGL2 context
- ✅ Compile GLSL fragment shader
- ✅ Create and link GL program
- ✅ Parse GL compiler errors
- ✅ Store uniform locations
- ✅ Render a single frame

**What it DOESN'T do:**
- ❌ Doesn't know about other tabs (JS, AudioWorklet)
- ❌ Doesn't manage editor state
- ❌ Doesn't handle canvas switching
- ❌ Doesn't coordinate with audio systems
- ❌ Doesn't display status messages

---

### `js/backends/webgpu.js`
**Responsibility**: Pure WebGPU API operations

```javascript
export async function init(canvas)
export async function compile(code, hasGraphics, hasAudioGpu)
export function renderFrame(uniformData, audioContext)
export function cleanup()
```

**What it does:**
- ✅ Initialize WebGPU device and context
- ✅ Compile WGSL shader module
- ✅ Create compute pipelines (graphics + audio)
- ✅ Parse WGSL compiler errors
- ✅ Render graphics and/or audio in a single pass

**What it DOESN'T do:**
- ❌ Doesn't know about JS tabs or AudioWorklet
- ❌ Doesn't inject boilerplate
- ❌ Doesn't manage editor state
- ❌ Doesn't handle backend switching

---

### `js/backends/audio-worklet.js`
**Responsibility**: AudioWorklet API operations

```javascript
export async function load(code)
export async function cleanup()
```

**What it does:**
- ✅ Load AudioWorklet processor code
- ✅ Create AudioWorklet node
- ✅ Parse AudioWorklet errors
- ✅ Connect to audio graph

**What it DOESN'T do:**
- ❌ Doesn't know about graphics backends
- ❌ Doesn't coordinate with GPU audio
- ❌ Doesn't manage JS compilation

---

## Orchestration Layer: What `compileGLSL()` and `reloadShader()` Do

### `compileGLSL()` in `index.js` (Lines 109-205)
**Responsibility**: Orchestrate GLSL-based shader compilation across ALL systems

```javascript
async function compileGLSL(hasAudioWorklet, skipAudioWorkletReload) {
    // 1. BACKEND INITIALIZATION
    //    - Initialize WebGL if needed
    //    - Switch from WebGPU to WebGL if necessary
    //    - Show/hide correct canvas
    
    // 2. GRAPHICS COMPILATION (calls backend)
    const compileResult = await webgl.compile(fragmentCode);
    //    - Get code from editor
    //    - Call webgl.compile()
    //    - Handle errors and display them
    
    // 3. AUDIO COMPILATION (optional, different backend!)
    if (hasAudioWorklet) {
        const result = await audioWorklet.load(audioCode);
    }
    
    // 4. JS COMPILATION (optional, different system!)
    if (state.activeTabs.includes('js')) {
        const result = await jsRuntime.compile(jsCode);
    }
    
    // 5. POST-COMPILATION
    //    - Time the compilation
    //    - Call user init()
    //    - Render a frame if paused
    
    return true/false; // Overall success
}
```

**Key insight**: `compileGLSL()` knows about:
- ✅ Multiple backends (WebGL for graphics, AudioWorklet for audio)
- ✅ Multiple tabs (graphics, audio, JS)
- ✅ Editor state
- ✅ Canvas visibility
- ✅ Error display
- ✅ Status messages
- ✅ Timing

---

### `reloadShader()` in `index.js` (Lines 207-388)
**Responsibility**: Route to the correct compilation path based on active tabs

```javascript
async function reloadShader(isResizeOnly = false) {
    // 1. DETECT ACTIVE TABS
    const hasGraphicsWGSL = state.activeTabs.includes('graphics');
    const hasGraphicsGLSL = state.activeTabs.includes('glsl_fragment');
    const hasAudioGpu = state.activeTabs.includes('audio_gpu');
    const hasAudioWorklet = state.activeTabs.includes('audio_worklet');
    
    // 2. ROUTE TO CORRECT COMPILATION PATH
    
    // Path A: WebGL (GLSL)
    if (needsWebGL) {
        return await compileGLSL(hasAudioWorklet, skipAudioWorkletReload);
    }
    
    // Path B: JS + AudioWorklet only (no graphics)
    if (!needsWebGPU || !state.hasWebGPU) {
        // Compile AudioWorklet
        // Compile JS
        return true/false;
    }
    
    // Path C: WebGPU (WGSL)
    if (needsWebGPU) {
        // 1. Initialize/reinitialize WebGPU if needed
        // 2. Show/hide correct canvas
        // 3. Inject boilerplate
        // 4. Compile WGSL (graphics + audio in one shader module)
        const compileResult = await webgpu.compile(code, hasGraphicsWGSL, hasAudioGpu);
        // 5. Compile AudioWorklet (if present alongside GPU audio)
        // 6. Compile JS
        // 7. Call user init
        return true/false;
    }
}
```

**Key insight**: `reloadShader()` is a **routing function** that:
- ✅ Detects which tabs are active
- ✅ Chooses the correct backend(s)
- ✅ Handles backend switching
- ✅ Coordinates multiple compilation systems

---

## Architecture Comparison

### Backend Modules (Good Design ✅)
**Pattern**: Pure API abstraction

```
Input:  Shader source code (string)
Output: { success: bool, errors: array }
Side effects: Minimal (only GPU state)
```

**Characteristics:**
- Single responsibility
- Stateless (uses `state` object, doesn't manage it)
- Reusable
- Testable
- No knowledge of application structure

**Example:**
```javascript
// webgl.js is PURE - just wraps WebGL API
export async function compile(fragmentSource) {
    const gl = state.glContext;
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = linkProgram(gl, vertexShader, fragmentShader);
    return { success: true, program };
}
```

---

### Orchestration Functions (Mixed Design ⚠️)
**Pattern**: Multi-system coordinator

```
Input:  Editor state, tab state, flags
Output: bool (overall success)
Side effects: MANY (editors, UI, state, backends)
```

**Characteristics:**
- Multiple responsibilities
- Stateful (reads and writes global state)
- Knows about ALL systems
- Hard to test
- Tightly coupled to application structure

**Example:**
```javascript
// compileGLSL() is IMPURE - coordinates many systems
async function compileGLSL(hasAudioWorklet, skipAudioWorkletReload) {
    logStatus('Compiling...', 'info');           // UI
    editor.clearAllErrors();                      // Editor
    await webgl.init(canvas);                     // Backend
    state.canvasWebGL.style.display = 'block';   // DOM
    const code = state.graphicsEditor.getValue(); // Editor
    const result = await webgl.compile(code);     // Backend
    editor.setGLSLErrors(result.errors);          // Editor
    await audioWorklet.load(audioCode);           // Different backend!
    await jsRuntime.compile(jsCode);              // Different system!
    jsRuntime.callInit();                         // Runtime
    render.renderOnce();                          // Render
    return true;
}
```

---

## The Problem: Orchestration Lives in `index.js`

### Why is this a problem?

1. **`index.js` should be initialization, not orchestration**
   - Orchestration = runtime coordination logic
   - Initialization = startup sequence
   - These are different concerns

2. **Orchestration logic is reusable, but stuck in `index.js`**
   - Can't easily add a "recompile on save" feature
   - Can't easily add a "compile shader for export" feature
   - Can't test compilation without loading entire app

3. **Complex control flow buried in long functions**
   - 180 lines of `reloadShader()`
   - Parallel paths (WebGL vs WebGPU vs JS-only)
   - Hard to follow execution flow

4. **Tight coupling between compilation and UI**
   - `logStatus()` calls mixed with compilation logic
   - `editor.setErrors()` calls mixed with backend calls
   - Canvas visibility mixed with shader compilation

---

## Proposed Solution: Create `js/compiler.js` Module

### New Module: `js/compiler.js`

**Responsibility**: High-level shader compilation orchestration

```javascript
// js/compiler.js

import { state } from './core.js';
import * as webgl from './backends/webgl.js';
import * as webgpu from './backends/webgpu.js';
import * as audioWorklet from './backends/audio-worklet.js';
import * as jsRuntime from './js-runtime.js';
import * as editor from './editor.js';
import * as render from './render.js';

/**
 * Main shader compilation entry point
 * Routes to correct compilation path based on active tabs
 */
export async function compile(options = {}) {
    const { isResizeOnly = false } = options;
    
    // Detect active tabs
    const context = detectCompilationContext();
    
    // Route to appropriate compilation path
    if (context.needsGLSL) {
        return await compileGLSLPath(context);
    } else if (context.needsWebGPU) {
        return await compileWebGPUPath(context);
    } else {
        return await compileScriptOnlyPath(context);
    }
}

/**
 * GLSL compilation path (WebGL graphics + optional AudioWorklet/JS)
 */
async function compileGLSLPath(context) {
    // 1. Initialize backend if needed
    await ensureWebGLInitialized();
    
    // 2. Compile graphics shader
    const graphicsResult = await compileGraphicsGLSL();
    if (!graphicsResult.success) return graphicsResult;
    
    // 3. Compile audio (if present)
    if (context.hasAudioWorklet) {
        const audioResult = await compileAudioWorklet();
        if (!audioResult.success) return audioResult;
    }
    
    // 4. Compile JS (if present)
    if (context.hasJS) {
        const jsResult = await compileJS();
        if (!jsResult.success) return jsResult;
    }
    
    // 5. Post-compilation
    return finalizeCompilation();
}

/**
 * WebGPU compilation path (WGSL graphics/audio + optional AudioWorklet/JS)
 */
async function compileWebGPUPath(context) {
    // Similar structure...
}

/**
 * Script-only path (JS + AudioWorklet, no graphics)
 */
async function compileScriptOnlyPath(context) {
    // Similar structure...
}

// Helper functions for each compilation step
function detectCompilationContext() { ... }
async function ensureWebGLInitialized() { ... }
async function compileGraphicsGLSL() { ... }
async function compileAudioWorklet() { ... }
async function compileJS() { ... }
function finalizeCompilation() { ... }
```

---

## Benefits of Extraction

### 1. Clearer Separation of Concerns

**Before:**
```
index.js (1,279 lines)
  ├── Initialization
  ├── UI setup
  ├── Event handlers
  ├── Compilation orchestration ← MIXED IN
  └── Runtime coordination
```

**After:**
```
index.js (~200 lines)          compiler.js (~300 lines)
  ├── Initialization             ├── Compilation routing
  ├── UI setup                   ├── GLSL path
  ├── Event handlers             ├── WebGPU path
  └── Calls compiler.compile()   ├── Script-only path
                                 └── Helper functions
```

### 2. Reusable Compilation

```javascript
// Can now call from anywhere:
import * as compiler from './compiler.js';

// Recompile on autosave
async function autosave() {
    await save.saveShader();
    await compiler.compile();
}

// Export compiled shader
async function exportShader() {
    const result = await compiler.compile({ dryRun: true });
    return result.compiledCode;
}

// Hot reload on file change
fileWatcher.on('change', async () => {
    await compiler.compile();
});
```

### 3. Better Error Context

```javascript
// Current: errors are spread across index.js
if (!compileResult.success) {
    editor.setGLSLErrors(compileResult.errors);
    logStatus('✗ GLSL compilation failed', 'error');
    return false;
}

// New: errors are aggregated by compiler
const result = await compiler.compile();
if (!result.success) {
    // result.errors = [
    //   { type: 'glsl', errors: [...] },
    //   { type: 'audio', errors: [...] },
    //   { type: 'js', errors: [...] }
    // ]
    displayCompilationErrors(result.errors);
}
```

### 4. Testability

```javascript
// Current: can't test compilation without full app
// (index.js has 30+ dependencies)

// New: can test compiler in isolation
import * as compiler from './compiler.js';

test('GLSL shader compiles successfully', async () => {
    state.activeTabs = ['glsl_fragment'];
    state.graphicsEditor.setValue(validGLSL);
    
    const result = await compiler.compile();
    
    expect(result.success).toBe(true);
    expect(state.glProgram).toBeDefined();
});
```

### 5. Performance Monitoring

```javascript
// Easy to add instrumentation at module level
export async function compile(options) {
    const startTime = performance.now();
    
    const result = await compileInternal(options);
    
    const duration = performance.now() - startTime;
    console.log(`Compilation took ${duration}ms`);
    
    // Could also send to analytics, show in UI, etc.
    perfMonitor.recordCompilation(duration, result.success);
    
    return result;
}
```

---

## Migration Strategy

### Phase 1: Extract `compileGLSL()` ✅
1. Create `js/compiler.js`
2. Move `compileGLSL()` → `compiler.compileGLSLPath()`
3. Keep thin wrapper in `index.js`: `async function compileGLSL(...) { return compiler.compileGLSLPath(...); }`
4. Test thoroughly

### Phase 2: Extract `reloadShader()` ✅
1. Move routing logic to `compiler.compile()`
2. Move WebGPU path to `compiler.compileWebGPUPath()`
3. Move script-only path to `compiler.compileScriptOnlyPath()`
4. Update `index.js` to call `compiler.compile()`
5. Expose globally: `window.reloadShader = compiler.compile;`

### Phase 3: Refine Compiler API ✅
1. Standardize error format across backends
2. Add compilation options (e.g., `dryRun`, `verbose`)
3. Separate "compilation" from "side effects" (UI updates)
4. Consider splitting UI concerns into `compiler-ui.js`

### Phase 4: Remove Wrapper ✅
1. Update all call sites to use `compiler.compile()` directly
2. Remove `reloadShader()` wrapper from `index.js`

---

## Key Design Principles

### Backend Layer (`js/backends/*.js`)
✅ **Pure API abstraction**
- Single input (code string or config)
- Single output (result object)
- Minimal side effects (only GPU state)
- No knowledge of application structure

### Orchestration Layer (`js/compiler.js`)
✅ **Multi-system coordinator**
- Calls multiple backends
- Aggregates results
- Handles cross-system concerns (backend switching, timing)
- Returns structured results

### Presentation Layer (`index.js`, UI modules)
✅ **User-facing concerns**
- Display compilation results
- Show errors in editor
- Update status messages
- Handle user actions

---

## Comparison to Current Architecture

### Current: Two Layers (Backend + Everything Else)

```
┌─────────────────────────────────────────┐
│            index.js                     │
│  • Initialization                       │
│  • UI setup                             │
│  • Orchestration ← MIXED                │
│  • Error display                        │
│  • Status updates                       │
└─────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌───────────────┐     ┌──────────────────┐
│  webgl.js     │     │  webgpu.js       │
│  • init()     │     │  • init()        │
│  • compile()  │     │  • compile()     │
│  • render()   │     │  • render()      │
└───────────────┘     └──────────────────┘
```

**Problem**: Orchestration logic mixed with initialization and UI

---

### Proposed: Three Layers (Backend + Orchestration + Presentation)

```
┌─────────────────────────────────────────┐
│         index.js + UI modules           │
│  • Initialization                       │
│  • UI setup                             │
│  • Error display                        │
│  • Status updates                       │
└─────────────────────────────────────────┘
                    ↓
            ┌───────────────┐
            │  compiler.js  │  ← NEW LAYER
            │  • Route      │
            │  • Aggregate  │
            │  • Coordinate │
            └───────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌───────────────┐     ┌──────────────────┐
│  webgl.js     │     │  webgpu.js       │
│  • init()     │     │  • init()        │
│  • compile()  │     │  • compile()     │
│  • render()   │     │  • render()      │
└───────────────┘     └──────────────────┘
```

**Benefit**: Clear separation of concerns at each layer

---

## Summary

### What Backend Modules Do
✅ Pure API wrappers for WebGL/WebGPU/AudioWorklet
✅ Compile a single shader or processor
✅ Return structured errors
✅ No knowledge of application structure

### What `compileGLSL()` and `reloadShader()` Do
✅ Orchestrate compilation across MULTIPLE systems
✅ Route to correct backend(s) based on active tabs
✅ Handle backend initialization and switching
✅ Coordinate graphics + audio + JS compilation
✅ Display errors and status messages

### The Problem
❌ Orchestration logic lives in `index.js`
❌ Can't reuse compilation logic elsewhere
❌ Hard to test in isolation
❌ Tight coupling between compilation and UI

### The Solution
✅ Extract to `js/compiler.js` module
✅ Separate routing, orchestration, and compilation
✅ Keep backends pure
✅ Make compilation reusable

---

**Next Step**: Extract `compileGLSL()` and `reloadShader()` to `js/compiler.js` as part of Phase 1 refactoring.

