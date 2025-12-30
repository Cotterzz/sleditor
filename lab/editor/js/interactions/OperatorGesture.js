// Operator selection gesture
// Compact interface: drag to change operators

import { BaseGesture, createGestureHTML } from './GestureSystem.js';

export class OperatorGesture extends BaseGesture {
    constructor() {
        super();
        this.mode = null;
    }

    static operators = {
        math: ['+', '-', '*', '/'],
        comparison: ['==', '<', '>', '!=', '<=', '>=']
    };

    canStart(element) {
        return element.dataset.nodeType === 'operator';
    }

    start(element, x, y) {
        if (!super.start(element, x, y)) return;

        this.mode = element.dataset.mode || 'math';
        this.updateFeedback(x, y, element.dataset.operator);
        this.showFeedback();
    }

    move(x, y) {
        if (!this.active) return;

        const dx = x - this.origin.x;
        const dy = y - this.origin.y;

        // Calculate total distance from origin
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Get operator list for current mode
        const operators = OperatorGesture.operators[this.mode];

        // Map distance to operator index
        const index = Math.min(
            Math.floor(distance / 20),
            operators.length - 1
        );

        const newOperator = operators[index];

        // Update operator
        this.target.dataset.operator = newOperator;
        this.target.textContent = newOperator;

        this.updateFeedback(x, y, newOperator, distance, index);

        // Import CodeGenerator dynamically to avoid circular dependency
        import('../core/CodeGenerator.js').then(({ CodeGenerator }) => {
            CodeGenerator.generate();
        });
    }

    updateFeedback(x, y, operator, distance = 0, index = 0) {
        if (!this.feedback) return;

        super.updateFeedback(x, y);

        const operators = OperatorGesture.operators[this.mode];
        let html = `<div style="font-size: 20px; font-weight: bold;">${operator}</div>`;

        if (this.active && distance > 5) {
            html += `<div class="gesture-hint">${operators.map((op, i) =>
                i === index ? `<strong>${op}</strong>` : op
            ).join(' · ')}</div>`;
        } else {
            html += `<div class="gesture-hint">Drag to change</div>`;
        }

        this.feedback.innerHTML = html;
        this.showFeedback();
    }
}
