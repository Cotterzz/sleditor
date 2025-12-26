// Two Black Holes with Roche Potential Accretion Disk
// Based on original by nxrix, modified for Roche potential disk shape
// The disk shape follows gravitational equipotential surfaces
//
// iChannel0: Noise texture (for disk detail)
// iChannel1: Cubemap skybox (gravitationally lensed background)

const float  PI = 3.14159265;
const float TAU = 6.28318530;

//#define AA 2

const float Rs1 = 2.0;
const float Rs2 = 1.0;

// Lensing strength multiplier (1.0 = physically accurate, <1.0 = reduced lensing)
const float LENSING_STRENGTH = 1.0;

// Roche potential parameters
// The disk exists where potential is between these values
const float POTENTIAL_INNER = -0.3;  // Inner edge (closer to black holes, more negative)
const float POTENTIAL_OUTER = -0.09;  // Outer edge (farther out, less negative)
const float DISK_THICKNESS = 0.5;

const vec3 BH1_POS = vec3(-27.0, 0.0, 0.0);
const vec3 BH2_POS = vec3( 32.0, 0.0, 0.0);

// Disk lies in XZ plane (Y = 0)
const vec3 DISK_AXIS = vec3(0.0, 1.0, 0.0);

const int MAX_STEPS = 100;

const float INV_PI = 1.0 / PI;
const float INV_SIX_RS1 = 1.0 / (6.0 * Rs1);
const float INV_SIX_RS2 = 1.0 / (6.0 * Rs2);

float ls(float x) {
    return 1.0 - abs(mod(x * INV_PI, 2.0) - 1.0) * 2.0;
}

float noise(vec2 p) {
    return texture(iChannel2, p / 128.0).r;
}

// Calculate Roche-like gravitational potential
// More negative = deeper in gravity well
float rochePotential(vec3 p) {
    float r1 = length(p - BH1_POS);
    float r2 = length(p - BH2_POS);
    
    // Gravitational potential from both black holes
    // Using Schwarzschild radius as mass proxy
    float phi = -Rs1 / max(r1, 0.1) - Rs2 / max(r2, 0.1);
    
    // Optional: Add centrifugal term for rotating frame
    vec3 centerOfMass = (BH1_POS * Rs1 + BH2_POS * Rs2) / (Rs1 + Rs2);
    float rCM = length(p.xz - centerOfMass.xz);
    // phi -= 0.001 * rCM * rCM;  // Centrifugal term
    
    return phi;
}

// Disk color based on temperature and blend factor

vec3 diskColor(float temp, float angle, float dop, float blend) {
    float t_noise = temp * 0.6 + 0.5 * noise(vec2((temp - iTime * 0.1) * 40.0, ls(angle - iTime) * 6.0));
    float d_factor = -clamp(dop, -1.0, 1.0) * 0.15 + 1.1;
    float t_adjusted = t_noise * 1.5 / (t_noise * d_factor + 0.5);
    float t_factor = t_adjusted * 0.5 + 0.5;
    float t_half = t_adjusted * 0.5 + 0.4;
    float t_pow5 = exp(5.0 * log(max(t_adjusted, 0.001)));
    float t_pow20 = exp(20.0 * log(max(t_adjusted, 0.001)));
    
    // Base warm color (orange/yellow)
    vec3 warm = vec3(t_half, t_pow5 * 0.6, t_pow20 * 0.3) * t_factor;
    warm = mix(warm, vec3(temp, 0.0, 0.0), clamp(1.0 - pow(temp, 0.3), 0.0, 1.0));
    
    // Cool color (blue/cyan) - swap R and B channels
    vec3 cool = warm.zyx;
    
    return mix(warm, cool, blend) * 1.2;
}

vec3 bend(vec3 ro, vec3 rd, vec3 p, float rs) {
    vec3 r = ro - p;
    float r2 = dot(r, r);
    float r1 = inversesqrt(r2);
    vec3 L = cross(r, rd);
    return -1.5 * rs * LENSING_STRENGTH * (r * dot(L, L)) * (r1 / (r2 * r2));
}

