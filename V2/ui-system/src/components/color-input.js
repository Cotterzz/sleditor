/**
 * SLUI ColorInput + ColorUniform
 * Ported from monolithic ui.js for API compatibility.
 */

import { SlideToggle } from './slide-toggle.js';

// Global color picker popup (shared)
let colorPickerPopup = null;
let activeColorInput = null;

function rgbToHex(r, g, b) {
    const toHex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function rgbToCss(r, g, b) {
    return '#' + Math.round(r * 255).toString(16).padStart(2, '0') +
                 Math.round(g * 255).toString(16).padStart(2, '0') +
                 Math.round(b * 255).toString(16).padStart(2, '0');
}

// Color conversion utilities (same as ui.js)
function rgbToHsv(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return { h, s, v };
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return { r, g, b };
}

function closeColorPickerPopup() {
    if (colorPickerPopup) {
        colorPickerPopup.style.display = 'none';
    }
    activeColorInput = null;
}

function ensureColorPickerPopup() {
    if (colorPickerPopup) return colorPickerPopup;

    colorPickerPopup = document.createElement('div');
    colorPickerPopup.className = 'sl-color-popup';
    colorPickerPopup.innerHTML = `
        <div class="sl-color-popup-header">
            <span class="sl-color-popup-title">Color Picker</span>
            <button class="sl-color-popup-close">✕</button>
        </div>
        <div class="sl-color-popup-body">
            <div class="sl-color-popup-preview-row">
                <div class="sl-color-popup-swatch"></div>
                <input type="text" class="sl-color-popup-hex" placeholder="#ffffff">
            </div>
            <div class="sl-color-popup-sliders"></div>
        </div>
    `;

    document.body.appendChild(colorPickerPopup);

    colorPickerPopup.querySelector('.sl-color-popup-close').addEventListener('click', closeColorPickerPopup);

    // Close on outside click
    document.addEventListener('pointerdown', (e) => {
        if (colorPickerPopup.style.display === 'flex' &&
            !colorPickerPopup.contains(e.target) &&
            activeColorInput && !activeColorInput.contains(e.target)) {
            closeColorPickerPopup();
        }
    });

    return colorPickerPopup;
}

function createColorSlider(label, labelColor, getValue, setValue, getGradient, onUpdate) {
    const row = document.createElement('div');
    row.className = 'sl-color-popup-channel';

    const lbl = document.createElement('span');
    lbl.className = 'sl-color-popup-channel-label';
    lbl.textContent = label;
    lbl.style.color = labelColor;
    row.appendChild(lbl);

    const track = document.createElement('div');
    track.className = 'sl-color-popup-channel-track';

    const trackBg = document.createElement('div');
    trackBg.className = 'sl-color-popup-channel-bg';

    const thumb = document.createElement('div');
    thumb.className = 'sl-color-popup-channel-thumb';
    trackBg.appendChild(thumb);
    track.appendChild(trackBg);
    row.appendChild(track);

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'sl-color-popup-channel-value';
    row.appendChild(valInput);

    function update() {
        const val = getValue();
        thumb.style.left = (val * 100) + '%';
        valInput.value = val.toFixed(2);
        trackBg.style.background = getGradient();
    }

    function handlePointer(e) {
        const rect = trackBg.getBoundingClientRect();
        const val = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setValue(val);
        onUpdate();
    }

    track.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handlePointer(e);
        const move = (ev) => handlePointer(ev);
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    });

    valInput.addEventListener('change', () => {
        const v = parseFloat(valInput.value);
        if (!isNaN(v)) {
            setValue(Math.max(0, Math.min(1, v)));
            onUpdate();
        }
    });

    return { element: row, update };
}

