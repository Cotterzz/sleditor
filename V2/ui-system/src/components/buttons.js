/**
 * SLUI Button Components
 * Ported from monolithic ui.js for API compatibility.
 * 
 * Components:
 * - Button: Full-featured button with icon, label, i18n support
 * - ToggleButton: Two-state button (play/pause, etc.)
 * - IconButton: Minimal icon-only button for toolbars/control bars
 * - CtrlButton: Compact control bar button (shader controls, playback bars)
 */

import { t } from '../core/i18n.js';

/**
 * Button - versatile button with icon, label, or both
 * @param {Object} options
 */
export function Button(options = {}) {
    const {
        label = null,
        labelKey = null,        // i18n: translation key for label
        icon = null,
        variant = 'default',
        size = 'medium',
        disabled = false,
        tooltip = null,
        tooltipKey = null,      // i18n: translation key for tooltip
        onClick = null,
        className = ''
    } = options;

    const btn = document.createElement('button');
    btn.className = `sl-btn sl-btn-${variant} sl-btn-${size} ${className}`.trim();
    btn.disabled = disabled;

    // Store i18n keys for updates
    let currentLabelKey = labelKey;
    let currentTooltipKey = tooltipKey;

    const resolvedLabel = labelKey ? t(labelKey) : label;
    const resolvedTooltip = tooltipKey ? t(tooltipKey) : tooltip;

    if (resolvedTooltip) {
        btn.title = resolvedTooltip;
    }

    // Icon only, label only, or both
    if (icon && !resolvedLabel) {
        btn.classList.add('sl-btn-icon-only');
    }

    if (icon) {
        const iconEl = document.createElement('span');
        iconEl.className = 'sl-btn-icon';
        if (icon.startsWith('<')) {
            iconEl.innerHTML = icon;
        } else {
            iconEl.textContent = icon;
        }
        btn.appendChild(iconEl);
    }

    if (resolvedLabel) {
        const labelEl = document.createElement('span');
        labelEl.className = 'sl-btn-label';
        labelEl.textContent = resolvedLabel;
        btn.appendChild(labelEl);
    }

    if (onClick) {
        btn.addEventListener('click', (e) => {
            if (!btn.disabled) {
                onClick(e);
            }
        });
    }

    // i18n: Listen for language changes (src emits sl-lang-change too)
    function onLangChange() {
        if (currentLabelKey) {
            btn.setLabel(t(currentLabelKey));
        }
        if (currentTooltipKey) {
            btn.title = t(currentTooltipKey);
        }
    }

    if (labelKey || tooltipKey) {
        document.addEventListener('sl-lang-change', onLangChange);
    }

    // Public API (matches ui.js)
    btn.setLabel = (newLabel) => {
        let labelEl = btn.querySelector('.sl-btn-label');
        if (newLabel) {
            if (!labelEl) {
                labelEl = document.createElement('span');
                labelEl.className = 'sl-btn-label';
                btn.appendChild(labelEl);
            }
            labelEl.textContent = newLabel;
            btn.classList.remove('sl-btn-icon-only');
        } else if (labelEl) {
            labelEl.remove();
            if (btn.querySelector('.sl-btn-icon')) {
                btn.classList.add('sl-btn-icon-only');
            }
        }
    };

    btn.setLabelKey = (newKey) => {
        currentLabelKey = newKey;
        if (newKey) {
            btn.setLabel(t(newKey));
        }
    };

    btn.setIcon = (newIcon) => {
        let iconEl = btn.querySelector('.sl-btn-icon');
        if (newIcon) {
            if (!iconEl) {
                iconEl = document.createElement('span');
                iconEl.className = 'sl-btn-icon';
                btn.insertBefore(iconEl, btn.firstChild);
            }
            if (newIcon.startsWith('<')) {
                iconEl.innerHTML = newIcon;
            } else {
                iconEl.textContent = newIcon;
            }
        } else if (iconEl) {
            iconEl.remove();
            btn.classList.remove('sl-btn-icon-only');
        }
    };

    btn.setDisabled = (isDisabled) => {
        btn.disabled = isDisabled;
    };

    btn.setVariant = (newVariant) => {
        btn.classList.remove('sl-btn-default', 'sl-btn-primary', 'sl-btn-danger', 'sl-btn-ghost');
        btn.classList.add(`sl-btn-${newVariant}`);
    };

    btn.setTooltipKey = (newKey) => {
        currentTooltipKey = newKey;
        if (newKey) {
            btn.title = t(newKey);
        }
    };

    btn.destroy = () => {
        document.removeEventListener('sl-lang-change', onLangChange);
    };

    return btn;
}

/**
 * ToggleButton - two-state button (e.g., play/pause)
 * @param {Object} options
 */
