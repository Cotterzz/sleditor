/**
 * SLUI Slider Components
 * 
 * Hierarchy:
 * - SliderTrack: Just the bar (skinnable base element)
 * - Slider: Track + value display
 * - UniformSlider: Expandable slider for uniform controls
 * - SliderStack: Container managing multiple expandable sliders
 */

// ========================================
// SLIDER TRACK - Base skinnable element
// ========================================

export function SliderTrack(options = {}) {
    const {
        min = 0,
        max = 1,
        value = 0.5,
        step = 0.01,
        disabled = false,
        onInput = null,
        onChange = null,
        className = ''
    } = options;
    
    const container = document.createElement('div');
    container.className = `sl-slider-track ${className}`.trim();
    container.style.cursor = disabled ? 'default' : 'pointer';
    if (disabled) container.classList.add('disabled');
    
    const bg = document.createElement('div');
    bg.className = 'sl-slider-track-bg';
    
    const fill = document.createElement('div');
    fill.className = 'sl-slider-track-fill';
    
    const thumb = document.createElement('div');
    thumb.className = 'sl-slider-thumb';
    thumb.style.cursor = disabled ? 'default' : 'pointer';
    
    bg.appendChild(fill);
    bg.appendChild(thumb);
    container.appendChild(bg);
    
    let currentValue = value;
    let currentMin = min;
    let currentMax = max;
    let currentStep = step;
    
    function clamp(v) {
        return Math.max(currentMin, Math.min(currentMax, v));
    }
    
    function snap(v) {
        return Math.round(v / currentStep) * currentStep;
    }
    
    function updateVisuals() {
        const percent = ((currentValue - currentMin) / (currentMax - currentMin)) * 100;
        fill.style.width = `${percent}%`;
        thumb.style.left = `${percent}%`;
    }
    
    function setValue(v, triggerEvents = false) {
        const newValue = clamp(snap(v));
        if (newValue !== currentValue) {
            currentValue = newValue;
            updateVisuals();
            if (triggerEvents && onInput) onInput(currentValue);
        }
    }
    
    function handlePointerDown(e) {
        if (disabled) return;
        e.preventDefault();
        container.classList.add('dragging');
        handlePointerMove(e);
        
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
    }
    
    function handlePointerMove(e) {
        const rect = bg.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newValue = currentMin + percent * (currentMax - currentMin);
        setValue(newValue, true);
    }
    
    function handlePointerUp() {
        container.classList.remove('dragging');
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        if (onChange) onChange(currentValue);
    }
    
    container.addEventListener('pointerdown', handlePointerDown);
    
    updateVisuals();
    
    container.getValue = () => currentValue;
    container.setValue = (v) => { currentValue = clamp(snap(v)); updateVisuals(); };
    container.setRange = (newMin, newMax) => { currentMin = newMin; currentMax = newMax; currentValue = clamp(currentValue); updateVisuals(); };
    container.setStep = (s) => { currentStep = s; };
    container.setDisabled = (d) => { container.classList.toggle('disabled', d); container.style.cursor = d ? 'default' : 'pointer'; thumb.style.cursor = d ? 'default' : 'pointer'; };
    
    return container;
}

// ========================================
// UNIFORM SLIDER - Expandable uniform control
// ========================================

