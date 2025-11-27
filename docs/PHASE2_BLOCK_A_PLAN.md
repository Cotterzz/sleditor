# Phase 2 - Block A: Main Buffer Self-Feedback

## Goal
Make the main shader pass (ch0) able to read its own previous frame output via `iChannel0`.

## Why This is the Simplest Starting Point
- No additional buffer passes to manage
- No execution order complexity
- Focuses on the core ping-pong mechanism
- Validates the framebuffer → texture → binding pipeline

---

## Current Architecture

**Right now:**
```
renderFrame() {
  gl.bindFramebuffer(null);  // Render to canvas (default framebuffer)
  gl.drawArrays();           // Draw fullscreen quad
}
```

The shader renders directly to the canvas. Nothing is saved as a texture.

---

## What We Need to Add

### 1. **Ping-Pong Textures for ch0**
Two textures that we alternate between:
- **Frame N**: Read from `texture[0]` (as iChannel0) → Write to `texture[1]`
- **Frame N+1**: Read from `texture[1]` (as iChannel0) → Write to `texture[0]`

**Why two textures?**
WebGL cannot read from and write to the same texture simultaneously. We must:
- Bind one texture as INPUT (iChannel0 sampler)
- Render to the OTHER texture as OUTPUT (framebuffer attachment)
- Swap them each frame

### 2. **Framebuffer for Offscreen Rendering**
A WebGL framebuffer that lets us render to a texture instead of the canvas.

```javascript
const framebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
gl.drawArrays(); // Now renders to texture, not canvas
```

### 3. **Final Blit to Canvas**
After rendering to the texture, we need to copy it to the canvas so the user can see it.

**Option A: Simple copy (what we'll do)**
```javascript
// After rendering to texture:
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); // null = canvas
gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
```

---

## Implementation Steps

### Step 1: Create Ping-Pong Textures (in channels.js)

Modify `channels.js` `init()` to create textures for ch0:

```javascript
export function init() {
    const gl = state.glContext;
    if (!gl) {
        console.warn('Cannot init channels - WebGL not ready yet');
        return;
    }
    
    // Create two textures for main buffer (ping-pong)
    const width = state.canvasWidth;
    const height = state.canvasHeight;
    
    const texture0 = createTexture(gl, width, height);
    const texture1 = createTexture(gl, width, height);
    
    channelState.channels.push({
        number: 0,
        type: 'buffer',
        name: 'Main(ch0)',
        tabName: null,
        resolution: { width, height },
        textures: [texture0, texture1], // Ping-pong pair
        framebuffer: null, // Created in webgl.js
        currentPing: 0 // Which texture to READ from
    });
}

function createTexture(gl, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // RGBA float texture (for HDR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    
    // Texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    return texture;
}
```

### Step 2: Create Framebuffer (in webgl.js)

Add a function to create framebuffer:

```javascript
function createFramebuffer(gl) {
    const fb = gl.createFramebuffer();
    return fb;
}

// Call during init or first render
export function initBufferResources() {
    const gl = state.glContext;
    if (!gl) return;
    
    // Create framebuffer for main buffer
    state.glFramebuffer = createFramebuffer(gl);
}
```

### Step 3: Modify renderFrame() for Offscreen Rendering

Current flow:
```javascript
gl.bindFramebuffer(null);  // Render to canvas
gl.clear();
gl.drawArrays();
```

New flow:
```javascript
// Get ch0 channel
const ch0 = channels.getChannel(0);
if (!ch0 || !ch0.textures) {
    // Fallback: render direct to canvas (no self-feedback)
    renderDirectToCanvas(uniformBuilder);
    return;
}

// Determine which texture to read from and write to
const readTexture = ch0.textures[ch0.currentPing];
const writeTexture = ch0.textures[1 - ch0.currentPing];

// Bind output framebuffer
gl.bindFramebuffer(gl.FRAMEBUFFER, state.glFramebuffer);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);

// Check framebuffer is complete
if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('Framebuffer incomplete!');
    return;
}

// Bind input texture (previous frame as iChannel0)
// NOTE: Only bind if shader actually uses iChannel0!
const code = state.graphicsEditor?.getValue() || '';
const requiredChannels = channels.parseChannelUsage(code);

if (requiredChannels.includes(0)) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);
    const loc = gl.getUniformLocation(state.glProgram, 'iChannel0');
    if (loc !== null) {
        gl.uniform1i(loc, 0);
    }
}

// Bind other channels (images, etc) - channels 1, 2, 3...
requiredChannels.forEach(chNum => {
    if (chNum === 0) return; // Already handled above
    const channel = channels.getChannel(chNum);
    if (channel && channel.texture) {
        gl.activeTexture(gl.TEXTURE0 + chNum);
        gl.bindTexture(gl.TEXTURE_2D, channel.texture);
        const loc = gl.getUniformLocation(state.glProgram, `iChannel${chNum}`);
        if (loc !== null) {
            gl.uniform1i(loc, chNum);
        }
    }
});

// Clear and render
gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
gl.clearColor(0, 0, 0, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

// Apply uniforms
uniformBuilder.applyWebGL(gl, state.glUniforms);

// Draw
gl.bindBuffer(gl.ARRAY_BUFFER, state.glQuadBuffer);
const a_position = gl.getAttribLocation(state.glProgram, 'a_position');
if (a_position >= 0) {
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);
}
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
if (a_position >= 0) {
    gl.disableVertexAttribArray(a_position);
}

// Blit to canvas (so user can see it)
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.glFramebuffer);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); // null = canvas
gl.blitFramebuffer(
    0, 0, gl.canvas.width, gl.canvas.height,  // src rect
    0, 0, gl.canvas.width, gl.canvas.height,  // dst rect
    gl.COLOR_BUFFER_BIT,
    gl.NEAREST
);

// Swap ping-pong for next frame
ch0.currentPing = 1 - ch0.currentPing;
```

### Step 4: Handle Canvas Resize

When canvas resizes, we need to recreate the textures:

```javascript
// In channels.js
export function resizeMainBuffer(width, height) {
    const ch0 = channelState.channels.find(ch => ch.number === 0);
    if (!ch0 || !ch0.textures) return;
    
    const gl = state.glContext;
    if (!gl) return;
    
    // Delete old textures
    gl.deleteTexture(ch0.textures[0]);
    gl.deleteTexture(ch0.textures[1]);
    
    // Create new ones
    ch0.textures[0] = createTexture(gl, width, height);
    ch0.textures[1] = createTexture(gl, width, height);
    ch0.resolution = { width, height };
    ch0.currentPing = 0; // Reset
    
    console.log(`✓ Main buffer resized to ${width}×${height}`);
}
```

Call from `ui.js` when canvas resizes.

---

## Testing Checklist

### Test 1: Simple Self-Feedback
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    // Read previous frame
    vec4 prev = texture(iChannel0, uv);
    
    // Fade out
    prev *= 0.98;
    
    // Draw a moving dot
    vec2 center = vec2(0.5 + 0.3 * sin(iTime), 0.5 + 0.3 * cos(iTime));
    float dist = length(uv - center);
    vec4 dot = vec4(1.0) * smoothstep(0.02, 0.0, dist);
    
    fragColor = prev + dot;
}
```

**Expected**: Dot leaves a fading trail.

### Test 2: First Frame is Black
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 prev = texture(iChannel0, uv);
    fragColor = prev + vec4(0.01); // Slowly brighten
}
```

