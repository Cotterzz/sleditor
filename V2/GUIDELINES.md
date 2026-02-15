# Sleditor V2 - Development Guidelines

**This is the primary reference for any agent/model working on this project.**

## Quick Overview

Sleditor is a web-based shader editor (like Shadertoy) with additional features:
- WGSL compute support with audio output
- Enhanced GLSL audio output
- AudioWorklet integration
- Sandboxed JavaScript
- AI assist via user-provided API keys
- Supabase backend

**V2** is a refactor using a new UI library (SLUI) and improved architecture.

### Related Documents

| Document | Purpose |
|----------|---------|
| `GUIDELINES.md` (this file) | Architecture, patterns, conventions |
| `REFACTORING.md` | Technical debt, improvements needed |
| `shader-format.md` | V2 DB schema, V1→V2 translation |
| `ui-system/README.md` | SLUI component documentation |

### Project Status

- **SLUI**: Mostly complete, gaps filled as needed
- **V2**: In active development
- **V1** (`/js/`): Legacy codebase, still live

---

## 1. Legacy Code Integration

V2 refactors an existing codebase (`/js/`). When adding features:

1. **Check `/js/` first** - Many solutions already exist
2. **Wrap clean logic** - Pure algorithms can be wrapped with V2 events
3. **Rewrite UI-coupled code** - Anything with legacy UI needs clean rewrite

### Legacy Code Reference

| File | Action | Notes |
|------|--------|-------|
| `backends/webgl.js` | ✓ Adapted | WebGL2 multipass rendering |
| `glsl-boilerplate.js` | ✓ Import | Shadertoy boilerplate |
| `uniforms.js` | ✓ Import | UniformBuilder class |
| `audio-input.js` | Wrap | FFT, waveform analysis |
| `video-input.js` | Wrap | Video texture input |
| `webcam-input.js` | Wrap | Webcam capture |
| `cubemap-input.js` | Wrap | Cubemap loading |
| `ui.js`, `tabs.js` | ✗ Ignore | Replaced by SLUI |

### How to Wrap Existing Code

```javascript
// V2/js/managers/ChannelManager.js
import * as legacyChannels from '/js/channels.js';
import { events, EVENTS } from '../core/events.js';
import { state } from '../core/state.js';

class ChannelManager {
    setChannel(index, type, source) {
        // Use existing logic
        const result = legacyChannels.setChannel(index, type, source);
        
        // Add event emission (new pattern)
        events.emit(EVENTS.CHANNEL_SET, { index, type, source, result });
        
        // Update namespaced state (new pattern)
        state.channels[`iChannel${index}`] = { type, source };
        
        return result;
    }
}

export const channelManager = new ChannelManager();
```

---

## 2. The Four Pillars

V2 is built on four architectural pillars. Every feature must align with these.

### Pillar 1: Event Bus
**Decoupled communication between modules.**

```javascript
// core/events.js
import { events, EVENTS } from './core/events.js';

// Subscribe
events.on(EVENTS.SHADER_LOADED, (shader) => { ... });

// Emit
events.emit(EVENTS.SHADER_LOADED, shaderData);

// One-time
events.once(EVENTS.COMPILE_SUCCESS, () => { ... });
```

**Rules:**
- Modules do NOT import each other directly
- They emit events, and whoever cares subscribes
- All event names are defined in `EVENTS` constant (for discoverability)
- Add new event types to `core/events.js` when needed

### Pillar 2: Namespaced State
**Organized state with clear boundaries.**

```javascript
// core/state.js
export const state = {
    shader: { id, title, isDirty, ... },
    render: { isPlaying, frame, time, fps, ... },
    editor: { graphics, audio, js, ... },
    auth: { user, isLoggedIn, ... },
    ui: { isInitialized, currentPanel, ... },
    input: { mouse, keyboard, ... },
    channels: { ... },
    init: { isComplete, currentStep, ... }
};
```

**Rules:**
- State is organized by domain
- When working on shaders, only touch `state.shader`
- When working on render, only touch `state.render`
- Never create flat/global state

### Pillar 3: Managers
**One place per domain for logic.**

```javascript
// managers/ShaderManager.js (example)
class ShaderManager {
    async create(type) { ... events.emit(EVENTS.SHADER_CREATED); }
    async load(data) { ... events.emit(EVENTS.SHADER_LOADED); }
    async save() { ... events.emit(EVENTS.SHADER_SAVED); }
}
export const shaderManager = new ShaderManager();
```

**Rules:**
- Each domain has ONE manager
- Managers contain all logic for that domain
- Managers emit events when state changes
- UI subscribes to events, doesn't call manager methods directly (when possible)

### Pillar 4: Reactive UI
**UI auto-updates from events.**

```javascript
// ui/index.js
events.on(EVENTS.SHADER_DIRTY, (isDirty) => {
    saveButton.textContent = isDirty ? '💾*' : '💾';
});

events.on(EVENTS.RENDER_FRAME, ({ fps, time }) => {
    fpsDisplay.textContent = `${fps} fps`;
});
```

**Rules:**
- UI subscribes to events
- No manual `updateX()` calls scattered everywhere
- If you change state, emit an event - UI will react

---

## 3. State Management Patterns

### Actions Pattern

All UI state mutations should go through centralized action functions in `core/actions.js`:

```javascript
// ✅ GOOD - Use actions for mutations
import { actions } from './core/actions.js';

actions.addProjectElement('code', element);
actions.setShaderCode('BufferA', code);
actions.openTab('BufferA');
```

