// TRUE domain repetition version - single mandelbulb evaluation
// With mouse control and varied rotation per level
// Now covered with pine needles (adapted from xmas_branch.glsl)

#define MAX_STEPS 100
#define MAX_DIST 100.0
#define SURF_DIST 0.001

// Configuration
const int   TREE_LEVELS   = 10;     // Number of mandelbulb levels
const float SCALE_FACTOR  = 0.8;    // How much smaller each level gets
const float LEVEL_HEIGHT  = 0.8;    // Vertical spacing between levels
const float MANDEL_ITER   = 4.0;    // Mandelbulb iterations (lower = faster)

// Needle parameters (from xmas_branch.glsl)
const float NEEDLE_LENGTH         = 0.35;
const float NEEDLE_BASE_THICKNESS = 0.012;
const float NEEDLE_TIP_THICKNESS  = 0.002;
const float NEEDLE_SPACING_Y      = 0.10;   // along height
const float NEEDLE_SPACING_A      = 0.45;   // around axis (radians)

// Colors
const vec3 NEEDLE_COLOR     = vec3(0.10, 0.35, 0.10);
const vec3 NEEDLE_COLOR_VAR = vec3(0.05, 0.15, 0.05);
const vec3 TRUNK_COLOR      = vec3(0.30, 0.15, 0.05);
const vec3 TREE_BASE_COLOR  = vec3(0.10, 0.30, 0.05);
const vec3 TREE_TOP_COLOR   = vec3(0.05, 0.50, 0.10);

// Rotation matrices
mat3 rotateY(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s, 0, c)
    );
}

// Hash helpers (from branch)
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.78));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + 17.3));
}

mat3 rotateX(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(1, 0, 0),
        vec3(0, c, -s),
        vec3(0, s, c)
    );
}

mat3 rotateZ(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, -s, 0),
        vec3(s, c, 0),
        vec3(0, 0, 1)
    );
}

// Simple Mandelbulb distance estimator
float mandelbulb(vec3 p, float power) {
    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    
    for (int i = 0; i < int(MANDEL_ITER); i++) {
        r = length(z);
        if (r > 2.0) break;
        
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        
        float zr = pow(r, power);
        theta = theta * power;
        phi = phi * power;
        
        z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
        z += p;
    }
    return 0.5 * log(r) * r / dr;
}

// TRUE domain repetition version
float distanceToTree(vec3 p) {
    // Get mouse input (normalized)
    vec2 mouse = iMouse.xy / iResolution.xy;
    
    // If mouse hasn't been clicked, use default values
    if (iMouse.z < 0.5) {
        mouse = vec2(0.5, 0.5);
    }
    
    // Convert mouse to rotation angles
    float baseRotationY = (mouse.x - 0.5) * 6.28318; // Full 360 degrees
    float baseRotationX = (mouse.y - 0.5) * 3.14159; // 180 degrees
    
    // Rotate the entire tree on its axis
    p = rotateY(iTime * 0.3) * p;
    
    // Map the point into a repeating fractal domain
    float accumulatedHeight = 0.0;
    float currentScale = 1.0;
    vec3 q = p;
    int currentLevel = 0;
    
    // Find which level and remap
    for (int i = 0; i < TREE_LEVELS; i++) {
        float nextHeight = accumulatedHeight + LEVEL_HEIGHT * currentScale;
        
        if (p.y < nextHeight) {
            currentLevel = i;
            // Map this Y-region to mandelbulb space
            q.y = (p.y - accumulatedHeight) / currentScale - LEVEL_HEIGHT * 0.5;
            q.xz = p.xz / currentScale;
            
            // Apply base rotation from mouse
            q = rotateX(baseRotationX) * q;
            q = rotateY(baseRotationY) * q;
            
            // Add varied rotation per level
            // Each level rotates differently for visual variety
            float levelRotY = float(i) * 0.7854; // 45 degrees per level
            float levelRotZ = sin(float(i) * 1.5) * 0.5; // Some Z wobble
            q = rotateY(levelRotY) * q;
            q = rotateZ(levelRotZ) * q;
            
            break;
        }
        
        accumulatedHeight = nextHeight;
        currentScale *= SCALE_FACTOR;
    }
    
    // Single mandelbulb evaluation
    float d = mandelbulb(q, 8.0) * currentScale;
    
    // Add a trunk (simple cylinder)
    float trunkDist = length(p.xz) - 0.1;
    trunkDist = max(trunkDist, p.y + 1.0);
    trunkDist = max(trunkDist, -p.y - 0.5);
    d = min(d, trunkDist);
    
    // Ground plane
    d = min(d, p.y + 1.5);
    
    return d;
}

// Tree-only normal
vec3 getTreeNormal(vec3 p) {
    float d = distanceToTree(p);
    vec2 e = vec2(0.001, 0);
    vec3 n = d - vec3(
        distanceToTree(p - e.xyy),
        distanceToTree(p - e.yxy),
        distanceToTree(p - e.yyx)
    );
    return normalize(n);
}

// Raymarching
vec2 rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    float mat = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = mapCombined(p, mat);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    
    return vec2(dO, mat);
}

// Needle SDF on top of the tree surface using a cylindrical grid (y, angle)
float sdNeedle(vec3 p, vec3 needleStart, vec3 needleDir, float len) {
    vec3 toP = p - needleStart;
    float t = clamp(dot(toP, needleDir) / len, 0.0, 1.0);
    vec3 closest = needleStart + needleDir * t * len;
    float thickness = mix(NEEDLE_BASE_THICKNESS, NEEDLE_TIP_THICKNESS, t);
    return length(p - closest) - thickness;
}

