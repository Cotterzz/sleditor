/**
 * SLUI Tooltip Component
 * Ported from monolithic ui.js for API compatibility.
 */

// Global tooltip element (shared)
let tooltipElement = null;
let tooltipTimeout = null;

function ensureTooltipElement() {
    if (tooltipElement) return tooltipElement;
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'sl-tooltip';
    tooltipElement.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipElement);
    return tooltipElement;
}

/**
 * Attach a tooltip to an element
 * @param {HTMLElement} element
 * @param {string|Function} content
 * @param {Object} [options]
 * @param {string} [options.position='top'] - 'top'|'bottom'|'left'|'right'
 * @param {number} [options.delay=400]
 */
export function Tooltip(element, content, options = {}) {
    const { position = 'top', delay = 400 } = options;

    let isShowing = false;
    // NOTE: `content` is intentionally reassignable via .update(), matches ui.js.

    function show() {
        const tooltip = ensureTooltipElement();
        const text = typeof content === 'function' ? content() : content;
        if (!text) return;

        tooltip.textContent = text;
        tooltip.className = `sl-tooltip sl-tooltip-${position} visible`;

        const rect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top, left;

        switch (position) {
            case 'top':
                top = rect.top - tooltipRect.height - 8;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
                top = rect.bottom + 8;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                break;
            case 'left':
                top = rect.top + (rect.height - tooltipRect.height) / 2;
                left = rect.left - tooltipRect.width - 8;
                break;
            case 'right':
                top = rect.top + (rect.height - tooltipRect.height) / 2;
                left = rect.right + 8;
                break;
        }

        const margin = 8;
        left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
        top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        isShowing = true;
    }

    function hide() {
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }
        if (tooltipElement) {
            tooltipElement.classList.remove('visible');
        }
        isShowing = false;
    }

    function onEnter() {
        tooltipTimeout = setTimeout(show, delay);
    }

    function onLeave() {
        hide();
    }

    element.addEventListener('mouseenter', onEnter);
    element.addEventListener('mouseleave', onLeave);
    element.addEventListener('focus', onEnter);
    element.addEventListener('blur', onLeave);

    return {
        update: (newContent) => {
            content = newContent;
            if (isShowing) show();
        },
        destroy: () => {
            hide();
            element.removeEventListener('mouseenter', onEnter);
            element.removeEventListener('mouseleave', onLeave);
            element.removeEventListener('focus', onEnter);
            element.removeEventListener('blur', onLeave);
        }
    };
}

