#version 300 es
#define MAX_DATA_NODES {{MAX_DATA_NODES}}
#define NODE_TYPE_SPHERE 0
#define NODE_TYPE_BOX 1
#define NODE_TYPE_TORUS 2
#define NODE_TYPE_CYLINDER 3
#define NODE_TYPE_OCTAHEDRON 4
#define NODE_TYPE_CONE 5
#define NODE_TYPE_ROUND_CONE 6
#define NODE_TYPE_VERTICAL_CAPSULE 7
#define NODE_TYPE_CUT_HOLLOW_SPHERE 8
#define NODE_TYPE_DEATH_STAR 9
#define NODE_TYPE_VESICA 10
#define NODE_TYPE_UNION 11
#define NODE_TYPE_SMOOTH_UNION 12
#define NODE_TYPE_SUBTRACTION 13
#define NODE_TYPE_SMOOTH_SUBTRACTION 14
#define NODE_TYPE_INTERSECTION 15
#define NODE_TYPE_SMOOTH_INTERSECTION 16
#define NODE_TYPE_XOR 17

precision highp float;

uniform vec2 resolution;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraTarget;
uniform bool u_orthographicMode;
uniform float u_cameraDistance;

#define MAX_PARAM_SLOTS {{MAX_PARAM_SLOTS}}

layout(std140) uniform NodeBuffer {
    vec4 header;
    vec4 nodeMeta[MAX_DATA_NODES];
};

uniform vec4 uNodePos[MAX_PARAM_SLOTS];
uniform vec4 uNodeRotScale[MAX_PARAM_SLOTS];
uniform vec4 uNodeParams[MAX_PARAM_SLOTS];

mat3 rotationX(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        1.0, 0.0, 0.0,
        0.0, c, -s,
        0.0, s, c
    );
}

mat3 rotationY(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        c, 0.0, s,
        0.0, 1.0, 0.0,
        -s, 0.0, c
    );
}

mat3 rotationZ(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        c, -s, 0.0,
        s, c, 0.0,
        0.0, 0.0, 1.0
    );
}

vec3 applyTransform(int slot, vec3 p) {
    vec3 pos = uNodePos[slot].xyz;
    vec4 rotScale = uNodeRotScale[slot];
    vec3 angles = rotScale.xyz;
    float scale = max(rotScale.w, 0.0001);
    vec3 local = p - pos;
    mat3 rot = rotationX(-angles.x) * rotationY(-angles.y) * rotationZ(-angles.z);
    local = rot * local;
    return local / scale;
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
         if (3.0 * p.x < m) q = p.xyz;
    else if (3.0 * p.y < m) q = p.yzx;
    else if (3.0 * p.z < m) q = p.zxy;
    else return m * 0.57735027;
    float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
    return length(vec3(q.x, q.y - s + k, q.z - k));
}

float sdCone(vec3 p, vec2 c, float h) {
    float safeCos = max(c.y, 0.0001);
    vec2 q = h * vec2(c.x / safeCos, -1.0);
    vec2 w = vec2(length(p.xz), p.y);
    vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0);
    vec2 b = w - q * vec2(clamp(w.x / max(q.x, 0.0001), 0.0, 1.0), 1.0);
    float k = sign(q.y);
    float d = min(dot(a, a), dot(b, b));
    float sgn = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
    return sqrt(d) * sign(sgn);
}

float sdRoundCone(vec3 p, float r1, float r2, float h) {
    float b = (r1 - r2) / h;
    float a = sqrt(max(1.0 - b * b, 0.0001));
    vec2 q = vec2(length(p.xz), p.y);
    float k = dot(q, vec2(-b, a));
    if (k < 0.0) return length(q) - r1;
    if (k > a * h) return length(q - vec2(0.0, h)) - r2;
    return dot(q, vec2(a, b)) - r1;
}

float sdVerticalCapsule(vec3 p, float h, float r) {
    p.y -= clamp(p.y, 0.0, h);
    return length(p) - r;
}

float sdCutHollowSphere(vec3 p, float r, float h, float t) {
    float w = sqrt(max(r * r - h * h, 0.0));
    vec2 q = vec2(length(p.xz), p.y);
    return ((h * q.x < w * q.y) ? length(q - vec2(w, h)) : abs(length(q) - r)) - t;
}

float sdDeathStar(vec3 p2, float ra, float rb, float d) {
    float a = (ra * ra - rb * rb + d * d) / (2.0 * d);
    float b = sqrt(max(ra * ra - a * a, 0.0));
    vec2 p = vec2(p2.x, length(p2.yz));
    if (p.x * b - p.y * a > d * max(b - p.y, 0.0)) {
        return length(p - vec2(a, b));
    }
    return max(length(p) - ra, -(length(p - vec2(d, 0.0)) - rb));
}

