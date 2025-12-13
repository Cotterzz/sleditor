// TRUE domain repetition version - single mandelbulb evaluation
// With mouse control and varied rotation per level

#define MAX_STEPS 100
#define MAX_DIST 100.0
#define SURF_DIST 0.001

// Configuration
const int TREE_LEVELS = 10;        // Number of mandelbulb levels
const float SCALE_FACTOR = 0.8;  // How much smaller each level gets
const float LEVEL_HEIGHT = 0.8;   // Vertical spacing between levels
const float MANDEL_ITER = 4.0;    // Mandelbulb iterations (lower = faster)

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

// Get normal
vec3 getNormal(vec3 p) {
    float d = distanceToTree(p);
    vec2 e = vec2(0.001, 0);
    
    vec3 n = d - vec3(
        distanceToTree(p - e.xyy),
        distanceToTree(p - e.yxy),
        distanceToTree(p - e.yyx));
    
    return normalize(n);
}

// Raymarching
float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = distanceToTree(p);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    
    return dO;
}

// Lighting
float getLight(vec3 p) {
    vec3 lightPos = vec3(2, 5, -3);
    vec3 l = normalize(lightPos - p);
    vec3 n = getNormal(p);
    
    float dif = clamp(dot(n, l), 0.0, 1.0);
    float d = rayMarch(p + n * SURF_DIST * 2.0, l);
    if (d < length(lightPos - p)) dif *= 0.1;
    
    return dif;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    uv/=1.5;uv.y+=0.1;
    // Camera setup - static position in front of tree
    vec3 ro = vec3(0, 2, -8);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.2, 1));
    
    float d = rayMarch(ro, rd);
    
    vec3 col = vec3(0.05, 0.05, 0.1); // Dark blue background
    
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        float dif = getLight(p);
        
        // Color based on height for tree effect
        float h = p.y + 1.5;
        vec3 treeColor = mix(vec3(0.1, 0.3, 0.05), vec3(0.05, 0.5, 0.1), h / 6.0);
        
        // Check if we hit the trunk
        if (p.y < -0.5 && length(p.xz) < 0.15) {
            treeColor = vec3(0.3, 0.15, 0.05); // Brown for trunk
        }
        
        col = treeColor * dif;
        
        // Add some ambient and rim lighting
        col += vec3(0.03, 0.05, 0.02) * (0.5 + 0.5 * getNormal(p).y);
        
        // Simple fog
        col = mix(col, vec3(0.05, 0.05, 0.1), 1.0 - exp(-0.001 * d * d));
    }
    
    // Gamma correction
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}