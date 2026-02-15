# Shader Data Schema: V1 → V2

This document defines the shader data format for persistence (Supabase DB).

---

## V2 Schema Overview

V2 uses the existing DB schema - no fields removed, new fields added.
Legacy shaders (V1) have `shader_type: null` and should be translated on load.

---

## V2 Field Reference

### Identity & Metadata (unchanged)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `slug` | string | URL-friendly identifier |
| `user_id` | UUID | Owner |
| `title` | string | Shader title |
| `description` | string | Markdown supported |
| `creator_name` | string | Denormalized for display |

### Tags & Categories

| Field | Type | Notes |
|-------|------|-------|
| `tags` | string[] | User-defined tags (now actually used) |
| `categories` | string[] | **NEW** - Admin tags: `featured`, `example`, `tutorial`, etc. |

### Shader Type (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `shader_type` | string | **NEW** - `webgl`, `webgpu-compute`, `webgpu-frag`, or `null` (legacy) |
| `code_types` | string[] | **REPURPOSED** - Languages used: `glsl`, `wgsl`, `js` |

**Important:** V1 should ignore any shader where `shader_type` is not null.

### Code (cleaned up)

| Field | Type | Notes |
|-------|------|-------|
| `code` | object | **SIMPLIFIED** - Code only, no settings/channel meta |

```javascript
// V2 code structure
"code": {
    "Image": "void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }",
    "BufferA": "void mainImage(...) { ... }",
    "BufferB": "void mainImage(...) { ... }",
    "Common": "// Shared functions",
    "Audio": "vec2 mainSound(float time) { ... }"
}
```

### Media (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `media` | object[] | **NEW** - All media elements |

```javascript
// V2 media structure
"media": [
    // Catalog media - use ID (allows URL updates)
    {
        "name": "noise1",           // Unique identifier
        "type": "texture",          // texture, audio, video, cubemap, volume
        "catalogId": "noise2",      // Reference to catalog item
        "settings": {
            "vflip": true,
            "wrap": "repeat",
            "filter": "linear"
        }
    },
    // Custom media - use prefixed path (security)
    {
        "name": "custom_tex",
        "type": "texture",
        "customUrl": "polyhaven:Textures/jpg/1k/ganges_river_pebbles/ganges_river_pebbles_rough_1k.jpg",
        "settings": {
            "vflip": false,
            "wrap": "clamp",
            "filter": "nearest"
        }
    },
    // Cubemap (multiple files via catalog)
    {
        "name": "sky_cube",
        "type": "cubemap",
        "catalogId": "forest_cubemap"
    }
]
```

**Custom URL prefixes:**
- `polyhaven:` → Polyhaven CDN base
- `github:` → GitHub raw content base
- Prevents arbitrary URL injection

### Inputs (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `inputs` | object[] | **NEW** - Input devices used |

```javascript
// V2 inputs structure
"inputs": [
    { "type": "keyboard", "mode": "texture" },    // Shadertoy-style texture
    { "type": "keyboard", "mode": "uniform" },    // Uniform-only (no channel)
    { "type": "webcam" },
    { "type": "microphone" },
    { "type": "gamepad" },
    { "type": "midi" }
]
```

### Channels (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `channels` | object[] | **NEW** - Channel assignments |

```javascript
// V2 channels structure - maps names to channel numbers
"channels": [
    { "name": "Image", "channel": 0 },       // Main always ch0
    { "name": "BufferA", "channel": 1 },
    { "name": "noise1", "channel": 2 },      // Media by name
    { "name": "custom_tex", "channel": 3 },
    { "name": "keyboard", "channel": 4 }     // Inputs by type
]
```

**Note:** `nextChannelNumber` not stored - calculated from max channel + 1 on load.

### Channel Matrix (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `channel_matrix` | object | **NEW** - Per-receiver filter settings |

```javascript
// V2 channel matrix structure
"channel_matrix": {
    "Image:2": { "filter": "nearest", "wrap": "clamp" },  // Image reading ch2
    "BufferA:3": { "filter": "linear", "wrap": "repeat" } // BufferA reading ch3
}
```