float sdVesicaSegmentPoints(vec3 p, vec3 a, vec3 b, float w) {
    vec3 c = (a + b) * 0.5;
    vec3 ba = b - a;
    float l = length(ba);
    vec3 v = ba / max(l, 0.0001);
    vec3 rel = p - c;
    float y = dot(rel, v);
    vec2 q = vec2(length(rel - y * v), abs(y));
    float r = 0.5 * l;
    float ww = max(w, 0.0001);
    float d = 0.5 * (r * r - ww * ww) / ww;
    vec3 hvec = (r * q.x < d * (q.y - r)) ? vec3(0.0, r, 0.0) : vec3(-d, 0.0, d + ww);
    return length(q - hvec.xy) - hvec.z;
}

float sdVesicaSegmentLW(vec3 p, float lengthVal, float widthVal) {
    float halfLen = max(0.0001, 0.5 * lengthVal);
    vec3 a = vec3(-halfLen, 0.0, 0.0);
    vec3 b = vec3(halfLen, 0.0, 0.0);
    return sdVesicaSegmentPoints(p, a, b, widthVal);
}

float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

float opSmoothSubtraction(float d1, float d2, float k) {
    float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
    return mix(d2, -d1, h) + k * h * (1.0 - h);
}

float opSmoothIntersection(float d1, float d2, float k) {
    float h = clamp(0.5 - 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) + k * h * (1.0 - h);
}

float opXor(float d1, float d2) {
    return max(min(d1, d2), -max(d1, d2));
}

float primitiveBound(int typeId, vec4 param) {
    if (typeId == NODE_TYPE_SPHERE) {
        return param.x;
    }
    if (typeId == NODE_TYPE_BOX) {
        return length(param.xyz);
    }
    if (typeId == NODE_TYPE_TORUS) {
        return param.x + param.y;
    }
    if (typeId == NODE_TYPE_CYLINDER) {
        return length(vec2(param.x, param.y));
    }
    if (typeId == NODE_TYPE_OCTAHEDRON) {
        return 1.5 * param.x;
    }
    if (typeId == NODE_TYPE_CONE) {
        float baseRadius = param.z * param.x / max(param.y, 0.0001);
        return length(vec2(baseRadius, param.z));
    }
    if (typeId == NODE_TYPE_ROUND_CONE) {
        return param.z + max(param.x, param.y);
    }
    if (typeId == NODE_TYPE_VERTICAL_CAPSULE) {
        float halfSpan = 0.5 * param.x + param.y;
        return length(vec2(param.y, halfSpan));
    }
    if (typeId == NODE_TYPE_CUT_HOLLOW_SPHERE) {
        return param.x + param.z;
    }
    if (typeId == NODE_TYPE_DEATH_STAR) {
        return max(param.x, param.z + param.y);
    }
    if (typeId == NODE_TYPE_VESICA) {
        return 0.5 * param.x + param.y;
    }
    return 1e6;
}

float readOpParam(int slot) {
    if (slot < 0 || slot >= MAX_PARAM_SLOTS) {
        return 0.0;
    }
    return uNodeParams[slot].x;
}

float applyOperation(int typeId, float da, float db, float param) {
    if (typeId == NODE_TYPE_UNION) {
        return min(da, db);
    }
    if (typeId == NODE_TYPE_SMOOTH_UNION) {
        return opSmoothUnion(da, db, param);
    }
    if (typeId == NODE_TYPE_SUBTRACTION) {
        return max(-da, db);
    }
    if (typeId == NODE_TYPE_SMOOTH_SUBTRACTION) {
        return opSmoothSubtraction(da, db, param);
    }
    if (typeId == NODE_TYPE_INTERSECTION) {
        return max(da, db);
    }
    if (typeId == NODE_TYPE_SMOOTH_INTERSECTION) {
        return opSmoothIntersection(da, db, param);
    }
    if (typeId == NODE_TYPE_XOR) {
        return opXor(da, db);
    }
    return min(da, db);
}

vec3 computeRayDirection(vec2 uv) {
    vec3 forward = normalize(u_cameraTarget - u_cameraPos);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    if (length(right) < 0.001) {
        right = vec3(1.0, 0.0, 0.0);
    }
    vec3 up = normalize(cross(right, forward));
    return normalize(forward + uv.x * right + uv.y * up);
}

