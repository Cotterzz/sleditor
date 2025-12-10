// Mandelbulb Christmas Tree with Pine Needles
// Performant version: raymarch tree first, then refine with needles locally
// Mouse drag to rotate the mandelbulb shape

#define MAX_STEPS 80
#define MAX_DIST 50.0
#define SURF_DIST 0.002

// Tree configuration
const int TREE_LEVELS = 10;
const float SCALE_FACTOR = 0.8;
const float LEVEL_HEIGHT = 0.8;
const float MANDEL_ITER = 4.0;

// Needle parameters
const float NEEDLE_LEN = 0.4;      // Long enough to poke through tree surface
const float NEEDLE_THICK = 0.008;
const float NEEDLE_SPACE_Y = 0.12;
const float NEEDLE_SPACE_A = 0.5;

// Colors
const vec3 COL_NEEDLE = vec3(0.12, 0.38, 0.12);
const vec3 COL_TRUNK = vec3(0.35, 0.18, 0.08);

// Simple hash
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.78));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

// Rotation matrices
mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,0,s, 0,1,0, -s,0,c);
}
mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1,0,0, 0,c,-s, 0,s,c);
}
mat3 rotZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,-s,0, s,c,0, 0,0,1);
}

// Mandelbulb
float mandelbulb(vec3 p, float power) {
    vec3 z = p;
    float dr = 1.0, r = 0.0;
    for (int i = 0; i < int(MANDEL_ITER); i++) {
        r = length(z);
        if (r > 2.0) break;
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        float zr = pow(r, power);
        theta *= power;
        phi *= power;
        z = zr * vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta));
        z += p;
    }
    return 0.5 * log(r) * r / dr;
}

// Tree SDF (no needles - fast)
float sdTree(vec3 p) {
    vec2 mouse = iMouse.xy / iResolution.xy;
    if (iMouse.z < 0.5) mouse = vec2(0.5, 0.5);
    float rotYBase = (mouse.x - 0.5) * 6.28318;
    float rotXBase = (mouse.y - 0.5) * 3.14159;
    
    p = rotY(iTime * 0.3) * p;
    
    float accH = 0.0, scale = 1.0;
    vec3 q = p;
    
    for (int i = 0; i < TREE_LEVELS; i++) {
        float nextH = accH + LEVEL_HEIGHT * scale;
        if (p.y < nextH) {
            q.y = (p.y - accH) / scale - LEVEL_HEIGHT * 0.5;
            q.xz = p.xz / scale;
            q = rotX(rotXBase) * q;
            q = rotY(rotYBase + float(i) * 0.7854) * q;
            q = rotZ(sin(float(i) * 1.5) * 0.5) * q;
            break;
        }
        accH = nextH;
        scale *= SCALE_FACTOR;
    }
    
    float d = mandelbulb(q, 8.0) * scale;
    
    // Trunk
    float trunk = length(p.xz) - 0.1;
    trunk = max(trunk, p.y + 1.0);
    trunk = max(trunk, -p.y - 0.5);
    d = min(d, trunk);
    
    // Ground
    d = min(d, p.y + 1.5);
    
    return d;
}

// Single needle SDF (capsule)
float sdNeedle(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r * (1.0 - h * 0.7); // taper
}

// Return radius for needle placement - follows tree shape approximately
float treeProfile(float y) {
    if (y < -0.5) return 0.1; // trunk region
    if (y > 5.0) return 0.1;
    
    // Match the mandelbulb's level structure more closely
    // Each level is about LEVEL_HEIGHT tall, gets smaller as we go up
    float levelIdx = floor(y / LEVEL_HEIGHT);
    float levelY = mod(y, LEVEL_HEIGHT);
    
    // Base radius shrinks with height (tree gets narrower at top)
    float baseR = 1.0 * pow(SCALE_FACTOR, levelIdx);
    
    // Bulge out in middle of each level (mandelbulb shape)
    float bulge = 0.4 * sin(levelY / LEVEL_HEIGHT * 3.14159);
    
    return max(0.08, baseR * (0.5 + bulge * 0.5));
}

// Check needle at a specific cell - returns distance
float needleAt(vec3 p, float cellY, float cellA) {
    float y = cellY * NEEDLE_SPACE_Y;
    float a = cellA * NEEDLE_SPACE_A;
    
    // Variation
    vec2 id = vec2(cellY, cellA);
    float hy = hash(id);
    float ha = hash(id + 17.0);
    y += (hy - 0.5) * NEEDLE_SPACE_Y * 0.4;
    a += (ha - 0.5) * NEEDLE_SPACE_A * 0.3;
    
    // Needle start on surface (use tree profile)
    float r = treeProfile(y);
    vec3 start = vec3(sin(a) * r, y, cos(a) * r);
    
    // Needle direction: outward with varied angles to break silhouette
    vec3 outDir = normalize(vec3(sin(a), 0.0, cos(a)));
    float vertVar = (hash(id + 50.0) - 0.3) * 0.6;  // More vertical variation
    float sideVar = (hash(id + 80.0) - 0.5) * 0.4;  // Side-to-side variation
    vec3 side = vec3(cos(a), 0.0, -sin(a));  // Perpendicular to outDir
    vec3 dir = normalize(outDir + vec3(0, vertVar, 0) + side * sideVar);
    vec3 end = start + dir * NEEDLE_LEN;
    
    return sdNeedle(p, start, end, NEEDLE_THICK);
}

