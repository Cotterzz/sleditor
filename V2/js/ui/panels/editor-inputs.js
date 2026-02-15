/**
 * Input Content Components - Mouse, Keyboard, Webcam, Mic for unified editor
 */

import { events, EVENTS } from '../../core/events.js';

/**
 * Create content for an input tab
 */
export function createInputContent(element) {
    const container = document.createElement('div');
    container.className = 'v2-input-content';
    container.dataset.elementId = element.id;
    
    // Header
    const header = document.createElement('div');
    header.className = 'v2-input-header';
    
    const icon = document.createElement('span');
    icon.className = 'v2-input-icon';
    icon.textContent = element.icon;
    header.appendChild(icon);
    
    const label = document.createElement('span');
    label.className = 'v2-input-label';
    label.textContent = element.label;
    header.appendChild(label);
    
    if (element.channel !== undefined) {
        const channel = document.createElement('span');
        channel.className = 'v2-input-channel';
        channel.textContent = `iChannel${element.channel}`;
        header.appendChild(channel);
    }
    
    container.appendChild(header);
    
    // Input-specific content
    const content = document.createElement('div');
    content.className = 'v2-input-body';
    
    switch (element.type) {
        case 'mouse':
            content.appendChild(createMouseInputContent());
            break;
        case 'keyboard':
            content.appendChild(createKeyboardInputContent(element));
            break;
        case 'webcam':
            content.appendChild(createWebcamInputContent(element));
            break;
        case 'mic':
            content.appendChild(createMicInputContent(element));
            break;
        default:
            content.innerHTML = `<div class="v2-input-placeholder">Settings for ${element.type} coming soon</div>`;
    }
    
    container.appendChild(content);
    
    return container;
}

/**
 * Mouse input content
 */
function createMouseInputContent() {
    const div = document.createElement('div');
    div.className = 'v2-mouse-input';
    
    // Status
    const status = document.createElement('div');
    status.className = 'v2-input-status active';
    status.innerHTML = `
        <span class="v2-status-indicator"></span>
        <span class="v2-status-text">Always Active</span>
    `;
    div.appendChild(status);
    
    // Uniform info
    const uniforms = document.createElement('div');
    uniforms.className = 'v2-uniform-info';
    uniforms.innerHTML = `
        <div class="v2-uniform-title">Shader Uniforms</div>
        <div class="v2-uniform-row"><code>iMouse.xy</code> — Current position (pixels)</div>
        <div class="v2-uniform-row"><code>iMouse.zw</code> — Click position (pixels)</div>
        <div class="v2-uniform-row"><code>iMouse.z</code> — > 0 when button pressed</div>
    `;
    div.appendChild(uniforms);
    
    // Example code
    const example = document.createElement('pre');
    example.className = 'v2-code-example';
    example.textContent = `// Check if mouse is pressed
if (iMouse.z > 0.0) {
    vec2 clickPos = iMouse.zw;
}

// Get normalized mouse position
vec2 uv = iMouse.xy / iResolution.xy;`;
    div.appendChild(example);
    
    return div;
}

/**
 * Keyboard input content
 */
function createKeyboardInputContent(element) {
    const div = document.createElement('div');
    div.className = 'v2-keyboard-input';
    
    // Enable toggle
    const toggle = createInputToggle(element, 'Enable Keyboard Input');
    div.appendChild(toggle);
    
    // Uniform info
    const uniforms = document.createElement('div');
    uniforms.className = 'v2-uniform-info';
    uniforms.innerHTML = `
        <div class="v2-uniform-title">Shader Uniforms</div>
        <div class="v2-uniform-row"><code>iChannel${element.channel}</code> — 256×3 texture (R8)</div>
        <div class="v2-uniform-row">Row 0 (y=0.5) — Key pressed this frame</div>
        <div class="v2-uniform-row">Row 1 (y=1.5) — Key held down</div>
        <div class="v2-uniform-row">Row 2 (y=2.5) — Key toggled</div>
    `;
    div.appendChild(uniforms);
    
    // Example code
    const example = document.createElement('pre');
    example.className = 'v2-code-example';
    example.textContent = `// Check if space key is pressed
float keySpace = texelFetch(iChannel${element.channel}, ivec2(32, 1), 0).r;
if (keySpace > 0.5) {
    // Space is held down
}`;
    div.appendChild(example);
    
    return div;
}

/**
 * Webcam input content
 */
function createWebcamInputContent(element) {
    const div = document.createElement('div');
    div.className = 'v2-webcam-input';
    
    // Enable toggle
    const toggle = createInputToggle(element, 'Enable Webcam');
    div.appendChild(toggle);
    
    // Preview placeholder
    const preview = document.createElement('div');
    preview.className = 'v2-webcam-preview';
    preview.innerHTML = '<div style="font-size:48px;opacity:0.3;">📷</div><div>Webcam preview (when enabled)</div>';
    div.appendChild(preview);
    
    // Uniform info
    const uniforms = document.createElement('div');
    uniforms.className = 'v2-uniform-info';
    uniforms.innerHTML = `
        <div class="v2-uniform-title">Shader Uniforms</div>
        <div class="v2-uniform-row"><code>iChannel${element.channel}</code> — Webcam texture (RGBA)</div>
        <div class="v2-uniform-row"><code>iChannelResolution[${element.channel}]</code> — Video resolution</div>
    `;
    div.appendChild(uniforms);
    
    return div;
}

/**
 * Microphone input content
 */
function createMicInputContent(element) {
    const div = document.createElement('div');
    div.className = 'v2-mic-input';
    
    // Enable toggle
    const toggle = createInputToggle(element, 'Enable Microphone');
    div.appendChild(toggle);
    
    // Level meter placeholder
    const meter = document.createElement('div');
    meter.className = 'v2-audio-meter';
    meter.innerHTML = '<div class="v2-meter-fill"></div>';
    div.appendChild(meter);
    
    // Uniform info
    const uniforms = document.createElement('div');
    uniforms.className = 'v2-uniform-info';
    uniforms.innerHTML = `
        <div class="v2-uniform-title">Shader Uniforms</div>
        <div class="v2-uniform-row"><code>iChannel${element.channel}</code> — Audio FFT texture (512×2)</div>
        <div class="v2-uniform-row">Row 0 — Frequency spectrum</div>
        <div class="v2-uniform-row">Row 1 — Waveform</div>
    `;
    div.appendChild(uniforms);
    
    // Example code
    const example = document.createElement('pre');
    example.className = 'v2-code-example';
    example.textContent = `// Get bass frequency
float bass = texture(iChannel${element.channel}, vec2(0.1, 0.25)).r;

// Get waveform at center
float wave = texture(iChannel${element.channel}, vec2(0.5, 0.75)).r;`;
    div.appendChild(example);
    
    return div;
}

/**
 * Create enable/disable toggle for inputs
 */
function createInputToggle(element, label) {
    const container = document.createElement('div');
    container.className = 'v2-input-toggle';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = element.active || false;
    checkbox.id = `toggle-${element.id}`;
    checkbox.addEventListener('change', () => {
        element.active = checkbox.checked;
        const eventName = checkbox.checked ? 
            `INPUT_${element.type.toUpperCase()}_ENABLED` :
            `INPUT_${element.type.toUpperCase()}_DISABLED`;
        if (EVENTS[eventName]) {
            events.emit(EVENTS[eventName], { element });
        }
    });
    container.appendChild(checkbox);
    
    const labelEl = document.createElement('label');
    labelEl.htmlFor = checkbox.id;
    labelEl.textContent = label;
    container.appendChild(labelEl);
    
    return container;
}