export function UniformSlider(options = {}) {
    const {
        name = 'u_custom0',
        min = 0,
        max = 1,
        value = 0.5,
        step = 0.01,
        isInt = false,
        locked = false,
        expanded = false,
        onChange = null,
        onNameChange = null,
        onRangeChange = null,
        onExpand = null,
        onCollapse = null,
        onRemove = null
    } = options;
    
    const decimals = 4;
    const stepDecimals = isInt ? 0 : 4;
    let currentName = name;
    let currentMin = min;
    let currentMax = max;
    let currentValue = Math.max(min, Math.min(max, value));
    let currentStep = isInt ? 1 : step;
    let isLocked = locked;
    let isExpanded = expanded;
    
    const container = document.createElement('div');
    container.className = 'sl-uniform-slider';
    if (isExpanded) container.classList.add('expanded');
    
    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sl-uniform-toggle';
    toggleBtn.textContent = '▼';
    toggleBtn.title = 'Expand';
    toggleBtn.style.cursor = 'pointer';
    
    // Top row: Start | Value | End | Toggle(▲)
    const topRow = document.createElement('div');
    topRow.className = 'sl-uniform-row sl-uniform-row-top';
    
    const startInput = createEditableNumber(currentMin, (v) => {
        currentMin = v;
        if (currentMin > currentMax) { currentMax = currentMin; endInput.setValue(currentMax); }
        if (currentValue < currentMin) { currentValue = currentMin; valueInput.setValue(currentValue); updateTrackVisuals(); }
        if (onRangeChange) onRangeChange(currentMin, currentMax);
    }, isInt, decimals);
    startInput.classList.add('sl-uniform-start');
    
    const valueInput = createEditableNumber(currentValue, (v) => {
        currentValue = Math.max(currentMin, Math.min(currentMax, v));
        valueInput.setValue(currentValue);
        updateTrackVisuals();
        if (onChange) onChange(currentValue, currentName);
    }, isInt, decimals);
    valueInput.classList.add('sl-uniform-value');
    
    const endInput = createEditableNumber(currentMax, (v) => {
        currentMax = v;
        if (currentMax < currentMin) { currentMin = currentMax; startInput.setValue(currentMin); }
        if (currentValue > currentMax) { currentValue = currentMax; valueInput.setValue(currentValue); updateTrackVisuals(); }
        if (onRangeChange) onRangeChange(currentMin, currentMax);
    }, isInt, decimals);
    endInput.classList.add('sl-uniform-end');
    
    const topToggleBtn = document.createElement('button');
    topToggleBtn.className = 'sl-uniform-toggle';
    topToggleBtn.textContent = '▲';
    topToggleBtn.title = 'Collapse';
    topToggleBtn.style.cursor = 'pointer';
    
    topRow.appendChild(startInput);
    topRow.appendChild(valueInput);
    topRow.appendChild(endInput);
    topRow.appendChild(topToggleBtn);
    
    // Middle row: Label | Slider Track | Toggle(▼)
    const middleRow = document.createElement('div');
    middleRow.className = 'sl-uniform-row sl-uniform-row-middle';
    
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'sl-uniform-label';
    labelInput.value = currentName;
    labelInput.addEventListener('blur', () => { currentName = labelInput.value || 'u_custom'; if (onNameChange) onNameChange(currentName); });
    labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    
    const track = document.createElement('div');
    track.className = 'sl-slider-track';
    track.style.cursor = 'pointer';
    
    const trackBg = document.createElement('div');
    trackBg.className = 'sl-slider-track-bg';
    
    const fill = document.createElement('div');
    fill.className = 'sl-slider-track-fill';
    
    const thumb = document.createElement('div');
    thumb.className = 'sl-slider-thumb';
    thumb.style.cursor = 'pointer';
    
    trackBg.appendChild(fill);
    trackBg.appendChild(thumb);
    track.appendChild(trackBg);
    
    function updateTrackVisuals() {
        const percent = ((currentValue - currentMin) / (currentMax - currentMin)) * 100;
        fill.style.width = `${percent}%`;
        thumb.style.left = `${percent}%`;
    }
    
    function handleTrackPointer(e) {
        if (isLocked) return;
        const rect = trackBg.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        let newValue = currentMin + percent * (currentMax - currentMin);
        newValue = Math.round(newValue / currentStep) * currentStep;
        currentValue = Math.max(currentMin, Math.min(currentMax, newValue));
        updateTrackVisuals();
        valueInput.setValue(currentValue);
        if (onChange) onChange(currentValue, currentName);
    }
    
    track.addEventListener('pointerdown', (e) => {
        if (isLocked) return;
        e.preventDefault();
        track.classList.add('dragging');
        handleTrackPointer(e);
        const moveHandler = (e) => handleTrackPointer(e);
        const upHandler = () => { track.classList.remove('dragging'); document.removeEventListener('pointermove', moveHandler); document.removeEventListener('pointerup', upHandler); };
        document.addEventListener('pointermove', moveHandler);
        document.addEventListener('pointerup', upHandler);
    });
    
    middleRow.appendChild(labelInput);
    middleRow.appendChild(track);
    middleRow.appendChild(toggleBtn);
    
    // Bottom row: Lock | Step | Incrementer | Close
    const bottomRow = document.createElement('div');
    bottomRow.className = 'sl-uniform-row sl-uniform-row-bottom';
    
    const lockBtn = document.createElement('button');
    lockBtn.className = 'sl-uniform-lock';
    lockBtn.textContent = isLocked ? '🔒' : '🔓';
    lockBtn.title = 'Lock value';
    lockBtn.style.cursor = 'pointer';
    lockBtn.addEventListener('click', (e) => { e.stopPropagation(); isLocked = !isLocked; lockBtn.textContent = isLocked ? '🔒' : '🔓'; container.classList.toggle('locked', isLocked); });
    
    const stepInput = createEditableNumber(currentStep, (v) => {
        currentStep = Math.max(isInt ? 1 : 0.0001, v);
        if (isInt) currentStep = Math.round(currentStep);
        stepInput.setValue(currentStep);
    }, isInt, stepDecimals);
    stepInput.classList.add('sl-uniform-step');
    
    const incrementer = document.createElement('div');
    incrementer.className = 'sl-uniform-incrementer';
    
    const decBtn = document.createElement('button');
    decBtn.className = 'sl-uniform-inc-btn';
    decBtn.textContent = '<';
    decBtn.style.cursor = 'pointer';
    decBtn.addEventListener('click', (e) => { e.stopPropagation(); if (isLocked) return; currentValue = Math.max(currentMin, currentValue - currentStep); updateTrackVisuals(); valueInput.setValue(currentValue); if (onChange) onChange(currentValue, currentName); });
    
    const incBtn = document.createElement('button');
    incBtn.className = 'sl-uniform-inc-btn';
    incBtn.textContent = '>';
    incBtn.style.cursor = 'pointer';
    incBtn.addEventListener('click', (e) => { e.stopPropagation(); if (isLocked) return; currentValue = Math.min(currentMax, currentValue + currentStep); updateTrackVisuals(); valueInput.setValue(currentValue); if (onChange) onChange(currentValue, currentName); });
    
    incrementer.appendChild(decBtn);
    incrementer.appendChild(incBtn);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sl-uniform-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Remove';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); if (onRemove) onRemove(container); });
    
    bottomRow.appendChild(lockBtn);
    bottomRow.appendChild(stepInput);
    bottomRow.appendChild(incrementer);
    bottomRow.appendChild(closeBtn);
    
    container.appendChild(topRow);
    container.appendChild(middleRow);
    container.appendChild(bottomRow);
    
    updateTrackVisuals();
    
    function expand() {
        if (isExpanded) return;
        isExpanded = true;
        container.classList.add('expanded');
        toggleBtn.textContent = '▲';
        toggleBtn.title = 'Collapse';
        if (onExpand) onExpand(container);
    }
    
    function collapse() {
        if (!isExpanded) return;
        isExpanded = false;
        container.classList.remove('expanded');
        toggleBtn.textContent = '▼';
        toggleBtn.title = 'Expand';
        if (onCollapse) onCollapse(container);
    }
    
    function toggle() { if (isExpanded) collapse(); else expand(); }
    
    toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    topToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); collapse(); });
    
    container.expand = expand;
    container.collapse = collapse;
    container.isExpanded = () => isExpanded;
    container.getValue = () => currentValue;
    container.setValue = (v) => { currentValue = Math.max(currentMin, Math.min(currentMax, v)); updateTrackVisuals(); valueInput.setValue(currentValue); };
    container.getName = () => currentName;
    container.setName = (n) => { currentName = n; labelInput.value = n; };
    container.getRange = () => ({ min: currentMin, max: currentMax });
    container.setRange = (newMin, newMax) => { currentMin = newMin; currentMax = newMax; startInput.setValue(currentMin); endInput.setValue(currentMax); };
    container.isLocked = () => isLocked;
    container.setLocked = (l) => { isLocked = l; lockBtn.textContent = isLocked ? '🔒' : '🔓'; container.classList.toggle('locked', isLocked); };
    container.getData = () => ({ name: currentName, value: currentValue, min: currentMin, max: currentMax, step: currentStep, locked: isLocked });
    
    return container;
}

function createEditableNumber(value, onChange, isInt = false, decimals = 4) {
    const container = document.createElement('div');
    container.className = 'sl-editable-number';
    
    const display = document.createElement('span');
    display.className = 'sl-editable-number-display';
    display.textContent = formatNumber(value, isInt, decimals);
    display.style.cursor = 'pointer';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'sl-editable-number-input';
    input.value = value;
    input.step = isInt ? 1 : Math.pow(10, -decimals);
    
    container.appendChild(display);
    container.appendChild(input);
    
    let isEditing = false;
    let currentValue = value;
    
    display.addEventListener('click', (e) => { e.stopPropagation(); isEditing = true; container.classList.add('editing'); input.value = currentValue; input.focus(); input.select(); });
    
    input.addEventListener('blur', () => {
        isEditing = false;
        container.classList.remove('editing');
        let v = parseFloat(input.value);
        if (isNaN(v)) v = currentValue;
        if (isInt) v = Math.round(v);
        currentValue = v;
        display.textContent = formatNumber(currentValue, isInt, decimals);
        if (onChange) onChange(currentValue);
    });
    
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); else if (e.key === 'Escape') { input.value = currentValue; input.blur(); } });
    input.addEventListener('click', (e) => e.stopPropagation());
    
    container.getValue = () => currentValue;
    container.setValue = (v) => { currentValue = v; display.textContent = formatNumber(currentValue, isInt, decimals); if (!isEditing) input.value = v; };
    
    return container;
}

function formatNumber(v, isInt, decimals) {
    if (isInt) return Math.round(v).toString();
    return parseFloat(v.toFixed(decimals)).toString();
}

// ========================================
// SLIDER STACK - Container for uniforms
// ========================================

