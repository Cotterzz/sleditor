# Phase 1: Image Channels - Complete Testing Guide

## Overview
This document provides a comprehensive testing checklist for the image channel functionality.

## Prerequisites
- Fresh page load
- Clean database (or prepared to create new shaders)
- Images in `media/` folder with `catalog.json` populated

---

## Test 1: Basic Channel Creation

### Steps:
1. Refresh the page
2. Click "⊕ Add Pass" → "🖼️ Image Channel"
3. Verify tab appears as **"Image(ch1)"**
4. Media selector UI should appear with image grid
5. Select any image from the grid

### Expected Results:
✅ Tab is named `Image(ch1)`  
✅ Media selector loads without errors  
✅ Console shows: `✓ Channel created: ch1 (image)`  
✅ Console shows: `✓ Channel updated: ch1 → [image name]`  
✅ Selected image has colored border  
✅ No duplicate UIs appear  

### GLSL Test:
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = texture(iChannel1, uv);
}
```

✅ Image displays correctly  
✅ No WebGL errors in console  

---

## Test 2: Multiple Channels

### Steps:
1. With ch1 already created, add another image channel
2. Verify new tab is **"Image(ch2)"**
3. Select a different image

### Expected Results:
✅ Tab is named `Image(ch2)` (not ch3 or ch4!)  
✅ Both channels accessible independently  
✅ Switching between tabs works correctly  
✅ No duplicate UIs when switching  

### GLSL Test:
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    // Mix both channels
    vec4 img1 = texture(iChannel1, uv);
    vec4 img2 = texture(iChannel2, uv);
    
    fragColor = mix(img1, img2, sin(iTime) * 0.5 + 0.5);
}
```

✅ Both images alternate smoothly  
✅ No WebGL errors  

---

## Test 3: Changing Channel Media

### Steps:
1. Open an existing image channel tab
2. Click a different image in the selector
3. Verify the shader updates immediately

### Expected Results:
✅ Image changes in shader  
✅ Console shows: `✓ Channel updated: chN → [new image name]`  
✅ Border highlights new selected image  
✅ NO duplicate UIs appear  
✅ Channel number stays the same (no increment!)  

---

## Test 4: Save & Load

### Steps:
1. Create shader with 2 image channels
2. Write GLSL code that uses both `iChannel1` and `iChannel2`
3. Save the shader (give it a title)
4. Refresh the page
5. Load the saved shader from gallery

### Expected Results:
✅ Both image channel tabs reappear  
✅ Tabs have correct names (`Image(ch1)`, `Image(ch2)`)  
✅ Correct images are selected (highlighted borders)  
✅ Shader renders correctly immediately  
✅ Console shows: `Loading channel configuration`  
✅ Console shows: `✓ Loaded 2 channel(s), next channel will be ch3`  
✅ No errors in console  

### Add New Channel After Load:
1. With loaded shader, add a 3rd image channel
2. Verify it's named `Image(ch3)` (not ch4 or ch5!)

✅ Correct channel number assigned  

---

## Test 5: Empty Channels (No Media Selected)

### Steps:
1. Add an image channel but DON'T select any image
2. Switch to graphics tab
3. Use `iChannel1` in shader

### Expected Results:
✅ No "Media not found" warning  
✅ Checkered fallback texture appears in shader  
✅ No errors  

---

## Test 6: Tab Switching & UI Persistence

### Steps:
1. Create 2 image channels
2. Switch to ch1, verify UI
3. Switch to graphics tab, write GLSL code
4. Switch to ch2, verify UI
5. Switch back to ch1

### Expected Results:
✅ Each channel tab shows only its own media selector  
✅ No duplicate selectors ever appear  
✅ Selected image borders persist correctly  
✅ Switching is smooth with no flicker  

---

## Test 7: Console Debugging

### In Browser Console:
```javascript
// Check all channels
channels.getChannels()
// Should show array with ch0 (main) and any image channels

// Check specific channel
channels.getChannel(1)
// Should show channel object with texture, mediaId, etc.

// Check config for saving
channels.getChannelConfig()
// Should show complete state ready for JSON serialization
```

✅ All methods work  
✅ Channel numbers match tab names  
✅ Texture objects exist  

---

## Test 8: Edge Cases

### A. Delete and Recreate
1. Load shader with channels
2. Manually delete channel tabs via X button (if implemented)
3. Add new channels
4. Verify numbering continues correctly

### B. Rapid Switching
1. Quickly switch between multiple image tabs
2. Verify no race conditions or duplicate UIs

### C. Browser Refresh Mid-Edit
1. Create channels
2. Select images
3. Write GLSL code
4. DON'T save
5. Refresh browser
6. Verify state resets cleanly (no orphaned data)

---

## Common Issues & Solutions

### Issue: Channel numbers don't match tab names
**Cause:** Old bug where channels incremented twice  
**Solution:** Refresh page, delete ALL image tabs, create new ones  

### Issue: WebGL uniform errors
**Cause:** Uniforms set before program bound  
**Solution:** Already fixed in `js/backends/webgl.js`  

### Issue: Duplicate UIs
**Cause:** Containers not hidden properly  
**Solution:** Already fixed in `js/tabs.js` `switchTab()`  

### Issue: "channels.loadChannelConfig is not a function"
**Cause:** Missing import  
**Solution:** Already fixed in `js/save.js` imports  

---

## Files Modified for Phase 1

- ✅ `js/channels.js` - Channel management core
- ✅ `js/media-loader.js` - Media catalog loading
- ✅ `js/ui/media-selector.js` - Media selection UI
- ✅ `js/tab-config.js` - Dynamic channel tab support
- ✅ `js/tabs.js` - Tab rendering & switching
- ✅ `js/compiler.js` - Dynamic uniform injection
- ✅ `js/render.js` - Removed channel binding (moved to backend)
- ✅ `js/backends/webgl.js` - Channel texture binding
- ✅ `js/shader-management.js` - Save channel config
- ✅ `js/save.js` - Load channel config
- ✅ `js/index.js` - Initialize modules
- ✅ `media/catalog.json` - Media metadata

---

## Ready for Phase 2?

Before moving to Phase 2 (Buffer Channels), ensure ALL tests above pass consistently.

Phase 2 will add:
- Buffer pass tabs
- Ping-pong rendering
- Execution order management
- Self-feedback loops

Phase 1 provides the foundation for all multipass functionality!

