# Multi-Pass Rendering & Channel System Architecture

## Overview
This document outlines the implementation of multi-pass rendering with media channels (images, videos, buffers) for SLEditor.

## Goals
1. Support image/video input channels as shader textures
2. Support multiple shader buffer passes that can read each other
3. Maintain frame-to-frame feedback (ping-pong textures)
4. Allow viewing any channel output
5. Preserve Shadertoy-like workflow but with fixed channels

---

## System Architecture

### **Execution Order**
Passes execute left-to-right based on tab order:
```
Media Channels → Buffer Passes → Main Pass
Image(ch1) → Video(ch2) → Buffer(ch3) → S-Toy(ch0)
```

- **Main pass is always last** (rightmost tab, channel 0)
- **First buffer added goes first** (leftmost buffer tab)
- **Media channels precede all shader passes**

### **Channel System**

**Channel Types:**
- `Image(chN)` - Static image texture
- `Video(chN)` - Video playback texture
- `Buffer(chN)` - Shader render target
- `Main(ch0)` - Always the main/default pass

**Channel Limits:**
- **Total channels**: Unlimited (channels numbered sequentially)
- **Per-shader inputs**: 4 channels max (Shadertoy compatibility)
- **Buffer passes**: 5 max (including main as ch0)

**Channel Assignment:**
- Channels numbered by creation order: ch0, ch1, ch2, etc.
- Main is always ch0
- Channel numbers are fixed (not reused if deleted)

### **Texture Ping-Pong**

Each buffer channel maintains two textures:
```
Frame N:   Read from texture[0] → Write to texture[1]
Frame N+1: Read from texture[1] → Write to texture[0]
```

**Feedback Rules:**
- Buffer reading itself: Gets previous frame output (1 frame delay)
- Buffer A reading Buffer B (A runs after B): Gets current frame (same frame)
- Buffer A reading Buffer B (A runs before B): Gets previous frame (1 frame delay)
- First frame: Feedback textures are blank (black)

---

## Module Structure

### **New Modules**

#### `js/channels.js`
**Purpose**: Channel/buffer management and coordination

**Responsibilities:**
- Create/destroy channels
- Track channel metadata (type, number, resolution, name)
- Manage texture resources
- Coordinate execution order
- Parse shader code for channel usage

**Key Functions:**
```javascript
export function createChannel(type, data)
export function deleteChannel(channelNumber)
export function getExecutionOrder()
export function getChannelConfig()
export function loadChannelConfig(config)
export function parseChannelUsage(glslCode) // Returns [0, 2, 3] if uses iChannel0, iChannel2, iChannel3
export function getChannelTexture(channelNumber, ping) // ping=true for read, false for write
```

**State:**
```javascript
{
  channels: [
    { 
      number: 0, 
      type: 'buffer', 
      name: 'S-Toy(ch0)', 
      tabName: 'glsl_stoy',
      resolution: { width: 512, height: 512 },
      textures: [texture0, texture1], // ping-pong pair
      framebuffer: WebGLFramebuffer,
      currentPing: 0 // which texture to read from
    },
    { 
      number: 1, 
      type: 'image', 
      name: 'Image(ch1)', 
      tabName: 'image_ch1',
      resolution: { width: 1920, height: 1080 },
      texture: WebGLTexture, // single texture, no ping-pong
      mediaPath: 'media/texture01.jpg'
    },
    { 
      number: 2, 
      type: 'video', 
      name: 'Video(ch2)', 
      tabName: 'video_ch2',
      resolution: { width: 1280, height: 720 },
      texture: WebGLTexture,
      videoElement: HTMLVideoElement,
      mediaPath: 'media/video01.mp4'
    }
  ],
  selectedOutputChannel: 0 // Which channel to display in main canvas
}
```

#### `js/media-loader.js`
**Purpose**: Load and manage image/video assets

