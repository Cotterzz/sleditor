# Sleditor V2 - Basic context

Sleditor is a web-based shader editor application a bit like Shadertoy, and with an emphasis on shadertoy compatibility.

It also has:
WGSL compute support inc output to audio.
Better GLSL audio ouptut
AudioWorklet
Sandboxed JS
Basic AI assist via API and user provided keys
And several other features not found in Shadertoy.

It uses Supabase as a backend and V1 (in the parent folder sleditor) is live and working

We also started building a new UI library - SLUI - for the site.

V2 is Sleditor with the new UI system.
We're also refactoring and using the transition as an opportunity to improve the architecture and fix a lot of technical debt.

Both V2 and SLUI are still in development, SLUI is mostly done, but there are gaps we need to fill as we go. V2 still has a long way to go at time of writing. (Jan 8 2026)

Here are some guidelines, (also a WIP - feel free to add more detail if needed)

# Sleditor V2 - Development Guidelines

This document defines the architecture, patterns, and conventions for Sleditor V2.
**Any agent/model working on this project MUST follow these guidelines.**

---

## 0. Refactoring Strategy - READ THIS FIRST

V2 is a **refactor of an existing large codebase** (`/js/`), not a greenfield project.

### Golden Rules

1. **Check existing code first** - Before writing new functionality, check `/js/` for existing solutions
2. **Don't carry over legacy mistakes** - New architecture is priority
3. **Rewrite UI-coupled code** - Anything with legacy UI baked in needs clean rewrite
4. **Wrap clean logic** - Pure algorithms/logic can be wrapped with event bus integration

### Module Assessment

| Category | Action | Examples |
|----------|--------|----------|
| **Pure Logic** | Wrap with events/managers | `uniforms.js`, `glsl-boilerplate.js`, input modules |
| **State-Coupled** | Adapt with new state pattern | `backends/webgl.js`, `channels.js` |
| **UI-Entangled** | Rewrite cleanly | `ui.js`, `tabs.js`, `shader-management.js` |
| **Orchestration** | Rewrite with four pillars | `index.js`, `compiler.js` |

### Existing Code Worth Reusing

```
js/
├── backends/
│   ├── webgl.js          ✓ ADAPT - WebGL2 multipass rendering
│   └── webgpu.js         ✓ ADAPT - WebGPU rendering (future)
├── glsl-boilerplate.js   ✓ IMPORT - Shadertoy/Regular/Golf boilerplate
├── uniforms.js           ✓ IMPORT - UniformBuilder class
├── media-loader.js       ✓ IMPORT - Texture/media loading
├── audio-input.js        ✓ WRAP - Audio analysis (FFT, waveform)
├── video-input.js        ✓ WRAP - Video texture input
├── webcam-input.js       ✓ WRAP - Webcam capture
├── cubemap-input.js      ✓ WRAP - Cubemap loading
├── volume-input.js       ✓ WRAP - 3D texture loading
├── sanitizer.js          ✓ IMPORT - Code sanitization
│
├── compiler.js           ⚠ ADAPT - Has UI calls, needs clean interface
├── channels.js           ⚠ ADAPT - Good logic, uses global state
├── render.js             ⚠ ADAPT - Render loop, needs event integration
│
├── ui.js                 ✗ IGNORE - Replaced by SLUI
├── tabs.js               ✗ REWRITE - Deeply UI-coupled
├── shader-management.js  ✗ REWRITE - Mixed concerns
├── index.js              ✗ REWRITE - Old orchestration pattern
├── editor.js             ⚠ PARTIAL - Monaco setup reusable, UI bits not
│
├── sanitizer.js          ✗ IGNORE - No longer needed
├── performance-monitor.js ✗ IGNORE - Will rebuild if needed
└── help-sections.js      ✗ IGNORE - Help panel will be rebuilt from scratch
```

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

## 1. The Four Pillars

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

## 2. File Structure

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

## 3. SLUI Usage

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

## 3.5. CSS & Styling Practices

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

### Mistakes That Need Rectifying

**Current Issues to Fix**:

1. **Inline Styles**: Many panels have inline `style.cssText` that should be CSS classes
   - `V2/js/ui/panels/media.js` - Texture selector has extensive inline styles
   - `V2/js/ui/panels/shader-controls.js` - Controls bar has inline styles
   - **Action**: Extract to CSS classes in `V2/css/app.css`

2. **Duplicate Select Components**: We created `SLUI.Select()` but some places might still have inline selects
   - **Action**: Audit all `<select>` elements, replace with `SLUI.Select()`

3. **Missing SLUI Components**: Some common patterns aren't in SLUI yet
   - Dropdown menus (we have them inline in Add Tab buttons)
   - Checkbox groups
   - Radio button groups
   - **Action**: Add these to SLUI as we encounter them

4. **CSS File Organization**: V2-specific CSS is scattered
   - Currently: `V2/css/fullscreen.css` (for fullscreen-specific)
   - **Action**: Create `V2/css/app.css` for general V2-specific overrides

### CSS File Structure

```
V2/css/
├── app.css          # V2-specific overrides (create this)
└── fullscreen.css   # Fullscreen-specific styles (existing)
```

**Rules**:
- Generic components → SLUI (`ui-system/ui.css`)
- V2-specific overrides → `V2/css/app.css`
- Feature-specific → `V2/css/[feature].css` (e.g., `fullscreen.css`)

### Refactoring Checklist

When working on UI code:

- [ ] Check if SLUI has the component
- [ ] If missing and generic, add to SLUI first
- [ ] Use SLUI component everywhere applicable
- [ ] Extract inline styles to CSS classes
- [ ] Put V2-specific CSS in `V2/css/app.css`
- [ ] Use CSS variables for theming
- [ ] Avoid `!important` unless absolutely necessary
- [ ] Document why if using inline styles

