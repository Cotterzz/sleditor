// ============================================================================
// Cornell Box Path Tracer - Buffer A (Accumulation)
// ============================================================================
// This buffer does path tracing and accumulates samples over time.
// It reads itself (iChannel0) to blend new samples with previous frames.
//
// SHADERTOY SETUP:
//   Buffer A: iChannel0 = Buffer A (self, for accumulation)
//   Image:    iChannel0 = Buffer A (to display result)
//
// CONTROLS:
//   Click and drag to rotate the camera.
//   The image will re-render when you move the camera.
// ============================================================================

// -----------------------------------------------------------------------------
// RANDOM NUMBER GENERATION
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// NORMAL ENCODING (to fit in vec4 return value)
// -----------------------------------------------------------------------------

float encodeNormal(vec3 n) {
    float ax = abs(n.x);
    float ay = abs(n.y);
    float az = abs(n.z);
    if (ax > ay && ax > az) return sign(n.x) * 1.0;
    if (ay > az) return sign(n.y) * 2.0;
    return sign(n.z) * 3.0;
}

vec3 decodeNormal(float e) {
    float ae = abs(e);
    float s = sign(e);
    if (ae < 1.5) return vec3(s, 0.0, 0.0);
    if (ae < 2.5) return vec3(0.0, s, 0.0);
    return vec3(0.0, 0.0, s);
}

// -----------------------------------------------------------------------------
// SCENE INTERSECTION
// Returns: x=distance, y=materialID, z=encoded normal, w=unused
// Materials: 0=white, 1=red, 2=green, 3=light
// -----------------------------------------------------------------------------

vec4 intersectScene(vec3 ro, vec3 rd) {
    float tMin = 1e10;
    float matID = -1.0;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    
    float t;
    vec3 p;
    
    // Floor y=0
    if (abs(rd.y) > 0.0001) {
        t = -ro.y / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
                tMin = t;
                normal = vec3(0.0, 1.0, 0.0);
                matID = 0.0;
            }
        }
    }
    
    // Ceiling y=2
    if (abs(rd.y) > 0.0001) {
        t = (2.0 - ro.y) / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
                tMin = t;
                normal = vec3(0.0, -1.0, 0.0);
                matID = 0.0;
            }
        }
    }
    
    // Back wall z=-1
    if (abs(rd.z) > 0.0001) {
        t = (-1.0 - ro.z) / rd.z;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t;
                normal = vec3(0.0, 0.0, 1.0);
                matID = 0.0;
            }
        }
    }
    
    // Left wall x=-1 (RED)
    if (abs(rd.x) > 0.0001) {
        t = (-1.0 - ro.x) / rd.x;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t;
                normal = vec3(1.0, 0.0, 0.0);
                matID = 1.0;
            }
        }
    }
    
    // Right wall x=1 (GREEN)
    if (abs(rd.x) > 0.0001) {
        t = (1.0 - ro.x) / rd.x;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
                tMin = t;
                normal = vec3(-1.0, 0.0, 0.0);
                matID = 2.0;
            }
        }
    }
    
    // Light on ceiling
    if (abs(rd.y) > 0.0001) {
        t = (1.98 - ro.y) / rd.y;
        if (t > 0.001 && t < tMin) {
            p = ro + rd * t;
            if (abs(p.x) < 0.3 && abs(p.z) < 0.3) {
                tMin = t;
                normal = vec3(0.0, -1.0, 0.0);
                matID = 3.0;
            }
        }
    }
    
    // Tall box
    vec3 b1min = vec3(-0.7, 0.0, -0.55);
    vec3 b1max = vec3(-0.15, 1.2, 0.0);
    vec3 t1 = (b1min - ro) / rd;
    vec3 t2 = (b1max - ro) / rd;
    vec3 tmin = min(t1, t2);
    vec3 tmax = max(t1, t2);
    float tnear = max(max(tmin.x, tmin.y), tmin.z);
    float tfar = min(min(tmax.x, tmax.y), tmax.z);
    if (tnear < tfar && tnear > 0.001 && tnear < tMin) {
        tMin = tnear;
        p = ro + rd * tnear;
        vec3 c = (b1min + b1max) * 0.5;
        vec3 d = (b1max - b1min) * 0.5;
        vec3 lp = (p - c) / d;
        if (abs(lp.x) > 0.999) normal = vec3(sign(lp.x), 0.0, 0.0);
        else if (abs(lp.y) > 0.999) normal = vec3(0.0, sign(lp.y), 0.0);
        else normal = vec3(0.0, 0.0, sign(lp.z));
        matID = 0.0;
    }
    
    // Short box
    vec3 b2min = vec3(0.1, 0.0, -0.15);
    vec3 b2max = vec3(0.65, 0.6, 0.4);
    t1 = (b2min - ro) / rd;
    t2 = (b2max - ro) / rd;
    tmin = min(t1, t2);
    tmax = max(t1, t2);
    tnear = max(max(tmin.x, tmin.y), tmin.z);
    tfar = min(min(tmax.x, tmax.y), tmax.z);
    if (tnear < tfar && tnear > 0.001 && tnear < tMin) {
        tMin = tnear;
        p = ro + rd * tnear;
        vec3 c = (b2min + b2max) * 0.5;
        vec3 d = (b2max - b2min) * 0.5;
        vec3 lp = (p - c) / d;
        if (abs(lp.x) > 0.999) normal = vec3(sign(lp.x), 0.0, 0.0);
        else if (abs(lp.y) > 0.999) normal = vec3(0.0, sign(lp.y), 0.0);
        else normal = vec3(0.0, 0.0, sign(lp.z));
        matID = 0.0;
    }
    
    return vec4(tMin, matID, encodeNormal(normal), 0.0);
}

