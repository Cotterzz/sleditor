# Tab Architecture: Refined Design

**Date:** November 4, 2025  
**Status:** Design Proposal

## The Core Problem

**User's key insights:**
1. ❌ Tab types ≠ Technology (WGSL graphics + audio = 1 backend, 1 compile)
2. ❌ Same tech, different UX (raw GLSL vs. boilerplate-wrapped GLSL)
3. ✅ Lazy loading by technology, not by tab (load WebGPU only if browser supports it)
4. ✅ Optional libraries (Three.js, etc.) should load on-demand

## The Solution: 3-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: TAB TYPES (UI/UX Layer)                        │
│ - How code appears to user                              │
│ - Editor behavior, boilerplate, display                 │
│ - Can share backends                                    │
└─────────────────────────────────────────────────────────┘
                    ↓ maps to
┌─────────────────────────────────────────────────────────┐
│ Layer 2: BACKENDS (Technology Layer)                    │
│ - Actual compilation & execution                        │
│ - Lazy-loaded by capability                            │
│ - Multiple tabs can use same backend                   │
└─────────────────────────────────────────────────────────┘
                    ↓ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 3: RENDERERS (API Abstraction)                   │
│ - WebGL, WebGPU, AudioWorklet, Three.js               │
│ - Load on first use                                    │
│ - May be shared across backends                        │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Tab Types (UI Definitions)

**Purpose:** Define HOW user writes/sees code

```javascript
// js/tab-types/fragment-glsl.js
export default {
    id: 'glsl_fragment',
    label: 'Fragment (GLSL)',
    icon: '🔺',
    
    // UI behavior
    editorType: 'graphics',        // Which Monaco instance
    language: 'glsl',
    
    // Backend mapping
    backend: 'glsl-fragment',      // Which backend compiles this
    
    // Code transformation
    wrapBoilerplate: true,         // Use boilerplate wrapper?
    getFullCode(userCode, state) {
        if (this.wrapBoilerplate) {
            return state.boilerplateEditor.getValue() + '\n' + userCode;
        }
        return userCode;
    },
    
    // Storage
    dbKey: 'glsl_fragment',
    
    // Lazy loading
    async load() {
        // Tab type itself is lightweight, just config
        return true;
    }
};

// js/tab-types/fragment-glsl-raw.js
export default {
    id: 'glsl_fragment_raw',
    label: 'Fragment Raw (GLSL)',
    icon: '🔺',
    editorType: 'graphics',
    language: 'glsl',
    backend: 'glsl-fragment',      // SAME backend as wrapped version
    wrapBoilerplate: false,        // Different: no boilerplate
    getFullCode(userCode) {
        return userCode;              // User provides everything
    },
    dbKey: 'glsl_fragment_raw'
};

// js/tab-types/audio-wgsl.js
export default {
    id: 'audio_gpu',
    label: 'Audio (WGSL)',
    icon: '🔊',
    editorType: 'audio',
    language: 'wgsl',
    backend: 'wgsl-unified',       // Shares backend with graphics!
    wrapBoilerplate: false,
    getFullCode(userCode) {
        return userCode;
    },
    dbKey: 'audio_gpu'
};

// js/tab-types/graphics-wgsl.js
export default {
    id: 'graphics',
    label: 'Graphics (WGSL)',
    icon: '🎨',
    editorType: 'graphics',
    language: 'wgsl',
    backend: 'wgsl-unified',       // SAME backend as audio!
    wrapBoilerplate: false,
    getFullCode(userCode) {
        return userCode;
    },
    dbKey: 'graphics'
};
```

---

## Layer 2: Backends (Compilation Units)

**Purpose:** Actual compilation and execution logic

```javascript
// js/backends/glsl-fragment.js
export default {
    id: 'glsl-fragment',
    
    // What does this backend need?
    dependencies: ['webgl'],       // Lazy-loads WebGL renderer
    
    // Can only have one GLSL tab active
    exclusiveWith: ['wgsl-unified'],
    
    async compile(tabs, state) {
        // tabs = array of tab objects that use this backend
        const fragmentTab = tabs.find(t => t.editorType === 'graphics');
        if (!fragmentTab) return false;
        
        const code = fragmentTab.getFullCode(fragmentTab.editor.getValue(), state);
        
        // Use WebGL renderer
        const renderer = await this.getRenderer('webgl');
        return renderer.compileFragmentShader(code, state);
    },
    
    render(time, state) {
        const renderer = this.getRenderer('webgl');
        renderer.render(time, state);
    }
};

// js/backends/wgsl-unified.js
export default {
    id: 'wgsl-unified',
    
    dependencies: ['webgpu', 'audio-gpu'],
    
    exclusiveWith: ['glsl-fragment'],
    
    async compile(tabs, state) {
        // BOTH graphics and audio tabs compile together!
        const graphicsTab = tabs.find(t => t.id === 'graphics');
        const audioTab = tabs.find(t => t.id === 'audio_gpu');
        
        let graphicsCode = null;
        let audioCode = null;
        
        if (graphicsTab) {
            graphicsCode = graphicsTab.getFullCode(
                graphicsTab.editor.getValue(), 
                state
            );
        }
        
        if (audioTab) {
            audioCode = audioTab.getFullCode(
                audioTab.editor.getValue(), 
                state
            );
        }
        
        // Single compile for both!
        const renderer = await this.getRenderer('webgpu');
        return renderer.compileUnified(graphicsCode, audioCode, state);
    },
    
    render(time, state) {
        const renderer = this.getRenderer('webgpu');
        renderer.render(time, state);
        renderer.renderAudio(time, state);
    }
};

// js/backends/three-js.js
export default {
    id: 'three-js',
    
    // Only load Three.js if user requests it
    dependencies: ['three'],       // Lazy-loads Three.js library
    
    async compile(tabs, state) {
        const tab = tabs[0];
        const code = tab.getFullCode(tab.editor.getValue(), state);
        
        const three = await this.getRenderer('three');
        return three.compileScene(code, state);
    },
    
    render(time, state) {
        const three = this.getRenderer('three');
        three.render(time, state);
    }
};
```

