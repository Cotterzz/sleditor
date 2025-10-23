// Convert DOM AST back to code (language-aware)
// Compact interface: generate() -> updates output element

import { LanguageConfig } from '../services/LanguageConfig.js';

export const CodeGenerator = {
    generate() {
        const root = document.getElementById('editor');
        const currentLang = LanguageConfig.getCurrent();
        const code = this.toCode(root, 0);
        const emptyMessage = `// Empty ${currentLang.name} program`;
        document.getElementById('output').textContent = code || emptyMessage;
    },

    toCode(element, indent = 0) {
        if (!element) return '';

        // Handle text nodes
        if (element.nodeType === 3) {
            return element.textContent || '';
        }

        const nodeType = element.dataset?.nodeType;
        const currentLang = LanguageConfig.getCurrent();

        switch (nodeType) {
            case 'function-decl': {
                const returnType = element.dataset.returnType;
                const name = element.dataset.name;
                const body = element.querySelector('[data-role="body"]');
                const params = element.querySelector('[data-role="params"]');

                let paramCode = '';
                if (params) {
                    const paramNodes = Array.from(params.querySelectorAll(':scope > [data-node-type="param"]'));
                    paramCode = paramNodes.map(p => this.toCode(p, 0)).join(', ');
                }

                let statements = '';
                if (body) {
                    statements = Array.from(body.childNodes)
                        .map(child => this.toCode(child, 1))
                        .filter(s => s && s.trim())
                        .map(s => '  ' + s)
                        .join('\n');
                }

                switch (currentLang.name) {
                    case 'JavaScript':
                        return `function ${name}(${paramCode}) {\n${statements}\n}`;
                    case 'WGSL':
                        return `fn ${name}(${paramCode}) {\n${statements}\n}`;
                    default:
                        return `${returnType} ${name}(${paramCode}) {\n${statements}\n}`;
                }
            }

            case 'var-decl': {
                const typeNode = element.querySelector('[data-node-type="type"]');
                const nameNode = element.querySelector('[data-node-type="identifier"]');

                if (!typeNode || !nameNode) return '';

                let decl = `${typeNode.textContent} ${nameNode.textContent}`;

                const initNode = element.querySelector('[data-node-type="number"], [data-node-type="bool-literal"], [data-node-type="var-ref"], [data-node-type="binary-op"], [data-node-type="function-call"]');

                if (initNode) {
                    decl += ` = ${this.toCode(initNode, indent)}`;
                }

                return decl + ';';
            }

            case 'number': {
                const value = parseFloat(element.dataset.value);
                const type = element.dataset.glslType || 'float';
                return LanguageConfig.formatNumber(value, type);
            }

            case 'bool-literal':
                return element.dataset.value === 'true' ? 'true' : 'false';

            case 'type':
                return element.dataset.typeName;

            case 'identifier':
                return element.dataset.name;

            case 'var-ref':
                return element.dataset.varName;

            case 'operator':
                return element.dataset.operator;

            case 'hole':
                return '';

            case 'param': {
                const typeNode = element.querySelector('[data-node-type="type"]');
                const idNode = element.querySelector('[data-node-type="identifier"]');
                if (!typeNode || !idNode) return '';
                return `${typeNode.textContent} ${idNode.textContent}`;
            }

            default:
                // Recursively process children
                if (element.childNodes) {
                    const children = Array.from(element.childNodes)
                        .map(child => this.toCode(child, indent))
                        .filter(s => s && s.trim());

                    if (element.id === 'editor') {
                        return children.join('\n\n');
                    }

                    return children.join('');
                }
                return '';
        }
    }
};