**Responsibilities:**
- Load built-in media catalog
- Load image as WebGL texture
- Create video element and texture
- Update video texture each frame
- Handle media resolution detection

**Key Functions:**
```javascript
export async function loadMediaCatalog() // Load media/catalog.json
export async function loadImageTexture(gl, imagePath)
export async function createVideoTexture(gl, videoPath)
export function updateVideoTexture(gl, texture, videoElement)
export function getMediaInfo(mediaPath) // Returns { name, path, thumb, width, height }
```

**Media Catalog Structure** (`media/catalog.json`):
```json
{
  "images": [
    {
      "id": "texture01",
      "name": "Abstract Noise",
      "path": "media/texture01.jpg",
      "thumb": "media/thumbs/texture01_thumb.jpg",
      "width": 1920,
      "height": 1080
    }
  ],
  "videos": [
    {
      "id": "video01",
      "name": "Clouds",
      "path": "media/video01.mp4",
      "thumb": "media/thumbs/video01_thumb.jpg",
      "width": 1280,
      "height": 720,
      "duration": 30.5
    }
  ]
}
```

#### `js/ui/media-selector.js`
**Purpose**: UI for selecting media in media tabs

**Responsibilities:**
- Display media thumbnails grid
- Handle media selection
- Update channel when media selected

**Key Functions:**
```javascript
export function createMediaSelector(tabName, channelType)
export function renderMediaGrid(catalog, type)
export function handleMediaSelect(mediaId, channelNumber)
```

### **Modified Modules**

#### `js/tab-config.js`
**Add new tab types:**
```javascript
{
  name: 'image_ch1',
  label: 'Image(ch1)',
  icon: '🖼️',
  dbKey: 'image_ch1',
  language: 'json', // Store media selection as JSON
  isChannel: true,
  channelType: 'image',
  channelNumber: 1
},
{
  name: 'video_ch2',
  label: 'Video(ch2)',
  icon: '🎥',
  dbKey: 'video_ch2',
  language: 'json',
  isChannel: true,
  channelType: 'video',
  channelNumber: 2
},
{
  name: 'buffer_ch3',
  label: 'Buffer(ch3)',
  icon: '🎚️',
  dbKey: 'glsl_stoy', // Inherits main shader mode
  language: 'glsl',
  isChannel: true,
  channelType: 'buffer',
  channelNumber: 3
}
```

#### `js/tabs.js`
**Modifications:**
- When rendering media tabs, show media selector UI instead of Monaco editor
- When adding buffer pass, clone main shader code
- Handle tab removal (cleanup channel resources)
- Sort tabs by execution order for display

#### `js/backends/webgl.js`
**Major refactor needed:**

**Extract into smaller functions:**
```javascript
// Framebuffer management
function createFramebuffer(gl, width, height)
function bindFramebuffer(gl, framebuffer)
function unbindFramebuffer(gl)

// Texture management
function createTexture(gl, width, height, format = gl.RGBA32F)
function createPingPongPair(gl, width, height)
function bindTextureToChannel(gl, texture, channelNumber)

// Multi-pass rendering
function renderPass(gl, program, inputChannels, outputFramebuffer)
```

**New state structure:**
```javascript
state.webgl = {
  gl: WebGLRenderingContext,
  currentProgram: WebGLProgram,
  programs: Map<tabName, WebGLProgram>, // One program per shader pass
  quad: { buffer, positions },
  channels: [] // Managed by channels.js
}
```

#### `js/compiler.js`
**Modifications:**
- Compile multiple shader programs (one per buffer pass)
- Inject channel uniforms into boilerplate based on usage
- Store program for each pass
- Handle compilation errors per pass

**Key Changes:**
```javascript
async function compileShaderPass(tabName, code) {
  const channels = parseChannelUsage(code); // [0, 1, 3]
  const boilerplate = getBoilerplateWithChannels(channels);
  const fullCode = boilerplate + code;
  // ... compile ...
}

function getBoilerplateWithChannels(channelNumbers) {
  let uniforms = '';
  channelNumbers.forEach(ch => {
    uniforms += `uniform sampler2D iChannel${ch};\n`;
  });
  return baseBoilerplate + uniforms;
}
```

