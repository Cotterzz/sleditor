# SLEditor - Project Structure & Module Guide

## Overview
SLEditor is a browser-based shader and audio editor supporting GLSL, WGSL, AudioWorklet, and JavaScript. This document outlines the purpose of each module and guidelines for maintaining clean architecture.

---

## Core Entry Points

### `index.html` (419 lines)
**Purpose**: HTML structure and DOM layout only
**Contains**:
- Page structure and semantic HTML
- Script/CSS includes
- Modal templates
- **⚠️ ISSUE**: Still has 62 inline `style=` attributes that should be extracted to CSS

**Should NOT contain**: Business logic, extensive inline styles

---

### `js/index.js` (685 lines)
**Purpose**: Application bootstrap and orchestration ONLY
**Responsibilities**:
- Import and initialize all modules
- Wire up event listeners to module functions
- Handle golf URL special case (lightweight, read-only)
- Bootstrap sequence coordination

**Should contain**:
- Module imports
- Global exposures (for backwards compatibility)
- Event listener setup (delegating to modules)
- Init function that calls module inits
- Minimal wrapper functions (e.g., `createNewShader`)

**Should NOT contain**:
- Business logic (delegate to modules)
- UI manipulation (delegate to `ui.js`)
- State management beyond initialization
- Large inline functions

**Recent additions** ✅ (ACCEPTABLE):
- `fullscreen.init()` - proper delegation
- Default shader slug loading - could be extracted to `routing.js` but acceptable here

---

## State & Configuration

### `js/core.js` (170 lines)
**Purpose**: Central state management and configuration constants
**Contains**:
- `state` object (application state)
- `CONFIG` object (configuration)
- `DERIVED` values (computed from state)
- Settings persistence (localStorage for preferences)
- Status logging utility

**Clean**: ✅ Well-focused, appropriate size

---

## Rendering Pipeline

### `js/render.js` (332 lines)
**Purpose**: Main render loop and frame orchestration
**Responsibilities**:
- `requestAnimationFrame` loop
- Frame timing and FPS calculation
- Dispatch to correct backend (WebGL/WebGPU/JS)
- Update counters and performance stats

**Clean**: ✅ Well-focused

---

### `js/compiler.js` (355 lines)
**Purpose**: Shader compilation orchestration
**Responsibilities**:
- Coordinate compilation across backends
- Handle boilerplate injection for different GLSL modes
- Error handling and status reporting
- Audio pipeline management

**Clean**: ✅ Good separation of concerns

---

### `js/backends/` (3 files, ~500 lines total)
**Purpose**: Low-level graphics/audio API abstraction

#### `webgl.js` (278 lines)
- WebGL context and program management
- GLSL compilation and linking
- Uniform location caching

#### `webgpu.js` (304 lines)
- WebGPU device initialization
- WGSL shader module creation
- Compute pipeline for audio

#### `audio-worklet.js` (129 lines)
- AudioWorklet registration
- Message passing to worklet processor

**Clean**: ✅ Well-isolated API wrappers

---

## UI & Interaction

### `js/ui.js` (710 lines) ⚠️ **LARGE - NEEDS REVIEW**
**Purpose**: UI state management and interactions
**Contains**:
- Play/pause/restart controls
- Panel divider dragging
- Canvas resizing
- Help panel dragging
- Theme switching
- Render mode cycling

**Issues**:
- **Too large** (710 lines)
- Mixed responsibilities (controls, panels, canvas, theme)

**Recommended split**:
- `js/ui/controls.js` - Play/pause/restart/volume
- `js/ui/panels.js` - Divider dragging, help panel
- `js/ui/canvas.js` - Canvas resizing and management
- `js/ui/theme.js` - Theme switching
- Keep `js/ui.js` as a re-export facade

---

### `js/fullscreen.js` (277 lines)
**Purpose**: Fullscreen mode management
**Contains**:
- Fullscreen API handling
- Auto-hide controls on inactivity
- Sync between normal and fullscreen controls
- Canvas/uniform panel positioning

**Clean**: ✅ Well-focused, self-contained

---

### `js/uniform-controls.js` (326 lines)
**Purpose**: Interactive uniform slider panel
**Contains**:
- Draggable panel UI
- Float/Int/Bool slider controls
- Uniform value updates
- Settings persistence

**Clean**: ✅ Well-focused

---

## Editor & Tabs

