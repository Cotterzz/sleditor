// ============================================================================
// Uniform Controls Panel - Interactive Sliders for Custom Uniforms
// ============================================================================

import { state } from './core.js';

let panel = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isVisible = false;

// Active sliders configuration
let activeSliders = [];

// Default starting configuration (1 float slider)
const defaultConfig = {
    sliders: [
        { type: 'float', index: 0, min: 0, max: 1, value: 0, title: 'Custom 0' }
    ],
    panelVisible: false,
    panelPosition: { x: 80, y: 10 } // percentage
};

/**
 * Initialize the uniform controls panel
 */
export function init() {
    createPanel();
    setupDragListeners();
    loadUniformConfig(defaultConfig);
}

/**
 * Show panel
 */
export function show() {
    if (!panel) init();
    isVisible = true;
    panel.style.display = 'flex';
}

/**
 * Hide panel
 */
export function hide() {
    if (!panel) init();
    isVisible = false;
    panel.style.display = 'none';
}

/**
 * Toggle panel visibility
 */
export function toggle() {
    if (isVisible) {
        hide();
    } else {
        show();
    }
}

/**
 * Set panel position using percentages
 * @param {number} xPercent - X position as percentage (0-100)
 * @param {number} yPercent - Y position as percentage (0-100)
 */
export function setPanelPosition(xPercent, yPercent) {
    if (!panel) init();
    panel.style.left = `${xPercent}%`;
    panel.style.top = `${yPercent}%`;
    panel.style.right = 'auto';
}

/**
 * Get current panel position as percentages
 * @returns {Object} { x: xPercent, y: yPercent }
 */
function getPanelPosition() {
    if (!panel) return { x: 80, y: 10 };
    
    const rect = panel.getBoundingClientRect();
    const xPercent = (rect.left / window.innerWidth) * 100;
    const yPercent = (rect.top / window.innerHeight) * 100;
    
    return { 
        x: Math.max(0, Math.min(100, xPercent)), 
        y: Math.max(0, Math.min(100, yPercent))
    };
}

/**
 * Get current uniform configuration for saving
 * @returns {Object} Configuration object with sliders, panelVisible, panelPosition
 */
export function getUniformConfig() {
    return {
        sliders: activeSliders.map(slider => ({
            type: slider.type,
            index: slider.index,
            min: slider.min,
            max: slider.max,
            value: slider.value,
            title: slider.title
        })),
        panelVisible: isVisible,
        panelPosition: getPanelPosition()
    };
}

/**
 * Load uniform configuration (from database)
 * @param {Object} config - Configuration object
 */
export function loadUniformConfig(config) {
    if (!config || !config.sliders) {
        config = defaultConfig;
    }
    
    // Reset active sliders
    activeSliders = config.sliders.map(s => ({ ...s }));
    
    // Rebuild the panel content
    rebuildPanel();
    
    // Apply values to uniform buffer
    applyAllUniformValues();
    
    // Set panel position
    if (config.panelPosition) {
        setPanelPosition(config.panelPosition.x, config.panelPosition.y);
    }
    
    // Set visibility
    if (config.panelVisible) {
        show();
    } else {
        hide();
    }
}

/**
 * Create the panel DOM structure
 */
function createPanel() {
    panel = document.createElement('div');
    panel.id = 'uniformControlsPanel';
    panel.style.cssText = `
        position: fixed;
        top: 10%;
        left: 80%;
        width: 400px;
        max-height: 80vh;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: none;
        flex-direction: column;
        z-index: 9999;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 12px;
    `;
    
    // Header (draggable)
    const header = document.createElement('div');
    header.className = 'uniform-controls-header';
    header.style.cssText = `
        padding: 4px 6px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        cursor: move;
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span style="font-size: 10px;">🎚️ Uniforms</span>
        <button id="uniformControlsClose" style="background: none; border: none; color: var(--text-primary); cursor: pointer; font-size: 14px; padding: 0;">✕</button>
    `;
    panel.appendChild(header);
    
    // Content (scrollable)
    const content = document.createElement('div');
    content.id = 'uniformControlsContent';
    content.style.cssText = `
        padding: 6px;
        overflow-y: auto;
        flex: 1;
    `;
    
    panel.appendChild(content);
    document.body.appendChild(panel);
    
    // Close button
    document.getElementById('uniformControlsClose').onclick = toggle;
    
    // Make header draggable
    header.addEventListener('mousedown', startDrag);
}

