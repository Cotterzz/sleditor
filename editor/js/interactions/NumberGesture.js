// Number manipulation gesture
// Compact interface: extends BaseGesture for number editing

import { BaseGesture, createGestureHTML } from './GestureSystem.js';
import { LanguageConfig } from '../services/LanguageConfig.js';

export class NumberGesture extends BaseGesture {
    constructor() {
        super();
        this.startValue = 0;
    }

    canStart(element) {
        return element.dataset.nodeType === 'number';
    }

    start(element, x, y) {
        if (!super.start(element, x, y)) return;

        this.startValue = parseFloat(element.dataset.value);
        this.updateFeedback(x, y, this.startValue);
        this.showFeedback();
    }

    move(x, y) {
        if (!this.active) return;

        const dx = x - this.origin.x;
        const dy = this.origin.y - y; // Inverted for intuitive up = positive

        let newValue;
        let displayInfo = {};

        const deadZone = 15;

        // Check if we're in the dead zone horizontally (near zero) - use single-unit mode
        if (dx > 10 && Math.abs(dy) <= deadZone) {
            const dxAdjusted = dx - 10;
            const units = Math.round(dxAdjusted + Math.pow(10, dxAdjusted / 10));
            newValue = this.startValue + units;
            displayInfo.mode = 'units';
            displayInfo.units = units;
        } else {
            // Calculate exponent from horizontal movement
            let exponent = Math.floor(dx / 20);
            exponent = Math.max(-5, Math.min(5, exponent));

            // Calculate coefficient from vertical movement
            let coefficient = 0;

            if (Math.abs(dy) > deadZone) {
                coefficient = dy > 0
                    ? Math.floor((dy - deadZone) / 5)
                    : Math.ceil((dy + deadZone) / 5);
                coefficient = Math.max(-99, Math.min(99, coefficient));
            }

            // Calculate delta and new value
            const delta = coefficient * Math.pow(10, exponent);
            newValue = this.startValue + delta;

            displayInfo.mode = 'exponential';
            displayInfo.exponent = exponent;
            displayInfo.coefficient = coefficient;
        }

        // Format value based on type
        const glslType = this.target.dataset.glslType || 'float';
        const formattedValue = this.formatNumber(newValue, glslType);

        // Update display
        this.target.dataset.value = newValue;
        this.target.textContent = formattedValue;

        this.updateFeedback(x, y, newValue, displayInfo);

        // Import CodeGenerator dynamically to avoid circular dependency
        import('../core/CodeGenerator.js').then(({ CodeGenerator }) => {
            CodeGenerator.generate();
        });
    }

    formatNumber(value, type) {
        return LanguageConfig.formatNumber(value, type);
    }

    updateFeedback(x, y, value, displayInfo = {}) {
        if (!this.feedback) return;

        super.updateFeedback(x, y);

        const type = this.target?.dataset?.glslType || 'float';
        const formattedValue = this.formatNumber(value, type);

        let html = `<div>${formattedValue}</div>`;

        if (this.active) {
            if (displayInfo.mode === 'units' && displayInfo.units !== 0) {
                html += `<div class="gesture-hint">+${displayInfo.units} units (${type})</div>`;
            } else if (displayInfo.mode === 'exponential' && (displayInfo.exponent !== 0 || displayInfo.coefficient !== 0)) {
                html += `<div class="gesture-hint">×10^${displayInfo.exponent} · ${displayInfo.coefficient > 0 ? '+' : ''}${displayInfo.coefficient} (${type})</div>`;
            } else {
                html += `<div class="gesture-hint">${type}</div>`;
            }
        }

        this.feedback.innerHTML = html;
        this.showFeedback();
    }
}
