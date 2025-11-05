# localStorage Removal - Bug Fixes

## Issues Found After Initial Removal

### 1. Missing `mapLegacyCodeKey` Function
**Error**: `ReferenceError: mapLegacyCodeKey is not defined`

**Cause**: This function was removed thinking it was only for localStorage, but it's actually needed for database shaders with legacy naming conventions (e.g., old shaders saved with `wgsl_audio` instead of `audio_gpu`).

**Fix**: Re-added `mapLegacyCodeKey()` function to `js/save.js` (lines 42-60). It handles:
- Ambiguous `graphics` key (could be GLSL or WGSL)
- Legacy database key mappings via `dbKeyToTabName()`

### 2. Missing `isDatabase` Variable (Multiple Locations)
**Error**: `ReferenceError: isDatabase is not defined`

**Cause**: Removed the `source` parameter from `createGalleryItem()` but didn't clean up all references to `isDatabase` variable properly.

**Fix**: 
- Removed `source` parameter entirely from `createGalleryItem(data, isOwned)`
- Now assumes all gallery items are database shaders (which is correct)
- Updated all 5 call sites:
  - `createGalleryItem(shader, 'database', true)` → `createGalleryItem(shader, true)`
  - `createGalleryItem(shader, 'database', false)` → `createGalleryItem(shader, false)`
- Removed conditional checks `if (isDatabase && data.creator_name)` → `if (data.creator_name)`
- Removed conditional block `if (isDatabase)` around stats display (now always shown)

### 3. Missing Import
**Fix**: Added `dbKeyToTabName` and `getEditorForTab` to imports from `tab-config.js` (needed by `mapLegacyCodeKey` and `loadDatabaseShader`)

## Files Modified
- `js/save.js` - Added back `mapLegacyCodeKey()`, simplified `createGalleryItem()`, updated imports

## Testing
✅ No linter errors  
✅ All references resolved  
✅ Function signatures simplified

## Note
`mapLegacyCodeKey()` is **still needed** for database shaders, not just localStorage! It handles:
- Old shaders with `graphics` key that could be GLSL or WGSL
- Legacy keys like `wgsl_audio` → `audio_gpu`, `javascript` → `js`, etc.

This will be needed indefinitely for backwards compatibility with existing database shaders.

