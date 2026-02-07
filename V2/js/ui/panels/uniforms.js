/**
 * Uniforms Panel - Auto-generated UI for custom shader uniforms
 * 
 * Can be used as:
 * 1. Standalone SLUI panel (registerUniformsPanel)
 * 2. Embedded section in shader-controls (createUniformsSection)
 * 
 * Uses SLUI components:
 * - UniformSlider for float/int
 * - ColorUniform for color uniforms
 * - VectorSliderStack for non-color vec2/vec3/vec4
 * - SlideToggle for booleans
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { uniformManager } from '../../managers/UniformManager.js';

// Store references
let panelContainer = null;
let embeddedContainer = null;
let SLUI = null;

/**
 * Check if a uniform name indicates a color
 */
function isColorUniform(name, type) {
    if (type !== 'vec3' && type !== 'vec4') return false;
    const lowerName = name.toLowerCase();
    return lowerName.includes('col') || 
           lowerName.includes('tint') || 
           lowerName.includes('albedo') ||
           lowerName.includes('diffuse');
}

/**
 * Get component count from type
 */
function getComponentCount(type) {
    const match = type.match(/vec(\d)/);
    return match ? parseInt(match[1], 10) : 1;
}

/**
 * Update uniform controls content
 * @param {HTMLElement} container - Container to update
 * @param {Array} uniforms - Array of uniform definitions
 * @param {boolean} isCompact - Whether to use compact layout (for embedded)
 */
function updateUniformControls(container, uniforms, isCompact = false) {
    if (!container || !SLUI) return;
    
    // Clear existing controls
    container.innerHTML = '';
    
    logger.debug('UI', 'Uniforms', `Updating with ${uniforms.length} uniforms (compact: ${isCompact})`);
    
    // Title header
    if(!isCompact){
    const header = document.createElement('div');
    header.className = 'v2-uniforms-header';
    header.style.cssText = `
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-muted, #8b949e);
        padding: 6px 4px 4px;
        margin-bottom: 6px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    header.textContent = 'Custom Uniforms';
    container.appendChild(header);
    }
    if (uniforms.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'v2-uniforms-empty';
        empty.style.cssText = `
            padding: 12px 8px;
            color: var(--text-muted, #666);
            font-size: 11px;
            line-height: 1.6;
        `;
        empty.innerHTML = `
            <div style="margin-bottom: 10px;">Add custom uniforms to your shader to adjust them here</div>
            <div style="font-size: 10px; opacity: 0.8; font-family: var(--font-code, monospace); user-select: text; cursor: text;">
                <div style="margin: 3px 0;"><code style="user-select: text;">uniform float uSpeed;</code></div>
                <div style="margin: 3px 0;"><code style="user-select: text;">uniform int uSteps;</code></div>
                <div style="margin: 3px 0;"><code style="user-select: text;">uniform bool uEnabled;</code></div>
                <div style="margin: 3px 0;"><code style="user-select: text;">uniform vec2 uOffset;</code></div>
                <div style="margin: 3px 0;"><code style="user-select: text;">uniform vec3 uColor;</code> <span style="opacity:0.6">// detected as color</span></div>
                <div style="margin: 3px 0;"><code style="user-select: text;">uniform vec4 uTint;</code> <span style="opacity:0.6">// detected as color</span></div>
            </div>
        `;
        container.appendChild(empty);
        return;
    }
    
    // Categorize uniforms
    const floatUniforms = [];
    const colorUniforms = [];
    const boolUniforms = [];
    const vectorUniforms = [];
    
    for (const uniform of uniforms) {
        if (uniform.type === 'float' || uniform.type === 'int') {
            floatUniforms.push(uniform);
        } else if (isColorUniform(uniform.name, uniform.type) || uniform.isColor) {
            colorUniforms.push({ ...uniform, hasAlpha: uniform.type === 'vec4' });
        } else if (uniform.type === 'bool') {
            boolUniforms.push(uniform);
        } else if (uniform.type.startsWith('vec') || uniform.type.startsWith('ivec')) {
            vectorUniforms.push({ ...uniform, components: getComponentCount(uniform.type) });
        }
    }
    
    // Content wrapper
    const content = document.createElement('div');
    content.className = 'v2-uniforms-content';
    content.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: ${isCompact ? '4px' : '8px'};
        padding-top: 4px;
    `;
    
    // Float/Int sliders - wrapped with consistent styling
    for (const u of floatUniforms) {
        const wrapper = document.createElement('div');
        wrapper.className = 'sl-uniform-slider-wrapped';
        
        const slider = SLUI.UniformSlider({
            name: u.name,
            value: uniformManager.get(u.name) ?? u.default ?? 0.5,
            min: u.min ?? 0,
            max: u.max ?? 1,
            step: u.step ?? (u.type === 'int' ? 1 : 0.01),
            isInt: u.type === 'int',
            editable: false,
            showRemove: false,
            onChange: (value) => {
                uniformManager.set(u.name, value);
            }
        });
        wrapper.appendChild(slider);
        content.appendChild(wrapper);
    }
    
    // Vector controls (non-color vec2/3/4)
    for (const u of vectorUniforms) {
        const currentValue = uniformManager.get(u.name) || u.default || Array(u.components).fill(0.5);
        
        const vectorStack = SLUI.VectorSliderStack({
            name: u.name,
            components: u.components,
            values: currentValue,
            min: u.min ?? 0,
            max: u.max ?? 1,
            step: u.step ?? 0.01,
            isInt: u.type.startsWith('ivec'),
            onChange: (values) => {
                uniformManager.set(u.name, values);
            }
        });
        
        // Reduce padding for compact mode
        if (isCompact) {
            vectorStack.style.marginBottom = '0';
        }
        
        content.appendChild(vectorStack);
    }
    
    // Colors - horizontal flow with inline SL-OS toggle
    if (colorUniforms.length > 0) {
        const colorRow = document.createElement('div');
        colorRow.className = 'v2-uniforms-color-row';
        colorRow.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
        `;
        
        const colorElements = [];
        let isNativeMode = false;
        
        // Colors first
        for (const u of colorUniforms) {
            const val = uniformManager.get(u.name) || u.default || [0.5, 0.5, 0.5, 1.0];
            
            const colorWrapper = document.createElement('div');
            colorWrapper.className = 'v2-uniform-color-item';
            colorWrapper.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
            `;
            
            const colorUniform = SLUI.ColorUniform({
                name: u.name,
                r: val[0] ?? 0.5,
                g: val[1] ?? 0.5,
                b: val[2] ?? 0.5,
                a: val[3] ?? 1.0,
                hasAlpha: u.hasAlpha,
                editable: false,
                useNative: isNativeMode,
                showHex: false,  // Hide hex value
                compact: true,   // Compact mode
                onChange: (color) => {
                    if (u.hasAlpha) {
                        uniformManager.set(u.name, [color.r, color.g, color.b, color.a]);
                    } else {
                        uniformManager.set(u.name, [color.r, color.g, color.b]);
                    }
                }
            });
            
            colorElements.push(colorUniform);
            colorWrapper.appendChild(colorUniform);
            colorRow.appendChild(colorWrapper);
        }
        
        // SL-OS toggle at end of row
        const modeToggle = SLUI.SlideToggle({
            labelLeft: 'SL',
            labelRight: 'OS',
            value: false,
            size: 'small',
            onChange: (useOS) => {
                isNativeMode = useOS;
                colorElements.forEach(el => {
                    if (el.setNativeMode) el.setNativeMode(useOS);
                });
            }
        });
        modeToggle.style.marginLeft = 'auto';
        modeToggle.title = "Toggle between Sleditor's color picker and your platform's native color picker";
        colorRow.appendChild(modeToggle);
        
        content.appendChild(colorRow);
    }
    
    // Booleans - horizontal flow, simplified (grey out name when off)
    if (boolUniforms.length > 0) {
        const boolRow = document.createElement('div');
        boolRow.className = 'v2-uniforms-bool-row';
        boolRow.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 4px 0;
        `;
        
        for (const u of boolUniforms) {
            const initialValue = uniformManager.get(u.name) ?? u.default ?? false;
            
            const item = document.createElement('div');
            item.className = 'v2-uniform-bool-item';
            item.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                background: var(--bg-secondary, #21262d);
                border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-radius: var(--border-radius, 4px);
            `;
            
            const toggle = SLUI.SlideToggle({
                value: initialValue,
                size: 'small',
                labelLeft: '',   // No labels
                labelRight: '',  // No labels
                onChange: (val) => {
                    uniformManager.set(u.name, val);
                    // Grey out label when off
                    label.style.opacity = val ? '1' : '0.4';
                }
            });
            
            const label = document.createElement('span');
            label.textContent = u.name;
            label.style.cssText = `
                font-size: 0.75rem;
                font-family: var(--font-code, monospace);
                color: var(--text-primary, #c9d1d9);
                opacity: ${initialValue ? '1' : '0.4'};
                transition: opacity 0.15s;
            `;
            
            item.appendChild(toggle);
            item.appendChild(label);
            boolRow.appendChild(item);
        }
        
        content.appendChild(boolRow);
    }
    
    container.appendChild(content);
}

