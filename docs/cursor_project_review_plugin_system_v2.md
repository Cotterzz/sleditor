# Project review, plugin system, V2 roadmap
_Exported on 1/23/2026 at 23:04:19 GMT from Cursor (2.3.15)_

---

**User**

Can you read GUIDELINES.md to get up to speed.

Then I would like your commentary on the following:

1. How is the project looking? Is it organised, obeying the guidelines etc. Are there any areas of concern?

2. I want to consider a plugin system - some of the legacy project's features might make more sense as optional extras:
shadertoy browser & importer
AI assist functionality (though backend exists for this too)
Vim plugin for monaco
Video recording
Plus other experimental features from sleditor/lab/ not yet included in legacy

A plugin system would necessaitet that the core app isnt aware fo the plugins unless they are seleceted/loaded right?
We would need to make sure its possible for a plugin to be able to communicate with and extend the core app.

The advantage is that it would simplify and optimise the core app, plus make adding complexity to the app more manageable and modular.

So a viablity audit would be great.

3. Thirdly.
What do you think is the next logical thing to develop with V2. Candidates are
   a. build out the UI so it's complete and ready for everythign to drop in
   b. plugin system, if viable
   c. finish the core rendering/shader editing functionality - media, audio etc.
   d. webGPU/wgsl
   e. refactor/tidy and fix issues in current build.

---

**Cursor**

I'll read the GUIDELINES.md file to understand the V2 project structure and guidelines, then provide my analysis.

Now let me explore the V2 codebase to assess its current state and organization.

Now let me provide a comprehensive analysis based on the GUIDELINES.md and codebase review.

---

## 1. PROJECT ORGANIZATION & ADHERENCE TO GUIDELINES

### ✅ **Overall Assessment: EXCELLENT**

The V2 project is **exceptionally well-organized** and demonstrates strong architectural discipline:

**Strengths:**
- **Four Pillars Implementation**: The codebase strictly follows the event bus, namespaced state, managers, and reactive UI patterns
- **File Structure**: Perfect adherence to the guidelines - every file is exactly where it should be
- **Event-Driven Architecture**: `events.js` has 50+ well-named events, managers emit appropriately, UI subscribes reactively
- **State Management**: Clean namespaced state with no global pollution
- **Code Quality**: Manager files (`ShaderManager.js`, etc.) are well-documented with clear single responsibilities
- **Initialization**: Clean step-based init in `app.js` with proper error handling
- **Logger Usage**: Consistent use of structured logging instead of console.log

**Specific Wins:**
1. **ShaderManager** (1790 lines) - Massive but well-structured with clear sections, proper event emissions, single source of truth for shader code
2. **Event Constants** - All event names are discoverable in `EVENTS` object
3. **Media Panel** - Excellent example of dynamic tabs, proper component separation
4. **CSS Discipline** - The guidelines show awareness of inline style issues and correct patterns

### ⚠️ **Minor Areas of Concern:**

1. **Empty Compiler Directory** - `/V2/js/compiler/` exists but is empty. The GUIDELINES mention this as "Future" but compilation logic is currently in ShaderManager + WebGL renderer
2. **CSS Issues Acknowledged** - Guidelines document existing inline style problems in some panels (media.js, shader-controls.js) - these need cleanup
3. **Layout Restoration Disabled** - `restoreLayout()` is disabled due to SLUI bug with tabbed windows. This is documented but needs fixing
4. **Some Duplication** - Guidelines mention duplicate Select components and inline dropdowns that should use SLUI components

### 📊 **Guideline Compliance Score: 9/10**

The project follows its own guidelines better than most production codebases I've seen. The areas of non-compliance are:
- Documented (inline styles issue)
- Temporary workarounds (layout restoration)
- Planned future work (compiler separation)

---

## 2. PLUGIN SYSTEM VIABILITY AUDIT

### ✅ **VERDICT: HIGHLY VIABLE**

The V2 architecture is **exceptionally well-suited** for a plugin system. Here's why:

### **Advantages:**

1. **Event Bus is Plugin-Ready**
   - Plugins can subscribe to any event without core app awareness
   - Plugins can emit events that core app or other plugins can consume
   - The wildcard listener (`'*'`) already exists for debugging/logging

