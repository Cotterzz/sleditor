/**
 * Inputs Panel - Mouse, Keyboard, Webcam, Mic, Gamepad, MIDI
 * 
 * Tabbed window for input device configuration.
 * Each tab shows settings for that input type.
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state } from '../../core/state.js';

// Input tab definitions
const INPUT_TABS = [
    { id: 'mouse', label: 'Mouse', icon: '🖱️', enabled: true, default: true },
    { id: 'keyboard', label: 'Keyboard', icon: '⌨️', enabled: true, default: false },
    { id: 'webcam', label: 'Webcam', icon: '📷', enabled: true, default: false },
    { id: 'mic', label: 'Mic', icon: '🎤', enabled: true, default: false },
    { id: 'gamepad', label: 'Gamepad', icon: '🎮', enabled: false, default: false },  // Not implemented
    { id: 'midi', label: 'MIDI', icon: '🎹', enabled: false, default: false }         // Not implemented
];

// Input state
const inputState = {
    mouse: { active: true },
    keyboard: { active: false },
    webcam: { active: false, stream: null },
    mic: { active: false, stream: null },
    gamepad: { active: false },
    midi: { active: false }
};

/**
 * Create content for Mouse tab
 */
function createMouseContent() {
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;
    
    // Status
    const status = createStatusSection('Mouse Input', true, 'Always active');
    content.appendChild(status);
    
    // Uniform info
    const uniformInfo = createUniformInfoSection([
        { name: 'iMouse.xy', desc: 'Current position (pixels)' },
        { name: 'iMouse.zw', desc: 'Click position (pixels)' },
        { name: 'iMouse.z', desc: '> 0 when button pressed' }
    ]);
    content.appendChild(uniformInfo);
    
    // Usage example
    const example = createCodeExample(`// Check if mouse is pressed
if (iMouse.z > 0.0) {
    vec2 clickPos = iMouse.zw;
}

// Get normalized mouse position
vec2 uv = iMouse.xy / iResolution.xy;`);
    content.appendChild(example);
    
    return content;
}

/**
 * Create content for Keyboard tab
 */
function createKeyboardContent() {
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;
    
    // Enable toggle
    const toggle = createEnableToggle('keyboard', 'Enable Keyboard Input', inputState.keyboard.active);
    content.appendChild(toggle);
    
    // Uniform info
    const uniformInfo = createUniformInfoSection([
        { name: 'iKeyboard', desc: '256×3 texture (R8)' },
        { name: 'Row 0 (y=0.5)', desc: 'Key pressed this frame' },
        { name: 'Row 1 (y=1.5)', desc: 'Key held down' },
        { name: 'Row 2 (y=2.5)', desc: 'Key toggled' }
    ]);
    content.appendChild(uniformInfo);
    
    // Usage example
    const example = createCodeExample(`// Check if Space is held
float space = texelFetch(iKeyboard, ivec2(32, 1), 0).r;

// Check if 'A' was just pressed
float a_pressed = texelFetch(iKeyboard, ivec2(65, 0), 0).r;`);
    content.appendChild(example);
    
    // Key code reference (collapsed by default)
    const keyRef = createCollapsibleSection('Key Codes', `
Common keys:
- Space: 32
- A-Z: 65-90
- 0-9: 48-57
- Arrow keys: 37-40 (←↑→↓)
- Enter: 13, Escape: 27
    `);
    content.appendChild(keyRef);
    
    return content;
}

/**
 * Create content for Webcam tab
 */
