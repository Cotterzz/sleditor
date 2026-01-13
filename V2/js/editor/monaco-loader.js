/**
 * Monaco Editor Loader
 * 
 * Loads Monaco from CDN and provides utilities for shader editing.
 * Features:
 * - GLSL + WGSL language support
 * - Shader library autocomplete (sl.* functions)
 * - Hover documentation
 * - Custom themes matching SLUI
 */

import { logger } from '../core/logger.js';

const MONACO_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min';

let monacoLoaded = false;
let loadingPromise = null;

/**
 * Load Monaco editor from CDN
 */
export async function loadMonaco() {
    if (monacoLoaded && window.monaco) {
        return window.monaco;
    }
    
    if (loadingPromise) {
        return loadingPromise;
    }
    
    loadingPromise = new Promise((resolve, reject) => {
        logger.info('Editor', 'Monaco', 'Loading Monaco editor...');
        
        // Configure AMD loader paths
        window.require = { paths: { vs: `${MONACO_CDN}/vs` } };
        
        // Load the AMD loader
        const loaderScript = document.createElement('script');
        loaderScript.src = `${MONACO_CDN}/vs/loader.min.js`;
        loaderScript.onload = () => {
            // Load Monaco editor
            window.require(['vs/editor/editor.main'], () => {
                monacoLoaded = true;
                logger.success('Editor', 'Monaco', '✓ Monaco loaded');
                registerLanguages();
                resolve(window.monaco);
            });
        };
        loaderScript.onerror = (err) => {
            logger.error('Editor', 'Monaco', 'Failed to load Monaco');
            reject(err);
        };
        
        document.head.appendChild(loaderScript);
    });
    
    return loadingPromise;
}

// ============================================================================
// Language Configurations
// ============================================================================

const GLSL_LANGUAGE_CONFIG = {
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
    ]
};

const GLSL_MONARCH_TOKENS = {
    keywords: [
        'attribute', 'const', 'uniform', 'varying', 'break', 'continue',
        'do', 'else', 'for', 'if', 'discard', 'return', 'switch', 'case',
        'default', 'subroutine', 'in', 'out', 'inout', 'void', 'true',
        'false', 'invariant', 'precise', 'precision', 'highp', 'mediump',
        'lowp', 'struct', 'layout', 'centroid', 'flat', 'smooth',
        'noperspective', 'patch', 'sample', 'coherent', 'volatile',
        'restrict', 'readonly', 'writeonly', 'shared'
    ],
    
    typeKeywords: [
        'float', 'double', 'int', 'uint', 'bool', 'vec2', 'vec3', 'vec4',
        'dvec2', 'dvec3', 'dvec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2',
        'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4', 'mat2', 'mat3',
        'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4',
        'mat4x2', 'mat4x3', 'mat4x4', 'sampler1D', 'sampler2D', 'sampler3D',
        'samplerCube', 'sampler2DShadow', 'samplerCubeShadow', 'sampler2DArray',
        'sampler2DArrayShadow', 'isampler2D', 'isampler3D', 'isamplerCube',
        'usampler2D', 'usampler3D', 'usamplerCube', 'image2D', 'image3D'
    ],
    
    builtins: [
        // Shadertoy uniforms
        'iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iChannelTime',
        'iChannelResolution', 'iMouse', 'iChannel0', 'iChannel1', 'iChannel2',
        'iChannel3', 'iDate', 'iSampleRate', 'iFrameRate',
        
        // Math functions
        'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'pow', 'exp',
        'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 'abs', 'sign', 'floor',
        'trunc', 'round', 'roundEven', 'ceil', 'fract', 'mod', 'modf',
        'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'isnan', 'isinf',
        
        // Geometric functions
        'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward',
        'reflect', 'refract', 'matrixCompMult', 'outerProduct', 'transpose',
        'determinant', 'inverse',
        
        // Vector functions
        'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual',
        'equal', 'notEqual', 'any', 'all', 'not',
        
        // Texture functions
        'texture', 'textureProj', 'textureLod', 'textureOffset', 'texelFetch',
        'texelFetchOffset', 'textureProjOffset', 'textureLodOffset',
        'textureProjLod', 'textureProjLodOffset', 'textureGrad',
        'textureGradOffset', 'textureProjGrad', 'textureProjGradOffset',
        'textureSize', 'textureQueryLod', 'textureQueryLevels',
        'texture2D', 'texture2DProj', 'texture2DLod', 'textureCube',
        
        // Fragment processing
        'dFdx', 'dFdy', 'dFdxFine', 'dFdyFine', 'dFdxCoarse', 'dFdyCoarse',
        'fwidth', 'fwidthFine', 'fwidthCoarse'
    ],
    
    // Sleditor shader library functions (sl.*)
    slFunctions: [
        'sl'  // Will be highlighted as library namespace
    ],
    
    operators: [
        '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
        '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^',
        '%', '<<', '>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
        '%=', '<<=', '>>='
    ],
    
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    
    tokenizer: {
        root: [
            // Preprocessor (before anything else)
            [/#\s*\w+/, 'keyword.directive'],
            
            // sl.* library calls (special highlighting)
            [/\bsl\b/, 'support.class'],
            
            // Identifiers and keywords
            [/[a-zA-Z_]\w*/, {
                cases: {
                    '@typeKeywords': 'type',
                    '@keywords': 'keyword',
                    '@builtins': 'support.function',
                    '@default': 'identifier'
                }
            }],
            
            // Whitespace
            { include: '@whitespace' },
            
            // Delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/@symbols/, {
                cases: {
                    '@operators': 'operator',
                    '@default': ''
                }
            }],
            
            // Numbers
            [/(@digits)[eE]([\-+]?(@digits))?[fF]?/, 'number.float'],
            [/(@digits)\.(@digits)([eE][\-+]?(@digits))?[fF]?/, 'number.float'],
            [/\.(@digits)([eE][\-+]?(@digits))?[fF]?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+[uU]?/, 'number.hex'],
            [/(@digits)[uU]?/, 'number'],
            
            // Delimiter
            [/[;,.]/, 'delimiter'],
            
            // Strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string']
        ],
        
        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment']
        ],
        
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        
        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop']
        ]
    }
};

