// ============================================================================
// Editor - Monaco Integration, Language Definitions, Error Markers
// ============================================================================

import { state } from './core.js';

// ============================================================================
// WGSL Language Definition
// ============================================================================

const WGSL_LANGUAGE_CONFIG = {
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
        { open: '"', close: '"', notIn: ['string'] },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
    ]
};

const WGSL_MONARCH_TOKENS = {
    keywords: [
        'const', 'let', 'var', 'fn', 'return', 'if', 'else', 'for', 'while',
        'break', 'continue', 'discard', 'struct', 'type', 'alias'
    ],
    typeKeywords: [
        'f32', 'f16', 'i32', 'u32', 'bool',
        'vec2f', 'vec3f', 'vec4f', 'vec2i', 'vec3i', 'vec4i', 'vec2u', 'vec3u', 'vec4u',
        'vec2', 'vec3', 'vec4',
        'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
        'mat2x2f', 'mat2x3f', 'mat2x4f', 'mat3x2f', 'mat3x3f', 'mat3x4f', 'mat4x2f', 'mat4x3f', 'mat4x4f',
        'array', 'ptr', 'sampler', 'texture_2d', 'texture_storage_2d'
    ],
    builtins: [
        'position', 'vertex_index', 'instance_index', 'front_facing', 'frag_depth',
        'local_invocation_id', 'local_invocation_index', 'global_invocation_id',
        'workgroup_id', 'num_workgroups', 'sample_index', 'sample_mask'
    ],
    operators: [
        '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
        '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
        '<<', '>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
        '%=', '<<=', '>>=', '->'
    ],
    functions: [
        'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
        'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
        'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inverseSqrt',
        'abs', 'sign', 'floor', 'ceil', 'fract', 'trunc', 'round',
        'min', 'max', 'clamp', 'saturate', 'mix', 'step', 'smoothstep',
        'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
        'select', 'all', 'any', 'arrayLength', 'textureStore', 'textureLoad'
    ],
    tokenizer: {
        root: [
            // Attributes
            [/@[a-zA-Z_]\w*/, 'annotation'],
            
            // Keywords
            [/\b(fn|let|const|var|return|if|else|for|while|break|continue|struct)\b/, 'keyword'],
            
            // Type keywords
            [/\b(f32|f16|i32|u32|bool|vec2f|vec3f|vec4f|vec2i|vec3i|vec4i|vec2u|vec3u|vec4u|vec2|vec3|vec4|mat2x2|mat3x3|mat4x4|array|ptr|sampler|texture_2d|texture_storage_2d)\b/, 'type'],
            
            // Built-in functions
            [/\b(sin|cos|tan|abs|min|max|clamp|mix|length|dot|normalize|cross|select|textureStore|textureLoad)\b/, 'support.function'],
            
            // Numbers
            [/\b\d+\.?\d*[fu]?\b/, 'number'],
            [/0[xX][0-9a-fA-F]+[ul]?/, 'number'],
            
            // Strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
            
            // Comments
            [/\/\/.*$/, 'comment'],
            [/\/\*/, { token: 'comment', next: '@comment' }],
            
            // Operators
            [/[<>]=?/, 'operator'],
            [/[+\-*\/%=&|^!~]/, 'operator'],
            
            // Delimiters
            [/[{}()\[\]]/, '@brackets'],
            [/[;,.]/, 'delimiter'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            ['\\*/', 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],
        string: [
            [/[^\\"]+/, 'string'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],
    }
};

// ============================================================================
// GLSL Language Definition
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
    ]
};

const GLSL_MONARCH_TOKENS = {
    keywords: [
        'const', 'uniform', 'in', 'out', 'inout',
        'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return', 'discard',
        'struct', 'precision', 'highp', 'mediump', 'lowp',
        'attribute', 'varying', 'flat', 'smooth', 'layout', 'invariant'
    ],
    typeKeywords: [
        'void', 'bool', 'int', 'uint', 'float',
        'vec2', 'vec3', 'vec4',
        'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
        'mat2', 'mat3', 'mat4',
        'sampler2D', 'sampler3D', 'samplerCube'
    ],
    builtins: [
        'gl_Position', 'gl_FragCoord', 'gl_FragColor', 'gl_FragDepth',
        'gl_VertexID', 'gl_InstanceID', 'gl_FrontFacing'
    ],
    functions: [
        'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
        'abs', 'sign', 'floor', 'ceil', 'fract', 'mod',
        'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
        'length', 'distance', 'dot', 'cross', 'normalize',
        'reflect', 'refract', 'texture', 'texture2D'
    ],
    tokenizer: {
        root: [
            // Preprocessor
            [/#\s*\w+/, 'keyword.directive'],
            
            // Keywords
            [/\b(const|uniform|in|out|if|else|for|while|do|break|continue|return|discard|struct|precision|highp|mediump|lowp)\b/, 'keyword'],
            
            // Type keywords
            [/\b(void|bool|int|float|vec2|vec3|vec4|ivec2|ivec3|ivec4|mat2|mat3|mat4|sampler2D)\b/, 'type'],
            
            // Built-ins
            [/\b(gl_Position|gl_FragCoord|gl_FragColor|gl_VertexID)\b/, 'variable.predefined'],
            
            // Built-in functions
            [/\b(sin|cos|tan|abs|min|max|clamp|mix|length|dot|normalize|cross|texture2D|texture|pow|exp|sqrt)\b/, 'support.function'],
            
            // Numbers
            [/\b\d+\.?\d*([eE][\-+]?\d+)?[fF]?\b/, 'number'],
            
            // Comments
            [/\/\/.*$/, 'comment'],
            [/\/\*/, { token: 'comment', next: '@comment' }],
            
            // Operators
            [/[<>]=?/, 'operator'],
            [/[+\-*\/%=&|^!~]/, 'operator'],
            
            // Delimiters
            [/[{}()\[\]]/, '@brackets'],
            [/[;,.]/, 'delimiter'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, { token: 'comment', next: '@pop' }],
            [/[\/*]/, 'comment']
        ]
    }
};

// ============================================================================
// Monaco Initialization
// ============================================================================

export async function initMonaco(callback, initialCode, helpContent) {
    return new Promise((resolve) => {
        require(['vs/editor/editor.main'], async function() {
            // Register WGSL language
            monaco.languages.register({ id: 'wgsl' });
            monaco.languages.setLanguageConfiguration('wgsl', WGSL_LANGUAGE_CONFIG);
            monaco.languages.setMonarchTokensProvider('wgsl', WGSL_MONARCH_TOKENS);
            
            // Register GLSL language
            monaco.languages.register({ id: 'glsl' });
            monaco.languages.setLanguageConfiguration('glsl', GLSL_LANGUAGE_CONFIG);
            monaco.languages.setMonarchTokensProvider('glsl', GLSL_MONARCH_TOKENS);
            
            // Configure JavaScript validation to be lenient for code fragments
            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: false,  // Enable semantic validation
                noSyntaxValidation: false,    // Enable syntax checking
            });
            
            // Define custom themes to match our CSS
            monaco.editor.defineTheme('sleditor-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#1e1e1e',
                }
            });
            
            monaco.editor.defineTheme('sleditor-light', {
                base: 'vs',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#eeeeff',
                }
            });
            
            // Common editor options
            const editorOptions = {
                theme: state.isDarkMode ? 'sleditor-dark' : 'sleditor-light',
                fontSize: 13,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 4,
                insertSpaces: true,
                formatOnPaste: true,
                formatOnType: true,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                folding: true,
                foldingStrategy: 'indentation',
                renderWhitespace: 'selection',
                renderControlCharacters: false,
                scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible',
                    useShadows: false,
                    verticalHasArrows: false,
                    horizontalHasArrows: false
                }
            };
            
            // Create Boilerplate editor (read-only)
            const boilerplateContainer = document.getElementById('boilerplateContainer');
            boilerplateContainer.innerHTML = '';
            state.boilerplateEditor = monaco.editor.create(boilerplateContainer, {
                ...editorOptions,
                value: initialCode.boilerplate || '',
                language: 'wgsl',
                readOnly: true,
            });
            
            // Create Graphics editor
            const graphicsContainer = document.getElementById('graphicsContainer');
            graphicsContainer.innerHTML = '';
            state.graphicsEditor = monaco.editor.create(graphicsContainer, {
                ...editorOptions,
                value: initialCode.graphics || '',
                language: 'wgsl',
            });
            
            // Create Audio editor
            const audioContainer = document.getElementById('audioContainer');
            state.audioEditor = monaco.editor.create(audioContainer, {
                ...editorOptions,
                value: initialCode.audio || '',
                language: initialCode.audioLanguage || 'wgsl',
            });
            
            // Create JavaScript editor 
            const jsContainer = document.getElementById('jsEditorContainer');
            state.jsEditor = monaco.editor.create(jsContainer, {
                ...editorOptions,
                value: initialCode.js || '',
                language: 'javascript',
            });
            
            // Create Help editor (read-only)
            const helpContainer = document.getElementById('helpContainer');
            state.helpEditor = monaco.editor.create(helpContainer, {
                ...editorOptions,
                value: helpContent || '',
                language: 'plaintext',
                readOnly: true,
                wordWrap: 'on',
                lineNumbers: 'off',
            });
            
            // Setup keyboard shortcuts
            setupKeyboardShortcuts();
            
            // Setup Golf mode character count updater
            setupGolfCharCounter();
            
            if (callback) callback();
            resolve();
        });
    });
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function setupKeyboardShortcuts() {
    const addShortcuts = (editor) => {
        // F5 = Reload/Recompile shader
        editor.addCommand(monaco.KeyCode.F5, () => {
            if (window.reloadShader) window.reloadShader();
        });
        
        // Ctrl+S = Save shader (click the save button)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            const saveBtn = document.getElementById('saveShaderBtn');
            if (saveBtn) saveBtn.click();
        });
        
        // Ctrl+Space = Play/Pause
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
            if (window.togglePlayPause) window.togglePlayPause();
        });
    };
    
    addShortcuts(state.boilerplateEditor);
    addShortcuts(state.graphicsEditor);
    addShortcuts(state.audioEditor);
    addShortcuts(state.jsEditor);
    addShortcuts(state.helpEditor);
}

// ============================================================================
// Golf Mode Character Counter
// ============================================================================

function setupGolfCharCounter() {
    // Listen to graphics editor changes (used by Golf mode)
    state.graphicsEditor.onDidChangeModelContent(() => {
        // Import tabs module dynamically to avoid circular dependency
        import('./tabs.js').then(tabs => {
            tabs.updateGolfCharCount();
        });
    });
}

// ============================================================================
// Error Markers - WGSL
// ============================================================================

export function setWGSLErrors(errors) {
    // Calculate line offsets for each section
    // Code structure: boilerplate + '\n' + graphics + '\n' + audio
    const boilerplateLines = state.boilerplateEditor.getValue().split('\n').length;
    const graphicsLines = state.graphicsEditor.getValue().split('\n').length;
    
    // +1 for each '\n' separator
    const graphicsStartLine = boilerplateLines + 1;
    const audioStartLine = boilerplateLines + 1 + graphicsLines + 1;
    
    // Separate errors by which editor they belong to
    const boilerplateErrors = [];
    const graphicsErrors = [];
    const audioErrors = [];
    
    errors.forEach(err => {
        const lineNum = err.lineNum || 1;
        
        if (lineNum < graphicsStartLine) {
            // Error is in boilerplate
            boilerplateErrors.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: lineNum,
                startColumn: err.linePos || 1,
                endLineNumber: lineNum,
                endColumn: 1000,
                message: err.message
            });
        } else if (lineNum < audioStartLine) {
            // Error is in graphics - adjust line number
            graphicsErrors.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: lineNum - graphicsStartLine + 1,
                startColumn: err.linePos || 1,
                endLineNumber: lineNum - graphicsStartLine + 1,
                endColumn: 1000,
                message: err.message
            });
        } else {
            // Error is in audio - adjust line number
            audioErrors.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: lineNum - audioStartLine + 2,
                startColumn: err.linePos || 1,
                endLineNumber: lineNum - audioStartLine + 2,
                endColumn: 1000,
                message: err.message
            });
        }
    });
    
    // Set markers in the appropriate editors
    monaco.editor.setModelMarkers(state.boilerplateEditor.getModel(), 'wgsl', boilerplateErrors);
    monaco.editor.setModelMarkers(state.graphicsEditor.getModel(), 'wgsl', graphicsErrors);
    monaco.editor.setModelMarkers(state.audioEditor.getModel(), 'wgsl', audioErrors);
}

export function clearWGSLErrors() {
    monaco.editor.setModelMarkers(state.boilerplateEditor.getModel(), 'wgsl', []);
    monaco.editor.setModelMarkers(state.graphicsEditor.getModel(), 'wgsl', []);
    monaco.editor.setModelMarkers(state.audioEditor.getModel(), 'wgsl', []);
    // Also clear JavaScript errors in audio editor (for AudioWorklet mode switching)
    monaco.editor.setModelMarkers(state.audioEditor.getModel(), 'javascript', []);
}

// ============================================================================
// Error Markers - GLSL
// ============================================================================

export function setGLSLErrors(errors) {
    // GLSL errors are simpler - just one fragment shader in graphics editor
    const markers = errors.map(err => ({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: err.lineNum || 1,
        startColumn: err.linePos || 1,
        endLineNumber: err.lineNum || 1,
        endColumn: 1000,
        message: err.message
    }));
    // Use 'glsl-errors' as owner to avoid conflicts with monaco's cpp linter
    monaco.editor.setModelMarkers(state.graphicsEditor.getModel(), 'glsl-errors', markers);
}

export function clearGLSLErrors() {
    monaco.editor.setModelMarkers(state.graphicsEditor.getModel(), 'glsl-errors', []);
}

// ============================================================================
// Error Markers - JavaScript
// ============================================================================

export function setJSErrors(errors) {
    const markers = errors.map(err => ({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: err.lineNum || 1,
        startColumn: err.column || 1,
        endLineNumber: err.lineNum || 1,
        endColumn: err.endColumn || 1000,
        message: err.message
    }));
    monaco.editor.setModelMarkers(state.jsEditor.getModel(), 'javascript', markers);
}

export function clearJSErrors() {
    monaco.editor.setModelMarkers(state.jsEditor.getModel(), 'javascript', []);
}

// ============================================================================
// Error Markers - AudioWorklet
// ============================================================================

export function setAudioWorkletErrors(errors) {
    const markers = errors.map(err => ({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: err.lineNum || 1,
        startColumn: err.column || 1,
        endLineNumber: err.lineNum || 1,
        endColumn: err.endColumn || 1000,
        message: err.message
    }));
    monaco.editor.setModelMarkers(state.audioEditor.getModel(), 'javascript', markers);
}

export function clearAudioWorkletErrors() {
    monaco.editor.setModelMarkers(state.audioEditor.getModel(), 'javascript', []);
}

// ============================================================================
// Clear All Errors
// ============================================================================

export function clearAllErrors() {
    clearWGSLErrors();
    clearGLSLErrors();
    clearJSErrors();
    clearAudioWorkletErrors();
}

// ============================================================================
// Language Switching
// ============================================================================

export function switchLanguage(editor, language) {
    monaco.editor.setModelLanguage(editor.getModel(), language);
}

// ============================================================================
// Theme Switching
// ============================================================================

export function setTheme(isDark) {
    const theme = isDark ? 'sleditor-dark' : 'sleditor-light';
    monaco.editor.setTheme(theme);
}