```javascript
// ❌ BAD - Direct mutation from UI
state.project.code.push(element);
state.shader.code['BufferA'] = code;
state.ui.openTabs.push('BufferA');
```

**Why Actions?**
- Single place for all state changes
- Automatic event emission (can't forget)
- Enables undo/redo (future)
- Easier debugging
- Managers can still mutate directly (they're the authority for their domain)

**Key Actions:**
| Action | Purpose |
|--------|---------|
| `addProjectElement(category, element)` | Add to code/media/inputs |
| `removeProjectElement(category, index)` | Remove and emit event |
| `setShaderCode(tabId, code)` | Set code for a tab |
| `openTab(tabId)` | Open a tab in editor |
| `closeTab(tabId)` | Close a tab |
| `setActiveTab(tabId)` | Switch active tab |

### Selectors Pattern (Recommended)

Derived state should be computed via selectors in `core/selectors.js` (future):

```javascript
// ✅ GOOD - Centralized selector
import { selectors } from './core/selectors.js';

const buffers = selectors.getBuffers();
const nextLetter = selectors.getNextBufferLetter();
const canPlay = selectors.canPlay();
```

```javascript
// ❌ BAD - Duplicated logic everywhere
const buffers = state.project.code.filter(c => c.type === 'buffer');
```

### Event Handler Cleanup Pattern

When subscribing to events, store the unsubscribe function for cleanup:

```javascript
// ✅ GOOD - Store cleanup functions
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

```javascript
// ❌ BAD - No cleanup (memory leak risk)
events.on(EVENTS.RENDER_FRAME, handleFrame);
// Handler stays registered forever
```

### When to Use What

| Situation | Pattern |
|-----------|---------|
| UI changing state | Use `actions.*` |
| Manager changing its own domain | Direct mutation is OK |
| Reading derived/computed state | Use `selectors.*` |
| Subscribing to events | Store unsubscribe for cleanup |

---

## 4. File Structure

```
V2/
├── index.html                 # Entry HTML
├── default.glsl               # Default test shader (SL logo)
├── GUIDELINES.md              # This file
├── V2-approach.md             # Original architecture discussion
│
└── js/
    ├── index.js               # MINIMAL entry point (never grows)
    ├── app.js                 # Init orchestration
    │
    ├── core/                  # Foundation (Pillars 1 & 2)
    │   ├── config.js          # Static configuration
    │   ├── state.js           # Namespaced state
    │   ├── events.js          # Event bus + EVENTS constant
    │   ├── actions.js         # ✓ Centralized state mutations
    │   ├── selectors.js       # Future: Derived state queries
    │   └── logger.js          # Console capture + messaging
    │
    ├── editor/                # Monaco editor integration
    │   └── monaco-loader.js   # CDN loading + GLSL language
    │
    ├── render/                # Rendering system
    │   ├── webgl.js           # ✓ WebGL multipass renderer (adapted from V1)
    │   └── webgpu.js          # Future WebGPU backend
    │
    ├── ui/                    # SLEDITOR-SPECIFIC UI (uses SLUI)
    │   ├── index.js           # UI init + reactive bindings
    │   └── panels/            # Panel registrations
    │       ├── console.js     # ✓ Log viewer
    │       ├── settings.js    # ✓ Theme, language, layout
    │       ├── preview.js     # ✓ Shader canvas + controls
    │       ├── editor.js      # ✓ Tabbed Monaco editor
    │       ├── uniforms.js    # ✓ Auto-generated uniform controls
    │       ├── channels.js    # Future: Input channels
    │       └── gallery.js     # Future: Shader browser
    │
    ├── managers/              # Domain logic (Pillar 3)
    │   ├── ShaderManager.js   # ✓ Compilation orchestration
    │   ├── UniformManager.js  # ✓ Custom uniform detection + values
    │   ├── ChannelManager.js  # ✓ Channel coordination (wraps V1 channels.js)
    │   ├── AuthManager.js     # Future
    │   └── GalleryManager.js  # Future
    │
    ├── compiler/              # Shader compilation - Future
    │   ├── index.js
    │   └── glsl.js
    │
    ├── inputs/                # Channel inputs (reused from V1)
    │   ├── audio.js           # ✓ Audio analysis (FFT, waveform)
    │   ├── video.js           # ✓ Video texture input
    │   ├── webcam.js          # ✓ Webcam capture
    │   ├── cubemap.js         # ✓ Cubemap loading
    │   ├── volume.js          # ✓ 3D texture volumes
    │   └── texture.js         # ✓ 2D texture loading
    │
    └── channels/              # Channel coordination
        └── index.js           # Channel management wrapper
```

### Where Code Goes

| Feature | Location |
|---------|----------|
| New event type | `core/events.js` → EVENTS constant |
| New state section | `core/state.js` |
| New panel | `ui/panels/newpanel.js` + register in `ui/index.js` |
| New domain logic | `managers/NewManager.js` |
| Render-related | `render/*.js` |
| Compilation | `compiler/*.js` |
| Input handling | `inputs/*.js` |

---

## 5. SLUI Usage

SLUI is the **generic UI library** in `/ui-system/`.
Sleditor **uses** SLUI but doesn't modify it (usually).

### When to Add to SLUI vs Sleditor

| Add to SLUI (`/ui-system/`) | Add to Sleditor (`/V2/js/ui/`) |
|-----------------------------|--------------------------------|
| Generic components (sliders, buttons) | App-specific panels |
| Theming/i18n system | Shader-specific UI |
| Window/docking system | Custom controls for shaders |
| Could be used by other apps | Only makes sense for Sleditor |

### Example: Console Component
- `Console` component → SLUI (`ui-system/src/components/console.js`)
- Console panel registration → Sleditor (`V2/js/ui/panels/console.js`)

### SLUI API Reference
```javascript
// Core
SLUI.init(options)
SLUI.setTheme(themeId)
SLUI.getTheme()
SLUI.setLanguage(langCode)
SLUI.t(key)  // Translation

// Windows
SLUI.registerPanel({ id, icon, title, createContent, ... })
SLUI.openPanel(id)
SLUI.closeWindow(id)

// Components
SLUI.Console({ container, logger, ... })
SLUI.Slider({ min, max, value, onChange, ... })
SLUI.Button({ text, onClick, ... })
SLUI.Tabs({ tabs, onSelect, ... })

// Events
SLUI.on(event, handler)
SLUI.emit(event, data)
```

---

## 6. CSS & Styling Practices

### ❌ CRITICAL: Avoid Inline Styles

**Problem**: We've been adding inline `style.cssText` throughout the codebase, which:
- Makes styling hard to maintain and override
- Breaks theme consistency
- Creates duplication
- Makes responsive design difficult
- Violates separation of concerns

**Examples of Mistakes Made**:
```javascript
// ❌ BAD - Inline styles everywhere
const button = document.createElement('button');
button.style.cssText = `
    padding: 4px 12px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
`;
```

**✅ CORRECT Approaches**:

1. **Use SLUI Components** (preferred):
```javascript
// ✅ GOOD - Use SLUI components
const button = SLUI.Button({
    label: 'Click me',
    variant: 'primary',
    onClick: handleClick
});
```

2. **Use CSS Classes** (when SLUI doesn't have the component):
```javascript
// ✅ GOOD - CSS class
const button = document.createElement('button');
button.className = 'sl-button sl-button-primary';
```

3. **Add to SLUI if Generic** (if it's reusable):
```javascript
// ✅ GOOD - Add to SLUI if it's a generic component
// ui-system/src/components/button.js
export function Button({ label, variant, onClick }) {
    const btn = document.createElement('button');
    btn.className = `sl-button sl-button-${variant}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}
```

4. **V2-Specific CSS File** (for app-specific overrides):
```css
/* V2/css/fullscreen.css or V2/css/app.css */
.v2-media-tabs-container .sl-tabs-bar {
    padding: 2px 4px !important; /* Only when necessary */
}
```

### When to Use Each Approach

| Scenario | Solution | Location |
|----------|----------|----------|
| Generic button/slider/input | Use SLUI component | `SLUI.Button()`, `SLUI.Slider()`, etc. |
| Generic component missing | Add to SLUI | `ui-system/src/components/` |
| App-specific styling | CSS class in V2 CSS | `V2/css/app.css` or `V2/css/fullscreen.css` |
| One-off layout hack | Inline style (last resort) | Only if absolutely necessary, document why |

### Component Duplication Problem

**Problem**: We've been creating duplicate components that already exist or should be in SLUI:

**Examples of Mistakes Made**:
- Created custom `<select>` styling in multiple places (Settings, Media, Shader Controls)
- Should have used/created `SLUI.Select()` from the start
- Created inline-styled buttons instead of using `SLUI.Button()`
- Duplicated dropdown menu code instead of using SLUI components

**✅ CORRECT Process**:

1. **Check SLUI First**: Before creating any UI element, check if SLUI has it
   ```javascript
   // Check: ui-system/src/components/
   // Check: ui-system/src/index.js exports
   ```

2. **If Missing, Add to SLUI**: If it's a generic component (button, select, dropdown, etc.), add it to SLUI
   ```javascript
   // ✅ Add to SLUI
   // ui-system/src/components/select.js
   export function Select({ items, value, onChange, variant }) { ... }
   ```

3. **Use Everywhere**: Once in SLUI, use it everywhere
   ```javascript
   // ✅ Use SLUI.Select in all three places
   const themeSelect = SLUI.Select({ ... }); // Settings
   const sourceSelect = SLUI.Select({ ... }); // Media
   const channelSelect = SLUI.Select({ ... }); // Shader Controls
   ```

4. **App-Specific Only**: Only create V2-specific components if they're truly app-specific
   ```javascript
   // ✅ Only if it's Sleditor-specific
   // V2/js/ui/components/shader-editor.js
   ```

### Technical Debt & Refactoring

See **`REFACTORING.md`** for the full list of architectural improvements and fixes needed.

Key items:
- Centralize state mutations (Actions pattern)
- Create selectors for derived state
- Extract audio processing from webgl.js
- Separate compiler from render code
- CSS organization improvements

### CSS File Structure

```
ui-system/
├── ui.css              # Core SLUI components

V2/css/
├── app.css             # V2-specific styles
└── fullscreen.css      # Fullscreen-specific styles
```

**Rules**:
- Generic components → SLUI (`ui-system/ui.css`)
- V2-specific overrides → `V2/css/app.css`
- Use CSS classes, not inline styles
- Use CSS variables for theming

---

## 7. Icons

Icons are in `/ui-system/icons/`.

### Available Icons
- `console32.png` / `console64.png` - Console/terminal
- `code32.png` / `code64.png` - Code/editor
- `shader32.png` / `shader64.png` - Shader/graphics

### Usage Pattern
```javascript
// For HD displays, use srcset
icon: '<img src="/ui-system/icons/console32.png" srcset="/ui-system/icons/console64.png 2x" width="24" height="24" alt="Console">'
```

### Adding New Icons
1. Create SVG at 320×320 in `/ui-system/icons/`
2. Export PNG at 32px and 64px (for 2x displays)
3. Name: `iconname.svg`, `iconname32.png`, `iconname64.png`

---

## 8. Logging

All logging goes through the V2 logger (not `console.log` directly).

```javascript
import { logger } from '../core/logger.js';

logger.info('Module', 'Action', 'Message');
logger.warn('Module', 'Action', 'Warning message');
logger.error('Module', 'Action', 'Error message');
logger.debug('Module', 'Action', 'Debug info');
logger.success('Module', 'Action', '✓ Success message');

// Updatable messages (for progress)
const id = logger.info('Loader', 'Assets', 'Loading... 0%');
logger.update(id, 'Loading... 50%');
logger.update(id, 'Loading... 100% ✓');
```

### Origin Format
`[Module:Action]` - e.g., `[Render:WebGL]`, `[App:Init]`, `[UI:Panels]`

---

## 9. Initialization

Init is orchestrated in `app.js` using steps.

```javascript
// app.js
step('StepName', async () => {
    // Do initialization work
    // Emit events as needed
});
```

**Rules:**
- Each step is isolated
- Steps run in order
- Errors in steps are caught and logged
- Progress is reported via events

---

## 10. Uniform System

**Auto-Detection**: Replaces V1's predefined custom uniform system. Uniforms are declared in shader code and automatically detected + UI generated.

### How It Works

1. **User writes shader** with uniform declarations:
   ```glsl
   uniform float uSpeed;        // Basic slider (0.0 - 1.0)
   uniform vec3 uColor;         // Auto-detected as color picker
   uniform float uAmount;       // range: 0.0, 10.0, step: 0.1
   uniform bool uEnabled;       // Checkbox
   ```

2. **On compile success**, `UniformManager` parses the code and extracts uniforms
3. **Uniforms panel** auto-generates appropriate UI controls (no predefined slots)
4. **User adjusts values** → `UniformManager.set()` → values sent to renderer each frame
5. **Values persist** across recompiles (preserved unless uniform is removed from code)

### Comment Hints

Add hints in comments to customize controls:

```glsl
uniform float uScale;            // range: 0.0, 5.0
uniform float uSteps;            // range: 1, 100, step: 1
uniform vec3 uTint;              // color
uniform vec4 uOverlay;           // colour (UK spelling also works)
```

### Auto-Detection Rules

- `vec3`/`vec4` with names containing `color`, `tint`, `albedo`, `diffuse` → Color picker
- `float` → Slider (default 0.0 - 1.0)
- `int` → Integer slider (default 0 - 100)
- `bool` → Checkbox
- `vec2/3/4` (non-color) → Multi-component sliders

### Built-in Uniforms (Excluded from Detection)

These are provided by the Shadertoy boilerplate and NOT shown in the Uniforms panel:
- `iResolution`, `iTime`, `iTimeDelta`, `iFrame`
- `iMouse`, `iDate`, `iSampleRate`
- `iChannel0-3`, `iChannelTime`, `iChannelResolution`

### JS API (for programmatic control)

```javascript
import { uniformManager } from './managers/UniformManager.js';

// Get/set values
uniformManager.set('uSpeed', 0.75);
const speed = uniformManager.get('uSpeed');

// Get all detected uniforms
const uniforms = uniformManager.getDetectedUniforms();

// Reset all to defaults
uniformManager.resetToDefaults();
```

### Events

- `UNIFORMS_DETECTED` - Emitted after parse, carries `{ uniforms: [...] }`
- `UNIFORM_CHANGED` - Emitted on value change, carries `{ name, value, oldValue }`

## 11. Shader Types & Simplified UI

### Shader Type Selection
Users select between:
- **GLSL**: Full multipass support (Image + BufferA/B/C/D + Common + optional Audio)
- **WGSL**: Compute shader support (Main + optional Audio)

### GLSL Mode Auto-Detection (Internal)
While V1 had explicit tabs for "Regular", "S-Toy", "Golf" modes, V2 auto-detects:
- **Shadertoy**: `mainImage()` function present
- **Regular**: Standard uniforms like `u_time`, `u_resolution`
- **Golf**: Compact code with macros

### UI Simplification
**Code windows**: Only show relevant tabs based on shader type
- GLSL: Image (main), Common, BufferA/B/C/D, Audio
- WGSL: Main, Audio

**Channel/Media management**: Separate dedicated window (not mixed with code tabs)
- Audio input, video, webcam, textures, cubemaps, volumes
- Keyboard input, microphone
- Displayed in player controls, not as tabs

**Audio types**: Can be added to any shader, but only one audio type per shader:
- AudioWorklet (JavaScript)
- GLSL/WGSL audio generation

## 12. Multipass Support & Channels

### Channel Model: Global Namespace (IMPORTANT)

**Sleditor uses a GLOBAL channel namespace, different from Shadertoy.**

```
┌─────────────────────────────────────────────────────────────────┐
│                       GLOBAL CHANNELS                            │
├──────────┬──────────────┬───────────────────────────────────────┤
│ iChannel │ Allocated To │ Notes                                 │
├──────────┼──────────────┼───────────────────────────────────────┤
│    0     │ Main (Image) │ ALWAYS main output                    │
│    1     │ BufferA      │ First channel user created            │
│    2     │ Texture      │ Second channel user created           │
│    3     │ BufferB      │ Third channel user created            │
│   ...    │ ...          │ Sequential allocation order           │
└──────────┴──────────────┴───────────────────────────────────────┘
```

**Reading Rules:**
- Main (Image) reading `iChannel0` → self-feedback (ping-pong buffer)
- BufferA reading `iChannel0` → reads Main's previous output
- Any pass reading `iChannel1` → reads BufferA's output
- Channel numbers are **allocated in creation order** (code tabs + media tabs)

**vs Shadertoy** (per-pass assignment):
```
// Shadertoy: each pass has its own channel mapping
BufferA: iChannel0 = BufferB, iChannel1 = texture
Image:   iChannel0 = BufferA, iChannel1 = same texture

// Sleditor: one global channel table
iChannel0 = Main, iChannel1 = BufferA, iChannel2 = texture
// All passes reference the same global channels
```

**Import**: Legacy has a Shadertoy import system that converts per-pass to global.

### Texture Filtering (Future Enhancement)

**Current (V1)**: Filters applied at texture source (when loaded)
- Problem: Can't use same texture with different filters in different passes
- Workaround: Duplicate textures

**Desired (V2)**: Filters applied at point of receipt (per pass × per channel)
- Each pass can specify filter settings for each input channel
- UI: Grid showing "how iChannel3 is filtered when BufferA receives it"
- Allows same texture with NEAREST in one pass, LINEAR in another

**Implementation Note**: Don't bake filter state into textures. Apply `texParameteri` at bind time before each pass. This keeps the architecture flexible for future per-pass filtering UI.

### Integration Strategy

V2 integrates V1's mature multipass and channel systems while maintaining clean architecture:

#### WebGL Backend Integration
- **Reuse V1's** `js/backends/webgl.js` (multipass, framebuffers, ping-pong buffers)
- **Wrap with V2 events** instead of V1's global state
- **Maintain separation** between rendering logic and UI coordination

#### Channel System Integration
- **Reuse V1's** input modules (audio, video, webcam, etc.)
- **Rewrite channel coordination** with V2's global namespace model
- **Dedicated UI window** for media channels (separate from code tabs)
- **Player controls**: dropdown to view any channel output
- **Event-driven coordination** through ChannelManager

### Implementation Approach

#### In V2's WebGL Renderer (`V2/js/render/webgl.js`):
```javascript
// Extend current renderer with multipass support
let passes = [];           // Array of compiled passes
let channels = new Map();  // channelNumber → { texture, type, resolution }
let framebuffer = null;    // Shared FBO for render-to-texture

// Channel 0 is always main, uses ping-pong for self-read
// Other channels are sequential: 1 = first created, 2 = second, etc.
```

#### ChannelManager (`V2/js/managers/ChannelManager.js`):
```javascript
// Manages global channel allocation
export class ChannelManager {
    // Channel 0 is reserved for Main
    nextChannelNumber = 1;
    
    // Allocate next channel (returns channel number)
    createChannel(type, source) {
        const num = this.nextChannelNumber++;
        events.emit(EVENTS.CHANNEL_CREATED, { number: num, type, source });
        return num;
    }
    
    // Get texture for a channel number
    getChannelTexture(channelNumber) { ... }
}
```

#### UI Windows:
- **Code Editor window**: Tabs for Image, Common, BufferA/B/C/D
- **Media window**: Tabs for each media input (creates channels sequentially)
- **Player controls**: Dropdown to view any channel's output

### Viability Assessment: ✅ HIGHLY VIABLE

**Why it works:**
- V1's WebGL backend is mature and well-tested
- Channel system logic is comprehensive and proven
- V2's event architecture provides clean integration points
- UI separation (code vs media) simplifies the implementation
- Global channel model is simpler than Shadertoy's per-pass model

**Risk Level: LOW**
- V1 code is stable and feature-complete
- Event wrapping pattern is proven in V2's existing managers
- Changes are additive, not replacing working V2 functionality

---

## 13. Unified Editor Architecture

The editor uses a **unified panel with project sidebar** pattern. All element types (code, media, inputs) are managed in one panel.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Unified Editor Panel                                           │
├────────────────┬────────────────────────────────────────────────┤
│ ◀ PROJECT      │  [Image] [BufferA] [Audio In] ──tabs──────────▸│
│                │  ┌────────────────────────────────────────────┐│
│ ▼ Code    [+]  │  │                                            ││
│   🖼️ Main iCh0  │  │   Tab Content (Monaco / Input Settings)   ││
│   📦 Common    │  │                                            ││
│   📋 Buff A  iCh1│  │                                           │
│                │  └────────────────────────────────────────────┘│
│ ▼ Media   [+]  │                                                │
│   🖼️ Texture₁ iCh2 │                                            │
│   🎵 Audio₁   iCh3│                                            │
│                │                                                │
│ ▼ Inputs  [+]  │                                                │
│   🖱️ Mouse 🔒  │                                                │
│   ⌨️ Keyboard iCh4│                                            │
│                │                                                │
│  [◀ Collapse]  │                                                │
└────────────────┴────────────────────────────────────────────────┘
```

### Core Concepts

1. **Project Elements vs Tabs**
   - `state.project` contains the canonical list of elements (code, media, inputs)
   - `state.ui.openTabs` contains IDs of elements with open tabs
   - **Closing a tab does NOT delete the element**
   - **Deleting an element DOES close its tab**

2. **Element Categories**
   - **Code**: Image (locked), Common, BufferA-Z, Audio
   - **Media**: Textures, Audio files, Videos, Cubemaps, Volumes
   - **Inputs**: Mouse (locked), Keyboard, Webcam, Mic, Gamepad, MIDI

3. **Sidebar Behavior**
   - Collapsible with `◀/▶` button
   - Three sections with expand/collapse
   - Each section has `[+]` button with dropdown for adding new elements
   - Double-click element → open/focus tab
   - Right-click element → context menu (Delete, etc.)
   - Channel numbers shown for media/inputs

4. **Locked Elements**
   - `Image` - always present, cannot be deleted
   - `Mouse` - always present, cannot be deleted (but can be clicked to view settings)

### State Structure

```javascript
// Project elements - THE canonical list
// Note - some of these names/labels may be out of date.
state.project = {
    code: [
        { id: 'Main', type: 'image', label: 'Main', icon: '🖼️', locked: true },
        { id: 'Common', type: 'common', label: 'Common', icon: '📦', locked: false },
        // ...
    ],
    media: [
        { id: 'texture_1', type: 'texture', label: 'Texture 1', icon: '🖼️', channel: 1 },
        // ...
    ],
    inputs: [
        { id: 'mouse', type: 'mouse', label: 'Mouse', icon: '🖱️', locked: true },
        { id: 'keyboard', type: 'keyboard', label: 'Keyboard', icon: '⌨️', channel: 2 },
        // ...
    ],
    nextChannelNumber: 3
};

// Open tabs (element IDs)
state.ui.openTabs = ['Main', 'texture_1', 'keyboard'];
state.ui.activeTab = 'Main';
state.ui.sidebarCollapsed = false;
state.ui.sidebarSections = { code: true, media: true, inputs: true };
```

### Event Flow

```javascript
// Element lifecycle
EVENTS.PROJECT_ELEMENT_CREATED  // { id, category, element }
EVENTS.PROJECT_ELEMENT_DELETED  // { id, category }
EVENTS.PROJECT_ELEMENT_UPDATED  // { id, category, changes }

// Tab lifecycle (views, not data)
EVENTS.PROJECT_TAB_OPENED       // { elementId }
EVENTS.PROJECT_TAB_CLOSED       // { elementId }
EVENTS.PROJECT_TAB_ACTIVATED    // { elementId }

// Sidebar
EVENTS.PROJECT_SIDEBAR_TOGGLED  // { collapsed }
```

### Monaco Integration

- Monaco models are still shared globally (`Map<tabId, ITextModel>`)
- Undo/redo history lives in models
- Tab content dynamically creates Monaco editor when code element is active
- Media/Input tabs show settings UI instead of Monaco

### Files

| File | Purpose |
|------|---------|
| `V2/js/ui/panels/unified-editor.js` | Main unified editor panel |
| `V2/js/core/state.js` | Project state (`state.project`, `state.ui.openTabs`) |
| `V2/js/core/events.js` | Project events (`PROJECT_*`) |
| `V2/css/app.css` | Unified editor styles |

### Legacy Files (deprecated)

These files are kept for reference but no longer registered:
- `V2/js/ui/panels/editor.js` - Old separate editor panel
- `V2/js/ui/panels/media.js` - Old separate media panel
- `V2/js/ui/panels/inputs.js` - Old separate inputs panel

---

## 14. State Architecture: shader vs project

Understanding the relationship between `state.shader` and `state.project`:

> **📄 See [shader-format.md](./shader-format.md) for the complete V2 DB schema.**

### The Two State Objects

| State | Purpose | Persisted? |
|-------|---------|------------|
| `state.shader` | Shader entity (saved to DB) | ✅ Yes |
| `state.project` | Workspace structure (runtime) | ❌ No |

### state.shader (Persisted Entity)

Mirrors the DB schema. See [shader-format.md](./shader-format.md) for full details.

Key fields:
```javascript
state.shader = {
    // Identity
    id, slug, user_id, title, description, creator_name,
    
    // Type & Languages
    shader_type,  // 'webgl', 'webgpu-compute', 'webgpu-frag', null (legacy)
    code_types,   // ['glsl'], ['wgsl'], ['glsl', 'js']
    
    // Code content
    code: {
        Image: '// main shader',
        BufferA: '// buffer code',
        Common: '// shared code'
    },
    
    // Media, Inputs, Channels (V2)
    media,           // Array of media elements
    inputs,          // Array of input configs
    channels,        // Channel assignments
    channel_matrix,  // Per-receiver filter settings
    
    // Settings & Config
    settings,        // Render settings
    uniform_config,  // Slider ranges
    timeline_config, // Keyframe animation
    
    // Runtime flags (not persisted)
    isDirty
};
```

### state.project (Runtime Workspace)

Contains the working structure used by UI and managers:

```javascript
state.project = {
    // Element lists with runtime info
    code: [
        { id: 'Image', type: 'main', label: 'Main', channel: 0, locked: true },
        { id: 'BufferA', type: 'buffer', label: 'Buff A', channel: 1 }
    ],
    media: [
        { id: 'texture_1', type: 'texture', label: 'Tex A', channel: 2 }
    ],
    inputs: [
        { id: 'mouse', type: 'mouse', label: 'Mouse', locked: true }
    ],
    
    // Allocation tracking
    nextChannelNumber: 3
};
```

### Key Distinctions

| Concern | state.shader | state.project |
|---------|--------------|---------------|
| Code content | `code.Image = "..."` | References only |
| Channel allocation | Not stored | `nextChannelNumber` |
| Media references | URLs (future) | Loaded objects |
| Element metadata | Minimal | Full (icons, labels) |
| Source of truth for... | What to save | How to render UI |

### Synchronization

On load:
1. `state.shader` is populated from saved data
2. `syncProjectWithShaderState()` builds `state.project` from shader

On save:
1. `state.shader` contains all data needed
2. `state.project` is not saved (rebuilt on load)

### Future: Normalized Storage

See `REFACTORING.md` for the proposed pattern of storing channel configuration in `state.shader.channels` for persistence, then hydrating to `state.project` (or `state.runtime`) for execution.

---

## 15. Events Reference

### Standard Events (in `core/events.js`)

```javascript
EVENTS = {
    // Init
    INIT_START, INIT_PROGRESS, INIT_COMPLETE, INIT_ERROR,
    
    // Shader lifecycle
    SHADER_CREATED, SHADER_LOADED, SHADER_SAVED, SHADER_FORKED,
    SHADER_DIRTY, SHADER_CLOSED, SHADER_CODE_SET,
    
    // Compile
    COMPILE_START, COMPILE_SUCCESS, COMPILE_ERROR, COMPILE_WARNING, COMPILE_REQUEST,
    
    // Uniforms
    UNIFORMS_DETECTED, UNIFORM_CHANGED,
    
    // Render
    RENDERER_READY, RENDER_START, RENDER_STOP, RENDER_FRAME,
    RENDER_FRAME_REQUESTED,  // Request single frame (even when paused)
    RENDER_RESOLUTION, RENDER_ERROR, RENDER_CHANNEL_CHANGED, RENDER_COLORSPACE_CHANGED,
    
    // Shader controls
    SHADER_CONTROLS_DOCKED, PREVIEW_GLASS_MODE,
    
    // Editor
    EDITOR_CODE_CHANGED, EDITOR_CURSOR_CHANGED, EDITOR_FOCUS, EDITOR_BLUR,
    
    // Tabs (legacy)
    TAB_SWITCHED, TAB_ADDED, TAB_REMOVED, TAB_RENAMED,
    
    // Project elements (unified editor)
    PROJECT_ELEMENT_CREATED,   // { id, category, element }
    PROJECT_ELEMENT_DELETED,   // { id, category }
    PROJECT_ELEMENT_UPDATED,   // { id, category, changes }
    PROJECT_TAB_OPENED,        // { elementId }
    PROJECT_TAB_CLOSED,        // { elementId }
    PROJECT_TAB_ACTIVATED,     // { elementId }
    PROJECT_SIDEBAR_TOGGLED,   // { collapsed }
    PROJECT_RESET,
    
    // Channels
    CHANNEL_CREATED, CHANNEL_SET, CHANNEL_CLEARED, CHANNEL_ERROR,
    
    // Media
    MEDIA_SELECTED, MEDIA_TAB_ADDED, MEDIA_TAB_REMOVED,
    MEDIA_URL_IMPORT, MEDIA_OPTIONS_CHANGED,
    VIDEO_SELECTED, VIDEO_URL_IMPORT, VIDEO_LOOP_CHANGED,
    AUDIO_SELECTED, AUDIO_URL_IMPORT, AUDIO_MODE_CHANGED, AUDIO_LOOP_CHANGED,
    
    // Inputs
    INPUT_WEBCAM_ENABLED, INPUT_WEBCAM_DISABLED,
    INPUT_MIC_ENABLED, INPUT_MIC_DISABLED,
    INPUT_KEYBOARD_ENABLED, INPUT_KEYBOARD_DISABLED,
    
    // Fullscreen
    FULLSCREEN_ENTER, FULLSCREEN_EXIT, FULLSCREEN_CONTROLS_VISIBLE,
    
    // Auth
    AUTH_CHANGED, AUTH_LOGIN, AUTH_LOGOUT, AUTH_ERROR,
    
    // UI
    UI_READY, UI_PANEL_OPENED, UI_PANEL_CLOSED, UI_THEME_CHANGED, UI_LAYOUT_CHANGED,
    
    // Toast/Notifications
    TOAST_SHOW, TOAST_HIDE
}
```

### Adding New Events
1. Add to `EVENTS` in `core/events.js`
2. Document what data it carries in a comment
3. Emit it from the relevant manager/module

---

## 16. Theming

Themes are defined in `/ui-system/themes/themes.json`.

### Current Themes
- `default` - Classic blue, hybrid light/dark
- `designer` - Light, neumorphic
- `architect` - Light, warm professional
- `coder` - Dark, GitHub-style
- `hacker` - Dark, green terminal
- `engineer` - Dark, VS Code-style

### CSS Variables
All colors use CSS variables:
```css
var(--bg-primary)
var(--bg-secondary)
var(--text-primary)
var(--text-muted)
var(--accent)
var(--border)
var(--console-success)
var(--console-error)
/* etc. */
```

---

## 17. Internationalization

Translations are in `/ui-system/lang/*.json`.

### Adding Translations
1. Add keys to all language files
2. Use `SLUI.t('key.path')` in UI code
3. Never hardcode user-facing strings

---

## 18. Testing Checklist

Before submitting changes:

- [ ] Console shows no errors
- [ ] Theme switching works
- [ ] Panels open/close correctly
- [ ] Windows can be docked/undocked
- [ ] Layout persists after refresh
- [ ] Mobile view works (if applicable)
- [ ] New code follows Four Pillars
- [ ] New files are in correct location
- [ ] Events are documented
- [ ] Logger is used (not console.log)

---

## 19. Common Mistakes to Avoid

### ❌ DON'T
```javascript
// Don't import modules directly for communication
import { someFunction } from '../other-module.js';
someFunction(data);

// Don't use console.log
console.log('Debug:', data);

// Don't create flat state
window.myGlobalState = {};

// Don't manually update UI everywhere
updateSaveButton();
updateTitle();
updateFPS();

// Don't use inline styles (see Section 3.5)
const button = document.createElement('button');
button.style.cssText = 'padding: 4px; background: #333; ...';

// Don't duplicate components (see Section 3.5)
// Creating custom select/dropdown when SLUI.Select exists

// Don't create app-specific components in SLUI
// Or generic components in V2
```

### ✅ DO
```javascript
// Use event bus for communication
events.emit(EVENTS.SOMETHING_HAPPENED, data);

// Use logger
logger.debug('Module', 'Action', data);

// Use namespaced state
state.shader.isDirty = true;

// Use reactive UI bindings
events.on(EVENTS.SHADER_DIRTY, () => { ... });

// Use SLUI components (see Section 3.5)
const button = SLUI.Button({ label: 'Click', onClick: handleClick });

// Check SLUI first, add if missing (see Section 3.5)
const select = SLUI.Select({ items, value, onChange });
```

---

## 20. Quick Reference

### New Panel Checklist
1. Create `ui/panels/mypanel.js`
2. Export `registerMyPanel(SLUI)`
3. Import in `ui/index.js`
4. Call `registerMyPanel(SLUI)` in `registerPanels()`

### New Manager Checklist
1. Create `managers/MyManager.js`
2. Define class with domain methods
3. Emit events for state changes
4. Export singleton instance

### Channel/Input Integration Checklist
1. Wrap V1 module in `inputs/` or `channels/` directory
2. Adapt to use V2 events instead of V1 state
3. Register with ChannelManager for coordination
4. Add UI controls to dedicated channel window

### New Component (SLUI) Checklist
1. Create in `ui-system/src/components/mycomponent.js`
2. Export from `ui-system/src/index.js`
3. Document in SLUI README
4. Add CSS to `ui-system/ui.css` (use CSS variables)
5. Use in at least one place in V2 to validate

### CSS/Styling Checklist
1. Check if SLUI has the component/pattern
2. If generic and missing, add to SLUI first
3. Use CSS classes, not inline styles
4. Put V2-specific CSS in `V2/css/app.css`
5. Use CSS variables for theming
6. Avoid `!important` unless necessary
7. Document why if using inline styles (last resort)

---

## 21. Existing Solutions Reference

Before writing new code, check if these problems are already solved in `/js/`:

| Need | Existing Solution | Notes |
|------|-------------------|-------|
| WebGL2 context setup | `backends/webgl.js:init()` | Includes extensions, quad buffer |
| Multipass rendering | `backends/webgl.js` | Framebuffers, ping-pong buffers |
| Shadertoy boilerplate | `glsl-boilerplate.js` | STOY_BOILERPLATE, REGULAR_BOILERPLATE |
| GLSL error parsing | `compiler.js:adjustGLSLErrors()` | Line number adjustment |
| Monaco GLSL language | `editor.js` | Token definitions, themes |
| Monaco WGSL language | `editor.js` | Full WGSL support |
| FFT audio analysis | `audio-input.js` | Frequency bands, waveform |
| Chromagram (music) | `audio-input.js` | Note detection |
| Video texture | `video-input.js` | Frame extraction |
| Webcam capture | `webcam-input.js` | MediaDevices API |
| Cubemap loading | `cubemap-input.js` | 6-face or equirect |
| 3D volume textures | `volume-input.js` | Binary volume data |
| Keyboard state | `keyboard-input.js` | Key tracking texture |
| Uniform management | `uniforms.js:UniformBuilder` | Works for WebGL+WebGPU |
| Shadertoy import | `shadertoy-import.js` | API parsing |

### Example: Reusing Boilerplate

```javascript
// Instead of writing your own boilerplate:
import { STOY_BOILERPLATE, STOY_SUFFIX } from '/js/glsl-boilerplate.js';

function compileShader(userCode) {
    const fullCode = STOY_BOILERPLATE + userCode + STOY_SUFFIX;
    // ... compile
}
```

### Example: Reusing UniformBuilder

```javascript
import { UniformBuilder } from '/js/uniforms.js';

const uniforms = new UniformBuilder();
uniforms.setTime(performance.now() / 1000);
uniforms.setResolution(canvas.width, canvas.height);
// Works for both WebGL and WebGPU
```
A few final notes from user:
So a few things will need to work differently in V2 - we wont have different GLSL formats (stoy, raw, gold ,regaular) we do still want to support different modes but by auto detection, to simplify the UI. GLSL new tab options will be buffer, common and audio on top of main.
So, we'll start with shadertoy compatible glsl and add detected modes later (for different or no boilerplate)
glsl or wgsl will be the base shader options and will determine what new code tabs will be available.
(audioworklet and JS are able to be added to any shader, though only one type of audio per shader)

uniform autdetection will replace the old system of pre defined custom uniforms. as is is much user friendly.


---

*Last updated: February 7, 2026*