// ============================================================================
// WGSL Language Definition (for future WebGPU support)
// ============================================================================

const WGSL_LANGUAGE_CONFIG = {
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
        ['<', '>']
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '<', close: '>' },
        { open: '"', close: '"' }
    ]
};

const WGSL_MONARCH_TOKENS = {
    keywords: [
        'fn', 'let', 'var', 'const', 'override', 'struct', 'type', 'alias',
        'if', 'else', 'switch', 'case', 'default', 'loop', 'for', 'while',
        'break', 'continue', 'continuing', 'return', 'discard',
        'true', 'false', 'enable', 'diagnostic'
    ],
    typeKeywords: [
        'bool', 'f16', 'f32', 'i32', 'u32',
        'vec2', 'vec3', 'vec4', 'mat2x2', 'mat2x3', 'mat2x4',
        'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
        'array', 'atomic', 'ptr', 'sampler', 'sampler_comparison',
        'texture_1d', 'texture_2d', 'texture_2d_array', 'texture_3d',
        'texture_cube', 'texture_cube_array', 'texture_multisampled_2d',
        'texture_storage_1d', 'texture_storage_2d', 'texture_storage_2d_array',
        'texture_storage_3d', 'texture_depth_2d', 'texture_depth_2d_array',
        'texture_depth_cube', 'texture_depth_cube_array', 'texture_depth_multisampled_2d'
    ],
    builtins: [
        'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2',
        'ceil', 'clamp', 'cos', 'cosh', 'cross', 'degrees', 'determinant',
        'distance', 'dot', 'exp', 'exp2', 'faceForward', 'floor', 'fma',
        'fract', 'frexp', 'inverseSqrt', 'ldexp', 'length', 'log', 'log2',
        'max', 'min', 'mix', 'modf', 'normalize', 'pow', 'radians', 'reflect',
        'refract', 'round', 'sign', 'sin', 'sinh', 'smoothstep', 'sqrt',
        'step', 'tan', 'tanh', 'transpose', 'trunc',
        'textureSample', 'textureSampleLevel', 'textureSampleGrad',
        'textureLoad', 'textureStore', 'textureDimensions'
    ],
    tokenizer: {
        root: [
            [/@[a-zA-Z_]\w*/, 'annotation'],
            [/[a-zA-Z_]\w*/, {
                cases: {
                    '@typeKeywords': 'type',
                    '@keywords': 'keyword',
                    '@builtins': 'support.function',
                    '@default': 'identifier'
                }
            }],
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],
            [/[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?[fh]?/, 'number'],
            [/0x[0-9a-fA-F]+[iu]?/, 'number.hex'],
            [/[{}()\[\]<>]/, '@brackets'],
            [/[;,.]/, 'delimiter'],
            [/->/, 'operator']
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ]
    }
};

// ============================================================================
// Shader Library Autocomplete (sl.* functions)
// ============================================================================

