# localStorage Shader Saving Removal

## Overview
Removed all localStorage-based shader saving functionality to simplify the codebase. Users must now sign in to save shaders (cloud storage only via Supabase).

## What Was Removed

### Functions Removed from `js/save.js`
- `getAllSavedShaders()` - Read shaders from localStorage
- `saveShaderToStorage()` - Save shader to localStorage
- `loadSavedShader()` - Load shader from localStorage
- `deleteSavedShader()` - Delete shader from localStorage
- `mapLegacyCodeKey()` - Handle legacy localStorage naming

### UI Elements Removed from `index.html`
- Save modal (`#saveModal`) - No longer needed for localStorage saves
- Modal form fields (title, description, tags inputs)
- Modal buttons (Save/Cancel)

### Code Changes

#### `js/save.js`
- Removed all localStorage functions (150+ lines)
- Updated `populateGallery()` to show "Sign in to save" for non-logged-in users in "My Shaders" tab
- Updated `createGalleryItem()` to only handle database deletes, not localStorage
- Removed `MAX_SAVED_SHADERS` constant
- Removed `isLocalStorage` source type handling

#### `js/shader-management.js`
- Removed `showSaveModal()` function
- Removed `hideSaveModal()` function
- `handleSaveForkClick()` already required login - no changes needed
- Removed from exports list

#### `js/index.js`
- Renamed `setupSaveSystem()` to `setupSaveButton()`
- Removed modal button event listeners (`saveCancelBtn`, `saveConfirmBtn`)
- Removed localStorage save handling in `shader-saved` event listener
- Simplified event handlers to only handle database saves

#### `js/core.js`
- Removed `currentSavedShader` state property (localStorage tracking)
- Kept `currentDatabaseShader` for cloud saves

#### `index.html`
- Removed entire `#saveModal` div and all its contents (~22 lines)

## What Was Kept

### Settings Still in localStorage
- `isDarkMode` - Theme preference
- `isVimMode` - Vim mode preference  
- `jsExecutionMode` - JS execution mode preference

These are stored in `js/core.js` using `STORAGE_KEY = 'sleditor_settings'`.

## Benefits

1. **Simplified Codebase**: Removed ~200 lines of localStorage logic
2. **Single Save Path**: All saves go through Supabase (consistent behavior)
3. **No Sync Issues**: No confusion between localStorage and cloud saves
4. **Better UX**: Clear expectation that sign-in is required to save
5. **Reduced Testing Surface**: Don't need to test two different save systems

## Migration Impact

### For Users
- **Before**: Could save up to 10 shaders locally without signing in
- **After**: Must sign in to save any shaders (cloud storage)
- **Settings**: Theme and vim mode preferences still saved locally

### For Developers
- Gallery "My Shaders" tab now shows login prompt if not signed in
- All save operations now require authentication
- No modal flow for saves (all inline with title/description editing)

## Files Modified
- `js/save.js` - Major refactor (150+ lines removed)
- `js/shader-management.js` - Removed modal functions
- `js/index.js` - Simplified save system setup
- `js/core.js` - Removed localStorage shader tracking
- `index.html` - Removed save modal UI

## Testing Checklist
- [ ] Sign in and save a shader (database)
- [ ] Edit and re-save owned shader
- [ ] Fork someone else's shader
- [ ] Delete owned shader
- [ ] Check "My Shaders" tab shows login prompt when not signed in
- [ ] Verify gallery caching still works
- [ ] Verify theme and vim mode settings persist (localStorage settings)
- [ ] Check that no console errors appear related to missing modal elements

## Date
November 4, 2025

