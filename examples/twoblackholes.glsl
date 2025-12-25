// Copyright © 2025 nxrix

const float  PI = 3.14159265;
const float TAU = 6.28318530;

//#define AA 2
#define doppler
//#define RK4

const float Rs1 = 2.0;
const float Rs2 = 1.0;

const float DISK1_INNER_RADIUS = Rs1 * 3.5;
const float DISK1_OUTER_RADIUS = Rs1 * 9.5;
const float DISK2_INNER_RADIUS = Rs2 * 3.5;
const float DISK2_OUTER_RADIUS = Rs2 * 9.5;

const vec3 BH1_POS = vec3(-27,0,0);
const vec3 BH2_POS = vec3( 32,0,0);

const vec3 DISK1_AXIS = normalize(vec3(0,1,0));
const vec3 DISK2_AXIS = normalize(vec3(0,1,0));

const vec3 DISK1_U = normalize(cross(abs(DISK1_AXIS.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0), DISK1_AXIS));
const vec3 DISK1_V = cross(DISK1_AXIS, DISK1_U);

const vec3 DISK2_U = normalize(cross(abs(DISK2_AXIS.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0), DISK2_AXIS));
const vec3 DISK2_V = cross(DISK2_AXIS, DISK2_U);

const int MAX_STEPS = 128;

const float INV_PI = 1.0 / PI;
const float INV_SIX_RS1 = 1.0 / (6.0 * Rs1);
const float INV_SIX_RS2 = 1.0 / (6.0 * Rs2);
const float DISK1_RANGE = DISK1_OUTER_RADIUS - DISK1_INNER_RADIUS;
const float DISK2_RANGE = DISK2_OUTER_RADIUS - DISK2_INNER_RADIUS;

float ls(float x) {
    return 1.0 - abs(mod(x * INV_PI, 2.0) - 1.0) * 2.0;
}

float noise(vec2 p) {
    return texture(iChannel0,p/128.0).r;
}

#ifdef doppler
vec3 disk(float t,float a,float d) {
    float t_noise = t*0.6+0.5*noise(vec2((t-iTime*0.1)*40.0,ls(a-iTime)*6.0));
    float d_factor = -clamp(d,-1.,1.)*0.15+1.1;
    float t_adjusted = t_noise * 1.5/(t_noise*d_factor+0.5);
    float t_factor = t_adjusted*0.5+0.5;
    float t_half = t_adjusted*0.5+0.4;
    float t_pow5 = exp(5.0 * log(t_adjusted));
    float t_pow20 = exp(20.0 * log(t_adjusted));
    //return vec3(t_half, t_pow5*0.6, t_pow20*0.3) * t_factor;
    return mix(vec3(t_half, t_pow5*0.6, t_pow20*0.3) * t_factor,vec3(t,0,0),clamp(1.0-pow(t,0.3),0.,1.));
}
#else
vec3 disk(float t,float a) {
    float t_noise = t*0.7+0.4*noise(vec2((t-iTime*0.1)*40.0,ls(a-iTime)*6.0));
    float t_adjusted = t_noise * 1.5/(t_noise+0.5);
    float t_factor = t_adjusted*0.5+0.5;
    float t_half = t_adjusted*0.5+0.4;
    float t_pow5 = exp(5.0 * log(t_adjusted));
    float t_pow20 = exp(20.0 * log(t_adjusted));
    return vec3(t_half, t_pow5*0.6, t_pow20*0.3) * t_factor;
    //return mix(vec3(t_half, t_pow5*0.6, t_pow20*0.3) * t_factor,vec3(t,0,0),clamp(1.0-pow(t,0.3),0.,1.));
}
#endif

vec3 bend(vec3 ro, vec3 rd, vec3 p, float rs) {
    vec3 r = ro - p;
    float r2 = dot(r,r);
    float r1 = inversesqrt(r2);
    vec3 L = cross(r, rd);
    return -1.5*rs*(r*dot(L,L)/*-L*dot(L,r)*/)*(r1/(r2*r2));//*pow(r1,5.0)
}

#ifdef RK4
void advance(inout vec3 ro, inout vec3 rd, float h) {
    vec3 k1_v = bend(ro, rd, BH1_POS, Rs1) + bend(ro, rd, BH2_POS, Rs2);
    vec3 k1_p = rd;
    vec3 k2_v = bend(ro + k1_p * h * 0.5, normalize(rd + k1_v * h * 0.5), BH1_POS, Rs1) + bend(ro + k1_p * h * 0.5, normalize(rd + k1_v * h * 0.5), BH2_POS, Rs2);
    vec3 k2_p = normalize(rd + k1_v * h * 0.5);
    vec3 k3_v = bend(ro + k2_p * h * 0.5, normalize(rd + k2_v * h * 0.5), BH1_POS, Rs1) + bend(ro + k2_p * h * 0.5, normalize(rd + k2_v * h * 0.5), BH2_POS, Rs2);
    vec3 k3_p = normalize(rd + k2_v * h * 0.5);
    vec3 k4_v = bend(ro + k3_p * h, normalize(rd + k3_v * h), BH1_POS, Rs1) + bend(ro + k3_p * h, normalize(rd + k3_v * h), BH2_POS, Rs2);
    vec3 k4_p = normalize(rd + k3_v * h);
    vec3 v_new = rd + (k1_v + 2.0*k2_v + 2.0*k3_v + k4_v) * h / 6.0;
    ro = ro + (k1_p + 2.0*k2_p + 2.0*k3_p + k4_p) * h / 6.0;
    rd = normalize(v_new);
}
#else
void advance(inout vec3 o, inout vec3 d, float h) {
    vec3 acc = bend(o,d,BH1_POS,Rs1)+bend(o,d,BH2_POS,Rs2);
    d = normalize(d+acc*h);
    o += d*h;
}
#endif

