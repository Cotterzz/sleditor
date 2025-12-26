// Space Background for Shadertoy Cubemap A Buffer
// Put this in "Cubemap A" buffer, then sample it in your main shader with:
//   texture(iChannel0, rayDirection)
//
// This only renders on frame 0, then is cached by Shadertoy.
// Based on space.glsl, uses 3D noise for seamless sphere mapping.

// ============================================
// 3D NOISE - seamless on sphere, no seams!
// ============================================

float hash3(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

// 3D value noise - naturally seamless when sampling by direction
float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);  // Smoothstep
    
    return mix(
        mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
            mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
            mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

// 3D FBM - completely seamless
float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {  // 5 octaves (was 6, slightly faster)
        value += amplitude * noise3(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// ============================================
// STARS - triplanar projection, fixed blending
// ============================================

// 2D hash for star grid
float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float metaDiamond(vec2 p, vec2 pixel, float r) {
    vec2 d = abs(p - pixel);
    return r / (d.x + d.y + 0.001);
}

// Generate stars on one projection plane
vec3 starsOnPlane(vec2 uv, vec2 cellOffset) {
    vec3 col = vec3(0.0);
    vec2 grid = floor(uv);
    
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 cell = grid + vec2(x, y) + cellOffset;
            vec2 starPos = cell + vec2(hash2(cell), hash2(cell.yx)) - 0.5;
            float starSize = hash2(cell * 1.5) * 0.008;
            float brightness = metaDiamond(uv, starPos, starSize);
            vec3 tint = vec3(1.0, 0.95, 0.9) + 0.1 * vec3(
                hash2(cell * 2.0) - 0.5,
                hash2(cell * 3.0) - 0.5,
                hash2(cell * 4.0) - 0.5
            );
            col += tint * brightness;
        }
    }
    return col;
}

vec3 generateStars(vec3 dir) {
    dir = normalize(dir);
    vec3 starColor = vec3(0.0);
    
    // Blend weights - use squared instead of pow 4 for gentler falloff
    vec3 blend = abs(dir);
    blend = blend * blend;  // Gentler than pow 4
    blend /= (blend.x + blend.y + blend.z + 0.001);
    
    // Always check all three planes with ANY contribution
    // Stars on YZ plane (X-facing)
    {
        vec2 uv = dir.yz * sign(dir.x) * 8.0;
        starColor += starsOnPlane(uv, vec2(0.0, 0.0)) * blend.x;
    }
    
    // Stars on XZ plane (Y-facing)
    {
        vec2 uv = dir.xz * sign(dir.y) * 8.0;
        starColor += starsOnPlane(uv, vec2(100.0, 0.0)) * blend.y;
    }
    
    // Stars on XY plane (Z-facing)
    {
        vec2 uv = dir.xy * sign(dir.z) * 8.0;
        starColor += starsOnPlane(uv, vec2(0.0, 100.0)) * blend.z;
    }
    
    return starColor;
}

// ============================================
// NEBULA - 3D noise, completely seamless
// ============================================

vec3 generateNebula(vec3 dir) {
    dir = normalize(dir);
    
    // Sample 3D noise directly from direction - no seams!
    vec3 p = dir * 2.0;
    
    float q = fbm3(p * 1.5);
    float r = fbm3(p + q + vec3(1.7, 9.2, 3.1));
    float f = fbm3(p + r * 0.5);
    
    f = pow(f, 2.5);
    
    // Rich nebula colors - purples, pinks, and hints of orange
    vec3 nebulaColor = mix(vec3(0.05, 0.0, 0.1), vec3(0.5, 0.1, 0.4), f * 2.0);
    nebulaColor = mix(nebulaColor, vec3(0.7, 0.2, 0.5), q * 0.8);
    nebulaColor = mix(nebulaColor, vec3(0.9, 0.5, 0.2), r * 0.4);
    nebulaColor = mix(nebulaColor, vec3(0.3, 0.1, 0.4), smoothstep(0.3, 0.7, f));
    
    // Build up the glow
    nebulaColor = nebulaColor * f * f + nebulaColor * f * 0.5;
    
    // Subtle base tint
    nebulaColor += vec3(0.02, 0.0, 0.03);
    
    return nebulaColor;
}

// ============================================
// GALACTIC BAND - 3D noise, seamless
// ============================================

vec3 generateGalacticBand(vec3 dir) {
    dir = normalize(dir);
    
    // Band along the XZ plane (y = 0)
    float bandDist = abs(dir.y);
    float band = smoothstep(0.4, 0.0, bandDist);
    
    // Variation using 3D noise - no seams
    float variation = fbm3(dir * 3.0) * 0.5 + 0.5;
    band *= variation;
    
    // Pinkish-purple glow
    vec3 bandColor = mix(vec3(0.4, 0.1, 0.3), vec3(0.6, 0.2, 0.4), variation);
    
    return bandColor * band * 0.4;
}

// ============================================
// CUBEMAP MAIN - renders once on frame 0
// ============================================

void mainCubemap(out vec4 fragColor, in vec2 fragCoord, in vec3 rayOri, in vec3 rayDir) {
    // BUFFERING: Only render on first frame, Shadertoy caches the result!
    // After frame 0, this buffer is static and free to sample.
    if (iFrame > 0) {
        fragColor = textureLod(iChannel0, rayDir, 0.0);  // Return cached
        return;
    }
    
    // rayDir is provided by Shadertoy for cubemap buffers
    vec3 dir = rayDir;
    
    // Generate space background for this direction
    vec3 stars = generateStars(dir);
    vec3 nebula = generateNebula(dir);
    vec3 galactic = generateGalacticBand(dir);
    
    vec3 finalColor = nebula + galactic + stars;
    
    // Slight color grade - boost the pink/purple
    finalColor *= vec3(1.0, 0.92, 1.15);
    
    fragColor = vec4(finalColor, 1.0);
}

// ============================================
// TEST MODE - for previewing without cubemap buffer
// Comment out when using as actual Cubemap A
// ============================================

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Simulate cubemap sampling with mouse-controlled direction
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    float rotX = iTime * 0.05;
    float rotY = 1.57;  // Look at horizon for galactic band
    if (iMouse.z > 0.0) {
        rotX = (iMouse.x / iResolution.x) * 6.28;
        rotY = (iMouse.y / iResolution.y) * 3.14;
    }
    
    vec3 camDir = vec3(cos(rotX) * sin(rotY), cos(rotY), sin(rotX) * sin(rotY));
    vec3 camRight = normalize(cross(camDir, vec3(0, 1, 0)));
    vec3 camUp = cross(camRight, camDir);
    
    vec3 dir = normalize(uv.x * camRight + uv.y * camUp + camDir * 1.5);
    
    // Call the cubemap function (iFrame check disabled in test mode)
    vec3 stars = generateStars(dir);
    vec3 nebula = generateNebula(dir);
    vec3 galactic = generateGalacticBand(dir);
    
    vec3 finalColor = nebula + galactic + stars;
    finalColor *= vec3(1.0, 0.92, 1.15);
    
    fragColor = vec4(finalColor, 1.0);
}
