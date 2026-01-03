// ============================================================================
// Cornell Box Lightmap Path Tracer - Buffer A (Lightmap Accumulation)
// ============================================================================
// Instead of tracing from camera, we trace from each surface texel.
// This builds a lightmap that can be looked up from any camera angle.
//
// Texture layout (760x480) - 10px padding around each face:
//   Room surfaces (220x220 each):
//     (10,10)    Floor       surfaceID 0
//     (10,250)   Ceiling     surfaceID 1
//     (250,10)   Wall 2      surfaceID 2 (red)
//     (250,250)  Wall 3      surfaceID 3
//     (490,250)  Wall 4      surfaceID 4 (back)
//   
//   Tall box (100x60 rectangles for sides, 60x60 for top):
//     (490,10)   Front       surfaceID 5
//     (490,90)   Left        surfaceID 6
//     (490,170)  Right       surfaceID 7
//     (610,10)   Top         surfaceID 8
//   
//   Short box (60x60 each):
//     (610,90)   Front       surfaceID 9
//     (690,90)   Left        surfaceID 10
//     (610,170)  Right       surfaceID 11
//     (690,170)  Top         surfaceID 12
//   
//   Light (40x40):
//     (690,20)   Light       surfaceID 13
// ============================================================================

#define SAMPLES_PER_FRAME 2

// Random number generation
vec4 gSeed;

float hash(vec4 p) {
    p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p += dot(p, p.wzxy + 33.33);
    return fract((p.x + p.y) * (p.z + p.w));
}

float random() {
    gSeed.w += 1.0;
    return hash(gSeed);
}

vec3 randomHemisphere(vec3 n) {
    float r1 = random();
    float r2 = random();
    float phi = 6.28318 * r1;
    float st = sqrt(r2);
    float ct = sqrt(1.0 - r2);
    vec3 dir = vec3(cos(phi) * st, sin(phi) * st, ct);
    
    vec3 up = abs(n.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitangent = cross(n, tangent);
    
    return tangent * dir.x + bitangent * dir.y + n * dir.z;
}

// Normal encoding
float encodeNormal(vec3 n) {
    float ax = abs(n.x); float ay = abs(n.y); float az = abs(n.z);
    if (ax > ay && ax > az) return sign(n.x) * 1.0;
    if (ay > az) return sign(n.y) * 2.0;
    return sign(n.z) * 3.0;
}

vec3 decodeNormal(float e) {
    float ae = abs(e); float s = sign(e);
    if (ae < 1.5) return vec3(s, 0.0, 0.0);
    if (ae < 2.5) return vec3(0.0, s, 0.0);
    return vec3(0.0, 0.0, s);
}

// Scene intersection with optional box shrink for floor shadow fix
// boxShrink: amount to shrink box footprint (x/z only) - use ~0.02 for floor texels
vec4 intersectScene(vec3 ro, vec3 rd, float boxShrink) {
    float tMin = 1e10;
    float matID = -1.0;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    float t; vec3 p;
    
    // Floor
    if (abs(rd.y) > 0.0001) {
        t = -ro.y / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
                tMin = t; normal = vec3(0.0, 1.0, 0.0); matID = 0.0;
            }
        }
    }
    // Ceiling
    if (abs(rd.y) > 0.0001) {
        t = (2.0 - ro.y) / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
                tMin = t; normal = vec3(0.0, -1.0, 0.0); matID = 0.0;
            }
        }
    }
    // Back wall
    if (abs(rd.z) > 0.0001) {
        t = (-1.0 - ro.z) / rd.z;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t; normal = vec3(0.0, 0.0, 1.0); matID = 0.0;
            }
        }
    }
    // Left wall (RED)
    if (abs(rd.x) > 0.0001) {
        t = (-1.0 - ro.x) / rd.x;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t; normal = vec3(1.0, 0.0, 0.0); matID = 1.0;
            }
        }
    }
    // Right wall (GREEN)
    if (abs(rd.x) > 0.0001) {
        t = (1.0 - ro.x) / rd.x;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t; normal = vec3(-1.0, 0.0, 0.0); matID = 2.0;
            }
        }
    }
    // Light
    if (abs(rd.y) > 0.0001) {
        t = (1.98 - ro.y) / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 0.3 && abs(p.z) < 0.3) {
                tMin = t; normal = vec3(0.0, -1.0, 0.0); matID = 3.0;
            }
        }
    }
    // Tall box - with optional shrink on x/z for floor shadow alignment
    vec3 b1min = vec3(-0.8 + boxShrink, -0.01, -0.65 + boxShrink);
    vec3 b1max = vec3(-0.25 - boxShrink, 1.2, -0.1 - boxShrink);
    vec3 t1 = (b1min - ro) / rd; vec3 t2 = (b1max - ro) / rd;
    vec3 tmin = min(t1, t2); vec3 tmax = max(t1, t2);
    float tnear = max(max(tmin.x, tmin.y), tmin.z);
    float tfar = min(min(tmax.x, tmax.y), tmax.z);
    if (tnear < tfar && tnear > 0.001 && tnear < tMin) {
        tMin = tnear; p = ro + rd * tnear;
        vec3 c = (b1min + b1max) * 0.5; vec3 d = (b1max - b1min) * 0.5;
        vec3 lp = (p - c) / d;
        if (abs(lp.x) > 0.999) normal = vec3(sign(lp.x), 0.0, 0.0);
        else if (abs(lp.y) > 0.999) normal = vec3(0.0, sign(lp.y), 0.0);
        else normal = vec3(0.0, 0.0, sign(lp.z));
        matID = 0.0;
    }
    // Short box - with optional shrink on x/z for floor shadow alignment
    vec3 b2min = vec3(0.2 + boxShrink, -0.01, 0.0 + boxShrink);
    vec3 b2max = vec3(0.75 - boxShrink, 0.6, 0.55 - boxShrink);
    t1 = (b2min - ro) / rd; t2 = (b2max - ro) / rd;
    tmin = min(t1, t2); tmax = max(t1, t2);
    tnear = max(max(tmin.x, tmin.y), tmin.z);
    tfar = min(min(tmax.x, tmax.y), tmax.z);
    if (tnear < tfar && tnear > 0.001 && tnear < tMin) {
        tMin = tnear; p = ro + rd * tnear;
        vec3 c = (b2min + b2max) * 0.5; vec3 d = (b2max - b2min) * 0.5;
        vec3 lp = (p - c) / d;
        if (abs(lp.x) > 0.999) normal = vec3(sign(lp.x), 0.0, 0.0);
        else if (abs(lp.y) > 0.999) normal = vec3(0.0, sign(lp.y), 0.0);
        else normal = vec3(0.0, 0.0, sign(lp.z));
        matID = 0.0;
    }
    
    return vec4(tMin, matID, encodeNormal(normal), 0.0);
}

