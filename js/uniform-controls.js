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
        left: 60%;
        width: 520px;
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
    
    // Make header draggable (mouse and touch)
    header.addEventListener('mousedown', startDrag);
    header.addEventListener('touchstart', startDragTouch, { passive: false });
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
    
    // Count how many of each type we have
    const floatCount = activeSliders.filter(s => s.type === 'float').length;
    const intCount = activeSliders.filter(s => s.type === 'int').length;
    const boolCount = activeSliders.filter(s => s.type === 'bool').length;
    
    // Add buttons section - row 1: add uniform buttons
    const addSection = document.createElement('div');
    addSection.style.cssText = 'margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); display: flex; gap: 3px;';
    
    // Add Float button
    if (floatCount < MAX_FLOATS) {
        const addFloatBtn = document.createElement('button');
        addFloatBtn.textContent = `+Float(${floatCount}/${MAX_FLOATS})`;
        addFloatBtn.className = 'uiBtn';
        addFloatBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
        addFloatBtn.onclick = () => addSlider('float');
        addSection.appendChild(addFloatBtn);
    }
    
    // Add Int button
    if (intCount < MAX_INTS) {
        const addIntBtn = document.createElement('button');
        addIntBtn.textContent = `+Int(${intCount}/${MAX_INTS})`;
        addIntBtn.className = 'uiBtn';
        addIntBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
        addIntBtn.onclick = () => addSlider('int');
        addSection.appendChild(addIntBtn);
    }
    
    // Add Bool button
    if (boolCount < MAX_BOOLS) {
        const addBoolBtn = document.createElement('button');
        addBoolBtn.textContent = `+Bool(${boolCount}/${MAX_BOOLS})`;
        addBoolBtn.className = 'uiBtn';
        addBoolBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
        addBoolBtn.onclick = () => addSlider('bool');
        addSection.appendChild(addBoolBtn);
    }
    
    if (addSection.children.length > 0) {
        content.appendChild(addSection);
    }
    
    // Action buttons row: Randomize, Halfway
    const actionSection = document.createElement('div');
    actionSection.style.cssText = 'margin-top: 4px; display: flex; gap: 3px;';
    
    const randomBtn = document.createElement('button');
    randomBtn.textContent = '🎲 Randomize';
    randomBtn.className = 'uiBtn';
    randomBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
    randomBtn.onclick = randomizeAllValues;
    actionSection.appendChild(randomBtn);
    
    const halfwayBtn = document.createElement('button');
    halfwayBtn.textContent = '↔ Halfway';
    halfwayBtn.className = 'uiBtn';
    halfwayBtn.style.cssText = 'flex: 1; padding: 2px 3px; font-size: 9px;';
    halfwayBtn.onclick = setAllToHalfway;
    actionSection.appendChild(halfwayBtn);
    
    content.appendChild(actionSection);
}

// Uniform limits
const MAX_FLOATS = 85;
const MAX_INTS = 10;
const MAX_BOOLS = 5;

/**
 * Add a new slider of the specified type
 */
