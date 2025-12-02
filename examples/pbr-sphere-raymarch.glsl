// Audio-Reactive PBR Sphere (Raymarched)
// Raymarches a displaced sphere with PBR materials responding to music
// 
// Required Channels:
//   iChannel0: Displacement map (heightmap for surface deformation)
//   iChannel1: Diffuse/Albedo texture (base color)
//   iChannel2: Normal map (GL format - green = up)
//   iChannel3: Roughness map (grey scale)
//   iChannel4: Audio in Chromagram mode (12×12)

// Sample chromagram at specific octave and semitone
vec3 getNote(int octave, int semitone) {
    vec2 uv = (vec2(float(octave), float(semitone)) + 0.5) / 12.0;
    return texture(iChannel4, uv).rgb;
}

// Get frequency band energy
vec3 getBass() {
    vec3 sum = vec3(0.0);
    for (int s = 0; s < 5; s++) {
        sum += getNote(1, s);
    }
    return sum / 5.0;
}

vec3 getMids() {
    vec3 sum = vec3(0.0);
    for (int s = 0; s < 8; s++) {
        sum += getNote(4, s);
    }
    return sum / 8.0;
}

vec3 getTreble() {
    vec3 sum = vec3(0.0);
    for (int s = 0; s < 12; s++) {
        sum += getNote(7, s);
    }
    return sum / 12.0;
}

// Convert 3D position to spherical UV coordinates
vec2 sphereUV(vec3 p) {
    vec3 n = normalize(p);
    float u = 0.5 + atan(n.z, n.x) / (2.0 * 3.14159);
    float v = 0.5 - asin(n.y) / 3.14159;
    return vec2(u, v);
}

// Sample displacement at a 3D position
float getDisplacement(vec3 p, float audioReactivity) {
    vec2 uv = sphereUV(p);
    float disp = texture(iChannel0, uv).r;
    
    // Audio makes displacement more pronounced
    return disp * (0.1 + audioReactivity * 0.2);
}

// SDF for displaced sphere
float sdSphere(vec3 p, float radius, float audioReactivity) {
    float baseDist = length(p) - radius;
    float displacement = getDisplacement(p, audioReactivity);
    return baseDist - displacement;
}

// Calculate normal using central differences
vec3 calcNormal(vec3 p, float audioReactivity) {
    const float eps = 0.001;
    float radius = 1.0;
    vec2 e = vec2(eps, 0.0);
    return normalize(vec3(
        sdSphere(p + e.xyy, radius, audioReactivity) - sdSphere(p - e.xyy, radius, audioReactivity),
        sdSphere(p + e.yxy, radius, audioReactivity) - sdSphere(p - e.yxy, radius, audioReactivity),
        sdSphere(p + e.yyx, radius, audioReactivity) - sdSphere(p - e.yyx, radius, audioReactivity)
    ));
}

