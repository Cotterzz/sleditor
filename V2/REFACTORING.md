# Sleditor V2 - Refactoring & Technical Debt

This document tracks architectural improvements, code cleanup, and fixes needed for V2.
Prioritized by impact and effort.

---

## High Priority

### 1. ✅ Centralize State Mutations (Actions Pattern) - COMPLETED

**Status:** Implemented in `V2/js/core/actions.js`

**Solution:** Created centralized actions module with all state mutation functions:
- `addProjectElement()`, `removeProjectElement()` - project elements
- `setShaderCode()`, `deleteShaderCode()` - shader code
- `openTab()`, `closeTab()`, `setActiveTab()` - UI tabs
- `setChannelMatrixSettings()` - channel matrix
- And more...

**Files updated:**
- [x] `core/actions.js` - NEW: ~250 lines of centralized actions
- [x] `ui/panels/unified-editor.js` - Now uses actions
- [x] `ui/panels/editor-code.js` - Now uses actions
- [x] `ui/panels/editor-matrix.js` - Now uses actions
- [x] `ui/panels/shader-info.js` - Now uses actions
- [x] `app.js` - Now uses actions

**Note:** Managers (`ShaderManager`, `ChannelManager`) still mutate state directly as they are the single authority for their domains. This is acceptable as the goal was to stop UI code from scattering mutations.

---

### 2. Create Selectors for Derived State

**Problem:** Computed values are recalculated in multiple places with slightly different logic.

**Current (duplicated):**
```javascript
// unified-editor.js
function getNextBufferLetter() {
    const existing = state.project.code.filter(c => c.id.startsWith('Buffer'))...
}

// ChannelManager.js
function getNextBufferLetter() {
    for (const [, ch] of channels) { if (ch.type === 'buffer' && ch.passId)... }
}
```

**Proposed:**
```javascript
// core/selectors.js
export const selectors = {
    getBuffers: () => state.project.code.filter(c => c.type === 'buffer'),
    getUsedBufferLetters: () => selectors.getBuffers().map(b => b.id.replace('Buffer', '')),
    getNextBufferLetter: () => {
        const used = new Set(selectors.getUsedBufferLetters());
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i);
            if (!used.has(letter)) return letter;
        }
        return null;
    },
    
    getAllChannelSources: () => [...state.project.code, ...state.project.media]
        .filter(el => el.channel !== undefined),
        
    canPlay: () => state.render.isCompiled && !state.render.hasErrors,
};
```

---

### 3. Extract Audio Processing from webgl.js

**Problem:** `webgl.js` contains ~200 lines of audio FFT/chromagram processing that belongs in a dedicated module.

**Current location:** `V2/js/render/webgl.js` lines ~908-1050
- `updateAudioTextures()`
- `updateStandardAudioTexture()`
- `updateChromagramTexture()`

**Legacy reference:** `js/audio-input.js` has clean, well-documented audio processing.

**Proposed:**
```
V2/js/inputs/
├── audio.js      # Wrap legacy audio-input.js with V2 events
├── video.js      # Video texture handling
├── webcam.js     # Webcam input
└── index.js      # Export all
```

**Action:**
1. Create `V2/js/inputs/audio.js`
2. Wrap `js/audio-input.js` functions with V2 event integration
3. Move texture update functions from webgl.js
4. Import in webgl.js, call update functions

---

### 4. Separate Compiler from Render

**Problem:** Compiler folder exists but is empty. Compilation code is split between `ShaderManager.js` (~29 compile references) and `webgl.js` (~27 compile references).

**Current:**
- `V2/js/compiler/` - Empty folder
- Compilation logic in `ShaderManager.js`
- Shader program creation in `webgl.js`

**Proposed structure:**
```
V2/js/compiler/
├── glsl-compiler.js    # GLSL compilation, error parsing
├── wgsl-compiler.js    # WGSL compilation (future)
├── boilerplate.js      # Wrap js/glsl-boilerplate.js
└── index.js            # Unified compiler interface
```

**Separation of concerns:**
- `compiler/` - Text processing: boilerplate, error parsing, code transformation
- `render/webgl.js` - GL operations: program creation, uniform binding, draw calls

---

### 5. Single Source of Truth - Shader/Project Unification

**Problem:** Data is duplicated between `state.shader` and `state.project`:

| Data | state.shader | state.project | Issue |
|------|--------------|---------------|-------|
| Code elements | `code: { Image: '', BufferA: '' }` | `code: [{ id: 'Image', channel: 0 }]` | Same thing, different shape |
| Which buffers exist | Implied by keys | Explicit array | Duplicate source |
| Channel allocation | Not stored | `nextChannelNumber` | Needs persistence |
| Media references | Not stored | `media: [...]` | Needs persistence |

**Solution:** See **[shader-format.md](./shader-format.md)** for the complete V2 DB schema.

Key points:
- `state.shader` = mirrors DB structure (what gets saved)
- `state.project` / `state.runtime` = hydrated runtime state (ephemeral)
- V1 shaders (`shader_type: null`) are translated on load

