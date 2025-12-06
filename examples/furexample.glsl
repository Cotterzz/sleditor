// First proof of concept for raymarched hair/fur
// I wondered if we couldn't just use domain repetition, in between an outer and inner sphere,
// using perpendicular intervals to make a grid for the hair, with the hairs as grid points on a polar plane.
// Still lots of things to do like shaping the hair more, light/shadow and adapting to more complex shapes
// I also need to use cell noise on the grid positions so the hairs arent in perfect rows.
// It's very fast though, without AA it's 60fps on intel 630 at 1200x675 with seemingly any number of hairs.

// Check out v2 here: https://www.shadertoy.com/view/3fsyzn

#define AA 4.0 // 1. is off, 4. is 2x2 etc...

float sdSphere(vec3 p, float r) {return length(p) - r;}

vec2 cartesianToSpherical(vec3 p) {
    float r = length(p);
    if(r < 0.001) return vec2(0.0);
    vec3 n = p / r;
    float lon = atan(n.z, n.x);
    float lat = acos(clamp(n.y, -1.0, 1.0));
    return vec2(lat, lon);
}

vec3 applyDroop(vec3 p) {
    float radialDist = length(p);
    float normalizedRadius = (radialDist - 0.4) / 0.7; // 0 at inner sphere, 1 at outer
    
    // Calculate droop amount based on distance from inner sphere
    float droopFactor = normalizedRadius * normalizedRadius;
    float droopAmount = droopFactor * 0.4; 
    
    vec3 droopedPos = p;
    droopedPos.y -= droopAmount;
    
    float curlFactor = droopFactor * 0.1;
    vec3 toCenter = -normalize(vec3(p.x, 0.0, p.z));
    droopedPos += toCenter * curlFactor;
    
    return droopedPos;
}

// Distance function for hair based on lat/lon grid with drooping
float sdRadialLine(vec3 p, float gridSpacing, float thickness) {
    vec3 straightPos = p;

    for(int i = 0; i < 3; i++) {
        vec3 drooped = applyDroop(straightPos);
        vec3 error = p - drooped;
        straightPos += error * 0.7;
    }
    
    vec2 spherical = cartesianToSpherical(straightPos);
    
    float lat = spherical.x;
    float lon = spherical.y;

    float lonSpacing = gridSpacing / max(sin(lat), 0.1);
    
    vec2 gridPos = vec2(lat, lon);
    vec2 gridCell = vec2(
        round(gridPos.x / gridSpacing) * gridSpacing,
        round(gridPos.y / lonSpacing) * lonSpacing
    );
    vec2 toLine = gridPos - gridCell;

    toLine.y *= sin(lat);
    float distToLine = length(toLine);

    if(distToLine > gridSpacing * 0.8) return 1e10;
    
    float radialDist = length(straightPos);
    float normalizedRadius = (radialDist - 0.5) / 0.5;

    float taperFactor = 1.0 - normalizedRadius;
    float currentThickness = thickness * taperFactor;
    
    return distToLine - currentThickness;
}


float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.78));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

vec2 getHairID(vec3 p, float gridSpacing) {
    vec3 straightPos = p;
    for(int i = 0; i < 3; i++) {
        vec3 drooped = applyDroop(straightPos);
        vec3 error = p - drooped;
        straightPos += error * 0.7;
    }
    
    vec2 spherical = cartesianToSpherical(straightPos);
    float lat = spherical.x;
    float lon = spherical.y;
    
    float lonSpacing = gridSpacing / max(sin(lat), 0.1);
    
    vec2 gridCell = vec2(
        round(lat / gridSpacing),
        round(lon / lonSpacing)
    );
    
    return gridCell;
}

float map(vec3 p) {return sdSphere(p, 0.4);}

float mapWithLines(vec3 p, float lineSpacing, float lineThickness) {
    float innerSphere = sdSphere(p, 0.4);
    float lines = sdRadialLine(p, lineSpacing, lineThickness);
    return min(innerSphere, lines);
}

bool isBetweenSpheres(vec3 p) {
    float distFromCenter = length(p);
    return distFromCenter > 0.4 && distFromCenter < 1.0;
}

float getHairOpacity(vec3 p) {
    vec3 straightPos = p;
    for(int i = 0; i < 3; i++) {
        vec3 drooped = applyDroop(straightPos);
        vec3 error = p - drooped;
        straightPos += error * 0.7;
    }
    
    float radialDist = length(straightPos);
    float normalizedRadius = (radialDist - 0.5) / 0.5;
    return 1.0 - normalizedRadius * 0.8;
}

