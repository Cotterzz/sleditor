// Chromagram Audio Visualizer Test
// Demonstrates the 12x12 musical note detection texture
//
// Texture Layout:
//   Rows 0-11: Semitones (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
//   Col 0: Sub-bass (< C1)
//   Col 1-9: Octaves 1-9
//   Col 10: High freq (> B9)
//   Col 11: Average energy level
//
// Channels (RGB):
//   Red: Current energy level (squared for emphasis)
//   Green: Positive delta (energy increase) - beat detection!
//   Blue: Temporal average (smoothed over time) - sustained notes
//
// To use: 
// 1. Add an audio channel (tab)
// 2. Select an audio file
// 3. Change mode to "Chromagram (12×12)" or "Chromagram HQ (12×12)"
// 4. Play the shader

// Sample chromagram at specific octave and semitone
vec3 getNote(int octave, int semitone) {
    vec2 uv = (vec2(float(octave), float(semitone)) + 0.5) / 12.0;
    return texture(iChannel1, uv).rgb;
}

// HSL to RGB conversion
vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(0.02);
    
    // Grid visualization
    // Divide screen into 12x12 grid matching chromagram
    vec2 gridUV = uv * 12.0;
    vec2 gridCell = floor(gridUV);
    vec2 cellUV = fract(gridUV);
    
    int col_idx = int(gridCell.x);
    int row_idx = int(gridCell.y);
    
    // Sample chromagram value for this cell
    vec3 noteData = getNote(col_idx, row_idx);
    float noteEnergy = noteData.r;     // Red: instant energy
    float noteDelta = noteData.g;      // Green: delta (beats)
    float noteSmooth = noteData.b;     // Blue: temporal average
    
    // Color based on note (hue per semitone)
    float hue = float(row_idx) / 12.0;
    vec3 noteColor = hsl2rgb(vec3(hue, 0.8, 0.5));
    
    // Cell visualization with border
    float border = 0.05;
    if (cellUV.x > border && cellUV.x < 1.0 - border && 
        cellUV.y > border && cellUV.y < 1.0 - border) {
        // Inside cell
        
        // Special columns (0, 10, 11) display as white/grey
        if (col_idx == 0 || col_idx == 10 || col_idx == 11) {
            // Sub-bass, high-freq, and average: show as white/grey
            col = vec3(noteEnergy * 0.6);
            // Flash on beats
            col += vec3(1.0) * noteDelta;
            // Subtle blue for sustained
            col += vec3(noteSmooth * 0.3);
        } else {
            // Musical octaves (1-9): show as colored
            // Base color from instant energy (red)
            col = noteColor * noteEnergy;
            
            // Add bright yellow/white flash from delta (green = beats)
            col += vec3(1.0, 1.0, 0.5) * noteDelta * 2.0;
            
            // Add subtle blue tint from sustained notes
            col += vec3(0.2, 0.2, 0.5) * noteSmooth;
            
            // Glow effect
            col += noteColor * noteEnergy * 0.3;
        }
    } else {
        // Grid border
        col = vec3(0.1);
    }
    
    // Global pulse from average delta
    float avgDelta = getNote(11, 0).g;
    col *= 1.0 + avgDelta * 0.5;
    
    fragColor = vec4(col, 1.0);
}
