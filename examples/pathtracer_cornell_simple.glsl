// ============================================================================
// Cornell Box Path Tracer - Minimal Version
// ============================================================================
// Simplified to avoid WebGL compilation issues
// ============================================================================

// Random number generation - better quality hash
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

// Scene intersection - returns: x=distance, y=materialID, z=normal encoded, w=unused
// Normal encoding: pack into single float using octahedral encoding
float encodeNormal(vec3 n) {
    // Simple encoding: store dominant axis + signs
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

vec4 intersectScene(vec3 ro, vec3 rd) {
    float tMin = 1e10;
    float matID = -1.0;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    
    // Floor y=0
    float t = -ro.y / rd.y;
    if (t > 0.001 && t < tMin) {
        vec3 p = ro + rd * t;
        if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
            tMin = t;
            normal = vec3(0.0, 1.0, 0.0);
            matID = 0.0; // white
        }
    }
    
    // Ceiling y=2
    t = (2.0 - ro.y) / rd.y;
    if (t > 0.001 && t < tMin) {
        vec3 p = ro + rd * t;
        if (abs(p.x) < 1.0 && abs(p.z) < 1.0) {
            tMin = t;
            normal = vec3(0.0, -1.0, 0.0);
            matID = 0.0; // white
        }
    }
    
    // Back wall z=-1
    t = (-1.0 - ro.z) / rd.z;
    if (t > 0.001 && t < tMin) {
        vec3 p = ro + rd * t;
        if (abs(p.x) < 1.0 && p.y > 0.0 && p.y < 2.0) {
            tMin = t;
            normal = vec3(0.0, 0.0, 1.0);
            matID = 0.0; // white
        }
    }
    
    // Left wall x=-1 (RED)
    t = (-1.0 - ro.x) / rd.x;
    if (t > 0.001 && t < tMin) {
        vec3 p = ro + rd * t;
        if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
            tMin = t;
            normal = vec3(1.0, 0.0, 0.0);
            matID = 1.0; // red
        }
    }
    
    // Right wall x=1 (GREEN)
    t = (1.0 - ro.x) / rd.x;
    if (t > 0.001 && t < tMin) {
        vec3 p = ro + rd * t;
        if (abs(p.z) < 1.0 && p.y > 0.0 && p.y < 2.0) {
            tMin = t;
            normal = vec3(-1.0, 0.0, 0.0);
            matID = 2.0; // green
        }
    }
    
    // Light on ceiling (simplified - just a plane section)
    t = (1.98 - ro.y) / rd.y;
    if (t > 0.001 && t < tMin) {
        vec3 p = ro + rd * t;
        if (abs(p.x) < 0.3 && abs(p.z) < 0.3) {
            tMin = t;
            normal = vec3(0.0, -1.0, 0.0);
            matID = 3.0; // light
        }
    }
    
    // Tall box (simplified AABB)
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
        vec3 p = ro + rd * tnear;
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
        vec3 p = ro + rd * tnear;
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

vec3 getMaterial(float id) {
    if (id < 0.5) return vec3(0.73);       // white
    if (id < 1.5) return vec3(0.65, 0.05, 0.05); // red
    if (id < 2.5) return vec3(0.12, 0.45, 0.15); // green
    return vec3(0.0); // light (handled separately)
}

vec3 tracePath(vec3 ro, vec3 rd) {
    vec3 color = vec3(0.0);
    vec3 throughput = vec3(1.0);
    
    for (int bounce = 0; bounce < 4; bounce++) {
        vec4 hit = intersectScene(ro, rd);
        float t = hit.x;
        float matID = hit.y;
        vec3 n = decodeNormal(hit.z);
        
        if (t > 1e9) break;
        
        vec3 hitPos = ro + rd * t;
        
        // Hit light
        if (matID > 2.5) {
            if (bounce == 0) color += throughput * vec3(15.0);
            break;
        }
        
        vec3 albedo = getMaterial(matID);
        
        // Direct light sampling
        vec3 lightPos = vec3(
            (random() - 0.5) * 0.6,
            1.98,
            (random() - 0.5) * 0.6
        );
        vec3 toLight = lightPos - hitPos;
        float lightDist = length(toLight);
        vec3 lightDir = toLight / lightDist;
        
        float NdotL = max(0.0, dot(n, lightDir));
        if (NdotL > 0.0) {
            // Shadow ray
            vec4 shadowHit = intersectScene(hitPos + n * 0.001, lightDir);
            if (shadowHit.x > lightDist - 0.01) {
                // Light visible
                float lightArea = 0.36; // 0.6 * 0.6
                float G = NdotL / (lightDist * lightDist);
                color += throughput * albedo * vec3(15.0) * G * lightArea / 3.14159;
            }
        }
        
        // Continue path
        throughput *= albedo;
        
        // Russian roulette
        if (bounce > 0) {
            float p = max(throughput.r, max(throughput.g, throughput.b));
            if (random() > p) break;
            throughput /= p;
        }
        
        ro = hitPos + n * 0.001;
        rd = randomHemisphere(n);
    }
    
    return color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Random seed - unique per pixel and frame
    gSeed = vec4(fragCoord, iTime, iTime * 0.123);
    
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
    
    // Rotate camera
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
    
    // Trace multiple samples
    vec3 color = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        vec2 jitter = vec2(random(), random()) - 0.5;
        vec2 juv = uv + jitter / iResolution.xy;
        vec3 rd = normalize(forward + right * juv.x * 0.8 + up * juv.y * 0.8);
        color += tracePath(camPos, rd);
    }
    color /= 4.0;
    
    // Tonemap and gamma
    color = color / (1.0 + color);
    color = pow(color, vec3(0.4545));
    
    fragColor = vec4(color, 1.0);
}