const SL_LIBRARY_FUNCTIONS = [
    {
        name: 'palette',
        signature: 'sl.palette(t: float, a: vec3, b: vec3, c: vec3, d: vec3) → vec3',
        description: 'Attempt number 2',
        detail: 'Attempt number 2'
    },
    {
        name: 'noise2D',
        signature: 'sl.noise2D(p: vec2) → float',
        description: 'Value noise in 2D. Returns value in range [-1, 1].',
        detail: 'sl.noise2D(vec2) → float'
    },
    {
        name: 'noise3D',
        signature: 'sl.noise3D(p: vec3) → float',
        description: 'Value noise in 3D. Returns value in range [-1, 1].',
        detail: 'sl.noise3D(vec3) → float'
    },
    {
        name: 'fbm2D',
        signature: 'sl.fbm2D(p: vec2, octaves: int) → float',
        description: 'Fractal Brownian Motion noise in 2D.',
        detail: 'sl.fbm2D(vec2, int) → float'
    },
    {
        name: 'fbm3D',
        signature: 'sl.fbm3D(p: vec3, octaves: int) → float',
        description: 'Fractal Brownian Motion noise in 3D.',
        detail: 'sl.fbm3D(vec3, int) → float'
    },
    {
        name: 'voronoi',
        signature: 'sl.voronoi(p: vec2) → vec2',
        description: 'Voronoi cell noise. Returns (distance to edge, cell ID).',
        detail: 'sl.voronoi(vec2) → vec2'
    },
    {
        name: 'smin',
        signature: 'sl.smin(a: float, b: float, k: float) → float',
        description: 'Smooth minimum for blending SDFs.',
        detail: 'sl.smin(float, float, float) → float'
    },
    {
        name: 'smax',
        signature: 'sl.smax(a: float, b: float, k: float) → float',
        description: 'Smooth maximum for blending SDFs.',
        detail: 'sl.smax(float, float, float) → float'
    },
    {
        name: 'rotateX',
        signature: 'sl.rotateX(angle: float) → mat3',
        description: 'Rotation matrix around X axis.',
        detail: 'sl.rotateX(float) → mat3'
    },
    {
        name: 'rotateY',
        signature: 'sl.rotateY(angle: float) → mat3',
        description: 'Rotation matrix around Y axis.',
        detail: 'sl.rotateY(float) → mat3'
    },
    {
        name: 'rotateZ',
        signature: 'sl.rotateZ(angle: float) → mat3',
        description: 'Rotation matrix around Z axis.',
        detail: 'sl.rotateZ(float) → mat3'
    },
    {
        name: 'hash',
        signature: 'sl.hash(p: float) → float',
        description: 'Fast hash function for procedural generation.',
        detail: 'sl.hash(float) → float'
    },
    {
        name: 'hash2',
        signature: 'sl.hash2(p: vec2) → vec2',
        description: 'Fast 2D hash returning 2D result.',
        detail: 'sl.hash2(vec2) → vec2'
    },
    {
        name: 'hash3',
        signature: 'sl.hash3(p: vec3) → vec3',
        description: 'Fast 3D hash returning 3D result.',
        detail: 'sl.hash3(vec3) → vec3'
    }
];

function registerShaderLibraryAutocomplete(monaco) {
    // Register for GLSL language
    monaco.languages.registerCompletionItemProvider('glsl', {
        triggerCharacters: ['.'],
        provideCompletionItems: (model, position) => {
            const textUntilPosition = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            });
            
            // Check if we're after "sl."
            const slMatch = textUntilPosition.match(/\bsl\.(\w*)$/);
            if (slMatch) {
                const suggestions = SL_LIBRARY_FUNCTIONS.map(fn => ({
                    label: fn.name,
                    kind: monaco.languages.CompletionItemKind.Function,
                    documentation: fn.description,
                    detail: fn.detail,
                    insertText: fn.name,
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column - slMatch[1].length,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    }
                }));
                return { suggestions };
            }
            
            return { suggestions: [] };
        }
    });
    
    // Register hover provider for sl.* functions
    monaco.languages.registerHoverProvider('glsl', {
        provideHover: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;
            
            const line = model.getLineContent(position.lineNumber);
            const beforeWord = line.substring(0, word.startColumn - 1);
            
            // Check if this is an sl.function
            if (beforeWord.endsWith('sl.')) {
                const fn = SL_LIBRARY_FUNCTIONS.find(f => f.name === word.word);
                if (fn) {
                    return {
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: word.startColumn,
                            endLineNumber: position.lineNumber,
                            endColumn: word.endColumn
                        },
                        contents: [
                            { value: `**${fn.signature}**` },
                            { value: fn.description }
                        ]
                    };
                }
            }
            
            // Check for built-in GLSL functions
            const builtinDocs = GLSL_BUILTIN_DOCS[word.word];
            if (builtinDocs) {
                return {
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endLineNumber: position.lineNumber,
                        endColumn: word.endColumn
                    },
                    contents: [
                        { value: `**${builtinDocs.signature}**` },
                        { value: builtinDocs.description }
                    ]
                };
            }
            
            return null;
        }
    });
}