vec4 raymarchWithLines(vec3 ro, vec3 rd, float lineSpacing, float lineThickness) {
    float t = 0.0;
    
    for(int i = 0; i < 100; i++) {
        vec3 p = ro + rd * t;
        
        float d;
        if(isBetweenSpheres(p)) {
            d = mapWithLines(p, lineSpacing, lineThickness);
        } else {
            d = map(p);
        }
        
        if(d < 0.001) {
            float objectId = 0.0;
            float opacity = 1.0;
            vec2 hairID = getHairID(p, lineSpacing);
            if(isBetweenSpheres(p)) {
                float innerDist = sdSphere(p, 0.3);
                float lineDist = sdRadialLine(p, lineSpacing, lineThickness);
                
                if(lineDist < innerDist) {
                    objectId = 1.0;
                    opacity = getHairOpacity(p);
                }
            }
            
            
            return vec4(t, objectId, hash(hairID), opacity);
        }
        
        t += d * 0.8;
        
        if(t > 10.0) break;
    }
    
    return vec4(-1.0, -1.0, 0.0, 0.0);
}

vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r*r;
    float h = b*b - c;
    if(h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

void mainImage0(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float time = iTime * 0.5;
    float radius = 3.0;
    float height = sin(time * 0.7) * 0.5;
    
    vec3 ro = vec3(
        radius * cos(time),
        height,
        radius * sin(time)
    );
    
    vec3 target = vec3(0.0, 0.0, 0.0);
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);
    
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);
   
    vec3 col = vec3(0.3);
    
    float lineSpacing = iMouse.x/iResolution.x/3.;
    float lineThickness = iMouse.y/iResolution.y/50.;
    
    if(lineSpacing <= 0.) lineSpacing = 0.1;
    if(lineThickness <= 0.) lineThickness = 0.002;
    
    vec2 outerHit = raySphere(ro, rd, 1.0);
    
    if(outerHit.x > 0.0) {
        vec3 pEnter = ro + rd * outerHit.x;
        
        vec3 roInner = pEnter + rd * 0.001;
        vec4 hit = raymarchWithLines(roInner, rd, lineSpacing, lineThickness);
        
        if(hit.x > 0.0) {
            vec3 pHit = roInner + rd * hit.x;
            vec3 nHit = normalize(pHit);
            
            vec3 lightPos = vec3(2.0, 2.0, -2.0);
            vec3 lightPos2 = vec3(0.0, -3.0, -0.0);
            vec3 lightDirInner = normalize(lightPos - pHit);
            vec3 lightDirInner2 = normalize(lightPos2 - pHit);
            float diffInner = max(dot(nHit, lightDirInner), 0.0);
            float diffInner2 = max(dot(nHit, lightDirInner2), 0.0);
            float ambient = 0.5;
            
            vec3 hitCol;
            if(hit.y > 0.5) {
                float hairRandom = hit.z;
                vec3 haircolA = vec3(0.85, 0.6, 0.3);
                vec3 haircolB = vec3(0.5, 0.4, 0.0);
                vec3 hairBaseCol = mix(haircolA, haircolB, hairRandom);
                hitCol = hairBaseCol * (diffInner + ambient);
                hitCol += vec3(0.3,0,0) * (diffInner2 + ambient);
                float spec = pow(max(dot(reflect(-lightDirInner, nHit), -rd), 0.0), 16.0);
                hitCol += vec3(0.4) * spec;
                float opacity = hit.w;
                col = mix(col, hitCol, opacity);
            } else {
                hitCol = vec3(0.5);
                col = hitCol;
            }
        }
    }
    
    fragColor = vec4(col, 1.0);
}

// multisampling, from "Weyl Supersample Any Shader" by spalmer https://www.shadertoy.com/view/WXjXRt
// (forked from from "postprocess existing shaders" by FabriceNeyret2 https://www.shadertoy.com/view/NdyfRz 
void mainImage(out vec4 o, vec2 u) 
{ 
    float s = AA, k; 
    vec2 j = vec2(.5); 
    o = vec4(0); 
    vec4 c; 
    mainImage0(c, u); 
    for (k = s; k-- > .5; ) { 
        mainImage0(c, u + j - .5); 
        o += c; 
        j = fract(j + vec2(.755, .57).yx); 
    };o /= s;o.a==1.;
} 