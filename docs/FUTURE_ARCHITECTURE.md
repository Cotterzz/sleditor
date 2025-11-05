# Future Architecture & Development Strategy

**Date:** November 4, 2025  
**Current State:** Phase 3 Refactoring Complete (597 lines index.js, 53% reduction)

## Current Architecture Assessment

### ✅ Well-Organized Modules
```
js/
├── index.js (597 lines)          - Orchestration & initialization
├── core.js (180 lines)           - Global state management
├── ui.js (676 lines)             - UI controls, themes, panels
├── shader-management.js (546)    - Save/fork/edit workflow
├── compiler.js (316 lines)       - Shader compilation orchestration
├── editor.js (510 lines)         - Monaco editor integration
├── tabs.js                       - Tab UI management
├── tab-config.js                 - Tab definitions & mappings
├── save.js                       - LocalStorage/DB persistence
├── backend.js                    - Supabase integration
├── routing.js (116 lines)        - URL management
├── community.js (163 lines)      - Likes, views, comments
├── audio.js (45 lines)           - Audio initialization
├── render.js                     - Render loop
└── backends/                     - API abstractions
    ├── webgl.js (273 lines)
    ├── webgpu.js (304 lines)
    └── audio-worklet.js (186)
```

### 🎯 Your Goals

1. **Add more tech/passes/tab options** (compute shaders, buffer passes, multi-pass, etc.)
2. **Lazy loading/optional modules** (vim, advanced features)
3. **Mobile UI** (long-term: touch-friendly, simplified)
4. **Easy LLM development** (token efficiency, clear boundaries)

---

## Strategic Recommendations

### 🔥 Priority 1: Tab System Refactoring (CRITICAL)

**Problem:** Adding new tab types currently requires touching multiple files:
- `tab-config.js` - add config
- `tabs.js` - update UI logic
- `editor.js` - potentially add new editor instance
- `compiler.js` - add compilation logic
- `save.js` - ensure save/load works

**Solution:** Plugin-based tab architecture

```javascript
// js/tab-types/fragment-glsl.js
export const FragmentGLSLTab = {
    id: 'glsl_fragment',
    label: 'Fragment (GLSL)',
    icon: '🔺',
    dbKey: 'glsl_fragment',
    backend: 'webgl',
    
    // Plugin methods
    getEditor(state) { return state.graphicsEditor; },
    compile(code, state) { 
        return webgl.compileFragmentShader(code, state);
    },
    canCoexistWith(otherTab) {
        return otherTab.backend !== 'webgpu'; // GLSL vs WGSL exclusive
    }
};

// js/tab-registry.js
import { FragmentGLSLTab } from './tab-types/fragment-glsl.js';
import { GraphicsWGSLTab } from './tab-types/graphics-wgsl.js';
import { AudioGPUTab } from './tab-types/audio-gpu.js';
// ... etc

export const TAB_REGISTRY = [
    FragmentGLSLTab,
    GraphicsWGSLTab,
    AudioGPUTab,
    // Easy to add new types!
];
```

**Benefits:**
- ✅ Add new tab type = 1 new file
- ✅ Self-contained logic per tab type
- ✅ Easy for LLM to understand: "look at fragment-glsl.js to see how tabs work"
- ✅ Enables lazy loading (load tab plugin only when needed)

**Estimated effort:** Medium (2-3 hours, ~300 lines moved/restructured)

---

### 🔥 Priority 2: Lazy Module Loading

**Current problem:** Everything loads upfront, even if user never uses it.

**Solution:** Dynamic imports for optional features

```javascript
// js/index.js
async function init() {
    // Core modules - always load
    await editor.initMonaco();
    
    // Optional features - lazy load
    state.vimLoader = async () => {
        if (!state.vim) {
            const vim = await import('./vim.js');
            state.vim = vim;
            vim.applyToEditor(state.graphicsEditor);
        }
    };
    
    state.perfMonitorLoader = async () => {
        if (!state.perfMonitor) {
            const perf = await import('./perf-monitor.js');
            state.perfMonitor = perf;
        }
    };
}

// Load on demand
document.getElementById('toggleVim').addEventListener('click', async () => {
    await state.vimLoader();
    state.vim.toggle();
});
```