// Common GLSL built-in function documentation
const GLSL_BUILTIN_DOCS = {
    mix: {
        signature: 'mix(x, y, a)',
        description: 'Linear interpolation between x and y using a. Returns x*(1-a) + y*a.'
    },
    smoothstep: {
        signature: 'smoothstep(edge0, edge1, x)',
        description: 'Hermite interpolation between 0 and 1. Returns 0 if x ≤ edge0, 1 if x ≥ edge1.'
    },
    clamp: {
        signature: 'clamp(x, minVal, maxVal)',
        description: 'Constrains x to lie between minVal and maxVal.'
    },
    fract: {
        signature: 'fract(x)',
        description: 'Returns the fractional part of x (x - floor(x)).'
    },
    normalize: {
        signature: 'normalize(v)',
        description: 'Returns a vector with same direction as v but length 1.'
    },
    dot: {
        signature: 'dot(x, y)',
        description: 'Returns the dot product of x and y.'
    },
    cross: {
        signature: 'cross(x, y)',
        description: 'Returns the cross product of x and y (vec3 only).'
    },
    reflect: {
        signature: 'reflect(I, N)',
        description: 'Reflects incident vector I around normal N.'
    },
    refract: {
        signature: 'refract(I, N, eta)',
        description: 'Refracts incident vector I through surface with normal N and ratio eta.'
    },
    length: {
        signature: 'length(v)',
        description: 'Returns the length (magnitude) of vector v.'
    },
    distance: {
        signature: 'distance(p0, p1)',
        description: 'Returns the distance between points p0 and p1.'
    },
    texture: {
        signature: 'texture(sampler, coord)',
        description: 'Samples a texture at the given coordinates.'
    },
    pow: {
        signature: 'pow(x, y)',
        description: 'Returns x raised to the power y.'
    },
    abs: {
        signature: 'abs(x)',
        description: 'Returns the absolute value of x.'
    },
    sign: {
        signature: 'sign(x)',
        description: 'Returns -1 if x < 0, 0 if x == 0, 1 if x > 0.'
    },
    floor: {
        signature: 'floor(x)',
        description: 'Returns the largest integer not greater than x.'
    },
    ceil: {
        signature: 'ceil(x)',
        description: 'Returns the smallest integer not less than x.'
    },
    mod: {
        signature: 'mod(x, y)',
        description: 'Returns x modulo y (x - y * floor(x/y)).'
    },
    min: {
        signature: 'min(x, y)',
        description: 'Returns the smaller of x and y.'
    },
    max: {
        signature: 'max(x, y)',
        description: 'Returns the larger of x and y.'
    },
    step: {
        signature: 'step(edge, x)',
        description: 'Returns 0 if x < edge, else 1.'
    },
    dFdx: {
        signature: 'dFdx(p)',
        description: 'Returns the partial derivative of p with respect to screen x.'
    },
    dFdy: {
        signature: 'dFdy(p)',
        description: 'Returns the partial derivative of p with respect to screen y.'
    },
    fwidth: {
        signature: 'fwidth(p)',
        description: 'Returns abs(dFdx(p)) + abs(dFdy(p)).'
    }
};

// ============================================================================
// Theme Definitions
// ============================================================================

