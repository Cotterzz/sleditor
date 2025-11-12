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
        padding: 8px 12px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        cursor: move;
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span>🎚️ Uniform Controls</span>
        <button id="uniformControlsClose" style="background: none; border: none; color: var(--text-primary); cursor: pointer; font-size: 16px; padding: 0;">✕</button>
    `;
    panel.appendChild(header);
    
    // Content (scrollable)
    const content = document.createElement('div');
    content.id = 'uniformControlsContent';
    content.style.cssText = `
        padding: 12px;
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
    
    // Add "Add Slider" buttons section
    const addSection = document.createElement('div');
    addSection.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);';
    
    // Count how many of each type we have
    const floatCount = activeSliders.filter(s => s.type === 'float').length;
    const intCount = activeSliders.filter(s => s.type === 'int').length;
    const boolCount = activeSliders.filter(s => s.type === 'bool').length;
    
    // Add Float button
    if (floatCount < 15) {
        const addFloatBtn = document.createElement('button');
        addFloatBtn.textContent = `+ Add Float (${floatCount}/15)`;
        addFloatBtn.className = 'uiBtn';
        addFloatBtn.style.cssText = 'width: 100%; padding: 6px; margin-bottom: 6px;';
        addFloatBtn.onclick = () => addSlider('float');
        addSection.appendChild(addFloatBtn);
    }
    
    // Add Int button
    if (intCount < 3) {
        const addIntBtn = document.createElement('button');
        addIntBtn.textContent = `+ Add Int (${intCount}/3)`;
        addIntBtn.className = 'uiBtn';
        addIntBtn.style.cssText = 'width: 100%; padding: 6px; margin-bottom: 6px;';
        addIntBtn.onclick = () => addSlider('int');
        addSection.appendChild(addIntBtn);
    }
    
    // Add Bool button
    if (boolCount < 2) {
        const addBoolBtn = document.createElement('button');
        addBoolBtn.textContent = `+ Add Bool (${boolCount}/2)`;
        addBoolBtn.className = 'uiBtn';
        addBoolBtn.style.cssText = 'width: 100%; padding: 6px; margin-bottom: 6px;';
        addBoolBtn.onclick = () => addSlider('bool');
        addSection.appendChild(addBoolBtn);
    }
    
    content.appendChild(addSection);
    
    // Reset All button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Values';
    resetBtn.className = 'uiBtn';
    resetBtn.style.cssText = 'width: 100%; padding: 6px; margin-top: 6px;';
    resetBtn.onclick = resetAllValues;
    content.appendChild(resetBtn);
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
    container.style.cssText = 'margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);';
    
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
    // Title input and remove button
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; align-items: center;';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Slider title';
    titleInput.style.cssText = 'flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 4px; font-size: 11px; border-radius: 2px;';
    titleInput.oninput = () => {
        sliderConfig.title = titleInput.value;
    };
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove slider';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 2px 6px; border-radius: 2px; font-size: 12px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    
    titleRow.appendChild(titleInput);
    titleRow.appendChild(removeBtn);
    container.appendChild(titleRow);
    
    // Uniform name and value display
    const valueRow = document.createElement('div');
    valueRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10px;';
    valueRow.innerHTML = `
        <span style="color: var(--text-secondary);">u_custom${sliderConfig.index}</span>
        <span id="uniformValue_${listIndex}" style="color: var(--accent-color); font-weight: bold;">${sliderConfig.value.toFixed(3)}</span>
    `;
    container.appendChild(valueRow);
    
    // Min/Max inputs
    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; font-size: 10px;';
    rangeRow.innerHTML = `
        <label style="color: var(--text-secondary);">min: <input type="number" id="uniformMin_${listIndex}" value="${sliderConfig.min}" step="0.1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
        <label style="color: var(--text-secondary);">max: <input type="number" id="uniformMax_${listIndex}" value="${sliderConfig.max}" step="0.1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
    `;
    container.appendChild(rangeRow);
    
    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1000';
    const t = (sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min);
    slider.value = Math.round(t * 1000).toString();
    slider.style.cssText = 'width: 100%;';
    slider.oninput = () => {
        const t = parseFloat(slider.value) / 1000;
        const value = sliderConfig.min + t * (sliderConfig.max - sliderConfig.min);
        sliderConfig.value = value;
        document.getElementById(`uniformValue_${listIndex}`).textContent = value.toFixed(3);
        applyFloatUniform(sliderConfig.index, value);
    };
    container.appendChild(slider);
    
    // Update range inputs
    const minInput = container.querySelector(`#uniformMin_${listIndex}`);
    const maxInput = container.querySelector(`#uniformMax_${listIndex}`);
    minInput.onchange = () => {
        sliderConfig.min = parseFloat(minInput.value);
        slider.oninput(); // Recalculate value
    };
    maxInput.onchange = () => {
        sliderConfig.max = parseFloat(maxInput.value);
        slider.oninput(); // Recalculate value
    };
    
    return container;
}

