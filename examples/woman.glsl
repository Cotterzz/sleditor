float womanSDF(vec3 p) {
    vec3 smoothunion_1_p = p;
    smoothunion_1_p -= vec3(-3.100, -3.200, 0.300);
    smoothunion_1_p *= rotateX(-2.6878);
    smoothunion_1_p *= rotateY(2.8449);
    smoothunion_1_p *= rotateZ(2.8798);
    float smoothunion_1_scale = max(1.000, 0.0001);
    smoothunion_1_p /= smoothunion_1_scale;
    vec3 smoothunion_2_p = smoothunion_1_p;
    smoothunion_2_p -= vec3(-3.100, 0.500, -1.100);
    smoothunion_2_p *= rotateX(1.0123);
    smoothunion_2_p *= rotateY(-0.8901);
    smoothunion_2_p *= rotateZ(-2.0420);
    float smoothunion_2_scale = max(1.000, 0.0001);
    smoothunion_2_p /= smoothunion_2_scale;
    vec3 smoothunion_3_p = smoothunion_2_p;
    smoothunion_3_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_3_scale = max(1.000, 0.0001);
    smoothunion_3_p /= smoothunion_3_scale;
    vec3 smoothunion_4_p = smoothunion_3_p;
    smoothunion_4_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_4_scale = max(1.000, 0.0001);
    smoothunion_4_p /= smoothunion_4_scale;
    vec3 symx_1_p = smoothunion_4_p;
    symx_1_p -= vec3(0.000, 0.000, 0.000);
    symx_1_p *= rotateX(0.1571);
    float symx_1_scale = max(1.000, 0.0001);
    symx_1_p /= symx_1_scale;
    vec3 symx_1_warp = symx_1_p;
    symx_1_warp.x = abs(symx_1_warp.x);
    vec3 smoothunion_5_p = symx_1_warp;
    smoothunion_5_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_5_scale = max(1.000, 0.0001);
    smoothunion_5_p /= smoothunion_5_scale;
    vec3 smoothunion_6_p = smoothunion_5_p;
    smoothunion_6_p -= vec3(-0.200, 0.000, -0.100);
    smoothunion_6_p *= rotateY(-0.1920);
    smoothunion_6_p *= rotateZ(0.5061);
    float smoothunion_6_scale = max(1.000, 0.0001);
    smoothunion_6_p /= smoothunion_6_scale;
    vec3 cheapbend_1_p = smoothunion_6_p;
    cheapbend_1_p -= vec3(0.900, -0.400, 0.100);
    cheapbend_1_p *= rotateX(-1.1345);
    cheapbend_1_p *= rotateY(0.8901);
    cheapbend_1_p *= rotateZ(0.1396);
    float cheapbend_1_scale = max(1.000, 0.0001);
    cheapbend_1_p /= cheapbend_1_scale;
    vec3 cheapbend_1_warp = cheapbend_1_p;
    float cheapbend_1_angle = 0.900 * cheapbend_1_warp.x;
    mat2 cheapbend_1_mat = mat2(cos(cheapbend_1_angle), -sin(cheapbend_1_angle), sin(cheapbend_1_angle), cos(cheapbend_1_angle));
    vec2 cheapbend_1_rot = cheapbend_1_mat * cheapbend_1_warp.xy;
    cheapbend_1_warp.xy = cheapbend_1_rot;
    vec3 sphere_1_p = cheapbend_1_warp;
    sphere_1_p -= vec3(-0.400, -0.300, 0.000);
    float sphere_1_scale = max(0.950, 0.0001);
    sphere_1_p /= sphere_1_scale;
    float sphere_1_dist;
    float sphere_1_skip = length(sphere_1_p) - (0.500);
    if (sphere_1_skip > 2.0) {
        sphere_1_dist = sphere_1_skip;
    } else {
        sphere_1_dist = sdSphere(sphere_1_p, 0.500);
    }
    float sphere_1 = sphere_1_dist;
    sphere_1 *= sphere_1_scale;
    float cheapbend_1 = sphere_1;
    cheapbend_1 *= cheapbend_1_scale;
    vec3 smoothunion_7_p = smoothunion_6_p;
    smoothunion_7_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_7_scale = max(0.950, 0.0001);
    smoothunion_7_p /= smoothunion_7_scale;
    vec3 sphere_2_p = smoothunion_7_p;
    sphere_2_p -= vec3(0.700, 0.000, -0.100);
    float sphere_2_scale = max(0.850, 0.0001);
    sphere_2_p /= sphere_2_scale;
    float sphere_2_dist;
    float sphere_2_skip = length(sphere_2_p) - (0.500);
    if (sphere_2_skip > 2.0) {
        sphere_2_dist = sphere_2_skip;
    } else {
        sphere_2_dist = sdSphere(sphere_2_p, 0.500);
    }
    float sphere_2 = sphere_2_dist;
    sphere_2 *= sphere_2_scale;
    vec3 vesicasegment_1_p = smoothunion_7_p;
    vesicasegment_1_p -= vec3(0.700, 0.000, 0.000);
    vesicasegment_1_p *= rotateX(-0.0349);
    vesicasegment_1_p *= rotateY(-1.7104);
    float vesicasegment_1_scale = max(1.050, 0.0001);
    vesicasegment_1_p /= vesicasegment_1_scale;
    float vesicasegment_1_dist;
    float vesicasegment_1_skip = length(vesicasegment_1_p) - (0.860);
    if (vesicasegment_1_skip > 2.0) {
        vesicasegment_1_dist = vesicasegment_1_skip;
    } else {
        vesicasegment_1_dist = sdVesicaSegment(vesicasegment_1_p, vec3(-0.500, 0.000, 0.000), vec3(0.500, 0.000, 0.000), 0.360);
    }
    float vesicasegment_1 = vesicasegment_1_dist;
    vesicasegment_1 *= vesicasegment_1_scale;
    float smoothunion_7 = opSmoothUnion(sphere_2, vesicasegment_1, 0.010);
    smoothunion_7 *= smoothunion_7_scale;
    float smoothunion_6 = opSmoothUnion(cheapbend_1, smoothunion_7, 0.070);
    smoothunion_6 *= smoothunion_6_scale;
    vec3 sphere_3_p = smoothunion_5_p;
    sphere_3_p -= vec3(0.300, -0.800, -1.300);
    sphere_3_p *= rotateZ(-0.0349);
    float sphere_3_scale = max(1.150, 0.0001);
    sphere_3_p /= sphere_3_scale;
    float sphere_3_dist;
    float sphere_3_skip = length(sphere_3_p) - (0.350);
    if (sphere_3_skip > 2.0) {
        sphere_3_dist = sphere_3_skip;
    } else {
        sphere_3_dist = sdSphere(sphere_3_p, 0.350);
    }
    float sphere_3 = sphere_3_dist;
    sphere_3 *= sphere_3_scale;
    float smoothunion_5 = opSmoothUnion(smoothunion_6, sphere_3, 0.390);
    smoothunion_5 *= smoothunion_5_scale;
    float symx_1 = smoothunion_5;
    symx_1 *= symx_1_scale;
    vec3 smoothunion_8_p = smoothunion_4_p;
    smoothunion_8_p -= vec3(-0.100, 0.000, 0.000);
    float smoothunion_8_scale = max(1.000, 0.0001);
    smoothunion_8_p /= smoothunion_8_scale;
    vec3 smoothunion_9_p = smoothunion_8_p;
    smoothunion_9_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_9_scale = max(1.000, 0.0001);
    smoothunion_9_p /= smoothunion_9_scale;
    vec3 cheapbend_2_p = smoothunion_9_p;
    cheapbend_2_p -= vec3(0.900, 0.700, -2.200);
    cheapbend_2_p *= rotateX(0.2967);
    cheapbend_2_p *= rotateY(-1.5533);
    cheapbend_2_p *= rotateZ(-0.8029);
    float cheapbend_2_scale = max(1.000, 0.0001);
    cheapbend_2_p /= cheapbend_2_scale;
    vec3 cheapbend_2_warp = cheapbend_2_p;
    float cheapbend_2_angle = 0.200 * cheapbend_2_warp.x;
    mat2 cheapbend_2_mat = mat2(cos(cheapbend_2_angle), -sin(cheapbend_2_angle), sin(cheapbend_2_angle), cos(cheapbend_2_angle));
    vec2 cheapbend_2_rot = cheapbend_2_mat * cheapbend_2_warp.xy;
    cheapbend_2_warp.xy = cheapbend_2_rot;
    vec3 vesicasegment_2_p = cheapbend_2_warp;
    vesicasegment_2_p -= vec3(-1.200, -1.400, -1.300);
    vesicasegment_2_p *= rotateX(-0.5236);
    vesicasegment_2_p *= rotateY(-0.9948);
    vesicasegment_2_p *= rotateZ(-1.1868);
    float vesicasegment_2_scale = max(0.450, 0.0001);
    vesicasegment_2_p /= vesicasegment_2_scale;
    float vesicasegment_2_dist;
    float vesicasegment_2_skip = length(vesicasegment_2_p) - (1.721);
    if (vesicasegment_2_skip > 2.0) {
        vesicasegment_2_dist = vesicasegment_2_skip;
    } else {
        vesicasegment_2_dist = sdVesicaSegment(vesicasegment_2_p, vec3(-2.700, -0.400, 1.200), vec3(0.100, -0.100, -0.100), 0.170);
    }
    float vesicasegment_2 = vesicasegment_2_dist;
    vesicasegment_2 *= vesicasegment_2_scale;
    float cheapbend_2 = vesicasegment_2;
    cheapbend_2 *= cheapbend_2_scale;
    vec3 vesicasegment_3_p = smoothunion_9_p;
    vesicasegment_3_p -= vec3(-0.500, -1.300, -1.500);
    vesicasegment_3_p *= rotateX(-0.2094);
    vesicasegment_3_p *= rotateY(0.2443);
    vesicasegment_3_p *= rotateZ(-1.6581);
    float vesicasegment_3_scale = max(0.750, 0.0001);
    vesicasegment_3_p /= vesicasegment_3_scale;
    float vesicasegment_3_dist;
    float vesicasegment_3_skip = length(vesicasegment_3_p) - (1.650);
    if (vesicasegment_3_skip > 2.0) {
        vesicasegment_3_dist = vesicasegment_3_skip;
    } else {
        vesicasegment_3_dist = sdVesicaSegment(vesicasegment_3_p, vec3(-1.400, -0.100, -0.700), vec3(0.800, -0.400, 0.800), 0.310);
    }
    float vesicasegment_3 = vesicasegment_3_dist;
    vesicasegment_3 *= vesicasegment_3_scale;
    float smoothunion_9 = opSmoothUnion(cheapbend_2, vesicasegment_3, 0.290);
    smoothunion_9 *= smoothunion_9_scale;
    vec3 cheapbend_3_p = smoothunion_8_p;
    cheapbend_3_p -= vec3(-1.300, -0.600, -2.800);
    cheapbend_3_p *= rotateX(1.4486);
    cheapbend_3_p *= rotateY(1.1345);
    cheapbend_3_p *= rotateZ(-3.0369);
    float cheapbend_3_scale = max(1.050, 0.0001);
    cheapbend_3_p /= cheapbend_3_scale;
    vec3 cheapbend_3_warp = cheapbend_3_p;
    float cheapbend_3_angle = -0.300 * cheapbend_3_warp.x;
    mat2 cheapbend_3_mat = mat2(cos(cheapbend_3_angle), -sin(cheapbend_3_angle), sin(cheapbend_3_angle), cos(cheapbend_3_angle));
    vec2 cheapbend_3_rot = cheapbend_3_mat * cheapbend_3_warp.xy;
    cheapbend_3_warp.xy = cheapbend_3_rot;
    vec3 verticalcapsule_1_p = cheapbend_3_warp;
    verticalcapsule_1_p -= vec3(-0.300, 0.200, -1.900);
    verticalcapsule_1_p *= rotateX(0.1571);
    verticalcapsule_1_p *= rotateY(-1.4835);
    verticalcapsule_1_p *= rotateZ(-0.3491);
    float verticalcapsule_1_scale = max(0.600, 0.0001);
    verticalcapsule_1_p /= verticalcapsule_1_scale;
    float verticalcapsule_1_dist;
    float verticalcapsule_1_skip = length(verticalcapsule_1_p) - (1.516);
    if (verticalcapsule_1_skip > 2.0) {
        verticalcapsule_1_dist = verticalcapsule_1_skip;
    } else {
        verticalcapsule_1_dist = sdVerticalCapsule(verticalcapsule_1_p, 2.150, 0.390);
    }
    float verticalcapsule_1 = verticalcapsule_1_dist;
    verticalcapsule_1 *= verticalcapsule_1_scale;
    float cheapbend_3 = verticalcapsule_1;
    cheapbend_3 *= cheapbend_3_scale;
    float smoothunion_8 = opSmoothUnion(smoothunion_9, cheapbend_3, 0.150);
    smoothunion_8 *= smoothunion_8_scale;
    float smoothunion_4 = opSmoothUnion(symx_1, smoothunion_8, 0.260);
    smoothunion_4 *= smoothunion_4_scale;
    vec3 cheapbend_4_p = smoothunion_3_p;
    cheapbend_4_p -= vec3(0.000, 0.000, 0.000);
    float cheapbend_4_scale = max(1.000, 0.0001);
    cheapbend_4_p /= cheapbend_4_scale;
    vec3 cheapbend_4_warp = cheapbend_4_p;
    float cheapbend_4_angle = 0.300 * cheapbend_4_warp.x;
    mat2 cheapbend_4_mat = mat2(cos(cheapbend_4_angle), -sin(cheapbend_4_angle), sin(cheapbend_4_angle), cos(cheapbend_4_angle));
    vec2 cheapbend_4_rot = cheapbend_4_mat * cheapbend_4_warp.xy;
    cheapbend_4_warp.xy = cheapbend_4_rot;
    vec3 verticalcapsule_2_p = cheapbend_4_warp;
    verticalcapsule_2_p -= vec3(0.000, -0.900, -0.800);
    verticalcapsule_2_p *= rotateX(-0.8552);
    verticalcapsule_2_p *= rotateY(-0.1396);
    float verticalcapsule_2_scale = max(0.950, 0.0001);
    verticalcapsule_2_p /= verticalcapsule_2_scale;
    float verticalcapsule_2_dist;
    float verticalcapsule_2_skip = length(verticalcapsule_2_p) - (0.908);
    if (verticalcapsule_2_skip > 2.0) {
        verticalcapsule_2_dist = verticalcapsule_2_skip;
    } else {
        verticalcapsule_2_dist = sdVerticalCapsule(verticalcapsule_2_p, 0.800, 0.410);
    }
    float verticalcapsule_2 = verticalcapsule_2_dist;
    verticalcapsule_2 *= verticalcapsule_2_scale;
    float cheapbend_4 = verticalcapsule_2;
    cheapbend_4 *= cheapbend_4_scale;
    float smoothunion_3 = opSmoothUnion(smoothunion_4, cheapbend_4, 0.110);
    smoothunion_3 *= smoothunion_3_scale;
    vec3 smoothunion_10_p = smoothunion_2_p;
    smoothunion_10_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_10_scale = max(1.000, 0.0001);
    smoothunion_10_p /= smoothunion_10_scale;
    vec3 cheapbend_5_p = smoothunion_10_p;
    cheapbend_5_p -= vec3(0.000, 0.500, -0.200);
    cheapbend_5_p *= rotateX(-2.9845);
    cheapbend_5_p *= rotateY(-0.0349);
    cheapbend_5_p *= rotateZ(-0.0873);
    float cheapbend_5_scale = max(0.900, 0.0001);
    cheapbend_5_p /= cheapbend_5_scale;
    vec3 cheapbend_5_warp = cheapbend_5_p;
    float cheapbend_5_angle = -1.200 * cheapbend_5_warp.x;
    mat2 cheapbend_5_mat = mat2(cos(cheapbend_5_angle), -sin(cheapbend_5_angle), sin(cheapbend_5_angle), cos(cheapbend_5_angle));
    vec2 cheapbend_5_rot = cheapbend_5_mat * cheapbend_5_warp.xy;
    cheapbend_5_warp.xy = cheapbend_5_rot;
    vec3 verticalcapsule_3_p = cheapbend_5_warp;
    verticalcapsule_3_p -= vec3(0.000, 0.000, 0.000);
    verticalcapsule_3_p *= rotateX(0.2443);
    verticalcapsule_3_p *= rotateY(-0.4363);
    float verticalcapsule_3_scale = max(1.000, 0.0001);
    verticalcapsule_3_p /= verticalcapsule_3_scale;
    float verticalcapsule_3_dist;
    float verticalcapsule_3_skip = length(verticalcapsule_3_p) - (0.510);
    if (verticalcapsule_3_skip > 2.0) {
        verticalcapsule_3_dist = verticalcapsule_3_skip;
    } else {
        verticalcapsule_3_dist = sdVerticalCapsule(verticalcapsule_3_p, 0.700, 0.140);
    }
    float verticalcapsule_3 = verticalcapsule_3_dist;
    verticalcapsule_3 *= verticalcapsule_3_scale;
    float cheapbend_5 = verticalcapsule_3;
    cheapbend_5 *= cheapbend_5_scale;
    vec3 vesicasegment_4_p = smoothunion_10_p;
    vesicasegment_4_p -= vec3(-0.200, 0.400, -0.400);
    vesicasegment_4_p *= rotateX(1.1345);
    vesicasegment_4_p *= rotateY(0.7330);
    vesicasegment_4_p *= rotateZ(0.0349);
    float vesicasegment_4_scale = max(1.000, 0.0001);
    vesicasegment_4_p /= vesicasegment_4_scale;
    float vesicasegment_4_dist;
    float vesicasegment_4_skip = length(vesicasegment_4_p) - (0.623);
    if (vesicasegment_4_skip > 2.0) {
        vesicasegment_4_dist = vesicasegment_4_skip;
    } else {
        vesicasegment_4_dist = sdVesicaSegment(vesicasegment_4_p, vec3(0.900, -0.400, -0.500), vec3(0.200, -0.500, -1.000), 0.190);
    }
    float vesicasegment_4 = vesicasegment_4_dist;
    vesicasegment_4 *= vesicasegment_4_scale;
    float smoothunion_10 = opSmoothUnion(cheapbend_5, vesicasegment_4, 0.100);
    smoothunion_10 *= smoothunion_10_scale;
    float smoothunion_2 = opSmoothUnion(smoothunion_3, smoothunion_10, 0.070);
    smoothunion_2 *= smoothunion_2_scale;
    vec3 smoothunion_11_p = smoothunion_1_p;
    smoothunion_11_p -= vec3(0.000, 0.000, 0.000);
    float smoothunion_11_scale = max(1.000, 0.0001);
    smoothunion_11_p /= smoothunion_11_scale;
    vec3 roundcone_1_p = smoothunion_11_p;
    roundcone_1_p -= vec3(-3.000, 0.300, -1.400);
    roundcone_1_p *= rotateX(-1.0821);
    roundcone_1_p *= rotateY(0.1047);
    roundcone_1_p *= rotateZ(-0.5934);
    float roundcone_1_scale = max(1.000, 0.0001);
    roundcone_1_p /= roundcone_1_scale;
    float roundcone_1_dist;
    float roundcone_1_skip = length(roundcone_1_p) - (0.960);
    if (roundcone_1_skip > 2.0) {
        roundcone_1_dist = roundcone_1_skip;
    } else {
        roundcone_1_dist = sdRoundCone(roundcone_1_p, 0.360, 0.170, 0.600);
    }
    float roundcone_1 = roundcone_1_dist;
    roundcone_1 *= roundcone_1_scale;
    vec3 verticalcapsule_4_p = smoothunion_11_p;
    verticalcapsule_4_p -= vec3(-3.100, 0.500, -1.000);
    verticalcapsule_4_p *= rotateX(-1.0123);
    verticalcapsule_4_p *= rotateY(-0.3840);
    verticalcapsule_4_p *= rotateZ(-0.9948);
    float verticalcapsule_4_scale = max(1.000, 0.0001);
    verticalcapsule_4_p /= verticalcapsule_4_scale;
    float verticalcapsule_4_dist;
    float verticalcapsule_4_skip = length(verticalcapsule_4_p) - (0.453);
    if (verticalcapsule_4_skip > 2.0) {
        verticalcapsule_4_dist = verticalcapsule_4_skip;
    } else {
        verticalcapsule_4_dist = sdVerticalCapsule(verticalcapsule_4_p, 0.500, 0.170);
    }
    float verticalcapsule_4 = verticalcapsule_4_dist;
    verticalcapsule_4 *= verticalcapsule_4_scale;
    float smoothunion_11 = opSmoothUnion(roundcone_1, verticalcapsule_4, 0.260);
    smoothunion_11 *= smoothunion_11_scale;
    float smoothunion_1 = opSmoothUnion(smoothunion_2, smoothunion_11, 0.140);
    smoothunion_1 *= smoothunion_1_scale;

    return smoothunion_1;
}