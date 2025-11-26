# Audio Input Tab - Implementation Summary

**Date:** November 25, 2025  
**Status:** ✅ **COMPLETE** - Ready for testing

---

## Overview

Implemented full audio input tab system with Shadertoy-compatible audio analysis textures. Audio files can be loaded from catalog or GitHub URLs, analyzed in real-time, and presented as textures for use in GLSL shaders.

---

## Features Implemented

### ✅ Core Audio System (`js/audio-input.js`)
- **Multiple quality modes**: Shadertoy (512), Standard (1024), High (2048), Ultra (4096)
- **Dual-row texture format**: Row 0 = waveform (time domain), Row 1 = FFT (frequency domain)
- **Web Audio API integration**: AnalyserNode with configurable FFT sizes
- **Shadertoy compatibility**: 512×2 texture with smoothing (smoothingTimeConstant = 0.8)
- **Playback controls**: Play/pause, loop, volume control
- **Cleanup**: Proper resource disposal when channels are deleted

### ✅ Audio Selector UI (`js/ui/audio-selector.js`)
- **Visual feedback**: Real-time spectrum visualization canvas
- **Quality selector**: Dropdown to switch between FFT modes
- **Playback controls**: Play/pause button, loop checkbox, volume slider
- **GitHub import**: Load audio from raw GitHub URLs (.mp3, .wav, .ogg, .m4a)
- **Catalog browser**: Grid view of available audio files
- **Status display**: Shows currently playing audio and texture resolution

### ✅ Channel System Integration (`js/channels.js`)
- **Audio channel type**: Full support for `type: 'audio'` channels
- **Save/load support**: Audio channels persist with shader data
- **Mode preservation**: Audio quality mode saved and restored
- **External audio**: GitHub-loaded audio re-registered on load
- **Per-frame updates**: `updateAudioTextures()` called from render loop
- **Proper cleanup**: Audio resources freed when channels deleted

### ✅ Tab System Updates
- **`tab-config.js`**: Added `isAudioChannel()`, `createAudioChannelTabName()`
- **`tabs.js`**: Added `addAudioChannel()` function and menu entry
- **Tab naming**: `audio_ch1`, `audio_ch2`, etc.
- **Tab switching**: Properly shows/hides audio selector UI

### ✅ Render Loop Integration (`js/render.js`)
- **Per-frame texture updates**: Calls `channels.updateAudioTextures(gl)` before rendering
- **Only updates playing audio**: Skips paused channels for performance
- **WebGL context**: Updates textures using `texSubImage2D` (efficient)

### ✅ Media Catalog (`media/catalog.json`)
- Added `"audio": []` section
- Placeholder entry shows where to add audio files
- Ready for user to populate with actual audio files

---

## Technical Details

### Audio Texture Format

```
Width × Height: Configurable (512×2, 1024×2, 2048×2, 4096×2)
Format: R8 (grayscale, 8-bit unsigned byte)
Filter: NEAREST (no interpolation for accurate sampling)
Wrap: CLAMP_TO_EDGE

Row 0: Frequency spectrum (getByteFrequencyData) - NOTE: Shadertoy has frequency on row 0!
Row 1: Waveform data (getByteTimeDomainData)
```

### GLSL Shader Usage

```glsl
uniform sampler2D iChannel1;  // Audio texture

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    // Sample frequency (row 0, y=0.25)
    float freq = texture(iChannel1, vec2(uv.x, 0.25)).r;
    
    // Sample waveform (row 1, y=0.75)
    float wave = texture(iChannel1, vec2(uv.x, 0.75)).r;
    
    fragColor = vec4(freq, wave, 0.5, 1.0);
}
```

### FFT Size Configuration

| Mode | FFT Size | Width | Use Case |
|------|----------|-------|----------|
| **Shadertoy** | 1024 | 512 | Shadertoy compatibility (default) |
| **Standard** | 2048 | 1024 | Full resolution |
| **High** | 4096 | 2048 | Higher frequency detail |
| **Ultra** | 8192 | 4096 | Maximum detail (may be slow) |

**Note**: FFT size must be power of 2 between 32-32768. Web Audio API returns frequencyBinCount = fftSize / 2.

### Smoothing

Following Shadertoy's approach:
```javascript
analyser.smoothingTimeConstant = 0.8;  // 0-1, higher = more smoothing
```

This provides temporal smoothing to reduce jitter in visualizations.

---

## Files Created

1. **`js/audio-input.js`** (309 lines)
   - Core audio channel management
   - Texture creation and updates
   - Web Audio API integration

2. **`js/ui/audio-selector.js`** (506 lines)
   - Audio selector UI component
   - Playback controls
   - Visualization canvas

---

## Files Modified

1. **`js/channels.js`**
   - Added audio channel support in `createChannel()`
   - Added audio cleanup in `deleteChannel()`
   - Added audio media update in `updateChannelMedia()`
   - Added `audioMode` to channel config
   - Added `updateAudioTextures()` export
   - Added audio channel support in `loadChannelConfig()`

2. **`js/tab-config.js`**
   - Added `isAudioChannel()` function
   - Added `createAudioChannelTabName()` function
   - Updated `isChannel()` to include audio
   - Updated `getTabIcon()` and `getTabLabel()` for audio
   - Updated `getEditorForTab()` to exclude audio channels