**Modules to make lazy:**
1. ✅ `vim.js` (only ~5% of users use it)
2. ✅ `perf-monitor.js` (dev tool, not always needed)
3. ✅ `comments.js` (only load when user opens comments)
4. ✅ Individual tab-type plugins (only load tabs user actually uses)

**Benefits:**
- ⚡ Faster initial page load
- 📦 Smaller initial bundle
- 🎯 User only downloads what they use

**Estimated effort:** Small (1-2 hours)

---

### 🔥 Priority 3: Compiler Architecture for Multi-Pass

**Current limitation:** Compiler assumes single graphics pass + audio

**Future needs:**
- Buffer passes (render to texture)
- Compute passes (GPGPU)
- Multi-pass effects (blur, bloom, etc.)
- Pass dependencies (A → B → Screen)

**Solution:** Pass graph architecture

```javascript
// js/pass-graph.js
export class PassGraph {
    constructor() {
        this.passes = [];
        this.dependencies = new Map();
    }
    
    addPass(pass) {
        this.passes.push(pass);
        if (pass.dependsOn) {
            this.dependencies.set(pass.id, pass.dependsOn);
        }
    }
    
    compile() {
        // Topological sort
        const sorted = this.topologicalSort();
        
        // Compile in dependency order
        for (const pass of sorted) {
            await pass.compile();
        }
    }
    
    render(time) {
        // Render in dependency order
        for (const pass of this.passes) {
            pass.render(time);
        }
    }
}

// Example usage
const graph = new PassGraph();
graph.addPass({
    id: 'buffer_a',
    type: 'fragment',
    target: 'texture',
    code: '...'
});
graph.addPass({
    id: 'main',
    type: 'fragment',
    target: 'screen',
    dependsOn: ['buffer_a'],
    code: '...'
});
```

**Benefits:**
- ✅ Enables Shadertoy-style buffer passes
- ✅ Enables compute shaders
- ✅ Clear dependency management
- ✅ Easy to visualize for users

**Estimated effort:** Large (4-6 hours, major refactor of compiler.js)

---

### 🔥 Priority 4: State Management Cleanup

**Current issue:** `state` object in `core.js` is a flat grab-bag (180 lines)

**Solution:** Namespaced state modules

```javascript
// js/state/editor-state.js
export const editorState = {
    graphicsEditor: null,
    audioEditor: null,
    jsEditor: null,
    boilerplateEditor: null,
    currentTab: 'glsl_fragment',
    activeTabs: ['glsl_fragment']
};

// js/state/render-state.js
export const renderState = {
    isRunning: false,
    isPlaying: false,
    startTime: 0,
    visualFrame: 0,
    canvasWidth: 800,
    canvasHeight: 600,
    // ...
};

// js/state/auth-state.js
export const authState = {
    currentUser: null,
    currentDatabaseShader: null,
    // ...
};

// js/core.js - becomes thin aggregator
import { editorState } from './state/editor-state.js';
import { renderState } from './state/render-state.js';
import { authState } from './state/auth-state.js';

export const state = {
    editor: editorState,
    render: renderState,
    auth: authState
};
```

**Benefits:**
- ✅ Clear state boundaries
- ✅ LLM can focus on relevant state subset
- ✅ Easier to reason about
- ✅ Enables potential state persistence/hydration

**Estimated effort:** Medium (2-3 hours)

---

### 🔥 Priority 5: Mobile UI Preparation

**Long-term goal, but prep now:**

**Strategy:** Abstract UI layer

