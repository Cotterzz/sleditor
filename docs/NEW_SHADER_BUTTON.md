# New Shader Button - Implementation

## Date: November 3, 2025

## Problem
Users had no way to create a blank/new shader. They had to fork an example shader, which was unintuitive. The share button (🔗) was also redundant since the URL bar updates live.

## Solution Implemented

### 1. **Removed Share Button**
- Deleted the 🔗 share button entirely
- Removed `copyShareLink()` function
- Removed event listener
- URL bar updates automatically, so explicit sharing isn't needed

### 2. **Added New Shader Button (📄 ▾)**
- Dropdown menu with two options:
  - 🔺 **New GLSL Shader** - Creates blank GLSL fragment shader
  - 🎨 **New WGSL Shader** - Creates blank WGSL compute shader
  - WGSL option is disabled if WebGPU not available

### 3. **Minimal Shader Templates**

Added to `js/examples.js`:

#### GLSL Template (`MINIMAL_GLSL`)
```glsl
#version 300 es
precision highp float;

// Uniforms (automatically provided by SLEditor)
uniform vec3 iResolution;  // Canvas resolution (width, height, aspect)
uniform float iTime;       // Time in seconds since start
uniform vec4 iMouse;       // Mouse position (x, y, clickX, clickY)
uniform int iFrame;        // Frame counter

out vec4 fragColor;

void main() {
    // Normalized pixel coordinates (0.0 to 1.0)
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    
    // Simple gradient
    vec3 col = vec3(uv.x, uv.y, 0.5);
    
    // Output to screen
    fragColor = vec4(col, 1.0);
}
```

#### WGSL Template (`MINIMAL_WGSL`)
```wgsl
// Simple WGSL graphics shader
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    // Get pixel coordinates
    let coord = vec2<i32>(i32(gid.x), i32(gid.y));
    
    // Check bounds
    if (coord.x >= SCREEN_WIDTH || coord.y >= SCREEN_HEIGHT) {
        return;
    }
    
    // Normalized coordinates (0.0 to 1.0)
    let uv = vec2<f32>(f32(coord.x), f32(coord.y)) / vec2<f32>(f32(SCREEN_WIDTH), f32(SCREEN_HEIGHT));
    
    // Simple gradient
    let color = vec4<f32>(uv.x, uv.y, 0.5, 1.0);
    
    // Write to screen
    textureStore(screenTexture, coord, color);
}
```

### 4. **createNewShader(type) Function**

Features:
- **Unsaved changes warning** - Prompts user if `state.isDirty`
- **Clear state** - Resets current shader references
- **Clear URL** - Removes hash from URL bar
- **Reset UI** - Sets title to "Untitled", clears creator/description
- **Set up tabs** - Loads appropriate tab (glsl_fragment or graphics)
- **Load template** - Sets editor value to minimal template
- **Clear other editors** - Empties audio and JS editors
- **Auto-compile** - Automatically compiles the new shader
- **Success message** - Shows "New GLSL/WGSL shader created"

### 5. **showNewShaderMenu() Function**

Creates dropdown menu similar to "Add Pass":
- Positions below button
- Hover effects
- Click outside to close
- Disables WGSL option if WebGPU unavailable

## Files Modified

1. **js/examples.js**
   - Added `MINIMAL_GLSL` constant
   - Added `MINIMAL_WGSL` constant

2. **index.html**
   - Removed share button HTML
   - Added new shader button HTML: `<button id="newShaderBtn">`
   - Imported `MINIMAL_GLSL, MINIMAL_WGSL` from examples.js
   - Removed `copyShareLink()` function
   - Added `createNewShader(type)` function
   - Added `showNewShaderMenu()` function
   - Changed event listener from `shareBtn` to `newShaderBtn`

## User Experience

### Before:
1. User loads SLEditor
2. Must find and fork an example
3. Delete example code
4. Start writing

### After:
1. User loads SLEditor
2. Click "📄 ▾" button
3. Choose "New GLSL" or "New WGSL"
4. Start writing immediately

## Edge Cases Handled

- ✅ Warns on unsaved changes
- ✅ Disables WGSL if WebGPU unavailable
- ✅ Clears URL hash (no stale references)
- ✅ Resets all state properly
- ✅ Auto-compiles new shader
- ✅ Updates save button state

## Future Enhancements

Could add more templates:
- GLSL with audio
- WGSL with audio
- Advanced templates (raymarching, etc.)
- User-saved templates

## Testing

Test these scenarios:
1. ✅ Click "New GLSL" - should create blank GLSL shader
2. ✅ Click "New WGSL" - should create blank WGSL shader
3. ✅ Make changes, click "New" - should warn about unsaved changes
4. ✅ Test on non-WebGPU browser - WGSL option should be disabled
5. ✅ Check URL bar - should clear hash when creating new shader
6. ✅ Click outside menu - menu should close