export function SliderStack(options = {}) {
    const {
        sliders = [],
        addable = true,
        removable = true,
        onChange = null,
        onAdd = null,
        onRemove = null
    } = options;
    
    const container = document.createElement('div');
    container.className = 'sl-slider-stack';
    
    const slidersContainer = document.createElement('div');
    slidersContainer.className = 'sl-slider-stack-sliders';
    container.appendChild(slidersContainer);
    
    let addBtn = null;
    if (addable) {
        addBtn = document.createElement('button');
        addBtn.className = 'sl-slider-stack-add';
        addBtn.textContent = '+ Add';
        addBtn.style.cursor = 'pointer';
        addBtn.addEventListener('click', () => {
            const newSlider = addSlider({ name: `u_custom${sliderElements.length}`, value: 0.5, min: 0, max: 1 });
            if (onAdd) onAdd(newSlider.getData());
        });
        container.appendChild(addBtn);
    }
    
    const sliderElements = [];
    
    function addSlider(config) {
        const wrapper = document.createElement('div');
        wrapper.className = 'sl-slider-stack-item';
        
        const slider = UniformSlider({
            ...config,
            onChange: (value, name) => { if (onChange) onChange(value, name, sliderElements.indexOf(wrapper)); },
            onRemove: removable ? () => { removeSlider(sliderElements.indexOf(wrapper)); } : null
        });
        
        wrapper.appendChild(slider);
        sliderElements.push(wrapper);
        slidersContainer.appendChild(wrapper);
        wrapper.sliderAPI = slider;
        return slider;
    }
    
    function removeSlider(index) {
        if (index < 0 || index >= sliderElements.length) return;
        const wrapper = sliderElements[index];
        const data = wrapper.sliderAPI.getData();
        wrapper.remove();
        sliderElements.splice(index, 1);
        if (onRemove) onRemove(data, index);
    }
    
    sliders.forEach(config => addSlider(config));
    
    container.addSlider = addSlider;
    container.removeSlider = removeSlider;
    container.getSliders = () => sliderElements.map(w => w.sliderAPI);
    container.getData = () => sliderElements.map(w => w.sliderAPI.getData());
    container.setData = (data) => { while (sliderElements.length > 0) removeSlider(0); data.forEach(config => addSlider(config)); };
    container.collapseAll = () => { sliderElements.forEach(w => w.sliderAPI.collapse()); };
    
    return container;
}

// ========================================
// SIMPLE SLIDERS (existing API)
// ========================================

export function Slider(options = {}) {
    const { min = 0, max = 100, value = 50, step = 1, disabled = false, showValue = true, valueFormat = (v) => v.toFixed(step < 1 ? 2 : 0), onChange = null, onInput = null, className = '' } = options;
    
    const container = document.createElement('div');
    container.className = `sl-slider ${className}`.trim();
    
    const track = SliderTrack({ min, max, value, step, disabled, onInput: (v) => { if (valueDisplay) valueDisplay.textContent = valueFormat(v); if (onInput) onInput(v); }, onChange });
    container.appendChild(track);
    
    let valueDisplay = null;
    if (showValue) {
        valueDisplay = document.createElement('span');
        valueDisplay.className = 'sl-slider-value';
        valueDisplay.textContent = valueFormat(value);
        container.appendChild(valueDisplay);
    }
    
    container.getValue = () => track.getValue();
    container.setValue = (v) => { track.setValue(v); if (valueDisplay) valueDisplay.textContent = valueFormat(v); };
    container.setDisabled = (d) => track.setDisabled(d);
    
    return container;
}

export function LabeledSlider(options = {}) {
    const { min = 0, max = 100, value = 50, step = 1, disabled = false, showValue = true, showMinMax = true, minLabel = null, maxLabel = null, valueFormat = (v) => v.toFixed(step < 1 ? 2 : 0), onChange = null, onInput = null, className = '' } = options;
    
    const container = document.createElement('div');
    container.className = `sl-labeled-slider ${className}`.trim();
    
    const slider = Slider({ min, max, value, step, disabled, showValue, valueFormat, onChange, onInput });
    container.appendChild(slider);
    
    if (showMinMax) {
        const labels = document.createElement('div');
        labels.className = 'sl-slider-labels';
        labels.innerHTML = `<span class="sl-slider-label-min">${minLabel !== null ? minLabel : valueFormat(min)}</span><span class="sl-slider-label-max">${maxLabel !== null ? maxLabel : valueFormat(max)}</span>`;
        container.appendChild(labels);
    }
    
    container.getValue = () => slider.getValue();
    container.setValue = (v) => slider.setValue(v);
    container.setDisabled = (d) => slider.setDisabled(d);
    
    return container;
}

export function SliderGroup(options = {}) {
    const { label = 'Value', min = 0, max = 100, value = 50, step = 1, disabled = false, showInput = true, showMinMax = false, valueFormat = (v) => v.toFixed(step < 1 ? 2 : 0), onChange = null, onInput = null, className = '' } = options;
    
    const container = document.createElement('div');
    container.className = `sl-slider-group ${className}`.trim();
    if (disabled) container.classList.add('disabled');
    
    const labelEl = document.createElement('label');
    labelEl.className = 'sl-slider-group-label';
    labelEl.textContent = label;
    
    const row = document.createElement('div');
    row.className = 'sl-slider-group-row';
    
    const slider = LabeledSlider({ min, max, value, step, disabled, showValue: !showInput, showMinMax, valueFormat, onInput: (v) => { if (numberInput) numberInput.value = valueFormat(v); if (onInput) onInput(v); }, onChange });
    row.appendChild(slider);
    
    let numberInput = null;
    if (showInput) {
        numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.className = 'sl-slider-group-input';
        numberInput.min = min;
        numberInput.max = max;
        numberInput.step = step;
        numberInput.value = valueFormat(value);
        numberInput.disabled = disabled;
        numberInput.addEventListener('change', () => { let v = parseFloat(numberInput.value); if (isNaN(v)) v = min; v = Math.max(min, Math.min(max, v)); slider.setValue(v); numberInput.value = valueFormat(v); if (onChange) onChange(v); });
        row.appendChild(numberInput);
    }
    
    container.appendChild(labelEl);
    container.appendChild(row);
    
    container.getValue = () => slider.getValue();
    container.setValue = (v) => { slider.setValue(v); if (numberInput) numberInput.value = valueFormat(v); };
    container.setDisabled = (d) => { slider.setDisabled(d); if (numberInput) numberInput.disabled = d; container.classList.toggle('disabled', d); };
    container.setLabel = (l) => { labelEl.textContent = l; };
    
    return container;
}

// ========================================
// PARAMETER SLIDER - Title + Slider + Value
// ========================================

export function ParameterSlider(options = {}) {
    const { title = 'Parameter', min = 0, max = 1, value = 0.5, step = 0.01, isInt = false, showIncrementer = true, valueFormat = null, disabled = false, onChange = null } = options;
    
    let currentValue = Math.max(min, Math.min(max, value));
    let currentStep = isInt ? Math.max(1, Math.round(step)) : step;
    
    const container = document.createElement('div');
    container.className = 'sl-param-slider';
    if (disabled) container.classList.add('disabled');
    
    const titleEl = document.createElement('span');
    titleEl.className = 'sl-param-title';
    titleEl.textContent = title;
    container.appendChild(titleEl);
    
    const track = document.createElement('div');
    track.className = 'sl-slider-track';
    track.style.cursor = disabled ? 'default' : 'pointer';
    
    const trackBg = document.createElement('div');
    trackBg.className = 'sl-slider-track-bg';
    const fill = document.createElement('div');
    fill.className = 'sl-slider-track-fill';
    const thumb = document.createElement('div');
    thumb.className = 'sl-slider-thumb';
    thumb.style.cursor = disabled ? 'default' : 'pointer';
    
    trackBg.appendChild(fill);
    trackBg.appendChild(thumb);
    track.appendChild(trackBg);
    container.appendChild(track);
    
    function format(v) { return valueFormat ? valueFormat(v) : (isInt ? Math.round(v).toString() : v.toFixed(step < 0.01 ? 3 : 2)); }
    function update() { const p = ((currentValue - min) / (max - min)) * 100; fill.style.width = `${p}%`; thumb.style.left = `${p}%`; valueEl.textContent = format(currentValue); }
    
    const valueEl = document.createElement('span');
    valueEl.className = 'sl-param-value';
    valueEl.textContent = format(currentValue);
    container.appendChild(valueEl);
    
    if (showIncrementer) {
        const inc = document.createElement('div');
        inc.className = 'sl-param-incrementer';
        const dec = document.createElement('button');
        dec.className = 'sl-param-inc-btn';
        dec.textContent = '−';
        dec.addEventListener('click', () => { if (disabled) return; currentValue = Math.max(min, currentValue - currentStep); if (isInt) currentValue = Math.round(currentValue); update(); if (onChange) onChange(currentValue); });
        const incBtn = document.createElement('button');
        incBtn.className = 'sl-param-inc-btn';
        incBtn.textContent = '+';
        incBtn.addEventListener('click', () => { if (disabled) return; currentValue = Math.min(max, currentValue + currentStep); if (isInt) currentValue = Math.round(currentValue); update(); if (onChange) onChange(currentValue); });
        inc.appendChild(dec);
        inc.appendChild(incBtn);
        container.appendChild(inc);
    }
    
    function handlePointer(e) { if (disabled) return; const r = trackBg.getBoundingClientRect(); let v = min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min); v = Math.round(v / currentStep) * currentStep; if (isInt) v = Math.round(v); currentValue = Math.max(min, Math.min(max, v)); update(); if (onChange) onChange(currentValue); }
    track.addEventListener('pointerdown', (e) => { if (disabled) return; e.preventDefault(); track.classList.add('dragging'); handlePointer(e); const m = (e) => handlePointer(e); const u = () => { track.classList.remove('dragging'); document.removeEventListener('pointermove', m); document.removeEventListener('pointerup', u); }; document.addEventListener('pointermove', m); document.addEventListener('pointerup', u); });
    
    update();
    
    container.getValue = () => currentValue;
    container.setValue = (v) => { currentValue = Math.max(min, Math.min(max, v)); if (isInt) currentValue = Math.round(currentValue); update(); };
    container.setDisabled = (d) => { container.classList.toggle('disabled', d); track.style.cursor = d ? 'default' : 'pointer'; thumb.style.cursor = d ? 'default' : 'pointer'; };
    container.setTitle = (t) => { titleEl.textContent = t; };
    
    return container;
}