// Needle field - check current cell + neighbors (optimized: only 3x3 in the local area)
float sdNeedles(vec3 p) {
    // Apply same rotation as tree
    p = rotY(iTime * 0.3) * p;
    
    // Wide bounds - needles can extend well beyond tree core
    float r = length(p.xz);
    if (r > 3.0) return 1e5;  // Only cull far outside
    if (p.y < -0.8 || p.y > 6.0) return 1e5;
    
    float a = atan(p.x, p.z);
    float y = p.y;
    
    float cellY = round(y / NEEDLE_SPACE_Y);
    float cellA = round(a / NEEDLE_SPACE_A);
    
    float minD = 1e5;
    
    // Check 3x3 neighborhood
    for (int dy = -1; dy <= 1; dy++) {
        for (int da = -1; da <= 1; da++) {
            float d = needleAt(p, cellY + float(dy), cellA + float(da));
            minD = min(minD, d);
        }
    }
    
    return minD;
}

// Combined SDF for final refinement
float map(vec3 p) {
    float tree = sdTree(p);
    
    // Compute needles in a larger region so they can extend beyond tree outline
    if (tree > NEEDLE_LEN + 0.1) return tree;
    
    float needles = sdNeedles(p);
    return min(tree, needles);
}

// Get material: 0=tree/ground, 1=needle, 2=trunk
float getMat(vec3 p) {
    // Ground
    if (p.y < -1.4) return 0.0;
    
    // Trunk check (in rotated space)
    vec3 pr = rotY(iTime * 0.3) * p;
    if (pr.y < -0.5 && pr.y > -1.0 && length(pr.xz) < 0.15) return 2.0;
    
    float tree = sdTree(p);
    float needles = sdNeedles(p);
    return (needles < tree) ? 1.0 : 0.0;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0);
    float d = map(p);
    return normalize(vec3(
        map(p + e.xyy) - d,
        map(p + e.yxy) - d,
        map(p + e.yyx) - d
    ));
}

// Two-phase raymarch: coarse until near tree, then fine with needles
float raymarch(vec3 ro, vec3 rd, out float mat) {
    float t = 0.0;
    mat = 0.0;
    
    // Phase 1: Fast march using tree only, but switch to fine when NEAR tree (not just hitting it)
    for (int i = 0; i < 60; i++) {
        vec3 p = ro + rd * t;
        float d = sdTree(p);
        if (d < NEEDLE_LEN + 0.1) break; // Close enough that needles might be present
        if (t > MAX_DIST) return MAX_DIST;
        t += d;
    }
    
    // Phase 2: Fine march with needles - start a bit back to catch extending needles
    float tStart = max(0.0, t - NEEDLE_LEN - 0.2);
    t = tStart;
    for (int i = 0; i < 60; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        if (d < SURF_DIST) {
            mat = getMat(p);
            return t;
        }
        if (t > MAX_DIST) return MAX_DIST;
        t += d * 0.7;
    }
    
    return MAX_DIST;
}

float softShadow(vec3 ro, vec3 rd, float k) {
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 24; i++) {
        float d = sdTree(ro + rd * t); // Shadow from tree only (fast)
        res = min(res, k * d / t);
        t += clamp(d, 0.02, 0.2);
        if (t > 8.0) break;
    }
    return clamp(res, 0.1, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    uv /= 1.5;
    uv.y += 0.1;
    
    vec3 ro = vec3(0, 2, -8);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.2, 1));
    
    float mat;
    float t = raymarch(ro, rd, mat);
    
    vec3 col = vec3(0.02, 0.03, 0.08); // Night sky
    
    if (t < MAX_DIST) {
        vec3 p = ro + rd * t;
        vec3 n = getNormal(p);
        
        vec3 lightDir = normalize(vec3(2, 5, -3) - p);
        float diff = max(dot(n, lightDir), 0.0);
        float shadow = softShadow(p + n * 0.02, lightDir, 8.0);
        
        // Material color
        vec3 baseCol;
        vec3 pr = rotY(iTime * 0.3) * p;  // Rotated coords for consistent coloring
        if (mat > 1.5) {
            baseCol = COL_TRUNK;
        } else if (mat > 0.5) {
            // Needle with variation (use rotated coords)
            float a = atan(pr.x, pr.z);
            float y = pr.y;
            vec2 id = vec2(round(y / NEEDLE_SPACE_Y), round(a / NEEDLE_SPACE_A));
            float var = hash(id);
            baseCol = COL_NEEDLE * (0.8 + 0.4 * var);
        } else {
            // Tree/ground
            float h = pr.y + 1.5;
            baseCol = mix(vec3(0.1, 0.3, 0.05), vec3(0.08, 0.45, 0.12), clamp(h / 5.0, 0.0, 1.0));
            if (p.y < -1.4) baseCol = vec3(0.15, 0.12, 0.1); // ground
        }
        
        // Lighting
        float amb = 0.15;
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.2;
        col = baseCol * (amb + diff * shadow * 0.85) + rim * vec3(0.1, 0.15, 0.1);
        
        // Fog
        col = mix(col, vec3(0.02, 0.03, 0.08), 1.0 - exp(-0.003 * t * t));
    }
    
    // Gamma
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}