/**
 * Create an int slider
 */
function createIntSlider(sliderConfig, listIndex, container) {
    // Title input and remove button
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; align-items: center;';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Slider title';
    titleInput.style.cssText = 'flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 4px; font-size: 11px; border-radius: 2px;';
    titleInput.oninput = () => {
        sliderConfig.title = titleInput.value;
    };
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove slider';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 2px 6px; border-radius: 2px; font-size: 12px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    
    titleRow.appendChild(titleInput);
    titleRow.appendChild(removeBtn);
    container.appendChild(titleRow);
    
    // Uniform name and value display
    const valueRow = document.createElement('div');
    valueRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10px;';
    valueRow.innerHTML = `
        <span style="color: var(--text-secondary);">u_customInt${sliderConfig.index}</span>
        <span id="uniformValue_${listIndex}" style="color: var(--accent-color); font-weight: bold;">${sliderConfig.value}</span>
    `;
    container.appendChild(valueRow);
    
    // Min/Max inputs
    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; font-size: 10px;';
    rangeRow.innerHTML = `
        <label style="color: var(--text-secondary);">min: <input type="number" id="uniformMin_${listIndex}" value="${sliderConfig.min}" step="1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
        <label style="color: var(--text-secondary);">max: <input type="number" id="uniformMax_${listIndex}" value="${sliderConfig.max}" step="1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
    `;
    container.appendChild(rangeRow);
    
    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    const t = (sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min);
    slider.value = Math.round(t * 100).toString();
    slider.step = '1';
    slider.style.cssText = 'width: 100%;';
    slider.oninput = () => {
        const t = parseFloat(slider.value) / 100;
        const value = Math.round(sliderConfig.min + t * (sliderConfig.max - sliderConfig.min));
        sliderConfig.value = value;
        document.getElementById(`uniformValue_${listIndex}`).textContent = value;
        applyIntUniform(sliderConfig.index, value);
    };
    container.appendChild(slider);
    
    // Update range inputs
    const minInput = container.querySelector(`#uniformMin_${listIndex}`);
    const maxInput = container.querySelector(`#uniformMax_${listIndex}`);
    minInput.onchange = () => {
        sliderConfig.min = parseInt(minInput.value);
        slider.oninput(); // Recalculate value
    };
    maxInput.onchange = () => {
        sliderConfig.max = parseInt(maxInput.value);
        slider.oninput(); // Recalculate value
    };
    
    return container;
}

/**
 * Create a bool checkbox
 */
function createBoolSlider(sliderConfig, listIndex, container) {
    // Title input and remove button
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; align-items: center;';
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = sliderConfig.title;
    titleInput.placeholder = 'Checkbox title';
    titleInput.style.cssText = 'flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 4px; font-size: 11px; border-radius: 2px;';
    titleInput.oninput = () => {
        sliderConfig.title = titleInput.value;
    };
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove checkbox';
    removeBtn.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 2px 6px; border-radius: 2px; font-size: 12px;';
    removeBtn.onclick = () => removeSlider(listIndex);
    
    titleRow.appendChild(titleInput);
    titleRow.appendChild(removeBtn);
    container.appendChild(titleRow);
    
    // Checkbox and uniform name
    const checkboxRow = document.createElement('div');
    checkboxRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = sliderConfig.value;
    checkbox.onchange = () => {
        sliderConfig.value = checkbox.checked;
        applyBoolUniform(sliderConfig.index, checkbox.checked);
    };
    
    const label = document.createElement('span');
    label.style.cssText = 'color: var(--text-secondary); font-size: 10px;';
    label.textContent = `u_customBool${sliderConfig.index}`;
    
    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(label);
    container.appendChild(checkboxRow);
    
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