// Convenience wrapper for normal intersection (no shrink)
vec4 intersectScene(vec3 ro, vec3 rd) {
    return intersectScene(ro, rd, 0.0);
}

vec3 getMaterial(float id) {
    if (id < 0.5) return vec3(0.73);
    if (id < 1.5) return vec3(0.65, 0.05, 0.05);
    if (id < 2.5) return vec3(0.12, 0.45, 0.15);
    return vec3(0.0);
}

// =============================================================================
// TEXTURE ATLAS MAPPING
// Map pixel coordinates to 3D surface position and normal
// The atlas is scaled to fit the buffer while maintaining aspect ratio
// =============================================================================

// Atlas base size (from faces2.svg.txt layout)
const vec2 ATLAS_SIZE = vec2(760.0, 480.0);

// Returns: xyz = world position, w = surface ID (-1 if not on a surface)
vec4 getWorldPosition(vec2 fragCoord) {
    // Scale factor to fit atlas in buffer (uniform scaling)
    float scale = min(iResolution.x / ATLAS_SIZE.x, iResolution.y / ATLAS_SIZE.y);
    
    // Convert buffer coordinates to atlas coordinates
    float x = fragCoord.x / scale;
    float y = fragCoord.y / scale;
    
    // Padding amount (10px around each marked face)
    const float PAD = 10.0;
    
    // =========================================================================
    // Room surfaces (220x220 each, +10px padding = 240x240 render area)
    // Clamp UV to [0,1] so padding pixels use edge world positions
    // =========================================================================
    float cva = 0.01;
    float cvb = 0.99;
    // Floor (10,10) 220x220 + padding -> render from (0,0) to (240,240)
    if (x >= 0.0 && x < 240.0 && y >= 0.0 && y < 240.0) {
        vec2 uv = clamp(vec2(x - 10.0, y - 10.0) / 220.0, cva, cvb);
        return vec4((uv.x * 2.0 - 1.0), 0.0, (uv.y * 2.0 - 1.0), 0.0);
    }
    // Ceiling (10,250) 220x220 + padding -> render from (0,240) to (240,480)
    if (x >= 0.0 && x < 240.0 && y >= 240.0 && y < 480.0) {
        vec2 uv = clamp(vec2(x - 10.0, y - 250.0) / 220.0,  cva, cvb);
        return vec4((uv.x * 2.0 - 1.0), 1.999, (uv.y * 2.0 - 1.0), 1.0);
    }
    // Wall 2 (250,10) 220x220 + padding -> render from (240,0) to (480,240)
    if (x >= 240.0 && x < 480.0 && y >= 0.0 && y < 240.0) {
        vec2 uv = clamp(vec2(x - 250.0, y - 10.0) / 220.0, cva, cvb);
        return vec4(-0.999, uv.y * 2.0, (uv.x * 2.0 - 1.0), 2.0);
    }
    // Wall 3 (250,250) 220x220 + padding -> render from (240,240) to (480,480)
    if (x >= 240.0 && x < 480.0 && y >= 240.0 && y < 480.0) {
        vec2 uv = clamp(vec2(x - 250.0, y - 250.0) / 220.0,  cva, cvb);
        return vec4(0.999, uv.y * 2.0, (uv.x * 2.0 - 1.0), 3.0);
    }
    // Wall 4/Back (490,250) 220x220 + padding -> render from (480,240) to (720,480)
    if (x >= 480.0 && x < 720.0 && y >= 240.0 && y < 480.0) {
        vec2 uv = clamp(vec2(x - 490.0, y - 250.0) / 220.0,   cva, cvb);
        return vec4((uv.x * 2.0 - 1.0), uv.y * 2.0, -0.999, 4.0);
    }
    
    // =========================================================================
    // Tall box: x in [-0.8, -0.25], y in [0, 1.2], z in [-0.65, -0.1]
    // Rectangles 100x60 for sides + padding, 60x60 for top + padding
    // Clamp UV so padding uses edge positions
    // =========================================================================
    
    // Tall box front (490,10) 100x60 + padding -> render from (480,0) to (600,80)
    if (x >= 480.0 && x < 600.0 && y >= 0.0 && y < 80.0) {
        vec2 uv = clamp(vec2(x - 490.0, y - 10.0) / vec2(100.0, 60.0),   cva, cvb);
        float px = -0.8 + uv.x * 0.55;
        float py = uv.y * 1.2;
        return vec4(px, py, -0.099, 5.0);
    }
    // Tall box left (490,90) 100x60 + padding -> render from (480,80) to (600,160)
    if (x >= 480.0 && x < 600.0 && y >= 80.0 && y < 160.0) {
        vec2 uv = clamp(vec2(x - 490.0, y - 90.0) / vec2(100.0, 60.0), cva, cvb);
        float pz = -0.65 + uv.x * 0.55;
        float py = uv.y * 1.2;
        return vec4(-0.801, py, pz, 6.0);
    }
    // Tall box right (490,170) 100x60 + padding -> render from (480,160) to (600,240)
    if (x >= 480.0 && x < 600.0 && y >= 160.0 && y < 240.0) {
        vec2 uv = clamp(vec2(x - 490.0, y - 170.0) / vec2(100.0, 60.0), cva, cvb);
        float pz = -0.65 + uv.x * 0.55;
        float py = uv.y * 1.2;
        return vec4(-0.249, py, pz, 7.0);
    }
    // Tall box top (610,10) 60x60 + padding -> render from (600,0) to (680,80)
    if (x >= 600.0 && x < 680.0 && y >= 0.0 && y < 80.0) {
        vec2 uv = clamp(vec2(x - 610.0, y - 10.0) / 60.0,  cva, cvb);
        float px = -0.8 + uv.x * 0.55;
        float pz = -0.65 + uv.y * 0.55;
        return vec4(px, 1.201, pz, 8.0);
    }
    
    // =========================================================================
    // Short box: x in [0.2, 0.75], y in [0, 0.6], z in [0.0, 0.55]
    // 60x60 squares + padding, clamp UV
    // =========================================================================
    
    // Short box front (610,90) 60x60 + padding -> render from (600,80) to (680,160)
    if (x >= 600.0 && x < 680.0 && y >= 80.0 && y < 160.0) {
        vec2 uv = clamp(vec2(x - 610.0, y - 90.0) / 60.0,   cva, cvb);
        float px = 0.2 + uv.x * 0.55;
        float py = uv.y * 0.6;
        return vec4(px, py, 0.551, 9.0);
    }
    // Short box left (690,90) 60x60 + padding -> render from (680,80) to (760,160)
    if (x >= 680.0 && x < 760.0 && y >= 80.0 && y < 160.0) {
        vec2 uv = clamp(vec2(x - 690.0, y - 90.0) / 60.0,  cva, cvb);
        float pz = 0.0 + uv.x * 0.55;
        float py = uv.y * 0.6;
        return vec4(0.199, py, pz, 10.0);
    }
    // Short box right (610,170) 60x60 + padding -> render from (600,160) to (680,240)
    if (x >= 600.0 && x < 680.0 && y >= 160.0 && y < 240.0) {
        vec2 uv = clamp(vec2(x - 610.0, y - 170.0) / 60.0,  cva, cvb);
        float pz = 0.0 + uv.x * 0.55;
        float py = uv.y * 0.6;
        return vec4(0.751, py, pz, 11.0);
    }
    // Short box top (690,170) 60x60 + padding -> render from (680,160) to (760,240)
    if (x >= 680.0 && x < 760.0 && y >= 160.0 && y < 240.0) {
        vec2 uv = clamp(vec2(x - 690.0, y - 170.0) / 60.0,  cva, cvb);
        float px = 0.2 + uv.x * 0.55;
        float pz = 0.0 + uv.y * 0.55;
        return vec4(px, 0.601, pz, 12.0);
    }
    
    // =========================================================================
    // Light (690,20) 40x40 + padding -> render from (680,10) to (740,70)
    // =========================================================================
    if (x >= 680.0 && x < 740.0 && y >= 10.0 && y < 70.0) {
        vec2 uv = clamp(vec2(x - 690.0, y - 20.0) / 40.0,  cva, cvb);
        float px = (uv.x - 0.5) * 0.6;
        float pz = (uv.y - 0.5) * 0.6;
        return vec4(px, 1.98, pz, 13.0);
    }
    
    return vec4(0.0, 0.0, 0.0, -1.0);
}

