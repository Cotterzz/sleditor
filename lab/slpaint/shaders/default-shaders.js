export const defaultShaders = {
    solidBrush: `
// Simple solid color brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    return mix(canvas, vec4(u_fgColor, 1.0), mask);
}
`,

    softBrush: `
// Soft brush with smooth falloff
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    // Smooth the mask for softer edges
    mask = smoothstep(0.0, 1.0, mask);
    mask *= 0.3; // Lower opacity per stroke
    return mix(canvas, vec4(u_fgColor, 1.0), mask);
}
`,

    blur: `
// Gaussian-like blur brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    if (mask < 0.01) return canvas;
    
    vec4 sum = vec4(0.0);
    float total = 0.0;
    
    for (float x = -4.0; x <= 4.0; x += 1.0) {
        for (float y = -4.0; y <= 4.0; y += 1.0) {
            float weight = 1.0 - length(vec2(x, y)) / 6.0;
            weight = max(0.0, weight);
            sum += getCanvasColorOffset(vec2(x, y) * 2.0) * weight;
            total += weight;
        }
    }
    
    vec4 blurred = sum / total;
    return mix(canvas, blurred, mask);
}
`,

    sharpen: `
// Sharpen filter brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    if (mask < 0.01) return canvas;
    
    vec4 center = canvas * 5.0;
    vec4 neighbors = 
        getCanvasColorOffset(vec2(-1.0, 0.0)) +
        getCanvasColorOffset(vec2(1.0, 0.0)) +
        getCanvasColorOffset(vec2(0.0, -1.0)) +
        getCanvasColorOffset(vec2(0.0, 1.0));
    
    vec4 sharpened = center - neighbors;
    sharpened = clamp(sharpened, 0.0, 1.0);
    
    return mix(canvas, sharpened, mask * 0.8);
}
`,

    pixelate: `
// Pixelation brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    if (mask < 0.01) return canvas;
    
    float pixelSize = 8.0;
    vec2 pixelUV = floor(uv * u_resolution / pixelSize) * pixelSize / u_resolution;
    vec4 pixelated = getCanvasColor(pixelUV);
    
    return mix(canvas, pixelated, mask);
}
`,

    invert: `
// Color inversion brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    vec4 inverted = vec4(1.0 - canvas.rgb, canvas.a);
    return mix(canvas, inverted, mask);
}
`,

    saturate: `
// Saturation boost brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    float gray = dot(canvas.rgb, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(gray), canvas.rgb, 2.0);
    saturated = clamp(saturated, 0.0, 1.0);
    
    return mix(canvas, vec4(saturated, 1.0), mask);
}
`,

    emboss: `
// Emboss effect brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    if (mask < 0.01) return canvas;
    
    vec4 tl = getCanvasColorOffset(vec2(-1.0, -1.0));
    vec4 br = getCanvasColorOffset(vec2(1.0, 1.0));
    
    vec4 embossed = (canvas - tl + br);
    embossed = vec4(vec3(0.5) + embossed.rgb * 0.5, 1.0);
    
    return mix(canvas, embossed, mask);
}
`,

    noise: `
// Noise/grain brush
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    float noise = random(uv * u_resolution + u_time * 100.0);
    vec4 noisy = canvas + vec4(vec3(noise - 0.5) * 0.3, 0.0);
    noisy = clamp(noisy, 0.0, 1.0);
    
    return mix(canvas, noisy, mask);
}
`,

    smudge: `
// Smudge/smear brush
vec4 brushEffect(vec2 uv) {
    vec4 canvas = getCanvasColor(uv);
    float mask = getBrushMask(uv);
    
    if (mask < 0.01) return canvas;
    
    // Sample from brush center direction
    vec2 brushCenter = u_brushPos / u_resolution;
    vec2 dir = normalize(brushCenter - uv) * 0.01;
    
    vec4 smudged = getCanvasColor(uv + dir * mask);
    
    return mix(canvas, smudged, mask * 0.5);
}
`
};