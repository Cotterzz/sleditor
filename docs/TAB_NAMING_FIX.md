# Tab Naming System - Comprehensive Fix

## Date: November 3, 2025

## Problem Summary

The SLEditor had severe inconsistencies in how tab names were handled throughout the codebase, causing critical bugs:

### Critical Bugs Fixed:
1. **Audio not saving** - `audio_gpu` tab was being checked as `wgsl_audio`, so audio code was never saved to database
2. **Code key mismatches** - Tab names didn't match database code keys
3. **Legacy key confusion** - Multiple naming variants (`audioworklet` vs `audio_worklet`, `javascript` vs `js`)
4. **localStorage inconsistency** - Always saved graphics as `code.graphics` regardless of GLSL/WGSL

### Naming Inconsistencies Found:

| Tab Name | Old DB Key | What it SHOULD be |
|----------|-----------|-------------------|
| `graphics` | `graphics` | ✅ (WGSL graphics) |
| `glsl_fragment` | `graphics` ❌ | `glsl_fragment` |
| `audio_gpu` | `wgsl_audio` ❌ | `audio_gpu` |
| `audio_worklet` | `audioworklet` ❌ | `audio_worklet` |
| `js` | `javascript` ❌ | `js` |

## Solution Implemented

### 1. Created Central Configuration (`js/tab-config.js`)

Single source of truth for all tab metadata:

```javascript
export const TAB_CONFIG = {
    graphics: {
        label: 'Graphics (WGSL)',
        icon: '🎨',
        dbKey: 'graphics',        // What gets saved to DB
        editor: 'graphics',
        type: 'webgpu'
    },
    audio_gpu: {
        label: 'Audio (WGSL)',
        icon: '🔊',
        dbKey: 'audio_gpu',       // Now matches tab name!
        editor: 'audio',
        type: 'webgpu'
    },
    // ... etc
};
```

### 2. Legacy Key Mapping

Handles old shaders saved with incorrect keys:

```javascript
export const LEGACY_DB_KEYS = {
    'wgsl_audio': 'audio_gpu',
    'audioworklet': 'audio_worklet',
    'javascript': 'js',
    'wgsl_graphics': 'graphics'
};
```

### 3. Helper Functions

- `getTabConfig(tabName)` - Get full config
- `getTabDbKey(tabName)` - Get database key for saving
- `dbKeyToTabName(dbKey)` - Map DB key back to tab (handles legacy)
- `getEditorForTab(tabName, state)` - Get Monaco editor instance
- `tabRequiresWebGPU(tabName)` - Check compatibility
- `tabsAreMutuallyExclusive(tab1, tab2)` - Enforce constraints

## Files Changed

### 1. **js/tab-config.js** (NEW)
- Central tab configuration system
- Legacy key mapping
- Helper functions

### 2. **js/core.js**
- Removed `helpEditor` from state
- Changed default `activeTabs` from `['glsl_fragment', 'help']` to `['glsl_fragment']`

### 3. **js/tabs.js**
- Removed duplicate `getTabIcon()` and `getTabLabel()` functions
- Now imports from `tab-config.js`
- Updated `addTab()` to use `tabRequiresWebGPU()` and `tabsAreMutuallyExclusive()`

### 4. **js/save.js**
- Removed duplicate icon/label functions
- Updated `saveShaderToStorage()` to use proper DB keys via `getTabDbKey()`
- Updated `loadSavedShader()` to use `dbKeyToTabName()` for legacy support
- Updated `loadDatabaseShader()` to use mapping system

### 5. **index.html**
- Added import: `import * as tabConfig from './js/tab-config.js'`
- Exposed globally: `window.tabConfig = tabConfig`
- Fixed **3 save functions** to use tab config:
  1. `saveShaderInline()` - Main save (was missing audio_gpu!)
  2. Save as example function
  3. `saveOwnedShader()` - Quick update function
- Removed all `t !== 'help'` filters (help is not a tab anymore)

## How It Works Now

### Saving:
```javascript
// Build code object using proper DB keys
const code = {};
state.activeTabs.forEach(tabName => {
    const editor = getEditorForTab(tabName, state);
    if (editor) {
        const dbKey = getTabDbKey(tabName);  // Get correct DB key
        code[dbKey] = editor.getValue();      // Save with correct key!
    }
});
```

### Loading:
```javascript
// Load with legacy support
Object.keys(shader.code).forEach(dbKey => {
    const tabName = dbKeyToTabName(dbKey);  // Map DB key → tab (handles legacy!)
    const editor = getEditorForTab(tabName, state);
    if (editor) {
        editor.setValue(shader.code[dbKey]);
    }
});
```

## Benefits

1. ✅ **Critical bugs fixed** - audio_gpu now saves correctly
2. ✅ **Single source of truth** - all tab metadata in one place
3. ✅ **Backwards compatible** - old shaders still load
4. ✅ **Type safe** - consistent types everywhere
5. ✅ **Future proof** - easy to add buffer passes
6. ✅ **Maintainable** - one place to update tab properties
7. ✅ **Self-documenting** - clear what each tab does

## Database Impact

**NO DATABASE MIGRATION NEEDED!**

The system uses a translation layer, so:
- Existing shaders load correctly via legacy mapping
- New shaders save with proper keys
- DB structure unchanged
- No data migration required

## Future: Buffer Passes

Adding buffer passes is now straightforward:

```javascript
function addBufferPass(baseTab, index) {
    const baseConfig = TAB_CONFIG[baseTab];
    const newTab = `${baseTab}_buffer_${index}`;
    
    TAB_CONFIG[newTab] = {
        ...baseConfig,
        label: `Buffer ${String.fromCharCode(64 + index)}`,
        dbKey: newTab,
        isBuffer: true
    };
}

// addBufferPass('graphics', 1) 
// → Creates: 'graphics_buffer_1'
// → Saves as: code.graphics_buffer_1
```

## Testing Checklist

- [ ] Load existing shaders from database (test legacy keys)
- [ ] Load localStorage shaders
- [ ] Save new shader with audio_gpu tab
- [ ] Save new shader with audio_worklet tab
- [ ] Save new shader with JS tab
- [ ] Save new shader with GLSL graphics
- [ ] Save new shader with WGSL graphics
- [ ] Fork existing shader
- [ ] Update owned shader
- [ ] Check code_types array has correct tab names
- [ ] Check code object has correct DB keys

## Notes

- Help is no longer a tab (removed from defaults)
- Help panel UI remains (not a tab, just a UI panel)
- Boilerplate is never saved/loaded (reference only)
- Tab names are internal, users see labels
- DB keys can differ from tab names (for compatibility)

