// Light-Based Extrusion Demo - Shadertoy Compatible
// Surfaces facing the light get extruded along the light direction
// More extrusion on direct angles, less on glancing
// Mouse X/Y controls light direction

// SDF primitives
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCylinderH(vec3 p, vec3 a, vec3 b, float r) {
    vec3 ba = b - a;
    vec3 pa = p - a;
    float baba = dot(ba, ba);
    float paba = dot(pa, ba);
    float x = length(pa * baba - ba * paba) - r * baba;
    float y = abs(paba - baba * 0.5) - baba * 0.5;
    float x2 = x * x;
    float y2 = y * y * baba;
    float d = (max(x, y) < 0.0) ? -min(x2, y2) : (((x > 0.0) ? x2 : 0.0) + ((y > 0.0) ? y2 : 0.0));
    return sign(d) * sqrt(abs(d)) / baba;
}

float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

// Object positions
const vec3 spherePos = vec3(-1.2, 0.0, 0.0);
const vec3 boxPos = vec3(1.2, 0.0, 0.0);
const vec3 cylA = vec3(-0.6, 0.0, 0.0);
const vec3 cylB = vec3(0.6, 0.0, 0.0);

// Light direction (set by mouse)
vec3 lightDir;

// Base scene
float scene(vec3 p) {
    float sphere = sdSphere(p - spherePos, 0.6);
    float box = sdBox(p - boxPos, vec3(0.5));
    float cyl = sdCylinderH(p, cylA, cylB, 0.15);
    return min(min(sphere, box), cyl);
}

// Calculate normal via gradient
vec3 calcNormal(vec3 p) {
    const float h = 0.001;
    const vec2 k = vec2(1, -1);
    return normalize(
        k.xyy * scene(p + k.xyy * h) +
        k.yyx * scene(p + k.yyx * h) +
        k.yxy * scene(p + k.yxy * h) +
        k.xxx * scene(p + k.xxx * h)
    );
}

// Max extrusion thickness
const float maxThickness = 0.2;

// Light-extruded scene with angle-based thickness
float sceneWithExtrusion(vec3 p) {
    // Original scene
    float dOrig = scene(p);
    
    // Get normal at nearest surface point for angle calculation
    // We approximate by getting normal at the current sample point
    vec3 n = calcNormal(p);
    
    // How much does surface face the light? (0 = perpendicular, 1 = direct)
    float facing = max(0.0, dot(n, lightDir));
    
    // Scale thickness by facing angle - squared for more contrast
    float thickness = maxThickness * facing * facing;
    
    // Shift sample point opposite to light direction
    vec3 extrudeP = p - lightDir * thickness;
    float dExtrude = scene(extrudeP);
    
    // Smooth blend
    return opSmoothUnion(dOrig, dExtrude, 0.08);
}

// Get material info: returns vec2(material, extrusionAmount)
// material: 0 = original, 1 = extrusion
// extrusionAmount: how thick the extrusion is at this point (0-1)
vec2 getMaterialInfo(vec3 p) {
    float dOrig = scene(p);
    
    vec3 n = calcNormal(p);
    float facing = max(0.0, dot(n, lightDir));
    float thickness = maxThickness * facing * facing;
    
    vec3 extrudeP = p - lightDir * thickness;
    float dExtrude = scene(extrudeP);
    
    // How deep into the extrusion are we?
    // If dExtrude << dOrig, we're in the extrusion
    float extrusionDepth = dOrig - dExtrude;
    
    if (extrusionDepth > 0.01) {
        // We're in extrusion zone
        // Calculate how "thick" this extrusion is (0 = edge, 1 = full depth)
        float amount = smoothstep(0.01, thickness * 0.8, extrusionDepth);
        return vec2(1.0, amount);
    }
    return vec2(0.0, 0.0);
}

// Main SDF for raymarching
float map(vec3 p) {
    return sceneWithExtrusion(p);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Mouse controls light direction
    vec2 mouse = iMouse.xy / iResolution.xy;
    if (iMouse.z < 0.5) {
        mouse = vec2(0.5, 0.7); // Default: slightly from above-front
    }
    
    // Convert mouse to light direction
    float angleX = (mouse.x - 0.5) * 2.0;
    float angleZ = (mouse.y - 0.5) * 1.0;
    lightDir = normalize(vec3(angleX, 0.7 + mouse.y * 0.3, angleZ));
    
    // Fixed camera
    vec3 ro = vec3(0.0, 2.0, 5.0);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);
    
    // Raymarch
    float d = 0.0;
    vec3 p;
    bool hit = false;
    
    for (int i = 0; i < 100; i++) {
        p = ro + rd * d;
        float h = map(p);
        if (h < 0.001) {
            hit = true;
            break;
        }
        if (d > 20.0) break;
        d += h;
    }
    
    // Background gradient
    vec3 col = vec3(0.3, 0.35, 0.5) - 0.3 * rd.y;
    
    if (hit) {
        vec3 n = calcNormal(p);
        
        // Material info
        vec2 matInfo = getMaterialInfo(p);
        float isExtrusion = matInfo.x;
        float extrusionAmount = matInfo.y;
        
        // Colors
        vec3 objectColor = vec3(0.2, 0.3, 0.6);  // Blue base
        vec3 extrudeColor = vec3(1.0, 0.9, 0.5); // Golden extrusion
        
        // Mix colors: thin extrusion shows object color through
        vec3 baseColor;
        if (isExtrusion > 0.5) {
            // Blend from object color (thin) to extrusion color (thick)
            baseColor = mix(objectColor, extrudeColor, extrusionAmount);
        } else {
            baseColor = objectColor;
        }
        
        // Lighting
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.25;
        
        // Specular
        vec3 viewDir = normalize(ro - p);
        vec3 reflDir = reflect(-lightDir, n);
        float spec = pow(max(dot(viewDir, reflDir), 0.0), 32.0);
        
        // Enhance thick extrusion
        if (isExtrusion > 0.5 && extrusionAmount > 0.5) {
            spec *= 1.5;
            baseColor += vec3(0.15, 0.1, 0.0) * diff;
        }
        
        col = baseColor * (amb + diff * 0.8) + vec3(1.0, 0.95, 0.8) * spec * 0.5;
    }
    
    // Gamma
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}
