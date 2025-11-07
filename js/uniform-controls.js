// ============================================================================
// Uniform Controls Panel - Interactive Sliders for Custom Uniforms
// ============================================================================

import { state } from './core.js';

let panel = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isVisible = false;

// Uniform settings (min/max ranges, default to 0-1 for floats)
const uniformSettings = {
    floats: Array(15).fill().map(() => ({ min: 0, max: 1, value: 0 })),
    ints: Array(3).fill().map(() => ({ min: 0, max: 100, value: 0 })),
    bools: Array(2).fill().map(() => ({ value: false }))
};

/**
 * Initialize the uniform controls panel
 */
export function init() {
    createPanel();
    setupDragListeners();
}

/**
 * Toggle panel visibility
 */
export function toggle() {
    if (!panel) init();
    
    isVisible = !isVisible;
    panel.style.display = isVisible ? 'flex' : 'none';
}

/**
 * Create the panel DOM structure
 */
function createPanel() {
    panel = document.createElement('div');
    panel.id = 'uniformControlsPanel';
    panel.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
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
    
    // Float sliders
    for (let i = 0; i < 15; i++) {
        content.appendChild(createFloatSlider(i));
    }
    
    // Int sliders
    for (let i = 0; i < 3; i++) {
        content.appendChild(createIntSlider(i));
    }
    
    // Bool checkboxes
    for (let i = 0; i < 2; i++) {
        content.appendChild(createBoolCheckbox(i));
    }
    
    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset All';
    resetBtn.style.cssText = `
        width: 100%;
        padding: 6px;
        margin-top: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: 3px;
        cursor: pointer;
    `;
    resetBtn.onclick = resetAll;
    content.appendChild(resetBtn);
    
    panel.appendChild(content);
    document.body.appendChild(panel);
    
    // Close button
    document.getElementById('uniformControlsClose').onclick = toggle;
    
    // Make header draggable
    header.addEventListener('mousedown', startDrag);
}

/**
 * Create a float slider control
 */
function createFloatSlider(index) {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);';
    
    // Label and value display
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
    topRow.innerHTML = `
        <span style="color: var(--text-primary); font-weight: bold;">u_custom${index}</span>
        <span id="uniformFloat${index}Value" style="color: var(--accent-color);">${uniformSettings.floats[index].value.toFixed(3)}</span>
    `;
    container.appendChild(topRow);
    
    // Min/Max inputs
    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; font-size: 10px;';
    rangeRow.innerHTML = `
        <label style="color: var(--text-secondary);">min: <input type="number" id="uniformFloat${index}Min" value="${uniformSettings.floats[index].min}" step="0.1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
        <label style="color: var(--text-secondary);">max: <input type="number" id="uniformFloat${index}Max" value="${uniformSettings.floats[index].max}" step="0.1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
    `;
    container.appendChild(rangeRow);
    
    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `uniformFloat${index}Slider`;
    slider.min = '0';
    slider.max = '1000';
    slider.value = '0';
    slider.style.cssText = 'width: 100%;';
    slider.oninput = () => updateFloatUniform(index, slider);
    container.appendChild(slider);
    
    // Update range inputs
    const minInput = container.querySelector(`#uniformFloat${index}Min`);
    const maxInput = container.querySelector(`#uniformFloat${index}Max`);
    minInput.onchange = () => {
        uniformSettings.floats[index].min = parseFloat(minInput.value);
        updateFloatUniform(index, slider);
    };
    maxInput.onchange = () => {
        uniformSettings.floats[index].max = parseFloat(maxInput.value);
        updateFloatUniform(index, slider);
    };
    
    return container;
}

/**
 * Create an int slider control
 */