```javascript
// js/ui/ui-adapter.js
export class UIAdapter {
    constructor(platform) {
        this.platform = platform; // 'desktop' | 'mobile'
    }
    
    showTabMenu(tabs) {
        if (this.platform === 'mobile') {
            // Bottom sheet or modal
            return this.showMobileTabMenu(tabs);
        } else {
            // Current dropdown
            return this.showDesktopTabMenu(tabs);
        }
    }
    
    // ... other UI methods
}

// Easy to swap entire UI later
const ui = new UIAdapter(isMobile() ? 'mobile' : 'desktop');
```

**Benefits:**
- 🎯 Isolates platform-specific UI logic
- 📱 Makes mobile UI a "swap" not a "rewrite"
- 🧪 Easier to test different UIs

**Estimated effort:** Medium (3-4 hours)

---

## 📋 Recommended Implementation Order

### Phase 4: Foundation for Growth (Next Steps)

**4A. Lazy Loading** (Quick win, immediate benefits)
- [ ] Make vim.js lazy-loaded
- [ ] Make perf-monitor.js lazy-loaded
- [ ] Make comments.js lazy-loaded
- **Effort:** 1-2 hours
- **Benefit:** Faster load, cleaner architecture

**4B. State Management** (Better organization)
- [ ] Split state into namespaced modules
- [ ] Update all state references
- **Effort:** 2-3 hours
- **Benefit:** Clearer boundaries, easier LLM navigation

**4C. Tab Plugin System** (CRITICAL for your goals)
- [ ] Create `js/tab-types/` directory
- [ ] Extract each tab type to plugin
- [ ] Update `tab-config.js` → `tab-registry.js`
- [ ] Update tabs.js and compiler.js to use plugins
- **Effort:** 3-4 hours
- **Benefit:** Easy to add new tab types (your #1 goal!)

### Phase 5: Multi-Pass Support (Future)

**5A. Pass Graph Architecture**
- [ ] Create `js/pass-graph.js`
- [ ] Refactor compiler.js to use passes
- [ ] Add buffer pass tab type
- [ ] Add compute pass tab type
- **Effort:** 4-6 hours
- **Benefit:** Enables advanced shader techniques

### Phase 6: Mobile Preparation (Future)

**6A. UI Adapter Layer**
- [ ] Create `js/ui/ui-adapter.js`
- [ ] Abstract platform-specific UI
- [ ] Create mobile prototypes
- **Effort:** 3-5 hours
- **Benefit:** Future-proofs for mobile

---

## 🤖 LLM Development Optimization

**Current strengths:**
- ✅ Clear module boundaries
- ✅ Well-documented (Phase docs)
- ✅ Consistent patterns

**To improve:**

1. **Module README files** (1 per complex module)
   ```markdown
   # js/compiler.js
   
   **Purpose:** Orchestrates shader compilation across backends
   **Dependencies:** webgl.js, webgpu.js, audio.js
   **Entry Points:** reloadShader(), stopAudio()
   **State Used:** state.graphicsBackend, state.activeTabs
   ```

2. **Architecture decision records** (ADRs)
   - Why wrapper functions were removed
   - Why compiler.js is separate from backends
   - Tab naming rationale

3. **Function complexity metrics**
   - Keep functions under 50 lines when possible
   - Split large functions into smaller ones
   - Current `ui.js` (676 lines) could be split further

---

## 🎯 My Recommendation: Start with 4A + 4C

**Why:**
1. **4A (Lazy Loading)** is a quick win - makes everything faster
2. **4C (Tab Plugins)** directly enables your goal of adding more tab types
3. Both improve LLM-friendliness (clearer boundaries, smaller files)
4. Both are relatively safe (minimal risk of breaking existing functionality)

**After that:**
- Test thoroughly
- Add your first new tab type (compute shader? buffer pass?)
- See how the plugin system feels
- Iterate on the architecture

**Want me to start on 4A (lazy loading) or 4C (tab plugins)?** Or would you prefer a different approach? 🚀

