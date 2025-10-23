// Scope tracking and management
// Compact interface: getCurrentScope(element) -> scope object

export const ScopeManager = {
    // Walk up the DOM tree and collect scope information
    getCurrentScope(element) {
        const scope = {
            variables: [],
            functions: [],
            types: ['void', 'float', 'vec2', 'vec3', 'vec4', 'int', 'bool', 'mat2', 'mat3', 'mat4']
        };

        const collectFromNode = (node) => {
            if (!node || !node.dataset) return;

            // Collect variable declarations
            if (node.dataset.nodeType === 'var-decl') {
                const typeNode = node.querySelector('[data-node-type="type"]');
                const nameNode = node.querySelector('[data-node-type="identifier"]');

                if (typeNode && nameNode) {
                    scope.variables.push({
                        name: nameNode.dataset.name,
                        type: typeNode.dataset.typeName
                    });
                }
            }

            // Collect for-loop iterator variables
            if (node.dataset.nodeType === 'for-loop') {
                const header = node.querySelector('[data-role="header"]');
                if (header) {
                    const iteratorNode = header.querySelector('[data-node-type="identifier"]');
                    if (iteratorNode) {
                        scope.variables.push({
                            name: iteratorNode.dataset.name,
                            type: 'int'
                        });
                    }
                }
            }

            // Collect function declarations
            if (node.dataset.nodeType === 'function-decl') {
                scope.functions.push({
                    name: node.dataset.name,
                    returnType: node.dataset.returnType
                });
            }
        };

        // Collect from previous siblings and parents
        let current = element;
        while (current) {
            let sibling = current.previousSibling;
            while (sibling) {
                if (sibling.nodeType === 1) {
                    collectFromNode(sibling);
                    const varDecl = sibling.querySelector('[data-node-type="var-decl"]');
                    if (varDecl) collectFromNode(varDecl);
                }
                sibling = sibling.previousSibling;
            }

            current = current.parentElement;
            if (!current || current === document.body) break;
            collectFromNode(current);
        }

        return scope;
    },

    // Update all holes in the document with current scope
    updateAllHoles() {
        const holes = document.querySelectorAll('[data-node-type="hole"]');
        holes.forEach(hole => {
            const scope = this.getCurrentScope(hole);
            hole.dataset.scope = JSON.stringify(scope);
        });
    }
};