#### `js/render.js`
**Major changes for multi-pass:**

```javascript
function renderFrame() {
  const executionOrder = channels.getExecutionOrder();
  
  executionOrder.forEach(pass => {
    if (pass.type === 'video') {
      // Update video texture
      mediaLoader.updateVideoTexture(gl, pass.texture, pass.videoElement);
    } else if (pass.type === 'buffer') {
      // Bind input textures
      const requiredChannels = parseChannelUsage(pass.code);
      requiredChannels.forEach(chNum => {
        const channel = channels.getChannel(chNum);
        const readTexture = channel.textures[channel.currentPing];
        bindTextureToChannel(gl, readTexture, chNum);
      });
      
      // Bind output framebuffer (write to opposite ping texture)
      const writeTexture = pass.textures[1 - pass.currentPing];
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);
      
      // Render this pass
      webgl.renderPass(gl, pass.program);
      
      // Swap ping-pong
      pass.currentPing = 1 - pass.currentPing;
    }
  });
  
  // Display selected channel to screen
  displayChannelToScreen(state.selectedOutputChannel);
}
```

#### `js/glsl-boilerplate.js`
**Modifications:**
- Channel uniforms are dynamically injected (not in static boilerplate)
- Base boilerplate remains the same

#### `js/ui.js`
**Additions:**
- Channel output selector dropdown
- Update to show which channel is being displayed

---

## Data Persistence

### **Database Schema**
No new columns needed! Use existing structure:

**`code_types` array:**
```javascript
['glsl_stoy', 'image_ch1', 'video_ch2', 'buffer_ch3']
```

**`code` object:**
```javascript
{
  'glsl_stoy': '...shader code...',      // Main pass (ch0)
  'image_ch1': '{"mediaId": "texture01"}', // JSON for media selection
  'video_ch2': '{"mediaId": "video01"}',
  'buffer_ch3': '...shader code...'       // Buffer pass
}
```

### **Channel Metadata**
Store in `code` object with special key:
```javascript
{
  'glsl_stoy': '...shader code...',
  'image_ch1': '{"mediaId": "texture01"}',
  '_channel_meta': JSON.stringify({
    selectedOutputChannel: 0,
    channelNumbers: { 'glsl_stoy': 0, 'image_ch1': 1, 'video_ch2': 2, 'buffer_ch3': 3 }
  })
}
```

---

## Phase 1: Image Channels (Implementation Steps)

### **Step 1: Media Infrastructure**
1. Create `media/` folder structure
2. Create `media/catalog.json`
3. Add sample images and thumbnails
4. Implement `media-loader.js`

### **Step 2: Channel Management**
1. Create `channels.js` module
2. Implement basic channel CRUD
3. Add image channel type
4. Image texture loading

### **Step 3: Tab System Integration**
1. Add `image_chN` tab type to `tab-config.js`
2. Modify `tabs.js` to show media selector for image tabs
3. Create `media-selector.js` UI component

### **Step 4: WebGL Integration**
1. Extract texture creation to helper functions
2. Implement `bindTextureToChannel()`
3. Test single image binding to `iChannel0`

### **Step 5: Boilerplate Injection**
1. Parse shader for `iChannel` usage
2. Inject `uniform sampler2D iChannelN;` into boilerplate
3. Test with S-Toy shader using image input

### **Step 6: Persistence**
1. Save/load image channel selection
2. Test shader with image channel persists correctly

---

## Phase 1: Image Channels - IMPLEMENTATION NOTES ✅

**Status:** COMPLETE with extended features  
**Completed:** 2025-01-14

### What Was Actually Implemented

