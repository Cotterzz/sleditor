# Phase 1: Raw vs Regular GLSL - Implementation Complete ✅

## Summary

Successfully implemented two GLSL tab types:
- **Raw (GLSL)** - Full control, write complete shader (existing `glsl_fragment`)
- **Regular (GLSL)** - Boilerplate mode, write only `main()` function (new `glsl_regular`)

## Files Changed

### 1. **js/glsl-boilerplate.js** (NEW)
- Created boilerplate injection system
- `REGULAR_BOILERPLATE`: Standard GLSL boilerplate with all uniforms
- Helper functions: `getBoilerplateForTab()`, `getBoilerplateLineCount()`, `tabUsesBoilerplate()`
- Ready for S-Toy and Golf modes in future phases

### 2. **js/tab-config.js**
- **Changed**: `glsl_fragment` label from `'Fragment (GLSL)'` to `'Raw (GLSL)'`
- **Added**: `glsl_fragment.boilerplate = null` (explicit no injection)
- **Added**: `glsl_regular` tab config with `boilerplate: 'regular'`

### 3. **js/compiler.js**
- **Imported**: `getBoilerplateForTab`, `getBoilerplateLineCount` from glsl-boilerplate
- **Updated**: `compileGLSL()` to detect current GLSL tab type and inject boilerplate
- **Added**: Error line number adjustment - subtracts boilerplate lines from compiler errors
- **Updated**: `reloadShader()` to check for both `glsl_fragment` and `glsl_regular`

### 4. **js/shader-management.js**
- **Updated**: `showNewShaderMenu()` with categorized GLSL/WGSL sections
- **Added**: Two GLSL options in menu: "Regular (GLSL)" and "Raw (GLSL)"
- **Updated**: `createNewShader()` to handle `glsl_regular` type

### 5. **js/tabs.js**
- **Updated**: `showAddPassMenu()` to include GLSL tab options
- **Added**: `glsl_regular` and `glsl_fragment` to available tabs list
- **Added**: Mutual exclusion logic - can't have both GLSL types at once

### 6. **js/examples.js**
- **Added**: `MINIMAL_GLSL_REGULAR` - boilerplate mode starter code
- Uses `gl_FragColor` (GLSL 1.x) instead of `fragColor` (GLSL 3.0)
- Includes helpful comments about boilerplate

### 7. **js/index.js**
- **Imported**: `MINIMAL_GLSL_REGULAR` from examples
- **Updated**: `createNewShader()` to use correct minimal code based on tab type

## Technical Details

### Boilerplate Injection Flow
```
1. User writes code: void main() { ... }
2. Compiler detects tab is glsl_regular
3. Boilerplate prepended: precision + uniforms + defines + user code
4. Full source compiled by WebGL
5. If error: line numbers adjusted back to user code (subtract boilerplate lines)
```

### Error Handling
- Compiler errors report line numbers in **user code**, not full source
- Boilerplate lines are transparent to the user
- Example: Error at line 45 in full source → Reported as line 10 in user code (if 35 lines of boilerplate)

### Boilerplate Contents
```glsl
precision highp float;

// Built-in uniforms (auto-set)
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;

// Custom uniforms (JS-controlled)
uniform float u_custom0;  // through u_custom14

// Math constants
#define PI 3.1415926535897932
#define TAU 6.283185307179586
#define PHI 1.618033988749895
```

## User Experience

### New Shader Menu
```
GLSL (WebGL)
  🎨 Regular (GLSL)  ← New, boilerplate mode
  🔺 Raw (GLSL)      ← Renamed from "Fragment (GLSL)"

WGSL (WebGPU)
  🎨 Graphics (WGSL)
```

### Add Pass Menu
```
🎨 Regular (GLSL)
🔺 Raw (GLSL)
🔊 Audio (WGSL)
🎵 Audio (Worklet)
⚡ JavaScript
```

### Tab Bar Display
- Raw shaders: `🔺 Raw (GLSL)`
- Regular shaders: `🎨 Regular (GLSL)`

## Backwards Compatibility

✅ **All existing `glsl_fragment` shaders work unchanged**
- Display name changed, but internal identifier and `dbKey` unchanged
- No migration needed
- No database schema changes

## Testing Checklist

- [ ] **Raw mode unchanged**: Load existing GLSL shader, verify it compiles
- [ ] **Display name updated**: Tab shows "Raw (GLSL)" not "Fragment (GLSL)"
- [ ] **Regular mode works**: Create new Regular shader, verify boilerplate injected
- [ ] **Compilation**: Regular shader compiles successfully
- [ ] **Error line numbers**: Introduce syntax error in Regular mode, verify line number is correct
- [ ] **New shader menu**: Both options appear and work
- [ ] **Add pass menu**: Both GLSL options appear
- [ ] **Save/load Regular**: Save a Regular shader, reload, verify correct tab type loads
- [ ] **Tab switching**: Switch between Raw and Regular tabs, code persists
- [ ] **Mutual exclusion**: Can't add Raw if Regular is active (and vice versa)

## Next Steps (Future Phases)

### Phase 2: S-Toy Mode (~1 hour)
- Add `STOY_BOILERPLATE` to `glsl-boilerplate.js`
- Add `glsl_stoy` to `TAB_CONFIG`
- Update menus
- Add `MINIMAL_GLSL_STOY` to examples
- **Requires**: iMouse uniform implementation (vec4 with Shadertoy behavior)

### Phase 3: Golf Mode (~30 min)
- Add `GOLF_BOILERPLATE` to `glsl-boilerplate.js`
- Add `glsl_golf` to `TAB_CONFIG`
- Update menus
- Add `MINIMAL_GLSL_GOLF` to examples

## Architecture Benefits

✅ **Centralized**: Single boilerplate source in `glsl-boilerplate.js`
✅ **Extensible**: Easy to add S-Toy and Golf modes
✅ **Type-safe**: Tab type determines boilerplate, no mode selector confusion
✅ **Clean separation**: Boilerplate injection is compile-time only, not saved to DB
✅ **Error transparency**: Users see errors in their code, not full source
✅ **No API changes**: JavaScript uniform API unchanged for all modes

## Estimated Time

**Actual**: ~2 hours (as predicted)

## Status

✅ **Implementation Complete**
⏳ **Testing Required**

---

**Ready for user testing!** 🚀