// ========================================
// ICON SLIDER - Icon + Slider
// ========================================

export function IconSlider(options = {}) {
    const { icon = '🔊', min = 0, max = 1, value = 0.5, step = 0.01, isInt = false, compact = false, disabled = false, onChange = null } = options;
    
    let currentValue = Math.max(min, Math.min(max, value));
    let currentStep = isInt ? Math.max(1, Math.round(step)) : step;
    
    const container = document.createElement('div');
    container.className = 'sl-icon-slider';
    if (compact) container.classList.add('compact');
    if (disabled) container.classList.add('disabled');
    
    const iconEl = document.createElement('span');
    iconEl.className = 'sl-icon-slider-icon';
    iconEl.innerHTML = icon;
    container.appendChild(iconEl);
    
    const track = document.createElement('div');
    track.className = 'sl-slider-track';
    track.style.cursor = disabled ? 'default' : 'pointer';
    
    const trackBg = document.createElement('div');
    trackBg.className = 'sl-slider-track-bg';
    const fill = document.createElement('div');
    fill.className = 'sl-slider-track-fill';
    const thumb = document.createElement('div');
    thumb.className = 'sl-slider-thumb';
    thumb.style.cursor = disabled ? 'default' : 'pointer';
    
    trackBg.appendChild(fill);
    trackBg.appendChild(thumb);
    track.appendChild(trackBg);
    container.appendChild(track);
    
    function update() { const p = ((currentValue - min) / (max - min)) * 100; fill.style.width = `${p}%`; thumb.style.left = `${p}%`; }
    
    function handlePointer(e) { if (disabled) return; const r = trackBg.getBoundingClientRect(); let v = min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min); v = Math.round(v / currentStep) * currentStep; if (isInt) v = Math.round(v); currentValue = Math.max(min, Math.min(max, v)); update(); if (onChange) onChange(currentValue); }
    track.addEventListener('pointerdown', (e) => { if (disabled) return; e.preventDefault(); track.classList.add('dragging'); handlePointer(e); const m = (e) => handlePointer(e); const u = () => { track.classList.remove('dragging'); document.removeEventListener('pointermove', m); document.removeEventListener('pointerup', u); }; document.addEventListener('pointermove', m); document.addEventListener('pointerup', u); });
    
    update();
    
    container.getValue = () => currentValue;
    container.setValue = (v) => { currentValue = Math.max(min, Math.min(max, v)); if (isInt) currentValue = Math.round(currentValue); update(); };
    container.setIcon = (i) => { iconEl.innerHTML = i; };
    container.setDisabled = (d) => { container.classList.toggle('disabled', d); track.style.cursor = d ? 'default' : 'pointer'; thumb.style.cursor = d ? 'default' : 'pointer'; };
    
    return container;
}

// ========================================
// TIMELINE SLIDER - Time scrubber
// ========================================