#### Core Features (As Planned)
✅ Image loading from catalog  
✅ Media selector UI  
✅ Dynamic channel tab creation  
✅ WebGL texture binding  
✅ Dynamic uniform injection  
✅ Channel persistence (save/load)

#### Extended Features (Beyond Original Plan) ⭐

**1. Comprehensive Texture Options**
- V-Flip (default ON, Shadertoy convention)
- Wrap modes: repeat (default), clamp, mirror
- Filter modes: mipmap (default), linear, nearest
- Anisotropic filtering (with browser extension detection)
- **Live updates:** No shader recompilation needed (except V-Flip)

**Implementation:**
```javascript
// In channels.js - stored per channel
{
  vflip: true,
  wrap: 'repeat',
  filter: 'mipmap',
  anisotropic: false
}

// Applied via media-loader.js
applyTextureParameters(gl, texture, options)
updateTextureOptions(channelNumber, options) // Live update API
```

**2. GitHub URL Import**
- Import images from `https://raw.githubusercontent.com/`
- User enters: `user/repo/branch/path/image.png`
- System handles: CORS, dimensions, title extraction
- Persists as: `mediaId: 'guc:user/repo/path.jpg'`
- Re-registration on load from saved data

**Implementation:**
```javascript
// External media storage (in-memory)
const externalMedia = new Map();

// Registration
registerExternalMedia(mediaInfo)

// Lookup (checks external first, then catalog)
getMediaInfo(mediaId)

// Re-registration on load
loadChannelConfig() // Detects 'guc:' prefix and re-registers
```

**3. Enhanced Media Selector UI**
- Horizontal layout: Large preview (150×150px) on left
- Info/options stack on right: Title, resolution, texture controls
- GitHub URL import section below preview
- Scrollable thumbnail grid shows catalog + external media
- Selected image highlighted with border

**4. Additional APIs**
```javascript
// channels.js
updateChannelMedia(channelNumber, mediaId) // Change without recreate
updateTextureOptions(channelNumber, options) // Live parameter update
resetChannels() // Clear for new shaders

// media-loader.js
registerExternalMedia(mediaInfo) // Store URL imports
applyTextureParameters(gl, texture, options) // Apply wrap/filter/aniso
createFallbackTexture(gl) // Checkerboard texture
```

### Actual Channel State Structure

```javascript
{
  channels: [{
    number: 1,
    type: 'image',
    name: 'Image(ch1)',
    tabName: 'image_ch1',
    texture: WebGLTexture,
    mediaId: 'noise1' or 'guc:user/repo/path.jpg',
    mediaPath: 'media/noise1.jpg',
    resolution: { width: 512, height: 512 },
    // Extended fields (not in original spec)
    vflip: true,
    wrap: 'repeat',
    filter: 'mipmap',
    anisotropic: false
  }],
  nextChannelNumber: 2,
  selectedOutputChannel: 0
}
```

### Persistence Format

**Channel config in `code._channel_meta`:**
```javascript
{
  selectedOutputChannel: 0,
  nextChannelNumber: 2,
  channels: [{
    number: 1,
    type: 'image',
    tabName: 'image_ch1',
    mediaId: 'noise1' or 'guc:user/repo/path.jpg',
    // Texture options (NEW)
    vflip: true,
    wrap: 'repeat',
    filter: 'mipmap',
    anisotropic: false
  }]
}
```

**Active tabs in `code_types`:**
```javascript
['glsl_stoy', 'image_ch1', 'image_ch2']
```

### Key Implementation Files

**New Modules:**
- `js/channels.js` (470+ lines) - Full channel management
- `js/media-loader.js` (300+ lines) - Texture loading with options
- `js/ui/media-selector.js` (505+ lines) - Complete UI with URL import

