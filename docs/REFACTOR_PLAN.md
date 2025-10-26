# 🔄 REFACTOR PLAN - SLEditor (Shader Language Editor)

**Current Status:** ~3,500 lines in single HTML file, working WebGPU + AudioWorklet support  
**Target:** Modular architecture with clear separation of concerns  

---

## 📋 Phase 1: Extract Backends (Rendering Systems)

### **Goal:** Separate rendering technologies into independent modules

### **New File Structure:**
```
sleditor/
├── index.html                    # Thin initialization, ~200 lines
├── css/
│   └── app.css                   # All styles (move inline styles here)
├── js/
│   ├── core.js                   # State, constants, DERIVED config
│   ├── backends/
│   │   ├── webgpu.js            # WebGPU backend (WGSL graphics + audio)
│   │   ├── webgl.js             # WebGL backend (GLSL graphics + audio) [FUTURE]
│   │   └── audio-worklet.js     # AudioWorklet backend
│   ├── render.js                 # Main render loop, coordinates backends
│   ├── editor.js                 # Monaco integration, language switching
│   ├── tabs.js                   # Tab management, UI state
│   ├── save.js                   # Gallery, localStorage, thumbnails
│   ├── vim.js                    # Vim mode integration
│   ├── js-runtime.js            # User JS compilation, enterframe execution
│   └── examples.js               # Already externalized ✓
├── content/
│   └── help.txt                  # Already externalized ✓
└── thumbnails/                   # Already exists ✓
```

---

## 🏗️ Module Responsibilities

### **`core.js`** - Shared Application State
```javascript
export const CONFIG = { /* ... */ };
export const DERIVED = { /* computed from CONFIG */ };
export const AUDIO_MODES = { NONE: 0, GPU: 1, WORKLET: 2 };
export const UNIFORM_STRUCT = { /* ... */ };

export const state = {
  hasWebGPU: false,
  hasWebGL: false,
  activeBackend: null,  // 'webgpu', 'webgl', or null
  // ... all current state
};

export function updateDerived() { /* recalc DERIVED */ }
```

### **`backends/webgpu.js`** - WebGPU Backend
```javascript
export async function init(canvas) {
  // Initialize WebGPU, create device, context, resources
  // Returns: { success: true/false, device, context, resources }
}

export async function compile(boilerplate, graphics, audioGPU) {
  // Compile WGSL shader module
  // Create graphics + audio pipelines
  // Returns: { success, pipelines, errors }
}

export function renderFrame(uniforms, userState) {
  // Execute graphics pass
  // Execute audio pass if needed
  // Write uniforms, submit command encoder
}

export function cleanup() {
  // Destroy pipelines, buffers, context
}
```

### **`backends/webgl.js`** - WebGL Backend [FUTURE - GLSL Support]
```javascript
export async function init(canvas) {
  // Initialize WebGL2 context
  // Setup extensions, VAO, etc.
}

export async function compile(vertexShader, fragmentShader, audioCompute) {
  // Compile GLSL shaders
  // Create programs, link
  // Setup audio compute (transform feedback or compute shader if available)
}

export function renderFrame(uniforms, userState) {
  // Bind programs, set uniforms
  // Draw fullscreen quad
  // Execute audio compute if needed
}

export function cleanup() {
  // Delete programs, buffers, textures
}
```

### **`backends/audio-worklet.js`** - AudioWorklet Backend
```javascript
export async function init(audioContext, gainNode) {
  // Setup AudioWorklet context
}

export async function load(code) {
  // Generate unique processor name
  // Create blob URL, addModule
  // Create AudioWorkletNode, connect to gainNode
  // Returns: { success, node, errors }
}

export function send(data) {
  // Post message to worklet
}

export function cleanup() {
  // Disconnect and destroy worklet node
}
```

### **`render.js`** - Main Render Loop
```javascript
import * as webgpu from './backends/webgpu.js';
import * as webgl from './backends/webgl.js';
import * as jsRuntime from './js-runtime.js';

export function render(rawTime) {
  // Calculate elapsed time, update counters
  
  // Non-GPU mode (JS + AudioWorklet only)
  if (!state.activeBackend) {
    jsRuntime.callEnterframe(elapsedSec);
    requestAnimationFrame(render);
    return;
  }
  
  // GPU mode
  const uniforms = buildUniformData(elapsedSec);
  
  // Call enterframe BEFORE rendering
  jsRuntime.callEnterframe(elapsedSec, uniforms);
  
  // Render with active backend
  if (state.activeBackend === 'webgpu') {
    webgpu.renderFrame(uniforms, state.userState);
  } else if (state.activeBackend === 'webgl') {
    webgl.renderFrame(uniforms, state.userState);
  }
  
  requestAnimationFrame(render);
}
```

