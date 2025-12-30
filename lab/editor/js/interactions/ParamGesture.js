import { BaseGesture } from './GestureSystem.js';
import { NodeFactory } from '../core/NodeFactory.js';
import { ScopeManager } from '../core/ScopeManager.js';
import { LanguageConfig } from '../services/LanguageConfig.js';
import { varTypes } from '../config/types.js';

export class ParamGesture extends BaseGesture {
    constructor() {
        super();
        this.scope = null;
        this.paramsContainer = null;
        this.selectedType = null;
        this.currentHint = null; // 'add', 'add-next', 'delete-last', 'clear-all'
    }

    canStart(element) {
        return element.dataset.nodeType === 'hole' && element.dataset.contextType === 'parameter';
    }

    start(element, x, y) {
        if (!this.canStart(element)) return false;
        if (!super.start(element, x, y)) return false;
        this.scope = ScopeManager.getCurrentScope(element);
        this.paramsContainer = element.closest('[data-role="params"]');
        this.originalHTML = element.innerHTML;
        this.originalColor = element.style.color;
        return true;
    }

    move(x, y) {
        if (!this.active || !this.target) return;
        const dx = x - this.origin.x;
        const dy = y - this.origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const thresh = 10;

        if (distance < thresh) {
            this.selectedType = null;
            this.currentHint = null;
            this.updatePreview();
            return;
        }

        // Angle: 0° = Right, CCW
        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        // DOWN sector: select type by distance
        if (angle >= 225 && angle < 315) {
            const types = this.getSupportedTypes();
            const step = Math.max(1, Math.floor(220 / Math.max(1, types.length)));
            const dist = Math.min(400, Math.abs(dy));
            let index = Math.floor(dist / step);
            if (index < 0) index = 0;
            if (index >= types.length) index = types.length - 1;
            this.selectedType = types[index];
            this.currentHint = dx < 0 ? 'add' : 'add-next'; // left = finish, right = continue
        } else if (angle >= 45 && angle < 135) {
            // UP sector: deletion controls
            this.selectedType = null;
            this.currentHint = dx >= 0 ? 'delete-last' : 'clear-all';
        } else {
            // Left/Right (not used for type selection)
            this.selectedType = null;
            this.currentHint = null;
        }

        this.updatePreview();
    }

    end() {
        if (!this.active) return;

        if (this.target && this.paramsContainer) {
            const scope = this.scope;
            switch (this.currentHint) {
                case 'add': {
                    const name = this.nextParamName();
                    const paramNode = NodeFactory.createParam(this.selectedType || 'int', scope, name);
                    // Replace hole with param
                    this.target.replaceWith(paramNode);
                    break;
                }
                case 'add-next': {
                    const name = this.nextParamName();
                    const paramNode = NodeFactory.createParam(this.selectedType || 'int', scope, name);
                    this.target.replaceWith(paramNode);
                    this.paramsContainer.appendChild(NodeFactory.createParamSeparator());
                    this.paramsContainer.appendChild(NodeFactory.createHole('parameter', 'any', scope));
                    break;
                }
                case 'delete-last': {
                    const params = this.paramsContainer.querySelectorAll('[data-node-type="param"]');
                    if (params.length > 0) {
                        const last = params[params.length - 1];
                        last.remove();
                    }
                    this.ensureAtLeastOneHole();
                    break;
                }
                case 'clear-all': {
                    this.paramsContainer.innerHTML = '';
                    this.paramsContainer.appendChild(NodeFactory.createHole('parameter', 'any', scope));
                    break;
                }
            }
        }

        this.active = false;
        this.target = null;
        this.paramsContainer = null;
        this.selectedType = null;
        this.currentHint = null;
        this.scope = null;
        document.body.style.userSelect = '';
    }

    getSupportedTypes() {
        const typesObj = LanguageConfig.getTypes ? LanguageConfig.getTypes() : null;
        const supported = typesObj ? new Set(Object.keys(typesObj)) : null;
        if (supported) return varTypes.filter(t => supported.has(t));
        return varTypes;
    }

    nextParamName() {
        const existing = this.paramsContainer.querySelectorAll('[data-node-type="param"]');
        return `param${existing.length + 1}`;
    }

    ensureAtLeastOneHole() {
        const hasParam = this.paramsContainer.querySelector('[data-node-type="param"]');
        const hasHole = this.paramsContainer.querySelector('[data-node-type="hole"][data-context-type="parameter"]');
        if (!hasParam && !hasHole) {
            this.paramsContainer.appendChild(NodeFactory.createHole('parameter', 'any', this.scope));
        }
    }

    updatePreview() {
        if (!this.target) return;
        if (!this.currentHint) {
            this.target.textContent = '✚';
            return;
        }

        if (this.currentHint === 'add' || this.currentHint === 'add-next') {
            const t = this.selectedType || 'int';
            this.target.innerHTML = `<span class="type-keyword">${t}</span> ✚`;
            return;
        }

        if (this.currentHint === 'delete-last') {
            this.target.innerHTML = `<span class="directional-label">delete last</span>`;
            return;
        }

        if (this.currentHint === 'clear-all') {
            this.target.innerHTML = `<span class="directional-label">clear all</span>`;
            return;
        }
    }
}