**Expected**: Starts black, slowly brightens each frame.

### Test 3: Works with Image Channels
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 prev = texture(iChannel0, uv);
    vec4 img = texture(iChannel1, uv); // Image channel
    fragColor = mix(prev * 0.99, img, 0.05);
}
```

**Expected**: Image slowly fades in and persists via feedback.

### Test 4: Restart Clears Feedback
Press restart button.

**Expected**: Feedback texture resets to black.

### Test 5: Canvas Resize
Resize the window.

**Expected**: Feedback continues working at new resolution, starts fresh.

---

## What This Enables

After this block is complete:
- ✅ Main shader can do feedback effects (trails, persistence, cellular automata)
- ✅ Framebuffer/texture architecture is proven
- ✅ Ping-pong mechanism is working
- ✅ Ready for Block B: Additional buffer passes

---

## What This Does NOT Do Yet

- ❌ No additional buffer passes (Buffer B, Buffer C, etc.)
- ❌ No buffer→buffer reading (other than main self-feedback)
- ❌ No execution order management
- ❌ No UI for adding buffer passes

Those come in Blocks 2B, 2C, 2D.

---

## Files to Modify

1. **`js/channels.js`**
   - Add `createTexture()` helper
   - Modify `init()` to create ping-pong textures for ch0
   - Add `resizeMainBuffer()` function

2. **`js/backends/webgl.js`**
   - Add `initBufferResources()` to create framebuffer
   - Modify `renderFrame()` for offscreen rendering + blit
   - Add fallback path if ch0 doesn't have textures

3. **`js/index.js`**
   - Call `webgl.initBufferResources()` after WebGL init

4. **`js/ui.js`** (or wherever canvas resize is handled)
   - Call `channels.resizeMainBuffer()` when canvas resizes

5. **`js/ui.js`** (restart button)
   - Clear ch0 textures on restart

---

## Estimated Complexity

**Complexity**: 5/10
- Similar to image pass in terms of texture management
- Framebuffer API is straightforward
- Main risk: getting the blit right and avoiding WebGL errors

**Lines of Code**: ~150 lines total across files

**Time Estimate**: 1-2 hours with testing

---

## Next Steps After Block A

**Block 2B**: Add a SINGLE additional buffer pass (Buffer ch1)
- Hardcoded, runs before main
- Main can read from it
- Proves multi-pass execution

**Block 2C**: Dynamic buffer creation UI
- "Add Buffer Pass" button
- Creates ch2, ch3, etc.
- Still linear execution order

**Block 2D**: Dependency detection and execution ordering
- Parse which channels each buffer uses
- Sort execution order
- Handle errors gracefully

---

*Ready to implement!*