---

## Layer 3: Renderers (API Abstraction)

**Purpose:** Lazy-loaded API wrappers

```javascript
// js/renderers/renderer-registry.js
const RENDERER_LOADERS = {
    async webgl() {
        const module = await import('../backends/webgl.js');
        return module;
    },
    
    async webgpu() {
        // Only load if browser supports it
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }
        const module = await import('../backends/webgpu.js');
        return module;
    },
    
    async three() {
        // Load Three.js from CDN or local
        if (!window.THREE) {
            await loadScript('https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js');
        }
        const module = await import('../backends/three-renderer.js');
        return module;
    },
    
    async 'audio-gpu'() {
        const module = await import('../backends/audio-gpu.js');
        return module;
    }
};

// Cache loaded renderers
const loadedRenderers = new Map();

export async function getRenderer(name) {
    if (loadedRenderers.has(name)) {
        return loadedRenderers.get(name);
    }
    
    const loader = RENDERER_LOADERS[name];
    if (!loader) {
        throw new Error(`Unknown renderer: ${name}`);
    }
    
    const renderer = await loader();
    loadedRenderers.set(name, renderer);
    return renderer;
}
```

---

## The Compiler: Orchestrating Everything

```javascript
// js/compiler.js (refactored)
import { TAB_REGISTRY } from './tab-registry.js';
import { BACKEND_REGISTRY } from './backend-registry.js';

export async function reloadShader() {
    // 1. Get active tab objects
    const activeTabs = state.activeTabs.map(tabId => {
        const tabType = TAB_REGISTRY.find(t => t.id === tabId);
        return {
            ...tabType,
            editor: getEditorForTab(tabId, state)
        };
    });
    
    // 2. Group tabs by backend
    const backendGroups = new Map();
    for (const tab of activeTabs) {
        if (!backendGroups.has(tab.backend)) {
            backendGroups.set(tab.backend, []);
        }
        backendGroups.get(tab.backend).push(tab);
    }
    
    // 3. Compile each backend (each backend gets ALL its tabs)
    const results = [];
    for (const [backendId, tabs] of backendGroups) {
        const backend = BACKEND_REGISTRY.find(b => b.id === backendId);
        
        try {
            // Backend lazy-loads its dependencies
            const success = await backend.compile(tabs, state);
            results.push(success);
        } catch (e) {
            console.error(`Backend ${backendId} failed:`, e);
            results.push(false);
        }
    }
    
    return results.every(r => r);
}
```

---

## Tab Registry: Dynamic Loading

```javascript
// js/tab-registry.js
const TAB_TYPE_LOADERS = {
    'glsl_fragment': () => import('./tab-types/fragment-glsl.js'),
    'glsl_fragment_raw': () => import('./tab-types/fragment-glsl-raw.js'),
    'graphics': () => import('./tab-types/graphics-wgsl.js'),
    'audio_gpu': () => import('./tab-types/audio-wgsl.js'),
    'audio_worklet': () => import('./tab-types/audio-worklet.js'),
    'js': () => import('./tab-types/javascript.js'),
    'three_scene': () => import('./tab-types/three-scene.js'),  // Future!
};

// Load tab types on demand
const loadedTabs = new Map();

export async function getTabType(id) {
    if (loadedTabs.has(id)) {
        return loadedTabs.get(id);
    }
    
    const loader = TAB_TYPE_LOADERS[id];
    if (!loader) {
        throw new Error(`Unknown tab type: ${id}`);
    }
    
    const module = await loader();
    const tabType = module.default;
    loadedTabs.set(id, tabType);
    return tabType;
}

// For compatibility, load all default tabs at startup
export async function loadDefaultTabs() {
    const defaults = ['glsl_fragment', 'graphics', 'audio_gpu', 'audio_worklet', 'js'];
    await Promise.all(defaults.map(getTabType));
    return Array.from(loadedTabs.values());
}

export const TAB_REGISTRY = {
    async getAll() {
        await loadDefaultTabs();
        return Array.from(loadedTabs.values());
    },
    
    async get(id) {
        return await getTabType(id);
    },
    
    // Get available tab types (for "Add Tab" menu)
    async getAvailable() {
        const all = await this.getAll();
        
        // Filter based on browser capabilities
        return all.filter(tab => {
            if (tab.backend === 'wgsl-unified' && !navigator.gpu) {
                return false; // Hide WebGPU tabs if not supported
            }
            return true;
        });
    }
};
```