/**
 * Create panel content (for standalone SLUI panel)
 */
function createPanelContent() {
    const container = document.createElement('div');
    container.className = 'v2-uniforms-panel';
    container.style.cssText = `
        padding: 10px;
        height: 100%;
        overflow-y: auto;
        background: var(--bg-panel, #161b22);
    `;
    
    panelContainer = container;
    
    // Show current uniforms
    const uniforms = uniformManager.getDetectedUniforms();
    updateUniformControls(container, uniforms, false);
    
    return container;
}

/**
 * Create embeddable uniforms section (for shader-controls)
 * Returns an object with the element and control methods
 * Note: Scrolling is handled by the parent container (v2-shader-controls-uniforms-content)
 */
export function createUniformsSection() {
    const container = document.createElement('div');
    container.className = 'v2-uniforms-section-embedded';
    container.style.cssText = `
        padding: 0 8px 8px;
    `;
    
    embeddedContainer = container;
    
    // Show current uniforms in compact mode
    const uniforms = uniformManager.getDetectedUniforms();
    updateUniformControls(container, uniforms, true);
    
    return {
        element: container,
        refresh: () => {
            const uniforms = uniformManager.getDetectedUniforms();
            updateUniformControls(container, uniforms, true);
        }
    };
}

/**
 * Register the uniforms panel with SLUI
 */
export function registerUniformsPanel(sluiRef) {
    SLUI = sluiRef;
    
    SLUI.registerPanel({
        id: 'uniforms',
        icon: '🎛️',
        title: 'Uniforms',
        showInToolbar: true,
        createContent: createPanelContent
    });
    
    // Listen for uniform detection to update both containers
    events.on(EVENTS.UNIFORMS_DETECTED, ({ uniforms }) => {
        if (panelContainer) {
            updateUniformControls(panelContainer, uniforms, false);
        }
        if (embeddedContainer) {
            updateUniformControls(embeddedContainer, uniforms, true);
        }
    });
    
    logger.debug('UI', 'Uniforms', 'Uniforms panel registered');
}

/**
 * Set SLUI reference (for when used without registering panel)
 */
export function setSLUI(sluiRef) {
    SLUI = sluiRef;
}

export default { registerUniformsPanel, createUniformsSection, setSLUI };