---

## 4. Icons

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

## 5. Logging

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

## 6. Initialization

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

## 7. Uniform System

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

## 7.5 Shader Types & Simplified UI

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

## 7.6 Multipass Support & Channels

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

## 8. Editor Architecture

The Monaco-based code editor uses a **multi-window, shared model** pattern with **simplified tab types**:

### Shader Types
- **GLSL**: Supports Buffer, Common, Audio tabs + main shader
- **WGSL**: Supports Audio tab + main shader (compute shaders)
- **AudioWorklet/JS**: Can be added to any shader type (only one audio type per shader)

### Tab Structure
**Code tabs only** in editor windows:
- `Image` / `Main` - Primary shader output (always present)
- `Common` - Shared code (GLSL only, prepended to all passes)
- `BufferA/B/C/D` - Multipass intermediate buffers (GLSL only)
- `Audio` - Audio generation code (optional, GLSL or WGSL)

**Channel/Media tabs** are NOT in code windows - they appear in dedicated channel selection UI.

```
┌─────────────────────────────────────────────────┐
│             MODELS (shared/global)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Image   │ │ Common  │ │ BufferA │  ← undo   │
│  │ Model   │ │ Model   │ │ Model   │    here   │
│  └────┬────┘ └────┬────┘ └────┬────┘           │
└───────┼───────────┼───────────┼─────────────────┘
        ▼           ▼           ▼
┌───────────────┐  ┌───────────────┐
│   Window 1    │  │   Window 2    │  ← separate
│  [Editor]     │  │  [Editor]     │     editors
│  viewing:     │  │  viewing:     │
│  Image model  │  │  Common model │
└───────────────┘  └───────────────┘
```

### Key Principles

1. **Global Models (shared)**
   - `Map<tabId, ITextModel>` stores Monaco models
   - Undo/redo history lives in models, NOT editors
   - Models survive window creation/destruction

2. **Per-Window Editors**
   - `Map<windowId, { editor, host, activeTabId }>` tracks editors
   - Each window gets its own Monaco editor instance
   - Supports drag-out to create side-by-side editing

3. **Window Lifecycle Hooks**
   - `onWindowCreated(windowId)` - called when window opens
   - `onWindowClosed(windowId)` - called when window closes
   - Editor instances are disposed on window close (models preserved)

4. **Single Source of Truth**
   - `state.shader.code` is canonical
   - Model change listeners sync TO state
   - Window ID detected from DOM context

### Tab Switch Flow
```
User clicks tab → TabPane.renderContent() 
→ createTabContent(tabId) → detect windowId from DOM
→ createEditorForWindow(windowId) → reuse existing or create new
→ showTabInWindow(windowId, tabId) → saves old, swaps model
→ editor.setModel(model) → undo preserved ✓
```

### Drag-Out Flow
```
User drags tab out → SLUI creates new window (tabwin-{timestamp})
→ new window inherits onWindowClosed callback
→ createTabContent(tabId) → detects NEW windowId
→ createEditorForWindow(newWindowId) → creates NEW editor instance
→ showTabInWindow(newWindowId, tabId) → same model, new editor
→ two editors can now view different tabs side-by-side ✓
```

### Critical Implementation Notes
- `saveModelToState(tabId)` before any model switch
- Model listeners are set up ONCE per model (in `modelListeners` Map)
- `requestAnimationFrame(() => editor.layout())` after DOM operations
- `disposeEditorForWindow(windowId)` cleans up editor, NOT models

---

## 9. Events Reference

### Standard Events (in `core/events.js`)
```javascript
EVENTS = {
    // Init
    INIT_START, INIT_PROGRESS, INIT_COMPLETE, INIT_ERROR,
    
    // Shader
    SHADER_CREATED, SHADER_LOADED, SHADER_SAVED, SHADER_DIRTY,
    
    // Compile
    COMPILE_START, COMPILE_SUCCESS, COMPILE_ERROR,
    
    // Uniforms
    UNIFORMS_DETECTED, UNIFORM_CHANGED,
    
    // Render
    RENDER_START, RENDER_STOP, RENDER_FRAME,
    
    // UI
    UI_READY, UI_PANEL_OPENED, UI_PANEL_CLOSED, UI_THEME_CHANGED,
    
    // Auth
    AUTH_CHANGED, AUTH_LOGIN, AUTH_LOGOUT,
    
    // ...
}
```

### Adding New Events
1. Add to `EVENTS` in `core/events.js`
2. Document what data it carries
3. Emit it from the relevant manager/module

---

## 10. Theming

Themes are defined in `/ui-system/themes/themes.json`.

### Current Themes
- `hacker` - Green terminal aesthetic
- `architect` - Blue professional (default)
- `designer` - Light/minimal

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

## 11. Internationalization

Translations are in `/ui-system/lang/*.json`.

### Adding Translations
1. Add keys to all language files
2. Use `SLUI.t('key.path')` in UI code
3. Never hardcode user-facing strings

---

## 12. Testing Checklist

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

## 13. Common Mistakes to Avoid

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

## 14. Quick Reference

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

## 15. Existing Solutions Reference

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
finally, all non code tabs (mic, audio in, texture, vide, webcam...) will not be in the same window as the code tabs, so the selection will be code only, creation of media buffers/channels will take place in its own dedciated window with its own tabs.
uniform autdetection will replace the old system of pre defined custom uniforms. as is is much user friendly.


---

*Last updated: January 2026*
