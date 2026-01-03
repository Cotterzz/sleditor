// Sand simulation - Buffer A
// Simplified version preserving original functionality

float random(vec2 st) { 
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123); 
}

// Helper: check if pixel is empty (no material)
bool isEmpty(vec4 c) { return (c.r + c.g + c.b) == 0.0; }

// Helper: check if pixel contains falling material
bool isFalling(vec4 c) { return c.g > 0.0; }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    const float border = 2.0;
    ivec2 p = ivec2(fragCoord);
    
    // Border check
    bool isEdge = fragCoord.x < border || fragCoord.x > iResolution.x - border ||
                  fragCoord.y < border || fragCoord.y > iResolution.y - border;
    
    // Fetch current pixel and all 8 neighbors
    vec4 c   = texelFetch(iChannel0, p, 0);
    vec4 cU  = texelFetch(iChannel0, p + ivec2( 0,  1), 0);
    vec4 cD  = texelFetch(iChannel0, p + ivec2( 0, -1), 0);
    vec4 cL  = texelFetch(iChannel0, p + ivec2(-1,  0), 0);
    vec4 cR  = texelFetch(iChannel0, p + ivec2( 1,  0), 0);
    vec4 cUR = texelFetch(iChannel0, p + ivec2( 1,  1), 0);
    vec4 cDR = texelFetch(iChannel0, p + ivec2( 1, -1), 0);
    vec4 cUL = texelFetch(iChannel0, p + ivec2(-1,  1), 0);
    vec4 cDL = texelFetch(iChannel0, p + ivec2(-1, -1), 0);
    
    // State queries
    bool empty = isEmpty(c),    emptyU = isEmpty(cU),   emptyD = isEmpty(cD);
    bool emptyL = isEmpty(cL),  emptyR = isEmpty(cR);
    bool emptyUR = isEmpty(cUR), emptyDR = isEmpty(cDR);
    bool emptyUL = isEmpty(cUL), emptyDL = isEmpty(cDL);
    
    bool fall = isFalling(c),    fallU = isFalling(cU),   fallD = isFalling(cD);
    bool fallL = isFalling(cL),  fallR = isFalling(cR);
    bool fallUR = isFalling(cUR), fallDR = isFalling(cDR);
    bool fallUL = isFalling(cUL), fallDL = isFalling(cDL);
    
    vec4 out_c = c;
    
    // Color blending between adjacent falling particles
    if (fall) {
        if (fallR)  out_c = mix(out_c, cR,  0.02);
        if (fallDR) out_c = mix(out_c, cDR, 0.04);
        if (fallDL) out_c = mix(out_c, cDL, 0.04);
        if (fallD)  out_c = mix(out_c, cD,  0.02);
    }
    
    // Diagonal slide: upper-left falls into empty space
    if (empty && emptyU && !emptyL && fallUL) out_c = cUL;
    // Counterpart: falling particle slides down-right
    if (fall && emptyDR && emptyR && !emptyD) out_c = cDR;
    
    // Diagonal slide: upper-right falls into empty space
    if (empty && emptyU && !emptyR && fallUR) out_c = cUR;
    // Counterpart: falling particle slides down-left
    if (fall && emptyDL && emptyL && !emptyD) out_c = cDL;
    
    // Vertical fall: particle above falls into empty space
    if (empty && fallU) out_c = cU;
    // Counterpart: falling particle leaves, replaced by empty below
    if (fall && emptyD) out_c = cD;
    
    // Border is solid red
    if (isEdge) out_c = vec4(1.0, 0.0, 0.0, 1.0);
    
    // Convert new spawned sand (bright red) to natural sand colors
    if (out_c.r > 250.0/256.0 && !isEdge) {
        out_c = vec4(
            0.60 + random(fragCoord * iTime) * 0.3,
            0.40 + random(fragCoord.yx * iTime) * 0.5,
            0.0, 1.0
        );
    }
    
    // Mouse spawns sand
    if (iMouse.z > 0.0 && distance(iMouse.xy, fragCoord) < 10.0) {
        out_c = vec4(1.0, 1.0, 0.0, 1.0);
    }
    
    fragColor = out_c;
}