### Render Settings (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `settings` | object | **NEW** - Render/display settings |

```javascript
// V2 settings structure
"settings": {
    "linearColorspace": false,
    "transparency": false,
    "pixelRatio": 1.0,
    "hdr": false,
    "maxFps": 60
}
```

### Uniforms

| Field | Type | Notes |
|-------|------|-------|
| `uniform_config` | object | Slider ranges, UI settings |

```javascript
// V2 uniform config (cleaned up from V1)
"uniform_config": {
    "uSpeed": { "min": 0, "max": 10, "default": 1.0 },
    "uColor": { "type": "color" },
    "uEnabled": { "type": "bool", "default": true }
}
```

### Timeline & Animation (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `timeline_config` | object | **NEW** - Keyframe animation data |

```javascript
// V2 timeline structure
"timeline_config": {
    "duration": 10.0,
    "loop": true,
    "tracks": {
        "uSpeed": [
            { "time": 0, "value": 0.5, "easing": "linear" },
            { "time": 5, "value": 2.0, "easing": "ease-in-out" },
            { "time": 10, "value": 0.5 }
        ]
    }
}
```

### Plugins (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `plugins_used` | string[] | **NEW** - Plugin IDs that need loading |
| `plugin_settings` | object | **NEW** - Per-plugin configuration |

```javascript
"plugins_used": ["audio-visualizer", "color-palette"],
"plugin_settings": {
    "audio-visualizer": { "style": "bars", "smoothing": 0.8 },
    "color-palette": { "palette": "viridis" }
}
```

### Fork Tracking (NEW)

| Field | Type | Notes |
|-------|------|-------|
| `forked_from` | string | **NEW** - Origin of forked shader |

```javascript
// Internal fork (slug only, not user-editable)
"forked_from": "slug:abc123xyz"

// External fork (full URL, user-provided)
"forked_from": "https://www.shadertoy.com/view/XsXXXX"
```

### Social & Visibility (unchanged)

| Field | Type | Notes |
|-------|------|-------|
| `visibility` | string | `draft`, `unlisted`, `published` |
| `thumbnail_url` | string | Generated preview image |
| `view_count` | int | View counter |
| `like_count` | int | Like counter |
| `comment_count` | int | Comment counter |
| `license` | string | `default`, `cc-by`, `cc0`, or custom text |

### Timestamps (unchanged)

| Field | Type | Notes |
|-------|------|-------|
| `created_at` | timestamp | When created |
| `updated_at` | timestamp | Last modified |
| `published_at` | timestamp | When made public (for ordering) |

---

## Complete V2 Example

```javascript
{
    // Identity
    "id": "62cc3897-f95f-414a-9a10-8b54ffb30ccb",
    "slug": "6h2sm022x",
    "user_id": "865e74cb-dd3b-4713-bc48-2a8607a479e9",
    "title": "Genuary #12",
    "description": "Boxes Only.",
    "creator_name": "Cotterzz",
    
    // Tags & Type
    "tags": ["genuary", "boxes", "raymarching"],
    "categories": ["featured"],
    "shader_type": "webgl",
    "code_types": ["glsl"],
    
    // Code (clean, no embedded meta)
    "code": {
        "Image": "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    // Main shader code\n}",
        "BufferA": "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    // Buffer code\n}"
    },
    
    // Media
    "media": [
        { "name": "city", "type": "texture", "catalogId": "city1", "settings": { "vflip": true, "wrap": "repeat", "filter": "linear" } },
        { "name": "noise_a", "type": "texture", "catalogId": "noise2", "settings": { "vflip": true, "wrap": "repeat", "filter": "linear" } },
        { "name": "noise_b", "type": "texture", "catalogId": "noise3", "settings": { "vflip": true, "wrap": "repeat", "filter": "linear" } }
    ],
    
    // Inputs
    "inputs": [],
    
    // Channel assignments
    "channels": [
        { "name": "Image", "channel": 0 },
        { "name": "BufferA", "channel": 1 },
        { "name": "city", "channel": 2 },
        { "name": "noise_a", "channel": 3 },
        { "name": "noise_b", "channel": 4 }
    ],
    
    // Matrix (empty = use defaults)
    "channel_matrix": {},
    
    // Settings
    "settings": {
        "linearColorspace": false
    },
    
    // Uniforms
    "uniform_config": {
        "uCustom0": { "min": 0, "max": 1, "default": 0 }
    },
    
    // Timeline (optional)
    "timeline_config": null,
    
    // Plugins (optional)
    "plugins_used": [],
    "plugin_settings": {},
    
    // Fork tracking
    "forked_from": null,
    
    // Visibility
    "visibility": "published",
    "thumbnail_url": "https://...",
    "license": "default",
    
    // Counts
    "view_count": 10,
    "like_count": 0,
    "comment_count": 0,
    
    // Timestamps
    "created_at": "2026-01-12T07:06:18.940Z",
    "updated_at": "2026-01-27T14:37:24.895Z",
    "published_at": "2026-01-12T12:00:00.000Z"
}
```