function createWebcamContent() {
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;
    
    // Enable toggle
    const toggle = createEnableToggle('webcam', 'Enable Webcam', inputState.webcam.active, async (enabled) => {
        if (enabled) {
            try {
                inputState.webcam.stream = await navigator.mediaDevices.getUserMedia({ video: true });
                inputState.webcam.active = true;
                logger.success('Inputs', 'Webcam', 'Webcam enabled');
                events.emit(EVENTS.INPUT_WEBCAM_ENABLED, { stream: inputState.webcam.stream });
            } catch (e) {
                logger.error('Inputs', 'Webcam', 'Failed to access webcam: ' + e.message);
                inputState.webcam.active = false;
            }
        } else {
            if (inputState.webcam.stream) {
                inputState.webcam.stream.getTracks().forEach(t => t.stop());
                inputState.webcam.stream = null;
            }
            inputState.webcam.active = false;
            events.emit(EVENTS.INPUT_WEBCAM_DISABLED);
        }
    });
    content.appendChild(toggle);
    
    // Preview placeholder
    const preview = document.createElement('div');
    preview.style.cssText = `
        aspect-ratio: 16/9;
        background: var(--bg-tertiary, #21262d);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted, #6e7681);
        font-size: 12px;
    `;
    preview.textContent = 'Webcam preview (when enabled)';
    content.appendChild(preview);
    
    // Uniform info
    const uniformInfo = createUniformInfoSection([
        { name: 'iChannelX', desc: 'Webcam texture (assigned channel)' }
    ]);
    content.appendChild(uniformInfo);
    
    return content;
}

/**
 * Create content for Mic tab
 */
function createMicContent() {
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;
    
    // Enable toggle
    const toggle = createEnableToggle('mic', 'Enable Microphone', inputState.mic.active, async (enabled) => {
        if (enabled) {
            try {
                inputState.mic.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                inputState.mic.active = true;
                logger.success('Inputs', 'Mic', 'Microphone enabled');
                events.emit(EVENTS.INPUT_MIC_ENABLED, { stream: inputState.mic.stream });
            } catch (e) {
                logger.error('Inputs', 'Mic', 'Failed to access microphone: ' + e.message);
                inputState.mic.active = false;
            }
        } else {
            if (inputState.mic.stream) {
                inputState.mic.stream.getTracks().forEach(t => t.stop());
                inputState.mic.stream = null;
            }
            inputState.mic.active = false;
            events.emit(EVENTS.INPUT_MIC_DISABLED);
        }
    });
    content.appendChild(toggle);
    
    // Level meter placeholder
    const meter = document.createElement('div');
    meter.style.cssText = `
        height: 24px;
        background: var(--bg-tertiary, #21262d);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
    `;
    const meterFill = document.createElement('div');
    meterFill.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #3fb950, #f0883e, #f85149);
        transition: width 0.1s;
    `;
    meter.appendChild(meterFill);
    content.appendChild(meter);
    
    // Uniform info
    const uniformInfo = createUniformInfoSection([
        { name: 'iChannelX', desc: 'Audio FFT texture (512×2)' },
        { name: 'Row 0', desc: 'Frequency spectrum' },
        { name: 'Row 1', desc: 'Waveform' }
    ]);
    content.appendChild(uniformInfo);
    
    return content;
}

/**
 * Create content for Gamepad tab (not implemented)
 */
function createGamepadContent() {
    return createNotImplementedContent('Gamepad', [
        'Button and axis input via Gamepad API',
        'Available as uniforms or texture',
        'Coming in a future update'
    ]);
}

/**
 * Create content for MIDI tab (not implemented)
 */
function createMidiContent() {
    return createNotImplementedContent('MIDI', [
        'MIDI controller input via Web MIDI API',
        'Note on/off, CC, pitch bend',
        'Coming in a future update'
    ]);
}

/**
 * Create a not-implemented placeholder
 */
function createNotImplementedContent(name, features) {
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: center;
        justify-content: center;
        text-align: center;
        height: 100%;
    `;
    
    content.innerHTML = `
        <div style="font-size: 48px; opacity: 0.3;">🚧</div>
        <div style="font-size: 14px; font-weight: 500; color: var(--text-primary, #c9d1d9);">
            ${name} Input
        </div>
        <div style="font-size: 12px; color: var(--text-muted, #6e7681); max-width: 300px;">
            ${features.map(f => `<div style="margin: 4px 0;">• ${f}</div>`).join('')}
        </div>
    `;
    
    return content;
}