**Modified Modules:**
- `js/index.js` - Initialize media system, set canvas visibility
- `js/compiler.js` - Dynamic uniform injection based on usage
- `js/backends/webgl.js` - Channel texture binding in render loop
- `js/shader-management.js` - Save channel config, reset on new shader
- `js/save.js` - Load channel config, re-register external media
- `js/tab-config.js` - Dynamic channel tab types
- `js/tabs.js` - Media selector rendering, add image channel UI
- `js/routing.js` - Reset channels on navigation
- `js/ui.js` - Canvas scaling fix (lines 552-557)
- `css/app.css` - Status bar positioning, canvas styling
- `index.html` - Canvas element structure

### Important Code Locations

**Channel Creation:**
- `js/channels.js` lines 40-121 - `createChannel()` implementation

**Texture Options:**
- `js/media-loader.js` lines 67-125 - `applyTextureParameters()`
- `js/media-loader.js` lines 138-139 - CORS fix (`crossOrigin`)
- `js/channels.js` lines 213-241 - `updateTextureOptions()`

**URL Import:**
- `js/ui/media-selector.js` lines 201-294 - URL import UI
- `js/ui/media-selector.js` lines 451-505 - `handleUrlImport()`
- `js/media-loader.js` lines 30-33 - `registerExternalMedia()`
- `js/channels.js` lines 391-414 - Re-registration on load

**Channel Binding:**
- `js/backends/webgl.js` lines 212-277 - Texture binding per frame
- `js/compiler.js` lines 68-90 - Dynamic uniform injection

### Testing & Validation

**All features tested and working:**
- ✅ Image loading from catalog
- ✅ GitHub URL import with CORS
- ✅ Texture options (all modes)
- ✅ Live parameter updates
- ✅ Multiple channels
- ✅ Save/load persistence
- ✅ External media re-registration
- ✅ Canvas scaling (pixel-perfect)
- ✅ Status bar positioning

**Known working configurations:**
- Multiple image channels (tested up to 4 simultaneously)
- Mix of catalog and URL-imported images
- All texture option combinations
- Save → reload → load cycle

### Notes for Phase 2/3 Implementation

**What's Ready:**
1. Channel infrastructure fully supports buffer/video types
2. Texture binding system handles any texture type
3. Persistence system extensible (just add fields to channel config)
4. UI system can render any channel type tab
5. Main buffer already channel 0 (ready for self-feedback)

**What Phase 2 Needs:**
1. Framebuffer creation/management
2. Ping-pong texture pairs (dual textures per buffer)
3. Multi-program compilation (one WebGL program per pass)
4. Execution order logic (already scaffolded in `getExecutionOrder()`)
5. Buffer→buffer texture binding
6. `currentPing` toggle logic

**What Phase 3 Needs:**
1. Video element creation (similar to `Image` element)
2. `updateVideoTexture()` per frame (1 line: `gl.texImage2D(... video)`)
3. Playback sync with `state.isPlaying`
4. Video metadata extraction (dimensions, duration)
5. Reuse ALL existing infrastructure (catalog, selector UI, persistence)

**Complexity Assessment:**
- Phase 1: 8/10 (DONE)
- Phase 2: 7/10 (Most complex - multipass rendering)
- Phase 3: 4/10 (Simpler - builds on Phase 1 directly)

---

## Phase 2: Buffer Channels (High-Level)

### **Key Tasks:**
1. Implement framebuffer creation
2. Create ping-pong texture pairs
3. Multi-program compilation
4. Execution order logic
5. Buffer→buffer texture binding
6. Self-feedback support

---

## Phase 3: Video Channels (High-Level)

### **Key Tasks:**
1. Video element creation
2. Texture updates per frame
3. Playback control (when viewing channel)
4. Video metadata loading

---

## Phase 4: Channel Output Selector

### **Key Tasks:**
1. Dropdown UI in controls area
2. Display channel to main canvas
3. Video playback when viewing video channel

---

## Technical Details

### **Texture Format**
- **RGBA32F** (float textures)
- Enables HDR, signed values, precision
- Requires `OES_texture_float` extension

