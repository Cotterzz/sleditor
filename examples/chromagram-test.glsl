// Chromagram Audio Visualizer with Note Labels
// Demonstrates the 12x12 musical note detection texture
//
// Required channels:
//   iChannel1: Audio in Chromagram mode
//   iChannel2: Font texture (16x16 grid)
//
// Texture Layout:
//   Rows 0-11: Semitones (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
//   Col 1-9: Octaves 1-9 (stretched to fill width)
//
// Channels (RGB):
//   Red: Current energy level (squared for emphasis)
//   Green: Positive delta (energy increase) - beat detection!
//   Blue: Temporal average (smoothed over time) - sustained notes

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

// Sample font texture (16x16 grid)
float getChar(vec2 uv, int charX, int charY) {
    vec2 charUV = (vec2(float(charX), float(charY)) + uv) / 16.0;
    if(charUV.x>0.07){return (texture(iChannel2, charUV).r - 0.1)*1.3;} else {return 0.;}
}

// Draw note label (e.g., "C#3" or "F5")
float drawNoteLabel(vec2 p, int semitone, int octave) {
    // Map semitone to letter A-G and accidental
    // C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
    // Font has letters in alphabetical order: A(0), B(1), C(2), D(3), E(4), F(5), G(6)
    // But chromatic scale starts at C, so: C=2, D=3, E=4, F=5, G=6, A=0, B=1
    int letters[12] = int[](2, 2, 3, 3, 4, 5, 5, 6, 6, 0, 0, 1); // C,C,D,D,E,F,F,G,G,A,A,B
    int accidentals[12] = int[](0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0); // 0=natural, 1=sharp
    
    int letter = letters[semitone];
    int accidental = accidentals[semitone];
    
    float result = 0.0;
    
    // Larger character size for letter/sharp
    vec2 charSizeLarge = vec2(0.4, 0.5);
    // Smaller size for number
    vec2 charSizeSmall = vec2(0.2, 0.25);
    
    // Draw letter (A-G) - letters are at grid positions (1,11) to (7,11)
    // Position in upper left/center
    vec2 letterPos = vec2(0.1, 0.3);
    vec2 letterUV = (p - letterPos) / charSizeLarge;
    // Add small inset to avoid edge artifacts
    //letterUV = letterUV * 0.8 + 0.4;
    if (letterUV.x >= 0.0 && letterUV.x < 1.0 && letterUV.y >= 0.0 && letterUV.y < 1.0) {
        result = max(result, getChar(letterUV, 1 + letter, 11));
    }
    
    // Draw accidental if sharp
    if (accidental == 1) {
        vec2 sharpPos = vec2(0.35, 0.3);
        vec2 sharpUV = (p - sharpPos) / charSizeLarge;
        //sharpUV = sharpUV * 1.1 - 0.05;
        if (sharpUV.x >= 0.0 && sharpUV.x < 1.0 && sharpUV.y >= 0.0 && sharpUV.y < 1.0) {
            result = max(result, getChar(sharpUV, 15, 15)); // Sharp at (15,15)
        }
    }
    
    // Draw octave number (0-9) at grid positions (0,12) to (9,12)
    // Position in bottom right corner
    vec2 numPos = vec2(0.73, 0.73);
    vec2 numUV = (p - numPos) / charSizeSmall;
    numUV = numUV * 1.1 - 0.05;
    if (numUV.x >= 0.0 && numUV.x < 1.0 && numUV.y >= 0.0 && numUV.y < 1.0) {
        result = max(result, getChar(numUV, octave, 12));
    }
    
    return result;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(0.02);
    
    // Grid visualization - only show octaves 1-9 (9 columns)
    // Stretch to fill the width
    vec2 gridUV = vec2(uv.x * 9.0, uv.y * 12.0);
    vec2 gridCell = floor(gridUV);
    vec2 cellUV = fract(gridUV);
    
    int col_idx = int(gridCell.x) + 1; // +1 because we start from octave 1
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
    float border = 0.02;
    if (cellUV.x > border && cellUV.x < 1.0 - border && 
        cellUV.y > border && cellUV.y < 1.0 - border) {
        // Inside cell
        
        // Base color from instant energy (red)
        col = noteColor * noteEnergy;
        
        // Add bright yellow/white flash from delta (green = beats)
        col += vec3(1.0, 1.0, 0.5) * noteDelta * 2.0;
        
        // Add subtle blue tint from sustained notes
        col += vec3(0.2, 0.2, 0.5) * noteSmooth;
        
        // Glow effect
        col += noteColor * noteEnergy * 0.3;
        
        // Draw note label
        float label = drawNoteLabel(cellUV, row_idx, col_idx);
        
        // Composite label with adaptive color (bright on dark, dark on bright)
        float brightness = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 labelColor = brightness > 0.5 ? vec3(0.0) : vec3(1.0);
        col = mix(col, labelColor, label * 0.9);
        
    } else {
        // Grid border
        col = vec3(0.15);
    }
    
    // Global pulse from average delta
    float avgDelta = getNote(11, 0).g;
    col *= 1.0 + avgDelta * 0.3;
    
    fragColor = vec4(col, 1.0);
}
