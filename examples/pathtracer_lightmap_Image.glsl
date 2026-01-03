// ============================================================================
// Cornell Box Lightmap Path Tracer - Image (Render using Lightmap)
// ============================================================================
// Renders the scene by looking up pre-computed lighting from Buffer A.
// This allows instant camera movement since lighting is view-independent!
//
// Atlas layout (760x480) matches faces2.svg.txt - 10px padding around each face
//
// SHADERTOY SETUP:
//   Buffer A: iChannel0 = Buffer A (self)
//   Image:    iChannel0 = Buffer A
// ============================================================================

// Scene intersection (simplified - just need to know which surface we hit)
vec4 intersectScene(vec3 ro, vec3 rd) {
    float tMin = 1e10;
    float surfaceID = -1.0;
    vec2 hitUV = vec2(0.0);
    float t; vec3 p;
    
    // Floor (surfaceID = 0)
    if (abs(rd.y) > 0.0001) {
        t = -ro.y / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
                tMin = t; surfaceID = 0.0;
                hitUV = (p.xz + 1.0) / 2.0;  // Map to 0-1
            }
        }
    }
    // Ceiling (surfaceID = 1)
    if (abs(rd.y) > 0.0001) {
        t = (2.0 - ro.y) / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
                tMin = t; surfaceID = 1.0;
                hitUV = (p.xz + 1.0) / 2.0;
            }
        }
    }
    // Back wall (surfaceID = 4)
    if (abs(rd.z) > 0.0001) {
        t = (-1.0 - ro.z) / rd.z;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t; surfaceID = 4.0;
                hitUV = vec2((p.x + 1.0) / 2.0, p.y / 2.0);
            }
        }
    }
    // Left wall RED (surfaceID = 2)
    if (abs(rd.x) > 0.0001) {
        t = (-1.0 - ro.x) / rd.x;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t; surfaceID = 2.0;
                hitUV = vec2((p.z + 1.0) / 2.0, p.y / 2.0);
            }
        }
    }
    // Right wall GREEN (surfaceID = 3)
    if (abs(rd.x) > 0.0001) {
        t = (1.0 - ro.x) / rd.x;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t; surfaceID = 3.0;
                hitUV = vec2((p.z + 1.0) / 2.0, p.y / 2.0);
            }
        }
    }
    // Light (surfaceID = 13)
    if (abs(rd.y) > 0.0001) {
        t = (1.98 - ro.y) / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 0.3 && abs(p.z) < 0.3) {
                tMin = t; surfaceID = 13.0;
                hitUV = (vec2(p.x, p.z) / 0.6 + 0.5);
            }
        }
    }
    
    // Tall box: x in [-0.8, -0.25], y in [0, 1.2], z in [-0.65, -0.1]
    vec3 b1min = vec3(-0.8, -0.01, -0.65);
    vec3 b1max = vec3(-0.25, 1.2, -0.1);
    vec3 t1 = (b1min - ro) / rd; vec3 t2 = (b1max - ro) / rd;
    vec3 tmin = min(t1, t2); vec3 tmax = max(t1, t2);
    float tnear = max(max(tmin.x, tmin.y), tmin.z);
    float tfar = min(min(tmax.x, tmax.y), tmax.z);
    if (tnear < tfar && tnear > 0.001 && tnear < tMin) {
        tMin = tnear; p = ro + rd * tnear;
        vec3 c = (b1min + b1max) * 0.5; vec3 d = (b1max - b1min) * 0.5;
        vec3 lp = (p - c) / d;
        if (abs(lp.z) > 0.999) {  // Front face
            surfaceID = 5.0;
            hitUV = vec2((p.x - b1min.x) / (b1max.x - b1min.x), p.y / 1.2);
        } else if (lp.x < -0.999) {  // Left face
            surfaceID = 6.0;
            hitUV = vec2((p.z - b1min.z) / (b1max.z - b1min.z), p.y / 1.2);
        } else if (lp.x > 0.999) {  // Right face
            surfaceID = 7.0;
            hitUV = vec2((p.z - b1min.z) / (b1max.z - b1min.z), p.y / 1.2);
        } else if (lp.y > 0.999) {  // Top face
            surfaceID = 8.0;
            hitUV = vec2((p.x - b1min.x) / (b1max.x - b1min.x), 
                        (p.z - b1min.z) / (b1max.z - b1min.z));
        }
    }
    
    // Short box: x in [0.2, 0.75], y in [0, 0.6], z in [0.0, 0.55]
    vec3 b2min = vec3(0.2, -0.01, 0.0);
    vec3 b2max = vec3(0.75, 0.6, 0.55);
    t1 = (b2min - ro) / rd; t2 = (b2max - ro) / rd;
    tmin = min(t1, t2); tmax = max(t1, t2);
    tnear = max(max(tmin.x, tmin.y), tmin.z);
    tfar = min(min(tmax.x, tmax.y), tmax.z);
    if (tnear < tfar && tnear > 0.001 && tnear < tMin) {
        tMin = tnear; p = ro + rd * tnear;
        vec3 c = (b2min + b2max) * 0.5; vec3 d = (b2max - b2min) * 0.5;
        vec3 lp = (p - c) / d;
        if (lp.z > 0.999) {  // Front face
            surfaceID = 9.0;
            hitUV = vec2((p.x - b2min.x) / (b2max.x - b2min.x), p.y / 0.6);
        } else if (lp.x < -0.999) {  // Left face
            surfaceID = 10.0;
            hitUV = vec2((p.z - b2min.z) / (b2max.z - b2min.z), p.y / 0.6);
        } else if (lp.x > 0.999) {  // Right face
            surfaceID = 11.0;
            hitUV = vec2((p.z - b2min.z) / (b2max.z - b2min.z), p.y / 0.6);
        } else if (lp.y > 0.999) {  // Top face
            surfaceID = 12.0;
            hitUV = vec2((p.x - b2min.x) / (b2max.x - b2min.x), 
                        (p.z - b2min.z) / (b2max.z - b2min.z));
        }
    }
    
    return vec4(tMin, surfaceID, hitUV);
}