**Runtime State (not persisted):**

```javascript
// Hydrated from shader data on load
state.runtime = {
    // Loaded/compiled resources
    channels: new Map([
        // [slot, { ...config, texture: WebGLTexture, ... }]
    ]),
    
    // Loaded media objects
    media: new Map([
        // [name, { element: HTMLAudioElement, ... }]
    ]),
    
    // Monaco models
    models: new Map([
        // [passId, MonacoModel]
    ]),
    
    // UI state
    openTabs: ['Image'],
    activeTab: 'Image',
    sidebarCollapsed: false
};
```

**Migration path:**
1. Implement V2 schema fields in DB (additive, no breaking changes)
2. Create `translateV1Shader()` function for legacy load
3. Update save to use V2 format
4. Hydrate `state.runtime` from loaded shader
5. Deprecate `state.project` (or rename to `state.runtime`)

---

## Medium Priority - see final assessment

### 6. CSS Organization

**Problem:** CSS is scattered and growing:
- `ui-system/ui.css` - 4420 lines (too big)
- `V2/css/app.css` - 1671 lines (growing)
- Inline styles still exist in JS files

**Current inline style locations:**
- `shader-controls.js` - Controls bar, uniforms section
- `uniforms.js` - Example code containers
- Various panels with `style.cssText`

**Proposed CSS structure:**
```
ui-system/
├── ui.css              # Core SLUI components only (~2000 lines target)
├── ui-layout.css       # Window, dock, toolbar layouts
├── ui-components.css   # Buttons, inputs, selects, etc.
└── ui-themes.css       # Theme-specific overrides

V2/css/
├── app.css             # V2-specific components
├── panels/             # Per-panel styles (optional)
│   ├── preview.css
│   ├── editor.css
│   └── controls.css
└── fullscreen.css      # Already exists
```

**Action items:**
- [ ] Audit inline styles, extract to CSS
- [ ] Split large CSS files by concern
- [ ] Document which file to use for what

---

### 7. Event Handler Cleanup

**Problem:** Event handlers don't always clean up, causing potential memory leaks.

**Current:**
```javascript
// shader-controls.js
events.on(EVENTS.RENDER_FRAME, (data) => { ... });
// No cleanup when controls are destroyed
```

**Proposed pattern:**
```javascript
const cleanupFns = [];

export function init() {
    cleanupFns.push(events.on(EVENTS.RENDER_FRAME, handleFrame));
    cleanupFns.push(events.on(EVENTS.COMPILE_SUCCESS, handleCompile));
}

export function destroy() {
    cleanupFns.forEach(fn => fn());
    cleanupFns.length = 0;
}
```

**Files to audit:**
- [ ] `ui/panels/shader-controls.js`
- [ ] `ui/panels/unified-editor.js`
- [ ] `ui/panels/preview.js`
- [ ] `managers/ShaderManager.js`

---

### 8. Missing SLUI Components

**Components needed:**
- [ ] Dropdown menus (currently inline in Add Tab buttons)
- [ ] Checkbox groups
- [ ] Radio button groups
- [ ] Progress bars
- [ ] Tooltips (beyond title attribute)

**Action:** Add to SLUI as encountered, don't create one-offs in V2.

---

## Low Priority - see final assessment

### 9. Result Types for Error Handling

**Current:**
```javascript
function compile(code) {
    try {
        return doCompile(code);
    } catch (e) {
        events.emit(EVENTS.COMPILE_ERROR, e);
        return null;
    }
}
```

**Proposed:**
```javascript
// utils/result.js
export const Ok = (value) => ({ ok: true, value });
export const Err = (error) => ({ ok: false, error });

function compile(code) {
    const result = doCompile(code);
    if (result.ok) {
        events.emit(EVENTS.COMPILE_SUCCESS, result.value);
    } else {
        events.emit(EVENTS.COMPILE_ERROR, result.error);
    }
    return result;
}
```

---

### 10. Functional Utilities

**Useful FP utilities to add:**
```javascript
// utils/fp.js
export const pipe = (...fns) => x => fns.reduce((v, f) => f(v), x);
export const compose = (...fns) => x => fns.reduceRight((v, f) => f(v), x);
export const prop = key => obj => obj?.[key];
export const find = pred => arr => arr?.find(pred);
export const filter = pred => arr => arr?.filter(pred);
export const map = fn => arr => arr?.map(fn);
```

## Dependency Cleanup

### WebGL.js Dependencies to Extract

| Function | Lines | Move To |
|----------|-------|---------|
| `updateAudioTextures()` | ~15 | `inputs/audio.js` |
| `updateStandardAudioTexture()` | ~25 | `inputs/audio.js` |
| `updateChromagramTexture()` | ~100 | `inputs/audio.js` |
| `loadAudio()` | ~80 | `inputs/audio.js` |
| `loadVideo()` | ~50 | `inputs/video.js` |
| Compile-related functions | ~200 | `compiler/` |