function openColorPickerPopup(colorInput, swatch, rgb) {
    const popup = ensureColorPickerPopup();
    activeColorInput = colorInput;

    let currentRgb = { ...rgb };
    let currentHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

    const previewSwatch = popup.querySelector('.sl-color-popup-swatch');
    const hexInput = popup.querySelector('.sl-color-popup-hex');
    const slidersContainer = popup.querySelector('.sl-color-popup-sliders');
    slidersContainer.innerHTML = '';

    const channels = {};

    function updateAllVisuals() {
        const hex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);
        previewSwatch.style.background = hex;
        hexInput.value = hex;
        swatch.style.background = hex;

        channels.r.update();
        channels.g.update();
        channels.b.update();
        channels.h.update();
        channels.s.update();
        channels.v.update();

        if (colorInput._onChange) {
            colorInput._onChange({ ...currentRgb });
        }
    }

    channels.r = createColorSlider('R', '#e74c3c',
        () => currentRgb.r,
        (v) => { currentRgb.r = v; currentHsv = rgbToHsv(currentRgb.r, currentRgb.g, currentRgb.b); },
        () => `linear-gradient(to right, ${rgbToCss(0, currentRgb.g, currentRgb.b)}, ${rgbToCss(1, currentRgb.g, currentRgb.b)})`,
        updateAllVisuals
    );
    channels.g = createColorSlider('G', '#2ecc71',
        () => currentRgb.g,
        (v) => { currentRgb.g = v; currentHsv = rgbToHsv(currentRgb.r, currentRgb.g, currentRgb.b); },
        () => `linear-gradient(to right, ${rgbToCss(currentRgb.r, 0, currentRgb.b)}, ${rgbToCss(currentRgb.r, 1, currentRgb.b)})`,
        updateAllVisuals
    );
    channels.b = createColorSlider('B', '#3498db',
        () => currentRgb.b,
        (v) => { currentRgb.b = v; currentHsv = rgbToHsv(currentRgb.r, currentRgb.g, currentRgb.b); },
        () => `linear-gradient(to right, ${rgbToCss(currentRgb.r, currentRgb.g, 0)}, ${rgbToCss(currentRgb.r, currentRgb.g, 1)})`,
        updateAllVisuals
    );

    const sep = document.createElement('div');
    sep.style.height = '6px';

    channels.h = createColorSlider('H', '#9b59b6',
        () => currentHsv.h,
        (v) => { currentHsv.h = v; const c = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v); currentRgb = c; },
        () => {
            const stops = [];
            for (let i = 0; i <= 6; i++) {
                const c = hsvToRgb(i / 6, currentHsv.s, currentHsv.v);
                stops.push(rgbToCss(c.r, c.g, c.b));
            }
            return `linear-gradient(to right, ${stops.join(', ')})`;
        },
        updateAllVisuals
    );
    channels.s = createColorSlider('S', '#f39c12',
        () => currentHsv.s,
        (v) => { currentHsv.s = v; const c = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v); currentRgb = c; },
        () => {
            const c0 = hsvToRgb(currentHsv.h, 0, currentHsv.v);
            const c1 = hsvToRgb(currentHsv.h, 1, currentHsv.v);
            return `linear-gradient(to right, ${rgbToCss(c0.r, c0.g, c0.b)}, ${rgbToCss(c1.r, c1.g, c1.b)})`;
        },
        updateAllVisuals
    );
    channels.v = createColorSlider('V', '#95a5a6',
        () => currentHsv.v,
        (v) => { currentHsv.v = v; const c = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v); currentRgb = c; },
        () => {
            const c0 = hsvToRgb(currentHsv.h, currentHsv.s, 0);
            const c1 = hsvToRgb(currentHsv.h, currentHsv.s, 1);
            return `linear-gradient(to right, ${rgbToCss(c0.r, c0.g, c0.b)}, ${rgbToCss(c1.r, c1.g, c1.b)})`;
        },
        updateAllVisuals
    );

    slidersContainer.appendChild(channels.r.element);
    slidersContainer.appendChild(channels.g.element);
    slidersContainer.appendChild(channels.b.element);
    slidersContainer.appendChild(sep);
    slidersContainer.appendChild(channels.h.element);
    slidersContainer.appendChild(channels.s.element);
    slidersContainer.appendChild(channels.v.element);

    hexInput.onchange = () => {
        const hex = hexInput.value.replace('#', '');
        if (hex.length === 6) {
            currentRgb = {
                r: parseInt(hex.substr(0, 2), 16) / 255,
                g: parseInt(hex.substr(2, 2), 16) / 255,
                b: parseInt(hex.substr(4, 2), 16) / 255
            };
            currentHsv = rgbToHsv(currentRgb.r, currentRgb.g, currentRgb.b);
            updateAllVisuals();
        }
    };

    updateAllVisuals();

    const rect = swatch.getBoundingClientRect();
    popup.style.display = 'flex';

    let top = rect.bottom + 8;
    let left = rect.left;

    const popupHeight = 320;
    const popupWidth = 260;

    if (top + popupHeight > window.innerHeight) {
        top = rect.top - popupHeight - 8;
    }
    if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 8;
    }

    popup.style.top = Math.max(8, top) + 'px';
    popup.style.left = Math.max(8, left) + 'px';
}

/**
 * ColorInput - Color swatch with SL/OS toggle
 * @param {Object} options
 */