### **`editor.js`** - Monaco Integration
```javascript
export async function initMonaco(callback) {
  // Load Monaco, register WGSL/GLSL languages
  // Create editor instances
  // Setup error marker system
}

export function setWGSLErrors(errors) { /* ... */ }
export function setGLSLErrors(errors) { /* ... */ }
export function setJSErrors(errors) { /* ... */ }
export function setAudioWorkletErrors(errors) { /* ... */ }
export function clearAllErrors() { /* ... */ }

export function switchLanguage(editor, language) {
  monaco.editor.setModelLanguage(editor.getModel(), language);
}
```

### **`tabs.js`** - Tab Management
```javascript
export function renderTabs() { /* ... */ }
export function switchTab(tabName) { /* ... */ }
export function addTab(tabName) { /* ... */ }
export function removeTab(tabName) { /* ... */ }
export function showAddPassMenu() { /* ... */ }
```

### **`save.js`** - Gallery & Persistence
```javascript
export function getAllSavedShaders() { /* ... */ }
export function saveShaderToStorage(data) { /* ... */ }
export function loadSavedShader(id) { /* ... */ }
export function deleteSavedShader(id) { /* ... */ }
export function captureThumbnail() { /* ... */ }
export function populateGallery() { /* ... */ }
```

### **`vim.js`** - Vim Mode
```javascript
export async function loadVimLibrary() {
  // Async load monaco-vim (already fixed AMD race)
}

export function applyVimMode(editors) { /* ... */ }
export function disableVimMode() { /* ... */ }
```

### **`js-runtime.js`** - User JS Execution
```javascript
export function compile(code) {
  // Compile user JS (init + enterframe)
  // Parse errors, set markers
  // Returns: { success, state, enterframe }
}

export function callEnterframe(elapsedSec, uniforms = null) {
  // Build API object (audio.send, uniforms.setFloat, etc.)
  // Call state.userEnterframe(state.userState, api)
  // Catch and report runtime errors
}

export function parseJSError(err, codeLines) { /* ... */ }
```

---

## 🎨 Phase 2: Move Inline Styles to CSS

### **Current Issues:**
- Styles scattered across JavaScript (`style.cssText = ...`)
- Inline styles in HTML elements
- Hard to maintain consistent theming

### **Target CSS Structure:**
```css
/* app.css */

/* ===== EXISTING STYLES ===== */
/* Already good, keep as-is */

/* ===== MOVE THESE FROM JS ===== */
.webgpu-unavailable-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  color: var(--text-primary);
  text-align: center;
  padding: 40px;
  z-index: 10;
}

.webgpu-unavailable-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.webgpu-unavailable-title {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 12px;
}

.webgpu-unavailable-message {
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 400px;
  line-height: 1.6;
}

/* ===== CONSOLIDATE GALLERY STYLES ===== */
/* Already mostly in CSS, but check for inline overrides in populateGallery() */

/* ===== ADD PASS MENU ===== */
/* Already in CSS, good */

/* ===== OPTIONS MENU ===== */
/* Already in CSS, good */

/* ===== VIM STATUS BAR ===== */
/* Already in CSS, good */
```

### **Actions:**
1. Search for all `element.style.cssText = ` in code
2. Move to CSS classes
3. Update JS to use `element.className = 'new-class'`
4. Search for `style="..."` in HTML, move to CSS

---

## 🚀 Phase 3: Future Development Roadmap

### **Priority 1: GLSL Support** 🎯 **(NEXT)**
**Estimated:** +600 lines across multiple modules

**Implementation:**
1. Create `backends/webgl.js`
2. Add GLSL language definition to `editor.js`:
   ```javascript
   monaco.languages.register({ id: 'glsl' });
   monaco.languages.setMonarchTokensProvider('glsl', GLSL_MONARCH_TOKENS);
   ```
