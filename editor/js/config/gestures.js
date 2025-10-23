export const directionMap = {
    NE: {
        angle: 45, range: 45, type: 'function-decl', label: 'Declare Function', icon: '⚡',
        distanceChoices: [
            { min: 0, max: 60, returnType: 'int', label: 'int function' },
            { min: 60, max: 120, returnType: 'float', label: 'float function' },
            { min: 120, max: 180, returnType: 'vec2', label: 'vec2 function' },
            { min: 180, max: 240, returnType: 'vec3', label: 'vec3 function' },
            { min: 240, max: 300, returnType: 'vec4', label: 'vec4 function' },
            { min: 300, max: 360, returnType: 'bool', label: 'bool function' },
            { min: 360, max: 420, returnType: 'void', label: 'void function' },
            { min: 420, max: 480, returnType: 'mat2', label: 'mat2 function' },
            { min: 480, max: 540, returnType: 'mat3', label: 'mat3 function' },
            { min: 540, max: 999, returnType: 'mat4', label: 'mat4 function' }
        ]
    },
    E: {
        angle: 0, range: 45, type: 'var-decl', label: 'Declare Variable', icon: '📦',
        distanceChoices: [
            { min: 0, max: 45, varType: 'float', label: 'float var' },
            { min: 45, max: 90, varType: 'int', label: 'int var' },
            { min: 90, max: 135, varType: 'vec2', label: 'vec2 var' },
            { min: 135, max: 180, varType: 'vec3', label: 'vec3 var' },
            { min: 180, max: 225, varType: 'vec4', label: 'vec4 var' },
            { min: 225, max: 270, varType: 'bool', label: 'bool var' },
            { min: 270, max: 315, varType: 'mat2', label: 'mat2 var' },
            { min: 315, max: 360, varType: 'mat3', label: 'mat3 var' },
            { min: 360, max: 405, varType: 'mat4', label: 'mat4 var' },
            { min: 405, max: 450, varType: 'sampler2D', label: 'sampler2D var' },
            { min: 450, max: 495, varType: 'samplerCube', label: 'samplerCube var' },
            { min: 495, max: 999, varType: 'sampler3D', label: 'sampler3D var' }
        ]
    },
    SE: {
        angle: 315, range: 45, type: 'assignment', label: 'Assignment', icon: '=',
        // distanceChoices populated dynamically based on available variables
    },
    S: { angle: 270, range: 45, type: 'if-statement', label: 'If Statement', icon: '❓' },
    N: {
        angle: 90, range: 45, type: 'for-loop', label: 'For Loop', icon: '🔁',
        distanceChoices: [
            { min: 0, max: 70, template: 'simple', label: 'for(int i = 0; i < N; i++)' },
            { min: 70, max: 140, template: 'flexible', label: 'for(int i = 0; i < ⮊; ⮊)' },
            { min: 140, max: 210, template: 'float', label: 'for(float i = ⮊; i < ⮊; ⮊)' },
            { min: 210, max: 999, template: 'custom', label: 'for(int ⮊ = ⮊; ⮊; ⮊)' }
        ]
    },
    W: { angle: 180, range: 45, type: 'comment', label: 'Comment', icon: '💬', disabled: true },
    SW: { angle: 225, range: 45, type: 'return', label: 'Return', icon: '↩️', disabled: true },
    NW: { angle: 135, range: 45, type: 'future', label: '[Future]', icon: '?', disabled: true }
};
