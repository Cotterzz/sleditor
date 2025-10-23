// Generate context-aware choices for holes
// Compact interface: getChoices(hole) -> array of choice objects

import { ScopeManager } from '../core/ScopeManager.js';
import { LanguageConfig } from './LanguageConfig.js';
import { varTypes } from '../config/types.js';

export const ChoiceGenerator = {
    getChoices(hole) {
        const contextType = hole.dataset.contextType;
        const expectedType = hole.dataset.expectedType;
        const scope = ScopeManager.getCurrentScope(hole);
        const mode = hole.dataset.mode || null;
        const hint = hole.dataset.hint || null;

        switch (contextType) {
            case 'statement':
                return this.getStatementChoices(scope);
            case 'expression':
                return this.getExpressionChoices(expectedType, scope, hint);
            case 'type':
                return this.getTypeChoices(scope);
            case 'identifier':
                return this.getIdentifierChoices(expectedType, scope, mode);
            case 'parameter':
                return this.getParameterChoices(scope);
            default:
                return [];
        }
    },

    getStatementChoices(scope) {
        const choices = [
            {
                type: 'var-decl-menu',
                label: 'Declare Variable',
                icon: '📦',
                submenu: [
                    { type: 'var-decl', label: 'int', icon: '🔢', varType: 'int' },
                    { type: 'var-decl', label: 'float', icon: '⚡', varType: 'float' },
                    { type: 'var-decl', label: 'vec2', icon: '➡️', varType: 'vec2' },
                    { type: 'var-decl', label: 'vec3', icon: '🔺', varType: 'vec3' },
                    { type: 'var-decl', label: 'vec4', icon: '⬛', varType: 'vec4' },
                    { type: 'var-decl', label: 'bool', icon: '✓', varType: 'bool' },
                    { type: 'var-decl', label: 'mat2', icon: '⊞₂', varType: 'mat2' },
                    { type: 'var-decl', label: 'mat3', icon: '⊞₃', varType: 'mat3' },
                    { type: 'var-decl', label: 'mat4', icon: '⊞₄', varType: 'mat4' },
                    { type: 'var-decl', label: 'sampler2D', icon: '🖼️', varType: 'sampler2D' },
                    { type: 'var-decl', label: 'samplerCube', icon: '🎲', varType: 'samplerCube' },
                    { type: 'var-decl', label: 'sampler3D', icon: '📦', varType: 'sampler3D' }
                ]
            }
        ];

        // Add function declaration option
        choices.push({
            type: 'function-decl-menu',
            label: 'Declare Function',
            icon: '⚡',
            submenu: [
                { type: 'function-decl', label: 'int', icon: '⚡', returnType: 'int' },
                { type: 'function-decl', label: 'float', icon: '⚡', returnType: 'float' },
                { type: 'function-decl', label: 'vec2', icon: '⚡', returnType: 'vec2' },
                { type: 'function-decl', label: 'vec3', icon: '⚡', returnType: 'vec3' },
                { type: 'function-decl', label: 'vec4', icon: '⚡', returnType: 'vec4' },
                { type: 'function-decl', label: 'bool', icon: '⚡', returnType: 'bool' },
                { type: 'function-decl', label: 'void', icon: '⚡', returnType: 'void' },
                { type: 'function-decl', label: 'mat2', icon: '⚡', returnType: 'mat2' },
                { type: 'function-decl', label: 'mat3', icon: '⚡', returnType: 'mat3' },
                { type: 'function-decl', label: 'mat4', icon: '⚡', returnType: 'mat4' }
            ]
        });

        choices.push({
            type: 'for-loop-menu',
            label: 'For Loop',
            icon: '🔁',
            submenu: [
                { type: 'for-loop-simple', label: 'Simple (i < N)', icon: '🔁', template: 'simple' },
                { type: 'for-loop-flexible', label: 'Flexible (int)', icon: '🔁', template: 'flexible' },
                { type: 'for-loop-float', label: 'Float Loop', icon: '🔁', template: 'float' },
                { type: 'for-loop-custom', label: 'Custom', icon: '🔁', template: 'custom' }
            ]
        });

        choices.push(
            { type: 'if-statement', label: 'If Statement', icon: '❓' },
            { type: 'return', label: 'Return', icon: '↩️' },
            { type: 'comment', label: 'Comment', icon: '💬' }
        );

        return choices;
    },

    getExpressionChoices(expectedType, scope, hint = null) {
        const choices = [];
        const numericTypes = ['float', 'int', 'vec2', 'vec3', 'vec4', 'any'];

        const isMutationContext = hint === 'mutation';
        const isConditionContext = hint === 'condition';
        const isValueContext = hint === 'value' || hint === null;

        // Add variables of matching type
        if (!isMutationContext && scope.variables) {
            scope.variables
                .filter(v => this.isTypeCompatible(v.type, expectedType))
                .forEach(v => {
                    choices.push({
                        type: 'var-ref',
                        label: v.name,
                        icon: '📌',
                        data: v
                    });
                });
        }

        // Add user-defined functions of matching return type
        if (!isMutationContext && scope.functions) {
            scope.functions
                .filter(f => this.isTypeCompatible(f.returnType, expectedType))
                .forEach(f => {
                    choices.push({
                        type: 'function-call',
                        label: `${f.name}()`,
                        icon: '⚡',
                        data: {
                            name: f.name,
                            returnType: f.returnType,
                            params: [] // User functions have no parameters for now
                        }
                    });
                });
        }

        // Add increment operator for integer variables (mutation only)
        if ((isMutationContext || expectedType === 'any') && scope.variables) {
            const intVars = scope.variables.filter(v => v.type === 'int');
            intVars.forEach(v => {
                choices.push({
                    type: 'increment-select',
                    label: `${v.name}++`,
                    icon: '⬆️',
                    data: v
                });
            });
        }

        // Add literal option
        if (!isMutationContext && numericTypes.includes(expectedType)) {
            const literalType = this.getLiteralType(expectedType);
            choices.push({
                type: 'literal',
                label: `${literalType} literal`,
                icon: '🔢',
                expectedType: literalType
            });
        }

        // Add bool literals
        if (!isMutationContext && (expectedType === 'bool' || expectedType === 'any')) {
            choices.push(
                { type: 'bool-literal', label: 'true', icon: '✓', value: true },
                { type: 'bool-literal', label: 'false', icon: '✗', value: false }
            );
        }

        // Add binary operators
        if (!isMutationContext && (expectedType === 'any' || numericTypes.includes(expectedType))) {
            choices.push({
                type: 'binary-op',
                label: 'Math (+, -, *, /)',
                icon: '➕',
                expectedType: expectedType
            });
        }

        // Add comparison operators
        if ((expectedType === 'bool' || expectedType === 'any') && !isMutationContext) {
            choices.push({
                type: 'comparison-op',
                label: 'Comparison (<, >, ==)',
                icon: '⚖️',
                expectedType: 'bool'
            });
        }

        // Add built-in functions
        if (!isMutationContext) {
            const builtInFunctions = this.getBuiltInFunctions();
            builtInFunctions
                .filter(f => this.isTypeCompatible(f.returnType, expectedType))
                .forEach(f => {
                    choices.push({
                        type: 'function-call',
                        label: `${f.name}(${f.params.map(p => p.type).join(', ')})`,
                        icon: '⚡',
                        data: f
                    });
                });
        }

        return choices;
    },

    isTypeCompatible(actualType, expectedType) {
        if (expectedType === 'any') return true;
        if (actualType === expectedType) return true;
        return false;
    },

    getLiteralType(expectedType) {
        if (expectedType === 'int' || expectedType === 'float') {
            return expectedType;
        }
        if (expectedType.startsWith('vec') || expectedType === 'any') {
            return 'float';
        }
        return 'float';
    },

    getBuiltInFunctions() {
        return LanguageConfig.getBuiltInFunctions();
    },

    getTypeChoices(scope) {
        const types = scope.types || ['float', 'vec2', 'vec3', 'vec4', 'int'];
        return types.map(typeName => ({
            type: 'type-select',
            label: typeName,
            icon: this.getTypeIcon(typeName),
            typeName: typeName
        }));
    },

    getIdentifierChoices(expectedType, scope, mode = null) {
        if (mode === 'select-existing') {
            if (!scope.variables || scope.variables.length === 0) {
                return [];
            }

            return scope.variables.map(v => ({
                type: 'name-select',
                label: v.name,
                icon: '📌',
                name: v.name
            }));
        }

        const existingNames = scope.variables ? scope.variables.map(v => v.name) : [];
        const suggestions = this.generateNameSuggestions(expectedType, existingNames);

        return suggestions.map(name => ({
            type: 'name-select',
            label: name,
            icon: '🏷️',
            name: name
        }));
    },

    getParameterChoices(scope) {
        const typesObj = LanguageConfig.getTypes ? LanguageConfig.getTypes() : null;
        const supported = typesObj ? new Set(Object.keys(typesObj)) : null;
        let typesList = varTypes;
        if (supported) typesList = varTypes.filter(t => supported.has(t));
        if (!typesList || typesList.length === 0) {
            typesList = typesObj ? Object.keys(typesObj) : (scope.types || ['int','float','vec2','vec3','vec4','bool','mat2','mat3','mat4']);
        }

        const base = typesList.map(t => ({ type: 'param-create', label: `${t} param`, icon: this.getTypeIcon(t), paramType: t }));
        base.push({ type: 'param-separator', label: 'Add comma', icon: ',', action: 'comma' });
        base.push({ type: 'param-clear', label: 'Clear parameters', icon: '✖', action: 'clear' });
        return base;
    },

    generateNameSuggestions(type, existingNames) {
        const typeMap = {
            'float': 'myFloat', 'int': 'myInt', 'vec2': 'myVec2',
            'vec3': 'myVec3', 'vec4': 'myVec4', 'bool': 'myBool',
            'mat2': 'myMat2', 'mat3': 'myMat3', 'mat4': 'myMat4',
            'sampler2D': 'myTex2D', 'samplerCube': 'myTexCube', 'sampler3D': 'myTex3D',
            'any': 'myVar'
        };

        const baseName = typeMap[type] || 'myVar';
        const suggestions = [];
        let counter = 0;

        for (let i = 0; i < 3; i++) {
            let name = `${baseName}${counter}`;
            while (existingNames.includes(name)) {
                counter++;
                name = `${baseName}${counter}`;
            }
            suggestions.push(name);
            counter++;
        }

        return suggestions;
    },

    getTypeIcon(typeName) {
        const icons = {
            'void': '∅', 'float': '1.0', 'int': '42', 'bool': '✓',
            'vec2': 'xy', 'vec3': 'xyz', 'vec4': 'xyzw',
            'mat2': '⊞₂', 'mat3': '⊞₃', 'mat4': '⊞₄',
            'sampler2D': '🖼️', 'samplerCube': '🎲', 'sampler3D': '📦'
        };
        return icons[typeName] || '?';
    },

    // Generate sequential function names
    generateFunctionName(existingNames) {
        const baseName = 'myFunction';
        let counter = 0;

        while (true) {
            const name = `${baseName}${counter}`;
            if (!existingNames.includes(name)) {
                return name;
            }
            counter++;
        }
    }
};
