// ============================================================================
// Cornell Box Path Tracer - Image (Display)
// ============================================================================
// Reads accumulated result from Buffer A and applies tone mapping.
//
// SHADERTOY SETUP:
//   Buffer A: iChannel0 = Buffer A (self)
//   Image:    iChannel0 = Buffer A
// ============================================================================

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    // Read from Buffer A
    vec4 data = texture(iChannel0, uv);
    vec3 color = data.rgb;
    float sampleCount = data.a;
    
    // Tone mapping (Reinhard)
    color = color / (1.0 + color);
    
    // Gamma correction
    color = pow(color, vec3(0.4545));
    
    // Progress bar showing sample count (fills up to 1000 samples)
    if (fragCoord.x < 100.0 && fragCoord.y < 6.0) {
        float progress = clamp(sampleCount / 1000.0, 0.0, 1.0);
        if (fragCoord.x < progress * 100.0) {
            color = vec3(0.2, 0.8, 0.3);
        } else {
            color = vec3(0.15);
        }
    }
    
    fragColor = vec4(color, 1.0);
}
