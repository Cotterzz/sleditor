float metaDiamond(vec2 p, vec2 pixel, float r) {
    vec2 d = abs(p - pixel);
    return r / (d.x + d.y);
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 6; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}


void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (2.0 * fragCoord - iResolution.xy*0.1*iTime) / iResolution.y;

    vec3 starColor = vec3(0.0);
    vec2 grid = floor(uv);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 cell = grid + vec2(x, y);
            vec2 starPos = cell + vec2(hash(cell), hash(cell.yx)) - 0.5;
            float starSize = hash(cell * 1.5) * 0.01;
            starColor += vec3(1.0, 0.95, 0.8) * metaDiamond(uv, starPos, starSize);
        }
    }
    
    vec2 p = uv * 2.5;
    
    float t = iTime * 0.1;
    float q = fbm(p - t);
    float r = fbm(p + q + vec2(1.7, 9.2) + 0.15 * t);
    float f = fbm(p + r);

    f = pow(f, 3.0); 

    vec3 nebulaColor = mix(vec3(0.1, 0.0, 0.2), vec3(0.6, 0.1, 0.5), f * 2.0);
    nebulaColor = mix(nebulaColor, vec3(0.9, 0.6, 0.2), length(q));
    nebulaColor = mix(nebulaColor, vec3(0.9, 0.9, 0.9), length(r));
    nebulaColor = nebulaColor * f * f * f + nebulaColor * f * f + nebulaColor * f;

    vec3 finalColor = nebulaColor + starColor;

    finalColor *= vec3(1.0, 0.9, 1.2); 
    vec2 b = fract(10.0*p);
    p = floor(10.0*p);
    if( fbm(vec2(p.x*p.y)) > (0.75 ))
        finalColor += clamp(vec3(1.0,0.8,0.8)*pow((50.0 - 40.0*fbm(vec2(p.x+p.y)))*length(b-vec2(0.8*fbm(vec2(p.x*p.y)),0.8*fbm(vec2(p.x*p.y+123.4)))),-1.5),0.0,1.0);

finalColor += vec3(0.5,0.1,0.2)*smoothstep(1.0,0.0,abs(uv.y));
    fragColor = vec4(finalColor, 1.0);
}