3. Add `graphics_glsl` and `audio_glsl` tab types to `tabs.js`
4. Update `render.js` to support WebGL backend
5. Add GLSL examples to `examples.js`:
   ```javascript
   shadertoy_port: {
     name: "Shadertoy Port",
     tabs: ["graphics_glsl"],
     webglRequired: true,
     graphics_glsl: `
       void mainImage(out vec4 fragColor, in vec2 fragCoord) {
         vec2 uv = fragCoord / iResolution.xy;
         fragColor = vec4(uv, 0.5, 1.0);
       }
     `
   }
   ```
6. Handle Shadertoy compatibility:
   - Auto-wrap in boilerplate (`uniform vec2 iResolution`, etc.)
   - Map `mainImage` to fragment shader output
   - Provide common uniforms (time, mouse, audio)

**GLSL Audio Options:**
- **Option A:** Transform Feedback (write to buffer, read in JS, send to Web Audio)
- **Option B:** Fragment shader pixel sum (sum audio samples as pixel colors)
- **Option C:** WebGL2 Compute Shaders (if available)

### **Priority 2: Data Backend** 🗄️
**Goal:** User accounts, cloud storage, sharing

**Options:**
- **Supabase** (recommended): PostgreSQL + Auth + Storage + Realtime
- **Firebase**: Auth + Firestore + Storage

**New Modules:**
```
js/
├── auth.js          - OAuth, user sessions
├── database.js      - CRUD operations for shaders
└── community.js     - Comments, likes, featured shaders
```

**Features:**
1. User accounts (GitHub/Google OAuth)
2. Cloud shader storage (unlimited vs. 10 local slots)
3. Public gallery with search/tags
4. Shader versions/history
5. Comments and ratings
6. Featured/trending shaders
7. Forking shaders

**Security Consideration:**
- JS `eval()` is insecure for user-shared code
- **Solution:** Server-side JS sandbox (Web Workers on server, or V8 isolates)
- Or: Use WASM-compiled JS runtime in worker

### **Priority 3: Enhanced WGSL Features** 🔧
**Goal:** Multiple entry points, advanced GPU features

**Features:**
1. **Multiple Graphics Passes:**
   ```wgsl
   @compute fn pass1_main() { /* ... */ }
   @compute fn pass2_main() { /* ... */ }
   ```
   - Ping-pong buffers
   - Post-processing chains
   - Multi-stage rendering

2. **Module-Scope Variables:**
   - `var<workgroup>` (already supported via concatenation)
   - `var<private>` (already supported)
   - Test and document usage patterns

3. **Storage Buffers:**
   - Allow user to define custom buffers
   - Persistent data across frames
   - Feedback loops

4. **Compute Shader Helpers:**
   - Expose more built-ins in boilerplate
   - Helper functions for common patterns
   - Math library (noise, SDF, etc.)

### **Priority 4: Additional Features** 📦

**A. Better JS Compilation**
- Replace `eval()` with Web Worker sandbox
- Server-side compilation (with backend)
- AST analysis for better error messages

**B. Multi-Monitor / Canvas Output**
- Multiple canvases with different shaders
- Synchronized playback
- Video export (Canvas → MediaRecorder)

**C. Live Coding Features**
- Hot-reload without restart
- Undo/redo for code changes
- Code snippets library
- Auto-save drafts

**D. Performance Tools**
- GPU profiler integration
- Frame time graph
- Shader complexity analyzer
- Optimization suggestions

**E. Mobile Support**
- Touch controls for mouse input
- Responsive layout (one panel at a time)
- Mobile GPU detection
- Simpler examples for mobile

---

## 📝 Refactor Checklist

### **Pre-Refactor**
- [ ] Create `js/backends/` directory
- [ ] Test current functionality thoroughly

### **Step 1: Extract Core**
- [ ] Create `js/core.js`
- [ ] Move `CONFIG`, `DERIVED`, constants
- [ ] Move `state` object
- [ ] Export all needed by other modules
- [ ] Update `index.html` to import `core.js`
- [ ] Test - app should still work

### **Step 2: Extract WebGPU Backend**
- [ ] Create `js/backends/webgpu.js`
- [ ] Move `initWebGPU()`, `createGPUResources()`
- [ ] Move WebGPU compilation logic from `reloadShader()`
- [ ] Export clean interface: `init()`, `compile()`, `renderFrame()`, `cleanup()`
- [ ] Update `index.html` to import and use
- [ ] Test - WebGPU shaders should work