2. **Clean Manager Pattern**
   - Managers don't import each other - they communicate via events
   - Plugins can provide new managers without coupling to existing ones

3. **SLUI Panel System**
   - Already supports dynamic panel registration
   - Panels are completely isolated - perfect plugin boundary
   - Plugins can register panels, tabs, buttons, etc.

4. **Namespaced State**
   - Plugins can have their own state namespace (`state.plugins.myPlugin`)
   - No risk of trampling core state

### **Implementation Strategy:**

```javascript
// V2/js/core/plugins.js (NEW FILE)

class PluginManager {
    #plugins = new Map();
    #loadedPlugins = new Set();
    
    /**
     * Register a plugin definition
     */
    register(plugin) {
        // Plugin shape:
        // {
        //   id: 'vim-mode',
        //   name: 'Vim Editor Mode',
        //   version: '1.0.0',
        //   dependencies: ['editor'],
        //   init: async (context) => { ... },
        //   destroy: async () => { ... }
        // }
        this.#plugins.set(plugin.id, plugin);
    }
    
    /**
     * Load a plugin
     */
    async load(pluginId) {
        const plugin = this.#plugins.get(pluginId);
        if (!plugin) throw new Error(`Plugin ${pluginId} not registered`);
        
        // Check dependencies
        for (const dep of plugin.dependencies || []) {
            if (!this.#loadedPlugins.has(dep)) {
                throw new Error(`Missing dependency: ${dep}`);
            }
        }
        
        // Create plugin context (controlled API access)
        const context = {
            events,
            state,
            SLUI: window.SLUI,
            logger,
            // Restrict what plugins can do:
            registerPanel: (panelDef) => SLUI.registerPanel(panelDef),
            registerCommand: (cmd) => { /* ... */ },
            // Add plugin-specific state namespace
            getState: () => {
                if (!state.plugins[pluginId]) {
                    state.plugins[pluginId] = {};
                }
                return state.plugins[pluginId];
            }
        };
        
        // Initialize plugin
        await plugin.init(context);
        this.#loadedPlugins.add(pluginId);
        
        events.emit(EVENTS.PLUGIN_LOADED, { pluginId });
    }
    
    /**
     * Unload a plugin
     */
    async unload(pluginId) {
        const plugin = this.#plugins.get(pluginId);
        if (plugin?.destroy) {
            await plugin.destroy();
        }
        this.#loadedPlugins.delete(pluginId);
        events.emit(EVENTS.PLUGIN_UNLOADED, { pluginId });
    }
}

export const pluginManager = new PluginManager();
```

### **Example Plugin: Shadertoy Browser**

```javascript
// V2/js/plugins/shadertoy-browser.js

export default {
    id: 'shadertoy-browser',
    name: 'Shadertoy Browser & Importer',
    version: '1.0.0',
    dependencies: [],
    
    async init(context) {
        const { SLUI, events, EVENTS, logger } = context;
        
        // Register panel
        SLUI.registerPanel({
            id: 'shadertoy-browser',
            title: 'Shadertoy',
            icon: '🎨',
            createContent: () => {
                // Full Shadertoy browser UI
                return this.createBrowserUI(context);
            }
        });
        
        // Listen for import requests
        events.on('shadertoy:import', async (shaderUrl) => {
            const shader = await this.importShader(shaderUrl);
            events.emit(EVENTS.SHADER_LOADED, shader);
        });
        
        logger.info('Plugin', 'Shadertoy', 'Loaded');
    },
    
    async destroy() {
        // Cleanup if needed
    },
    
    createBrowserUI(context) {
        // ... implementation
    },
    
    async importShader(url) {
        // ... implementation (reuse V1 logic)
    }
};
```

### **Plugin Loading:**

```javascript
// V2/js/app.js - Add step

step('Plugins', async () => {
    const enabledPlugins = CONFIG.PLUGINS || [];
    
    for (const pluginId of enabledPlugins) {
        try {
            const module = await import(`./plugins/${pluginId}.js`);
            pluginManager.register(module.default);
            await pluginManager.load(pluginId);
        } catch (e) {
            logger.error('Plugins', pluginId, `Failed to load: ${e.message}`);
        }
    }
});
```

### **Candidate Plugins:**

