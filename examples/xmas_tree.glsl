// Christmas Tree - Pine Needles using Domain Repetition
// Full tree with tiered branches, each covered in needles

#define AA 1.0

// Tree parameters
const float TRUNK_RADIUS = 0.08;
const float TRUNK_HEIGHT = 2.5;
const float TREE_BASE_RADIUS = 1.2;  // Branch reach at bottom
const float TREE_TOP_RADIUS = 0.1;   // Branch reach at top

// Branch parameters
const float BRANCH_RADIUS = 0.03;
const float BRANCH_TIERS = 8.0;      // Number of vertical tiers
const float BRANCHES_PER_TIER = 8.0; // Branches around trunk per tier

// Needle parameters
const float NEEDLE_LEN = 0.15;
const float NEEDLE_BASE_THICK = 0.008;
const float NEEDLE_TIP_THICK = 0.001;
const float NEEDLE_SPACING_Y = 0.04;
const float NEEDLE_SPACING_A = 0.4;

// Colors
const vec3 NEEDLE_COLOR = vec3(0.08, 0.28, 0.08);
const vec3 NEEDLE_COLOR_VAR = vec3(0.04, 0.12, 0.04);
const vec3 BRANCH_COLOR = vec3(0.25, 0.15, 0.08);
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

float hash3(vec3 p) {
    return hash(vec2(hash(p.xy), p.z));
}

// SDF primitives
float sdCylinderY(vec3 p, float r) {
    return length(p.xz) - r;
}

float sdCappedCylinderY(vec3 p, float r, float h) {
    float d = sdCylinderY(p, r);
    return max(d, abs(p.y) - h);
}

// Trunk
float sdTrunk(vec3 p) {
    return sdCappedCylinderY(p, TRUNK_RADIUS, TRUNK_HEIGHT * 0.5);
}

// Get branch info for a position
// Returns: vec4(branchLocalPos.xyz, branchLength)
vec4 getBranchInfo(vec3 p, out vec3 branchID) {
    // Which tier are we near?
    float tierSpacing = TRUNK_HEIGHT / BRANCH_TIERS;
    float tierY = floor((p.y + TRUNK_HEIGHT * 0.4) / tierSpacing);
    
    // Clamp to valid tiers
    tierY = clamp(tierY, 0.0, BRANCH_TIERS - 1.0);
    
    // Height of this tier on trunk
    float tierHeight = tierY * tierSpacing - TRUNK_HEIGHT * 0.4 + tierSpacing * 0.5;
    
    // Branch length decreases toward top (cone shape)
    float tierNorm = tierY / (BRANCH_TIERS - 1.0);
    float branchLen = mix(TREE_BASE_RADIUS, TREE_TOP_RADIUS, tierNorm);
    
    // Which branch around the trunk?
    float angle = atan(p.x, p.z);
    float angleSpacing = 6.28318 / BRANCHES_PER_TIER;
    
    // Offset alternating tiers
    float tierOffset = mod(tierY, 2.0) * angleSpacing * 0.5;
    float branchAngle = floor((angle + tierOffset) / angleSpacing) * angleSpacing - tierOffset;
    
    branchID = vec3(tierY, floor((angle + tierOffset) / angleSpacing), 0.0);
    
    // Add variation
    vec2 var = hash2(branchID.xy) - 0.5;
    branchAngle += var.x * angleSpacing * 0.2;
    float branchHeight = tierHeight + var.y * tierSpacing * 0.2;
    
    // Branch direction (outward and slightly down)
    float droopAngle = 0.3 + tierNorm * 0.2; // More droop at top
    vec3 branchDir = normalize(vec3(
        sin(branchAngle) * cos(droopAngle),
        -sin(droopAngle),
        cos(branchAngle) * cos(droopAngle)
    ));
    
    // Branch start point on trunk
    vec3 branchStart = vec3(
        sin(branchAngle) * TRUNK_RADIUS,
        branchHeight,
        cos(branchAngle) * TRUNK_RADIUS
    );
    
    // Transform p to branch local space
    // Branch local: X along branch, Y up, Z tangent
    vec3 branchRight = branchDir;
    vec3 branchUp = normalize(cross(branchDir, vec3(-branchDir.z, 0.0, branchDir.x)));
    vec3 branchForward = cross(branchRight, branchUp);
    
    vec3 toP = p - branchStart;
    vec3 localP = vec3(
        dot(toP, branchRight),
        dot(toP, branchUp),
        dot(toP, branchForward)
    );
    
    return vec4(localP, branchLen);
}

