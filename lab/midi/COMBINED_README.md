# MIDI + Audio Shader - Combined App

This combines the MIDI input system from `midiE.html` with the audio shader + waveform visualizer from `audiopluswave.html`.

## Files

- **combined.html** - The main combined web app
- **index-midi.js** - Modified version of index.js with MIDI uniform support
- **index.js** - Original audio shader system (still used by audiopluswave.html)

## Features

### MIDI Input
- Detects MIDI devices automatically
- Displays piano keyboard (A0 to C8)
- Click piano keys to simulate MIDI notes if no device is connected
- Tracks up to 10 most recent notes
- Compact MIDI log showing note on/off events

### Audio Shader
- GLSL Shadertoy-compatible audio shaders
- Live shader editing with hot reload
- Waveform visualization with zoom and pan
- Real-time audio generation using WebGL

### MIDI Uniforms Available in Shaders

```glsl
struct MIDINote {
    float noteNumber;  // -1 if empty, 0-127 if active
    float frequency;   // Hz (A4 = 440Hz)
    float velocity;    // 0-1
    float duration;    // seconds note has been held
};

uniform MIDINote midiNotes[10];  // Fixed array of 10 notes
uniform int activeNoteCount;     // Number of currently active notes
```

### Settings
- **Buffer ahead time**: 50ms to 1000ms (default 500ms) - Controls audio buffer size
- **Sample batch size**: 20ms to 200ms (default 100ms) - Controls generation batch size

## Default Shader

The default shader creates a polyphonic synthesizer that plays a sine wave for each MIDI note with an exponential decay envelope. The shader uses precise sample-based phase calculation to avoid float precision issues.

## Usage

1. Open `combined.html` in a modern browser (Chrome, Edge recommended)
2. If you have a MIDI device, it will be detected automatically
3. If not, click the piano keys to simulate MIDI input
4. Click "▶ Start" to begin audio generation
5. Edit the shader code to create your own MIDI-reactive sounds
6. Use scroll wheel on waveform to zoom, drag to pan

## Technical Details

- Uses WebGL2 for GPU-accelerated audio generation
- Web Workers for background rendering
- Supports up to 10 simultaneous notes
- Waveform caching for smooth visualization
- MIDI state updates in real-time to shader uniforms
- MIDI uniforms are initialized with empty state on startup
- Both audio and waveform workers receive MIDI updates

## Layout

- **Left Panel**: MIDI status, audio settings, and MIDI log
- **Right Panel**: Shader editor, waveform visualization, and piano keyboard
- Piano keyboard spans full width below waveform for better visibility

## Removed Features (as requested)

- ✗ Shader state panel with JSON export
- ✗ Copy JSON/GLSL buttons
- ✗ Extra MIDI controllers (mod wheel, sustain, etc.)
- ✗ Active notes panel with detailed note display
- ✗ Controllers panel

## Kept Features

- ✓ Number of active notes (activeNoteCount uniform)
- ✓ Compact MIDI log
- ✓ Piano keyboard visualization
- ✓ All core audio shader functionality

## Troubleshooting

### No audio output?
1. Make sure you clicked "▶ Start" button
2. Check browser console for errors
3. Try clicking a piano key to trigger a note
4. Verify your browser supports WebGL2 and Web Audio API (Chrome/Edge recommended)

### Waveform not displaying?
1. The waveform requires valid shader code
2. If you see "Shader error" in waveform, fix the shader syntax first
3. Try zooming out (scroll up on waveform) to see more data
4. The waveform generates on-demand, so it may take a moment

### MIDI not working?
1. If no MIDI device is detected, click piano keys to simulate notes
2. Check browser permissions for MIDI access
3. Try unplugging and replugging your MIDI device
4. Refresh the page after connecting a MIDI device