function registerThemes(monaco) {
    // Dark theme (matches SLUI dark themes)
    monaco.editor.defineTheme('sleditor-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: 'c586c0' },
            { token: 'keyword.directive', foreground: '9cdcfe' },
            { token: 'type', foreground: '4ec9b0' },
            { token: 'support.function', foreground: 'dcdcaa' },
            { token: 'support.class', foreground: '4FC3F7', fontStyle: 'bold' },  // sl namespace
            { token: 'number', foreground: 'b5cea8' },
            { token: 'number.float', foreground: 'b5cea8' },
            { token: 'number.hex', foreground: 'b5cea8' },
            { token: 'comment', foreground: '6a9955' },
            { token: 'string', foreground: 'ce9178' },
            { token: 'annotation', foreground: '9cdcfe' },  // WGSL attributes
            { token: 'operator', foreground: 'd4d4d4' }
        ],
        colors: {
            'editor.background': '#1e1e1e',
            'editor.foreground': '#d4d4d4',
            'editorLineNumber.foreground': '#858585',
            'editorLineNumber.activeForeground': '#c6c6c6',
            'editor.selectionBackground': '#264f78',
            'editor.inactiveSelectionBackground': '#3a3d41',
            'editorCursor.foreground': '#aeafad',
            'editor.lineHighlightBackground': '#2a2d2e'
        }
    });
    
    // Light theme (matches SLUI light themes)
    monaco.editor.defineTheme('sleditor-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '7C4DFF' },
            { token: 'keyword.directive', foreground: '0277BD' },
            { token: 'type', foreground: '00796B' },
            { token: 'support.function', foreground: 'F57C00' },
            { token: 'support.class', foreground: '0288D1', fontStyle: 'bold' },  // sl namespace
            { token: 'number', foreground: '388E3C' },
            { token: 'number.float', foreground: '388E3C' },
            { token: 'number.hex', foreground: '388E3C' },
            { token: 'comment', foreground: '689F38' },
            { token: 'string', foreground: 'E64A19' },
            { token: 'annotation', foreground: '0277BD' },  // WGSL attributes
            { token: 'operator', foreground: '333333' }
        ],
        colors: {
            'editor.background': '#f5f5f5',
            'editor.foreground': '#333333',
            'editorLineNumber.foreground': '#999999',
            'editorLineNumber.activeForeground': '#333333',
            'editor.selectionBackground': '#add6ff',
            'editor.inactiveSelectionBackground': '#e5ebf1',
            'editorCursor.foreground': '#333333',
            'editor.lineHighlightBackground': '#ebebeb'
        }
    });
}

// ============================================================================
// Register All Languages
// ============================================================================

function registerLanguages() {
    const monaco = window.monaco;
    
    // Register GLSL
    monaco.languages.register({ id: 'glsl' });
    monaco.languages.setLanguageConfiguration('glsl', GLSL_LANGUAGE_CONFIG);
    monaco.languages.setMonarchTokensProvider('glsl', GLSL_MONARCH_TOKENS);
    
    // Register WGSL
    monaco.languages.register({ id: 'wgsl' });
    monaco.languages.setLanguageConfiguration('wgsl', WGSL_LANGUAGE_CONFIG);
    monaco.languages.setMonarchTokensProvider('wgsl', WGSL_MONARCH_TOKENS);
    
    // Register themes
    registerThemes(monaco);
    
    // Register autocomplete and hover providers
    registerShaderLibraryAutocomplete(monaco);
    
    // Add CSS for error decorations
    const errorStyles = document.createElement('style');
    errorStyles.textContent = `
        .v2-error-line {
            background-color: rgba(248, 81, 73, 0.15) !important;
        }
        .v2-error-glyph {
            background-color: #f85149;
            border-radius: 50%;
            margin-left: 5px;
        }
    `;
    document.head.appendChild(errorStyles);
    
    logger.debug('Editor', 'Monaco', 'Languages registered: GLSL, WGSL');
}

// ============================================================================
// Theme Management
// ============================================================================

/**
 * Set Monaco editor theme based on dark/light mode
 */
export function setMonacoTheme(isDark) {
    if (!window.monaco) return;
    const theme = isDark ? 'sleditor-dark' : 'sleditor-light';
    window.monaco.editor.setTheme(theme);
    logger.debug('Editor', 'Theme', `Set Monaco theme to ${theme}`);
}

/**
 * Detect if current SLUI theme is dark
 */
function isDarkTheme() {
    // Check SLUI state (correct path)
    if (window.SLUI?.state?.theme) {
        const themeName = window.SLUI.state.theme;
        // Light themes typically have 'light' in name or are known light themes
        const isLight = themeName.includes('light') || themeName === 'github' || themeName === 'designer';
        return !isLight;
    }
    // Fall back to system preference
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

// ============================================================================
// Editor Creation
// ============================================================================

/**
 * Create a Monaco editor instance
 */
export function createMonacoEditor(container, options = {}) {
    if (!window.monaco) {
        logger.error('Editor', 'Monaco', 'Monaco not loaded');
        return null;
    }
    
    const defaultOptions = {
        language: 'glsl',
        theme: isDarkTheme() ? 'sleditor-dark' : 'sleditor-light',
        value: '',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        tabSize: 4,
        insertSpaces: true,
        wordWrap: 'on',
        folding: true,
        bracketPairColorization: { enabled: true },
        guides: { indentation: true }
    };
    
    const editor = window.monaco.editor.create(container, {
        ...defaultOptions,
        ...options
    });
    
    return editor;
}

export default { loadMonaco, createMonacoEditor, setMonacoTheme };
