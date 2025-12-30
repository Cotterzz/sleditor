// Handles hole replacement and node creation
// Compact interface: replaceHole(hole, choice) -> newNode or null

import { NodeFactory } from '../core/NodeFactory.js';
import { ScopeManager } from '../core/ScopeManager.js';
import { CodeGenerator } from '../core/CodeGenerator.js';
import { nextSequentialName } from '../utils/names.js';
import { getGlobalFunctionNames } from '../utils/scope.js';

export const InteractionController = {
    replaceHole(hole, choice) {
        const scope = ScopeManager.getCurrentScope(hole);
        const expectedType = hole.dataset.expectedType;
        const contextType = hole.dataset.contextType;
        let newNode = null;

        switch (choice.type) {
            case 'var-decl':
                const typeNode = choice.varType 
                    ? NodeFactory.createType(choice.varType)
                    : NodeFactory.createHole('type', 'any', scope);

                const idHole = NodeFactory.createHole('identifier', 'any', scope);

                newNode = NodeFactory.createVarDecl(typeNode, idHole, null);

                if (choice.varType) {
                    setTimeout(() => {
                        const varDeclEl = idHole.closest('[data-node-type="var-decl"]');
                        if (varDeclEl) {
                            varDeclEl.dataset.varType = choice.varType;
                            idHole.dataset.expectedType = choice.varType;
                        }
                    }, 0);
                }
                break;

            case 'assignment':
                newNode = NodeFactory.createAssignment(
                    NodeFactory.createHole('identifier', 'any', scope, 'select-existing'),
                    NodeFactory.createHole('expression', 'any', scope)
                );
                break;

            case 'literal':
                newNode = NodeFactory.createNumber(0, choice.expectedType || 'float');
                break;

            case 'bool-literal':
                newNode = NodeFactory.createBoolLiteral(choice.value);
                break;

            case 'var-ref':
                newNode = NodeFactory.createVarRef(choice.data.name, choice.data.type);
                break;

            case 'type-select':
                newNode = NodeFactory.createType(choice.typeName);

                const parentDecl = hole.closest('[data-node-type="var-decl"]');
                if (parentDecl) {
                    parentDecl.dataset.varType = choice.typeName;

                    const idHole = parentDecl.querySelector('[data-context-type="identifier"]');
                    if (idHole) {
                        idHole.dataset.expectedType = choice.typeName;
                    }
                }
                break;

            case 'name-select':
                newNode = NodeFactory.createIdentifier(choice.name);

                const parentVarDecl = hole.closest('[data-node-type="var-decl"]');
                if (parentVarDecl) {
                    parentVarDecl.dataset.varName = choice.name;
                }

                const parentAssignment = hole.closest('[data-node-type="assignment"]');
                if (parentAssignment) {
                    const currentScope = ScopeManager.getCurrentScope(parentAssignment);
                    const variable = currentScope.variables.find(v => v.name === choice.name);

                    if (variable) {
                        setTimeout(() => {
                            const valueHole = parentAssignment.querySelector('[data-node-type="hole"]');
                            if (valueHole) {
                                valueHole.dataset.expectedType = variable.type;
                                valueHole.title = `${valueHole.dataset.contextType} hole (expects ${variable.type})`;
                            }
                        }, 0);
                    }
                }
                break;

            case 'binary-op':
                newNode = NodeFactory.createBinaryOp(
                    NodeFactory.createHole('expression', choice.expectedType, scope),
                    NodeFactory.createOperator('+', 'math'),
                    NodeFactory.createHole('expression', choice.expectedType, scope),
                    choice.expectedType
                );
                break;

            case 'comparison-op':
                newNode = NodeFactory.createBinaryOp(
                    NodeFactory.createHole('expression', 'any', scope),
                    NodeFactory.createOperator('==', 'comparison'),
                    NodeFactory.createHole('expression', 'any', scope),
                    'bool'
                );
                break;

            case 'increment-select':
                newNode = NodeFactory.createIncrement(choice.data.name, choice.data.type);
                break;

            case 'function-call':
                const paramHoles = choice.data.params.map(param => 
                    NodeFactory.createHole('expression', param.type, scope)
                );
                newNode = NodeFactory.createFunctionCall(
                    choice.data.name,
                    choice.data.returnType,
                    paramHoles
                );
                break;

            case 'for-loop-simple':
                newNode = NodeFactory.createForLoop(scope, 'simple');
                break;

            case 'for-loop-flexible':
                newNode = NodeFactory.createForLoop(scope, 'flexible');
                break;

            case 'for-loop-float':
                newNode = NodeFactory.createForLoop(scope, 'float');
                break;

            case 'for-loop-custom':
                newNode = NodeFactory.createForLoop(scope, 'custom');
                break;

            case 'if-statement':
                newNode = NodeFactory.createIfStatement(scope);
                break;

            case 'param-create': {
                // Parent function header params container
                const paramsContainer = hole.closest('[data-role="params"]');
                if (paramsContainer) {
                    // Determine next param index
                    const existing = Array.from(paramsContainer.querySelectorAll('[data-node-type="param"]'));
                    const nextIndex = existing.length + 1;
                    const autoName = `param${nextIndex}`;

                    const paramNode = NodeFactory.createParam(choice.paramType, scope);
                    // Replace empty hole or append after a comma
                    if (hole.dataset && hole.dataset.nodeType === 'hole') {
                        // Create with auto name if the hole is first entry
                        const first = existing.length === 0;
                        const named = NodeFactory.createParam(choice.paramType, scope, autoName);
                        hole.replaceWith(named);
                    } else {
                        paramsContainer.appendChild(NodeFactory.createParamSeparator());
                        const named = NodeFactory.createParam(choice.paramType, scope, autoName);
                        paramsContainer.appendChild(named);
                    }
                    ScopeManager.updateAllHoles();
                    CodeGenerator.generate();
                }
                break;
            }

            case 'param-separator': {
                const paramsContainer = hole.closest('[data-role="params"]');
                if (paramsContainer) {
                    // Add comma and a new parameter hole
                    paramsContainer.appendChild(NodeFactory.createParamSeparator());
                    paramsContainer.appendChild(NodeFactory.createHole('parameter', 'any', scope));
                    ScopeManager.updateAllHoles();
                    CodeGenerator.generate();
                }
                break;
            }

            case 'param-clear': {
                const paramsContainer = hole.closest('[data-role="params"]');
                if (paramsContainer) {
                    paramsContainer.innerHTML = '';
                    paramsContainer.appendChild(NodeFactory.createHole('parameter', 'any', scope));
                    ScopeManager.updateAllHoles();
                    CodeGenerator.generate();
                }
                break;
            }

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
        }

        if (newNode) {
            hole.replaceWith(newNode);

            if (contextType === 'statement') {
                this.addNextHole(newNode, scope);
            }

            ScopeManager.updateAllHoles();
            CodeGenerator.generate();

            return newNode;
        }

        return null;
    },

    generateFunctionName(existingNames) {
        const baseName = 'myFunction';
        const existingSet = new Set(existingNames);
        let counter = 0;
        while (existingSet.has(`${baseName}${counter}`)) {
            counter++;
        }
        return `${baseName}${counter}`;
    },

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
    },

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
    },

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
}
