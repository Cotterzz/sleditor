// Base gesture system with common functionality
// Compact interface: start/move/end pattern for all gestures

export class BaseGesture {
    constructor() {
        this.active = false;
        this.target = null;
        this.origin = { x: 0, y: 0 };
        this.feedback = null;
    }

    start(element, x, y) {
        if (!this.canStart(element)) return false;

        this.active = true;
        this.target = element;
        this.origin = { x, y };
        this.feedback = this.createFeedback();
        // Don't append to DOM until we have content to show

        document.body.style.userSelect = 'none';
        return true;
    }

    move(x, y) {
        if (!this.active) return;
        this.updateFeedback(x, y);
    }

    end() {
        if (this.active) {
            this.active = false;
            this.target = null;

            if (this.feedback) {
                this.feedback.remove();
                this.feedback = null;
            }

            document.body.style.userSelect = '';
        }
    }

    createFeedback() {
        const el = document.createElement('div');
        el.className = 'gesture-feedback';
        el.style.display = 'none'; // Hide until content is added
        return el;
    }

    updateFeedback(x, y) {
        if (!this.feedback) return;
        this.feedback.style.left = (x + 15) + 'px';
        this.feedback.style.top = (y - 40) + 'px';
    }

    showFeedback() {
        if (this.feedback && !this.feedback.parentNode) {
            document.body.appendChild(this.feedback);
        }
        if (this.feedback) {
            this.feedback.style.display = 'block';
        }
    }

    hideFeedback() {
        if (this.feedback) {
            this.feedback.style.display = 'none';
        }
    }

    canStart(element) {
        return true; // Override in subclasses
    }
}

// Utility function for creating gesture feedback HTML
export function createGestureHTML(content, hint = '') {
    let html = `<div>${content}</div>`;
    if (hint) {
        html += `<div class="gesture-hint">${hint}</div>`;
    }
    return html;
}