export function ToggleButton(options = {}) {
    const {
        pressed = false,
        iconOff = null,
        iconOn = null,
        labelOff = null,
        labelOn = null,
        labelOffKey = null,
        labelOnKey = null,
        tooltipOff = null,
        tooltipOn = null,
        tooltipOffKey = null,
        tooltipOnKey = null,
        variant = 'default',
        size = 'medium',
        fixedWidth = true,
        onToggle = null,
        className = ''
    } = options;

    let isPressed = pressed;

    const getResolvedLabelOff = () => labelOffKey ? t(labelOffKey) : labelOff;
    const getResolvedLabelOn = () => labelOnKey ? t(labelOnKey) : labelOn;
    const getResolvedTooltipOff = () => tooltipOffKey ? t(tooltipOffKey) : tooltipOff;
    const getResolvedTooltipOn = () => tooltipOnKey ? t(tooltipOnKey) : tooltipOn;

    const btn = Button({
        icon: isPressed ? iconOn : iconOff,
        label: isPressed ? getResolvedLabelOn() : getResolvedLabelOff(),
        tooltip: isPressed ? getResolvedTooltipOn() : getResolvedTooltipOff(),
        variant,
        size,
        className: `sl-toggle-btn ${isPressed ? 'pressed' : ''} ${className}`.trim(),
        onClick: () => {
            isPressed = !isPressed;
            updateState();
            if (onToggle) onToggle(isPressed);
        }
    });

    const hasLabels = () => {
        const offLabel = getResolvedLabelOff();
        const onLabel = getResolvedLabelOn();
        return offLabel && onLabel && offLabel !== onLabel;
    };

    function scheduleWidthMeasure() {
        if (!fixedWidth || !hasLabels()) return;

        requestAnimationFrame(() => {
            if (!btn.isConnected) {
                const observer = new MutationObserver(() => {
                    if (btn.isConnected) {
                        observer.disconnect();
                        measureAndSetWidth();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                measureAndSetWidth();
            }
        });
    }

    scheduleWidthMeasure();

    function measureAndSetWidth() {
        const offLabel = getResolvedLabelOff();
        const onLabel = getResolvedLabelOn();
        if (!offLabel || !onLabel) return;

        const currentLabel = isPressed ? onLabel : offLabel;
        const otherLabel = isPressed ? offLabel : onLabel;

        const currentWidth = btn.offsetWidth;
        btn.setLabel(otherLabel);
        const otherWidth = btn.offsetWidth;
        btn.setLabel(currentLabel);

        const maxWidth = Math.max(currentWidth, otherWidth);
        btn.style.minWidth = maxWidth + 'px';
    }

    function updateState() {
        btn.classList.toggle('pressed', isPressed);

        if (iconOn || iconOff) {
            btn.setIcon(isPressed ? iconOn : iconOff);
        }

        const labelToUse = isPressed ? getResolvedLabelOn() : getResolvedLabelOff();
        if (labelToUse !== null) btn.setLabel(labelToUse);

        const tooltipToUse = isPressed ? getResolvedTooltipOn() : getResolvedTooltipOff();
        if (tooltipToUse !== null) btn.title = tooltipToUse || '';
    }

    function onLangChange() {
        updateState();
        btn.style.minWidth = '';
        scheduleWidthMeasure();
    }

    if (labelOffKey || labelOnKey || tooltipOffKey || tooltipOnKey) {
        document.addEventListener('sl-lang-change', onLangChange);
    }

    // Public API
    btn.isPressed = () => isPressed;
    btn.setPressed = (newState, triggerCallback = false) => {
        if (isPressed !== newState) {
            isPressed = newState;
            updateState();
            if (triggerCallback && onToggle) onToggle(isPressed);
        }
    };
    btn.toggle = (triggerCallback = true) => {
        isPressed = !isPressed;
        updateState();
        if (triggerCallback && onToggle) onToggle(isPressed);
    };

    const originalDestroy = btn.destroy;
    btn.destroy = () => {
        document.removeEventListener('sl-lang-change', onLangChange);
        if (originalDestroy) originalDestroy();
    };

    return btn;
}

/**
 * IconButton - Minimal icon-only button for toolbars and control bars
 * 
 * Use this instead of raw document.createElement('button') when you need
 * a simple, themeable button. This provides:
 * - Consistent CSS class for theming (.sl-icon-btn)
 * - No inline styles (themeable via CSS)
 * - Simple API for common toolbar use cases
 * 
 * @param {Object} options
 * @param {string|HTMLElement} options.icon - Text emoji, Unicode symbol, or DOM element (e.g., SVG)
 * @param {string} options.tooltip - Tooltip text
 * @param {Function} options.onClick - Click handler
 * @param {string} options.variant - Style variant: 'default', 'ghost', 'toolbar' (default: 'toolbar')
 * @param {string} options.className - Additional CSS classes
 * @returns {HTMLButtonElement} Button element with setIcon(), setTooltip(), setDisabled() methods
 * 
 * @example
 * // Text icon
 * const playBtn = IconButton({ icon: '▶', tooltip: 'Play', onClick: () => play() });
 * 
 * // SVG icon
 * const svgBtn = IconButton({ icon: mySvgElement, tooltip: 'Action', onClick: handler });
 * 
 * // Update later
 * playBtn.setIcon('⏸');
 * playBtn.setTooltip('Pause');
 */
export function IconButton(options = {}) {
    const {
        icon = null,
        tooltip = null,
        tooltipKey = null,
        onClick = null,
        variant = 'toolbar',
        className = '',
        disabled = false
    } = options;

    const btn = document.createElement('button');
    btn.className = `sl-icon-btn sl-icon-btn-${variant} ${className}`.trim();
    btn.disabled = disabled;

    const resolvedTooltip = tooltipKey ? t(tooltipKey) : tooltip;
    if (resolvedTooltip) {
        btn.title = resolvedTooltip;
    }

    // Set icon (text or element)
    function applyIcon(iconValue) {
        btn.innerHTML = '';
        if (!iconValue) return;
        
        if (iconValue instanceof HTMLElement || iconValue instanceof SVGElement) {
            btn.appendChild(iconValue);
        } else if (typeof iconValue === 'string') {
            if (iconValue.startsWith('<')) {
                btn.innerHTML = iconValue;
            } else {
                btn.textContent = iconValue;
            }
        }
    }

    applyIcon(icon);

    if (onClick) {
        btn.addEventListener('click', (e) => {
            if (!btn.disabled) onClick(e);
        });
    }

    // i18n support
    let currentTooltipKey = tooltipKey;
    function onLangChange() {
        if (currentTooltipKey) {
            btn.title = t(currentTooltipKey);
        }
    }
    if (tooltipKey) {
        document.addEventListener('sl-lang-change', onLangChange);
    }

    // Public API
    btn.setIcon = (newIcon) => applyIcon(newIcon);
    btn.setTooltip = (newTooltip) => { btn.title = newTooltip || ''; };
    btn.setTooltipKey = (newKey) => {
        currentTooltipKey = newKey;
        if (newKey) btn.title = t(newKey);
    };
    btn.setDisabled = (isDisabled) => { btn.disabled = isDisabled; };
    btn.destroy = () => {
        document.removeEventListener('sl-lang-change', onLangChange);
    };

    return btn;
}

/**
 * CtrlButton - Compact control bar button for shader controls, playback bars, etc.
 * 
 * Matches the existing .v2-shader-ctrl-btn style but as a proper SLUI component.
 * Use this for compact control bars where space is limited.
 * 
 * @param {Object} options
 * @param {string|HTMLElement} options.icon - Text emoji, Unicode symbol, or DOM element (e.g., SVG)
 * @param {string} options.tooltip - Tooltip text
 * @param {Function} options.onClick - Click handler
 * @param {boolean} options.active - Whether button is in active/pressed state
 * @param {string} options.className - Additional CSS classes
 * @returns {HTMLButtonElement} Button element with setIcon(), setTooltip(), setActive(), setDisabled() methods
 * 
 * @example
 * const playBtn = CtrlButton({ icon: '▶', tooltip: 'Play', onClick: () => play() });
 * playBtn.setIcon('⏸');
 * playBtn.setActive(true);
 */
export function CtrlButton(options = {}) {
    const {
        icon = null,
        tooltip = null,
        tooltipKey = null,
        onClick = null,
        active = false,
        className = '',
        disabled = false
    } = options;

    const btn = document.createElement('button');
    btn.className = `sl-ctrl-btn ${active ? 'active' : ''} ${className}`.trim();
    btn.disabled = disabled;

    const resolvedTooltip = tooltipKey ? t(tooltipKey) : tooltip;
    if (resolvedTooltip) {
        btn.title = resolvedTooltip;
    }

    // Set icon (text or element)
    function applyIcon(iconValue) {
        btn.innerHTML = '';
        if (!iconValue) return;
        
        if (iconValue instanceof HTMLElement || iconValue instanceof SVGElement) {
            btn.appendChild(iconValue.cloneNode(true));
        } else if (typeof iconValue === 'string') {
            if (iconValue.startsWith('<')) {
                btn.innerHTML = iconValue;
            } else {
                btn.textContent = iconValue;
            }
        }
    }

    applyIcon(icon);

    if (onClick) {
        btn.addEventListener('click', (e) => {
            if (!btn.disabled) onClick(e);
        });
    }

    // i18n support
    let currentTooltipKey = tooltipKey;
    function onLangChange() {
        if (currentTooltipKey) {
            btn.title = t(currentTooltipKey);
        }
    }
    if (tooltipKey) {
        document.addEventListener('sl-lang-change', onLangChange);
    }

    // Public API
    btn.setIcon = (newIcon) => applyIcon(newIcon);
    btn.setTooltip = (newTooltip) => { btn.title = newTooltip || ''; };
    btn.setTooltipKey = (newKey) => {
        currentTooltipKey = newKey;
        if (newKey) btn.title = t(newKey);
    };
    btn.setActive = (isActive) => { btn.classList.toggle('active', isActive); };
    btn.isActive = () => btn.classList.contains('active');
    btn.setDisabled = (isDisabled) => { btn.disabled = isDisabled; };
    btn.destroy = () => {
        document.removeEventListener('sl-lang-change', onLangChange);
    };

    return btn;
}