| Feature | Plugin Viability | Notes |
|---------|-----------------|-------|
| **Shadertoy Browser** | ✅ **Perfect** | Self-contained, only needs event integration |
| **AI Assist** | ✅ **Perfect** | Already has backend, can be optional panel |
| **Vim Mode** | ✅ **Perfect** | Monaco extension, no core changes needed |
| **Video Recording** | ✅ **Good** | Needs renderer access (can provide via context) |
| **Lab Experiments** | ⚠️ **Partial** | Some may need core integration |

### **Concerns & Solutions:**

1. **Plugin Dependencies on Core APIs**
   - ✅ **Solution**: Provide controlled context object with vetted APIs
   
2. **Plugin Performance Impact**
   - ✅ **Solution**: Lazy loading, load only enabled plugins
   
3. **Plugin Breaking Changes**
   - ✅ **Solution**: Versioned context API, deprecation warnings
   
4. **Security**
   - ⚠️ **Note**: Plugins have full JS access. If loading third-party plugins, need sandboxing

### **Migration Path:**

For V1 features → V2 plugins:
1. Extract feature code to plugin file
2. Wrap with plugin API
3. Replace direct imports with event emissions
4. Test in isolation
5. Add to plugin catalog

---

## 3. NEXT LOGICAL DEVELOPMENT STEP

### **Recommendation: **(c) Finish Core Rendering/Shader Editing Functionality**

**Rationale:**

Looking at the current state:
- ✅ **UI Framework**: SLUI is working, panels are registering
- ✅ **Architecture**: Events, state, managers are solid
- ⚠️ **Core Functionality**: Only basic single-pass GLSL works, multipass not integrated, no media inputs

**The app needs to be functionally complete before optimization or expansion.**

### **Priority Order:**

#### **Phase 1: Media & Channels (2-3 weeks)**
1. **Integrate V1 channel system** (`/js/channels.js`) via ChannelManager wrapper
2. **Complete media loaders**:
   - Texture loading (catalog already there, just wire it up)
   - Audio input (FFT, waveform) - V1 code exists
   - Video input - V1 code exists
   - Webcam - V1 code exists
   - Cubemaps - V1 code exists
   - Volume textures - V1 code exists

3. **Wire media panel to renderer**:
   - When user selects texture → emit `MEDIA_SELECTED` event
   - ChannelManager allocates channel number
   - Renderer binds texture to that channel
   - Shader can access via `iChannel0/1/2...`

**Why first**: This is core Shadertoy functionality. Without it, V2 can't render 90% of existing shaders.

#### **Phase 2: Multipass Rendering (1-2 weeks)**
1. **Integrate V1 WebGL multipass** (`/js/backends/webgl.js`)
2. **Implement BufferA/B/C/D support**:
   - Already in state and UI
   - Renderer needs to compile all passes
   - Set up framebuffers and ping-pong buffers
   - Bind previous outputs as textures

**Why second**: Many advanced shaders need multipass. Once media is working, this completes GLSL feature parity.

#### **Phase 3: Polish & Testing (1 week)**
1. **Fix known issues**:
   - Layout restoration bug
   - Inline style cleanup (media.js, shader-controls.js)
   - Component duplication (use SLUI.Select everywhere)

2. **Test suite**:
   - Load example shaders from V1
   - Verify multipass works
   - Test all media types

**Then consider:**

#### **Phase 4: Plugin System** (if viable) OR **WebGPU** (if ambitious)

**Plugin system arguments:**
- ✅ Makes codebase cleaner
- ✅ AI assist, Shadertoy browser, video recording can be optional
- ✅ Easier to maintain
- ⚠️ Takes time to design API properly

**WebGPU arguments:**
- ✅ Future-proof
- ✅ Unique selling point
- ⚠️ Complex, may delay GLSL feature completion

### **Alternative: (a) Build Out Complete UI**

**If you prioritize polish over features:**
- Finish gallery panel
- Add auth UI
- Complete shader info panel
- Add keyboard shortcuts
- Improve mobile experience

**Why not first:** The UI is already functional enough to develop features. Polish can wait until features work.

---

## **FINAL RECOMMENDATIONS**

1. **Immediate (this week):**
   - Fix `ChannelManager.js` to actually wire up media → renderer
   - Complete texture loading in media panel
   - Test with a shader that uses `iChannel0`

