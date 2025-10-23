// Core node creation utilities
// Compact interface: create nodes with semantic data attributes

import { LanguageConfig } from '../services/LanguageConfig.js';

export const NodeFactory = {
    // Create an interaction point (typed hole)
    createHole(contextType, expectedType = 'any', scope = null, mode = null, hint = null) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'hole';
        el.dataset.contextType = contextType;
        el.dataset.expectedType = expectedType;
        el.dataset.scope = JSON.stringify(scope || this.getEmptyScope());
        if (mode) el.dataset.mode = mode;
        if (hint) el.dataset.hint = hint;
        el.className = 'hole';
        el.textContent = contextType === 'statement' ? '⮡' : '✚';
        el.title = `${contextType} hole${expectedType !== 'any' ? ` (expects ${expectedType})` : ''}`;
        return el;
    },

    // Create a number literal (interactive)
    createNumber(value, type) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'number';
        el.dataset.value = value.toString();
        el.dataset.glslType = type || 'float';
        el.className = 'number-literal';

        const formatted = this.formatNumberByType(value, type || 'float');
        el.textContent = formatted;
        el.title = `Drag to adjust ${type} value`;
        return el;
    },

    // Create a type node
    createType(typeName) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'type';
        el.dataset.typeName = typeName;
        el.className = 'type-keyword';
        el.textContent = typeName;
        return el;
    },

    // Create an identifier node
    createIdentifier(name, type = null) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'identifier';
        el.dataset.name = name;
        el.className = 'var-name';
        if (type) el.dataset.varType = type;
        el.textContent = name;
        return el;
    },

    // Create a variable reference
    createVarRef(name, type) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'var-ref';
        el.dataset.varName = name;
        el.dataset.varType = type;
        el.className = 'var-name';
        el.textContent = name;
        return el;
    },

    // Create a bool literal
    createBoolLiteral(value) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'bool-literal';
        el.dataset.value = value.toString();
        el.className = 'bool-literal';
        el.textContent = value ? 'true' : 'false';
        return el;
    },

    // Create an increment expression (e.g., i++)
    createIncrement(varName, varType = 'int') {
        const container = document.createElement('span');
        container.className = 'increment-expr';
        container.dataset.nodeType = 'increment';
        container.dataset.returnType = varType;

        const varSpan = document.createElement('span');
        varSpan.className = 'identifier';
        varSpan.textContent = varName;

        const opSpan = document.createElement('span');
        opSpan.className = 'operator';
        opSpan.textContent = '++';

        container.appendChild(varSpan);
        container.appendChild(opSpan);

        return container;
    },

    // Create a binary operation
    createBinaryOp(leftHole, operatorHole, rightHole, expectedType) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'binary-op';
        el.dataset.expectedType = expectedType;

        el.appendChild(document.createTextNode('('));
        el.appendChild(leftHole);
        el.appendChild(document.createTextNode(' '));
        el.appendChild(operatorHole);
        el.appendChild(document.createTextNode(' '));
        el.appendChild(rightHole);
        el.appendChild(document.createTextNode(')'));

        return el;
    },

    // Create a function declaration
    createFunctionDecl(returnType, name, params = [], body = [], scope = null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-line';

        const el = document.createElement('div');
        el.dataset.nodeType = 'function-decl';
        el.dataset.returnType = returnType;
        el.dataset.name = name;
        el.className = 'node-function';

        // Header
        const header = document.createElement('div');
        header.dataset.role = 'header';
        header.className = 'func-header';

        const typeSpan = document.createElement('span');
        typeSpan.className = 'type-keyword';
        typeSpan.textContent = returnType;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'func-name';
        nameSpan.textContent = ' ' + name;

        const openParen = document.createElement('span');
        openParen.className = 'punctuation';
        openParen.textContent = '(';

        const paramsContainer = document.createElement('span');
        paramsContainer.dataset.role = 'params';

        if (params && params.length > 0) {
            params.forEach((p, index) => {
                if (index > 0) {
                    const comma = document.createElement('span');
                    comma.className = 'punctuation';
                    comma.textContent = ', ';
                    paramsContainer.appendChild(comma);
                }
                paramsContainer.appendChild(p);
            });
        } else {
            // Start with a parameter hole to allow optional and multiple params
            const paramHole = this.createHole('parameter', 'any', scope || this.getEmptyScope());
            paramsContainer.appendChild(paramHole);
        }

        const closeParen = document.createElement('span');
        closeParen.className = 'punctuation';
        closeParen.textContent = ')';

        const braceSpan = document.createElement('span');
        braceSpan.className = 'punctuation';
        braceSpan.textContent = ' {';

        header.appendChild(typeSpan);
        header.appendChild(nameSpan);
        header.appendChild(openParen);
        header.appendChild(paramsContainer);
        header.appendChild(closeParen);
        header.appendChild(braceSpan);

        // Body
        const bodyEl = document.createElement('div');
        bodyEl.dataset.role = 'body';
        bodyEl.className = 'func-body';

        body.forEach(stmt => bodyEl.appendChild(stmt));

        // Closing brace
        const closingBrace = document.createElement('div');
        closingBrace.className = 'punctuation';
        closingBrace.textContent = '}';

        el.appendChild(header);
        el.appendChild(bodyEl);
        el.appendChild(closingBrace);

        wrapper.appendChild(el);
        return wrapper;
    },

    // Create a function parameter: type + identifier (auto or hole)
    createParam(paramType, scope = null, name = null) {
        const container = document.createElement('span');
        container.dataset.nodeType = 'param';

        const typeNode = this.createType(paramType);
        const space = document.createTextNode(' ');
        let idNode;
        if (name) {
            idNode = this.createIdentifier(name, paramType);
        } else {
            idNode = this.createHole('identifier', 'any', scope || this.getEmptyScope());
            idNode.dataset.expectedType = paramType;
        }

        container.appendChild(typeNode);
        container.appendChild(space);
        container.appendChild(idNode);

        return container;
    },

    // Create a parameter list separator (comma)
    createParamSeparator() {
        const comma = document.createElement('span');
        comma.className = 'punctuation';
        comma.textContent = ', ';
        return comma;
    },

    // Create a function call
    createFunctionCall(functionName, returnType, paramHoles) {
        const el = document.createElement('span');
        el.dataset.nodeType = 'function-call';
        el.dataset.functionName = functionName;
        el.dataset.returnType = returnType;
        el.className = 'func-name';

        el.textContent = functionName;
        el.appendChild(document.createTextNode('('));

        paramHoles.forEach((paramHole, index) => {
            if (index > 0) {
                const comma = document.createElement('span');
                comma.className = 'punctuation';
                comma.textContent = ', ';
                el.appendChild(comma);
            }
            el.appendChild(paramHole);
        });

        el.appendChild(document.createTextNode(')'));

        return el;
    },

    // Create an operator (with default value, draggable to change)
    createOperator(op, mode = 'math') {
        const el = document.createElement('span');
        el.dataset.nodeType = 'operator';
        el.dataset.operator = op;
        el.dataset.mode = mode;
        el.className = 'operator';
        el.textContent = op;
        return el;
    },

    // Format number based on current language type
    formatNumberByType(value, type) {
        return LanguageConfig.formatNumber(value, type);
    },

    // Create a for loop with different templates
    createForLoop(scope, template = 'custom') {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-line';

        const el = document.createElement('div');
        el.dataset.nodeType = 'for-loop';
        el.className = 'control-flow';

        const header = document.createElement('div');
        header.dataset.role = 'header';
        header.className = 'for-header';

        const forKeyword = document.createElement('span');
        forKeyword.className = 'keyword';
        forKeyword.textContent = 'for';

        const openParen = document.createElement('span');
        openParen.className = 'punctuation';
        openParen.textContent = ' (';

        header.appendChild(forKeyword);
        header.appendChild(openParen);

        // Build different templates (simplified version)
        if (template === 'simple') {
            const iteratorName = this.getNextIteratorName(scope);

            const initType = document.createElement('span');
            initType.className = 'type-keyword';
            initType.textContent = 'int';

            const iteratorId = this.createIdentifier(iteratorName);

            const eq = document.createElement('span');
            eq.className = 'operator';
            eq.textContent = ' = ';

            const zero = this.createNumber(0, 'int');

            const semi1 = document.createElement('span');
            semi1.className = 'punctuation';
            semi1.textContent = '; ';

            const condVar = document.createElement('span');
            condVar.className = 'identifier';
            condVar.textContent = iteratorName;

            const ltOp = document.createElement('span');
            ltOp.className = 'operator';
            ltOp.textContent = ' < ';

            const limitHole = this.createHole('expression', 'int', scope, null, 'value');

            const semi2 = document.createElement('span');
            semi2.className = 'punctuation';
            semi2.textContent = '; ';

            const incExpr = this.createIncrement(iteratorName, 'int');

            header.appendChild(initType);
            header.appendChild(document.createTextNode(' '));
            header.appendChild(iteratorId);
            header.appendChild(eq);
            header.appendChild(zero);
            header.appendChild(semi1);
            header.appendChild(condVar);
            header.appendChild(ltOp);
            header.appendChild(limitHole);
            header.appendChild(semi2);
            header.appendChild(incExpr);

        } else {
            // Custom/free-form: full control over everything
            const initType = document.createElement('span');
            initType.className = 'type-keyword';
            initType.textContent = 'int';

            const iteratorName = this.createHole('identifier', 'int', scope, 'loop-iterator');

            const eq1 = document.createElement('span');
            eq1.className = 'operator';
            eq1.textContent = ' = ';

            const initValue = this.createHole('expression', 'int', scope);

            const semi1 = document.createElement('span');
            semi1.className = 'punctuation';
            semi1.textContent = '; ';

            const conditionHole = this.createHole('expression', 'bool', scope, null, 'condition');

            const semi2 = document.createElement('span');
            semi2.className = 'punctuation';
            semi2.textContent = '; ';

            const incrementHole = this.createHole('expression', 'any', scope, null, 'mutation');

            header.appendChild(initType);
            header.appendChild(document.createTextNode(' '));
            header.appendChild(iteratorName);
            header.appendChild(eq1);
            header.appendChild(initValue);
            header.appendChild(semi1);
            header.appendChild(conditionHole);
            header.appendChild(semi2);
            header.appendChild(incrementHole);
        }

        const closeParen = document.createElement('span');
        closeParen.className = 'punctuation';
        closeParen.textContent = ')';

        const openBrace = document.createElement('span');
        openBrace.className = 'punctuation';
        openBrace.textContent = ' {';

        header.appendChild(closeParen);
        header.appendChild(openBrace);

        // Body
        const bodyEl = document.createElement('div');
        bodyEl.dataset.role = 'body';
        bodyEl.className = 'func-body';
        bodyEl.appendChild(this.createHole('statement', 'any', scope));

        // Closing brace
        const closingBrace = document.createElement('div');
        closingBrace.className = 'punctuation';
        closingBrace.textContent = '}';

        el.appendChild(header);
        el.appendChild(bodyEl);
        el.appendChild(closingBrace);

        wrapper.appendChild(el);
        return wrapper;
    },

    // Create an if statement
    createIfStatement(scope) {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-line';

        const el = document.createElement('div');
        el.dataset.nodeType = 'if-statement';
        el.className = 'control-flow';

        // Header: if (condition)
        const header = document.createElement('div');
        header.dataset.role = 'header';
        header.className = 'if-header';

        const ifKeyword = document.createElement('span');
        ifKeyword.className = 'keyword';
        ifKeyword.textContent = 'if';

        const openParen = document.createElement('span');
        openParen.className = 'punctuation';
        openParen.textContent = ' (';

        const conditionHole = this.createHole('expression', 'bool', scope);

        const closeParen = document.createElement('span');
        closeParen.className = 'punctuation';
        closeParen.textContent = ')';

        const openBrace = document.createElement('span');
        openBrace.className = 'punctuation';
        openBrace.textContent = ' {';

        header.appendChild(ifKeyword);
        header.appendChild(openParen);
        header.appendChild(conditionHole);
        header.appendChild(closeParen);
        header.appendChild(openBrace);

        // Body
        const bodyEl = document.createElement('div');
        bodyEl.dataset.role = 'body';
        bodyEl.className = 'func-body';
        bodyEl.appendChild(this.createHole('statement', 'any', scope));

        // Closing brace
        const closingBrace = document.createElement('div');
        closingBrace.className = 'punctuation';
        closingBrace.textContent = '}';

        el.appendChild(header);
        el.appendChild(bodyEl);
        el.appendChild(closingBrace);

        wrapper.appendChild(el);
        return wrapper;
    },

    // Get next available iterator name (i, j, k, l, m, n)
    getNextIteratorName(scope) {
        const reservedNames = ['i', 'j', 'k', 'l', 'm', 'n'];
        const usedNames = new Set((scope.variables || []).map(v => v.name));
        return reservedNames.find(name => !usedNames.has(name)) || 'i';
    },

    getEmptyScope() {
        return {
            variables: [],
            functions: [],
            types: ['void', 'float', 'vec2', 'vec3', 'vec4', 'int', 'bool', 'mat2', 'mat3', 'mat4']
        };
    }
};
