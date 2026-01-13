/*================================
=         Holofoil Dice          =
=         Author: Jaenam         =
================================*/
// Date:    2025-12-07
// License: Creative Commons (CC BY-NC-SA 4.0)

#define A(C, Z) \
for (float d, i, c, e, sc, h, a, s, sf; i++ < 80.;) { \
    vec3 p = vec3((I + I - r.xy) / r.y*d, d - 8.),g,f,k; \
    if (abs(p.x) > 5.) break; \
    p.xz *= Rx; \
    iMouse.z > 0. ? p.yz *= Ry : p.xy *= Ry; \
    g = floor(p * 6.); \
    f = fract(p * 6.) - .5; \
    h = step(length(f), fract(sin(dot(g, vec3(127.1, 311.7, 74.7))) * 43758.5) * .3 + .1); \
    a = fract(sin(dot(g, vec3(43.7, 78.2, 123.4))) * 127.1) * 6.28; \
    e = 1., sc = 2.; \
    for (int j = 0; j < 3; j++) { \
        g = abs(mod(p * sc, 2.) - 1.); \
        e = min(e, min(max(g.x, g.y), min(max(g.y, g.z), max(g.x, g.z))) / sc); \
        sc *= .6; \
    } \
    c = max(max(max(abs(p.x), abs(p.y)), abs(p.z)), dot(abs(p), vec3(.577)) * .9) - 3.; \
    d += s = .01 + .15 * abs(max(max(c, e - .1),length(sin(c))-.3) + Z * .02 - i / 130.); \
    sf = smoothstep(.02, .01, s); \
    O.C += 1.6 / s * (.5 + .5 * sin(i * .3 + Z * 5.) + sf * 4. * h * sin(a + i * .4 + Z * 5.));\
}

void mainImage(out vec4 O, vec2 I)
{   
    float t = iTime;
    vec3 r = iResolution;
    vec2 m = iMouse.z > 0. ? (iMouse.xy / r.xy - .5) * 6.28 : vec2(t / 2., t / 2.);
    mat2 Rx = mat2(cos(m.x + vec4(0, 33, 11, 0)));
    mat2 Ry = mat2(cos(m.y + vec4(0, 33, 11, 0)));
    O *= 0.;
    
    A(r, -1.)A(g, 0.)A(b, 1.)
    O = tanh(O * O / 1e7);
    
    // Alpha from luminance: bright = opaque, dark = transparent
    // This works in glass mode; in normal mode the wrapper forces alpha = 1.0
    float lum = dot(O.rgb/3.0, vec3(0.299, 0.587, 0.114));
    O.a = smoothstep(0.0, 0.1, lum);  // Adjust 0.1 threshold as needed
}