vec3 getSurfaceNormal(float surfaceID) {
    if (surfaceID < 0.5) return vec3(0.0, 1.0, 0.0);   // Floor up
    if (surfaceID < 1.5) return vec3(0.0, -1.0, 0.0);  // Ceiling down
    if (surfaceID < 2.5) return vec3(1.0, 0.0, 0.0);   // Left wall
    if (surfaceID < 3.5) return vec3(-1.0, 0.0, 0.0);  // Right wall
    if (surfaceID < 4.5) return vec3(0.0, 0.0, 1.0);   // Back wall
    if (surfaceID < 5.5) return vec3(0.0, 0.0, 1.0);   // Tall box front
    if (surfaceID < 6.5) return vec3(-1.0, 0.0, 0.0);  // Tall box left
    if (surfaceID < 7.5) return vec3(1.0, 0.0, 0.0);   // Tall box right
    if (surfaceID < 8.5) return vec3(0.0, 1.0, 0.0);   // Tall box top
    if (surfaceID < 9.5) return vec3(0.0, 0.0, 1.0);   // Short box front
    if (surfaceID < 10.5) return vec3(-1.0, 0.0, 0.0); // Short box left
    if (surfaceID < 11.5) return vec3(1.0, 0.0, 0.0);  // Short box right
    if (surfaceID < 12.5) return vec3(0.0, 1.0, 0.0);  // Short box top
    return vec3(0.0, -1.0, 0.0);  // Light (faces down)
}

