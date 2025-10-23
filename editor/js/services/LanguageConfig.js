// Language abstraction layer for easy switching between GLSL, JS, WGSL, etc.
// Compact interface: configure language-specific behavior

export const LanguageConfig = {
    currentLanguage: 'glsl',

    languages: {
        glsl: {
            name: 'GLSL',
            commentSyntax: '//',
            blockComment: { start: '/*', end: '*/' },
            stringDelimiter: '"',
            types: {
                float: { keywords: ['float'], defaultValue: '0.0' },
                int: { keywords: ['int'], defaultValue: '0' },
                bool: { keywords: ['bool'], defaultValue: 'false' },
                vec2: { keywords: ['vec2'], defaultValue: 'vec2(0.0)' },
                vec3: { keywords: ['vec3'], defaultValue: 'vec3(0.0)' },
                vec4: { keywords: ['vec4'], defaultValue: 'vec4(0.0)' },
                mat2: { keywords: ['mat2'], defaultValue: 'mat2(1.0)' },
                mat3: { keywords: ['mat3'], defaultValue: 'mat3(1.0)' },
                mat4: { keywords: ['mat4'], defaultValue: 'mat4(1.0)' },
                sampler2D: { keywords: ['sampler2D'], defaultValue: 'sampler2D()' },
                samplerCube: { keywords: ['samplerCube'], defaultValue: 'samplerCube()' },
                sampler3D: { keywords: ['sampler3D'], defaultValue: 'sampler3D()' }
            },
            builtInFunctions: [
                // Math functions
                { name: 'abs', returnType: 'float', params: [{type: 'float'}] },
                { name: 'sin', returnType: 'float', params: [{type: 'float'}] },
                { name: 'cos', returnType: 'float', params: [{type: 'float'}] },
                { name: 'sqrt', returnType: 'float', params: [{type: 'float'}] },
                { name: 'min', returnType: 'float', params: [{type: 'float'}, {type: 'float'}] },
                { name: 'max', returnType: 'float', params: [{type: 'float'}, {type: 'float'}] },
                // Vector constructors
                { name: 'vec2', returnType: 'vec2', params: [{type: 'float'}, {type: 'float'}] },
                { name: 'vec3', returnType: 'vec3', params: [{type: 'float'}, {type: 'float'}, {type: 'float'}] },
                { name: 'vec4', returnType: 'vec4', params: [{type: 'float'}, {type: 'float'}, {type: 'float'}, {type: 'float'}] },
            ],
            formatNumber: (value, type) => {
                if (type === 'int') {
                    return Math.floor(value).toString();
                }
                const num = parseFloat(value);
                if (Number.isInteger(num)) {
                    return num.toString() + '.0';
                }
                return num.toString();
            }
        },

        javascript: {
            name: 'JavaScript',
            commentSyntax: '//',
            blockComment: { start: '/*', end: '*/' },
            stringDelimiter: '"',
            types: {
                number: { keywords: ['number', 'Number'], defaultValue: '0' },
                boolean: { keywords: ['boolean', 'Boolean'], defaultValue: 'false' },
                string: { keywords: ['string', 'String'], defaultValue: '""' },
                object: { keywords: ['object', 'Object'], defaultValue: '{}' },
                array: { keywords: ['array', 'Array'], defaultValue: '[]' }
            },
            builtInFunctions: [
                { name: 'Math.abs', returnType: 'number', params: [{type: 'number'}] },
                { name: 'Math.sin', returnType: 'number', params: [{type: 'number'}] },
                { name: 'Math.cos', returnType: 'number', params: [{type: 'number'}] },
                { name: 'Math.sqrt', returnType: 'number', params: [{type: 'number'}] },
                { name: 'Math.min', returnType: 'number', params: [{type: 'number'}, {type: 'number'}] },
                { name: 'Math.max', returnType: 'number', params: [{type: 'number'}, {type: 'number'}] },
                { name: 'parseInt', returnType: 'number', params: [{type: 'string'}, {type: 'number'}] },
                { name: 'parseFloat', returnType: 'number', params: [{type: 'string'}] },
            ],
            formatNumber: (value, type) => {
                return value.toString();
            }
        },

        wgsl: {
            name: 'WGSL',
            commentSyntax: '//',
            blockComment: { start: '/*', end: '*/' },
            stringDelimiter: '"',
            types: {
                f32: { keywords: ['f32'], defaultValue: '0.0f' },
                i32: { keywords: ['i32'], defaultValue: '0i' },
                bool: { keywords: ['bool'], defaultValue: 'false' },
                vec2f: { keywords: ['vec2<f32>', 'vec2f'], defaultValue: 'vec2f()' },
                vec3f: { keywords: ['vec3<f32>', 'vec3f'], defaultValue: 'vec3f()' },
                vec4f: { keywords: ['vec4<f32>', 'vec4f'], defaultValue: 'vec4f()' }
            },
            builtInFunctions: [
                { name: 'abs', returnType: 'f32', params: [{type: 'f32'}] },
                { name: 'sin', returnType: 'f32', params: [{type: 'f32'}] },
                { name: 'cos', returnType: 'f32', params: [{type: 'f32'}] },
                { name: 'sqrt', returnType: 'f32', params: [{type: 'f32'}] },
                { name: 'min', returnType: 'f32', params: [{type: 'f32'}, {type: 'f32'}] },
                { name: 'max', returnType: 'f32', params: [{type: 'f32'}, {type: 'f32'}] },
                { name: 'vec2', returnType: 'vec2f', params: [{type: 'f32'}, {type: 'f32'}] },
                { name: 'vec3', returnType: 'vec3f', params: [{type: 'f32'}, {type: 'f32'}, {type: 'f32'}] },
                { name: 'vec4', returnType: 'vec4f', params: [{type: 'f32'}, {type: 'f32'}, {type: 'f32'}, {type: 'f32'}] },
            ],
            formatNumber: (value, type) => {
                if (type === 'i32') {
                    return Math.floor(value) + 'i';
                }
                if (type === 'f32') {
                    const num = parseFloat(value);
                    if (Number.isInteger(num)) {
                        return num.toString() + '.0f';
                    }
                    return num.toString() + 'f';
                }
                return value.toString();
            }
        }
    },

    // Get current language configuration
    getCurrent() {
        return this.languages[this.currentLanguage];
    },

    // Set current language
    setLanguage(language) {
        if (this.languages[language]) {
            this.currentLanguage = language;
            return true;
        }
        return false;
    },

    // Get available languages
    getAvailableLanguages() {
        return Object.keys(this.languages);
    },

    // Get built-in functions for current language
    getBuiltInFunctions() {
        return this.getCurrent().builtInFunctions;
    },

    // Get types for current language
    getTypes() {
        return this.getCurrent().types;
    },

    // Format number for current language
    formatNumber(value, type) {
        return this.getCurrent().formatNumber(value, type);
    },

    // Get default value for type
    getDefaultValue(type) {
        const langTypes = this.getCurrent().types;
        for (const [typeName, config] of Object.entries(langTypes)) {
            if (config.keywords.includes(type)) {
                return config.defaultValue;
            }
        }
        return '0'; // fallback
    }
};