3. **`js/tabs.js`**
   - Added `audioSelector` import
   - Added `isAudioChannel` import
   - Added `createAudioChannelTabName` import
   - Added `addAudioChannel()` function
   - Updated `switchTab()` to handle audio channels
   - Added audio channel to tab switching logic
   - Added "🎵 Audio Channel" to Add Pass menu

4. **`js/media-loader.js`**
   - Updated `getMediaInfo()` to check audio in catalog

5. **`js/render.js`**
   - Added `channels` import
   - Added `channels.updateAudioTextures(gl)` call before rendering

6. **`media/catalog.json`**
   - Added `"audio": []` section with placeholder

---

## Usage Instructions

### For Developers

1. **Add audio files** to `media/` folder
2. **Update catalog**: Add entries to `media/catalog.json`
   ```json
   {
     "id": "ambient1",
     "name": "Ambient Loop",
     "path": "media/ambient.mp3",
     "duration": 120
   }
   ```

### For Users

1. Click **"+ Add Pass"** button
2. Select **"🎵 Audio Channel"**
3. **Choose audio**:
   - Select from catalog, OR
   - Import from GitHub: `user/repo/branch/path/file.mp3`
4. **Configure**:
   - Press play ▶
   - Enable loop if desired
   - Adjust volume
   - Select quality mode (Shadertoy default is fine)
5. **Use in shader**:
   - Audio will be available as `iChannel1`, `iChannel2`, etc.
   - Sample waveform at y=0.25, frequency at y=0.75

---

## Save/Load Support

Audio channels are fully saved with shaders:
- `type: 'audio'`
- `mediaId`: Catalog ID or `guc:path` for GitHub
- `audioMode`: Quality setting (shadertoy, standard, high, ultra)
- `tabName`: `audio_ch1`, etc.

External audio from GitHub is re-registered when loading.

---

## Next Steps (Future Enhancements)

### Immediate
- [ ] Add sample audio files to catalog
- [ ] Test with various audio formats
- [ ] Test save/load with audio channels
- [ ] Test GitHub audio import

### Future Features
- [ ] Microphone input support
- [ ] Additional texture rows (smoothed FFT, peak data)
- [ ] Custom smoothing controls
- [ ] Audio time uniforms (`u_audioTime`)
- [ ] Waveform/spectrum preview in selector
- [ ] Audio scrubbing (seek controls)
- [ ] Stereo channels (separate L/R textures)

---

## Known Limitations

1. **Browser audio policy**: Audio may not play until user interacts with page
2. **CORS**: External audio URLs must allow cross-origin access
3. **File formats**: Browser support varies (.mp3 widely supported, .wav/.ogg less so)
4. **Performance**: Ultra mode (4096×2) may impact frame rate on slower devices
5. **No microphone**: Microphone input not implemented yet (future feature)

---

## Testing Checklist

- [ ] Create audio channel tab
- [ ] Load audio from catalog
- [ ] Import audio from GitHub URL
- [ ] Play/pause audio
- [ ] Enable/disable loop
- [ ] Adjust volume
- [ ] Switch quality modes
- [ ] Use audio texture in shader
- [ ] Save shader with audio channel
- [ ] Load shader with audio channel
- [ ] Delete audio channel tab
- [ ] Multiple audio channels simultaneously

---

## API Reference

### Audio Input Module (`js/audio-input.js`)

```javascript
import * as audioInput from './audio-input.js';

// Create audio texture
const { texture, mode, width, height } = audioInput.createAudioTexture(gl, 'shadertoy');

// Create audio analyser from file
const { audio, analyser, source, context } = await audioInput.createAudioAnalyser(audioPath, 'shadertoy');

// Load complete audio channel
const audioData = await audioInput.loadAudioChannel(gl, audioPath, 'shadertoy');

// Update texture each frame
audioInput.updateAudioTexture(gl, texture, analyser, width, height);

// Playback controls
await audioInput.playAudioChannel(channel.audioData);
audioInput.pauseAudioChannel(channel.audioData);
audioInput.setAudioVolume(channel.audioData, 0.5);
audioInput.setAudioLoop(channel.audioData, true);

// Cleanup
audioInput.cleanupAudioChannel(channel.audioData);
```

### Channels Module (Audio-specific)

```javascript
import * as channels from './channels.js';

// Create audio channel
const channelNum = await channels.createChannel('audio', {
    mediaId: 'ambient1',
    tabName: 'audio_ch1',
    audioMode: 'shadertoy'
});

// Update audio textures (call each frame)
channels.updateAudioTextures(gl);

// Update audio media
await channels.updateChannelMedia(channelNum, 'newAudioId');
```

---

## Architecture Notes

The audio system follows the same patterns as the existing image channel system:
- **Channel-based**: Audio is a channel type, not a tab type
- **Dynamic tabs**: `audio_ch1`, `audio_ch2` created on demand
- **Automatic binding**: Textures bound as samplers when used in shaders
- **Per-frame updates**: Textures updated in render loop before drawing
- **Persistence**: Full save/load support through channel config

This makes it consistent with images and future video channels.

---

✅ **Implementation Complete** - Ready for user testing and feedback!