### `js/editor.js` (142 lines)
**Purpose**: Monaco editor initialization and configuration
**Contains**:
- Editor creation and theming
- Language configuration
- Key bindings

**Clean**: ✅ Focused

---

### `js/tabs.js` (407 lines)
**Purpose**: Tab management and rendering
**Contains**:
- Tab creation/removal
- Tab rendering and switching
- Add Pass menu
- Options menu (Vim mode)

**Clean**: ✅ Appropriate size

---

### `js/tab-config.js` (58 lines)
**Purpose**: Tab type definitions and metadata
**Clean**: ✅ Pure configuration

---

## Shader Management

### `js/shader-management.js` (652 lines) ⚠️ **LARGE - NEEDS REVIEW**
**Purpose**: Shader creation, editing, saving, forking
**Contains**:
- New shader creation
- Edit mode/display mode switching
- Save/fork workflows
- Dirty state management
- Title/description editing

**Issues**:
- **Large** (652 lines)
- Mixes UI updates with business logic

**Recommended split**:
- `js/shader/creation.js` - New shader logic
- `js/shader/editing.js` - Edit/save/fork workflows
- Keep `shader-management.js` as facade

---

### `js/save.js` (558 lines) ⚠️ **MODERATE SIZE**
**Purpose**: Database shader loading and gallery management
**Contains**:
- Load database shader
- Gallery population and caching
- Gallery item creation
- Optimistic updates

**Moderate**: Could be split but not urgent

---

## Backend & Data

### `js/backend.js` (1019 lines) ⚠️ **VERY LARGE - NEEDS SPLIT**
**Purpose**: Supabase integration (auth, storage, CRUD)
**Contains**:
- Authentication (OAuth, email/password)
- Shader CRUD operations
- Like/view tracking
- Real-time subscriptions
- Bandwidth tracking

**Issues**:
- **Too large** (1019 lines!)
- Multiple responsibilities

**URGENT - Recommended split**:
- `js/backend/auth.js` - Authentication only
- `js/backend/shaders.js` - Shader CRUD
- `js/backend/community.js` - Likes/views/subscriptions
- `js/backend/analytics.js` - Bandwidth tracking
- Keep `js/backend.js` as initialization facade

---

### `js/community.js` (91 lines)
**Purpose**: Community features (likes)
**Clean**: ✅ Small, focused

---

### `js/comments.js` (169 lines)
**Purpose**: Comment system with markdown rendering
**Clean**: ✅ Focused

---

## Supporting Modules

### `js/routing.js` (202 lines)
**Purpose**: URL handling and navigation
**Clean**: ✅ Focused

---

### `js/audio.js` (46 lines)
**Purpose**: AudioContext initialization
**Clean**: ✅ Small, focused

---

### `js/js-runtime.js` (261 lines)
**Purpose**: JavaScript runtime execution (user JS code)
**Clean**: ✅ Focused

---

### `js/uniforms.js` (139 lines)
**Purpose**: Uniform data structure and application
**Clean**: ✅ Focused

---

### `js/glsl-boilerplate.js` (206 lines)
**Purpose**: GLSL boilerplate templates for different modes
**Clean**: ✅ Pure data

---

### `js/examples.js` (224 lines)
**Purpose**: Example shaders and minimal code templates
**Clean**: ✅ Pure data

---

### `js/help-sections.js` (108 lines)
**Purpose**: Help content
**Clean**: ✅ Pure data

---

### `js/vim.js` (89 lines)
**Purpose**: Vim mode integration for Monaco
**Clean**: ✅ Small, focused

---

### `js/performance-monitor.js` (353 lines)
**Purpose**: Performance stats tracking and visualization
**Clean**: ✅ Focused

---

### `js/sanitizer.js` (90 lines)
**Status**: Unused, should be deleted
**Note**: User doesn't want sanitization

---

## CSS Files

### `css/app.css` (1034 lines) ⚠️ **LARGE**
**Purpose**: All application styles
**Issue**: Getting large, but better than inline styles

**Potential split**:
- `css/layout.css` - Grid, panels, containers
- `css/controls.css` - Buttons, sliders, inputs
- `css/modals.css` - Modal dialogs
- `css/gallery.css` - Gallery items
- `css/theme.css` - Theme variables and dark/light mode
- Keep `app.css` as import aggregator

---

### `css/fullscreen.css` (94 lines)
**Clean**: ✅ Well-separated