void advance(inout vec3 o, inout vec3 d, float h) {
    vec3 acc = bend(o, d, BH1_POS, Rs1) + bend(o, d, BH2_POS, Rs2);
    d = normalize(d + acc * h);
    o += d * h;
}

// Disk opacity (0 = fully transparent, 1 = fully opaque)
const float DISK_OPACITY = 0.85;

// Check if ray crosses the Roche potential disk
// Returns opacity in col.a (using vec4)
bool hit_roche_disk(vec3 oro, vec3 ro, vec3 rd, inout vec4 colAlpha) {
    // Check if we crossed the disk plane (Y = 0)
    float s1 = oro.y;
    float s2 = ro.y;
    if (s1 * s2 >= 0.0) return false;
    
    // Find intersection point
    float t = s1 / (s1 - s2);
    if (t < 0.0 || t > 1.0) return false;
    
    vec3 p = mix(oro, ro, t);
    
    // Distance to each black hole
    float d1 = length(p - BH1_POS);
    float d2 = length(p - BH2_POS);
    
    // Minimum distance from event horizons
    float minDist1 = Rs1 * 3.0;
    float minDist2 = Rs2 * 3.0;
    if (d1 < minDist1 || d2 < minDist2) return false;
    
    // Calculate Roche potential at this point
    float potential = rochePotential(p);
    
    // Check if within disk bounds
    if (potential < POTENTIAL_INNER || potential > POTENTIAL_OUTER) return false;
    
    // Temperature based on potential (hotter = deeper in well)
    float temp = (potential - POTENTIAL_OUTER) / (POTENTIAL_INNER - POTENTIAL_OUTER);
    temp = pow(temp, 0.6);
    
    // Boost temperature near the L1 point (saddle point of potential)
    vec3 L1 = mix(BH1_POS, BH2_POS, Rs1 / (Rs1 + Rs2));
    float distToL1 = length(p.xz - L1.xz);
    float pinchBoost = exp(-distToL1 * 0.08) * 0.4;
    temp = min(temp + pinchBoost, 1.0);
    
    // Color blend: 0 = near BH1 (warm), 1 = near BH2 (cool)
    float blend = d1 / (d1 + d2);
    
    // Angle for texture - use center of mass as reference
    vec3 centerOfMass = (BH1_POS * Rs1 + BH2_POS * Rs2) / (Rs1 + Rs2);
    vec2 relCM = p.xz - centerOfMass.xz;
    float globalAngle = atan(relCM.y, relCM.x);
    
    // Add swirl based on potential gradient for organic flow
    float potentialPhase = potential * 20.0;
    float angle = globalAngle + potentialPhase;
    
    // Doppler shift - gas orbits around nearer black hole
    vec3 toBH1 = normalize(vec3(p.x - BH1_POS.x, 0.0, p.z - BH1_POS.z));
    vec3 toBH2 = normalize(vec3(p.x - BH2_POS.x, 0.0, p.z - BH2_POS.z));
    vec3 toNearest = normalize(mix(toBH1, toBH2, blend));
    vec3 tangent = normalize(vec3(-toNearest.z, 0.0, toNearest.x));
    
    // Add flow toward L1 point in the connecting stream
    vec3 toL1 = normalize(vec3(L1.x - p.x, 0.0, L1.z - p.z));
    float streamFactor = exp(-distToL1 * 0.05);
    tangent = normalize(mix(tangent, toL1, streamFactor * 0.5));
    
    float dop = dot(tangent, rd);
    vec3 diskCol = diskColor(temp, angle, dop, blend);
    
    // Opacity based on temperature (hotter = more opaque) and base opacity
    float opacity = DISK_OPACITY * (0.5 + 0.5 * temp);
    
    colAlpha = vec4(diskCol, opacity);
    return true;
}

// Escape distance - rays further than this from both black holes sample the skybox
const float ESCAPE_DIST = 200.0;

