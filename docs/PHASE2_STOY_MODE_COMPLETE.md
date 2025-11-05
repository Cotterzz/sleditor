# Phase 2: S-Toy Mode - Implementation Complete ✅

## Summary

Successfully implemented **S-Toy (GLSL)** tab type with Shadertoy compatibility layer!

Users can now:
- Create S-Toy shaders using `mainImage()` function
- Import shaders directly from Shadertoy.com
- Use familiar Shadertoy uniforms: `iTime`, `iResolution`, `iMouse`, etc.

## Files Changed

### 1. **js/glsl-boilerplate.js**
- **Added**: `STOY_BOILERPLATE` with Shadertoy compatibility layer
- **Updated**: `getBoilerplateForTab()` to handle `'stoy'` case

**Key Features**:
```glsl
// Shadertoy uniform mapping
#define iTime u_time
#define iTimeDelta (1.0 / 60.0)
#define iFrame float(u_frame)
#define iResolution vec3(u_resolution, 1.0)

// iMouse (simplified - always shows current mouse)
vec4 iMouse = vec4(u_mouse * u_resolution, u_mouse * u_resolution);

// Wrapper that calls user's mainImage
void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}
```

### 2. **js/tab-config.js**
- **Added**: `glsl_stoy` tab configuration
- Icon: 🔺, Label: "S-Toy (GLSL)"
- `boilerplate: 'stoy'`

### 3. **js/compiler.js**
- **Updated**: `compileGLSL()` to detect `glsl_stoy` tab
- **Updated**: `reloadShader()` to include `glsl_stoy` in GLSL checks

### 4. **js/shader-management.js**
- **Updated**: `showNewShaderMenu()` to add S-Toy option (middle position)
- **Updated**: `createNewShader()` to handle `glsl_stoy` type

### 5. **js/tabs.js**
- **Updated**: `showAddPassMenu()` to include S-Toy option
- **Updated**: Mutual exclusion logic for GLSL tabs
- **Updated**: `switchTab()` mappings for `glsl_stoy`

### 6. **js/examples.js**
- **Added**: `MINIMAL_GLSL_STOY` starter code with `mainImage()` function

### 7. **js/index.js**
- **Imported**: `MINIMAL_GLSL_STOY`
- **Updated**: `createNewShader()` to select correct minimal code

## User Experience

### New Shader Menu
```
GLSL (WebGL)
  🎨 Regular (GLSL)  - Boilerplate, just main()
  🔺 S-Toy (GLSL)    - Shadertoy compatible ← NEW
  🔺 Raw (GLSL)      - Full control

WGSL (WebGPU)
  🎨 Graphics (WGSL)
```

### Add Pass Menu
```
🎨 Regular (GLSL)
🔺 S-Toy (GLSL)  ← NEW
🔺 Raw (GLSL)
🔊 Audio (WGSL)
🎵 Audio (Worklet)
⚡ JavaScript
```

### Minimal S-Toy Code
```glsl
// Shadertoy mode - write your mainImage() function!
// Compatible with shaders from shadertoy.com

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord / iResolution.xy;
    
    // Time-varying color gradient
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(iTime));
    
    // Output to screen
    fragColor = vec4(col, 1.0);
}
```

## Shadertoy Compatibility

### Supported Uniforms ✅
- `iTime` - Shader playback time (seconds)
- `iTimeDelta` - Approximate render time (1/60)
- `iFrame` - Frame counter (as float)
- `iResolution` - Canvas resolution (vec3: width, height, 1.0)
- `iMouse` - Mouse position (vec4: current xy, current xy)

### Not Yet Implemented ⏳
- `iMouse` drag/click states (zw tracking)
- `iDate` - Current date/time
- `iChannel0-3` - Texture inputs
- `iChannelResolution[4]` - Texture resolutions
- Multiple buffer passes

### Usage Example

To import a Shadertoy shader:
1. Click "New Shader" → "S-Toy (GLSL)"
2. Copy the `mainImage()` function from Shadertoy
3. Paste directly into the editor
4. Hit compile - it should work! ✨

**Note**: Shaders using textures (`iChannel0`, etc.) or advanced features won't work yet.

## Boilerplate Differences

### Regular Mode
```glsl
void main() {
    // Use u_time, u_resolution, gl_FragCoord
    fragColor = vec4(color, 1.0);
}
```

### S-Toy Mode
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Use iTime, iResolution, fragCoord
    fragColor = vec4(color, 1.0);
}
```

Key differences:
- Function signature: `main()` vs `mainImage(out vec4, in vec2)`
- Uniforms: `u_*` vs `i*`
- Position: `gl_FragCoord.xy` vs `fragCoord` parameter

## Testing Checklist

- [x] **S-Toy option appears** in New Shader menu
- [x] **S-Toy option appears** in Add Pass menu
- [x] **Tab displays correctly**: "🔺 S-Toy (GLSL)"
- [x] **Editor visible** when S-Toy tab is active
- [x] **Minimal code loads** with `mainImage()` function
- [x] **Compilation works** with boilerplate injection
- [ ] **iTime updates** (test animation)
- [ ] **iResolution correct** (test `fragCoord / iResolution.xy`)
- [ ] **iMouse works** (test mouse position)
- [ ] **Import from Shadertoy** (copy simple shader, verify it works)
- [ ] **Error line numbers** adjusted correctly

## Known Limitations

1. **iMouse behavior**: Simplified version, doesn't track drag/click states
2. **No texture support**: `iChannel0-3` not implemented
3. **No buffer passes**: Single-pass only
4. **iDate**: Always vec4(0.0)

These can be added in future phases if needed!

## Architecture Benefits

✅ **Clean separation**: Boilerplate lives in one place
✅ **Easy to maintain**: Add more Shadertoy features by editing boilerplate
✅ **No breaking changes**: Existing Raw and Regular modes unchanged
✅ **Copy-paste ready**: Import Shadertoy shaders with minimal modification

## Estimated Time

**Actual**: ~30 minutes (faster than predicted due to established pattern)

## Next Steps

### Optional: Enhance S-Toy Mode
- Implement proper iMouse drag/click tracking
- Add iDate support (real date/time)
- Add texture support (iChannel0-3)
- Add buffer pass support

### Phase 3: Golf Mode (~30 min)
- Ultra-compact macros for code golf competitions
- Single-letter variable names
- Minimal syntax

---

**Ready for testing!** 🚀

Try creating a new S-Toy shader and pasting code from [Shadertoy.com](https://www.shadertoy.com/)!

