// Audio-Reactive PBR Material
// Combines physically-based rendering with musical chromagram analysis
// 
// Required Channels:
//   iChannel0: Diffuse/Albedo texture (base color)
//   iChannel1: Normal map (GL format - green = up)
//   iChannel2: Roughness map (grey scale)
//   iChannel3: Audio in Chromagram mode (12×12)
//

//
// The material responds to music:
//   - Bass beats make surface smooth/reflective
//   - Treble enhances surface detail
//   - Melody triggers emission/glow
//   - Overall energy affects lighting intensity

// Sample chromagram at specific octave and semitone
vec3 getNote(int octave, int semitone) {
    vec2 uv = (vec2(float(octave), float(semitone)) + 0.5) / 12.0;
    return texture(iChannel4, uv).rgb;
}

// Get frequency band energy
vec3 getBass() {
    // Average low notes (C1-E1) for kick drum detection
    vec3 sum = vec3(0.0);
    for (int s = 0; s < 5; s++) {
        sum += getNote(1, s);
    }
    return sum / 5.0;
}

vec3 getMids() {
    // Average mid-range (C4-G4) for melody
    vec3 sum = vec3(0.0);
    for (int s = 0; s < 8; s++) {
        sum += getNote(4, s);
    }
    return sum / 8.0;
}

vec3 getTreble() {
    // Average high notes (C7-C8) for cymbals/hi-hats
    vec3 sum = vec3(0.0);
    for (int s = 0; s < 12; s++) {
        sum += getNote(7, s);
    }
    return sum / 12.0;
}