float needleField(vec3 p, float treeDist) {
    // Only evaluate near the surface
    if (treeDist > 0.15) return 1e5;

    // Approximate surface point and normal
    vec3 n = getTreeNormal(p);
    vec3 ps = p - n * treeDist;

    float angle = atan(ps.x, ps.z);
    float radius = length(ps.xz);
    float y = ps.y;
    if (radius < 0.05) return 1e5;

    float minDist = 1e5;
    for (int dy = -1; dy <= 1; dy++) {
        for (int da = -1; da <= 1; da++) {
            float cellY = round(y / NEEDLE_SPACING_Y) + float(dy);
            float cellA = round(angle / NEEDLE_SPACING_A) + float(da);

            float needleY = cellY * NEEDLE_SPACING_Y;
            float needleAngle = cellA * NEEDLE_SPACING_A;

            vec2 id = vec2(cellY, cellA);
            vec2 variation = hash2(id) - 0.5;
            needleY += variation.x * NEEDLE_SPACING_Y * 0.35;
            needleAngle += variation.y * NEEDLE_SPACING_A * 0.25;

            vec3 outward = normalize(vec3(sin(needleAngle), 0.0, cos(needleAngle)));
            float r = max(radius, 0.05);
            vec3 needleStart = vec3(
                sin(needleAngle) * r,
                needleY,
                cos(needleAngle) * r
            );

            vec3 needleDir = normalize(outward + vec3(0.0, -0.25, 0.0));
            float angleVar = (hash(id + 100.0) - 0.5) * 0.3;
            needleDir = normalize(needleDir + vec3(angleVar, 0.0, angleVar * 0.5));

            float d = sdNeedle(ps, needleStart, needleDir, NEEDLE_LENGTH);
            minDist = min(minDist, d);
        }
    }

    return minDist;
}

// Combined distance: min(tree, needles) returning mat id
float mapCombined(vec3 p, out float matId) {
    float dTree = distanceToTree(p);
    float dNeedle = needleField(p, dTree);
    if (dNeedle < dTree) {
        matId = 1.0; // needle
        return dNeedle;
    }
    matId = 0.0; // tree/trunk
    return dTree;
}

float mapDist(vec3 p) {
    float m;
    return mapCombined(p, m);
}

// Normal of combined field
vec3 getNormal(vec3 p) {
    float mat;
    float d = mapCombined(p, mat);
    vec2 e = vec2(0.001, 0);
    return normalize(vec3(
        mapDist(p + e.xyy) - d,
        mapDist(p + e.yxy) - d,
        mapDist(p + e.yyx) - d
    ));
}

// Raymarching with material
vec2 rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    float mat = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = mapCombined(p, mat);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    
    return vec2(dO, mat);
}

// Lighting
float getLight(vec3 p) {
    vec3 lightPos = vec3(2, 5, -3);
    vec3 l = normalize(lightPos - p);
    vec3 n = getNormal(p);
    
    float dif = clamp(dot(n, l), 0.0, 1.0);
    vec2 shadow = rayMarch(p + n * SURF_DIST * 2.0, l);
    if (shadow.x < length(lightPos - p)) dif *= 0.1;
    
    return dif;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    uv/=1.5;uv.y+=0.1;
    // Camera setup - static position in front of tree
    vec3 ro = vec3(0, 2, -8);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.2, 1));
    
    vec2 hit = rayMarch(ro, rd);
    float d = hit.x;
    float mat = hit.y;
    
    vec3 col = vec3(0.05, 0.05, 0.1); // Dark blue background
    
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        float dif = getLight(p);
        
        // Color based on height for tree effect
        float h = p.y + 1.5;
        vec3 treeColor = mix(TREE_BASE_COLOR, TREE_TOP_COLOR, clamp(h / 6.0, 0.0, 1.0));
        
        // Check if we hit the trunk
        if (p.y < -0.5 && length(p.xz) < 0.15) {
            treeColor = TRUNK_COLOR; // Brown for trunk
        }
        
        vec3 needleCol = NEEDLE_COLOR;
        if (mat > 0.5) {
            float a = atan(p.x, p.z);
            float cy = round(p.y / NEEDLE_SPACING_Y);
            float ca = round(a / NEEDLE_SPACING_A);
            vec2 id = vec2(cy, ca);
            needleCol += NEEDLE_COLOR_VAR * (hash(id) - 0.5);
        }
        
        vec3 baseCol = (mat > 0.5) ? needleCol : treeColor;
        
        // Lighting
        vec3 n = getNormal(p);
        vec3 colLit = baseCol * (0.3 + 0.7 * dif);
        // Rim
        colLit += vec3(0.03, 0.05, 0.02) * (0.5 + 0.5 * n.y);
        // Specular-ish
        vec3 lightPos = vec3(2,5,-3);
        vec3 l = normalize(lightPos - p);
        vec3 v = normalize(ro - p);
        vec3 hvec = normalize(l + v);
        float spec = pow(max(dot(n, hvec), 0.0), mat > 0.5 ? 8.0 : 4.0) * 0.2;
        colLit += vec3(spec);
        
        // Fog
        col = mix(colLit, vec3(0.05, 0.05, 0.1), 1.0 - exp(-0.001 * d * d));
    }
    
    // Gamma correction
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}