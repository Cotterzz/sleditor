// Christmas Tree - Cone with Needle Domain Repetition
// Needles radiate from a conical tree shape

// Tree shape parameters
const float TREE_HEIGHT = 2.0;
const float TREE_BASE_RADIUS = 0.8;
const float TREE_TIP_RADIUS = 0.01;
const float TRUNK_RADIUS = 0.06;
const float TRUNK_HEIGHT = 0.4;

// Surface undulation parameters
const float UNDULATION_AMOUNT = 0.3;    // Random wave undulation amount

// Branch parameters (on top of undulation)
const float BRANCH_TIERS = 20.0;          // Number of vertical branch rings
const float BRANCHES_PER_TIER = 30.0;     // Branches around trunk per tier
const float BRANCH_BULGE = 0.2;         // How far branches stick out
const float BRANCH_WIDTH = 0.1;          // Angular width of each branch (0-1)

// Needle parameters  
const float NEEDLE_LENGTH = 0.1;
const float NEEDLE_BASE_THICK = 0.008;
const float NEEDLE_TIP_THICK = 0.003;
const float NEEDLE_SPACING_Y = 0.01;    // Vertical spacing
const float NEEDLE_SPACING_A = 0.01;    // Angular spacing (radians)

// Colors
const vec3 NEEDLE_COLOR = vec3(0.08, 0.28, 0.08);
const vec3 NEEDLE_COLOR_VAR = vec3(0.04, 0.15, 0.04);
const vec3 TRUNK_COLOR = vec3(0.3, 0.18, 0.1);

// Hash functions
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.78));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + 17.3));
}

// SDF: Capped cylinder along Y
float sdCappedCylinderY(vec3 p, float r, float h) {
    float d = length(p.xz) - r;
    return max(d, abs(p.y) - h);
}

// Bounding cone - simple, undistorted, slightly larger than tree
float sdBoundingCone(vec3 p) {
    float t = clamp(p.y / TREE_HEIGHT, 0.0, 1.0);
    // Slightly larger than tree + branches + undulation + needle length
    float r = mix(TREE_BASE_RADIUS, TREE_TIP_RADIUS, t) + BRANCH_BULGE + UNDULATION_AMOUNT + NEEDLE_LENGTH + 0.05;
    
    float distFromAxis = length(p.xz);
    float d = distFromAxis - r;
    
    // Cap top and bottom
    d = max(d, -p.y - 0.05);
    d = max(d, p.y - TREE_HEIGHT - 0.05);
    
    return d;
}

// Branch bulge - creates distinct branch protrusions
float getBranchBulge(float y, float angle) {
    // Vertical position in tiers
    float tierSpacing = TREE_HEIGHT / BRANCH_TIERS;
    float tierPhase = y / tierSpacing;
    
    // Smooth bump centered on each tier
    float vertBump = 0.5 + 0.5 * cos(tierPhase * 6.28318 - 3.14159);
    vertBump = pow(vertBump, 2.0); // Sharpen the bump
    
    // Angular position - branches around trunk
    float angularFreq = BRANCHES_PER_TIER;
    // Offset alternating tiers
    float tierOffset = mod(floor(tierPhase), 2.0) * 3.14159 / angularFreq;
    float angBump = 0.5 + 0.5 * cos((angle + tierOffset) * angularFreq);
    angBump = pow(angBump, 1.0 / BRANCH_WIDTH); // Control branch width
    
    // Combine: branch exists where both bumps are high
    float bulge = vertBump * angBump;
    
    // Reduce bulge near tip
    float heightFade = 1.0 - pow(y / TREE_HEIGHT, 2.0);
    
    return bulge * BRANCH_BULGE * heightFade;
}

// Sum of sines for smooth organic surface undulation
// Like ocean waves - adds organic randomness on top of branches
float getWaveUndulation(float y, float angle) {
    float undulation = 0.0;
    
    // Wave 1: Primary vertical waves
    undulation += 0.35 * sin(y * 12.0 + angle * 3.0);
    
    // Wave 2: Secondary angular pattern
    undulation += 0.25 * sin(angle * 7.0 + y * 5.0 + 1.3);
    
    // Wave 3: Diagonal pattern
    undulation += 0.2 * sin(y * 8.0 - angle * 5.0 + 2.7);
    
    // Wave 4: Higher frequency detail
    undulation += 0.12 * sin(angle * 13.0 + y * 15.0 + 0.5);
    
    // Wave 5: Another diagonal for more chaos
    undulation += 0.08 * sin(y * 20.0 + angle * 11.0 + 4.1);
    
    // Reduce near tip and base
    float heightFade = 1.0 - pow(y / TREE_HEIGHT, 1.5);
    float baseFade = smoothstep(0.0, 0.15, y / TREE_HEIGHT);
    
    return undulation * UNDULATION_AMOUNT * heightFade * baseFade;
}

// Combined surface distortion: branches + organic waves
float getSurfaceUndulation(float y, float angle) {
    float branches = getBranchBulge(y, angle);
    float waves = getWaveUndulation(y, angle);
    
    return branches + waves;
}

