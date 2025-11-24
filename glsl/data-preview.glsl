#version 300 es
#define MAX_DATA_NODES {{MAX_DATA_NODES}}
#define NODE_TYPE_SPHERE 0
#define NODE_TYPE_BOX 1
#define NODE_TYPE_TORUS 2
#define NODE_TYPE_CYLINDER 3
#define NODE_TYPE_PLANE 4
#define NODE_TYPE_PYRAMID 5
#define NODE_TYPE_VESICA 6
#define NODE_TYPE_UNION 7
#define NODE_TYPE_SMOOTH_UNION 8
#define NODE_TYPE_SUBTRACTION 9
#define NODE_TYPE_SMOOTH_SUBTRACTION 10
#define NODE_TYPE_INTERSECTION 11
#define NODE_TYPE_SMOOTH_INTERSECTION 12
#define NODE_TYPE_XOR 13

precision highp float;

uniform vec2 resolution;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraTarget;

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

float sdPlane(vec3 p, float h) {
    return p.y - h;
}

float sdPyramid(vec3 p, float h) {
    float m2 = h * h + 0.25;
    p.xz = abs(p.xz);
    if (p.z > p.x) {
        p.xz = p.zx;
    }
    p.xz -= vec2(0.5);
    vec3 q = vec3(p.z, h * p.y - 0.5 * p.x, h * p.x + 0.5 * p.y);
    float s = max(-q.x, 0.0);
    float t = clamp((q.y - 0.5 * p.z) / (m2 + 0.25), 0.0, 1.0);
    float a = m2 * (q.x + s) * (q.x + s) + q.y * q.y;
    float b = m2 * (q.x + 0.5 * t) * (q.x + 0.5 * t) + (q.y - m2 * t) * (q.y - m2 * t);
    float d2 = (min(q.y, -q.x * m2 - 0.5 * q.y) > 0.0) ? 0.0 : min(a, b);
    return sqrt((d2 + q.z * q.z) / m2) * sign(max(q.z, -p.y));
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
    if (typeId == NODE_TYPE_PYRAMID) {
        return param.x;
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
            } else if (typeId == NODE_TYPE_PLANE) {
                d = sdPlane(local, nodeParam.x);
            } else if (typeId == NODE_TYPE_PYRAMID) {
                d = sdPyramid(local, nodeParam.x);
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
    vec3 ro = u_cameraPos;
    vec3 rd = computeRayDirection(uv);
    float t = 0.0;
    vec3 col = vec3(1.0);
    for (int i = 0; i < 128; i++) {
        vec3 p = ro + rd * t;
        float d = evaluateScene(p);
        if (d < 0.001) {
            vec3 n = calcNormal(p);
            vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
            float diff = max(dot(n, lightDir), 0.0);
            float amb = 0.3;
            col = vec3(0.85, 0.75, 0.7) * (diff + amb);
            break;
        }
        if (t > 40.0) {
            break;
        }
        t += d;
    }
    outColor = vec4(col, 1.0);
}