**Target:** webgl.js should only contain:
- GL context management
- Shader program execution
- Texture binding
- Framebuffer management
- Draw calls

---

*Created: February 2026*



# Final assessment of refactoring plan, we should follow this

Here's my assessment of the project and what I'd recommend next.

---

## Project Assessment

**Sleditor** is an impressive and ambitious project — a Shadertoy-like shader editor with a clean, well-documented V2 architecture. A few things stand out:

### What's Working Well

1. **The Four Pillars architecture is solid.** Event bus, namespaced state, managers, and reactive UI — this is a well-reasoned separation of concerns that avoids the spaghetti trap common in WebGL-heavy apps. The fact that you've already documented *anti-patterns* in the guidelines shows real architectural maturity.

2. **The Actions pattern (Refactoring #1) is done.** `core/actions.js` is clean, well-typed with JSDoc, and properly emits events. This is the foundation for everything else.

3. **The Guidelines document is exceptional.** It's one of the best developer-facing project docs I've seen — it would onboard any contributor (human or AI) quickly. The "When to Use What" tables, the legacy code reference, and the SLUI boundary rules are all very practical.

4. **Global channel model is a smart simplification** over Shadertoy's per-pass mapping, and the migration path (translate on import) is well thought out.

5. **The `webgl.js` renderer works** — 2200+ lines of functioning multipass, ping-pong, audio FFT, and chromagram processing is a substantial achievement.

### Where Things Stand

The project is at a **pivotal transition point**. The core runtime works (render, compile, edit), but several of the medium/high-priority refactoring items are blocking the next wave of features. Here's what I see:

---

## Recommended Next Steps (in order)

### 1. **Selectors** (Refactoring #2) — Do this first, it's quick and high-value

This is the lowest-effort, highest-leverage item. Right now `getNextBufferLetter()` is duplicated between `unified-editor.js` and `ChannelManager.js`, and I'd bet there are other derived-state calculations scattered around. A `core/selectors.js` file with 10-15 pure functions would:
- Eliminate duplicated logic immediately
- Make it easy to test buffer/channel state queries
- Set up a clean foundation for the next items

**Effort:** ~1-2 hours. **Impact:** Prevents bugs from diverging logic.

### 2. **Extract Audio from `webgl.js`** (Refactoring #3) — This is the big structural win

`webgl.js` is 2231 lines and contains ~150+ lines of audio FFT/chromagram processing (lines 909-1060+) that has nothing to do with GL rendering. This is the single most impactful extraction because:
- It makes `webgl.js` understandable (rendering only)
- It creates `inputs/audio.js` which you'll need anyway for the channel system
- The chromagram code is complex and self-contained — perfect for isolation
- Legacy `js/audio-input.js` already has a clean reference implementation

**Effort:** ~3-4 hours. **Impact:** Major — unblocks clean input/channel work.

### 3. **Separate Compiler from Render** (Refactoring #4) — Unblocks WGSL

The `compiler/` directory is empty, yet compilation logic is spread across `ShaderManager.js` (2063 lines!) and `webgl.js`. This is blocking WGSL support because right now you can't swap in a WGSL compiler — everything is interleaved with GL calls. Extract:
- Boilerplate injection → `compiler/boilerplate.js`
- Error parsing → `compiler/glsl-compiler.js`
- Keep only `createProgram()` / `linkProgram()` in `webgl.js`

**Effort:** ~4-6 hours. **Impact:** Unblocks WGSL, makes `ShaderManager.js` manageable.

### 4. **State/Project Unification** (Refactoring #5) — Needed before save/load

The dual `state.shader` / `state.project` setup is working for now but will cause real pain when you implement save/load with the Supabase backend. You've already designed the solution in `shader-format.md`. The key move is:
- Make `state.shader` the single serializable truth
- Rename `state.project` to `state.runtime` (ephemeral, hydrated on load)
- Build `hydrateRuntime()` and `translateV1Shader()` functions

**Effort:** ~6-8 hours. **Impact:** Required before persistence works correctly.

### 5. **Event Handler Cleanup** (Refactoring #7) — Do incrementally

This one I'd tackle file-by-file as you touch panels. Every time you modify a panel file, add the cleanup pattern. Don't do a big-bang refactor — it's not worth the risk.

---

## What I'd Skip (for now)

- **CSS reorganization (#6)** — It's annoying but not blocking anything. The 4400-line `ui.css` won't get worse if you follow the guidelines.
- **Result types (#9)** and **FP utilities (#10)** — Nice-to-haves, not priorities. The current error handling via events works fine.
- **Missing SLUI components (#8)** — Build these on-demand as features need them, not proactively.

---

## The Big Picture

Your next **milestone** should be: **a working save/load cycle with the V2 format**. Items 1-4 above directly feed into that. Once you can save a multipass shader with channels and load it back, V2 becomes usable for real work — and everything after that (auth, gallery, WGSL, import) builds on a stable foundation.



*Last updated: February 7, 2026*