// Distance to branch cylinder (in local space)
float sdBranchLocal(vec3 localP, float branchLen) {
    // Cylinder along X axis
    float d = length(localP.yz) - BRANCH_RADIUS;
    d = max(d, -localP.x); // Cap at start
    d = max(d, localP.x - branchLen); // Cap at end
    return d;
}

// Distance to needles on a branch (in local space)
float sdNeedlesLocal(vec3 localP, float branchLen, vec3 branchID) {
    // Only near the branch
    if (localP.x < -0.05 || localP.x > branchLen + NEEDLE_LEN) return 1e10;
    float distFromAxis = length(localP.yz);
    if (distFromAxis > BRANCH_RADIUS + NEEDLE_LEN + 0.05) return 1e10;
    if (distFromAxis < BRANCH_RADIUS * 0.3) return 1e10;
    
    // Grid in local space
    float cellX = round(localP.x / NEEDLE_SPACING_Y);
    float angle = atan(localP.y, localP.z);
    float cellA = round(angle / NEEDLE_SPACING_A);
    
    float minDist = 1e10;
    
    // Check nearby cells
    for (int dx = -1; dx <= 1; dx++) {
        for (int da = -1; da <= 1; da++) {
            float nx = (cellX + float(dx)) * NEEDLE_SPACING_Y;
            float na = (cellA + float(da)) * NEEDLE_SPACING_A;
            
            if (nx < 0.02 || nx > branchLen - 0.02) continue;
            
            // Variation
            vec2 id = vec2(cellX + float(dx), cellA + float(da));
            vec3 fullID = vec3(branchID.xy, hash(id));
            vec2 var = hash2(id + branchID.xy * 100.0) - 0.5;
            
            nx += var.x * NEEDLE_SPACING_Y * 0.4;
            na += var.y * NEEDLE_SPACING_A * 0.3;
            
            // Needle start on branch surface
            vec3 needleStart = vec3(
                nx,
                sin(na) * BRANCH_RADIUS,
                cos(na) * BRANCH_RADIUS
            );
            
            // Needle direction: outward from branch axis, slightly toward tip
            vec3 outDir = normalize(vec3(0.0, sin(na), cos(na)));
            vec3 needleDir = normalize(outDir + vec3(0.2, 0.0, 0.0)); // Slight forward angle
            
            // Add random angle variation
            float av = (hash(id + 50.0) - 0.5) * 0.4;
            needleDir = normalize(needleDir + vec3(0.0, av, av * 0.3));
            
            // Distance to needle
            vec3 toP = localP - needleStart;
            float t = clamp(dot(toP, needleDir), 0.0, NEEDLE_LEN);
            vec3 closest = needleStart + needleDir * t;
            
            float taper = t / NEEDLE_LEN;
            float thick = mix(NEEDLE_BASE_THICK, NEEDLE_TIP_THICK, taper);
            
            float d = length(localP - closest) - thick;
            minDist = min(minDist, d);
        }
    }
    
    return minDist;
}