export function TimelineSlider(options = {}) {
    const { duration = 60, value = 0, onChange = null, onSeekStart = null, onSeekEnd = null } = options;
    
    let currentTime = Math.max(0, Math.min(duration, value));
    let currentDuration = duration;
    
    const container = document.createElement('div');
    container.className = 'sl-timeline-slider';
    
    const trackContainer = document.createElement('div');
    trackContainer.className = 'sl-timeline-track-container';
    
    const currentTimeEl = document.createElement('div');
    currentTimeEl.className = 'sl-timeline-current';
    currentTimeEl.textContent = formatTime(currentTime);
    trackContainer.appendChild(currentTimeEl);
    
    const track = document.createElement('div');
    track.className = 'sl-slider-track';
    track.style.cursor = 'pointer';
    
    const trackBg = document.createElement('div');
    trackBg.className = 'sl-slider-track-bg';
    const fill = document.createElement('div');
    fill.className = 'sl-slider-track-fill';
    const thumb = document.createElement('div');
    thumb.className = 'sl-slider-thumb';
    thumb.style.cursor = 'pointer';
    
    trackBg.appendChild(fill);
    trackBg.appendChild(thumb);
    track.appendChild(trackBg);
    trackContainer.appendChild(track);
    container.appendChild(trackContainer);
    
    const timesRow = document.createElement('div');
    timesRow.className = 'sl-timeline-times';
    const startTimeEl = document.createElement('span');
    startTimeEl.className = 'sl-timeline-start';
    startTimeEl.textContent = formatTime(0);
    const endTimeEl = document.createElement('span');
    endTimeEl.className = 'sl-timeline-end';
    endTimeEl.textContent = formatTime(currentDuration);
    timesRow.appendChild(startTimeEl);
    timesRow.appendChild(endTimeEl);
    container.appendChild(timesRow);
    
    function formatTime(s) { const sec = Math.ceil(s); return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`; }
    function update() { const p = currentDuration > 0 ? (currentTime / currentDuration) * 100 : 0; fill.style.width = `${p}%`; thumb.style.left = `${p}%`; currentTimeEl.textContent = formatTime(currentTime); currentTimeEl.style.left = `${p}%`; }
    
    function handlePointer(e) { const r = trackBg.getBoundingClientRect(); currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * currentDuration; update(); if (onChange) onChange(currentTime); }
    track.addEventListener('pointerdown', (e) => { e.preventDefault(); container.classList.add('dragging'); track.classList.add('dragging'); if (onSeekStart) onSeekStart(); handlePointer(e); const m = (e) => handlePointer(e); const u = () => { container.classList.remove('dragging'); track.classList.remove('dragging'); if (onSeekEnd) onSeekEnd(); document.removeEventListener('pointermove', m); document.removeEventListener('pointerup', u); }; document.addEventListener('pointermove', m); document.addEventListener('pointerup', u); });
    
    update();
    
    container.getTime = () => currentTime;
    container.setTime = (t) => { currentTime = Math.max(0, Math.min(currentDuration, t)); update(); };
    container.getDuration = () => currentDuration;
    container.setDuration = (d) => { currentDuration = Math.max(0, d); endTimeEl.textContent = formatTime(currentDuration); currentTime = Math.min(currentTime, currentDuration); update(); };
    
    return container;
}

// ========================================
// CHECKBOX - Standard tick box
// ========================================

export function Checkbox(options = {}) {
    const { label = '', checked = false, disabled = false, onChange = null } = options;
    let isChecked = checked;
    let isDisabled = disabled;

    const container = document.createElement('div');
    container.className = 'sl-checkbox';
    if (isChecked) container.classList.add('checked');
    if (isDisabled) container.classList.add('disabled');

    const box = document.createElement('span');
    box.className = 'sl-checkbox-box';
    const check = document.createElement('span');
    check.className = 'sl-checkbox-check';
    check.textContent = '✓';
    box.appendChild(check);
    container.appendChild(box);

    if (label) { const l = document.createElement('span'); l.className = 'sl-checkbox-label'; l.textContent = label; container.appendChild(l); }

    function toggle() { if (isDisabled) return; isChecked = !isChecked; container.classList.toggle('checked', isChecked); if (onChange) onChange(isChecked); }
    container.addEventListener('click', toggle);

    container.isChecked = () => isChecked;
    container.setChecked = (c) => { isChecked = c; container.classList.toggle('checked', isChecked); };
    container.setDisabled = (d) => { isDisabled = d; container.classList.toggle('disabled', d); };

    return container;
}

// ========================================
// UNIFORM BOOL - Checkbox with editable title
// ========================================

export function UniformBool(options = {}) {
    const { name = 'u_bool0', checked = false, onChange = null, onNameChange = null, onRemove = null } = options;
    let isChecked = checked;
    let currentName = name;

    const container = document.createElement('div');
    container.className = 'sl-uniform-bool';
    if (isChecked) container.classList.add('checked');

    const box = document.createElement('span');
    box.className = 'sl-checkbox-box';
    const check = document.createElement('span');
    check.className = 'sl-checkbox-check';
    check.textContent = '✓';
    box.appendChild(check);
    container.appendChild(box);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'sl-uniform-bool-label';
    labelInput.value = currentName;
    labelInput.addEventListener('blur', () => { currentName = labelInput.value || 'u_bool'; if (onNameChange) onNameChange(currentName); });
    container.appendChild(labelInput);

    function toggle() { isChecked = !isChecked; container.classList.toggle('checked', isChecked); if (onChange) onChange(isChecked, currentName); }
    box.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    
    container.isChecked = () => isChecked;
    container.setChecked = (c) => { isChecked = c; container.classList.toggle('checked', isChecked); };
    container.getName = () => currentName;
    container.setName = (n) => { currentName = n; labelInput.value = n; };
    container.getData = () => ({ name: currentName, value: isChecked });
    container.triggerRemove = () => { if (onRemove) onRemove(container); };
    
    return container;
}

// ========================================
// BOOL STACK - Fluid row container
// ========================================

export function BoolStack(options = {}) {
    const { bools = [], addable = true, removable = true, onChange = null, onAdd = null, onRemove = null } = options;
    
    const container = document.createElement('div');
    container.className = 'sl-bool-stack';
    
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'sl-bool-stack-items';
    container.appendChild(itemsContainer);
    
    const boolElements = [];
    
    function addBool(config) {
        const bool = UniformBool({ ...config, onChange: (checked, name) => { if (onChange) onChange(checked, name, boolElements.indexOf(bool)); }, onRemove: removable ? () => { removeBool(boolElements.indexOf(bool)); } : null });
        if (removable) { bool.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm(`Remove ${bool.getName()}?`)) removeBool(boolElements.indexOf(bool)); }); }
        boolElements.push(bool);
        itemsContainer.appendChild(bool);
        return bool;
    }
    
    function removeBool(index) { if (index < 0 || index >= boolElements.length) return; const b = boolElements[index]; const d = b.getData(); b.remove(); boolElements.splice(index, 1); if (onRemove) onRemove(d, index); }
    
    if (addable) { const addBtn = document.createElement('button'); addBtn.className = 'sl-bool-stack-add'; addBtn.textContent = '+ Add Bool'; addBtn.style.cursor = 'pointer'; addBtn.addEventListener('click', () => { const n = addBool({ name: `u_bool${boolElements.length}`, checked: false }); if (onAdd) onAdd(n.getData()); }); container.appendChild(addBtn); }
    
    bools.forEach(config => addBool(config));
    
    container.addBool = addBool;
    container.removeBool = removeBool;
    container.getBools = () => boolElements;
    container.getData = () => boolElements.map(b => b.getData());
    container.setData = (data) => { while (boolElements.length > 0) removeBool(0); data.forEach(c => addBool(c)); };
    container.randomize = () => {};
    
    return container;
}

// ========================================
// FLOAT STACK - Slider stack for floats
// ========================================

export function FloatStack(options = {}) {
    const { sliders = [], addable = true, removable = true, onChange = null, onAdd = null, onRemove = null } = options;
    const stack = SliderStack({ sliders: sliders.map(s => ({ ...s, isInt: false })), addable, removable, onChange, onAdd, onRemove });
    const orig = stack.addSlider;
    stack.addSlider = (c) => orig({ ...c, isInt: false });
    stack.randomize = () => { stack.getSliders().forEach(s => { if (!s.isLocked()) { const r = s.getRange(); s.setValue(r.min + Math.random() * (r.max - r.min)); } }); };
    return stack;
}

// ========================================
// INT STACK - Slider stack for ints
// ========================================

export function IntStack(options = {}) {
    const { sliders = [], addable = true, removable = true, onChange = null, onAdd = null, onRemove = null } = options;
    const stack = SliderStack({ sliders: sliders.map(s => ({ ...s, isInt: true, step: 1 })), addable, removable, onChange, onAdd, onRemove });
    const orig = stack.addSlider;
    stack.addSlider = (c) => orig({ ...c, isInt: true, step: 1 });
    stack.randomize = () => { stack.getSliders().forEach(s => { if (!s.isLocked()) { const r = s.getRange(); s.setValue(Math.floor(r.min + Math.random() * (r.max - r.min + 1))); } }); };
    return stack;
}

// ========================================
// UNIFORM PANEL - Complete uniform editor
// ========================================

export function UniformPanel(options = {}) {
    const { floats = [], ints = [], bools = [], onFloatChange = null, onIntChange = null, onBoolChange = null, onRandomize = null, onPresetSave = null } = options;
    
    const container = document.createElement('div');
    container.className = 'sl-uniform-panel';
    
    // Float section
    const floatSection = document.createElement('div');
    floatSection.className = 'sl-uniform-section';
    floatSection.innerHTML = '<div class="sl-uniform-section-title">Float Uniforms</div>';
    const floatStack = FloatStack({ sliders: floats, onChange: (v, n, i) => { if (onFloatChange) onFloatChange(v, n, i); } });
    floatSection.appendChild(floatStack);
    container.appendChild(floatSection);
    
    // Int section
    const intSection = document.createElement('div');
    intSection.className = 'sl-uniform-section';
    intSection.innerHTML = '<div class="sl-uniform-section-title">Int Uniforms</div>';
    const intStack = IntStack({ sliders: ints, onChange: (v, n, i) => { if (onIntChange) onIntChange(v, n, i); } });
    intSection.appendChild(intStack);
    container.appendChild(intSection);
    
    // Bool section
    const boolSection = document.createElement('div');
    boolSection.className = 'sl-uniform-section';
    boolSection.innerHTML = '<div class="sl-uniform-section-title">Bool Uniforms</div>';
    const boolStack = BoolStack({ bools, onChange: (c, n, i) => { if (onBoolChange) onBoolChange(c, n, i); } });
    boolSection.appendChild(boolStack);
    container.appendChild(boolSection);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'sl-uniform-panel-actions';
    
    const randomizeBtn = document.createElement('button');
    randomizeBtn.className = 'sl-uniform-randomize';
    randomizeBtn.innerHTML = '🎲 Randomize';
    randomizeBtn.style.cursor = 'pointer';
    randomizeBtn.addEventListener('click', () => { floatStack.randomize(); intStack.randomize(); if (onRandomize) onRandomize(container.getData()); });
    actions.appendChild(randomizeBtn);
    
    const presetBtn = document.createElement('button');
    presetBtn.className = 'sl-uniform-preset';
    presetBtn.innerHTML = '💾 Preset';
    presetBtn.style.cursor = 'pointer';
    presetBtn.addEventListener('click', () => { if (onPresetSave) onPresetSave(container.getData()); });
    actions.appendChild(presetBtn);
    
    container.appendChild(actions);
    
    container.getFloatStack = () => floatStack;
    container.getIntStack = () => intStack;
    container.getBoolStack = () => boolStack;
    container.getData = () => ({ floats: floatStack.getData(), ints: intStack.getData(), bools: boolStack.getData() });
    container.setData = (d) => { if (d.floats) floatStack.setData(d.floats); if (d.ints) intStack.setData(d.ints); if (d.bools) boolStack.setData(d.bools); };
    container.randomize = () => { floatStack.randomize(); intStack.randomize(); };
    
    return container;
}

// ========================================
// COLOR PICKER - RGB + HSV with gradient sliders
// ========================================

function rgbToHsv(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return { h, s, v };
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
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

export function ColorPicker(options = {}) {
    const { name = 'u_color', r = 1.0, g = 0.5, b = 0.2, onChange = null, onNameChange = null, onRemove = null } = options;
    let currentName = name;
    let rgb = { r, g, b };
    let hsv = rgbToHsv(r, g, b);
    let isExpanded = false;
    
    const container = document.createElement('div');
    container.className = 'sl-color-picker';
    
    const header = document.createElement('div');
    header.className = 'sl-color-picker-header';
    
    const swatch = document.createElement('div');
    swatch.className = 'sl-color-picker-swatch';
    swatch.addEventListener('click', () => { isExpanded = !isExpanded; container.classList.toggle('expanded', isExpanded); toggleBtn.textContent = isExpanded ? '▲' : '▼'; });
    header.appendChild(swatch);
    
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'sl-color-picker-label';
    labelInput.value = currentName;
    labelInput.addEventListener('blur', () => { currentName = labelInput.value || 'u_color'; if (onNameChange) onNameChange(currentName); });
    labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    header.appendChild(labelInput);
    
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'sl-color-picker-hex';
    hexInput.addEventListener('change', () => { const hex = hexInput.value.replace('#', ''); if (hex.length === 6) { rgb.r = parseInt(hex.substr(0,2),16)/255; rgb.g = parseInt(hex.substr(2,2),16)/255; rgb.b = parseInt(hex.substr(4,2),16)/255; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); updateAllVisuals(); if (onChange) onChange({...rgb}, currentName); } });
    header.appendChild(hexInput);
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sl-color-picker-toggle';
    toggleBtn.textContent = '▼';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.addEventListener('click', () => { isExpanded = !isExpanded; container.classList.toggle('expanded', isExpanded); toggleBtn.textContent = isExpanded ? '▲' : '▼'; });
    header.appendChild(toggleBtn);
    container.appendChild(header);
    
    const sliders = document.createElement('div');
    sliders.className = 'sl-color-picker-sliders';
    
    const channels = {};
    function toHex(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }
    function rgbToCss(r, g, b) { return '#' + toHex(r) + toHex(g) + toHex(b); }
    
    function createChannel(label, labelColor, getValue, setValue, getGradient) {
        const row = document.createElement('div');
        row.className = 'sl-color-channel';
        const lbl = document.createElement('span');
        lbl.className = 'sl-color-channel-label';
        lbl.textContent = label;
        lbl.style.color = labelColor;
        row.appendChild(lbl);
        const track = document.createElement('div');
        track.className = 'sl-slider-track sl-color-gradient-track';
        track.style.cursor = 'pointer';
        const trackBg = document.createElement('div');
        trackBg.className = 'sl-slider-track-bg sl-color-gradient-bg';
        trackBg.style.borderRadius = '3px';
        trackBg.style.overflow = 'hidden';
        const thumb = document.createElement('div');
        thumb.className = 'sl-slider-thumb';
        thumb.style.cursor = 'pointer';
        thumb.style.border = '2px solid white';
        thumb.style.boxShadow = '0 0 2px rgba(0,0,0,0.5)';
        trackBg.appendChild(thumb);
        track.appendChild(trackBg);
        row.appendChild(track);
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.className = 'sl-color-channel-value';
        row.appendChild(valInput);
        function update() { const val = getValue(); thumb.style.left = (val * 100) + '%'; valInput.value = val.toFixed(2); trackBg.style.background = getGradient(); }
        function handlePointer(e) { const rect = trackBg.getBoundingClientRect(); const val = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); setValue(val); updateAllVisuals(); if (onChange) onChange({...rgb}, currentName); }
        track.addEventListener('pointerdown', (e) => { e.preventDefault(); handlePointer(e); const move = (ev) => handlePointer(ev); const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); });
        valInput.addEventListener('change', () => { const v = parseFloat(valInput.value); if (!isNaN(v)) { setValue(Math.max(0, Math.min(1, v))); updateAllVisuals(); if (onChange) onChange({...rgb}, currentName); } });
        sliders.appendChild(row);
        return { update };
    }
    
    channels.r = createChannel('R', '#e74c3c', () => rgb.r, (v) => { rgb.r = v; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); }, () => `linear-gradient(to right, ${rgbToCss(0, rgb.g, rgb.b)}, ${rgbToCss(1, rgb.g, rgb.b)})`);
    channels.g = createChannel('G', '#2ecc71', () => rgb.g, (v) => { rgb.g = v; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); }, () => `linear-gradient(to right, ${rgbToCss(rgb.r, 0, rgb.b)}, ${rgbToCss(rgb.r, 1, rgb.b)})`);
    channels.b = createChannel('B', '#3498db', () => rgb.b, (v) => { rgb.b = v; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); }, () => `linear-gradient(to right, ${rgbToCss(rgb.r, rgb.g, 0)}, ${rgbToCss(rgb.r, rgb.g, 1)})`);
    
    const sep = document.createElement('div');
    sep.style.height = '4px';
    sliders.appendChild(sep);
    
    channels.h = createChannel('H', '#9b59b6', () => hsv.h, (v) => { hsv.h = v; const c = hsvToRgb(hsv.h, hsv.s, hsv.v); rgb.r = c.r; rgb.g = c.g; rgb.b = c.b; }, () => { const stops = []; for (let i = 0; i <= 6; i++) { const c = hsvToRgb(i/6, hsv.s, hsv.v); stops.push(rgbToCss(c.r, c.g, c.b)); } return `linear-gradient(to right, ${stops.join(', ')})`; });
    channels.s = createChannel('S', '#f39c12', () => hsv.s, (v) => { hsv.s = v; const c = hsvToRgb(hsv.h, hsv.s, hsv.v); rgb.r = c.r; rgb.g = c.g; rgb.b = c.b; }, () => { const c0 = hsvToRgb(hsv.h, 0, hsv.v); const c1 = hsvToRgb(hsv.h, 1, hsv.v); return `linear-gradient(to right, ${rgbToCss(c0.r, c0.g, c0.b)}, ${rgbToCss(c1.r, c1.g, c1.b)})`; });
    channels.v = createChannel('V', '#95a5a6', () => hsv.v, (v) => { hsv.v = v; const c = hsvToRgb(hsv.h, hsv.s, hsv.v); rgb.r = c.r; rgb.g = c.g; rgb.b = c.b; }, () => { const c0 = hsvToRgb(hsv.h, hsv.s, 0); const c1 = hsvToRgb(hsv.h, hsv.s, 1); return `linear-gradient(to right, ${rgbToCss(c0.r, c0.g, c0.b)}, ${rgbToCss(c1.r, c1.g, c1.b)})`; });
    
    container.appendChild(sliders);
    
    function updateAllVisuals() { const hex = rgbToCss(rgb.r, rgb.g, rgb.b); swatch.style.background = hex; hexInput.value = hex; channels.r.update(); channels.g.update(); channels.b.update(); channels.h.update(); channels.s.update(); channels.v.update(); }
    updateAllVisuals();
    
    container.getColor = () => ({...rgb});
    container.setColor = (c) => { rgb = {...c}; hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); updateAllVisuals(); };
    container.getName = () => currentName;
    container.setName = (n) => { currentName = n; labelInput.value = n; };
    container.getData = () => ({ name: currentName, r: rgb.r, g: rgb.g, b: rgb.b });
    container.triggerRemove = () => { if (onRemove) onRemove(container); };
    return container;
}

// ========================================
// VEC3 PICKER - 3D Position/Normal
// ========================================

export function Vec3Picker(options = {}) {
    const { name = 'u_position', x = 0, y = 0, z = 0, min = -1, max = 1, normalize = false, onChange = null, onNameChange = null, onRemove = null } = options;
    let currentName = name;
    let vec = { x, y, z };
    let isNormalized = normalize;
    let isExpanded = false;
    const range = { min, max };
    
    const container = document.createElement('div');
    container.className = 'sl-vec3-picker';
    
    const header = document.createElement('div');
    header.className = 'sl-vec3-picker-header';
    
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'sl-vec3-picker-label';
    labelInput.value = currentName;
    labelInput.addEventListener('blur', () => { currentName = labelInput.value || 'u_position'; if (onNameChange) onNameChange(currentName); });
    labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    header.appendChild(labelInput);
    
    const values = document.createElement('div');
    values.className = 'sl-vec3-picker-values';
    function createValueInput(key, cls) { const input = document.createElement('input'); input.type = 'text'; input.className = 'sl-vec3-picker-value ' + cls; input.addEventListener('change', () => { const v = parseFloat(input.value); if (!isNaN(v)) { vec[key] = Math.max(range.min, Math.min(range.max, v)); if (isNormalized) normalizeVec(); updateVisuals(); if (onChange) onChange({...vec}, currentName); } }); values.appendChild(input); return input; }
    const xInput = createValueInput('x', 'x');
    const yInput = createValueInput('y', 'y');
    const zInput = createValueInput('z', 'z');
    header.appendChild(values);
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sl-vec3-picker-toggle';
    toggleBtn.textContent = '▼';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.addEventListener('click', () => { isExpanded = !isExpanded; container.classList.toggle('expanded', isExpanded); toggleBtn.textContent = isExpanded ? '▲' : '▼'; });
    header.appendChild(toggleBtn);
    container.appendChild(header);
    
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'sl-vec3-picker-canvas-container';
    const canvas = document.createElement('canvas');
    canvas.className = 'sl-vec3-picker-canvas';
    canvas.width = 200;
    canvas.height = 120;
    canvasContainer.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    
    const zRow = document.createElement('div');
    zRow.className = 'sl-vec3-picker-z-row';
    const zLabel = document.createElement('span');
    zLabel.className = 'sl-vec3-picker-z-label';
    zLabel.textContent = 'Z';
    zRow.appendChild(zLabel);
    const zTrack = document.createElement('div');
    zTrack.className = 'sl-slider-track sl-vec3-picker-z-slider';
    zTrack.style.cursor = 'pointer';
    const zTrackBg = document.createElement('div');
    zTrackBg.className = 'sl-slider-track-bg';
    const zFill = document.createElement('div');
    zFill.className = 'sl-slider-track-fill';
    zFill.style.background = '#3498db';
    const zThumb = document.createElement('div');
    zThumb.className = 'sl-slider-thumb';
    zThumb.style.cursor = 'pointer';
    zTrackBg.appendChild(zFill);
    zTrackBg.appendChild(zThumb);
    zTrack.appendChild(zTrackBg);
    zRow.appendChild(zTrack);
    
    const normalizeBtn = document.createElement('button');
    normalizeBtn.className = 'sl-vec3-picker-normalize';
    normalizeBtn.textContent = 'Normalize';
    normalizeBtn.style.cursor = 'pointer';
    if (isNormalized) normalizeBtn.classList.add('active');
    normalizeBtn.addEventListener('click', () => { isNormalized = !isNormalized; normalizeBtn.classList.toggle('active', isNormalized); if (isNormalized) normalizeVec(); updateVisuals(); if (onChange) onChange({...vec}, currentName); });
    zRow.appendChild(normalizeBtn);
    canvasContainer.appendChild(zRow);
    container.appendChild(canvasContainer);
    
    function normalizeVec() { const len = Math.sqrt(vec.x*vec.x + vec.y*vec.y + vec.z*vec.z); if (len > 0.0001) { vec.x /= len; vec.y /= len; vec.z /= len; } }
    function vecToCanvas(v) { const w = canvas.width; const h = canvas.height; const cx = w/2; const cy = h/2; const scale = Math.min(w,h)/2 - 10; return { x: cx + (v.x/(range.max-range.min))*scale*2, y: cy - (v.y/(range.max-range.min))*scale*2 }; }
    function canvasToVec(px, py) { const w = canvas.width; const h = canvas.height; const cx = w/2; const cy = h/2; const scale = Math.min(w,h)/2 - 10; return { x: ((px-cx)/(scale*2))*(range.max-range.min), y: -((py-cy)/(scale*2))*(range.max-range.min) }; }
    function drawCanvas() { const w = canvas.width; const h = canvas.height; ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,0,w,h); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke(); const pt = vecToCanvas(vec); ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI*2); ctx.fillStyle = '#3498db'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    function updateVisuals() { xInput.value = vec.x.toFixed(3); yInput.value = vec.y.toFixed(3); zInput.value = vec.z.toFixed(3); const zPct = ((vec.z - range.min)/(range.max - range.min))*100; zFill.style.width = zPct + '%'; zThumb.style.left = zPct + '%'; drawCanvas(); }
    
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); const rect = canvas.getBoundingClientRect(); const scaleX = canvas.width/rect.width; const scaleY = canvas.height/rect.height; function handlePointer(e) { const px = (e.clientX - rect.left)*scaleX; const py = (e.clientY - rect.top)*scaleY; const v = canvasToVec(px, py); vec.x = Math.max(range.min, Math.min(range.max, v.x)); vec.y = Math.max(range.min, Math.min(range.max, v.y)); if (isNormalized) normalizeVec(); updateVisuals(); if (onChange) onChange({...vec}, currentName); } handlePointer(e); const move = (e) => handlePointer(e); const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); });
    zTrack.addEventListener('pointerdown', (e) => { e.preventDefault(); function handleZ(e) { const rect = zTrackBg.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (e.clientX - rect.left)/rect.width)); vec.z = range.min + pct*(range.max - range.min); if (isNormalized) normalizeVec(); updateVisuals(); if (onChange) onChange({...vec}, currentName); } handleZ(e); const move = (e) => handleZ(e); const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); });
    
    const resizeObs = new ResizeObserver(() => { canvas.width = canvas.offsetWidth || 200; canvas.height = canvas.offsetHeight || 120; drawCanvas(); });
    resizeObs.observe(canvas);
    updateVisuals();
    
    container.getVec = () => ({...vec});
    container.setVec = (v) => { vec = {...v}; updateVisuals(); };
    container.getName = () => currentName;
    container.setName = (n) => { currentName = n; labelInput.value = n; };
    container.getData = () => ({ name: currentName, x: vec.x, y: vec.y, z: vec.z, normalize: isNormalized });
    container.triggerRemove = () => { if (onRemove) onRemove(container); };
    container.isNormalized = () => isNormalized;
    container.setNormalized = (n) => { isNormalized = n; normalizeBtn.classList.toggle('active', n); if (n) normalizeVec(); updateVisuals(); };
    return container;
}

// ========================================
// COLOR STACK - Container for color pickers
// ========================================

export function ColorStack(options = {}) {
    const { colors = [], addable = true, removable = true, onChange = null, onAdd = null, onRemove = null } = options;
    const container = document.createElement('div');
    container.className = 'sl-color-stack';
    const colorElements = [];
    let addBtn = null;
    
    function addColor(config) { const picker = ColorPicker({ ...config, onChange: (color, name) => { if (onChange) onChange(color, name, colorElements.indexOf(picker)); } }); if (removable) { picker.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm(`Remove ${picker.getName()}?`)) removeColor(colorElements.indexOf(picker)); }); } colorElements.push(picker); container.insertBefore(picker, addBtn); return picker; }
    function removeColor(index) { if (index < 0 || index >= colorElements.length) return; const p = colorElements[index]; const d = p.getData(); p.remove(); colorElements.splice(index, 1); if (onRemove) onRemove(d, index); }
    
    if (addable) { addBtn = document.createElement('button'); addBtn.className = 'sl-color-stack-add'; addBtn.textContent = '+ Add Color'; addBtn.style.cursor = 'pointer'; addBtn.addEventListener('click', () => { const n = addColor({ name: `u_color${colorElements.length}`, r: Math.random(), g: Math.random(), b: Math.random() }); if (onAdd) onAdd(n.getData()); }); container.appendChild(addBtn); }
    colors.forEach(c => addColor(c));
    
    container.addColor = addColor;
    container.removeColor = removeColor;
    container.getColors = () => colorElements;
    container.getData = () => colorElements.map(c => c.getData());
    container.setData = (data) => { while (colorElements.length > 0) removeColor(0); data.forEach(c => addColor(c)); };
    container.randomize = () => { colorElements.forEach(c => c.setColor({ r: Math.random(), g: Math.random(), b: Math.random() })); };
    return container;
}

// ========================================
// VEC3 STACK - Container for vec3 pickers
// ========================================

export function Vec3Stack(options = {}) {
    const { vecs = [], addable = true, removable = true, min = -1, max = 1, onChange = null, onAdd = null, onRemove = null } = options;
    const container = document.createElement('div');
    container.className = 'sl-vec3-stack';
    const vecElements = [];
    let addBtn = null;
    
    function addVec(config) { const picker = Vec3Picker({ min, max, ...config, onChange: (vec, name) => { if (onChange) onChange(vec, name, vecElements.indexOf(picker)); } }); if (removable) { picker.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm(`Remove ${picker.getName()}?`)) removeVec(vecElements.indexOf(picker)); }); } vecElements.push(picker); container.insertBefore(picker, addBtn); return picker; }
    function removeVec(index) { if (index < 0 || index >= vecElements.length) return; const p = vecElements[index]; const d = p.getData(); p.remove(); vecElements.splice(index, 1); if (onRemove) onRemove(d, index); }
    
    if (addable) { addBtn = document.createElement('button'); addBtn.className = 'sl-vec3-stack-add'; addBtn.textContent = '+ Add Vec3'; addBtn.style.cursor = 'pointer'; addBtn.addEventListener('click', () => { const n = addVec({ name: `u_vec${vecElements.length}`, x: 0, y: 0, z: 0 }); if (onAdd) onAdd(n.getData()); }); container.appendChild(addBtn); }
    vecs.forEach(v => addVec(v));
    
    container.addVec = addVec;
    container.removeVec = removeVec;
    container.getVecs = () => vecElements;
    container.getData = () => vecElements.map(v => v.getData());
    container.setData = (data) => { while (vecElements.length > 0) removeVec(0); data.forEach(v => addVec(v)); };
    container.randomize = () => { vecElements.forEach(v => { if (!v.isNormalized()) { v.setVec({ x: min + Math.random()*(max-min), y: min + Math.random()*(max-min), z: min + Math.random()*(max-min) }); } else { const rx = Math.random()*2-1; const ry = Math.random()*2-1; const rz = Math.random()*2-1; const len = Math.sqrt(rx*rx+ry*ry+rz*rz)||1; v.setVec({ x: rx/len, y: ry/len, z: rz/len }); } }); };
    return container;
}

// ========================================
// PRESET MANAGER - Save/Load presets
// ========================================

export function PresetManager(options = {}) {
    const { defaultPreset = null, onLoad = null, onSave = null, onDelete = null } = options;
    const presets = new Map();
    let presetCounter = 1;
    
    const container = document.createElement('div');
    container.className = 'sl-preset-controls';
    
    const loadRow = document.createElement('div');
    loadRow.className = 'sl-preset-row';
    const select = document.createElement('select');
    select.className = 'sl-preset-select';
    loadRow.appendChild(select);
    const loadBtn = document.createElement('button');
    loadBtn.className = 'sl-preset-load';
    loadBtn.textContent = 'Load';
    loadBtn.style.cursor = 'pointer';
    loadBtn.addEventListener('click', () => { const presetName = select.value; if (presetName && presets.has(presetName)) { if (onLoad) onLoad(presets.get(presetName), presetName); } });
    loadRow.appendChild(loadBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'sl-preset-delete';
    deleteBtn.textContent = '×';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.addEventListener('click', () => { const presetName = select.value; if (presetName && presetName !== 'Default' && presets.has(presetName)) { presets.delete(presetName); updateSelect(); if (onDelete) onDelete(presetName); } });
    loadRow.appendChild(deleteBtn);
    container.appendChild(loadRow);
    
    const saveRow = document.createElement('div');
    saveRow.className = 'sl-preset-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'sl-preset-name';
    nameInput.placeholder = 'Preset name...';
    nameInput.value = `preset${presetCounter}`;
    saveRow.appendChild(nameInput);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'sl-preset-save';
    saveBtn.textContent = '💾 Save';
    saveBtn.style.cursor = 'pointer';
    saveBtn.addEventListener('click', () => { const name = nameInput.value.trim() || `preset${presetCounter}`; if (onSave) { const data = onSave(name); if (data) { presets.set(name, JSON.parse(JSON.stringify(data))); updateSelect(); presetCounter++; nameInput.value = `preset${presetCounter}`; select.value = name; } } });
    saveRow.appendChild(saveBtn);
    container.appendChild(saveRow);
    
    function updateSelect() { select.innerHTML = ''; for (const [name] of presets) { const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt); } }
    if (defaultPreset) { presets.set('Default', JSON.parse(JSON.stringify(defaultPreset))); updateSelect(); select.value = 'Default'; }
    
    container.getPresets = () => presets;
    container.addPreset = (name, data) => { presets.set(name, JSON.parse(JSON.stringify(data))); updateSelect(); };
    container.removePreset = (name) => { presets.delete(name); updateSelect(); };
    container.setDefaultPreset = (data) => { presets.set('Default', JSON.parse(JSON.stringify(data))); updateSelect(); };
    return container;
}
