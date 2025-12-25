// Two Black Holes with Roche Potential Accretion Disk
// Based on original by nxrix, modified for Roche potential disk shape
// The disk shape follows gravitational equipotential surfaces

const float  PI = 3.14159265;
const float TAU = 6.28318530;

//#define AA 2
#define doppler
//#define RK4

const float Rs1 = 2.0;
const float Rs2 = 1.0;

// Roche potential parameters
// The disk exists where potential is between these values
const float POTENTIAL_INNER = -0.3;  // Inner edge (closer to black holes, more negative)
const float POTENTIAL_OUTER = -0.09;  // Outer edge (farther out, less negative)
const float DISK_THICKNESS = 0.5;

const vec3 BH1_POS = vec3(-27.0, 0.0, 0.0);
const vec3 BH2_POS = vec3( 32.0, 0.0, 0.0);

// Disk lies in XZ plane (Y = 0)
const vec3 DISK_AXIS = vec3(0.0, 1.0, 0.0);

const int MAX_STEPS = 128;

const float INV_PI = 1.0 / PI;
const float INV_SIX_RS1 = 1.0 / (6.0 * Rs1);
const float INV_SIX_RS2 = 1.0 / (6.0 * Rs2);

float ls(float x) {
    return 1.0 - abs(mod(x * INV_PI, 2.0) - 1.0) * 2.0;
}

float noise(vec2 p) {
    return texture(iChannel0, p / 128.0).r;
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
#ifdef doppler
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
#else
vec3 diskColor(float temp, float angle, float blend) {
    float t_noise = temp * 0.7 + 0.4 * noise(vec2((temp - iTime * 0.1) * 40.0, ls(angle - iTime) * 6.0));
    float t_adjusted = t_noise * 1.5 / (t_noise + 0.5);
    float t_factor = t_adjusted * 0.5 + 0.5;
    float t_half = t_adjusted * 0.5 + 0.4;
    float t_pow5 = exp(5.0 * log(max(t_adjusted, 0.001)));
    float t_pow20 = exp(20.0 * log(max(t_adjusted, 0.001)));
    
    vec3 warm = vec3(t_half, t_pow5 * 0.6, t_pow20 * 0.3) * t_factor;
    vec3 cool = warm.zyx;
    
    return mix(warm, cool, blend) * 1.2;
}
#endif

vec3 bend(vec3 ro, vec3 rd, vec3 p, float rs) {
    vec3 r = ro - p;
    float r2 = dot(r, r);
    float r1 = inversesqrt(r2);
    vec3 L = cross(r, rd);
    return -1.5 * rs * (r * dot(L, L)) * (r1 / (r2 * r2));
}

#ifdef RK4
void advance(inout vec3 ro, inout vec3 rd, float h) {
    vec3 k1_v = bend(ro, rd, BH1_POS, Rs1) + bend(ro, rd, BH2_POS, Rs2);
    vec3 k1_p = rd;
    vec3 k2_v = bend(ro + k1_p * h * 0.5, normalize(rd + k1_v * h * 0.5), BH1_POS, Rs1) + 
                bend(ro + k1_p * h * 0.5, normalize(rd + k1_v * h * 0.5), BH2_POS, Rs2);
    vec3 k2_p = normalize(rd + k1_v * h * 0.5);
    vec3 k3_v = bend(ro + k2_p * h * 0.5, normalize(rd + k2_v * h * 0.5), BH1_POS, Rs1) + 
                bend(ro + k2_p * h * 0.5, normalize(rd + k2_v * h * 0.5), BH2_POS, Rs2);
    vec3 k3_p = normalize(rd + k2_v * h * 0.5);
    vec3 k4_v = bend(ro + k3_p * h, normalize(rd + k3_v * h), BH1_POS, Rs1) + 
                bend(ro + k3_p * h, normalize(rd + k3_v * h), BH2_POS, Rs2);
    vec3 k4_p = normalize(rd + k3_v * h);
    vec3 v_new = rd + (k1_v + 2.0*k2_v + 2.0*k3_v + k4_v) * h / 6.0;
    ro = ro + (k1_p + 2.0*k2_p + 2.0*k3_p + k4_p) * h / 6.0;
    rd = normalize(v_new);
}
#else
void advance(inout vec3 o, inout vec3 d, float h) {
    vec3 acc = bend(o, d, BH1_POS, Rs1) + bend(o, d, BH2_POS, Rs2);
    d = normalize(d + acc * h);
    o += d * h;
}
#endif

// Check if ray crosses the Roche potential disk
bool hit_roche_disk(vec3 oro, vec3 ro, vec3 rd, inout vec3 col) {
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
    
    #ifdef doppler
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
    col = diskColor(temp, angle, dop, blend);
    #else
    col = diskColor(temp, angle, blend);
    #endif
    
    return true;
}

vec3 trace(vec3 ro, vec3 rd) {
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 to_bh1 = ro - BH1_POS;
        vec3 to_bh2 = ro - BH2_POS;
        float r1 = length(to_bh1);
        float r2 = length(to_bh2);
        
        if (r1 < Rs1 || r2 < Rs2) {
            return vec3(0);
        }
        if (r1 > 80.0 && r2 > 80.0) {
            break;
        }
        
        vec3 oro = ro;
        float h = clamp(min(r1 * INV_SIX_RS1, r2 * INV_SIX_RS2), 1.0, 16.0);
        advance(ro, rd, h);
        
        vec3 col = vec3(0);
        if (hit_roche_disk(oro, ro, rd, col)) {
            return col;
        }
    }
    return vec3(0);
}

vec3 render(vec2 fragCoord) {
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);
    vec2 mo = vec2(iTime * 0.1, 0.47);
    
    if (iMouse.z > 0.0) mo = iMouse.xy / iResolution.xy * 2.0 - 0.5;
    mo.y = clamp(mo.y, 0.01, 0.99);
    
    float theta = TAU * (0.5 * -mo.y);
    float sin_theta = sin(theta);
    float cos_theta = cos(theta);
    float cos_tau_neg_mo_x = cos(TAU * -mo.x);
    float sin_tau_neg_mo_x = sin(TAU * -mo.x);
    
    vec3 ro = vec3(cos_tau_neg_mo_x * sin_theta,
                   cos_theta,
                   sin_tau_neg_mo_x * sin_theta) * 44.0;
    
    vec3 forward = normalize(-ro);
    vec3 right = normalize(cross(vec3(0, 1, 0), forward));
    vec3 up = cross(forward, right);
    vec3 rd = forward;
    ro += uv.x * right * 22.0 + uv.y * up * 22.0;
    
    return trace(ro, rd);
}

void mainImage0(out vec4 fragColor, in vec2 fragCoord) {
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

// Main shader entry point with anti-aliasing (matching your setup)
void mainImage(out vec4 fragColor, vec2 fragCoord) {
    float sampleCount = 6.0;
    vec2 jitter = vec2(0.5);
    fragColor = vec4(0.0);
    
    for (float k = sampleCount; k > 0.5; k--) {
        vec4 sampleColor;
        mainImage0(sampleColor, fragCoord + jitter - 0.5);
        fragColor += sampleColor;
        jitter = fract(jitter + vec2(0.755, 0.57).yx);
    }
    
    fragColor /= sampleCount;
    fragColor.a = 1.0;
}

