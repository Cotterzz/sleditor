// Chromagram Chord Detection Example
// Detects major and minor chords in real-time audio
// 
// Set up:
// 1. Add audio channel
// 2. Select audio file with music
// 3. Change audio mode to "Chromagram (12×12)" or "Chromagram HQ (12×12)"
// 4. Play!

// Semitone indices
#define C   0
#define CS  1
#define D   2
#define DS  3
#define E   4
#define F   5
#define FS  6
#define G   7
#define GS  8
#define A   9
#define AS  10
#define B   11

// Sample note at specific octave and semitone
vec3 getNote(int octave, int semitone) {
    vec2 uv = (vec2(float(octave), float(semitone)) + 0.5) / 12.0;
    return texture(iChannel1, uv).rgb;
}

// Sum note energy across all octaves
float getNoteAllOctaves(int semitone) {
    float sum = 0.0;
    for (int oct = 1; oct <= 9; oct++) {
        sum += getNote(oct, semitone).r;  // Use red channel (instant energy)
    }
    return sum / 9.0;
}

// Detect major chord (root, major third, fifth)
float detectMajorChord(int root) {
    float rootNote = getNoteAllOctaves(root);
    float thirdNote = getNoteAllOctaves((root + 4) % 12);  // Major third
    float fifthNote = getNoteAllOctaves((root + 7) % 12);  // Perfect fifth
    
    return (rootNote + thirdNote + fifthNote) / 3.0;
}

// Detect minor chord (root, minor third, fifth)
float detectMinorChord(int root) {
    float rootNote = getNoteAllOctaves(root);
    float thirdNote = getNoteAllOctaves((root + 3) % 12);  // Minor third
    float fifthNote = getNoteAllOctaves((root + 7) % 12);  // Perfect fifth
    
    return (rootNote + thirdNote + fifthNote) / 3.0;
}

// HSL to RGB
vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(0.0);
    
    // Get bass energy for kick drum detection (sub-bass column, red channel)
    float bass = getNote(0, 0).r;
    
    // Detect all major chords
    float c_maj = detectMajorChord(C);
    float d_maj = detectMajorChord(D);
    float e_maj = detectMajorChord(E);
    float f_maj = detectMajorChord(F);
    float g_maj = detectMajorChord(G);
    float a_maj = detectMajorChord(A);
    
    // Detect all minor chords
    float c_min = detectMinorChord(C);
    float d_min = detectMinorChord(D);
    float e_min = detectMinorChord(E);
    float f_min = detectMinorChord(F);
    float g_min = detectMinorChord(G);
    float a_min = detectMinorChord(A);
    
    // Find strongest chord
    float maxMajor = max(max(c_maj, d_maj), max(e_maj, max(f_maj, max(g_maj, a_maj))));
    float maxMinor = max(max(c_min, d_min), max(e_min, max(f_min, max(g_min, a_min))));
    
    // Background gradient based on bass
    col = vec3(0.05 + bass * 0.2);
    
    // Circular chord visualizer
    vec2 center = vec2(0.5);
    vec2 p = uv - center;
    float angle = atan(p.y, p.x);
    float radius = length(p);
    
    // Divide circle into 12 segments (one per semitone)
    float angleNorm = (angle / 6.28318530718) + 0.5;  // 0-1
    int segment = int(angleNorm * 12.0);
    
    // Show note intensity in each segment
    if (radius > 0.2 && radius < 0.8) {
        float noteIntensity = getNoteAllOctaves(segment);
        float hue = float(segment) / 12.0;
        vec3 noteColor = hsl2rgb(vec3(hue, 0.8, 0.5));
        
        // Radial bars
        float barHeight = 0.2 + noteIntensity * 0.4;
        if (radius < 0.2 + barHeight) {
            col = noteColor * noteIntensity;
            
            // Add beat flash (green channel = delta)
            float noteDelta = getNote(4, segment).g;  // Sample from mid-octave
            col += vec3(1.0, 1.0, 0.5) * noteDelta;
        }
    }
    
    // Center circle shows chord quality
    if (radius < 0.15) {
        if (maxMajor > maxMinor && maxMajor > 0.3) {
            // Major chord - bright yellow/gold
            col = vec3(1.0, 0.9, 0.3) * maxMajor;
        } else if (maxMinor > 0.3) {
            // Minor chord - blue/purple
            col = vec3(0.5, 0.3, 1.0) * maxMinor;
        } else {
            // No clear chord - dim white
            col = vec3(0.2);
        }
    }
    
    // Add kick drum flash
    col += vec3(1.0) * bass * bass * 0.5;
    
    fragColor = vec4(col, 1.0);
}