// ============================================================================
// UI Helpers
// ============================================================================

function createStatusSection(title, active, subtitle) {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-secondary, #161b22);
        border-radius: 6px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    const indicator = document.createElement('div');
    indicator.style.cssText = `
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${active ? '#3fb950' : '#6e7681'};
        box-shadow: ${active ? '0 0 8px #3fb950' : 'none'};
    `;
    section.appendChild(indicator);
    
    const text = document.createElement('div');
    text.innerHTML = `
        <div style="font-size: 13px; font-weight: 500; color: var(--text-primary, #c9d1d9);">${title}</div>
        <div style="font-size: 11px; color: var(--text-muted, #6e7681);">${subtitle}</div>
    `;
    section.appendChild(text);
    
    return section;
}

function createEnableToggle(inputId, label, initialState, onChange) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-secondary, #161b22);
        border-radius: 6px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = initialState;
    toggle.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
    toggle.addEventListener('change', () => {
        inputState[inputId].active = toggle.checked;
        if (onChange) onChange(toggle.checked);
    });
    container.appendChild(toggle);
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 13px; color: var(--text-primary, #c9d1d9); cursor: pointer;';
    labelEl.addEventListener('click', () => toggle.click());
    container.appendChild(labelEl);
    
    return container;
}

function createUniformInfoSection(uniforms) {
    const section = document.createElement('div');
    section.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary, #161b22);
        border-radius: 6px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Shader Uniforms';
    title.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-muted, #6e7681); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;';
    section.appendChild(title);
    
    uniforms.forEach(u => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; margin: 4px 0; font-size: 12px;';
        row.innerHTML = `
            <code style="color: var(--console-info, #58a6ff); font-family: 'JetBrains Mono', monospace;">${u.name}</code>
            <span style="color: var(--text-muted, #6e7681);">—</span>
            <span style="color: var(--text-secondary, #8b949e);">${u.desc}</span>
        `;
        section.appendChild(row);
    });
    
    return section;
}

function createCodeExample(code) {
    const section = document.createElement('div');
    section.style.cssText = `
        padding: 12px;
        background: var(--bg-tertiary, #21262d);
        border-radius: 6px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        color: var(--text-secondary, #8b949e);
        white-space: pre;
        overflow-x: auto;
    `;
    section.textContent = code;
    return section;
}

function createCollapsibleSection(title, content) {
    const section = document.createElement('details');
    section.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary, #161b22);
        border-radius: 6px;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    const summary = document.createElement('summary');
    summary.textContent = title;
    summary.style.cssText = 'font-size: 12px; cursor: pointer; color: var(--text-primary, #c9d1d9);';
    section.appendChild(summary);
    
    const body = document.createElement('pre');
    body.textContent = content.trim();
    body.style.cssText = `
        margin-top: 8px;
        font-size: 11px;
        color: var(--text-muted, #6e7681);
        white-space: pre-wrap;
    `;
    section.appendChild(body);
    
    return section;
}

/**
 * Create tab content
 */
function createTabContent(tabId) {
    switch (tabId) {
        case 'mouse': return createMouseContent();
        case 'keyboard': return createKeyboardContent();
        case 'webcam': return createWebcamContent();
        case 'mic': return createMicContent();
        case 'gamepad': return createGamepadContent();
        case 'midi': return createMidiContent();
        default: return document.createElement('div');
    }
}

/**
 * Register the Inputs panel
 */
export function register(SLUI) {
    SLUI.registerPanel({
        id: 'inputs',
        title: 'Inputs',
        icon: '🕹️',
        tabbed: true,
        tabGroup: 'inputs',
        tabs: () => INPUT_TABS.map(tab => ({
            id: tab.id,
            label: tab.label,
            icon: tab.icon,
            closable: false,
            content: () => createTabContent(tab.id)
        })),
        activeTab: 'mouse'
    });
    
    logger.info('Inputs', 'Init', 'Inputs panel registered');
}