// Camera distance from scene center (adjust to frame the black holes nicely)
const float CAM_DIST = 75.0;

vec3 trace(vec3 ro, vec3 rd) {
    // Accumulated disk color and opacity
    vec3 accumulatedColor = vec3(0.0);
    float accumulatedAlpha = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 to_bh1 = ro - BH1_POS;
        vec3 to_bh2 = ro - BH2_POS;
        float r1 = length(to_bh1);
        float r2 = length(to_bh2);
        
        // Ray fell into a black hole - return accumulated disk over black
        if (r1 < Rs1 || r2 < Rs2) {
            return accumulatedColor;  // Black background, disk on top
        }
        
        // Ray escaped far enough - blend disk over lensed skybox
        if (r1 > ESCAPE_DIST && r2 > ESCAPE_DIST) {
            vec3 skybox = tanh(texture(iChannel1, rd).rgb * 2.0);
            // Composite: disk over background
            return accumulatedColor + (1.0 - accumulatedAlpha) * skybox;
        }
        
        vec3 oro = ro;
        float h = clamp(min(r1 * INV_SIX_RS1, r2 * INV_SIX_RS2), 1.0, 16.0);
        advance(ro, rd, h);
        
        vec4 diskHit = vec4(0.0);
        if (hit_roche_disk(oro, ro, rd, diskHit)) {
            // Front-to-back alpha compositing
            float alpha = diskHit.a * (1.0 - accumulatedAlpha);
            accumulatedColor += diskHit.rgb * alpha;
            accumulatedAlpha += alpha;
            
            // Early exit if nearly opaque
            if (accumulatedAlpha > 0.99) {
                return accumulatedColor;
            }
        }
    }
    
    // Max steps reached - blend disk over skybox
    vec3 skybox = tanh(texture(iChannel1, rd).rgb * 2.0);
    return accumulatedColor + (1.0 - accumulatedAlpha) * skybox;
}

vec3 render(vec2 fragCoord) {
    // === EXACT SAME CAMERA AS YOUR SKYBOX SHADER ===
    
    // Mouse rotation (matching your skybox)
    float rotX = (iMouse.x / iResolution.x) * 2.0 * PI;
    float rotY = (iMouse.y / iResolution.y) * PI;
    
    // Auto-rotate when mouse not pressed
    if (iMouse.z <= 0.0) {
        rotX = iTime * 0.2;
        rotY = PI * 0.5;  // Look from side
    }
    
    // UV with exact same calculation as your skybox (2.5 factor, xx aspect)
    vec2 uv = 2.5 * (fragCoord.xy - 0.5 * iResolution.xy) / iResolution.xx;
    
    // Camera position (matching your skybox formula)
    vec3 camO = vec3(cos(rotX), cos(rotY)+0.3, sin(rotX));
    
    // Camera basis vectors (matching your skybox)
    vec3 camD = normalize(vec3(0.0) - camO);
    vec3 camR = normalize(cross(camD, vec3(0.0, 1.0, 0.0)));
    vec3 camU = cross(camR, camD);
    
    // PERSPECTIVE ray direction (matching your skybox exactly)
    vec3 rd = normalize(uv.x * camR + uv.y * camU + camD);
    
    // Ray origin: camera position scaled to scene size
    // The black holes are around x=-27 to x=32, so center is ~2.5
    // We position camera at distance CAM_DIST looking at scene center
    vec3 sceneCenter = vec3(2.5, 0.0, 0.0);
    vec3 ro = sceneCenter + camO * CAM_DIST;
    
    return trace(ro, rd);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec3 col = vec3(0);
    #ifdef AA
    for (int x = 0; x < AA; x++) {
        for (int y = 0; y < AA; y++) {
            vec2 jitter = vec2(float(x), float(y)) / float(AA) - 0.5;
            col += render(fragCoord + jitter);
        }
    }
    col /= float(AA * AA);
    #else
    col = render(fragCoord);
    #endif
    fragColor = vec4(col, 1);
}