bool hit_disk(vec3 oro, vec3 ro, vec3 rd, vec3 center, vec3 axis, vec3 u, vec3 v, float innerR, float outerR, float angleOffset, inout vec3 col){
    float s1 = dot(oro - center, axis);
    float s2 = dot(ro  - center, axis);
    if (s1 * s2 >= 0.0) return false;

    float t = s1 / (s1 - s2);
    if (t < 0.0 || t > 1.0) return false;

    vec3 p = mix(oro, ro, t);
    vec3 rel = p - center;
    vec3 radial = rel - axis * dot(rel, axis);
    float r = length(radial);
    if (r < innerR || r > outerR) return false;

    float x = dot(radial, u);
    float y = dot(radial, v);
    float angle = atan(y, x) + angleOffset;

    float temp = 1.0 - (r - innerR) / (outerR - innerR);

    #ifdef doppler
    vec3 rl = normalize(radial);
    vec3 tg = normalize(cross(axis, rl));
    float dop = dot(tg, rd);
    col = disk(temp, angle, dop) * 1.2;
    #else
    col = disk(temp, angle) * 1.2;
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
        if (hit_disk(oro, ro, rd, BH1_POS, DISK1_AXIS, DISK1_U, DISK1_V, DISK1_INNER_RADIUS, DISK1_OUTER_RADIUS,  0.0, col)) {
            return col;
        }
        if (hit_disk(oro, ro, rd, BH2_POS, DISK2_AXIS, DISK2_U, DISK2_V, DISK2_INNER_RADIUS, DISK2_OUTER_RADIUS, -1.5, col)) {
            return col.zyx;
        }
    }
    return vec3(0);
}

vec3 render(vec2 fragCoord) {
    vec2 uv = (2.0*fragCoord-iResolution.xy)/min(iResolution.x, iResolution.y);
    vec2 mo = vec2(iTime*0.1,0.47);

    if (iMouse.z>0.0) mo = iMouse.xy/iResolution.xy*2.0-0.5;
    mo.y = clamp(mo.y, 0.01, 0.99);
    /*vec2 mo = vec2(0,0.47);
         if (iTime>2.0&&iTime<6.82) mo = vec2(iTime*0.1-0.2,0.47);
    else if (iTime>6.82&&iTime<10.0) mo = vec2(0.482,0.47);
    else if (iTime>10.0) mo = vec2(iTime*0.1-0.518,0.47);*/
    //mo = vec2(0.485,0.47);

    float theta = TAU*(0.5*-mo.y);
    float sin_theta = sin(theta);
    float cos_theta = cos(theta);
    float cos_tau_neg_mo_x = cos(TAU*-mo.x);
    float sin_tau_neg_mo_x = sin(TAU*-mo.x);

    vec3 ro = vec3(cos_tau_neg_mo_x * sin_theta,
                   cos_theta,
                   sin_tau_neg_mo_x * sin_theta) * 44.0;

    vec3 forward = normalize(/*target*/-ro);
    vec3 right = normalize(cross(vec3(0,1,0), forward));
    vec3 up = cross(forward, right);
    //vec3 rd = normalize(forward*1.0+uv.x*right+uv.y*up);
    vec3 rd = forward;
    ro += uv.x * right * 22.0 + uv.y * up * 22.0;
    /*vec3 id = 1.0/rd;
    vec3 t0 = (-box_size-ro)*id;
    vec3 t1 = ( box_size-ro)*id;
    vec3 tmin = min(t0,t1);
    vec3 tmax = max(t0,t1);
    float tn = max(max(tmin.x,tmin.y),tmin.z);
    float tf = min(min(tmax.x,tmax.y),tmax.z);
    if (tn>tf||tf<0.0) {
        return vec3(0);
    }*/
    //ro = ro+rd*(max(tn,0.0)+0.01);
    return trace(ro, rd);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec3 col = vec3(0);
  #ifdef AA
    for(int x = 0; x < AA; x++){
      for(int y = 0; y < AA; y++){
        vec2 jitter = vec2(float(x), float(y)) / float(AA) - 0.5;
        col += render(fragCoord + jitter);
      }
    }
    col /= float(AA*AA);
  #else
  col = render(fragCoord);
  #endif
  fragColor = vec4(col,1);
}