// -----------------------------------------------------------------------------
// MATERIALS
// -----------------------------------------------------------------------------

vec3 getMaterial(float id) {
    if (id < 0.5) return vec3(0.73);              // white
    if (id < 1.5) return vec3(0.65, 0.05, 0.05);  // red
    if (id < 2.5) return vec3(0.12, 0.45, 0.15);  // green
    return vec3(0.0);                              // light
}

// -----------------------------------------------------------------------------
// PATH TRACING
// -----------------------------------------------------------------------------

vec3 tracePath(vec3 ro, vec3 rd) {
    vec3 color = vec3(0.0);
    vec3 throughput = vec3(1.0);
    
    for (int bounce = 0; bounce < 4; bounce++) {
        vec4 hit = intersectScene(ro, rd);
        float t = hit.x;
        float matID = hit.y;
        vec3 n = decodeNormal(hit.z);
        
        if (t > 1e9) {
            break;
        }
        
        vec3 hitPos = ro + rd * t;
        
        // Hit light
        if (matID > 2.5) {
            if (bounce == 0) {
                color += throughput * vec3(15.0);
            }
            break;
        }
        
        vec3 albedo = getMaterial(matID);
        
        // Direct light sampling (Next Event Estimation)
        vec3 lightPos = vec3(
            (random() - 0.5) * 0.6,
            1.98,
            (random() - 0.5) * 0.6
        );
        vec3 toLight = lightPos - hitPos;
        float lightDist = length(toLight);
        vec3 lightDir = toLight / lightDist;
        
        float NdotL = max(0.0, dot(n, lightDir));
        if (NdotL > 0.0 && lightDist > 0.1) {  // Minimum distance to prevent fireflies
            vec4 shadowHit = intersectScene(hitPos + n * 0.002, lightDir);
            if (shadowHit.x > lightDist - 0.01) {
                float lightArea = 0.36;
                float G = NdotL / (lightDist * lightDist);
                // Clamp contribution to prevent fireflies
                vec3 contribution = throughput * albedo * vec3(15.0) * G * lightArea / 3.14159;
                contribution = min(contribution, vec3(10.0));  // Max contribution per sample
                color += contribution;
            }
        }
        
        // Continue path
        throughput *= albedo;
        
        // Russian roulette after first bounce
        if (bounce > 0) {
            float p = max(throughput.r, max(throughput.g, throughput.b));
            p = clamp(p, 0.2, 0.8);  // Tighter bounds to reduce variance
            if (random() > p) {
                break;
            }
            throughput /= p;
            // Clamp throughput to prevent fireflies from accumulating
            throughput = min(throughput, vec3(5.0));
        }
        
        ro = hitPos + n * 0.002;
        rd = randomHemisphere(n);
    }
    
    return color;
}