/**
 * Rebuild panel content with current active sliders
 */
function rebuildPanel() {
    const content = document.getElementById('uniformControlsContent');
    if (!content) return;
    
    content.innerHTML = '';
    
    // Render each active slider
    activeSliders.forEach((slider, listIndex) => {
        const sliderEl = createSlider(slider, listIndex);
        content.appendChild(sliderEl);
    });
    
    // Add buttons section - all on one line
    const addSection = document.createElement('div');
    addSection.style.cssText = 'margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); display: flex; gap: 3px; justify-content: space-between;';
    
    // Count how many of each type we have
    const floatCount = activeSliders.filter(s => s.type === 'float').length;
    const intCount = activeSliders.filter(s => s.type === 'int').length;
    const boolCount = activeSliders.filter(s => s.type === 'bool').length;
    
    // Add Float button
    if (floatCount < 15) {
        const addFloatBtn = document.createElement('button');
        addFloatBtn.textContent = `+Float(${floatCount}/15)`;
        addFloatBtn.className = 'uiBtn';
        addFloatBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
        addFloatBtn.onclick = () => addSlider('float');
        addSection.appendChild(addFloatBtn);
    }
    
    // Add Int button
    if (intCount < 3) {
        const addIntBtn = document.createElement('button');
        addIntBtn.textContent = `+Int(${intCount}/3)`;
        addIntBtn.className = 'uiBtn';
        addIntBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
        addIntBtn.onclick = () => addSlider('int');
        addSection.appendChild(addIntBtn);
    }
    
    // Add Bool button
    if (boolCount < 2) {
        const addBoolBtn = document.createElement('button');
        addBoolBtn.textContent = `+Bool(${boolCount}/2)`;
        addBoolBtn.className = 'uiBtn';
        addBoolBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
        addBoolBtn.onclick = () => addSlider('bool');
        addSection.appendChild(addBoolBtn);
    }
    
    if (addSection.children.length > 0) {
        content.appendChild(addSection);
    }
}

/**
 * Add a new slider of the specified type
 */
function addSlider(type) {
    // Find next available index for this type
    const existingIndices = activeSliders
        .filter(s => s.type === type)
        .map(s => s.index);
    
    let nextIndex = 0;
    const maxIndex = type === 'float' ? 15 : type === 'int' ? 3 : 2;
    
    for (let i = 0; i < maxIndex; i++) {
        if (!existingIndices.includes(i)) {
            nextIndex = i;
            break;
        }
    }
    
    // Create new slider config
    const newSlider = {
        type,
        index: nextIndex,
        min: type === 'float' ? 0 : type === 'int' ? 0 : undefined,
        max: type === 'float' ? 1 : type === 'int' ? 100 : undefined,
        value: type === 'float' ? 0 : type === 'int' ? 0 : false,
        title: type === 'bool' ? `Bool ${nextIndex}` : `Custom ${nextIndex}`
    };
    
    activeSliders.push(newSlider);
    rebuildPanel();
}

/**
 * Remove a slider
 */
function removeSlider(listIndex) {
    if (activeSliders.length <= 1) {
        alert('You must have at least one slider');
        return;
    }
    
    activeSliders.splice(listIndex, 1);
    rebuildPanel();
}

/**
 * Create a slider element
 */
function createSlider(sliderConfig, listIndex) {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border-color);';
    
    if (sliderConfig.type === 'bool') {
        return createBoolSlider(sliderConfig, listIndex, container);
    } else if (sliderConfig.type === 'int') {
        return createIntSlider(sliderConfig, listIndex, container);
    } else {
        return createFloatSlider(sliderConfig, listIndex, container);
    }
}

/**
 * Create a float slider
 */
