



Image: `// Sleditor V2 - Default Shader
// Shadertoy-compatible format

void mainImage0(out vec4 fragColor, in vec2 fragCoord) {

        vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
    vec2 p = fragCoord;
    p*=1.5;
    p-=iResolution.xy/4.;


    vec2 luv = (p - 0.5 * iResolution.xy) / iResolution.y;
    luv /=(3./(min(16.,iTime)/5.));
    float d = SL(luv);

    col = d>0.?vec3(0.2, 0.4, 0.8):col;
    fragColor = vec4(col, d>0.?0.:1.);

}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    if (iTheme == 0) {
    float s = 8., k;
    vec2 j = vec2(.5);
    fragColor = vec4(0);
    vec4 c;
    mainImage0(c, fragCoord);
    for (k = s; k-- > .5; ) {
        mainImage0(c, fragCoord + j - .5);
        fragColor += c;
        j = fract(j + vec2(.755, .57).yx);
    };fragColor /= s;
    return;
    } else if (iTheme == 1) {
        fragColor = texture(iChannel1,uv);
        return;
    } else if (iTheme == 2) {
        fragColor = texture(iChannel5,uv);
        return;
    }else if (iTheme == 3) {
        fragColor = texture(iChannel3,uv);
        return;
    } else if (iTheme == 4) {
        fragColor = texture(iChannel2,uv);
        return;
    } else if (iTheme == 5) {
        fragColor = texture(iChannel4,uv);
        return;
    }else {
        fragColor = vec4(0);
        return;
    }
}`,
    Common: `// Common code - shared between all passes
// Functions here are prepended to every shader

#define PI 3.14159265359
#define TAU 6.28318530718

// SDF for a box
float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// U shape - semicircle with extended straight bars
float letterU(vec2 p, float radius, float thickness, float extension) {
    float shape = 1e10;
    
    // Bottom curved part - semicircle
    float outer = length(p - vec2(0.0, 0.0)) - radius;
    float inner = length(p - vec2(0.0, 0.0)) - (radius - thickness);
    float ring = max(outer, -inner);
    // Cut off the top half
    ring = max(ring, p.y);
    shape = min(shape, ring);
    
    // Left vertical bar extension
    vec2 leftBarPos = vec2(-radius + thickness * 0.5, extension * 0.5);
    float leftBar = sdBox(p - leftBarPos, vec2(thickness * 0.5, extension * 0.5));
    shape = min(shape, leftBar);
    
    // Right vertical bar extension
    vec2 rightBarPos = vec2(radius - thickness * 0.5, extension * 0.5);
    float rightBar = sdBox(p - rightBarPos, vec2(thickness * 0.5, extension * 0.5));
    shape = min(shape, rightBar);
    
    return shape;
}

// S shape made from two U shapes
float letterS(vec2 p, float radius, float thickness, float extension, vec2 shift) {
    // Bottom U - shifted down and right
    vec2 bottomPos = p + shift;
    float bottomU = letterU(bottomPos, radius, thickness, extension*0.4);
    
    // Top U - flipped and shifted up and left
    vec2 topPos = p - shift;
    topPos.y = -topPos.y; // Flip vertically
    float topU = letterU(topPos, radius, thickness, extension);
    
    // Combine both U shapes to form S
    return min(bottomU, topU);
}

// L shape made from two rectangles
float letterL(vec2 p) {
    // Vertical bar
    float vertical = sdBox(p - vec2(0.0, 0.23), vec2(0.064, 0.34));
    
    // Horizontal bar (at the bottom)
    float horizontal = sdBox(p - vec2(0.1165, -0.1), vec2(0.18, 0.064));
    
    // Combine both bars to form L
    return min(vertical, horizontal);
}

// 2D rotation matrix
mat2 rotate2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}


float SL(vec2 luv){
    float angle = -radians(115.0);
    luv = rotate2D(angle) * luv;
    float radius = 0.21;
    float thickness = 0.11;
    float extension = 0.12;
    vec2 shift = vec2(0.155, 0.05);
    float distS = letterS(luv+vec2(-0.1,0.2), radius, thickness, extension, shift);
        // L: just position it, no rotation

    vec2 lPos = rotate2D(-angle) * (luv + vec2(-0.12,-0.23));
    float distL = letterL(lPos);
    
    // Combine both letters
    return min(distS, distL);
}`,
    BufferA: `#define NEWVALUE values[int(floor(float(v)*rand(seed+float(i))))] * (sin(iTime*rand(seed+float(i)))*rand(seed+float(i)))
#define NEWVALUE2 values[int(floor(float(v)*rand(seed+float(i+5))))] * (sin(iTime*rand(seed+float(i)))*rand(seed+float(i+5)))

int PALETTE = 9;
float gdist = 0.;



// it's a tunnel (cylinder) with noise
// added to it, rotated, etc
float isolines(vec3 p) {

    float s, i, n, T = iTime;

    // distort p space with turbulence
    p += cos(p.z+T+p.yzx*.5)*.6;

    // sample cylinder
    s = 4.-length(p.xy);

    // rotate p for noise (aesthetic iirc)
    p.xy *= mat2(cos(.3*T+vec4(0,33,11,0)));

    // noise loop
    for (n = .01; n < 1.; n += n )
        s -= abs(dot(sin( p.z + T + 4.*p/n ), vec3(1.2))) * n;

    return s;
}

vec3 fire(vec4 o, vec2 u) {
    float d=1.,a,i,s,t = .1*(sin(iTime*.4) + iTime  );
    vec3  p = iResolution;    
    u = (u+u-p.xy)/p.y;
    u *= mat2(cos(sin(iTime*.05)*2.+vec4(0,33,11,0)));
    u += cos(t*vec2(.4,.8)) * vec2(.3,.1);
    for(o*=0.; i++<64.; o += 1./s )
        // sample position
        // p = ro + rd * d, p.z += t * 1e1
        p = vec3(u*d,d+t*1e1),
        // get dist to iso lines
        d += s = .01 + abs(isolines(p))*.15;
    // color and tone map
    return (vec4(1,.5,0.2,0)*o/1e3).rgb;
}


float rand(float n){return fract(cos(n*89.42)*343.42);}
vec2 shake() {
    return vec2(
        sin(iTime*1e2),
        cos(iTime*2e2)
    ) * max(0.,1.2-iTime)/20.;
}
float nz(vec2 nv){
    float o = 0.;
    for (float i = .2; i < 2.;
    o += abs(dot(sin(nv * i * 64.), vec2(.05))) / i,
    i *= 1.4142);
    return mix(o,  distance(vec2(0), nv), 0.5 + (sin(iTime)/2.));
}

float rMix(float a, float b, float s){
    s = rand(s);
    return s>0.9?sin(a):s>0.8?sqrt(abs(a)):s>0.7?a+b:s>0.6?a-b:s>0.5?b-a:s>0.4?nz(vec2(a,b)):s>0.3?b/(a==0.?0.01:a):s>0.2?a/(b==0.?0.01:b):s>0.1?a*b:cos(a);
}

vec3 gpc(float t) {
    return 0.5 + 0.5*cos(vec3(0,2,4) + t*2.0);
}

vec3 hsl2rgb( in vec3 c ){
    vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}
vec3 contrast(vec3 color, float value) {
  return 0.5 + value * (color - 0.5);
}

vec3 gammaCorrection (vec3 colour, float gamma) {
  return pow(colour, vec3(1. / gamma));
}


vec3 addColor(float num, float seed, float alt){
    if(isinf(num)){num = alt * seed;}
    if(PALETTE == 7){
        vec3 col = contrast(gpc(num),1.7);
        return col;} else if(PALETTE > 2 || (PALETTE == 1 && rand(seed+19.)>0.3)){
        float sat = 1.;
        if(num<0.){sat = 1.-(1./(abs(num)+1.));}
        float light = 1.0-(1./(abs(num)+1.));
        vec3 col = hsl2rgb(vec3(fract(abs(num)), sat, light));
        if(PALETTE == 1){col *= 2.;}
        return col;
    } else {
        vec3 col = vec3(fract(abs(num)), 1./num, 1.-fract(abs(num)));
        if(rand(seed*2.)>0.5){col = col.gbr;}
        if(rand(seed*3.)>0.5){col = col.gbr;}
        if(PALETTE == 1){col += (1.+cos(rand(num)+vec3(4,2,1))) / 2.;}
        return col;
    }
}

vec3 sanitize(vec3 dc){
    dc.r = min(1., dc.r);
    dc.g = min(1., dc.g);
    dc.b = min(1., dc.b);
    
    if(!(dc.r>=0.) && !(dc.r<0.)){
        return vec3(1,0,0);
    } else if(!(dc.g>=0.) && !(dc.g<0.)){
        return vec3(1,0,0);
    } else if(!(dc.b>=0.) && !(dc.b<0.)){
        return vec3(1,0,0);
    } else {
        return dc;
    }

}

vec3 mainAgg(vec2 uv, float seed, float pixely){
   // uv = fragCoord/iResolution.y;
    uv.x-=0.5*iResolution.x/iResolution.y;
    uv.y-=0.5;


    uv = pixely>0.?(floor(uv/pixely))*pixely:uv;

    uv += shake();
    float zoom = 4. + (3.*(sin(iTime/1.5)+1.));
    vec2 guv = (uv*zoom);
    float x = guv.x;
    float y = guv.y;
    float o = nz(guv);
   // float seed = floor(iTime/1.0);
    PALETTE = int(floor(float(8)*rand(seed+66.)));
    const int v = 24;
    vec3 col = vec3(0);
    float cn = 1.;
    float values[v];
    values[0] = 1.0;
    values[1] = 10.0;
    values[2] = x;
    values[3] = y;
    values[4] = x*x;
    values[5] = y*y;
    values[6] = x*x*x;
    values[7] = y*y*y;
    values[8] = x*x*x*x;
    values[9] = y*y*y*y;
   values[10] = x*y*x;
   values[11] = y*y*x;
   values[12] = sin(y);
   values[13] = cos(y);    
   values[14] = sin(x);
   values[15] = cos(x);   
   values[16] = sin(y)*sin(y);
   values[17] = cos(y)*cos(y);
   values[16] = sin(x)*sin(x);
   values[17] = cos(x)*cos(x);
   values[18] = 2.;
   values[19] = distance(vec2(x,y), vec2(0));
   values[20] = 3.14159;
   values[21] = atan(x, y)*4.;
   values[22] = o;
   values[23] = distance(vec2(x,y), vec2(0))*sin(atan(x, y));
   
    float total = 0.;
    float sub = 0.;
    int maxi = 30; int mini = 5;
    int iterations = min(maxi,mini + int(floor(rand(seed*6.6)*float(maxi-mini))));
    
    for(int i = 0; i<iterations; i++){
        if(rand(seed+float(i+3))>rand(seed)){
            sub = sub==0. ? rMix(NEWVALUE, NEWVALUE2, seed+float(i+4)) : rMix(sub, rMix(NEWVALUE, NEWVALUE2, seed+float(i+4)), seed+float(i));
        } else {
            sub = sub==0. ? NEWVALUE : rMix(sub, NEWVALUE, seed+float(i));
        }
        if(abs(sub)<1.){seed+=100.;PALETTE = int(floor(float(8)*rand(seed+66.)));}
        if(rand(seed+float(i))>rand(seed)/2.){
            total = total==0. ? sub : rMix(total, sub,seed+float(i*2));
            sub = 0.;
            col += addColor(total, seed+float(i), values[21]);
            cn+=1.;
        }
    }
    total = sub==0. ? total : rMix(total, sub, seed);
    col += addColor(total, seed, values[21]);
    col /=cn;
    if(PALETTE<3){col/=(3.* (0.5 + rand(seed+13.)));}
    if(PALETTE == 4){col = pow(col, 1./col)*1.5;}
    if(PALETTE == 2 || PALETTE == 5 ){col = hsl2rgb(col);}
    
    if(PALETTE == 6){
        col = hsl2rgb(hsl2rgb(col));
        if(rand(seed+17.)>0.5){col = col.gbr;}
        if(rand(seed+19.)>0.5){col = col.gbr;}
    }

    col = sanitize(col);
    return col;
}


void mainImage0(out vec4 c, vec2 p) {
   p*=1.5;
    p-=iResolution.xy/4.;

    
    float pix = 0.;


        vec2 uv = (p - 0.5 * iResolution.xy) / iResolution.y;

        
        float wave = sin((uv.x+(iTime/5.))*50.)/3.;

        wave += sin((uv.x+(iTime/3.))*17.)/3.;

        wave += sin((uv.x+(iTime*-1.7))*19.)/7.;

        wave += sin((uv.x+(iTime*1.9))*19.)/7.;

        wave += sin((uv.x+(iTime*-1.2))*17.5)/1.5;

        wave += sin((uv.x+(iTime*-1.5))*47.0)/1.0;
        wave += sin((uv.x+(iTime*-0.5))*147.0)/3.0;
wave += sin((uv.x+(iTime*0.5))*247.0)/4.0;
        wave /=10.;
        wave *= abs(uv.x);
        float wav = abs(uv.y-wave);
    vec2 luv = uv;
        luv /=(3./(min(16.,iTime)/5.));
       bool inside=true; if(luv.x<-0.15||luv.x>0.1){inside=false;}
    // Rotate 100 degrees clockwise = -100 degrees = -1.745 radians
    float dist = SL(luv);
    if(!inside){dist = min(wav+0.01, dist);}
    dist -= 0.015;
    float pixely = 6.;//-floor(dist*40.);//pow(2., floor(abs((p.y/iResolution.y)-0.5)*10.));
    float speedy = .03;
    if(dist > 0.0) {
   // if(left){p = (floor(p/pixely))*pixely;}
    //speedy*=-1.5;
    // p = (floor(p/pixely))*pixely;
    pix = 0.1;
    } else{
       
    }

    vec2 r = iResolution.xy;
    vec2 h = (p / r * 2. - 1.) * sqrt(r / r.yx);
    vec3 g = vec3(1, h.yx) / (dot(h, h) + 1.) + vec3(-.5, 0, .5);
    h = g.xy / dot(g, g);
    h = vec2(atan(h.x, h.y), log(length(h))) / 6.28;
    h += vec2(iMouse.x/400.,iMouse.y/400.)+iTime/40.;
    h *= mat2(8, 5, -5, 8);
    
    // Get the cell coordinates (which cell we're in)
    vec2 cellID = floor(h);
    
    //--------thx to chronos for this seam fix.------
    cellID = mod(cellID, vec2(8,5));

    float pma = .11;
    float pmb = .07;
    float pmc = .23;

    float hotxA = floor(rand(floor(iTime*pma))*8.);
    float hotyA = floor(rand(floor(iTime*pma))*5.);
    float hotxB = floor(rand(floor(iTime*pmb))*8.);
    float hotyB = floor(rand(floor(iTime*pmb))*5.);
    float hotxC = floor(rand(floor(iTime*pmc))*8.);
    float hotyC = floor(rand(floor(iTime*pmc))*5.);
    float phaseA = fract(iTime*pma);
    float phaseB = fract(iTime*pmb);
    float phaseC = fract(iTime*pmc);
    bool hotCellA = cellID==vec2(hotxA,hotyA);
    bool hotCellB = cellID==vec2(hotxB,hotyB);
    bool hotCellC = cellID==vec2(hotxC,hotyC);
    bool hotCell = hotCellA||hotCellB||hotCellC;

    float phase = hotCellA?phaseA:hotCellB?phaseB:phaseC;
    float pcurve = 1.0 - smoothstep(0.0, 0.25, phase) + smoothstep(0.75, 1.0, phase);
    if(pix>0.){pix = hotCell?0.05:0.08;}
    
    // Get local UV within the cell (0 to 1)
    vec2 cellUV = fract(h);
    
    // Create a unique seed from cell coordinates
    // Simple hash - you can make this more sophisticated if needed
    float seed = cellID.x + cellID.y * 10.0;
    // Or better hash:
    // float seed = dot(cellID, vec2(127.1, 311.7));
    // seed = fract(sin(seed) * 43758.5453);
    
    // Now call your pattern function:
    // vec3 pattern = yourPatternFunction(cellUV, seed);
    
    // Example visualization showing the UVs and cell IDs:
    vec3 col = mainAgg(cellUV, seed, pix);

    if(dist>0.){p = (floor(p/6.))*6.;}

    vec3  cf = fire(c,p);
    if(hotCell&&dist<0.){col=cf;}
    // Or keep the original square pattern:
    // c = vec4(max(abs(cellUV.x - .5), abs(cellUV.y - .5)) * 2.);
    if(dist<0.){
        c = vec4(col, 1.0)-pow(vec4(max(abs(cellUV.x - .5), abs(cellUV.y - .5)) * 2.15),vec4(16.))/3.;
    } else{
        c = vec4(col, 1.0);
    }
    

    
    // Fill the S
     
     
    if(dist >= 0.0 && !hotCell) {
       c.rgb = clamp(c.rgb, vec3(0), vec3(1));
        c.b=1.;
        c.rgb+=tanh(dist*12.);


        //c=tanh(c*1.9);
        


    } else if (dist >= 0.0 && hotCell){
       //c.rgb=c.rgb*abs(dist*103.);
        //c.b=.9;
        if(c.r>0.5||c.g>0.5||c.b<0.3){
            c.rgb = (c.rgb+vec3(4.))/3.;
        } else {
            c.rgb = (c.rgb+vec3(2.))/2.;
        }
        c.rgb=cf.bgr+0.5;//mix(c.rgb, vec3(1), pcurve);
    } //else if(!hotCell){}
    float thr = clamp(1.-abs(dist*100.), 0.0, 1.0);
    c = mix(c, vec4(0,0.0,0.5,1), thr);
    gdist=dist;
    //if(wav<0.003){c.rgb=vec3(0,0,0.3);}

        if(dist>0.){c = mix(c, cf.bgrr, max(0.,min(1.,tanh(dist*2.))));}

        c.a=0.6-dist*150.;
}

void mainImage(out vec4 o, vec2 u) 
{ 
    if (iTheme == 1) {
    float s = 4., k; 
    vec2 j = vec2(.5); 
    o = vec4(0); 
    vec4 c; 
    mainImage0(c, u); 
    for (k = s; k-- > .5; ) { 
        mainImage0(c, u + j - .5); 
        o += c; 
        j = fract(j + vec2(.755, .57).yx); 
    };o /= s;
    o=gdist>0.?tanh(o*1.9):tanh(o*1.4);
    } else {
        o=vec4(1);
    }
}

`,
    BufferB: `// BufferB - Render pass
// Output: iChannel2

#define MODE 0  // 0 = outside/around letters, 1 = inside letters only

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    if (iTheme == 4) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(0.0);
    
    // Main big letters
    vec2 p = fragCoord;
    p *= 1.5;
    p -= iResolution.xy / 4.;
    vec2 luv = (p - 0.5 * iResolution.xy) / iResolution.y;
    luv /= (3. / (min(16., iTime) / 5.));
    float d = SL(luv);
    
    bool insideLetter = d <= 0.;
    
    // Matrix rain parameters
    float numColumns = 60.0;
    float columnWidth = iResolution.x / numColumns;
    float columnIndex = floor(fragCoord.x / columnWidth);
    
    // Pseudo-random values per column
    float randSeed = fract(sin(columnIndex * 12.9898) * 43758.5453);
    float speed = 70.0 + randSeed * 150.0;
    float offset = randSeed * 1000.0;
    float trailLength = 120.0 + randSeed * 180.0;
    
    // Calculate position in the falling trail
    float yPos = mod((fragCoord.y + iTime * speed + offset), iResolution.y + trailLength);
    
    // Check if we should render based on mode
    bool shouldRender = false;
    if (MODE == 0) {
        // Outside/around mode - render where NOT inside letters
        shouldRender = !insideLetter;
    } else {
        // Inside mode - render only inside letters
        shouldRender = insideLetter;
    }
    
    if (shouldRender && yPos < trailLength) {
        // Create individual falling letters
        float letterSize = 20.0;
        vec2 letterCoord = fragCoord;
        letterCoord.x = mod(letterCoord.x, columnWidth);
        letterCoord.y = mod(letterCoord.y + iTime * speed + offset, letterSize * 2.0);
        
        // Center the letter in its cell
        vec2 letterUV = (letterCoord - vec2(columnWidth, letterSize) * 0.5) / (letterSize * 0.5);
        
        // Random letter variation per position
        float letterRand = fract(sin(columnIndex * 43.0 + floor((fragCoord.y + iTime * speed) / 16.0)) * 123.45);
        letterUV.x += (letterRand - 0.5) * 0.3;
        
        float letterDist = SL(letterUV * 0.8);
        
        // Fade based on position in trail (bright at head, dim at tail)
        float brightness = 0.8 - (yPos / trailLength);
        brightness *= brightness;
        
        // Extra brightness at the head
        float headGlow = smoothstep(30.0, 0.0, yPos) * 0.5;
        
        if (letterDist <= 0.0) {
            col = vec3(0.0, brightness + headGlow, 0.0);
        }
    }
    
    // Draw main letters (always green, bright)
    //if (insideLetter) {
        float edge= smoothstep(0.025, 0.0, d);
        col = max(col, vec3(0.0, edge * 0.5, 0.0));
    //}
    
    // Fade previous frame for trail effect
    vec3 prevCol = texture(iChannel2, uv).rgb;
    col = max(col, prevCol * 0.9);
    
    fragColor = vec4(col, col.g);
    } else {
        fragColor=vec4(1);
    }
}`,
    BufferC: `
// --- 2D SDF Letters ---
float sdS(vec2 p, float s) {
    p /= s;
    float d = 1e5;
    // Top arc
    vec2 p1 = p - vec2(0.0, 0.25);
    float a1 = atan(p1.y, p1.x);
    d = min(d, abs(length(p1) - 0.25) - 0.08);
    // Bottom arc
    vec2 p2 = p - vec2(0.0, -0.25);
    float a2 = atan(p2.y, p2.x);
    d = min(d, abs(length(p2) - 0.25) - 0.08);
    // Clip to form S shape
    float top = length(p - vec2(0.0, 0.25)) - 0.33;
    float bot = length(p - vec2(0.0, -0.25)) - 0.33;
    // Simplified S using semicircles
    float r = 0.22;
    float th = 0.09;
    vec2 pt = p - vec2(0.0, 0.22);
    float dt = abs(length(pt) - r) - th;
    if (pt.x < 0.0 && pt.y < -0.05) dt = length(pt + vec2(r, 0.05)) - th;
    vec2 pb = p - vec2(0.0, -0.22);
    float db = abs(length(pb) - r) - th;
    if (pb.x > 0.0 && pb.y > 0.05) db = length(pb - vec2(r, 0.05)) - th;
    d = min(dt, db);
    return d * s;
}

float sdL(vec2 p, float s) {
    p /= s;
    float th = 0.09;
    // Vertical bar
    float dv = max(abs(p.x) - th, abs(p.y) - 0.5);
    // Shift vertical to left
    float dv2 = max(abs(p.x + 0.15) - th, abs(p.y) - 0.5);
    // Horizontal bar at bottom
    float dh = max(abs(p.x - 0.05) - 0.3, abs(p.y + 0.5) - th);
    float d = min(dv2, dh);
    return d * s;
}

float sdSL(vec2 p) {
    float ds = sdS(p - vec2(-0.45, 0.0), 1.0);
    float dl = sdL(p - vec2(0.4, 0.0), 1.0);
    return min(ds, dl);
}

// --- 3D Extrusion ---
float sdExtrudedSL(vec3 p, float halfZ) {
    float d2d = SL(p.xy);
    float dz = abs(p.z) - halfZ;
    // Extrude: combine 2D sdf with Z slab
    float dOut = max(d2d, dz);
    float dIn = min(max(d2d, dz), 0.0);
    return length(max(vec2(d2d, dz), 0.0)) + min(max(d2d, dz), 0.0);
}

// --- Scene with animation ---
float mapScene(vec3 p) {
    // Animate: start big, shrink to center
    float t = clamp(iTime * 0.5, 0.0, 1.0);
    
    float scale = 1.5*(3./(min(16.,iTime)/5.));//mix(4.0, 1.0, smoothstep(0.0, 1.0, t));
    
    vec3 sp = p / scale;
    float d = sdExtrudedSL(sp, 0.15) * scale;
    
    // Floor plane (optional)
    float floor = p.y + 1.2;
    return min(d, floor);
}

float mapLetters(vec3 p) {
    float t = clamp(iTime * 0.5, 0.0, 1.0);
    float scale = 1.5*(3./(min(16.,iTime)/5.));//mix(4.0, 1.0, smoothstep(0.0, 1.0, t));
    vec3 sp = p / scale;
    return sdExtrudedSL(sp, 0.15) * scale;
}

// --- Raymarching ---
float raymarch(vec3 ro, vec3 rd, out bool hitLetters) {
    float t = 0.0;
    hitLetters = false;
    for (int i = 0; i < 160; i++) {
        vec3 p = ro + rd * t;
        float dLetters = mapLetters(p);
        float dFloor = p.y + 1.2;
        float d = min(dLetters, dFloor);
        if (d < 0.001) {
            hitLetters = (dLetters < dFloor);
            return t;
        }
        if (t > 20.0) break;
        t += d * 0.9;
    }
    return -1.0;
}

// --- Normal calculation ---
vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        mapScene(p + e.xyy) - mapScene(p - e.xyy),
        mapScene(p + e.yxy) - mapScene(p - e.yxy),
        mapScene(p + e.yyx) - mapScene(p - e.yyx)
    ));
}

// --- Soft shadow ---
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    for (int i = 0; i < 64; i++) {
        float d = mapScene(ro + rd * t);
        if (d < 0.001) return 0.0;
        res = min(res, k * d / t);
        t += d;
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}

// --- AO ---
float calcAO(vec3 p, vec3 n) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12 * float(i);
        float d = mapScene(p + n * h);
        occ += (h - d) * sca;
        sca *= 0.95;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// --- Blue metallic BRDF ---
vec3 metallicShading(vec3 p, vec3 n, vec3 rd, vec3 lightDir) {
    // Blue metal base color
    vec3 baseColor = vec3(0.15, 0.35, 0.85);
    
    // Fresnel (Schlick)
    vec3 viewDir = -rd;
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotL = max(dot(n, lightDir), 0.0);
    float NdotV = max(dot(n, viewDir), 0.0);
    float NdotH = max(dot(n, halfVec), 0.0);
    float VdotH = max(dot(viewDir, halfVec), 0.0);
    
    // Metallic fresnel - reflects base color
    float metallic = 0.9;
    vec3 F0 = mix(vec3(0.04), baseColor, metallic);
    vec3 fresnel = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
    
    // GGX distribution
    float roughness = 0.25;
    float a = roughness * roughness;
    float a2 = a * a;
    float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * denom * denom);
    
    // Geometry (Smith)
    float k = (roughness + 1.0);
    k = k * k / 8.0;
    float G1V = NdotV / (NdotV * (1.0 - k) + k);
    float G1L = NdotL / (NdotL * (1.0 - k) + k);
    float G = G1V * G1L;
    
    // Specular
    vec3 spec = (D * G * fresnel) / max(4.0 * NdotV * NdotL, 0.001);
    
    // Diffuse (reduced for metals)
    vec3 kD = (1.0 - fresnel) * (1.0 - metallic);
    vec3 diffuse = kD * baseColor / 3.14159;
    
    // Light color
    vec3 lightCol = vec3(1.0, 0.95, 0.9) * 2.5;
    
    vec3 color = (diffuse + spec) * lightCol * NdotL;
    
    // Environment/rim light
    float rim = pow(1.0 - NdotV, 4.0);
    color += baseColor * rim * 0.4;
    
    // Subtle secondary light
    vec3 light2 = normalize(vec3(-1.0, 0.5, -0.5));
    float NdotL2 = max(dot(n, light2), 0.0);
    color += baseColor * 0.15 * NdotL2;
    
    return color;
}

void mainImage0(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = (fragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
    uv.y-=0.2;
    // Camera
    vec3 ro = vec3(0.0, 0.3, 3.5);
    vec3 rd = normalize(vec3(uv, -1.5));
    
    // Slight camera rotation
    float camAngle = 0.15 * sin(iTime * 0.3);
    float ca = cos(camAngle), sa = sin(camAngle);
    rd.xz = mat2(ca, sa, -sa, ca) * rd.xz;
    ro.xz = mat2(ca, sa, -sa, ca) * ro.xz;
    
    // Background gradient
    vec3 col = mix(vec3(0.02, 0.02, 0.08), vec3(0.1, 0.1, 0.2), uv.y + 0.5);
    
    // Raymarch
    bool hitLetters;
    float t = raymarch(ro, rd, hitLetters);
    
    if (t > 0.0) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        
        // Light
        vec3 lightDir = normalize(vec3(2.0, 2.0, 2.0));
        
        if (hitLetters) {
            // Blue metallic letters
            col = metallicShading(p, n, rd, lightDir);
            
            // Shadow & AO
            float shadow = softShadow(p + n * 0.02, lightDir, 0.02, 10.0, 16.0);
            float ao = calcAO(p, n);
            col *= shadow * 0.7 + 0.3;
            col *= ao;
        } else {
            // Floor - dark reflective surface
            vec3 floorCol = vec3(0.05, 0.05, 0.1);
            float NdotL = max(dot(n, lightDir), 0.0);
            float shadow = softShadow(p + n * 0.02, lightDir, 0.02, 10.0, 16.0);
            col = floorCol * (0.2 + 0.8 * NdotL * shadow);
            
            // Floor reflection of letters
            vec3 reflDir = reflect(rd, n);
            float tRefl = 0.0;
            bool reflHit = false;
            for (int i = 0; i < 64; i++) {
                vec3 rp = p + n * 0.05 + reflDir * tRefl;
                float d = mapLetters(rp);
                if (d < 0.002) { reflHit = true; break; }
                if (tRefl > 10.0) break;
                tRefl += d;
            }
            if (reflHit) {
                vec3 rp = p + n * 0.05 + reflDir * tRefl;
                vec3 rn = calcNormal(rp);
                vec3 reflCol = metallicShading(rp, rn, reflDir, lightDir);
                col += reflCol * 0.3;
            }
        }
        
        // Fog
        float fog = exp(-t * t * 0.01);
        col = mix(vec3(0.02, 0.02, 0.08), col, fog);
    }
    
    // Tone mapping
    col = col / (col + 1.0);
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, hitLetters);
}

void mainImage(out vec4 o, vec2 u)
{
    if (iTheme == 3) {
    float s = 4., k;
    vec2 j = vec2(.5);
    o = vec4(0);
    vec4 c;
    mainImage0(c, u);
    for (k = s; k-- > .5; ) {
        mainImage0(c, u + j - .5);
        o += c;
        j = fract(j + vec2(.755, .57).yx);
    };o /= s;
    } else {
        o=vec4(1);
    }
}

`,
    BufferD: `// BufferB - Engineer Theme Render Pass
// Output: iChannel2 (self-buffering for trails)

// Hash function for pseudo-random values
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Hash for animated noise
float hash21(vec2 p, float t) {
    return fract(sin(dot(p + t * 0.1, vec2(127.1, 311.7))) * 43758.5453);
}

// Simple 1D hash
float hash1(float n) {
    return fract(sin(n) * 43758.5453);
}

// Circuit trace pattern
float circuitTrace(vec2 uv, float time) {
    float trace = 0.0;
    vec2 grid = floor(uv * 8.0);
    vec2 f = fract(uv * 8.0);
    
    float r = hash(grid);
    
    // Horizontal or vertical based on hash
    if (r > 0.5) {
        trace = smoothstep(0.02, 0.0, abs(f.y - 0.5)) * step(0.3, r);
    } else {
        trace = smoothstep(0.02, 0.0, abs(f.x - 0.5)) * step(r, 0.7);
    }
    
    // Junction nodes
    float node = smoothstep(0.15, 0.1, length(f - 0.5));
    trace = max(trace, node * step(0.7, r));
    
    return trace * 0.3;
}

// Data stream effect
float dataStream(vec2 uv, float time, float speed, float offset) {
    float stream = 0.0;
    float y = uv.y + offset;
    float segment = floor(y * 15.0);
    float f = fract(y * 15.0);
    
    float r = hash1(segment + floor(time * speed));
    float len = 0.3 + r * 0.5;
    float pos = fract(time * speed + hash1(segment) * 10.0);
    
    if (abs(f - 0.5) < len * 0.5 && r > 0.4) {
        stream = smoothstep(0.0, 0.2, f) * smoothstep(1.0, 0.8, f);
        stream *= sin(pos * PI) * 0.5 + 0.5;
    }
    
    return stream;
}

// Hexagon distance
float hexDist(vec2 p) {
    p = abs(p);
    return max(p.x * 0.866025 + p.y * 0.5, p.y);
}

// Tech hexagon grid
float hexGrid(vec2 uv, float scale) {
    vec2 r = vec2(1.0, 1.732);
    vec2 h = r * 0.5;
    vec2 a = mod(uv * scale, r) - h;
    vec2 b = mod(uv * scale - h, r) - h;
    vec2 gv = length(a) < length(b) ? a : b;
    
    float d = hexDist(gv);
    float edge = smoothstep(0.45, 0.43, d) - smoothstep(0.43, 0.41, d);
    
    return edge;
}

void mainImage0(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 centered = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float aspect = iResolution.x / iResolution.y;
    
    // Previous frame for persistence/trails
    vec4 prev = texture(iChannel4, uv);
    
    // === CURSOR/ENGINEER COLOR PALETTE ===
    vec3 bgDark      = vec3(0.012, 0.012, 0.016);
    vec3 bgMid       = vec3(0.035, 0.035, 0.045);
    vec3 gridDim     = vec3(0.06, 0.06, 0.08);
    vec3 gridBright  = vec3(0.1, 0.1, 0.13);
    vec3 orange      = vec3(1.0, 0.45, 0.0);
    vec3 orangeDim   = vec3(0.5, 0.22, 0.0);
    vec3 orangeHot   = vec3(1.0, 0.65, 0.2);
    vec3 white       = vec3(0.92, 0.92, 0.95);
    vec3 greyLight   = vec3(0.35, 0.35, 0.4);
    vec3 greyDark    = vec3(0.18, 0.18, 0.22);
    
    // === BACKGROUND WITH RADIAL GRADIENT ===
    float vignette = 1.0 - smoothstep(0.2, 1.0, length(centered) * 0.8);
    vec3 col = mix(bgDark, bgMid, vignette);
    
    // === ENGINEERING GRID SYSTEM ===
    
    // Fine dot grid
    float gridSmall = 20.0;
    vec2 smallGrid = mod(fragCoord, gridSmall);
    float dot = smoothstep(1.5, 0.5, length(smallGrid - gridSmall * 0.5));
    col = mix(col, gridDim, dot * 0.4);
    
    // Medium grid lines
    float gridMed = 60.0;
    vec2 medGrid = mod(fragCoord, gridMed);
    float medLine = smoothstep(1.0, 0.0, min(medGrid.x, medGrid.y));
    col = mix(col, gridDim, medLine * 0.3);
    
    // Major grid lines
    float gridLarge = 120.0;
    vec2 largeGrid = mod(fragCoord, gridLarge);
    float largeLine = smoothstep(1.5, 0.0, min(largeGrid.x, largeGrid.y));
    col = mix(col, gridBright, largeLine * 0.5);
    
    // === HEX GRID OVERLAY (subtle) ===
    float hex = hexGrid(centered + vec2(aspect * 0.5, 0.5), 6.0);
    col = mix(col, gridDim, hex * 0.15);
    
    // === CIRCUIT BOARD TRACES ===
    float circuit = circuitTrace(centered + 0.5, iTime);
    // Pulse the circuits
    float pulse = sin(iTime * 2.0 + length(centered) * 5.0) * 0.5 + 0.5;
    col = mix(col, orangeDim * 0.5, circuit * pulse);
    
    // === VERTICAL DATA STREAMS (sides) ===
    float streamWidth = 0.03;
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        // Left side streams
        float xLeft = -aspect * 0.5 + 0.05 + fi * 0.025;
        float distL = abs(centered.x - xLeft);
        if (distL < streamWidth) {
            float stream = dataStream(centered, iTime, 1.5 + fi * 0.3, fi * 1.7);
            float fade = 1.0 - distL / streamWidth;
            col = mix(col, orangeDim, stream * fade * 0.7);
        }
        
        // Right side streams
        float xRight = aspect * 0.5 - 0.05 - fi * 0.025;
        float distR = abs(centered.x - xRight);
        if (distR < streamWidth) {
            float stream = dataStream(centered, iTime, 1.2 + fi * 0.4, fi * 2.3 + 5.0);
            float fade = 1.0 - distR / streamWidth;
            col = mix(col, orangeDim, stream * fade * 0.7);
        }
    }
    
    // === HORIZONTAL SCAN LINES ===
    float scanSpeed = 80.0;
    float scanY = mod(iTime * scanSpeed, iResolution.y + 100.0) - 50.0;
    float scanDist = abs(fragCoord.y - scanY);
    float scanIntensity = smoothstep(40.0, 0.0, scanDist);
    col += orange * scanIntensity * 0.15;
    
    // Secondary scan (slower, opposite direction)
    float scanY2 = mod(-iTime * scanSpeed * 0.6 + iResolution.y, iResolution.y + 100.0) - 50.0;
    float scanDist2 = abs(fragCoord.y - scanY2);
    float scanIntensity2 = smoothstep(25.0, 0.0, scanDist2);
    col += orangeDim * scanIntensity2 * 0.1;
    
    // === THE SL LOGO ===
    vec2 p = fragCoord;
    p *= 1.5;
    p -= iResolution.xy / 4.0;
    vec2 luv = (p - 0.5 * iResolution.xy) / iResolution.y;
    float scaleAnim = 3.0 / (min(16.0, iTime) / 5.0);
    luv /= scaleAnim;
    
    float d = SL(luv);
    
    // Multi-layer glow effect
    float glow1 = exp(-max(d, 0.0) * 3.0) * 0.25;   // Wide soft glow
    float glow2 = exp(-max(d, 0.0) * 8.0) * 0.4;    // Medium glow
    float glow3 = exp(-max(d, 0.0) * 20.0) * 0.5;   // Tight bright glow
    
    col += orangeDim * glow1;
    col += orange * glow2;
    col += orangeHot * glow3;
    
    // Pulsing glow
    float glowPulse = sin(iTime * 3.0) * 0.15 + 0.85;
    col += orange * exp(-max(d, 0.0) * 12.0) * 0.2 * glowPulse;
    
    // Solid letter fill
    if (d < 0.0) {
        float edge = smoothstep(-0.015, 0.0, d);
        vec3 letterCol = mix(orange, orangeHot, edge * 0.6);
        
        // Inner brightness gradient
        float inner = smoothstep(0.0, 0.08, -d);
        letterCol = mix(letterCol, white, inner * 0.25);
        
        // Subtle scan line on letter
        float letterScan = sin(fragCoord.y * 3.0 + iTime * 5.0) * 0.5 + 0.5;
        letterCol *= 0.92 + letterScan * 0.08;
        
        // Noise texture
        float n = hash(fragCoord + fract(iTime) * 100.0);
        letterCol += (n - 0.5) * 0.025;
        
        col = letterCol;
    }
    
    // === TECH CORNER BRACKETS ===
    float bracketLen = 45.0;
    float bracketThick = 2.0;
    float margin = 20.0;
    
    vec2 fc = fragCoord;
    
    // Top-left bracket
    bool tlH = fc.y > iResolution.y - margin - bracketThick && fc.y < iResolution.y - margin && fc.x > margin && fc.x < margin + bracketLen;
    bool tlV = fc.x > margin && fc.x < margin + bracketThick && fc.y > iResolution.y - margin - bracketLen && fc.y < iResolution.y - margin;
    
    // Top-right bracket
    bool trH = fc.y > iResolution.y - margin - bracketThick && fc.y < iResolution.y - margin && fc.x < iResolution.x - margin && fc.x > iResolution.x - margin - bracketLen;
    bool trV = fc.x < iResolution.x - margin && fc.x > iResolution.x - margin - bracketThick && fc.y > iResolution.y - margin - bracketLen && fc.y < iResolution.y - margin;
    
    // Bottom-left bracket
    bool blH = fc.y > margin && fc.y < margin + bracketThick && fc.x > margin && fc.x < margin + bracketLen;
    bool blV = fc.x > margin && fc.x < margin + bracketThick && fc.y > margin && fc.y < margin + bracketLen;
    
    // Bottom-right bracket
    bool brH = fc.y > margin && fc.y < margin + bracketThick && fc.x < iResolution.x - margin && fc.x > iResolution.x - margin - bracketLen;
    bool brV = fc.x < iResolution.x - margin && fc.x > iResolution.x - margin - bracketThick && fc.y > margin && fc.y < margin + bracketLen;
    
    if (tlH || tlV || trH || trV || blH || blV || brH || brV) {
        col = greyLight;
    }
    
    // === CENTER CROSSHAIR ===
    vec2 center = iResolution.xy * 0.5;
    float crossLen = 20.0;
    float crossGap = 10.0;
    float crossThick = 1.0;
    
    float cx = abs(fc.x - center.x);
    float cy = abs(fc.y - center.y);
    
    if ((cy < crossThick && cx > crossGap && cx < crossGap + crossLen) ||
        (cx < crossThick && cy > crossGap && cy < crossGap + crossLen)) {
        col = mix(col, greyLight, 0.6);
    }
    
    // Center dot
    float centerDot = smoothstep(3.0, 2.0, length(fc - center));
    col = mix(col, greyLight, centerDot * 0.5);
    
    // === MEASUREMENT TICKS (bottom edge) ===
    if (fc.y < margin + 25.0 && fc.y > margin + 5.0) {
        float tickSpacing = 50.0;
        float tickX = mod(fc.x - margin, tickSpacing);
        bool majorTick = mod(fc.x - margin, tickSpacing * 2.0) < tickSpacing;
        float tickHeight = majorTick ? 15.0 : 8.0;
        
        if (tickX < 1.0 && fc.y < margin + 5.0 + tickHeight) {
            col = mix(col, greyDark, 0.6);
        }
    }
    
    // === CRT SCANLINES ===
    float crtLine = sin(fc.y * 1.5) * 0.5 + 0.5;
    col *= 0.96 + crtLine * 0.04;
    
    // === FILM GRAIN ===
    float grain = hash(fc * 0.5 + fract(iTime * 60.0) * 1000.0);
    col += (grain - 0.5) * 0.015;
    
    // === PERSISTENCE / TRAIL EFFECT ===
    float trailAmount = 0.88;
    col = mix(col, prev.rgb * trailAmount, 0.35);
    
    // === FINAL COLOR ADJUSTMENTS ===
    // Slight contrast boost
    col = pow(col, vec3(0.95));
    
    // Clamp
    col = clamp(col, 0.0, 1.0);
    
    fragColor = vec4(col, col.r);
}


void mainImage(out vec4 o, vec2 u)
{
    if (iTheme == 5) {
    float s = 4., k;
    vec2 j = vec2(.5);
    o = vec4(0);
    vec4 c;
    mainImage0(c, u);
    for (k = s; k-- > .5; ) {
        mainImage0(c, u + j - .5);
        o += c;
        j = fract(j + vec2(.755, .57).yx);
    };o /= s;
    } else {
        o=vec4(1);
    }
}`,
    BufferE: `

// Hash for pseudo-random
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
// Grid lines - engineering blueprint style
float gridLines(vec2 uv, float spacing, float thickness) {
    vec2 grid = abs(fract(uv / spacing - 0.5) - 0.5) * spacing;
    float lines = min(grid.x, grid.y);
    return smoothstep(thickness, 0.0, lines);
}

// Circuit trace pattern
float circuitTrace(vec2 uv, float time) {
    float trace = 0.0;
    
    // Horizontal lines at quantized y positions
    for (float i = 0.0; i < 8.0; i++) {
        float y = (hash(i * 7.3) - 0.5) * 1.4;
        float xStart = (hash(i * 13.1) - 0.5) * 1.0;
        float xEnd = xStart + hash(i * 3.7) * 0.8;
        
        // Animate: pulse travels along trace
        float pulse = fract(time * 0.3 + hash(i * 5.1));
        float xPulse = mix(xStart, xEnd, pulse);
        
        float seg = sdSegment(uv, vec2(xStart, y), vec2(xEnd, y));
        trace = max(trace, smoothstep(0.004, 0.001, seg));
        
        // Node dots at endpoints
        float dot1 = length(uv - vec2(xStart, y));
        float dot2 = length(uv - vec2(xEnd, y));
        trace = max(trace, smoothstep(0.012, 0.008, dot1));
        trace = max(trace, smoothstep(0.012, 0.008, dot2));
        
        // Traveling pulse
        float pulseD = length(uv - vec2(xPulse, y));
        trace = max(trace, smoothstep(0.02, 0.005, pulseD) * 0.8);
    }
    
    // Vertical connectors
    for (float i = 0.0; i < 6.0; i++) {
        float x = (hash(i * 11.3 + 50.0) - 0.5) * 1.6;
        float yStart = (hash(i * 9.7 + 20.0) - 0.5) * 1.0;
        float yEnd = yStart + (hash(i * 4.3 + 30.0) - 0.3) * 0.6;
        
        float seg = sdSegment(uv, vec2(x, yStart), vec2(x, yEnd));
        trace = max(trace, smoothstep(0.003, 0.001, seg) * 0.7);
    }
    
    return trace;
}

// Scanning line effect
float scanLine(vec2 uv, float time) {
    float y = mod(time * 0.4, 3.0) - 1.5;
    float dist = abs(uv.y - y);
    return smoothstep(0.08, 0.0, dist) * 0.3;
}

// Diagonal hash lines (engineering drawing style)
float hashLines(vec2 uv, float angle, float spacing, float thickness) {
    vec2 ruv = rotate2D(angle) * uv;
    float lines = abs(fract(ruv.x / spacing) - 0.5) * spacing;
    return smoothstep(thickness, 0.0, lines);
}

// Bracket / code decoration
float codeBracket(vec2 p, float size) {
    float d = 1e10;
    // Left bracket [
    d = min(d, sdSegment(p, vec2(-size, -size), vec2(-size, size)));
    d = min(d, sdSegment(p, vec2(-size, -size), vec2(-size * 0.6, -size)));
    d = min(d, sdSegment(p, vec2(-size, size), vec2(-size * 0.6, size)));
    return d;
}

// Gear-like ring
float gearRing(vec2 p, float radius, float teeth, float time) {
    float angle = atan(p.y, p.x) + time * 0.5;
    float r = length(p);
    float gear = abs(r - radius) - 0.005;
    float toothPattern = sin(angle * teeth) * 0.015;
    gear = min(gear, abs(r - radius - toothPattern) - 0.003);
    return gear;
}

// Binary-like data stream
float dataStream(vec2 uv, float time) {
    float stream = 0.0;
    for (float i = 0.0; i < 5.0; i++) {
        float x = -0.8 + i * 0.35 + hash(i * 3.0) * 0.1;
        float speed = 0.2 + hash(i * 7.0) * 0.3;
        
        for (float j = 0.0; j < 12.0; j++) {
            float y = mod(-time * speed + j * 0.08 + hash(i * 13.0 + j * 7.0) * 0.5, 2.4) - 1.2;
            float opacity = hash(floor(time * 2.0 + j) * (i + 1.0)) > 0.5 ? 1.0 : 0.3;
            float charDot = sdBox(uv - vec2(x, y), vec2(0.008, 0.012));
            stream = max(stream, smoothstep(0.005, 0.0, charDot) * opacity * 0.4);
        }
    }
    return stream;
}

// Crosshair / registration mark
float regMark(vec2 p, float size) {
    float d = 1e10;
    d = min(d, sdSegment(p, vec2(-size, 0.0), vec2(-size * 0.3, 0.0)));
    d = min(d, sdSegment(p, vec2(size * 0.3, 0.0), vec2(size, 0.0)));
    d = min(d, sdSegment(p, vec2(0.0, -size), vec2(0.0, -size * 0.3)));
    d = min(d, sdSegment(p, vec2(0.0, size * 0.3), vec2(0.0, size)));
    float circle = abs(length(p) - size * 0.5) - 0.002;
    d = min(d, circle);
    return d;
}

void mainImage0(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = fragCoord;
    p *= 1.5;
    p -= iResolution.xy / 4.;
    
    vec2 luv = (p - 0.5 * iResolution.xy) / iResolution.y;
    float scaleFactor = 3.0 / (min(16., iTime) / 5.0);
    vec2 slUV = luv / scaleFactor;
    
    float d = SL(slUV);
    float time = iTime;
    
    // === ENGINEER THEME COLORS ===
    vec3 bgDark = vec3(0.6);       // Near black
    vec3 bgMid = vec3(0.6);        // Dark grey
    vec3 gridCol = vec3(0.18, 0.18, 0.50);      // Subtle grid grey
    vec3 traceGrey = vec3(0.5);      // Mid grey for traces
    vec3 brightGrey = vec3(0.6);    // Light grey
    
    vec3 orange = vec3(0.55, 0.3, 0.1).bgr;
    vec3 orangeDim = orange-0.1;
    vec3 white = vec3(0.2);        // Off-white
    
    // === BACKGROUND ===
    // Subtle radial gradient
    float vignette = length(luv) * 0.6;
    vec3 col = mix(bgMid, bgDark, vignette);
    float alpha2 = 0.0;
    // === GRID LAYER ===
    // Fine grid
    float fineGrid = gridLines(luv, 0.05, 0.001);
    col = mix(col, gridCol, fineGrid * 0.4);
    alpha2+=fineGrid;
    // Coarse grid
    float coarseGrid = gridLines(luv, 0.2, 0.0015);
    col = mix(col, gridCol * 1.5, coarseGrid * 0.5);
    alpha2+=coarseGrid;
    // === CIRCUIT TRACES ===
    float circuits = circuitTrace(luv, time);
    col = mix(col, traceGrey, circuits * 0.6);
    alpha2+=circuits;
    // Orange pulse on some traces
    float orangeCircuits = circuitTrace(luv, time + 1.5);
    col = mix(col, orangeDim * 0.5, orangeCircuits * 0.3);
    alpha2+=orangeCircuits;
    // === DATA STREAMS ===
    float data = dataStream(luv, time);
    col = mix(col, traceGrey, data);
    alpha2+=data;
    // === SCAN LINE ===
    float scan = scanLine(luv, time);
    col += orange * scan * 0.3;
    alpha2+=scan;
    // === GEAR RINGS (background decoration) ===
    float gear1 = gearRing(luv - vec2(-0.5, 0.3), 0.15, 12.0, time);
    col = mix(col, traceGrey * 0.8, smoothstep(0.004, 0.001, gear1) * 0.4);
    alpha2+=gear1;
    float gear2 = gearRing(luv - vec2(0.55, -0.25), 0.1, 8.0, -time * 0.7);
    col = mix(col, traceGrey * 0.6, smoothstep(0.004, 0.001, gear2) * 0.3);
    alpha2+=gear2;
    // === REGISTRATION MARKS (corners) ===
    float reg1 = regMark(luv - vec2(-0.6, 0.35), 0.04);
    col = mix(col, brightGrey * 0.6, smoothstep(0.003, 0.001, reg1) * 0.5);
    alpha2+=reg1;
    float reg2 = regMark(luv - vec2(0.6, -0.35), 0.04);
    col = mix(col, brightGrey * 0.6, smoothstep(0.003, 0.001, reg2) * 0.5);
    alpha2+=reg2;
    // === CODE BRACKETS ===
    float bracket1 = codeBracket(luv - vec2(-0.35, -0.3), 0.06);
    col = mix(col, orangeDim * 0.7, smoothstep(0.004, 0.001, bracket1) * 0.5);
    alpha2+=bracket1;
    // Right bracket (mirrored)
    vec2 bp2 = luv - vec2(0.4, 0.25);
    bp2.x = -bp2.x;
    float bracket2 = codeBracket(bp2, 0.05);
    col = mix(col, orangeDim * 0.7, smoothstep(0.004, 0.001, bracket2) * 0.4);
    alpha2+=bracket2;
    // === DIAGONAL HASH LINES (subtle engineering fill) ===
    float hatch = hashLines(luv, PI * 0.25, 0.03, 0.0008);
    float hatchMask = smoothstep(0.3, 0.6, length(luv)); // Only in outer areas
    col = mix(col, bgMid * 1.3, hatch * hatchMask * 0.15);
    
    // === SL LETTERS ===
    // Outer glow
    float glowDist = smoothstep(0.04, 0.0, d);
    col += orange * glowDist * 0.4;
    
    // Letter fill
    if (d <= 0.0) {
        // Gradient fill: dark grey to white with orange accent
        float fillGrad = slUV.y * 0.5 + 0.5;
        vec3 letterCol = mix(brightGrey, white, fillGrad * 0.5);
        alpha2+=fillGrad;
        // Subtle orange edge highlight
        float edge = smoothstep(-0.02, 0.0, d);
        letterCol = mix(letterCol, orange, edge * 0.6);
        alpha2+=edge;
        // Inner shadow for depth
        float innerShadow = smoothstep(0.0, -0.03, d);
        letterCol *= mix(0.7, 1.0, innerShadow);
        
        col = letterCol;
    }
    
    // Sharp orange outline
    float outline = abs(d) - 0.005;
    float outlineMask = smoothstep(0.003, 0.0, outline);
    col = mix(col, orange, outlineMask * 0.9);
    
    // === SUBTLE NOISE / TEXTURE ===
    float noise = hash2(fragCoord + fract(time) * 100.0) * 0.03;
    col += noise - 0.015;
    
    // === FRAME BORDER ===
    vec2 border = smoothstep(vec2(0.0), vec2(0.02), uv) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - uv);
    float borderMask = border.x * border.y;
    // Thin orange border line
    float borderLine = smoothstep(0.015, 0.012, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    col = mix(col, orangeDim * 0.6, borderLine * 0.7);
    
    float alpha = d > 0.0 ? 0.0 : 1.0;
    alpha = max(alpha, glowDist * 0.8);
    alpha = max(alpha, outlineMask);
    alpha = max(alpha, max(circuits * 0.5, fineGrid * 0.2));
    alpha = max(alpha, borderLine * 0.5);
    alpha = max(alpha, scan * 0.3);
    alpha = clamp(alpha, 0.0, 1.0);
    //alpha2*=0.01;
   //alpha*=alpha2;
    // Ensure background is visible
    alpha = max(alpha, 0.5);
    
    fragColor = vec4(col, alpha);
}
    
void mainImage(out vec4 o, vec2 u)
{
    if (iTheme == 2) {
    float s = 4., k;
    vec2 j = vec2(.5);
    o = vec4(0);
    vec4 c;
    mainImage0(c, u);
    for (k = s; k-- > .5; ) {
        mainImage0(c, u + j - .5);
        o += c;
        j = fract(j + vec2(.755, .57).yx);
    };o /= s;
    } else {
        o=vec4(1);
    }
}`