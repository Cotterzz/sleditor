// Opaque Volume Viewer - Isosurface Rendering
// Add Volume channel as iChannel1, select "Christmas Tree" or "Stag Beetle"
// Drag mouse to rotate!
//
// These RG8 volumes have 2 channels - try different color options below!
// Also adjust boxSize, texelSize, and threshold for each volume.

#define MAX_STEPS 200
#define STEP_SIZE 0.004

mat3 rotateY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0, s, 0, 1, 0, -s, 0, c);
}

mat3 rotateX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1, 0, 0, 0, c, -s, 0, s, c);
}

vec2 boxIntersect(vec3 ro, vec3 rd, vec3 boxSize) {
    vec3 m = 1.0 / rd;
    vec3 n = m * ro;
    vec3 k = abs(m) * boxSize;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tN = max(max(t1.x, t1.y), t1.z);
    float tF = min(min(t2.x, t2.y), t2.z);
    if (tN > tF || tF < 0.0) return vec2(-1.0);
    return vec2(tN, tF);
}

// Compute gradient (normal) at a point in the volume
vec3 computeNormal(vec3 uvw, vec3 texelSize) {
    float dx = texture(iChannel1, uvw + vec3(texelSize.x, 0, 0)).r 
             - texture(iChannel1, uvw - vec3(texelSize.x, 0, 0)).r;
    float dy = texture(iChannel1, uvw + vec3(0, texelSize.y, 0)).r 
             - texture(iChannel1, uvw - vec3(0, texelSize.y, 0)).r;
    float dz = texture(iChannel1, uvw + vec3(0, 0, texelSize.z)).r 
             - texture(iChannel1, uvw - vec3(0, 0, texelSize.z)).r;
    return normalize(vec3(dx, dy, dz));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Mouse rotation - spherical coordinates
    vec2 mouse = iMouse.xy / iResolution.xy;
    float theta, phi;
    if (iMouse.z > 0.0) {
        theta = (1.0 - mouse.x) * 6.28;
        phi = (mouse.y - 0.5) * 3.14 * 0.8;
    } else {
        theta = iTime * 0.3;
        phi = 0.2;
    }

    // Camera position from spherical coordinates
    float dist = 1.5;
    vec3 ro = vec3(
        dist * cos(phi) * sin(theta),
        dist * sin(phi),
        dist * cos(phi) * cos(theta)
    );

    // Look at center
    vec3 target = vec3(0.0);
    vec3 fwd = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0, 1, 0), fwd));
    vec3 up = cross(fwd, right);
    vec3 rd = normalize(fwd + uv.x * right + uv.y * up);

    // Volume aspect ratio - adjust for your volume
    // Christmas Tree: 256x249x256
    // Stag Beetle: 208x208x123
    vec3 boxSize = vec3(0.5, 0.5 * (249.0/256.0), 0.5);  // Christmas Tree
    // vec3 boxSize = vec3(0.5, 0.5, 0.5 * (123.0/208.0));  // Stag Beetle
    
    vec3 texelSize = 1.0 / vec3(256.0, 249.0, 256.0);  // Christmas Tree
    // vec3 texelSize = 1.0 / vec3(208.0, 208.0, 123.0);  // Stag Beetle

    vec2 tBox = boxIntersect(ro, rd, boxSize);
    
    // Background gradient
    vec3 col = mix(vec3(0.15, 0.18, 0.22), vec3(0.08, 0.1, 0.12), uv.y + 0.5);

    // Isosurface threshold - adjust for different volumes
    float threshold = 0.15;
    
    // Light setup
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    vec3 lightColor = vec3(1.0, 0.98, 0.95);
    vec3 ambientColor = vec3(0.15, 0.18, 0.22);

    if (tBox.x > 0.0) {
        float tStart = max(tBox.x, 0.0);
        float tEnd = tBox.y;
        
        bool hit = false;
        vec3 hitPos;
        vec3 hitUVW;
        float hitDensity;

        // March through volume looking for isosurface
        for (int i = 0; i < MAX_STEPS; i++) {
            float t = tStart + float(i) * STEP_SIZE;
            if (t > tEnd) break;

            vec3 pos = ro + rd * t;
            vec3 uvw = pos / boxSize * 0.5 + 0.5;
            
            // Sample the volume (RG8 format - R=density, G=color/gradient)
            vec2 sample = texture(iChannel1, uvw).rg;
            float density = sample.r;
            
            // Hit the isosurface?
            if (density > threshold) {
                hit = true;
                hitPos = pos;
                hitUVW = uvw;
                hitDensity = density;
                break;
            }
        }

        if (hit) {
            // Sample both channels at hit point for color
            vec2 hitSample = texture(iChannel1, hitUVW).rg;
            
            // Compute normal from gradient
            vec3 normal = computeNormal(hitUVW, texelSize);
            
            // Flip normal if pointing away from camera
            if (dot(normal, -rd) < 0.0) normal = -normal;
            
            // =========================================================
            // COLOR INTERPRETATION OPTIONS - uncomment one:
            // =========================================================
            vec3 baseColor;
            float r = hitSample.r;
            float g = hitSample.g;
            
            // Option A: RG as actual Red/Green channels (blue=0)
            // baseColor = vec3(r, g, 0.0);
            
            // Option B: RG as actual Red/Green with derived blue
            baseColor = vec3(r, g, min(r, g) * 0.5);
            
            // Option C: R as luminance only (grayscale)
            // baseColor = vec3(r);
            
            // Option D: Use G channel as hue, R as brightness
            // float hue = g * 6.28;
            // baseColor = r * (0.5 + 0.5 * vec3(cos(hue), cos(hue - 2.09), cos(hue - 4.19)));
            
            // Option E: Transfer function - map density to color
            // baseColor = mix(vec3(0.1, 0.4, 0.1), vec3(0.9, 0.95, 0.8), smoothstep(0.1, 0.8, r));
            
            // Phong lighting
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 halfVec = normalize(lightDir - rd);
            float spec = pow(max(dot(normal, halfVec), 0.0), 32.0);
            
            // Final color with lighting
            col = baseColor * (ambientColor + lightColor * diff * 0.8);
            col += lightColor * spec * 0.3;
            
            // Depth fog
            float depth = length(hitPos - ro);
            col = mix(col, vec3(0.1, 0.12, 0.15), smoothstep(0.5, 1.5, depth));
        }
    }

    // Tone mapping and gamma
    col = col / (col + 0.5);
    col = pow(col, vec3(0.9));
    
    fragColor = vec4(col, 1.0);
}