---

## Module Size Summary

| Module | Lines | Status |
|--------|-------|--------|
| `backend.js` | 1019 | ⚠️ **URGENT SPLIT** |
| `ui.js` | 710 | ⚠️ **NEEDS SPLIT** |
| `shader-management.js` | 652 | ⚠️ **NEEDS SPLIT** |
| `save.js` | 558 | ⚙️ Moderate |
| `app.css` | 1034 | ⚙️ Large but manageable |
| Others | <400 | ✅ Good size |

---

## Recommended Folder Structure

```
js/
├── core.js                    # State & config
├── index.js                   # Bootstrap
│
├── rendering/                 # Rendering pipeline
│   ├── render.js             # Main loop
│   ├── compiler.js           # Compilation orchestration
│   └── backends/
│       ├── webgl.js
│       ├── webgpu.js
│       └── audio-worklet.js
│
├── ui/                        # User interface
│   ├── controls.js           # Play/pause/volume
│   ├── panels.js             # Dividers, help panel
│   ├── canvas.js             # Canvas management
│   ├── theme.js              # Theme switching
│   ├── fullscreen.js         # Fullscreen mode
│   └── uniform-controls.js   # Uniform sliders
│
├── editor/                    # Code editing
│   ├── editor.js             # Monaco setup
│   ├── tabs.js               # Tab management
│   ├── tab-config.js         # Tab definitions
│   └── vim.js                # Vim mode
│
├── shader/                    # Shader management
│   ├── creation.js           # New shader workflows
│   ├── editing.js            # Edit/save/fork
│   ├── boilerplate.js        # GLSL templates
│   └── examples.js           # Example shaders
│
├── backend/                   # Supabase integration
│   ├── auth.js               # Authentication
│   ├── shaders.js            # Shader CRUD
│   ├── community.js          # Likes/views
│   ├── analytics.js          # Bandwidth tracking
│   └── index.js              # Init facade
│
├── data/                      # Data & content
│   ├── save.js               # Gallery & loading
│   ├── routing.js            # URL handling
│   ├── comments.js           # Comment system
│   └── help-sections.js      # Help content
│
└── runtime/                   # Execution
    ├── js-runtime.js         # User JS execution
    ├── uniforms.js           # Uniform data
    ├── audio.js              # Audio init
    └── performance-monitor.js
```

---

## Immediate Action Items

### 1. **URGENT: Split `backend.js`** (1019 lines)
   - Create `js/backend/` folder
   - Split into auth, shaders, community, analytics
   - This is the highest priority

### 2. **Split `ui.js`** (710 lines)
   - Create `js/ui/` folder
   - Extract controls, panels, canvas, theme

### 3. **Split `shader-management.js`** (652 lines)
   - Create `js/shader/` folder
   - Separate creation from editing workflows

### 4. **Extract inline styles from `index.html`**
   - 62 inline `style=` attributes remain
   - Move to `app.css` or component-specific CSS

### 5. **Delete `sanitizer.js`**
   - Unused and unwanted

### 6. **Optionally split `app.css`**
   - Not urgent, but would help organization

---

## Module Design Principles

1. **Single Responsibility**: Each module should have ONE clear purpose
2. **Size Limit**: Keep modules under ~400 lines where possible
3. **No Mixed Concerns**: UI code shouldn't handle data logic and vice versa
4. **Clear Interfaces**: Export only what's needed, keep internals private
5. **Facade Pattern**: Use index files to re-export from split modules
6. **No Inline Styles**: All styles in CSS files, use classes

---

## index.js Specific Rules

`index.js` should ONLY:
- Import modules
- Call module init functions
- Wire event listeners to module functions
- Handle bootstrap sequence
- Expose modules globally (if needed for backwards compatibility)

`index.js` should NEVER:
- Implement business logic
- Manipulate DOM directly (use `ui.js`)
- Contain large inline functions
- Manage state beyond initialization

---

## Recent Additions Review

### ✅ Acceptable
- `fullscreen.init()` - Proper delegation
- Default shader slug in `init()` - Bootstrap responsibility
- Uniform controls button event listener - Wire-up responsibility

### ⚠️ Watch List
- Golf URL handling could move to `routing.js` eventually
- Auth event listeners are numerous but necessary wire-up

---

*Last updated: 2025-11-08*
*Modules: 31 files*
*Total JS LOC: ~10,000*