export function ColorInput(options = {}) {
    const {
        r = 1,
        g = 0.5,
        b = 0.2,
        useNative = false,
        showToggle = true,
        onChange = null,
        className = ''
    } = options;

    let currentRgb = { r, g, b };
    let isNativeMode = useNative;

    const container = document.createElement('div');
    container.className = `sl-color-input ${className}`.trim();

    const swatch = document.createElement('div');
    swatch.className = 'sl-color-input-swatch';
    swatch.style.background = rgbToHex(r, g, b);

    const nativeInput = document.createElement('input');
    nativeInput.type = 'color';
    nativeInput.className = 'sl-color-input-native';
    nativeInput.value = rgbToHex(r, g, b);

    const hexDisplay = document.createElement('span');
    hexDisplay.className = 'sl-color-input-hex';
    hexDisplay.textContent = rgbToHex(r, g, b);

    container.appendChild(swatch);
    container.appendChild(nativeInput);
    container.appendChild(hexDisplay);

    if (showToggle) {
        const toggle = SlideToggle({
            labelLeft: 'SL',
            labelRight: 'OS',
            value: isNativeMode,
            size: 'small',
            onChange: (useOS) => {
                isNativeMode = useOS;
                container.classList.toggle('native-mode', isNativeMode);
            }
        });
        toggle.className += ' sl-color-input-toggle';
        container.appendChild(toggle);
        container._toggle = toggle;
    }

    container.classList.toggle('native-mode', isNativeMode);

    container._onChange = (rgb) => {
        currentRgb = rgb;
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        swatch.style.background = hex;
        nativeInput.value = hex;
        hexDisplay.textContent = hex;
        if (onChange) onChange(rgb);
    };

    swatch.addEventListener('click', () => {
        if (isNativeMode) {
            nativeInput.click();
        } else {
            openColorPickerPopup(container, swatch, currentRgb);
        }
    });

    nativeInput.addEventListener('input', () => {
        const hex = nativeInput.value;
        currentRgb = {
            r: parseInt(hex.substr(1, 2), 16) / 255,
            g: parseInt(hex.substr(3, 2), 16) / 255,
            b: parseInt(hex.substr(5, 2), 16) / 255
        };
        swatch.style.background = hex;
        hexDisplay.textContent = hex;
        if (onChange) onChange(currentRgb);
    });

    container.getColor = () => ({ ...currentRgb });
    container.setColor = (rgb) => {
        currentRgb = { ...rgb };
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        swatch.style.background = hex;
        nativeInput.value = hex;
        hexDisplay.textContent = hex;
    };
    container.isNativeMode = () => isNativeMode;
    container.setNativeMode = (native) => {
        isNativeMode = native;
        container.classList.toggle('native-mode', isNativeMode);
        if (container._toggle) {
            container._toggle.setValue(native);
        }
    };

    return container;
}

/**
 * ColorUniform - Single-line color uniform row
 * Layout: [swatch] name    A ---o--- 0.50   #808080
 * @param {Object} options
 */