function createFloatSlider(sliderConfig, listIndex, container) {
    // Line 1: Title, Value, Uniform Name, Remove
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; gap: 3px; margin-bottom: 2px; align-items: center;';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Title';
    titleInput.style.cssText = 'flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px 3px; font-size: 9px; border-radius: 2px; min-width: 0;';
    titleInput.oninput = () => {
        sliderConfig.title = titleInput.value;
    };
    
    const valueSpan = document.createElement('span');
    valueSpan.id = `uniformValue_${listIndex}`;
    valueSpan.style.cssText = 'color: var(--accent-color); font-size: 9px; font-weight: bold; min-width: 35px; text-align: right;';
    valueSpan.textContent = sliderConfig.value.toFixed(3);
    
    const uniformSpan = document.createElement('span');
    uniformSpan.style.cssText = 'color: var(--text-secondary); font-size: 8px; min-width: 45px;';
    uniformSpan.textContent = `u_custom${sliderConfig.index}`;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 1px 4px; border-radius: 2px; font-size: 10px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    
    topRow.appendChild(titleInput);
    topRow.appendChild(valueSpan);
    topRow.appendChild(uniformSpan);
    topRow.appendChild(removeBtn);
    container.appendChild(topRow);
    
    // Line 2: Min, Slider, Max
    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = 'display: flex; gap: 3px; align-items: center;';
    
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.id = `uniformMin_${listIndex}`;
    minInput.value = sliderConfig.min;
    minInput.step = '0.1';
    minInput.style.cssText = 'width: 38px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 1px 2px; font-size: 9px; border-radius: 2px;';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1000';
    const t = (sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min);
    slider.value = Math.round(t * 1000).toString();
    slider.style.cssText = 'flex: 1;';
    slider.oninput = () => {
        const t = parseFloat(slider.value) / 1000;
        const value = sliderConfig.min + t * (sliderConfig.max - sliderConfig.min);
        sliderConfig.value = value;
        valueSpan.textContent = value.toFixed(3);
        applyFloatUniform(sliderConfig.index, value);
    };
    
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.id = `uniformMax_${listIndex}`;
    maxInput.value = sliderConfig.max;
    maxInput.step = '0.1';
    maxInput.style.cssText = 'width: 38px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 1px 2px; font-size: 9px; border-radius: 2px;';
    
    minInput.onchange = () => {
        sliderConfig.min = parseFloat(minInput.value);
        slider.oninput(); // Recalculate value
    };
    maxInput.onchange = () => {
        sliderConfig.max = parseFloat(maxInput.value);
        slider.oninput(); // Recalculate value
    };
    
    sliderRow.appendChild(minInput);
    sliderRow.appendChild(slider);
    sliderRow.appendChild(maxInput);
    container.appendChild(sliderRow);
    
    return container;
}

/**
 * Create an int slider
 */
function createIntSlider(sliderConfig, listIndex, container) {
    // Line 1: Title, Value, Uniform Name, Remove
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; gap: 3px; margin-bottom: 2px; align-items: center;';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Title';
    titleInput.style.cssText = 'flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px 3px; font-size: 9px; border-radius: 2px; min-width: 0;';
    titleInput.oninput = () => {
        sliderConfig.title = titleInput.value;
    };
    
    const valueSpan = document.createElement('span');
    valueSpan.id = `uniformValue_${listIndex}`;
    valueSpan.style.cssText = 'color: var(--accent-color); font-size: 9px; font-weight: bold; min-width: 35px; text-align: right;';
    valueSpan.textContent = sliderConfig.value.toString();
    
    const uniformSpan = document.createElement('span');
    uniformSpan.style.cssText = 'color: var(--text-secondary); font-size: 8px; min-width: 45px;';
    uniformSpan.textContent = `u_customInt${sliderConfig.index}`;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 1px 4px; border-radius: 2px; font-size: 10px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    
    topRow.appendChild(titleInput);
    topRow.appendChild(valueSpan);
    topRow.appendChild(uniformSpan);
    topRow.appendChild(removeBtn);
    container.appendChild(topRow);
    
    // Line 2: Min, Slider, Max
    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = 'display: flex; gap: 3px; align-items: center;';
    
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.id = `uniformMin_${listIndex}`;
    minInput.value = sliderConfig.min;
    minInput.step = '1';
    minInput.style.cssText = 'width: 38px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 1px 2px; font-size: 9px; border-radius: 2px;';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    const t = (sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min);
    slider.value = Math.round(t * 100).toString();
    slider.step = '1';
    slider.style.cssText = 'flex: 1;';
    slider.oninput = () => {
        const t = parseFloat(slider.value) / 100;
        const value = Math.round(sliderConfig.min + t * (sliderConfig.max - sliderConfig.min));
        sliderConfig.value = value;
        valueSpan.textContent = value.toString();
        applyIntUniform(sliderConfig.index, value);
    };
    
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.id = `uniformMax_${listIndex}`;
    maxInput.value = sliderConfig.max;
    maxInput.step = '1';
    maxInput.style.cssText = 'width: 38px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 1px 2px; font-size: 9px; border-radius: 2px;';
    
    minInput.onchange = () => {
        sliderConfig.min = parseInt(minInput.value);
        slider.oninput(); // Recalculate value
    };
    maxInput.onchange = () => {
        sliderConfig.max = parseInt(maxInput.value);
        slider.oninput(); // Recalculate value
    };
    
    sliderRow.appendChild(minInput);
    sliderRow.appendChild(slider);
    sliderRow.appendChild(maxInput);
    container.appendChild(sliderRow);
    
    return container;
}