// Raymarch the scene
float raymarch(vec3 ro, vec3 rd, float audioReactivity) {
    float t = 0.0;
    for (int i = 0; i < 100; i++) {
        vec3 p = ro + rd * t;
        float d = sdSphere(p, 1.0, audioReactivity);
        if (d < 0.001) return t;
        if (t > 20.0) break;
        t += d * 0.5; // Smaller step for displaced surface
    }
    return -1.0;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Sample audio frequencies
    vec3 bass = getBass();
    vec3 mids = getMids();
    vec3 treble = getTreble();
    float audioReactivity = (bass.r + mids.r + treble.r) / 3.0;
    
    // Camera setup
    float camDist = 3.0 - bass.g * 0.5; // Pull in on bass beats
    vec3 ro = vec3(0.0, 0.0, camDist);
    vec3 rd = normalize(vec3(uv, -1.5));
    
    // Rotate camera
    float angle = iTime * 0.2;
    float ca = cos(angle), sa = sin(angle);
    ro.xz = mat2(ca, -sa, sa, ca) * ro.xz;
    rd.xz = mat2(ca, -sa, sa, ca) * rd.xz;
    
    // Raymarch
    float t = raymarch(ro, rd, audioReactivity);
    
    if (t < 0.0) {
        // Background
        fragColor = vec4(0.05, 0.05, 0.1, 1.0);
        return;
    }
    
    // Hit point
    vec3 p = ro + rd * t;
    vec3 geomNormal = calcNormal(p, audioReactivity);
    vec2 surfaceUV = sphereUV(p);
    
    // Sample PBR textures
    vec3 albedo = texture(iChannel1, surfaceUV).rgb;
    vec3 normalMap = texture(iChannel2, surfaceUV).rgb * 2.0 - 1.0;
    float baseRoughness = texture(iChannel3, surfaceUV).r;
    
    // Build tangent space for normal mapping
    vec3 up = abs(geomNormal.y) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(up, geomNormal));
    vec3 bitangent = cross(geomNormal, tangent);
    mat3 TBN = mat3(tangent, bitangent, geomNormal);
    
    // Apply normal map
    float normalStrength = 1.0 + treble.r * 0.5;
    vec3 normal = normalize(TBN * vec3(normalMap.xy * normalStrength, normalMap.z));
    
    // Audio-reactive roughness
    float roughness = baseRoughness * (1.0 - bass.g * 0.7);
    roughness = clamp(roughness, 0.05, 1.0);
    
    // === LIGHTING FROM CHROMAGRAM GRID ===
    vec3 totalLight = vec3(0.0);
    vec3 ambientLight = vec3(0.05);
    
    for (int octave = 1; octave <= 9; octave++) {
        for (int semitone = 0; semitone < 12; semitone++) {
            vec3 noteData = getNote(octave, semitone);
            float noteEnergy = noteData.r;
            float noteBeat = noteData.g;
            
            if (noteEnergy < 0.01) continue;
            
            // Position lights around sphere
            float octAngle = (float(octave - 1) / 8.0) * 6.28318;
            float semiHeight = (float(semitone) / 11.0 - 0.5) * 2.0;
            vec3 lightPos = vec3(
                cos(octAngle) * 3.0,
                semiHeight * 2.0,
                sin(octAngle) * 3.0
            );
            
            // Pulse toward sphere on beats
            lightPos = normalize(lightPos) * (3.0 - noteBeat * 1.0);
            
            vec3 lightDir = normalize(lightPos - p);
            
            // Light color from semitone hue
            float hue = float(semitone) / 12.0;
            vec3 lightColor = vec3(
                0.5 + 0.5 * cos(hue * 6.28318 + vec3(0.0, 2.09, 4.19))
            );
            
            // Lighting calculation
            float ndotl = max(0.0, dot(normal, lightDir));
            float intensity = noteEnergy * 2.0 + noteBeat * 3.0;
            
            // Distance attenuation
            float dist = length(lightPos - p);
            float attenuation = 3.0 / (1.0 + dist * dist * 0.5);
            
            totalLight += lightColor * ndotl * intensity * attenuation;
        }
    }
    
    // Apply lighting
    vec3 col = albedo * (ambientLight + totalLight * 0.3);
    
    // Specular highlights
    vec3 viewDir = -rd;
    for (int octave = 1; octave <= 9; octave++) {
        for (int semitone = 0; semitone < 12; semitone++) {
            vec3 noteData = getNote(octave, semitone);
            float noteBeat = noteData.g;
            
            if (noteBeat < 0.1) continue;
            
            // Light position
            float octAngle = (float(octave - 1) / 8.0) * 6.28318;
            float semiHeight = (float(semitone) / 11.0 - 0.5) * 2.0;
            vec3 lightPos = vec3(
                cos(octAngle) * 3.0,
                semiHeight * 2.0,
                sin(octAngle) * 3.0
            );
            lightPos = normalize(lightPos) * (3.0 - noteBeat * 1.0);
            
            vec3 lightDir = normalize(lightPos - p);
            vec3 halfDir = normalize(lightDir + viewDir);
            float ndoth = max(0.0, dot(normal, halfDir));
            float shininess = mix(2.0, 128.0, 1.0 - roughness);
            float specular = pow(ndoth, shininess);
            
            // Hue for this semitone
            float hue = float(semitone) / 12.0;
            vec3 specColor = vec3(
                0.5 + 0.5 * cos(hue * 6.28318 + vec3(0.0, 2.09, 4.19))
            );
            
            col += specColor * specular * noteBeat * 0.5;
        }
    }
    
    // Global brightness pulse
    col *= 1.0 + bass.b * 0.2;
    
    // Tone mapping
    fragColor = vec4(tanh(col * 0.5), 1.0);
}

