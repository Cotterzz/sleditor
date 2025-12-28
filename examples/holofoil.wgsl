/*================================
=         Holofoil Dice          =
=         Author: Jaenam         =
================================*/
// Date:    2025-12-16
// License: Creative Commons (CC BY-NC-SA 4.0)

fn rot2(a: f32) -> mat2x2f {
    let c = cos(a);
    let s = sin(a);
    return mat2x2f(c, s, -s, c);
}

fn hash(p: vec3f) -> f32 {
    return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5);
}

fn hash2(p: vec3f) -> f32 {
    return fract(sin(dot(p, vec3f(43.7, 78.2, 123.4))) * 127.1);
}

fn march(I: vec2f, r: vec3f, Rx: mat2x2f, Ry: mat2x2f, Z: f32) -> f32 {
    var col = 0.0;
    var d = 0.0;
    
    for (var i = 0.0; i < 80.0; i += 1.0) {
        var p = vec3f((I + I - r.xy) / r.y * d, d - 8.0);
        
        if (abs(p.x) > 5.0) { break; }
        
        let pxz = p.xz * Rx;
        p = vec3f(pxz.x, p.y, pxz.y);
        
        let pxy = p.xy * Ry;
        p = vec3f(pxy.x, pxy.y, p.z);
        
        let g = floor(p * 6.0);
        let f = fract(p * 6.0) - 0.5;
        let h = step(length(f), hash(g) * 0.3 + 0.1);
        let a = hash2(g) * 6.28;
        
        var e = 1.0;
        var sc = 2.0;
        
        for (var j = 0; j < 3; j++) {
            let gg = abs(fract(p * sc / 2.0) * 2.0 - 1.0);
            e = min(e, min(max(gg.x, gg.y), min(max(gg.y, gg.z), max(gg.x, gg.z))) / sc);
            sc *= 0.6;
        }
        
        let c = max(max(max(abs(p.x), abs(p.y)), abs(p.z)), dot(abs(p), vec3f(0.577)) * 0.9) - 3.0;
        let s = 0.01 + 0.15 * abs(max(max(c, e - 0.1), length(sin(c)) - 0.3) + Z * 0.02 - i / 130.0);
        d += s;
        
        let sf = smoothstep(0.02, 0.01, s);
        col += 1.6 / s * (0.5 + 0.5 * sin(i * 0.3 + Z * 5.0) + sf * 4.0 * h * sin(a + i * 0.4 + Z * 5.0));
    }
    
    return col;
}

@compute @workgroup_size(16, 16)
fn graphics_main(@builtin(global_invocation_id) id: vec3u) {
    let res = vec2u(SCREEN_WIDTH, SCREEN_HEIGHT);
    if (id.x >= res.x || id.y >= res.y) { return; }
    
    let I = vec2f(f32(id.x), f32(res.y - id.y - 1));
    let r = vec3f(vec2f(res), 0.0);
    let t = uniforms.time / 2.0;
    
    let Rx = rot2(t);
    let Ry = rot2(t);
    
    var O = vec4f(
        march(I, r, Rx, Ry, -1.0),
        march(I, r, Rx, Ry, 0.0),
        march(I, r, Rx, Ry, 1.0),
        1.0
    );
    
    textureStore(screenTexture, vec2i(id.xy), tanh(O * O / 1e7));
}