// Full scene - check multiple nearby branches
float map(vec3 p) {
    float d = sdTrunk(p);
    
    // Check several tiers
    float tierSpacing = TRUNK_HEIGHT / BRANCH_TIERS;
    float baseTier = floor((p.y + TRUNK_HEIGHT * 0.4) / tierSpacing);
    
    for (int dt = -1; dt <= 1; dt++) {
        float tierY = baseTier + float(dt);
        if (tierY < 0.0 || tierY >= BRANCH_TIERS) continue;
        
        // Check several branches in this tier
        float angleSpacing = 6.28318 / BRANCHES_PER_TIER;
        float angle = atan(p.x, p.z);
        float tierOffset = mod(tierY, 2.0) * angleSpacing * 0.5;
        float baseBranch = floor((angle + tierOffset) / angleSpacing);
        
        for (int da = -1; da <= 1; da++) {
            // Reconstruct branch for this cell
            float branchIdx = baseBranch + float(da);
            float tierHeight = tierY * tierSpacing - TRUNK_HEIGHT * 0.4 + tierSpacing * 0.5;
            float tierNorm = tierY / (BRANCH_TIERS - 1.0);
            float branchLen = mix(TREE_BASE_RADIUS, TREE_TOP_RADIUS, tierNorm);
            
            float branchAngle = branchIdx * angleSpacing - tierOffset;
            vec2 var = hash2(vec2(tierY, branchIdx)) - 0.5;
            branchAngle += var.x * angleSpacing * 0.2;
            float branchHeight = tierHeight + var.y * tierSpacing * 0.2;
            
            float droopAngle = 0.3 + tierNorm * 0.2;
            vec3 branchDir = normalize(vec3(
                sin(branchAngle) * cos(droopAngle),
                -sin(droopAngle),
                cos(branchAngle) * cos(droopAngle)
            ));
            
            vec3 branchStart = vec3(
                sin(branchAngle) * TRUNK_RADIUS,
                branchHeight,
                cos(branchAngle) * TRUNK_RADIUS
            );
            
            vec3 branchRight = branchDir;
            vec3 branchUp = normalize(cross(branchDir, vec3(-branchDir.z, 0.0, branchDir.x)));
            vec3 branchForward = cross(branchRight, branchUp);
            
            vec3 toP = p - branchStart;
            vec3 localP = vec3(
                dot(toP, branchRight),
                dot(toP, branchUp),
                dot(toP, branchForward)
            );
            
            vec3 branchID = vec3(tierY, branchIdx, 0.0);
            
            float branch = sdBranchLocal(localP, branchLen);
            float needles = sdNeedlesLocal(localP, branchLen, branchID);
            
            d = min(d, min(branch, needles));
        }
    }
    
    return d;
}

