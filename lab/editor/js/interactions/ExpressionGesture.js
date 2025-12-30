import { BaseGesture } from './GestureSystem.js';
import { NodeFactory } from '../core/NodeFactory.js';
import { ScopeManager } from '../core/ScopeManager.js';
import { LanguageConfig } from '../services/LanguageConfig.js';

export class ExpressionGesture extends BaseGesture {
    constructor() {
        super();
        this.scope = null;
        this.currentChoice = null; // { kind: 'literal'|'var'|'call'|'binary'|'none', data, value }
    }

    canStart(element) {
        return element.dataset.nodeType === 'hole'
            && element.dataset.contextType === 'expression'
            && element.dataset.expectedType === 'int';
    }

    start(element, x, y) {
        if (!this.canStart(element)) return false;
        if (!super.start(element, x, y)) return false;
        this.scope = ScopeManager.getCurrentScope(element);
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
            this.currentChoice = null;
            this.updatePreview();
            return;
        }

        // Angle: 0° = Right, increases counterclockwise (match other gestures)
        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        if (angle >= 315 || angle < 45) {
            // RIGHT → literal tuning
            const base = 0;
            const step = 1;
            const horiz = Math.round(dx / 8);
            const vert = -Math.round(dy / 20);
            const value = base + step * (horiz + vert);
            this.currentChoice = { kind: 'literal', value };
        } else if (angle >= 45 && angle < 135) {
            // UP → declared int variables
            const vars = this.getIntVars();
            if (vars.length === 0) {
                this.currentChoice = { kind: 'none', reason: 'no int vars' };
            } else if (vars.length === 1) {
                this.currentChoice = { kind: 'var', data: vars[0] };
            } else {
                const dist = Math.min(400, distance);
                const step = Math.max(1, Math.floor(220 / vars.length));
                let index = Math.floor(dist / step);
                if (index < 0) index = 0;
                if (index >= vars.length) index = vars.length - 1;
                this.currentChoice = { kind: 'var', data: vars[index] };
            }
        } else if (angle >= 135 && angle < 225) {
            // LEFT → binary ops
            const ops = this.getBinaryOps();
            const dist = Math.min(400, distance);
            const step = Math.max(1, Math.floor(220 / ops.length));
            let index = Math.floor(dist / step);
            if (index < 0) index = 0;
            if (index >= ops.length) index = ops.length - 1;
            this.currentChoice = { kind: 'binary', data: { op: ops[index] } };
        } else {
            // DOWN → int-returning functions (user + built-ins)
            const fns = this.getIntFunctions();
            if (fns.length === 0) {
                this.currentChoice = { kind: 'none', reason: 'no int functions' };
            } else if (fns.length === 1) {
                this.currentChoice = { kind: 'call', data: fns[0] };
            } else {
                const dist = Math.min(400, distance);
                const step = Math.max(1, Math.floor(220 / fns.length));
                let index = Math.floor(dist / step);
                if (index < 0) index = 0;
                if (index >= fns.length) index = fns.length - 1;
                this.currentChoice = { kind: 'call', data: fns[index] };
            }
        }

        this.updatePreview();
    }

    end() {
        if (!this.active) return;

        if (this.currentChoice && this.target) {
            const scope = this.scope;
            switch (this.currentChoice.kind) {
                case 'literal': {
                    const val = Number.isInteger(this.currentChoice.value) ? this.currentChoice.value : 0;
                    const numberNode = NodeFactory.createNumber(val, 'int');
                    this.target.replaceWith(numberNode);
                    break;
                }
                case 'var': {
                    const v = this.currentChoice.data;
                    const varRef = NodeFactory.createVarRef(v.name, v.type);
                    this.target.replaceWith(varRef);
                    break;
                }
                case 'call': {
                    const f = this.currentChoice.data;
                    const paramHoles = (f.params || []).map(p => NodeFactory.createHole('expression', p.type, scope));
                    const callNode = NodeFactory.createFunctionCall(f.name, f.returnType || 'int', paramHoles);
                    this.target.replaceWith(callNode);
                    break;
                }
                case 'binary': {
                    const op = this.currentChoice.data.op || '+';
                    const left = NodeFactory.createHole('expression', 'int', scope);
                    const right = NodeFactory.createHole('expression', 'int', scope);
                    const operator = NodeFactory.createOperator(op, 'math');
                    const bin = NodeFactory.createBinaryOp(left, operator, right, 'int');
                    this.target.replaceWith(bin);
                    break;
                }
            }
        } else if (this.target) {
            // Restore original
            this.target.innerHTML = this.originalHTML;
            this.target.style.color = this.originalColor;
        }

        this.active = false;
        this.target = null;
        this.currentChoice = null;
        this.scope = null;
        document.body.style.userSelect = '';
    }

    getIntVars() {
        const scope = this.scope || { variables: [] };
        return (scope.variables || []).filter(v => v.type === 'int');
    }

    getIntFunctions() {
        const results = [];
        const seen = new Set();
        const scope = this.scope || { functions: [] };
        (scope.functions || [])
            .filter(f => f.returnType === 'int')
            .forEach(f => { if (!seen.has(f.name)) { results.push({ name: f.name, returnType: 'int', params: [] }); seen.add(f.name); } });

        // Fallback: include all global function declarations of returnType int
        const globalFuncs = Array.from(document.querySelectorAll('[data-node-type="function-decl"]'))
            .map(el => ({ name: el.dataset.name, returnType: el.dataset.returnType }))
            .filter(f => f.name && f.returnType === 'int');
        globalFuncs.forEach(f => { if (!seen.has(f.name)) { results.push({ name: f.name, returnType: 'int', params: [] }); seen.add(f.name); } });

        const builtins = LanguageConfig.getBuiltInFunctions();
        builtins
            .filter(f => f.returnType === 'int')
            .forEach(f => { if (!seen.has(f.name)) { results.push(f); seen.add(f.name); } });

        return results;
    }

    getBinaryOps() {
        return ['+', '-', '*', '/'];
    }

    updatePreview() {
        if (!this.target) return;

        if (!this.currentChoice) {
            this.target.textContent = '✚';
            return;
        }

        switch (this.currentChoice.kind) {
            case 'literal': {
                const v = Number.isInteger(this.currentChoice.value) ? this.currentChoice.value : 0;
                this.target.innerHTML = `<span class="number-literal" data-glsl-type="int">${v}</span>`;
                break;
            }
            case 'var': {
                const v = this.currentChoice.data;
                this.target.innerHTML = `<span class="var-name" data-var-type="int">${v.name}</span>`;
                break;
            }
            case 'call': {
                const f = this.currentChoice.data;
                this.target.innerHTML = `<span class="func-name">${f.name}</span><span class="punctuation">(</span><span class="punctuation">...)</span>`;
                break;
            }
            case 'binary': {
                const op = this.currentChoice.data.op || '+';
                this.target.innerHTML = `<span class="punctuation">(</span>✚ <span class="operator">${op}</span> ✚<span class="punctuation">)</span>`;
                break;
            }
            case 'none': {
                const msg = this.currentChoice.reason || 'none';
                this.target.innerHTML = `<span class="directional-label">${msg}</span>`;
                break;
            }
        }
    }
}