/**
 * Create a bool checkbox
 */
function createBoolSlider(sliderConfig, listIndex, container) {
    // Line 1: Title, Checkbox, Uniform Name, Remove
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 3px; align-items: center;';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Title';
    titleInput.style.cssText = 'flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px 3px; font-size: 9px; border-radius: 2px; min-width: 0;';
    titleInput.oninput = () => {
        sliderConfig.title = titleInput.value;
    };
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = sliderConfig.value;
    checkbox.style.cssText = 'margin: 0;';
    checkbox.onchange = () => {
        sliderConfig.value = checkbox.checked;
        applyBoolUniform(sliderConfig.index, checkbox.checked);
    };
    
    const uniformSpan = document.createElement('span');
    uniformSpan.style.cssText = 'color: var(--text-secondary); font-size: 8px; min-width: 55px;';
    uniformSpan.textContent = `u_customBool${sliderConfig.index}`;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 1px 4px; border-radius: 2px; font-size: 10px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    
    row.appendChild(titleInput);
    row.appendChild(checkbox);
    row.appendChild(uniformSpan);
    row.appendChild(removeBtn);
    container.appendChild(row);
    
    return container;
}

/**
 * Apply float uniform value to buffer
 */
function applyFloatUniform(index, value) {
    if (!state.uniformBuilder) return; // Not initialized yet
    const { f32 } = state.uniformBuilder.getArrays();
    f32[7 + index] = value;
}

/**
 * Apply int uniform value to buffer
 */
function applyIntUniform(index, value) {
    if (!state.uniformBuilder) return; // Not initialized yet
    const { i32 } = state.uniformBuilder.getArrays();
    i32[22 + index] = value;
}

/**
 * Apply bool uniform value to buffer
 */
function applyBoolUniform(index, value) {
    if (!state.uniformBuilder) return; // Not initialized yet
    const { i32 } = state.uniformBuilder.getArrays();
    i32[25 + index] = value ? 1 : 0;
}

/**
 * Apply all current uniform values to buffer
 */
function applyAllUniformValues() {
    activeSliders.forEach(slider => {
        if (slider.type === 'float') {
            applyFloatUniform(slider.index, slider.value);
        } else if (slider.type === 'int') {
            applyIntUniform(slider.index, slider.value);
        } else if (slider.type === 'bool') {
            applyBoolUniform(slider.index, slider.value);
        }
    });
}

/**
 * Reset all uniform values to their defaults (based on min/max)
 */
function resetAllValues() {
    activeSliders.forEach((slider, listIndex) => {
        if (slider.type === 'float') {
            slider.value = 0;
            applyFloatUniform(slider.index, 0);
        } else if (slider.type === 'int') {
            slider.value = 0;
            applyIntUniform(slider.index, 0);
        } else if (slider.type === 'bool') {
            slider.value = false;
            applyBoolUniform(slider.index, false);
        }
    });
    
    rebuildPanel();
}

/**
 * Dragging functionality
 */
function setupDragListeners() {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function startDrag(e) {
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.cursor = 'grabbing';
}

function onMouseMove(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
}

function onMouseUp() {
    if (isDragging) {
        isDragging = false;
        panel.style.cursor = 'default';
    }
}
