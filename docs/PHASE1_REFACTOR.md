# Phase 1 Refactoring - Module Extraction

## Date: November 3, 2025

## Overview
Extracted functions from index.html (~3000 LOC) into organized modules to improve maintainability and code organization.

## New Modules Created

### 1. `js/ui.js` - User Interface Controls
**Purpose:** General UI interactions, theme, playback, panels, canvas resizing

**Functions Moved:**
- `applyTheme()`, `toggleTheme()` - Theme switching
- `togglePlayPause()`, `updatePlayPauseButton()`, `restart()` - Playback controls
- `toggleHelpPanel()`, `startHelpDrag()`, `doHelpDrag()`, `stopHelpDrag()`, `initializeHelp()` - Help panel
- `setupPanelDividers()`, `setupHorizontalCanvasDivider()` - Panel resizing
- `setupCanvasResizeObserver()` - Canvas resize handling
- `updateRenderMode()` - Render mode control
- `switchTopLevelPanel()` - Panel switching
- `showAuthMessage()`, `hideAuthMessage()` - Auth messages

**Dependencies:**
- Imports: `core.js`, `vim.js`
- Exports: All functions for use by index.html

---

### 2. `js/shader-management.js` - Shader Operations
**Purpose:** Creating, editing, and saving shaders

**Functions Moved:**
- `createNewShader()`, `showNewShaderMenu()` - New shader creation
- `enterEditMode()`, `exitEditMode()`, `isInEditMode()` - Edit mode
- `isShaderOwnedByUser()` - Ownership check
- `handleSaveForkClick()`, `saveOwnedShader()`, `saveShaderInline()` - Save operations
- `markDirty()`, `setupDirtyTracking()` - Dirty tracking
- `updateSaveButton()` - Save button state
- `showSaveModal()`, `hideSaveModal()` - Modal control

**Dependencies:**
- Imports: `core.js`, `tabs.js`, `backend.js`
- Exports: Functions exposed via `window.shaderManagement`

---

### 3. Existing `js/tabs.js` - Already Modular
**Purpose:** Tab management (rendering, switching, adding/removing)

**Current Scope:**
- Tab rendering and switching
- Add/remove tabs
- Add Pass menu
- Options menu (dispatches events)

**No Changes Needed** - already well organized

---

## Division of Responsibilities

| Module | Responsibility | Examples |
|--------|---------------|----------|
| `tabs.js` | Tab-specific UI & logic | renderTabs(), switchTab(), showAddPassMenu() |
| `ui.js` | General UI controls | theme, play/pause, canvas resize, panel dividers |
| `shader-management.js` | Shader CRUD operations | create, edit, save, fork, dirty tracking |
| `index.html` | App initialization & orchestration | init(), reloadShader(), compileGLSL() |

---

## Benefits

### ✅ Immediate
1. **Reduced index.html** from ~3000 LOC (still large, but better)
2. **Clear separation** of concerns
3. **Easier navigation** - find functions by purpose
4. **Better IDE support** - autocomplete, go-to-definition
5. **Testable** - functions can be unit tested

### ✅ Future
1. **Foundation for Phase 2** (state refactoring)
2. **Easy to add features** - clear where new code goes
3. **Reduced merge conflicts** - changes in different modules
4. **Documentation** - modules are self-documenting

---

## Integration with index.html

Both new modules expose functions via window:
```javascript
// In index.html, after imports:
import * as ui from './js/ui.js';
import * as shaderManagement from './js/shader-management.js';

// Make UI functions available
window.ui = ui;

// Shader management exposes itself via window.shaderManagement
```

### Functions Still in index.html (Core App Logic):
- `init()` - Main initialization
- `initWebAudio()` - Audio setup
- `reloadShader()` - Shader compilation orchestration
- `compileGLSL()` - GLSL-specific compilation
- `stopAudio()` - Audio cleanup
- `loadExample()` - Example loading
- `setupSaveSystem()` - Save system initialization
- `setupUI()` - UI setup orchestration
- `updateCanvasSize()` - Canvas resizing
- `toggleJSExecMode()` - JS execution mode
- View/Like functions - Could move to separate module later

---

## Files Modified

### Created:
- ✅ `js/ui.js` (429 lines)
- ✅ `js/shader-management.js` (446 lines)

### Next Steps (Not Done Yet):
- Move remaining functions to `js/app.js` or similar
- Update index.html to import and use new modules
- Test all functionality
- Consider Phase 2 (state refactoring)

---

## Usage Examples

### Before (in index.html):
```javascript
function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    applyTheme();
    saveSettings({ isDarkMode: state.isDarkMode });
}
```

### After:
```javascript
// In ui.js
export function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    applyTheme();
    saveSettings({ isDarkMode: state.isDarkMode });
}

// In index.html
import * as ui from './js/ui.js';
window.ui = ui;

// Event listener:
window.addEventListener('toggle-theme', () => ui.toggleTheme());
```

---

## Testing Checklist

After integrating these modules:
- [ ] Theme toggle works
- [ ] Play/Pause works
- [ ] Restart works
- [ ] Help panel drag works
- [ ] Panel dividers work
- [ ] Canvas resizing works
- [ ] New shader creation works
- [ ] Edit mode works (forking)
- [ ] Save shader works
- [ ] Dirty tracking works
- [ ] Save button states correct

---

## Low Risk Assessment

This refactoring is **low risk** because:
1. ✅ Just moving code, not changing logic
2. ✅ Functions keep same signatures
3. ✅ Dependencies clearly imported
4. ✅ Can be done incrementally
5. ✅ Easy to revert if issues

---

## Next Phase Recommendations

### Phase 2: State Refactoring
- Group state into logical namespaces
- Add getters/setters for validation
- Improve state initialization

### Phase 3: Event System
- Create centralized event bus
- Type-safe event names
- Better debugging

### Phase 4: More Module Extraction
- `js/app.js` - remaining init/orchestration
- `js/compilation.js` - shader compilation
- `js/views-likes.js` - social features

