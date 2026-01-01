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
    labelInput.readOnly = true;
    labelInput.addEventListener('focus', () => { labelInput.readOnly = false; });
    labelInput.addEventListener('blur', () => { labelInput.readOnly = true; currentName = labelInput.value || 'u_custom'; if (onNameChange) onNameChange(currentName); });
    
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