vec3 getSurfaceAlbedo(float surfaceID) {
    if (surfaceID < 1.5) return vec3(0.73);             // Floor (0), Ceiling (1)
    if (surfaceID < 2.5) return vec3(0.65, 0.05, 0.05); // Wall patch 2 (red - was grey)
    if (surfaceID < 3.5) return vec3(0.12, 0.45, 0.15); // Wall patch 3 (green - was red)
    if (surfaceID < 4.5) return vec3(0.73);             // Wall patch 4 (grey - was green)
    if (surfaceID < 13.0) return vec3(0.73);            // Boxes (5-12)
    return vec3(1.0);                                    // Light (13)
}

// Path trace from a surface point
// boxShrink: shrinks box footprint for shadow rays (use ~0.02 for floor to fix shadow alignment)
vec3 traceFromSurface(vec3 pos, vec3 normal, vec3 albedo, float boxShrink) {
    vec3 color = vec3(0.0);
    vec3 throughput = albedo;
    
    vec3 ro = pos + normal * 0.002;
    vec3 rd = randomHemisphere(normal);
    
    for (int bounce = 0; bounce < 3; bounce++) {
        vec4 hit = intersectScene(ro, rd, boxShrink);
        float t = hit.x;
        float matID = hit.y;
        vec3 n = decodeNormal(hit.z);
        
        if (t > 1e9) break;
        
        vec3 hitPos = ro + rd * t;
        
        // Hit light - don't add emission here since we use direct light sampling
        // (adding it here would double-count the light contribution)
        if (matID > 2.5) {
            break;
        }
        
        vec3 hitAlbedo = getMaterial(matID);
        
        // Direct light sampling
        vec3 lightPos = vec3((random() - 0.5) * 0.6, 1.98, (random() - 0.5) * 0.6);
        vec3 lightNrm = vec3(0.0, -1.0, 0.0);  // Light faces downward
        vec3 toLight = lightPos - hitPos;
        float lightDist = length(toLight);
        vec3 lightDir = toLight / lightDist;
        
        float NdotL = max(0.0, dot(n, lightDir));
        float lightNdotL = max(0.0, dot(lightNrm, -lightDir));  // Light must face surface
        if (NdotL > 0.0 && lightNdotL > 0.0 && lightDist > 0.1) {
            vec4 shadowHit = intersectScene(hitPos + n * 0.002, lightDir, boxShrink);
            if (shadowHit.x > lightDist - 0.01) {
                float G = (NdotL * lightNdotL) / (lightDist * lightDist);
                vec3 contrib = throughput * hitAlbedo * vec3(15.0) * G * 0.36 / 3.14159;
                color += min(contrib, vec3(10.0));
            }
        }
        
        throughput *= hitAlbedo;
        if (max(throughput.r, max(throughput.g, throughput.b)) < 0.01) break;
        
        ro = hitPos + n * 0.002;
        rd = randomHemisphere(n);
    }
    
    // Also add direct light sampling from the starting surface
    vec3 lightPos = vec3((random() - 0.5) * 0.6, 1.98, (random() - 0.5) * 0.6);
    vec3 lightNormal = vec3(0.0, -1.0, 0.0);  // Light faces downward
    vec3 toLight = lightPos - pos;
    float lightDist = length(toLight);
    vec3 lightDir = toLight / lightDist;
    float NdotL = max(0.0, dot(normal, lightDir));
    float lightNdotL = max(0.0, dot(lightNormal, -lightDir));  // Light must face the surface
    if (NdotL > 0.0 && lightNdotL > 0.0 && lightDist > 0.1) {
        vec4 shadowHit = intersectScene(pos + normal * 0.002, lightDir, boxShrink);
        if (shadowHit.x > lightDist - 0.01) {
            float G = (NdotL * lightNdotL) / (lightDist * lightDist);
            color += albedo * vec3(15.0) * G * 0.36 / 3.14159;
        }
    }
    
    return color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    gSeed = vec4(fragCoord, float(iFrame), float(iFrame) * 0.123);
    
    // Get world position for this texel
    vec4 worldData = getWorldPosition(fragCoord);
    vec3 worldPos = worldData.xyz;
    float surfaceID = worldData.w;
    
    // Outside the atlas - just return black
    if (surfaceID < 0.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Get surface properties
    vec3 normal = getSurfaceNormal(surfaceID);
    vec3 albedo = getSurfaceAlbedo(surfaceID);
    
    // Light emits, doesn't receive
    if (surfaceID > 12.5) {
        fragColor = vec4(15.0, 15.0, 15.0, 1.0);
        return;
    }
    
    // Read previous accumulation
    vec4 prevData = texture(iChannel1, fragCoord / iResolution.xy);
    vec3 prevColor = prevData.rgb;
    float sampleCount = prevData.a;
    
    // Reset on first frame
    if (iFrame < 1) {
        sampleCount = 0.0;
        prevColor = vec3(0.0);
    }
    
    // Trace from this surface point
    // For floor texels, shrink box footprint slightly to fix shadow edge alignment
    float boxShrink = (surfaceID < 0.5) ? 0.02 : 0.0;  // Adjust 0.02 to tune
    
    vec3 color = vec3(0.0);
    for (int s = 0; s < SAMPLES_PER_FRAME; s++) {
        color += traceFromSurface(worldPos, normal, albedo, boxShrink);
    }
    color /= float(SAMPLES_PER_FRAME);
    
    // Accumulate
    sampleCount += float(SAMPLES_PER_FRAME);
    color = mix(prevColor, color, float(SAMPLES_PER_FRAME) / sampleCount);
    
    fragColor = vec4(color, sampleCount);
}

