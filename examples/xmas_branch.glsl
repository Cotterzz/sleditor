// Christmas Tree Branch - Pine Needles using Domain Repetition
// Needles radiate outward from a cylindrical branch

#define AA 1.0

// Branch parameters
const float BRANCH_RADIUS = 0.05;
const float BRANCH_LENGTH = 2.0;
const float NEEDLE_LENGTH = 0.4;
const float NEEDLE_BASE_THICKNESS = 0.012;
const float NEEDLE_TIP_THICKNESS = 0.002;
const float NEEDLE_SPACING = 0.08;  // Along branch
const float NEEDLE_ANGLE_SPACING = 0.5; // Radians around branch

// Colors
const vec3 NEEDLE_COLOR = vec3(0.1, 0.35, 0.1);
const vec3 NEEDLE_COLOR_VAR = vec3(0.05, 0.15, 0.05);
const vec3 BRANCH_COLOR = vec3(0.25, 0.15, 0.08);

// SDF for infinite cylinder along Y axis
float sdCylinderY(vec3 p, float r) {
    return length(p.xz) - r;
}

// SDF for capped cylinder (branch)
float sdBranch(vec3 p) {
    float d = sdCylinderY(p, BRANCH_RADIUS);
    // Cap at ends
    d = max(d, abs(p.y) - BRANCH_LENGTH * 0.5);
    return d;
}

// Hash for variation
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.78));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + 17.3));
}

// Get needle ID from position
vec2 getNeedleID(vec3 p) {
    float angle = atan(p.x, p.z);
    float y = p.y;
    
    vec2 gridCell = vec2(
        round(y / NEEDLE_SPACING),
        round(angle / NEEDLE_ANGLE_SPACING)
    );
    
    return gridCell;
}

// Distance to a single needle (line segment radiating outward)
float sdNeedle(vec3 p, vec3 needleStart, vec3 needleDir, float length) {
    // Project p onto needle line
    vec3 toP = p - needleStart;
    float t = clamp(dot(toP, needleDir) / length, 0.0, 1.0);
    vec3 closest = needleStart + needleDir * t * length;
    
    // Thickness tapers from base to tip
    float thickness = mix(NEEDLE_BASE_THICKNESS, NEEDLE_TIP_THICKNESS, t);
    
    return length(p - closest) - thickness;
}

// Distance to all needles using domain repetition
float sdNeedles(vec3 p) {
    // Only render needles near the branch
    float distFromAxis = length(p.xz);
    if (distFromAxis > BRANCH_RADIUS + NEEDLE_LENGTH + 0.1) return 1e10;
    if (distFromAxis < BRANCH_RADIUS * 0.5) return 1e10;
    
    // Get grid cell for this position
    float angle = atan(p.x, p.z);
    float y = p.y;
    
    // Check nearby cells
    float minDist = 1e10;
    
    for (int dy = -1; dy <= 1; dy++) {
        for (int da = -1; da <= 1; da++) {
            float cellY = round(y / NEEDLE_SPACING) + float(dy);
            float cellA = round(angle / NEEDLE_ANGLE_SPACING) + float(da);
            
            // Cell center
            float needleY = cellY * NEEDLE_SPACING;
            float needleAngle = cellA * NEEDLE_ANGLE_SPACING;
            
            // Skip if outside branch
            if (abs(needleY) > BRANCH_LENGTH * 0.5 - NEEDLE_SPACING) continue;
            
            // Add variation
            vec2 id = vec2(cellY, cellA);
            vec2 variation = hash2(id) - 0.5;
            needleY += variation.x * NEEDLE_SPACING * 0.3;
            needleAngle += variation.y * NEEDLE_ANGLE_SPACING * 0.2;
            
            // Needle starts at branch surface
            vec3 needleStart = vec3(
                sin(needleAngle) * BRANCH_RADIUS,
                needleY,
                cos(needleAngle) * BRANCH_RADIUS
            );
            
            // Needle points outward and slightly backward (toward branch tip)
            vec3 outward = normalize(vec3(sin(needleAngle), 0.0, cos(needleAngle)));
            vec3 needleDir = normalize(outward + vec3(0.0, -0.3, 0.0)); // Slight droop toward branch tip
            
            // Add slight random angle variation
            float angleVar = (hash(id + 100.0) - 0.5) * 0.3;
            needleDir = normalize(needleDir + vec3(angleVar, 0.0, angleVar * 0.5));
            
            float d = sdNeedle(p, needleStart, needleDir, NEEDLE_LENGTH);
            minDist = min(minDist, d);
        }
    }
    
    return minDist;
}

// Combined scene
float map(vec3 p) {
    float branch = sdBranch(p);
    float needles = sdNeedles(p);
    return min(branch, needles);
}

// Get material: 0 = branch, 1 = needle
float getMaterial(vec3 p) {
    float branch = sdBranch(p);
    float needles = sdNeedles(p);
    return (needles < branch) ? 1.0 : 0.0;
}

// Normal calculation
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

// Raymarch
vec3 raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    
    for (int i = 0; i < 150; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        if (d < 0.0005) {
            float mat = getMaterial(p);
            return vec3(t, mat, 1.0);
        }
        
        if (t > 20.0) break;
        t += d * 0.7;
    }
    
    return vec3(-1.0);
}

void mainImage0(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Camera
    float time = iTime * 0.3;
    float camDist = 3.0;
    vec3 ro = vec3(camDist * cos(time), 0.5, camDist * sin(time));
    vec3 target = vec3(0.0, 0.0, 0.0);
    
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);
    
    // Sky gradient
    vec3 col = mix(vec3(0.5, 0.7, 0.9), vec3(0.2, 0.4, 0.7), uv.y + 0.5);
    
    vec3 hit = raymarch(ro, rd);
    
    if (hit.x > 0.0) {
        vec3 p = ro + rd * hit.x;
        vec3 n = calcNormal(p);
        
        // Lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, -0.5));
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.3;
        
        // Specular
        vec3 viewDir = normalize(ro - p);
        vec3 reflDir = reflect(-lightDir, n);
        float spec = pow(max(dot(viewDir, reflDir), 0.0), 16.0);
        
        // Material color
        vec3 matCol;
        if (hit.y > 0.5) {
            // Needle - add variation
            vec2 id = getNeedleID(p);
            float var = hash(id);
            matCol = NEEDLE_COLOR + NEEDLE_COLOR_VAR * (var - 0.5);
            
            // Slight sheen on needles
            spec *= 0.5;
        } else {
            // Branch
            matCol = BRANCH_COLOR;
            spec *= 0.2;
        }
        
        col = matCol * (amb + diff * 0.7) + vec3(1.0) * spec * 0.3;
        
        // Simple AO approximation
        float ao = 1.0 - smoothstep(0.0, 0.3, length(p.xz));
        col *= 0.7 + 0.3 * ao;
    }
    
    // Gamma
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}

void mainImage(out vec4 o, vec2 u) {
    float s = AA;
    if (s <= 1.0) {
        mainImage0(o, u);
        return;
    }
    
    vec2 j = vec2(0.5);
    o = vec4(0);
    vec4 c;
    for (float k = s; k-- > 0.5; ) {
        mainImage0(c, u + j - 0.5);
        o += c;
        j = fract(j + vec2(0.755, 0.57).yx);
    }
    o /= s;
}

