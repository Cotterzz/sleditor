# Uniform System Documentation

## ✅ Unified Uniform System (Both GLSL and WGSL)

### Built-in Uniforms (Auto-set Every Frame)

Both GLSL and WGSL have access to these uniforms automatically:

| Uniform | GLSL Name | WGSL Name | Type | Description |
|---------|-----------|-----------|------|-------------|
| Time | `u_time` | `uniforms.time` | float/f32 | Elapsed time in seconds |
| Resolution | `u_resolution` | N/A* | vec2 | Canvas width/height in pixels |
| Mouse | `u_mouse` | `uniforms.mouseX`<br>`uniforms.mouseY` | vec2<br>f32, f32 | Mouse position (0-1 normalized) |
| Frame | `u_frame` | N/A** | int | Visual frame counter |

\* WGSL uses constants `SCREEN_WIDTH` and `SCREEN_HEIGHT` instead  
\** WGSL doesn't expose frame counter in uniform buffer

### Custom Uniforms (User-controlled from JavaScript)

**15 custom float slots** available (slots 0-14):

| Slot | GLSL Name | WGSL Name | Buffer Index |
|------|-----------|-----------|--------------|
| 0 | `u_custom0` | `uniforms.custom0` | 7 |
| 1 | `u_custom1` | `uniforms.custom1` | 8 |
| 2 | `u_custom2` | `uniforms.custom2` | 9 |
| ... | ... | ... | ... |
| 14 | `u_custom14` | `uniforms.custom14` | 21 |

---

## 🎮 JavaScript API

### Setting Custom Uniforms

```javascript
function enterframe(state, api) {
    // Set custom float uniforms (slots 0-14)
    api.uniforms.setCustomFloat(0, someValue);
    api.uniforms.setCustomFloat(1, anotherValue);
    
    // Set custom int uniforms (slots 0-14)
    api.uniforms.setCustomInt(0, someIntValue);
    
    // Legacy API (still works, uses buffer indices 7-21)
    api.uniforms.setFloat(7, someValue);  // Same as setCustomFloat(0, ...)
}
```

### What You DON'T Need to Set

These are **automatically available** in both backends:
- ✅ Time (`u_time` / `uniforms.time`)
- ✅ Mouse position (`u_mouse` / `uniforms.mouseX`, `uniforms.mouseY`)
- ✅ Resolution (`u_resolution` / `SCREEN_WIDTH`, `SCREEN_HEIGHT`)
- ✅ Frame counter (`u_frame`)

---

## 🎨 GLSL Example

```glsl
#version 300 es
precision highp float;

// Built-in uniforms (auto-set)
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_frame;

// Custom uniforms (set via JS)
uniform float u_custom0;  // Your custom data
uniform float u_custom1;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    
    // Mouse is automatically available!
    float dist = distance(uv, u_mouse);
    
    // Use your custom uniform
    float wobble = u_custom0;
    
    vec3 col = vec3(uv * wobble, sin(u_time));
    fragColor = vec4(col, 1.0);
}
```

---

## 🚀 WGSL Example

```wgsl
@compute @workgroup_size(8, 8, 1)
fn graphics_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= u32(SCREEN_WIDTH) || gid.y >= u32(SCREEN_HEIGHT)) {
        return;
    }
    
    let uv = vec2f(gid.xy) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    
    // Mouse is automatically available!
    let mouse = vec2f(uniforms.mouseX, uniforms.mouseY);
    let dist = distance(uv, mouse);
    
    // Use your custom uniform
    let wobble = uniforms.custom0;
    
    let color = vec3f(uv * wobble, sin(uniforms.time));
    textureStore(screenTexture, gid.xy, vec4f(color, 1.0));
}
```

---

## 📊 Buffer Layout (Internal)

For reference, the uniform buffer structure:

```
Index  | Type  | Name              | Access
-------|-------|-------------------|--------
0      | f32   | time              | Auto
1      | f32   | audioCurrentTime  | Auto
2      | f32   | audioPlayTime     | Auto
3      | f32   | audioFractTime    | Auto
4      | i32   | audioFrame        | Auto
5      | f32   | mouseX            | Auto
6      | f32   | mouseY            | Auto
7-21   | f32   | custom0-custom14  | User (JS)
```

---

## 🔑 Key Points

1. **Mouse works automatically** in both GLSL and WGSL
2. **No smoothing** - raw mouse position is provided
3. **Custom uniforms start at slot 0** (not index 7) via new API
4. **15 custom slots** available for your data
5. **Consistent behavior** across both backends
6. **Audio uniforms** (audioCurrentTime, etc.) are NOT exposed to GLSL fragment shaders

---

## 🎯 Migration from Old System

**Old way (confusing):**
```javascript
// Had to manually pass mouse
api.uniforms.setFloat(5, api.mouse.x);  // Index 5
api.uniforms.setFloat(6, api.mouse.y);  // Index 6
api.uniforms.setFloat(7, frequency);     // Index 7
```

**New way (clear):**
```javascript
// Mouse is automatic!
// Use clean slot-based API for custom data
api.uniforms.setCustomFloat(0, frequency);  // Slot 0 → index 7
```

---

## ✨ Summary

- **Built-ins**: Automatic (time, mouse, resolution, frame)
- **Custom**: 15 slots (0-14) via `setCustomFloat(slot, value)`
- **Same names**: Where possible (u_time, u_mouse, etc.)
- **Clean API**: No confusing buffer indices for users