function createIntSlider(index) {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);';
    
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
    topRow.innerHTML = `
        <span style="color: var(--text-primary); font-weight: bold;">u_customInt${index}</span>
        <span id="uniformInt${index}Value" style="color: var(--accent-color);">${uniformSettings.ints[index].value}</span>
    `;
    container.appendChild(topRow);
    
    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; font-size: 10px;';
    rangeRow.innerHTML = `
        <label style="color: var(--text-secondary);">min: <input type="number" id="uniformInt${index}Min" value="${uniformSettings.ints[index].min}" step="1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
        <label style="color: var(--text-secondary);">max: <input type="number" id="uniformInt${index}Max" value="${uniformSettings.ints[index].max}" step="1" style="width: 50px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 2px;"></label>
    `;
    container.appendChild(rangeRow);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `uniformInt${index}Slider`;
    slider.min = '0';
    slider.max = '100';
    slider.value = '0';
    slider.step = '1';
    slider.style.cssText = 'width: 100%;';
    slider.oninput = () => updateIntUniform(index, slider);
    container.appendChild(slider);
    
    const minInput = container.querySelector(`#uniformInt${index}Min`);
    const maxInput = container.querySelector(`#uniformInt${index}Max`);
    minInput.onchange = () => {
        uniformSettings.ints[index].min = parseInt(minInput.value);
        // Don't change slider.min - it stays 0-100, we scale in updateIntUniform
        updateIntUniform(index, slider);
    };
    maxInput.onchange = () => {
        uniformSettings.ints[index].max = parseInt(maxInput.value);
        // Don't change slider.max - it stays 0-100, we scale in updateIntUniform
        updateIntUniform(index, slider);
    };
    
    return container;
}

/**
 * Create a bool checkbox control
 */
function createBoolCheckbox(index) {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);';
    
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `uniformBool${index}Checkbox`;
    checkbox.checked = uniformSettings.bools[index].value;
    checkbox.onchange = () => updateBoolUniform(index, checkbox);
    
    const text = document.createElement('span');
    text.style.cssText = 'color: var(--text-primary); font-weight: bold;';
    text.textContent = `u_customBool${index}`;
    
    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
    
    return container;
}

/**
 * Update float uniform value
 */
function updateFloatUniform(index, slider) {
    const settings = uniformSettings.floats[index];
    const t = parseFloat(slider.value) / 1000; // 0-1
    const value = settings.min + t * (settings.max - settings.min);
    settings.value = value;
    
    // Update display
    document.getElementById(`uniformFloat${index}Value`).textContent = value.toFixed(3);
    
    // Update uniform buffer
    const { f32 } = state.uniformBuilder.getArrays();
    f32[7 + index] = value;
}

/**
 * Update int uniform value
 */
function updateIntUniform(index, slider) {
    const settings = uniformSettings.ints[index];
    const value = parseInt(slider.value);
    const scaledValue = Math.round(settings.min + (value / 100) * (settings.max - settings.min));
    settings.value = scaledValue;
    
    // Update display
    document.getElementById(`uniformInt${index}Value`).textContent = scaledValue;
    
    // Update uniform buffer
    const { i32 } = state.uniformBuilder.getArrays();
    i32[22 + index] = scaledValue;
}

/**
 * Update bool uniform value
 */
function updateBoolUniform(index, checkbox) {
    const value = checkbox.checked;
    uniformSettings.bools[index].value = value;
    
    // Update uniform buffer
    const { i32 } = state.uniformBuilder.getArrays();
    i32[25 + index] = value ? 1 : 0;
}

/**
 * Reset all uniforms to defaults
 */
function resetAll() {
    // Reset float uniforms
    for (let i = 0; i < 15; i++) {
        uniformSettings.floats[i].value = 0;
        const slider = document.getElementById(`uniformFloat${i}Slider`);
        if (slider) slider.value = '0';
        updateFloatUniform(i, slider);
    }
    
    // Reset int uniforms
    for (let i = 0; i < 3; i++) {
        uniformSettings.ints[i].value = 0;
        const slider = document.getElementById(`uniformInt${i}Slider`);
        if (slider) slider.value = '0';
        updateIntUniform(i, slider);
    }
    
    // Reset bool uniforms
    for (let i = 0; i < 2; i++) {
        uniformSettings.bools[i].value = false;
        const checkbox = document.getElementById(`uniformBool${i}Checkbox`);
        if (checkbox) checkbox.checked = false;
        updateBoolUniform(i, checkbox);
    }
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
    panel.style.right = 'auto'; // Remove right positioning
}

function onMouseUp() {
    if (isDragging) {
        isDragging = false;
        panel.style.cursor = 'default';
    }
}

