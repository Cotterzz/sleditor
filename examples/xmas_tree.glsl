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

// Add these helper functions for domain repetition
vec3 opRepeatAngular(vec3 p, float n, out float sectorID) {
    float angle = atan(p.z, p.x);
    float sector = 6.28318 / n;
    sectorID = floor(angle / sector + 0.5);
    float a = mod(angle + sector * 0.5, sector) - sector * 0.5;
    return vec3(cos(a) * length(p.xz), p.y, sin(a) * length(p.xz));
}

vec3 opRepeatY(vec3 p, float spacing, out float tierID) {
    tierID = floor((p.y + spacing * 0.5) / spacing);
    return vec3(p.x, mod(p.y + spacing * 0.5, spacing) - spacing * 0.5, p.z);
}

// Optimized branch+needle distance function using domain repetition
float sdBranchWithNeedlesRepeated(vec3 p, out float matID, out vec3 cellID) {
    // Calculate tier info BEFORE repetition for tapering
    float tierSpacing = TRUNK_HEIGHT / BRANCH_TIERS;
    float absoluteTierY = floor((p.y + TRUNK_HEIGHT * 0.4) / tierSpacing);
    absoluteTierY = clamp(absoluteTierY, 0.0, BRANCH_TIERS - 1.0);
    float tierNorm = absoluteTierY / (BRANCH_TIERS - 1.0);
    
    // Apply angular repetition
    float sectorID;
    vec3 pRep = opRepeatAngular(p, BRANCHES_PER_TIER, sectorID);
    
    // Offset every other tier
    float tierOffset = mod(absoluteTierY, 2.0);
    if (tierOffset > 0.5) {
        pRep = opRepeatAngular(p - vec3(0, 0, 0), BRANCHES_PER_TIER * 2.0, sectorID);
        sectorID = sectorID * 2.0 + 1.0;
    }
    
    // Store cell ID for variation
    cellID = vec3(absoluteTierY, sectorID, 0.0);
    
    // Add variation per branch
    vec2 var = hash2(cellID.xy) - 0.5;
    
    // Calculate branch parameters
    float tierHeight = absoluteTierY * tierSpacing - TRUNK_HEIGHT * 0.4 + tierSpacing * 0.5;
    tierHeight += var.y * tierSpacing * 0.2;
    float branchLen = mix(TREE_BASE_RADIUS, TREE_TOP_RADIUS, tierNorm);
    
    // Transform to branch local space (branch extends in +X direction)
    float droopAngle = 0.3 + tierNorm * 0.2;
    vec3 branchStart = vec3(TRUNK_RADIUS, tierHeight, 0.0);
    
    vec3 toP = pRep - branchStart;
    
    // Rotate for droop
    float ca = cos(droopAngle);
    float sa = sin(droopAngle);
    vec3 localP = vec3(
        toP.x * ca + toP.y * sa,
        -toP.x * sa + toP.y * ca,
        toP.z
    );
    
    // Early exit if far from branch
    if (localP.x < -0.2 || localP.x > branchLen + NEEDLE_LEN + 0.2) {
        matID = -1.0;
        return 1e10;
    }
    if (abs(localP.y) > BRANCH_RADIUS + NEEDLE_LEN + 0.1 || 
        abs(localP.z) > BRANCH_RADIUS + NEEDLE_LEN + 0.1) {
        matID = -1.0;
        return 1e10;
    }
    
    // Branch cylinder distance
    float branchDist = length(localP.yz) - BRANCH_RADIUS;
    branchDist = max(branchDist, -localP.x);
    branchDist = max(branchDist, localP.x - branchLen);
    
    // Needle distance using domain repetition
    float needleDist = 1e10;
    
    float distFromAxis = length(localP.yz);
    if (distFromAxis > BRANCH_RADIUS * 0.3 && 
        distFromAxis < BRANCH_RADIUS + NEEDLE_LEN + 0.05 &&
        localP.x > -0.05 && localP.x < branchLen + NEEDLE_LEN) {
        
        // Grid in local space
        float cellX = round(localP.x / NEEDLE_SPACING_Y);
        float angle = atan(localP.y, localP.z);
        float cellA = round(angle / NEEDLE_SPACING_A);
        
        // Check fewer nearby cells for performance
        for (int dx = 0; dx <= 1; dx++) {
            for (int da = -1; da <= 1; da++) {
                float nx = (cellX + float(dx)) * NEEDLE_SPACING_Y;
                float na = (cellA + float(da)) * NEEDLE_SPACING_A;
                
                if (nx < 0.02 || nx > branchLen - 0.02) continue;
                
                vec2 id = vec2(cellX + float(dx), cellA + float(da));
                vec2 var2 = hash2(id + cellID.xy * 100.0) - 0.5;
                
                nx += var2.x * NEEDLE_SPACING_Y * 0.4;
                na += var2.y * NEEDLE_SPACING_A * 0.3;
                
                vec3 needleStart = vec3(nx, sin(na) * BRANCH_RADIUS, cos(na) * BRANCH_RADIUS);
                vec3 outDir = normalize(vec3(0.0, sin(na), cos(na)));
                vec3 needleDir = normalize(outDir + vec3(0.2, 0.0, 0.0));
                
                float av = (hash(id + 50.0) - 0.5) * 0.4;
                needleDir = normalize(needleDir + vec3(0.0, av, av * 0.3));
                
                vec3 toP2 = localP - needleStart;
                float t = clamp(dot(toP2, needleDir), 0.0, NEEDLE_LEN);
                vec3 closest = needleStart + needleDir * t;
                
                float taper = t / NEEDLE_LEN;
                float thick = mix(NEEDLE_BASE_THICK, NEEDLE_TIP_THICK, taper);
                
                needleDist = min(needleDist, length(localP - closest) - thick);
            }
        }
    }
    
    // Determine material
    if (needleDist < branchDist) {
        matID = 2.0; // Needle
        return needleDist;
    } else {
        matID = 1.0; // Branch
        return branchDist;
    }
}

// Optimized map function
float map(vec3 p) {
    float d = sdTrunk(p);
    
    // Only process branches within valid height range
    if (p.y > -TRUNK_HEIGHT * 0.5 && p.y < TRUNK_HEIGHT * 0.5) {
        float branchMat;
        vec3 cellID;
        float branchDist = sdBranchWithNeedlesRepeated(p, branchMat, cellID);
        d = min(d, branchDist);
    }
    
    return d;
}

// Optimized getMaterial
float getMaterial(vec3 p) {
    float trunk = sdTrunk(p);
    
    if (p.y > -TRUNK_HEIGHT * 0.5 && p.y < TRUNK_HEIGHT * 0.5) {
        float branchMat;
        vec3 cellID;
        float branchDist = sdBranchWithNeedlesRepeated(p, branchMat, cellID);
        
        if (branchDist < trunk - 0.001) {
            return branchMat;
        }
    }
    
    return 0.0; // Trunk
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

