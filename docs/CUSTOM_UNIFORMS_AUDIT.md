# Custom Uniforms - Complete Audit & Fix Summary

## Issues Found & Fixed

### Issue 1: GLSL Bool Uniforms
**Problem:** Changed `uniform int` to `uniform bool` for customBool0/1  
**Why it's wrong:** GLSL doesn't support bool uniforms - they must be `int` (0 or 1)  
**Fixed:** All GLSL boilerplates now use `uniform int u_customBool0/1`

### Issue 2: WGSL Missing Int/Bool Uniforms
**Problem:** WGSL struct only had 15 float uniforms (custom0-14)  
**Fixed:** Added to `examples.js`:
- `customInt0-2: i32` at buffer indices 22-24
- `customBool0-1: i32` at buffer indices 25-26

## Final Uniform Layout

### Buffer Indices (shared across WebGL & WebGPU):
```
0-4:   Built-in (time, audioCurrentTime, audioPlayTime, audioFractTime, audioFrame)
5-6:   Mouse (mouseX, mouseY)
7-21:  Float custom uniforms (custom0-14)
22-24: Int custom uniforms (customInt0-2)
25-26: Bool custom uniforms (customBool0-1, stored as int)
```

## Uniform Declarations by Shader Type

### GLSL (Regular, S-Toy, Golf, Raw):
```glsl
uniform float u_custom0;    // ... u_custom14
uniform int u_customInt0;   // ... u_customInt2  
uniform int u_customBool0;  // ... u_customBool1 (0/1)
```

### WGSL:
```wgsl
struct Uniforms {
    // ... built-ins ...
    custom0: f32,      // ... custom14
    customInt0: i32,   // ... customInt2
    customBool0: i32,  // ... customBool1 (0/1)
}
```

## Backend Support

### uniforms.js (applyWebGL):
✅ Floats: Loops 0-14, calls `gl.uniform1f(loc, f32[7+i])`  
✅ Ints: Loops 0-2, calls `gl.uniform1i(loc, i32[22+i])`  
✅ Bools: Loops 0-1, calls `gl.uniform1i(loc, i32[25+i])`

### WebGPU:
✅ Uses shared buffer, no special handling needed (buffer layout matches struct)

## Uniform Controls UI
✅ 15 float sliders → buffer indices 7-21  
✅ 3 int sliders → buffer indices 22-24  
✅ 2 bool checkboxes → buffer indices 25-26

## JS API (for reference):
```javascript
api.uniforms.setCustomFloat(slot, value)  // slot: 0-14
// Note: setCustomInt() and setCustomBool() don't exist yet in JS API
// But the UI controls write directly to buffer indices
```

## Status: ✅ COMPLETE
All uniforms now properly declared and wired in:
- GLSL Regular boilerplate
- GLSL S-Toy boilerplate  
- GLSL Golf boilerplate
- WGSL boilerplate
- WebGL backend
- WebGPU backend (via shared buffer)
- Uniform controls UI

