// Directional gesture for statement selection
// Compact interface: angle + distance determines statement type and template

import { BaseGesture, createGestureHTML } from './GestureSystem.js';
import { NodeFactory } from '../core/NodeFactory.js';
import { ScopeManager } from '../core/ScopeManager.js';
import { CodeGenerator } from '../core/CodeGenerator.js';
import { nextSequentialName } from '../utils/names.js';
import { getGlobalFunctionNames } from '../utils/scope.js';
import { directionMap as configuredDirectionMap } from '../config/gestures.js';

export class DirectionalGesture extends BaseGesture {
    constructor() {
        super();
        this.currentChoice = null;
        this.scope = null;
        this.originalText = null;
        this.originalColor = null;
    }

    static directionMap = configuredDirectionMap;

    canStart(element) {
        return element.dataset.nodeType === 'hole' && element.dataset.contextType === 'statement';
    }

    start(element, x, y) {
        if (!super.start(element, x, y)) return;

        this.scope = ScopeManager.getCurrentScope(element);
        this.originalText = element.textContent;
        this.originalColor = element.style.color;
    }

    move(x, y) {
        if (!this.active) return;

        const dx = x - this.origin.x;
        const dy = y - this.origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate angle (0° = East, increases counterclockwise)
        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        // Find matching direction
        let matchedDirection = null;
        let currentChoice = null;

        if (distance > 10) {
            for (const [dir, config] of Object.entries(DirectionalGesture.directionMap)) {
                if (config.disabled) continue;

                let minAngle = config.angle - config.range / 2;
                let maxAngle = config.angle + config.range / 2;

                if (minAngle < 0) minAngle += 360;
                if (maxAngle > 360) maxAngle -= 360;

                const inRange = (minAngle < maxAngle)
                    ? (angle >= minAngle && angle <= maxAngle)
                    : (angle >= minAngle || angle <= maxAngle);

                if (inRange) {
                    matchedDirection = dir;
                    currentChoice = { ...config };

                    // Dynamically populate assignment choices
                    if (config.type === 'assignment') {
                        const vars = this.scope.variables || [];
                        if (vars.length === 0) {
                            currentChoice.distanceChoices = [
                                { min: 0, max: 999, none: true, label: 'no variables' }
                            ];
                        } else if (vars.length === 1) {
                            const v = vars[0];
                            currentChoice.distanceChoices = [
                                { min: 0, max: 999, varName: v.name, varType: v.type, label: `${v.name} = ...` }
                            ];
                        } else {
                            const domain = 200; // stretch the first a bit more
                            const step = Math.floor(domain / vars.length);
                            const bands = vars.map((v, i) => ({
                                min: i * step,
                                max: i === vars.length - 1 ? 999 : (i + 1) * step,
                                varName: v.name,
                                varType: v.type,
                                label: `${v.name} = ...`
                            }));
                            // Make first band slightly larger when multiple
                            // if (bands.length > 1) bands[0].max += Math.floor(step * 0.5);
                            currentChoice.distanceChoices = bands;
                        }
                    }

                    // Check for distance-based sub-choices
                    if (currentChoice && currentChoice.distanceChoices) {
                        for (const subChoice of currentChoice.distanceChoices) {
                            if (distance >= subChoice.min && distance < subChoice.max) {
                                currentChoice = { ...currentChoice, ...subChoice };
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        }

        this.currentChoice = currentChoice;
        this.updatePreview();
    }

    end() {
        if (this.active) {
            if (this.currentChoice) {
                this.createNode(this.currentChoice);
            } else {
                // Restore original hole appearance
                if (this.target) {
                    this.target.textContent = this.originalText;
                    this.target.style.color = this.originalColor;
                }
            }

            this.active = false;
            this.target = null;
            this.currentChoice = null;
            this.originalText = null;
            this.originalColor = null;

            document.body.style.userSelect = '';
        }
    }

    createNode(choice) {
        if (!this.target) return;

        let newNode = null;
        const scope = this.scope;

        switch (choice.type) {
            case 'var-decl':
                const typeNode = choice.varType
                    ? NodeFactory.createType(choice.varType)
                    : NodeFactory.createHole('type', 'any', scope);

                const varName = this.generateVarName(choice.varType || 'float', scope);
                const idNode = NodeFactory.createIdentifier(varName, choice.varType);

                newNode = this.createVarDeclWrapper(typeNode, idNode);

                if (choice.varType) {
                    setTimeout(() => {
                        const varDeclEl = idNode.closest('[data-node-type="var-decl"]');
                        if (varDeclEl) {
                            varDeclEl.dataset.varType = choice.varType;
                            varDeclEl.dataset.varName = varName;
                        }
                    }, 0);
                }
                break;

            case 'function-decl':
                const existingFuncNames = getGlobalFunctionNames();
                const funcName = nextSequentialName('myFunction', existingFuncNames);
                newNode = NodeFactory.createFunctionDecl(
                    choice.returnType || 'void',
                    funcName,
                    [],
                    [NodeFactory.createHole('statement', 'any', scope)]
                );

                const funcDeclEl = newNode.querySelector('[data-node-type="function-decl"]');
                if (funcDeclEl) {
                    funcDeclEl.dataset.name = funcName;
                }
                break;

            case 'assignment':
                if (choice.varName) {
                    const varId = NodeFactory.createIdentifier(choice.varName, choice.varType);
                    newNode = this.createAssignmentWrapper(varId, NodeFactory.createHole('expression', choice.varType, scope));

                    setTimeout(() => {
                        const assignEl = varId.closest('[data-node-type="assignment"]');
                        if (assignEl) {
                            const valueHole = assignEl.querySelector('[data-node-type="hole"]');
                            if (valueHole) {
                                valueHole.dataset.expectedType = choice.varType;
                            }
                        }
                    }, 0);
                } else if (scope.variables && scope.variables.length > 0) {
                    newNode = this.createAssignmentWrapper(
                        NodeFactory.createHole('identifier', 'any', scope, 'select-existing'),
                        NodeFactory.createHole('expression', 'any', scope)
                    );
                }
                break;

            case 'for-loop':
                newNode = NodeFactory.createForLoop(scope, choice.template || 'simple');
                break;

            case 'if-statement':
                newNode = NodeFactory.createIfStatement(scope);
                break;
        }

        if (newNode) {
            this.target.replaceWith(newNode);
            this.addNextHole(newNode, scope);
            ScopeManager.updateAllHoles();
            CodeGenerator.generate();
        }
    }

    createVarDeclWrapper(typeNode, idNode) {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-line';

        const el = document.createElement('div');
        el.dataset.nodeType = 'var-decl';

        el.appendChild(typeNode);
        el.appendChild(document.createTextNode(' '));
        el.appendChild(idNode);

        const semi = document.createElement('span');
        semi.className = 'punctuation';
        semi.textContent = ';';
        el.appendChild(semi);

        wrapper.appendChild(el);
        return wrapper;
    }

    createAssignmentWrapper(targetHole, valueHole) {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-line';

        const el = document.createElement('div');
        el.dataset.nodeType = 'assignment';

        el.appendChild(targetHole);

        const eq = document.createElement('span');
        eq.className = 'operator';
        eq.textContent = '=';
        el.appendChild(document.createTextNode(' '));
        el.appendChild(eq);
        el.appendChild(document.createTextNode(' '));

        el.appendChild(valueHole);

        const semi = document.createElement('span');
        semi.className = 'punctuation';
        semi.textContent = ';';
        el.appendChild(semi);

        wrapper.appendChild(el);
        return wrapper;
    }

    addNextHole(node, scope) {
        const parent = node.parentElement;
        const nextSibling = node.nextSibling;
        if (nextSibling) {
            parent.insertBefore(
                NodeFactory.createHole('statement', 'any', scope),
                nextSibling
            );
        } else {
            parent.appendChild(
                NodeFactory.createHole('statement', 'any', scope)
            );
        }
    }

    updatePreview() {
        if (!this.target) return;

        if (this.currentChoice) {
            const previewHTML = this.getPreviewHTML(this.currentChoice);
            this.target.innerHTML = previewHTML;
            this.target.style.color = '';
        } else {
            this.target.textContent = '⮊';
            this.target.style.color = '';
        }
    }

    getPreviewHTML(choice) {
        switch (choice.type) {
            case 'var-decl':
                if (choice.varType) {
                    const currentScope = ScopeManager.getCurrentScope(this.target);
                    const varName = this.generateVarName(choice.varType, currentScope);
                    return `<span class="type-keyword">${choice.varType}</span> <span class="var-name" data-var-type="${choice.varType}">${varName}</span>`;
                }
                return 'declare';

            case 'function-decl':
                if (choice.returnType) {
                    const existingFuncNames = getGlobalFunctionNames();
                    const funcName = nextSequentialName('myFunction', existingFuncNames);
                    return `<span class="type-keyword">${choice.returnType}</span> <span class="func-name">${funcName}</span><span class="punctuation">()</span>`;
                }
                return 'function';

            case 'assignment':
                if (choice.none) {
                    return `<span class="directional-label">no variables</span>`;
                }
                if (choice.varName) {
                    return `<span class="var-name" data-var-type="${choice.varType}">${choice.varName}</span> <span class="operator">=</span> ...`;
                }
                return 'assign';

            case 'for-loop':
                const forKw = `<span class="keyword">for</span>`;
                const punc = (text) => `<span class="punctuation">${text}</span>`;
                const typeKw = (text) => `<span class="type-keyword">${text}</span>`;
                const varName = (name, type) => `<span class="var-name" data-var-type="${type}">${name}</span>`;
                const op = (text) => `<span class="operator">${text}</span>`;
                const num = (val, type) => `<span class="number-literal" data-glsl-type="${type}">${val}</span>`;
                const hole = `<span class="hole">⮊</span>`;

                if (choice.template === 'simple') {
                    return `${forKw}${punc('(')}${typeKw('int')} ${varName('i', 'int')} ${op('=')} ${num('0', 'int')}${punc('; ')}${varName('i', 'int')} ${op('<')} ${hole}${punc('; ')}${varName('i', 'int')}${op('++)')}`;
                } else if (choice.template === 'flexible') {
                    return `${forKw}${punc('(')}${typeKw('int')} ${varName('i', 'int')} ${op('=')} ${num('0', 'int')}${punc('; ')}${varName('i', 'int')} ${op('<')} ${hole}${punc('; ')}${hole}${punc(')')}`;
                } else if (choice.template === 'float') {
                    return `${forKw}${punc('(')}${typeKw('float')} ${varName('i', 'float')} ${op('=')} ${hole}${punc('; ')}${varName('i', 'float')} ${op('<')} ${hole}${punc('; ')}${hole}${punc(')')}`;
                } else if (choice.template === 'custom') {
                    return `${forKw}${punc('(')}${typeKw('int')} ${hole} ${op('=')} ${hole}${punc('; ')}${hole}${punc('; ')}${hole}${punc(')')}`;
                }
                return `${forKw}${punc('(...)')}`;

            case 'if-statement':
                return `<span class="keyword">if</span> <span class="punctuation">(...)</span>`;

            default:
                return choice.label || '?';
        }
    }

    generateVarName(type, scope) {
        const typePrefix = {
            'float': 'myFloat', 'int': 'myInt', 'vec2': 'myVec2',
            'vec3': 'myVec3', 'vec4': 'myVec4', 'bool': 'myBool',
            'mat2': 'myMat2', 'mat3': 'myMat3', 'mat4': 'myMat4',
            'sampler2D': 'myTex2D', 'samplerCube': 'myTexCube', 'sampler3D': 'myTex3D'
        };

        const prefix = typePrefix[type] || 'myVar';
        const existingVars = scope.variables || [];

        let counter = 0;
        let varName = prefix + counter;
        while (existingVars.some(v => v.name === varName)) {
            counter++;
            varName = prefix + counter;
        }

        return varName;
    }

    generateFunctionName(existingNames) {
        const baseName = 'myFunction';
        const existingSet = new Set(existingNames);
        let counter = 0;
        while (existingSet.has(`${baseName}${counter}`)) {
            counter++;
        }
        return `${baseName}${counter}`;
    }
}