// Get the cone radius at a given height and angle (with random undulation)
float coneRadiusAt(float y, float angle) {
    float t = clamp(y / TREE_HEIGHT, 0.0, 1.0);
    float baseR = mix(TREE_BASE_RADIUS, TREE_TIP_RADIUS, t);
    
    // Add random surface undulation
    float undulation = getSurfaceUndulation(y, angle);
    
    return baseR + undulation;
}

// Overload for when we don't have angle (use average)
float coneRadiusAt(float y) {
    float t = clamp(y / TREE_HEIGHT, 0.0, 1.0);
    return mix(TREE_BASE_RADIUS, TREE_TIP_RADIUS, t) + BRANCH_BULGE * 0.5 + UNDULATION_AMOUNT * 0.3;
}

// Simple cone with branch distortion
float sdTreeCone(vec3 p) {
    float angle = atan(p.x, p.z);
    
    // Cone radius at this height with branch bulge
    float r = coneRadiusAt(p.y, angle);
    
    // Distance to distorted cone surface
    float distFromAxis = length(p.xz);
    float d = distFromAxis - r;
    
    // Cap top and bottom
    d = max(d, -p.y);                    // Below base
    d = max(d, p.y - TREE_HEIGHT);       // Above tip
    
    return d;
}

// Trunk: below y=0
float sdTrunk(vec3 p) {
    vec3 tp = p + vec3(0.0, TRUNK_HEIGHT * 0.5, 0.0);
    return sdCappedCylinderY(tp, TRUNK_RADIUS, TRUNK_HEIGHT * 0.5);
}

// Get distorted cone surface normal direction (outward) at a point
vec3 coneNormalAt(float y, float angle) {
    // Base cone angle
    float coneAngle = atan(TREE_BASE_RADIUS - TREE_TIP_RADIUS, TREE_HEIGHT);
    
    // Outward direction in XZ plane
    vec2 outXZ = vec2(sin(angle), cos(angle));
    
    // Sample nearby points to estimate normal of distorted surface
    float eps = 0.02;
    float r0 = coneRadiusAt(y, angle);
    float rY = coneRadiusAt(y + eps, angle);
    float rA = coneRadiusAt(y, angle + eps);
    
    // Gradient in Y and angle directions
    float dRdY = (rY - r0) / eps;
    float dRdA = (rA - r0) / eps;
    
    // Adjust normal based on surface slope
    vec3 normal = normalize(vec3(
        outXZ.x - dRdA * outXZ.y * 0.1,
        -dRdY * 0.5,
        outXZ.y + dRdA * outXZ.x * 0.1
    ));
    
    // Blend with basic outward direction
    return normalize(normal + vec3(outXZ.x, 0.2, outXZ.y) * 0.5);
}

// Distance to a single needle
float sdNeedle(vec3 p, vec3 start, vec3 dir, float len) {
    vec3 toP = p - start;
    float t = clamp(dot(toP, dir), 0.0, len);
    vec3 closest = start + dir * t;
    
    float taper = t / len;
    float thick = mix(NEEDLE_BASE_THICK, NEEDLE_TIP_THICK, taper);
    
    return length(p - closest) - thick;
}

// Needles covering the cone surface - 9-cell neighbor approach
float sdNeedles(vec3 p) {
    // Quick bounds check - be generous to avoid culling visible needles
    float distFromAxis = length(p.xz);
    float maxR = TREE_BASE_RADIUS + UNDULATION_AMOUNT + NEEDLE_LENGTH + 0.2;
    if (distFromAxis > maxR) return 1e10;
    if (p.y < -0.1 || p.y > TREE_HEIGHT + 0.1) return 1e10;
    
    // Too close to center axis (inside the tree)
    float angle = atan(p.x, p.z);
    float coneR = coneRadiusAt(p.y, angle);
    if (distFromAxis < coneR - NEEDLE_LENGTH * 0.3) return 1e10;
    
    // Grid coordinates
    angle = atan(p.x, p.z);
    
    float cellY = round(p.y / NEEDLE_SPACING_Y);
    float cellA = round(angle / NEEDLE_SPACING_A);
    
    float minDist = 1e10;
    
    // Check 9 neighboring cells
    for (int dy = -1; dy <= 1; dy++) {
        for (int da = -1; da <= 1; da++) {
            float ny = (cellY + float(dy)) * NEEDLE_SPACING_Y;
            float na = (cellA + float(da)) * NEEDLE_SPACING_A;
            
            // Skip if outside tree
            if (ny < NEEDLE_SPACING_Y || ny > TREE_HEIGHT - NEEDLE_SPACING_Y * 0.5) continue;
            
            // Cell ID for variation
            vec2 id = vec2(cellY + float(dy), cellA + float(da));
            vec2 var = hash2(id) - 0.5;
            
            // Add variation to position
            ny += var.x * NEEDLE_SPACING_Y * 0.4;
            na += var.y * NEEDLE_SPACING_A * 0.3;
            
            // Cone radius at this height and angle (with branch distortion)
            float r = coneRadiusAt(ny, na);
            
            // Needle starts on cone surface
            vec3 needleStart = vec3(
                sin(na) * r,
                ny,
                cos(na) * r
            );
            
            // Needle points outward from cone (along surface normal direction)
            vec3 needleDir = coneNormalAt(ny, na);
            
            // Add random angle variation
            float av = (hash(id + 50.0) - 0.5) * 0.4;
            float av2 = (hash(id + 80.0) - 0.5) * 0.3;
            needleDir = normalize(needleDir + vec3(av * 0.3, av2, av * 0.3));
            
            float d = sdNeedle(p, needleStart, needleDir, NEEDLE_LENGTH);
            minDist = min(minDist, d);
        }
    }
    
    return minDist;
}