float evaluateScene(vec3 p) {
    int count = int(header.x + 0.5);
    int rootIndex = int(header.y + 0.5);
    float distances[MAX_DATA_NODES];
    for (int i = 0; i < MAX_DATA_NODES; i++) {
        if (i >= count) break;
        vec4 meta = nodeMeta[i];
        int typeId = int(meta.x + 0.5);
        bool isOp = (typeId == NODE_TYPE_UNION ||
                     typeId == NODE_TYPE_SMOOTH_UNION ||
                     typeId == NODE_TYPE_SUBTRACTION ||
                     typeId == NODE_TYPE_SMOOTH_SUBTRACTION ||
                     typeId == NODE_TYPE_INTERSECTION ||
                     typeId == NODE_TYPE_SMOOTH_INTERSECTION ||
                     typeId == NODE_TYPE_XOR);
        if (isOp) {
            int childA = int(meta.y + 0.5);
            int childB = int(meta.z + 0.5);
            float da = (childA >= 0 && childA < MAX_DATA_NODES) ? distances[childA] : 1e6;
            float db = (childB >= 0 && childB < MAX_DATA_NODES) ? distances[childB] : 1e6;
            float param = readOpParam(int(meta.w + 0.5));
            distances[i] = applyOperation(typeId, da, db, param);
        } else {
            int slot = clamp(int(meta.w + 0.5), 0, MAX_PARAM_SLOTS - 1);
            vec3 local = applyTransform(slot, p);
            vec4 nodeParam = uNodeParams[slot];
            float scale = max(uNodeRotScale[slot].w, 0.0001);
            float bound = primitiveBound(typeId, nodeParam);
            if (bound < 1e5) {
                float skip = length(local) - bound;
                if (skip > 2.0) {
                    distances[i] = skip * scale;
                    continue;
                }
            }
            float d = 1e6;
            if (typeId == NODE_TYPE_SPHERE) {
                d = sdSphere(local, nodeParam.x);
            } else if (typeId == NODE_TYPE_BOX) {
                d = sdBox(local, nodeParam.xyz);
            } else if (typeId == NODE_TYPE_TORUS) {
                d = sdTorus(local, nodeParam.xy);
            } else if (typeId == NODE_TYPE_CYLINDER) {
                d = sdCylinder(local, nodeParam.x, nodeParam.y);
            } else if (typeId == NODE_TYPE_OCTAHEDRON) {
                d = sdOctahedron(local, nodeParam.x);
            } else if (typeId == NODE_TYPE_CONE) {
                d = sdCone(local, nodeParam.xy, nodeParam.z);
            } else if (typeId == NODE_TYPE_ROUND_CONE) {
                d = sdRoundCone(local, nodeParam.x, nodeParam.y, nodeParam.z);
            } else if (typeId == NODE_TYPE_VERTICAL_CAPSULE) {
                d = sdVerticalCapsule(local, nodeParam.x, nodeParam.y);
            } else if (typeId == NODE_TYPE_CUT_HOLLOW_SPHERE) {
                d = sdCutHollowSphere(local, nodeParam.x, nodeParam.y, nodeParam.z);
            } else if (typeId == NODE_TYPE_DEATH_STAR) {
                d = sdDeathStar(local, nodeParam.x, nodeParam.y, nodeParam.z);
            } else if (typeId == NODE_TYPE_VESICA) {
                d = sdVesicaSegmentLW(local, nodeParam.x, nodeParam.y);
            }
            distances[i] = d * scale;
        }
    }
    if (count <= 0) {
        return 1e6;
    }
    int clampedRoot = clamp(rootIndex, 0, min(count - 1, MAX_DATA_NODES - 1));
    return distances[clampedRoot];
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        evaluateScene(p + e.xyy) - evaluateScene(p - e.xyy),
        evaluateScene(p + e.yxy) - evaluateScene(p - e.yxy),
        evaluateScene(p + e.yyx) - evaluateScene(p - e.yyx)
    ));
}

out vec4 outColor;

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec3 forward = normalize(u_cameraTarget - u_cameraPos);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    if (length(right) < 0.001) {
        right = vec3(1.0, 0.0, 0.0);
    }
    vec3 up = normalize(cross(right, forward));
    vec3 ro = u_cameraPos;
    vec3 rd = computeRayDirection(uv);
    if (u_orthographicMode) {
        float orthoScale = max(u_cameraDistance, 0.1);
        ro = u_cameraPos + uv.x * right * orthoScale + uv.y * up * orthoScale;
        rd = forward;
    }
    float t = 0.0;
    vec3 baseColor = vec3(0.25, 0.55, 0.95);
    vec3 col = baseColor * 0.25;
    for (int i = 0; i < 128; i++) {
        vec3 p = ro + rd * t;
        float d = evaluateScene(p);
        if (d < 0.001) {
            vec3 n = calcNormal(p);
            vec3 lightDir = normalize(vec3(0.2, 0.9, 0.6));
            float diff = max(dot(n, lightDir), 0.0);
            float amb = 0.35;
            float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);
            col = baseColor * (diff + amb) + vec3(0.2, 0.3, 0.45) * spec;
            break;
        }
        if (t > 40.0) {
            break;
        }
        t += d;
    }
    outColor = vec4(col, 1.0);
}