---

## Benefits of This Architecture

### ✅ Solves Your Concerns

1. **Tabs ≠ Technology**
   - WGSL graphics + audio → same backend → single compile ✓
   - Multiple tab types can share one backend ✓

2. **Same Tech, Different UX**
   - Raw GLSL vs wrapped GLSL → different tabs, same backend ✓
   - Easy to add variants ✓

3. **Lazy Loading by Capability**
   - WebGPU only loads if `navigator.gpu` exists ✓
   - Three.js only loads if user opens Three.js tab ✓
   - Each layer lazy-loads independently ✓

4. **Progressive Enhancement**
   - Core tabs load fast
   - Advanced tabs load on-demand
   - Backends load when first tab using them opens
   - Renderers load when first backend needs them

### ✅ Easy to Extend

**Add a new tab variant:**
```javascript
// js/tab-types/fragment-glsl-shadertoy.js
export default {
    id: 'glsl_fragment_shadertoy',
    label: 'Fragment (Shadertoy)',
    icon: '🎬',
    backend: 'glsl-fragment',      // Reuse existing backend
    wrapBoilerplate: true,
    getFullCode(userCode, state) {
        // Wrap in Shadertoy-style main function
        return `void mainImage(out vec4 c, in vec2 p) {\n${userCode}\n}\n` + 
               SHADERTOY_WRAPPER;
    }
};
```

**Add a new backend:**
```javascript
// js/backends/vulkan-compute.js
export default {
    id: 'vulkan-compute',
    dependencies: ['vulkan-api'],  // Would need adapter
    async compile(tabs, state) { /* ... */ }
};
```

**Add a new renderer:**
```javascript
// Just add to RENDERER_LOADERS
async babylon() {
    if (!window.BABYLON) {
        await loadScript('https://cdn.babylonjs.com/babylon.js');
    }
    return await import('../backends/babylon-renderer.js');
}
```

---

## Migration Path

### Phase 1: Create the layers (don't break anything)

1. Create new directories:
   ```
   js/
   ├── tab-types/          (NEW)
   ├── backends/           (EXISTS, refactor)
   ├── renderers/          (NEW, just registry)
   ```

2. Move existing backends to new pattern (keep old exports for compatibility)

3. Create tab-types that map to current behavior

4. Update compiler.js to use new architecture

### Phase 2: Enable lazy loading

1. Make tab-types load on-demand
2. Make renderers load on-demand
3. Keep backends that are "default" loaded at startup

### Phase 3: Add new capabilities

1. Add raw GLSL tab type
2. Add Three.js tab type + backend + renderer
3. Test lazy loading

---

## Example: Adding Three.js Support

```javascript
// 1. js/tab-types/three-scene.js
export default {
    id: 'three_scene',
    label: 'Three.js Scene',
    icon: '🎲',
    editorType: 'graphics',
    language: 'javascript',
    backend: 'three-js',
    getFullCode(userCode) { return userCode; },
    dbKey: 'three_scene'
};

// 2. js/backends/three-js.js (as shown above)

// 3. js/renderers/three-renderer.js
export function compileScene(code, state) {
    // Create Three.js scene from user code
    const scene = new THREE.Scene();
    // ... eval user code in sandbox that can access scene
    return true;
}

// 4. Add to tab-types/loaders
TAB_TYPE_LOADERS['three_scene'] = () => import('./tab-types/three-scene.js');

// 5. Add to renderer loaders
RENDERER_LOADERS['three'] = async () => { /* ... */ };
```

**User flow:**
1. User clicks "Add Tab" → "Three.js Scene"
2. Tab type loads (tiny, just config)
3. User writes code, clicks reload
4. Backend loads (moderate size)
5. Renderer loads Three.js library (large, from CDN)
6. Scene compiles and renders

**Total load time:** Only when user actually needs it!

---

## Recommendation

**Start with:**
1. ✅ Create the 3-layer structure
2. ✅ Migrate existing tabs/backends to new pattern (backwards compatible)
3. ✅ Keep everything loading at startup initially (no breaking changes)
4. ✅ Test thoroughly

**Then:**
1. ✅ Enable lazy loading (progressive enhancement)
2. ✅ Add first new tab type (raw GLSL or Three.js)
3. ✅ Iterate based on what works

**Want me to start implementing this?** I'd suggest starting with the structure and migrating one tab type (like `glsl_fragment`) to prove the pattern works, then expanding from there.