// Combined scene
float map(vec3 p) {
    // Early exit if outside bounding cone - big speedup!
    float bounds = sdBoundingCone(p);
    if (bounds > 0.1) return bounds;
    
    float cone = sdTreeCone(p);
    float trunk = sdTrunk(p);
    float needles = sdNeedles(p);
    
    // Clip needles to bounding cone (removes stray pixels)
    needles = max(needles, bounds);
    
    // Tree is cone + trunk, plus needles
    return min(min(cone, trunk), needles);
}

// Material: 0 = trunk, 1 = cone (inner tree), 2 = needles
float getMaterial(vec3 p) {
    float bounds = sdBoundingCone(p);
    float cone = sdTreeCone(p);
    float trunk = sdTrunk(p);
    float needles = max(sdNeedles(p), bounds); // Clip to bounds
    
    float minD = min(min(cone, trunk), needles);
    
    if (abs(needles - minD) < 0.001) return 2.0;
    if (abs(trunk - minD) < 0.001) return 0.0;
    return 1.0; // cone
}

vec3 calcNormal(vec3 p) {
    const float h = 0.0005;
    const vec2 k = vec2(1, -1);
    return normalize(
        k.xyy * map(p + k.xyy * h) +
        k.yyx * map(p + k.yyx * h) +
        k.yxy * map(p + k.yxy * h) +
        k.xxx * map(p + k.xxx * h)
    );
}

vec3 raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    
    for (int i = 0; i < 150; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        if (d < 0.0003) {
            return vec3(t, getMaterial(p), float(i));
        }
        
        if (t > 20.0) break;
        t += d * 0.7;
    }
    
    return vec3(-1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Camera orbits the tree
    float time = iTime * 0.25;
    float camDist = 4.0;
    float camHeight = 1.0;
    vec3 ro = vec3(camDist * cos(time), camHeight, camDist * sin(time));
    vec3 target = vec3(0.0, TREE_HEIGHT * 0.4, 0.0);
    
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);
    
    // Night sky
    vec3 col = mix(vec3(0.5, 0.4, 0.3), vec3(0.02, 0.04, 0.1), uv.y + 0.5);
    
    // Stars
    vec2 starUV = fragCoord / 2.5;
    float star = hash(floor(starUV));
    if (star > 0.995 && uv.y > -0.1) {
        col += vec3(0.7, 0.75, 0.8) * (star - 0.995) * 200.0;
    }
    
    vec3 hit = raymarch(ro, rd);
    
    if (hit.x > 0.0) {
        vec3 p = ro + rd * hit.x;
        vec3 n = calcNormal(p);
        
        // Lighting
        vec3 lightDir = normalize(vec3(0.4, 1.0, -0.3));
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.25;
        
        // Rim light
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        
        vec3 matCol;
        float spec = 0.0;
        
        if (hit.y > 1.5) {
            // Needles
            float angle = atan(p.x, p.z);
            vec2 id = vec2(floor(p.y / NEEDLE_SPACING_Y), floor(angle / NEEDLE_SPACING_A));
            float var = hash(id);
            matCol = NEEDLE_COLOR + NEEDLE_COLOR_VAR * (var - 0.5);
            spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 8.0) * 0.15;
                col = matCol * (amb + diff * 0.75) + vec3(1.0, 0.95, 0.9) * spec;
        col += vec3(0.1, 0.15, 0.2) * rim * 0.2;
        
        } else if (hit.y < 0.5) {
            // Trunk
            matCol = TRUNK_COLOR;
        } else {
            // Inner cone (shouldn't see much of this)
            col = vec3(0.0,0.05,0.0);
        }
        

        
        // Distance fog
        float fog = 1.0 - exp(-hit.x * 0.06);
        col = mix(col, vec3(0.05, 0.06, 0.12), fog);
    }
    
    // Ground hint
    if (rd.y < 0.0) {
        float t = -ro.y / rd.y;
        if (t > 0.0 && t < 15.0) {
            vec3 gp = ro + rd * t;
            float gd = length(gp.xz);
            if (gd < 2.5) {
                float shadow = smoothstep(2.0, 0.3, gd);
                col = mix(col, vec3(0.02, 0.03, 0.05), shadow * 0.4);
            }
        }
    }
    
    // Vignette
    vec2 q = fragCoord / iResolution.xy;
    col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.25);
    
    // Gamma
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}
