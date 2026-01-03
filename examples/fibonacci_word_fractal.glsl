// Fibonacci Word Fractal - Interactive with Rotational Symmetry
// Mouse X: turn angle (90° at center, varies from 30° to 150°)
// Mouse Y: zoom level
// Click and drag to explore!

const float PI = 3.14159265;
const float SYMMETRY = 5.0;  // Number of rotational copies (2, 3, 4, 5, etc.)

// Get nth character of Fibonacci word
int fibWordChar(int n) {
    float phi = (1.0 + sqrt(5.0)) / 2.0;
    int a = int(floor(float(n + 1) * phi));
    int b = int(floor(float(n) * phi));
    return (a - b == 2) ? 1 : 0;
}

// Rotate a vector by angle
vec2 rotate(vec2 v, float a) {
    float c = cos(a), s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// Distance from point to line segment
float distToSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Mouse controls
    vec2 mouse = iMouse.xy / iResolution.xy;
    if (iMouse.z < 0.5) {
        // Default: animate when not clicking
        mouse = vec2(0.5 + 0.3 * sin(iTime * 0.5), 0.5 + 0.2 * sin(iTime * 0.3));
    }
    
    // Turn angle: mouse X controls angle (30° to 150°, 90° at center)
    float turnAngle = mix(0.3, 1.6, 1.-mouse.x);  // ~30° to ~150°
    
    // Zoom: mouse Y controls scale
    float zoom = mix(0.0001, 0.01, mouse.y);
    
    // Number of steps
    int maxSteps = int(iMouse.x*3.);
    
    // Transform point to curve space
    vec2 p = uv / zoom;
    
    // Rotational symmetry via polar domain repetition
    float pAngle = atan(p.y, p.x);
    float radius = length(p);
    float sector = 2.0 * PI / SYMMETRY;
    
    // Fold angle into primary sector
    float foldedAngle = mod(pAngle + sector * 0.5, sector) - sector * 0.5;
    
    // Check current sector AND adjacent sectors (for curves crossing boundaries)
    vec2 p0 = radius * vec2(cos(foldedAngle), sin(foldedAngle));              // Current
    vec2 p1 = radius * vec2(cos(foldedAngle + sector), sin(foldedAngle + sector));  // Next
    vec2 p2 = radius * vec2(cos(foldedAngle - sector), sin(foldedAngle - sector));  // Prev
    
    // Trace curve once, check distance from all three domain positions
    float minDist = 1e10;
    vec2 pos = vec2(0.0);
    vec2 dir = vec2(1.0, 0.0);
    float colorParam = 0.0;
    
    for (int i = 0; i < maxSteps; i++) {
        vec2 prevPos = pos;
        pos += dir;
        
        // Distance to this segment from all sector positions
        float d0 = distToSegment(p0, prevPos, pos);
        float d1 = distToSegment(p1, prevPos, pos);
        float d2 = distToSegment(p2, prevPos, pos);
        float d = min(d0, min(d1, d2));
        
        if (d < minDist) {
            minDist = d;
            colorParam = float(i) / float(maxSteps);
        }
        
        // Turn on '0' character
        if (fibWordChar(i) == 0) {
            float a = ((i & 1) == 0) ? turnAngle : -turnAngle;
            dir = rotate(dir, a);
        }
    }
    
    // Convert distance to screen space
    float d = minDist * zoom;
    
    // Dynamic line width based on zoom
    float lineWidth = 0.003;
    
    // Background with subtle gradient
    vec3 col = mix(vec3(0.02, 0.02, 0.08), vec3(0.08, 0.02, 0.05), uv.y + 0.5);
    
    // Rainbow glow based on position along curve
    vec3 rainbow = 0.5 + 0.5 * cos(2.0 * PI * (colorParam + vec3(0.0, 0.33, 0.67)));
    col += rainbow * exp(-d * 60.0) * 0.8;
    
    // Golden core glow
    col += vec3(1.0, 0.8, 0.3) * exp(-d * 120.0);
    
    // White hot core
    float core = smoothstep(lineWidth, lineWidth * 0.2, d);
    col = mix(col, vec3(1.0), core);
    
    // Vignette
    col *= 1.0 - 0.4 * length(uv);
    
    // Show current angle in corner (subtle)
    float angleDeg = turnAngle * 180.0 / PI;
    
    fragColor = vec4(col, 1.0);
}
