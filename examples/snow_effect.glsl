// Snow Effect Demo - Shadertoy Compatible
// Technique: Compare scene vs raised/shrunk version to detect snow regions

// SDF primitives
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Horizontal cylinder between two points
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

// Object A: The original scene
float objectA(vec3 p) {
    // Sphere on the left
    float sphere = sdSphere(p - spherePos, 0.6);
    
    // Box on the right
    float box = sdBox(p - boxPos, vec3(0.5));
    
    // Horizontal cylinder connecting them
    float cyl = sdCylinderH(p, cylA, cylB, 0.15);
    
    // Union of all
    return min(min(sphere, box), cyl);
}

// Object B: Each object raised and shrunk around its OWN center
float objectB(vec3 p) {
    float snowHeight = 0.2;   // How high the snow extends
    float shrink = 0.6;       // 60% of original size (shrunk by 40%)
    
    // Sphere - shrink around sphere's center, then raise
    vec3 sphereP = spherePos + vec3(0.0, snowHeight, 0.0);  // Raised center
    vec3 localP = (p - sphereP) / shrink;  // Transform to local shrunk space
    float sphere = sdSphere(localP, 0.6) * shrink;
    
    // Box - shrink around box's center, then raise
    vec3 boxP = boxPos + vec3(0.0, snowHeight, 0.0);
    localP = (p - boxP) / shrink;
    float box = sdBox(localP, vec3(0.5)) * shrink;
    
    // Cylinder - shrink around cylinder's center, then raise
    vec3 cylCenter = (cylA + cylB) * 0.5 + vec3(0.0, snowHeight, 0.0);
    localP = (p - cylCenter) / shrink;
    vec3 cylALocal = (cylA - (cylA + cylB) * 0.5) / shrink;
    vec3 cylBLocal = (cylB - (cylA + cylB) * 0.5) / shrink;
    float cyl = sdCylinderH(localP, cylALocal, cylBLocal, 0.15) * shrink;
    
    return min(min(sphere, box), cyl);
}

// Object C: Smooth union of A and B
float objectC(vec3 p) {
    float a = objectA(p);
    float b = objectB(p);
    return opSmoothUnion(a, b, 0.2);
}

// Combined SDF for raymarching (use C for the geometry)
float map(vec3 p) {
    return objectC(p);
}

// Determine material: 0 = object, 1 = snow
float getMaterial(vec3 p) {
    float a = objectA(p);
    float c = objectC(p);
    float threshold = 0.01;
    
    // If we're closer to C than to A, it's snow
    // (C extends beyond A due to the raised/shrunk union)
    if (c < a - threshold) {
        return 1.0; // Snow
    }
    return 0.0; // Original object
}

vec3 calcNormal(vec3 p) {
    const float h = 0.001;
    const vec2 k = vec2(1, -1);
    return normalize(
        k.xyy * map(p + k.xyy * h) +
        k.yyx * map(p + k.yyx * h) +
        k.yxy * map(p + k.yxy * h) +
        k.xxx * map(p + k.xxx * h)
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Camera
    float t = iTime * 0.3;
    vec3 ro = vec3(4.0 * cos(t), 2.0, 4.0 * sin(t));
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
    
    // Background
    vec3 col = vec3(0.4, 0.5, 0.7) - 0.3 * rd.y;
    
    if (hit) {
        vec3 n = calcNormal(p);
        
        // Get material
        float mat = getMaterial(p);
        
        // Base colors
        vec3 objectColor = vec3(0.2, 0.4, 0.8);  // Blue object
        vec3 snowColor = vec3(0.95, 0.97, 1.0);   // White snow
        
        vec3 baseColor = mix(objectColor, snowColor, mat);
        
        // Lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.3;
        
        // Specular (stronger for snow)
        vec3 viewDir = normalize(ro - p);
        vec3 reflDir = reflect(-lightDir, n);
        float spec = pow(max(dot(viewDir, reflDir), 0.0), 32.0);
        spec *= (mat > 0.5) ? 0.8 : 0.3;  // More specular on snow
        
        col = baseColor * (amb + diff * 0.7) + vec3(1.0) * spec;
        
        // Subtle blue tint in shadows for snow
        if (mat > 0.5) {
            col += vec3(0.1, 0.15, 0.3) * (1.0 - diff) * 0.3;
        }
    }
    
    // Gamma
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}

