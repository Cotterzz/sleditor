// Two Black Holes with Cassini Oval Accretion Disk
// Based on original by nxrix, modified for unified disk
// The disk forms a figure-8 shape connecting both black holes

const float  PI = 3.14159265;
const float TAU = 6.28318530;

#define AA 2

const float Rs1 = 2.0;
const float Rs2 = 1.0;

// Cassini oval parameters
// When CASSINI_B² < (separation/2)², we get two separate lobes
// When CASSINI_B² = (separation/2)², we get a figure-8 (lemniscate)
// When CASSINI_B² > (separation/2)², we get one merged oval
const float CASSINI_B = 26.0;  // Controls the "pinch" of the figure-8
const float DISK_INNER_SCALE = 0.3;  // Inner cutoff (as fraction of CASSINI_B²)
const float DISK_OUTER_SCALE = 1.4;   // Outer cutoff
const float DISK_THICKNESS = 0.5;     // Vertical thickness of disk

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

// Disk color based on temperature and blend factor
// blend: 0 = BH1 (orange/warm), 1 = BH2 (blue/cool)
// Uses the original's trick: .zyx swizzle to swap warm ↔ cool

vec3 diskColor(float temp, float angle, float dop, float blend) {
    float t_noise = temp * 0.6 + 0.5 * noise(vec2((temp - iTime * 0.1) * 40.0, ls(angle - iTime) * 6.0));
    float d_factor = -clamp(dop, -1.0, 1.0) * 0.15 + 1.1;
    float t_adjusted = t_noise * 1.5 / (t_noise * d_factor + 0.5);
    float t_factor = t_adjusted * 0.5 + 0.5;
    float t_half = t_adjusted * 0.5 + 0.4;
    float t_pow5 = exp(5.0 * log(max(t_adjusted, 0.001)));
    float t_pow20 = exp(20.0 * log(max(t_adjusted, 0.001)));
    
    // Base warm color (orange/yellow) - same as original
    vec3 warm = vec3(t_half, t_pow5 * 0.6, t_pow20 * 0.3) * t_factor;
    warm = mix(warm, vec3(temp, 0.0, 0.0), clamp(1.0 - pow(temp, 0.3), 0.0, 1.0));
    
    // Cool color (blue/cyan) - swap R and B channels like original did with .zyx
    vec3 cool = warm.zyx;
    
    // Blend based on proximity to each black hole
    // blend=0 → near BH1 (warm/orange), blend=1 → near BH2 (cool/blue)
    return mix(warm, cool, blend) * 1.2;
}


vec3 bend(vec3 ro, vec3 rd, vec3 p, float rs) {
    vec3 r = ro - p;
    float r2 = dot(r, r);
    float r1 = inversesqrt(r2);
    vec3 L = cross(r, rd);
    return -1.5 * rs * (r * dot(L, L)) * (r1 / (r2 * r2));
}


void advance(inout vec3 o, inout vec3 d, float h) {
    vec3 acc = bend(o, d, BH1_POS, Rs1) + bend(o, d, BH2_POS, Rs2);
    d = normalize(d + acc * h);
    o += d * h;
}

// Check if ray crosses the unified Cassini oval disk
bool hit_cassini_disk(vec3 oro, vec3 ro, vec3 rd, inout vec3 col) {
    // Check if we crossed the disk plane (Y = 0)
    float s1 = oro.y;
    float s2 = ro.y;
    if (s1 * s2 >= 0.0) return false;
    
    // Find intersection point
    float t = s1 / (s1 - s2);
    if (t < 0.0 || t > 1.0) return false;
    
    vec3 p = mix(oro, ro, t);
    
    // Distance to each black hole (in XZ plane)
    float d1 = length(p.xz - BH1_POS.xz);
    float d2 = length(p.xz - BH2_POS.xz);
    
    // Cassini oval: product of distances
    float cassini = d1 * d2;
    
    // Inner and outer boundaries based on Cassini value
    float innerBound = CASSINI_B * CASSINI_B * DISK_INNER_SCALE;
    float outerBound = CASSINI_B * CASSINI_B * DISK_OUTER_SCALE;
    
    // Also enforce minimum distance from each black hole (event horizon + buffer)
    float minDist1 = Rs1 * 3.0;
    float minDist2 = Rs2 * 3.0;
    
    if (cassini < innerBound || cassini > outerBound) return false;
    if (d1 < minDist1 || d2 < minDist2) return false;
    
    // Temperature based on Cassini value (hotter near the pinch/black holes)
    float temp = 1.0 - (cassini - innerBound) / (outerBound - innerBound);
    temp = pow(temp, 0.7);  // Adjust falloff
    
    // Boost temperature near the "pinch" point (L1 Lagrange point)
    vec3 L1 = mix(BH1_POS, BH2_POS, Rs1 / (Rs1 + Rs2));  // Approximate L1 point
    float distToL1 = length(p.xz - L1.xz);
    float pinchBoost = exp(-distToL1 * 0.1) * 0.5;
    temp = min(temp + pinchBoost, 1.0);
    
    // Blend factor: 0 = closer to BH1 (warm), 1 = closer to BH2 (cool/blue)
    // Gradual blend based on relative distances (no smoothstep for softer transition)
    float blend = d1 / (d1 + d2);
    
    // Use a single consistent reference point for angle calculation
    // This avoids ALL seams from atan discontinuities
    // Use the system's center of mass as reference
    vec3 centerOfMass = (BH1_POS * Rs1 + BH2_POS * Rs2) / (Rs1 + Rs2);
    vec2 relCM = p.xz - centerOfMass.xz;
    
    // Use polar coordinates from center of mass, plus Cassini-based modulation
    float globalAngle = atan(relCM.y, relCM.x);
    float globalRadius = length(relCM);
    
    // Add some variation based on Cassini value for organic swirls
    float cassiniPhase = log(cassini) * 0.5;
    float angle = globalAngle + cassiniPhase;
    

    // Doppler shift based on orbital velocity direction
    // Gas orbits around nearer black hole (smooth blend of directions)
    vec3 toBH1 = normalize(vec3(p.x - BH1_POS.x, 0.0, p.z - BH1_POS.z));
    vec3 toBH2 = normalize(vec3(p.x - BH2_POS.x, 0.0, p.z - BH2_POS.z));
    vec3 toNearest = normalize(mix(toBH1, toBH2, blend));
    vec3 tangent = normalize(vec3(-toNearest.z, 0.0, toNearest.x));
    
    // Add flow toward the pinch point for the connecting stream
    vec3 toL1 = normalize(vec3(L1.x - p.x, 0.0, L1.z - p.z));
    float streamFactor = exp(-distToL1 * 0.05);  // Stronger flow near L1
    tangent = normalize(mix(tangent, toL1, streamFactor * 0.5));
    
    float dop = dot(tangent, rd);
    col = diskColor(temp, angle, dop, blend);

    
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
        if (hit_cassini_disk(oro, ro, rd, col)) {
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