function addSlider(type) {
    // Find next available index for this type
    const existingIndices = activeSliders
        .filter(s => s.type === type)
        .map(s => s.index);
    
    let nextIndex = 0;
    const maxIndex = type === 'float' ? MAX_FLOATS : type === 'int' ? MAX_INTS : MAX_BOOLS;
    
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
 * Create a float slider - single line layout:
 * SliderName | min | -------slider------ | max | value | u_name | X
 */
function createFloatSlider(sliderConfig, listIndex, container) {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 4px; align-items: center;';
    
    // Title input (narrow)
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Name';
    titleInput.style.cssText = 'width: 70px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px 4px; font-size: 10px; border-radius: 2px;';
    titleInput.oninput = () => { sliderConfig.title = titleInput.value; };
    row.appendChild(titleInput);
    
    // Min input
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.value = sliderConfig.min;
    minInput.step = '0.1';
    minInput.style.cssText = 'width: 40px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px; font-size: 9px; border-radius: 2px; text-align: center;';
    row.appendChild(minInput);
    
    // Slider (flexible width)
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1000';
    const t = (sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min);
    slider.value = Math.round(t * 1000).toString();
    slider.style.cssText = 'flex: 1; min-width: 80px;';
    row.appendChild(slider);
    
    // Max input
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.value = sliderConfig.max;
    maxInput.step = '0.1';
    maxInput.style.cssText = 'width: 40px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px; font-size: 9px; border-radius: 2px; text-align: center;';
    row.appendChild(maxInput);
    
    // Value display
    const valueSpan = document.createElement('span');
    valueSpan.style.cssText = 'color: var(--accent-color); font-size: 10px; font-weight: bold; width: 45px; text-align: right;';
    valueSpan.textContent = sliderConfig.value.toFixed(3);
    row.appendChild(valueSpan);
    
    // Uniform name
    const uniformSpan = document.createElement('span');
    uniformSpan.style.cssText = 'color: var(--text-secondary); font-size: 8px; width: 50px;';
    uniformSpan.textContent = `u_custom${sliderConfig.index}`;
    row.appendChild(uniformSpan);
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 1px 5px; border-radius: 2px; font-size: 10px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    row.appendChild(removeBtn);
    
    // Event handlers
    slider.oninput = () => {
        const t = parseFloat(slider.value) / 1000;
        const value = sliderConfig.min + t * (sliderConfig.max - sliderConfig.min);
        sliderConfig.value = value;
        valueSpan.textContent = value.toFixed(3);
        applyFloatUniform(sliderConfig.index, value);
    };
    
    minInput.onchange = () => {
        sliderConfig.min = parseFloat(minInput.value);
        slider.oninput();
    };
    maxInput.onchange = () => {
        sliderConfig.max = parseFloat(maxInput.value);
        slider.oninput();
    };
    
    container.appendChild(row);
    return container;
}

/**
 * Create an int slider - single line layout
 */
function createIntSlider(sliderConfig, listIndex, container) {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 4px; align-items: center;';
    
    // Title input
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Name';
    titleInput.style.cssText = 'width: 70px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px 4px; font-size: 10px; border-radius: 2px;';
    titleInput.oninput = () => { sliderConfig.title = titleInput.value; };
    row.appendChild(titleInput);
    
    // Min input
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.value = sliderConfig.min;
    minInput.step = '1';
    minInput.style.cssText = 'width: 40px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px; font-size: 9px; border-radius: 2px; text-align: center;';
    row.appendChild(minInput);
    
    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    const t = (sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min);
    slider.value = Math.round(t * 100).toString();
    slider.step = '1';
    slider.style.cssText = 'flex: 1; min-width: 80px;';
    row.appendChild(slider);
    
    // Max input
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.value = sliderConfig.max;
    maxInput.step = '1';
    maxInput.style.cssText = 'width: 40px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px; font-size: 9px; border-radius: 2px; text-align: center;';
    row.appendChild(maxInput);
    
    // Value display
    const valueSpan = document.createElement('span');
    valueSpan.style.cssText = 'color: var(--accent-color); font-size: 10px; font-weight: bold; width: 45px; text-align: right;';
    valueSpan.textContent = sliderConfig.value.toString();
    row.appendChild(valueSpan);
    
    // Uniform name
    const uniformSpan = document.createElement('span');
    uniformSpan.style.cssText = 'color: var(--text-secondary); font-size: 8px; width: 50px;';
    uniformSpan.textContent = `u_customInt${sliderConfig.index}`;
    row.appendChild(uniformSpan);
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 1px 5px; border-radius: 2px; font-size: 10px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    row.appendChild(removeBtn);
    
    // Event handlers
    slider.oninput = () => {
        const t = parseFloat(slider.value) / 100;
        const value = Math.round(sliderConfig.min + t * (sliderConfig.max - sliderConfig.min));
        sliderConfig.value = value;
        valueSpan.textContent = value.toString();
        applyIntUniform(sliderConfig.index, value);
    };
    
    minInput.onchange = () => {
        sliderConfig.min = parseInt(minInput.value);
        slider.oninput();
    };
    maxInput.onchange = () => {
        sliderConfig.max = parseInt(maxInput.value);
        slider.oninput();
    };
    
    container.appendChild(row);
    return container;
}

/**
 * Create a bool checkbox - single line layout
 */
function createBoolSlider(sliderConfig, listIndex, container) {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 4px; align-items: center;';
    
    // Title input
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Name';
    titleInput.style.cssText = 'width: 70px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px 4px; font-size: 10px; border-radius: 2px;';
    titleInput.oninput = () => { sliderConfig.title = titleInput.value; };
    row.appendChild(titleInput);
    
    // Checkbox (wider area for easier clicking)
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; min-width: 80px;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = sliderConfig.value;
    checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
    checkbox.onchange = () => {
        sliderConfig.value = checkbox.checked;
        valueSpan.textContent = checkbox.checked ? 'true' : 'false';
        applyBoolUniform(sliderConfig.index, checkbox.checked);
    };
    checkboxContainer.appendChild(checkbox);
    row.appendChild(checkboxContainer);
    
    // Value display
    const valueSpan = document.createElement('span');
    valueSpan.style.cssText = 'color: var(--accent-color); font-size: 10px; font-weight: bold; width: 45px; text-align: right;';
    valueSpan.textContent = sliderConfig.value ? 'true' : 'false';
    row.appendChild(valueSpan);
    
    // Uniform name
    const uniformSpan = document.createElement('span');
    uniformSpan.style.cssText = 'color: var(--text-secondary); font-size: 8px; width: 60px;';
    uniformSpan.textContent = `u_customBool${sliderConfig.index}`;
    row.appendChild(uniformSpan);
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 1px 5px; border-radius: 2px; font-size: 10px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    row.appendChild(removeBtn);
    
    container.appendChild(row);
    return container;
}

/**
 * Apply float uniform value to buffer
 * Buffer layout: [7-91] = floats (85 slots)
 */
function applyFloatUniform(index, value) {
    if (!state.uniformBuilder) return; // Not initialized yet
    const { f32 } = state.uniformBuilder.getArrays();
    f32[7 + index] = value;
}

/**
 * Apply int uniform value to buffer
 * Buffer layout: [92-101] = ints (10 slots)
 */
function applyIntUniform(index, value) {
    if (!state.uniformBuilder) return; // Not initialized yet
    const { i32 } = state.uniformBuilder.getArrays();
    i32[92 + index] = value;
}

/**
 * Apply bool uniform value to buffer
 * Buffer layout: [102-106] = bools (5 slots)
 */
function applyBoolUniform(index, value) {
    if (!state.uniformBuilder) return; // Not initialized yet
    const { i32 } = state.uniformBuilder.getArrays();
    i32[102 + index] = value ? 1 : 0;
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
 * Set all sliders to random values within their min/max limits
 */
function randomizeAllValues() {
    activeSliders.forEach((slider) => {
        if (slider.type === 'float') {
            slider.value = slider.min + Math.random() * (slider.max - slider.min);
            applyFloatUniform(slider.index, slider.value);
        } else if (slider.type === 'int') {
            slider.value = Math.floor(slider.min + Math.random() * (slider.max - slider.min + 1));
            applyIntUniform(slider.index, slider.value);
        } else if (slider.type === 'bool') {
            slider.value = Math.random() > 0.5;
            applyBoolUniform(slider.index, slider.value);
        }
    });
    
    rebuildPanel();
}

/**
 * Set all sliders to halfway between min and max
 */
function setAllToHalfway() {
    activeSliders.forEach((slider) => {
        if (slider.type === 'float') {
            slider.value = (slider.min + slider.max) / 2;
            applyFloatUniform(slider.index, slider.value);
        } else if (slider.type === 'int') {
            slider.value = Math.round((slider.min + slider.max) / 2);
            applyIntUniform(slider.index, slider.value);
        } else if (slider.type === 'bool') {
            // For bools, halfway means false (or could toggle)
            slider.value = false;
            applyBoolUniform(slider.index, slider.value);
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
    // Touch support
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
}

function startDrag(e) {
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.cursor = 'grabbing';
}

function startDragTouch(e) {
    e.preventDefault();
    isDragging = true;
    const touch = e.touches[0];
    const rect = panel.getBoundingClientRect();
    dragOffsetX = touch.clientX - rect.left;
    dragOffsetY = touch.clientY - rect.top;
}

function onMouseMove(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
}

function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const x = touch.clientX - dragOffsetX;
    const y = touch.clientY - dragOffsetY;
    
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

function onTouchEnd() {
    if (isDragging) {
        isDragging = false;
    }
}