// Atlas base size (must match Buffer A - from faces2.svg.txt)
const vec2 ATLAS_SIZE = vec2(760.0, 480.0);

// Convert surface ID and UV to lightmap texture coordinates (in atlas space)
// The 10px padding around each face in the SVG allows for bleed prevention
vec2 getLightmapAtlasCoord(float surfaceID, vec2 uv) {
    // =========================================================================
    // Room surfaces (220x220 each at marked positions)
    // =========================================================================
    
    // Floor (10,10) 220x220
    if (surfaceID < 0.5) {
        return vec2(10.0 + uv.x * 220.0, 10.0 + uv.y * 220.0);
    }
    // Ceiling (10,250) 220x220
    if (surfaceID < 1.5) {
        return vec2(10.0 + uv.x * 220.0, 250.0 + uv.y * 220.0);
    }
    // Wall 2 (250,10) 220x220 - red wall
    if (surfaceID < 2.5) {
        return vec2(250.0 + uv.x * 220.0, 10.0 + uv.y * 220.0);
    }
    // Wall 3 (250,250) 220x220
    if (surfaceID < 3.5) {
        return vec2(250.0 + uv.x * 220.0, 250.0 + uv.y * 220.0);
    }
    // Wall 4/Back (490,250) 220x220
    if (surfaceID < 4.5) {
        return vec2(490.0 + uv.x * 220.0, 250.0 + uv.y * 220.0);
    }
    
    // =========================================================================
    // Tall box (100x60 rectangles for sides, 60x60 for top)
    // =========================================================================
    
    // Tall box front (490,10) 100x60
    if (surfaceID < 5.5) {
        return vec2(490.0 + uv.x * 100.0, 10.0 + uv.y * 60.0);
    }
    // Tall box left (490,90) 100x60
    if (surfaceID < 6.5) {
        return vec2(490.0 + uv.x * 100.0, 90.0 + uv.y * 60.0);
    }
    // Tall box right (490,170) 100x60
    if (surfaceID < 7.5) {
        return vec2(490.0 + uv.x * 100.0, 170.0 + uv.y * 60.0);
    }
    // Tall box top (610,10) 60x60
    if (surfaceID < 8.5) {
        return vec2(610.0 + uv.x * 60.0, 10.0 + uv.y * 60.0);
    }
    
    // =========================================================================
    // Short box (60x60 each)
    // =========================================================================
    
    // Short box front (610,90) 60x60
    if (surfaceID < 9.5) {
        return vec2(610.0 + uv.x * 60.0, 90.0 + uv.y * 60.0);
    }
    // Short box left (690,90) 60x60
    if (surfaceID < 10.5) {
        return vec2(690.0 + uv.x * 60.0, 90.0 + uv.y * 60.0);
    }
    // Short box right (610,170) 60x60
    if (surfaceID < 11.5) {
        return vec2(610.0 + uv.x * 60.0, 170.0 + uv.y * 60.0);
    }
    // Short box top (690,170) 60x60
    if (surfaceID < 12.5) {
        return vec2(690.0 + uv.x * 60.0, 170.0 + uv.y * 60.0);
    }
    
    // Light (690,20) 40x40
    return vec2(690.0 + uv.x * 40.0, 20.0 + uv.y * 40.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Mouse rotation
    float rotX = 0.0;
    float rotY = 0.0;
    if (iMouse.z > 0.0) {
        vec2 mouse = iMouse.xy / iResolution.xy;
        rotX = (mouse.x - 0.5) * 3.14159;
        rotY = (mouse.y - 0.5) * 1.0;
    }
    
    // Camera
    vec3 camPos = vec3(0.0, 1.0, 2.8);
    vec3 lookAt = vec3(0.0, 1.0, 0.0);
    
    float cx = cos(rotX); float sx = sin(rotX);
    float cy = cos(rotY); float sy = sin(rotY);
    vec3 offset = camPos - lookAt;
    offset = vec3(cx * offset.x + sx * offset.z, offset.y, -sx * offset.x + cx * offset.z);
    offset = vec3(offset.x, cy * offset.y - sy * offset.z, sy * offset.y + cy * offset.z);
    camPos = lookAt + offset;
    
    vec3 forward = normalize(lookAt - camPos);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    
    vec3 rd = normalize(forward + right * uv.x * 0.8 + up * uv.y * 0.8);
    
    // Cast ray into scene
    vec4 hit = intersectScene(camPos, rd);
    float t = hit.x;
    float surfaceID = hit.y;
    vec2 hitUV = hit.zw;
    
    vec3 color = vec3(0.0);
    
    if (surfaceID >= 0.0) {
        // Look up lightmap
        vec2 atlasCoord = getLightmapAtlasCoord(surfaceID, hitUV);
        
        // Scale atlas coordinates to buffer coordinates (same scaling as Buffer A)
        float scale = min(iResolution.x / ATLAS_SIZE.x, iResolution.y / ATLAS_SIZE.y);
        vec2 bufferCoord = atlasCoord * scale;
        vec2 sampleUV = bufferCoord / iResolution.xy;
        
        color = texture(iChannel1, sampleUV).rgb;
        
        // Tone mapping
        color = color / (1.0 + color);
        
        // Gamma
        color = pow(color, vec3(0.4545));
    }
    
    fragColor = vec4(color, 1.0);
}