2. **Short term (1-2 months):**
   - Complete all media inputs
   - Integrate multipass rendering
   - Clean up CSS/component issues

3. **Medium term (2-4 months):**
   - Design and implement plugin system
   - Move AI assist, Shadertoy browser to plugins
   - Consider WebGPU support

4. **Long term:**
   - Port lab experiments as plugins
   - Advanced features (node editor, shader debugger)
   - Community plugin ecosystem

The project is in **excellent shape architecturally**. The foundation is solid. Now it needs **feature completion** to match V1's capabilities, then **plugin extensibility** to exceed them.

```javascript
// V2/js/core/plugins.js (NEW FILE)

class PluginManager {
    #plugins = new Map();
    #loadedPlugins = new Set();
    
    /**
     * Register a plugin definition
     */
    register(plugin) {
        // Plugin shape:
        // {
        //   id: 'vim-mode',
        //   name: 'Vim Editor Mode',
        //   version: '1.0.0',
        //   dependencies: ['editor'],
        //   init: async (context) => { ... },
        //   destroy: async () => { ... }
        // }
        this.#plugins.set(plugin.id, plugin);
    }
    
    /**
     * Load a plugin
     */
    async load(pluginId) {
        const plugin = this.#plugins.get(pluginId);
        if (!plugin) throw new Error(`Plugin ${pluginId} not registered`);
        
        // Check dependencies
        for (const dep of plugin.dependencies || []) {
            if (!this.#loadedPlugins.has(dep)) {
                throw new Error(`Missing dependency: ${dep}`);
            }
        }
        
        // Create plugin context (controlled API access)
        const context = {
            events,
            state,
            SLUI: window.SLUI,
            logger,
            // Restrict what plugins can do:
            registerPanel: (panelDef) => SLUI.registerPanel(panelDef),
            registerCommand: (cmd) => { /* ... */ },
            // Add plugin-specific state namespace
            getState: () => {
                if (!state.plugins[pluginId]) {
                    state.plugins[pluginId] = {};
                }
                return state.plugins[pluginId];
            }
        };
        
        // Initialize plugin
        await plugin.init(context);
        this.#loadedPlugins.add(pluginId);
        
        events.emit(EVENTS.PLUGIN_LOADED, { pluginId });
    }
    
    /**
     * Unload a plugin
     */
    async unload(pluginId) {
        const plugin = this.#plugins.get(pluginId);
        if (plugin?.destroy) {
            await plugin.destroy();
        }
        this.#loadedPlugins.delete(pluginId);
        events.emit(EVENTS.PLUGIN_UNLOADED, { pluginId });
    }
}

export const pluginManager = new PluginManager();
```

```javascript
// V2/js/plugins/shadertoy-browser.js

export default {
    id: 'shadertoy-browser',
    name: 'Shadertoy Browser & Importer',
    version: '1.0.0',
    dependencies: [],
    
    async init(context) {
        const { SLUI, events, EVENTS, logger } = context;
        
        // Register panel
        SLUI.registerPanel({
            id: 'shadertoy-browser',
            title: 'Shadertoy',
            icon: '🎨',
            createContent: () => {
                // Full Shadertoy browser UI
                return this.createBrowserUI(context);
            }
        });
        
        // Listen for import requests
        events.on('shadertoy:import', async (shaderUrl) => {
            const shader = await this.importShader(shaderUrl);
            events.emit(EVENTS.SHADER_LOADED, shader);
        });
        
        logger.info('Plugin', 'Shadertoy', 'Loaded');
    },
    
    async destroy() {
        // Cleanup if needed
    },
    
    createBrowserUI(context) {
        // ... implementation
    },
    
    async importShader(url) {
        // ... implementation (reuse V1 logic)
    }
};
```

```javascript
// V2/js/app.js - Add step

step('Plugins', async () => {
    const enabledPlugins = CONFIG.PLUGINS || [];
    
    for (const pluginId of enabledPlugins) {
        try {
            const module = await import(`./plugins/${pluginId}.js`);
            pluginManager.register(module.default);
            await pluginManager.load(pluginId);
        } catch (e) {
            logger.error('Plugins', pluginId, `Failed to load: ${e.message}`);
        }
    }
});
```