---

## V1 → V2 Translation

When loading a V1 shader (`shader_type === null`):

1. **Extract settings** from `code._settings` → `settings`
2. **Extract channel meta** from `code._channel_meta` → `channels` + `media`
3. **Clean code object** - remove `_settings`, `_channel_meta`, keep only code
4. **Map code_types** to pass IDs:
   - `glsl_stoy` → `Image`
   - `buffer_ch1` → `BufferA`
   - `image_ch*` → media entry
5. **Set shader_type** to `webgl` (Shadertoy-compatible)
6. **Preserve channel numbers** from V1 `_channel_meta.channels`

---

## V1 Reference (Legacy Format)

```javascript
// V1 shader from DB - for translation reference
{
    "id": "62cc3897-f95f-414a-9a10-8b54ffb30ccb",
    "slug": "6h2sm022x",
    "user_id": "865e74cb-dd3b-4713-bc48-2a8607a479e9",
    "title": "Genuary #12",
    "description": "Boxes Only.",
    "tags": [],
    "code_types": [
        "glsl_stoy",
        "buffer_ch1",
        "image_ch2",
        "image_ch3",
        "image_ch4"
    ],
    "code": {
        "_settings": "{\"linearColorspace\":false}",
        "glsl_stoy": "// main shader code",
        "buffer_ch1": "// buffer code",
        "_channel_meta": "{\"selectedOutputChannel\":0,\"nextChannelNumber\":5,\"channels\":[{\"number\":0,\"type\":\"buffer\",\"tabName\":null,\"name\":\"Main(ch0)\"},{\"number\":1,\"type\":\"buffer\",\"tabName\":\"buffer_ch1\",\"name\":\"Buffer A (ch1)\"},{\"number\":2,\"type\":\"image\",\"tabName\":\"image_ch2\",\"mediaId\":\"city1\",\"vflip\":true,\"wrap\":\"repeat\",\"filter\":\"linear\"},{\"number\":3,\"type\":\"image\",\"tabName\":\"image_ch3\",\"mediaId\":\"noise2\"},{\"number\":4,\"type\":\"image\",\"tabName\":\"image_ch4\",\"mediaId\":\"noise3\"}]}"
    },
    "visibility": "published",
    "thumbnail_url": "https://...",
    "view_count": 10,
    "like_count": 0,
    "comment_count": 0,
    "created_at": "2026-01-12T07:06:18.940Z",
    "updated_at": "2026-01-27T14:37:24.895Z",
    "published_at": null,
    "creator_name": "Cotterzz",
    "uniform_config": "{\"sliders\":[{\"max\":1,\"min\":0,\"type\":\"float\",\"index\":0,\"title\":\"Custom 0\",\"value\":0}]}",
    "license": "default"
}
```

---

*Last updated: February 7, 2026*