### **Step 3: Extract AudioWorklet Backend**
- [ ] Create `js/backends/audio-worklet.js`
- [ ] Move `loadAudioWorklet()`, error handling
- [ ] Export: `init()`, `load()`, `send()`, `cleanup()`
- [ ] Update imports
- [ ] Test - AudioWorklet should work

### **Step 4: Extract Render Loop**
- [ ] Create `js/render.js`
- [ ] Move `render()` function
- [ ] Move `renderSingleFrame()`
- [ ] Coordinate backends
- [ ] Export `render()`, `renderSingleFrame()`
- [ ] Update imports
- [ ] Test - rendering should work in all modes

### **Step 5: Extract Editor**
- [ ] Create `js/editor.js`
- [ ] Move `initMonaco()`, editor creation
- [ ] Move error marker functions
- [ ] Move language definitions (WGSL_MONARCH_TOKENS, etc.)
- [ ] Export editor API
- [ ] Update imports
- [ ] Test - Monaco should work, errors should display

### **Step 6: Extract JS Runtime**
- [ ] Create `js/js-runtime.js`
- [ ] Move `compileUserJS()`, `parseJSError()`
- [ ] Move enterframe calling logic
- [ ] Build API object (audio.send, uniforms, etc.)
- [ ] Export compile and execute functions
- [ ] Test - JS enterframe should work

### **Step 7: Extract Tabs**
- [ ] Create `js/tabs.js`
- [ ] Move tab rendering, switching
- [ ] Move add/remove tab logic
- [ ] Move menu creation (Add Pass, Options)
- [ ] Export tab API
- [ ] Test - tab switching should work

### **Step 8: Extract Save/Gallery**
- [ ] Create `js/save.js`
- [ ] Move localStorage functions
- [ ] Move gallery population
- [ ] Move thumbnail capture
- [ ] Export save API
- [ ] Test - saving/loading should work

### **Step 9: Extract Vim**
- [ ] Create `js/vim.js`
- [ ] Move vim loading logic
- [ ] Move `applyVimMode()`, `toggleVimMode()`
- [ ] Export vim API
- [ ] Test - vim mode should work

### **Step 10: Move Styles to CSS**
- [ ] Find all `.style.cssText =` in code
- [ ] Create CSS classes in `app.css`
- [ ] Replace JS style manipulation with class toggles
- [ ] Find all inline `style="..."` in HTML
- [ ] Move to CSS classes
- [ ] Test - styling should be identical

### **Step 11: Clean Up index.html**
- [ ] Should only have:
  - HTML structure
  - Module imports
  - Initialization calls
  - Event listeners (delegated to modules)
- [ ] Target: ~200 lines
- [ ] Test - everything should still work

### **Post-Refactor**
- [ ] Test all features in Chrome
- [ ] Test all features in Firefox
- [ ] Test WebGPU mode
- [ ] Test non-WebGPU mode
- [ ] Test vim mode
- [ ] Test saving/loading
- [ ] Test error reporting (WGSL, JS, AudioWorklet)
- [ ] Test all examples
- [ ] Commit refactored code

---

## ⚠️ Common Pitfalls to Avoid

1. **Module Import Order:** Core must load first, then backends, then render
2. **State Access:** All modules must import state from `core.js`, not duplicate
3. **Circular Dependencies:** If A imports B and B imports A, refactor
4. **Global Leakage:** Don't use `window.X` unless necessary (Monaco, vim)
5. **Event Handlers:** Make sure listeners are still attached after refactor
6. **Async Initialization:** Some modules need `await init()` before use

---

## 🎯 Success Criteria

**Refactor is complete when:**
- [ ] `index.html` is < 300 lines
- [ ] Each module < 500 lines
- [ ] All features work identically to before
- [ ] No inline styles in JS (except dynamic values)
- [ ] Clear module boundaries with documented exports
- [ ] Easy to add GLSL backend (just create `webgl.js`, import in `render.js`)

**Ready for GLSL when:**
- [ ] WebGPU backend is fully modular
- [ ] Render loop can switch backends
- [ ] Editor can handle multiple shader languages
- [ ] Examples support backend-specific code

**Ready for Backend when:**
- [ ] All client code is modular and testable
- [ ] Auth can be added without touching rendering code
- [ ] Database can be added without touching editor code

---

**Good luck, future me! 🚀**