### **Texture Parameters**
```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
```

### **Resolution Handling**
- **Buffer textures**: Match canvas resolution (`state.canvasWidth` × `state.canvasHeight`)
- **Image textures**: Native image resolution
- **Video textures**: Native video resolution
- **Display**: Scale to fit canvas when viewing channel

### **GLSL Uniform Names**
Match Shadertoy convention:
```glsl
uniform sampler2D iChannel0; // Main buffer (self-feedback)
uniform sampler2D iChannel1; // Image or other buffer
uniform sampler2D iChannel2; // Video or other buffer
uniform sampler2D iChannel3; // Buffer
```

### **Coordinate System**
- WebGL: Origin bottom-left
- Textures: Origin bottom-left (matches WebGL)
- Images: Flipped on load if needed

---

## Error Handling

### **Missing Resources**
- Image fails to load → Use fallback checkerboard texture
- Video fails to load → Use fallback texture
- Framebuffer creation fails → Disable that buffer pass

### **Compilation Errors**
- Per-pass error display
- Main pass error shows in main error display
- Buffer pass error shows in status with pass name

### **WebGL Limits**
- Check `gl.getParameter(gl.MAX_TEXTURE_SIZE)`
- Check `gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)` (typically 16)
- Warn user if limits exceeded

---

## Testing Strategy

### **Phase 1 Tests:**
1. Load image, verify texture created
2. Bind image to iChannel0, render shader using it
3. Save shader with image channel, reload, verify persists
4. Add multiple image channels (ch1, ch2, ch3)
5. Delete image channel, verify cleanup

### **Phase 2 Tests:**
1. Two buffer passes reading each other
2. Self-feedback (buffer reads its own output)
3. First frame (should be black for feedback)
4. Forward vs backward dependencies (frame timing)
5. Canvas resize (verify framebuffers resize)

### **Phase 3 Tests:**
1. Video loads and plays
2. Video texture updates each frame
3. Video pauses when not viewing channel
4. Video metadata (resolution, duration)

---

## Performance Considerations

### **Optimizations:**
- Lazy compilation: Only compile programs for active tabs
- Texture pooling: Reuse textures when channels deleted
- Conditional rendering: Skip passes not needed by output channel
- Video pause: Stop updating video texture when not in use

### **Memory:**
- Float textures are 4× larger than byte textures
- Each buffer: 2 textures (ping-pong) at canvas resolution
- Monitor memory usage, warn if excessive

---

## Future Enhancements (Post-MVP)

1. **User media upload**: Store in Supabase storage
2. **Media library**: Browse/search built-in media
3. **Tab drag-and-drop**: Reorder execution
4. **Audio channels**: FFT/waveform data as textures
5. **Cube maps**: 3D texture support
6. **Custom resolutions**: Per-channel resolution override
7. **Mipmap support**: For better texture filtering
8. **3D textures**: Volume data support

---

## API Summary

### **channels.js**
```javascript
createChannel(type, data) → channelNumber
deleteChannel(channelNumber)
getChannel(channelNumber) → channel
getChannels() → array
getExecutionOrder() → array (sorted by execution)
getChannelConfig() → object (for persistence)
loadChannelConfig(config)
parseChannelUsage(glslCode) → array of channel numbers
```

### **media-loader.js**
```javascript
loadMediaCatalog() → Promise<catalog>
loadImageTexture(gl, imagePath) → Promise<texture>
createVideoTexture(gl, videoPath) → Promise<{texture, videoElement}>
updateVideoTexture(gl, texture, videoElement)
getMediaInfo(mediaId) → object
```

### **tab-config.js** (additions)
```javascript
createImageChannelTab(channelNumber) → tabConfig
createVideoChannelTab(channelNumber) → tabConfig
createBufferChannelTab(channelNumber) → tabConfig
```

---

*Document Version: 1.0*
*Last Updated: 2025-01-13*