// -----------------------------------------------------------------------------
// CAMERA
// -----------------------------------------------------------------------------

void getCamera(vec2 uv, float rotX, float rotY, out vec3 ro, out vec3 rd) {
    vec3 camPos = vec3(0.0, 1.0, 2.8);
    vec3 lookAt = vec3(0.0, 1.0, 0.0);
    
    float cx = cos(rotX);
    float sx = sin(rotX);
    float cy = cos(rotY);
    float sy = sin(rotY);
    
    vec3 offset = camPos - lookAt;
    offset = vec3(cx * offset.x + sx * offset.z, offset.y, -sx * offset.x + cx * offset.z);
    offset = vec3(offset.x, cy * offset.y - sy * offset.z, sy * offset.y + cy * offset.z);
    camPos = lookAt + offset;
    
    vec3 forward = normalize(lookAt - camPos);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    
    ro = camPos;
    rd = normalize(forward + right * uv.x * 0.8 + up * uv.y * 0.8);
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------

// Samples per frame - increase for faster convergence (but slower framerate)
#define SAMPLES_PER_FRAME 4

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Initialize random seed
    gSeed = vec4(fragCoord, float(iFrame), float(iFrame) * 0.123);
    
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    
    // Read previous frame data
    vec4 prevData = texture(iChannel0, fragCoord / iResolution.xy);
    vec3 prevColor = prevData.rgb;
    float sampleCount = prevData.a;
    
    // Read stored state from corner pixel
    vec4 statePixel = texture(iChannel0, vec2(0.5) / iResolution.xy);
    float prevRotX = statePixel.r;
    float prevRotY = statePixel.g;
    float prevMouseDown = statePixel.b;
    
    // Calculate rotation
    float rotX = prevRotX;
    float rotY = prevRotY;
    float mouseDown = 0.0;
    
    if (iMouse.z > 0.0) {
        mouseDown = 1.0;
        vec2 mouse = iMouse.xy / iResolution.xy;
        rotX = (mouse.x - 0.5) * 3.14159;
        rotY = (mouse.y - 0.5) * 1.0;
    }
    
    // Check if we need to reset
    bool shouldReset = iFrame < 1;
    if (iMouse.z > 0.0) {
        if (abs(rotX - prevRotX) > 0.001 || abs(rotY - prevRotY) > 0.001) {
            shouldReset = true;
        }
    }
    
    if (shouldReset) {
        sampleCount = 0.0;
        prevColor = vec3(0.0);
    }
    
    // Trace multiple samples per frame for faster convergence
    vec3 frameColor = vec3(0.0);
    for (int s = 0; s < SAMPLES_PER_FRAME; s++) {
        // Jitter for anti-aliasing
        vec2 jitter = vec2(random(), random()) - 0.5;
        vec2 jitteredUV = uv + jitter / iResolution.xy;
        
        // Get camera ray
        vec3 ro, rd;
        getCamera(jitteredUV, rotX, rotY, ro, rd);
        
        // Trace path
        frameColor += tracePath(ro, rd);
    }
    frameColor /= float(SAMPLES_PER_FRAME);
    
    // Accumulate with previous frames
    sampleCount += float(SAMPLES_PER_FRAME);
    vec3 color = mix(prevColor, frameColor, float(SAMPLES_PER_FRAME) / sampleCount);
    
    // Output
    fragColor = vec4(color, sampleCount);
    
    // Store state in corner pixel
    if (fragCoord.x < 1.0 && fragCoord.y < 1.0) {
        fragColor = vec4(rotX, rotY, mouseDown, sampleCount);
    }
}