// Material: 0 = trunk, 1 = branch, 2 = needle
float getMaterial(vec3 p) {
    float trunk = sdTrunk(p);
    
    float minBranch = 1e10;
    float minNeedle = 1e10;
    
    float tierSpacing = TRUNK_HEIGHT / BRANCH_TIERS;
    float baseTier = floor((p.y + TRUNK_HEIGHT * 0.4) / tierSpacing);
    
    for (int dt = -1; dt <= 1; dt++) {
        float tierY = baseTier + float(dt);
        if (tierY < 0.0 || tierY >= BRANCH_TIERS) continue;
        
        float angleSpacing = 6.28318 / BRANCHES_PER_TIER;
        float angle = atan(p.x, p.z);
        float tierOffset = mod(tierY, 2.0) * angleSpacing * 0.5;
        float baseBranch = floor((angle + tierOffset) / angleSpacing);
        
        for (int da = -1; da <= 1; da++) {
            float branchIdx = baseBranch + float(da);
            float tierHeight = tierY * tierSpacing - TRUNK_HEIGHT * 0.4 + tierSpacing * 0.5;
            float tierNorm = tierY / (BRANCH_TIERS - 1.0);
            float branchLen = mix(TREE_BASE_RADIUS, TREE_TOP_RADIUS, tierNorm);
            
            float branchAngle = branchIdx * angleSpacing - tierOffset;
            vec2 var = hash2(vec2(tierY, branchIdx)) - 0.5;
            branchAngle += var.x * angleSpacing * 0.2;
            float branchHeight = tierHeight + var.y * tierSpacing * 0.2;
            
            float droopAngle = 0.3 + tierNorm * 0.2;
            vec3 branchDir = normalize(vec3(
                sin(branchAngle) * cos(droopAngle),
                -sin(droopAngle),
                cos(branchAngle) * cos(droopAngle)
            ));
            
            vec3 branchStart = vec3(
                sin(branchAngle) * TRUNK_RADIUS,
                branchHeight,
                cos(branchAngle) * TRUNK_RADIUS
            );
            
            vec3 branchRight = branchDir;
            vec3 branchUp = normalize(cross(branchDir, vec3(-branchDir.z, 0.0, branchDir.x)));
            vec3 branchForward = cross(branchRight, branchUp);
            
            vec3 toP = p - branchStart;
            vec3 localP = vec3(
                dot(toP, branchRight),
                dot(toP, branchUp),
                dot(toP, branchForward)
            );
            
            vec3 branchID = vec3(tierY, branchIdx, 0.0);
            
            minBranch = min(minBranch, sdBranchLocal(localP, branchLen));
            minNeedle = min(minNeedle, sdNeedlesLocal(localP, branchLen, branchID));
        }
    }
    
    float minD = min(trunk, min(minBranch, minNeedle));
    if (abs(minNeedle - minD) < 0.001) return 2.0;
    if (abs(minBranch - minD) < 0.001) return 1.0;
    return 0.0;
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

vec3 raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    
    for (int i = 0; i < 200; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        if (d < 0.0003) {
            return vec3(t, getMaterial(p), 1.0);
        }
        
        if (t > 25.0) break;
        t += d * 0.6;
    }
    
    return vec3(-1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Camera - orbit around tree
    float time = iTime * 0.2;
    float camDist = 4.5;
    float camHeight = 0.8;
    vec3 ro = vec3(camDist * cos(time), camHeight, camDist * sin(time));
    vec3 target = vec3(0.0, 0.3, 0.0);
    
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);
    
    // Sky
    vec3 col = mix(vec3(0.1, 0.15, 0.3), vec3(0.02, 0.05, 0.15), uv.y + 0.5);
    
    // Stars
    vec2 starUV = fragCoord / 3.0;
    float star = hash(floor(starUV));
    if (star > 0.997 && uv.y > -0.2) {
        col += vec3(0.8) * (star - 0.997) * 300.0;
    }
    
    vec3 hit = raymarch(ro, rd);
    
    if (hit.x > 0.0) {
        vec3 p = ro + rd * hit.x;
        vec3 n = calcNormal(p);
        
        // Lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, -0.3));
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.25;
        
        // Rim light
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        
        vec3 matCol;
        float spec = 0.0;
        
        if (hit.y > 1.5) {
            // Needles
            matCol = NEEDLE_COLOR + NEEDLE_COLOR_VAR * (hash(p.xy * 100.0) - 0.5);
            spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 8.0) * 0.2;
        } else if (hit.y > 0.5) {
            // Branch
            matCol = BRANCH_COLOR;
            spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 4.0) * 0.1;
        } else {
            // Trunk
            matCol = TRUNK_COLOR;
        }
        
        col = matCol * (amb + diff * 0.7) + vec3(1.0, 0.95, 0.9) * spec;
        col += vec3(0.1, 0.15, 0.2) * rim * 0.3;
        
        // Distance fog
        float fog = 1.0 - exp(-hit.x * 0.08);
        col = mix(col, vec3(0.05, 0.08, 0.15), fog);
    }
    
    // Ground plane hint
    if (rd.y < 0.0) {
        float t = -ro.y / rd.y;
        if (t > 0.0 && t < 20.0) {
            vec3 groundP = ro + rd * t;
            float groundDist = length(groundP.xz);
            if (groundDist < 3.0) {
                float shadow = smoothstep(1.5, 0.3, groundDist);
                col = mix(col, vec3(0.02, 0.03, 0.05), shadow * 0.5 * (1.0 - smoothstep(15.0, 20.0, t)));
            }
        }
    }
    
    // Vignette
    vec2 q = fragCoord / iResolution.xy;
    col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.2);
    
    // Gamma
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}