// Simple PBR lighting (Blinn-Phong approximation)
vec3 calculateLighting(vec3 albedo, vec3 normal, float roughness, float metallic, float ao, vec3 lightDir, vec3 viewDir) {
    // Normalize inputs
    normal = normalize(normal);
    lightDir = normalize(lightDir);
    viewDir = normalize(viewDir);
    
    // Lambertian diffuse
    float ndotl = max(0.0, dot(normal, lightDir));
    
    // Specular (Blinn-Phong)
    vec3 halfDir = normalize(lightDir + viewDir);
    float ndoth = max(0.0, dot(normal, halfDir));
    float shininess = mix(2.0, 256.0, 1.0 - roughness);
    float specular = pow(ndoth, shininess);
    
    // Metallic surfaces reflect colored light
    vec3 specColor = mix(vec3(1.0), albedo, metallic);
    
    // Diffuse is reduced by metallicness
    vec3 diffuse = albedo * ndotl * (1.0 - metallic);
    vec3 spec = specColor * specular;
    
    // Ambient
    vec3 ambient = albedo * 0.03 * ao;
    
    return ambient + diffuse + spec;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    // Load PBR texture maps
    vec3 albedo = texture(iChannel1, uv).rgb;
    vec3 normalMap = texture(iChannel2, uv).rgb * 2.0 - 1.0;
    float baseRoughness = texture(iChannel3, uv).r;
    
    /* Optional maps (check if channels exist by testing sample)
    float metallic = 0.0;
    float ao = 1.0;
   
    if (metallicSample.a > 0.0 || length(metallicSample.rgb) > 0.0) {
        metallic = metallicSample.r;
    }
    
    if (aoSample.a > 0.0 || length(aoSample.rgb) > 0.0) {
        ao = aoSample.r;
    }
    */
    // Sample audio frequencies
    vec3 bass = getBass();       // Red=energy, Green=delta, Blue=sustained
    vec3 mids = getMids();
    vec3 treble = getTreble();
    
    // === AUDIO-REACTIVE MODULATIONS ===
    
    // 1. Bass beats make surface smoother (more reflective)
    float roughness = baseRoughness * (1.0 - bass.g * 0.7);
    roughness = clamp(roughness, 0.05, 1.0);
    
    // 2. Treble enhances normal map detail
    float normalStrength = 1.0 + treble.r * 0.5;
    vec3 normal = normalize(vec3(normalMap.xy * normalStrength, normalMap.z));
    
    // 3. Midrange affects metallic (for dramatic effect)
   // metallic = clamp(metallic + mids.g * 0.3, 0.0, 1.0);
    
    // 4. Overall energy affects ambient occlusion (brighter on loud parts)
    float avgEnergy = (bass.r + mids.r + treble.r) / 3.0;
    //ao = mix(ao, 1.0, avgEnergy * 0.3);
    
    // === LIGHTING SETUP ===
    
    // Create grid of lights matching chromagram layout (9 octaves × 12 semitones)
    // Each note becomes a point light with intensity from chromagram
    vec3 totalLight = vec3(0.0);
    vec3 ambientLight = vec3(0.03);
    
    for (int octave = 1; octave <= 9; octave++) {
        for (int semitone = 0; semitone < 12; semitone++) {
            vec3 noteData = getNote(octave, semitone);
            float noteEnergy = noteData.r;      // Sustained energy
            float noteBeat = noteData.g;         // Beat/attack
            
            // Skip if no energy
            if (noteEnergy < 0.01) continue;
            
            // Position light in 3D space based on octave/semitone
            // Reduced spread = larger grid cells on surface
            float x = (float(octave - 1) / 8.0 - 0.5) * 1.5;  // Reduced from 3.0 to 1.5
            float y = (float(semitone) / 11.0 - 0.5) * 1.5;   // Reduced from 3.0 to 1.5
            float z = 0.9;//2.0 + noteBeat * 2.0; // Closer on beats
            
            vec3 lightPos = vec3(x, y, z);
            vec3 lightDir = normalize(lightPos - vec3(uv * 2.0 - 1.0, 0.0));
            
            // Light color based on semitone (hue wheel)
            float hue = float(semitone) / 12.0;
            vec3 lightColor = vec3(
                0.5 + 0.5 * cos(hue * 6.28318 + vec3(0.0, 2.09, 4.19))
            );
            
            // Light intensity
            float intensity = noteEnergy * 2.0 + noteBeat * 3.0;
            
            // Calculate lighting contribution
            float ndotl = max(0.0, dot(normal, lightDir));
            
            // Distance attenuation (stronger falloff = localized lighting)
            float dist = length(lightPos - vec3(uv * 2.0 - 1.0, 0.0));
            float attenuation = 8.0 / (1.0 + dist * dist * 17.1); // Increased from 0.5 to 3.0
            
            // Accumulate light
            totalLight += lightColor * ndotl * intensity * attenuation;
        }
    }
    
    // Apply lighting to material
    vec3 col = albedo * (ambientLight + totalLight * 0.3);
    
    // Add specular highlights from brightest notes
    vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
    for (int octave = 1; octave <= 9; octave++) {
        for (int semitone = 0; semitone < 12; semitone++) {
            vec3 noteData = getNote(octave, semitone);
            float noteBeat = noteData.g;
            
            if (noteBeat < 0.1) continue;
            
            // Light position (matching main light grid)
            float x = (float(octave - 1) / 8.0 - 0.5) * 1.5;  // Matches main light spread
            float y = (float(semitone) / 11.0 - 0.5) * 1.5;
            float z = 2.0 + noteBeat * 2.0;
            vec3 lightPos = vec3(x, y, z);
            vec3 lightDir = normalize(lightPos - vec3(uv * 2.0 - 1.0, 0.0));
            
            // Specular
            vec3 halfDir = normalize(lightDir + viewDir);
            float ndoth = max(0.0, dot(normal, halfDir));
            float shininess = mix(2.0, 128.0, 1.0 - roughness);
            float specular = pow(ndoth, shininess);
            
            col += vec3(1.0) * specular * noteBeat * 0.3;
        }
    }
    
    // Global brightness pulse with sustained bass
    col *= 1.0 + bass.b * 0.01;
    
    fragColor = vec4(tanh(col*0.3), 1.0);
}