export function ColorUniform(options = {}) {
    const {
        name = 'u_color',
        r = 1.0,
        g = 0.5,
        b = 0.2,
        a = 1.0,
        hasAlpha = false,
        editable = false,
        useNative = false,
        showHex = true,      // Whether to show hex value
        compact = false,     // Compact mode (smaller)
        onChange = null,
        onNameChange = null
    } = options;

    let currentName = name;
    let rgba = { r, g, b, a };
    let isNativeMode = useNative;

    const container = document.createElement('div');
    container.className = 'sl-color-uniform';
    if (hasAlpha) container.classList.add('has-alpha');

    // All on one line
    // [swatch] name    A ---o--- 0.50   #hex

    const swatch = document.createElement('div');
    swatch.className = 'sl-color-uniform-swatch';
    swatch.style.background = rgbToHex(r, g, b);

    const nativeInput = document.createElement('input');
    nativeInput.type = 'color';
    nativeInput.className = 'sl-color-uniform-native';
    nativeInput.value = rgbToHex(r, g, b);

    // Label
    let labelEl;
    if (editable) {
        labelEl = document.createElement('input');
        labelEl.type = 'text';
        labelEl.className = 'sl-color-uniform-label';
        labelEl.value = currentName;
        labelEl.addEventListener('blur', () => {
            currentName = labelEl.value || 'u_color';
            if (onNameChange) onNameChange(currentName);
        });
        labelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    } else {
        labelEl = document.createElement('span');
        labelEl.className = 'sl-color-uniform-label sl-color-uniform-label-readonly';
        labelEl.textContent = currentName;
    }

    container.appendChild(swatch);
    container.appendChild(nativeInput);
    container.appendChild(labelEl);

    // Alpha section (inline if hasAlpha)
    let alphaTrackBg = null;
    let alphaThumb = null;
    let alphaValueEl = null;

    if (hasAlpha) {
        const alphaLabel = document.createElement('span');
        alphaLabel.className = 'sl-color-uniform-alpha-label';
        alphaLabel.textContent = 'A';
        container.appendChild(alphaLabel);

        const alphaTrack = document.createElement('div');
        alphaTrack.className = 'sl-color-uniform-alpha-track';

        alphaTrackBg = document.createElement('div');
        alphaTrackBg.className = 'sl-color-uniform-alpha-bg';

        alphaThumb = document.createElement('div');
        alphaThumb.className = 'sl-color-uniform-alpha-thumb';
        alphaThumb.style.left = (a * 100) + '%';

        alphaTrackBg.appendChild(alphaThumb);
        alphaTrack.appendChild(alphaTrackBg);
        container.appendChild(alphaTrack);

        alphaValueEl = document.createElement('span');
        alphaValueEl.className = 'sl-color-uniform-alpha-value';
        alphaValueEl.textContent = a.toFixed(2);
        container.appendChild(alphaValueEl);

        // Alpha interaction
        function handleAlphaPointer(e) {
            const rect = alphaTrackBg.getBoundingClientRect();
            rgba.a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            alphaThumb.style.left = (rgba.a * 100) + '%';
            alphaValueEl.textContent = rgba.a.toFixed(2);
            updateAlphaGradient();
            if (onChange) onChange({ r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, currentName);
        }

        alphaTrack.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleAlphaPointer(e);
            const move = (ev) => handleAlphaPointer(ev);
            const up = () => {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', up);
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
        });
    }

    // Hex display (optional, always last if shown)
    let hexDisplay = null;
    if (showHex) {
        hexDisplay = document.createElement('span');
        hexDisplay.className = 'sl-color-uniform-hex';
        hexDisplay.textContent = rgbToHex(r, g, b);
        container.appendChild(hexDisplay);
    }
    
    // Add compact class if needed
    if (compact) {
        container.classList.add('sl-color-uniform-compact');
    }

    function updateAlphaGradient() {
        if (alphaTrackBg) {
            alphaTrackBg.style.background = `
                linear-gradient(to right, transparent, ${rgbToHex(rgba.r, rgba.g, rgba.b)}),
                repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 50% / 8px 8px
            `;
        }
    }

    function updateVisuals() {
        const hex = rgbToHex(rgba.r, rgba.g, rgba.b);
        swatch.style.background = hex;
        nativeInput.value = hex;
        if (hexDisplay) hexDisplay.textContent = hex;
        updateAlphaGradient();
        if (alphaThumb && alphaValueEl) {
            alphaThumb.style.left = (rgba.a * 100) + '%';
            alphaValueEl.textContent = rgba.a.toFixed(2);
        }
    }

    // Initialize alpha gradient
    updateAlphaGradient();

    container._onChange = (newRgb) => {
        rgba.r = newRgb.r;
        rgba.g = newRgb.g;
        rgba.b = newRgb.b;
        updateVisuals();
        if (onChange) onChange({ r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, currentName);
    };

    swatch.addEventListener('click', () => {
        if (!isNativeMode) {
            openColorPickerPopup(container, swatch, { r: rgba.r, g: rgba.g, b: rgba.b });
        }
    });

    nativeInput.addEventListener('input', () => {
        const hex = nativeInput.value;
        rgba.r = parseInt(hex.substr(1, 2), 16) / 255;
        rgba.g = parseInt(hex.substr(3, 2), 16) / 255;
        rgba.b = parseInt(hex.substr(5, 2), 16) / 255;
        updateVisuals();
        if (onChange) onChange({ r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, currentName);
    });

    container.setNativeMode = (native) => {
        isNativeMode = native;
        container.classList.toggle('native-mode', isNativeMode);
    };
    container.classList.toggle('native-mode', isNativeMode);

    container.getColor = () => ({ r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
    container.setColor = (c) => { 
        rgba.r = c.r; 
        rgba.g = c.g; 
        rgba.b = c.b; 
        if (c.a !== undefined) rgba.a = c.a;
        updateVisuals(); 
    };
    container.getName = () => currentName;
    container.setName = (n) => { currentName = n; if (editable) labelEl.value = n; else labelEl.textContent = n; };
    container.getData = () => hasAlpha 
        ? { name: currentName, r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }
        : { name: currentName, r: rgba.r, g: rgba.g, b: rgba.b };

    return container;
}

