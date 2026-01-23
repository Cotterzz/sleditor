/**
 * Uniforms Panel - Auto-generated UI for custom shader uniforms
 * 
 * Uses SLUI components:
 * - UniformSlider (editable: false) for float/int
 * - ColorUniform (with hasAlpha for vec4) for color uniforms
 * - VectorSliderStack for non-color vec2/vec3/vec4
 * - SlideToggle for booleans
 * 
 * Listens for UNIFORMS_DETECTED event and creates appropriate UI controls.
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { uniformManager } from '../../managers/UniformManager.js';

// Store references
let panelContainer = null;
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
 * Update panel content with detected uniforms
 */
function updatePanel(uniforms) {
    if (!panelContainer || !SLUI) return;
    
    // Clear existing controls
    panelContainer.innerHTML = '';
    
    logger.debug('UI', 'Uniforms', `Updating panel with ${uniforms.length} uniforms`);
    
    if (uniforms.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'v2-uniforms-empty';
        empty.style.cssText = `
            padding: 20px;
            text-align: center;
            color: var(--text-muted, #666);
            font-size: 12px;
            font-family: system-ui, sans-serif;
            line-height: 1.5;
        `;
        empty.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px; opacity: 0.5;">🎛️</div>
            <div style="font-weight: 500; margin-bottom: 8px;">No custom uniforms</div>
            <div style="font-size: 11px; opacity: 0.8;">
                Add uniforms to your shader:<br><br>
                <code style="background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px; font-size: 10px; display: inline-block; margin: 2px;">uniform float uSpeed;</code><br>
                <code style="background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px; font-size: 10px; display: inline-block; margin: 2px;">uniform vec3 uColor;</code><br>
                <code style="background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px; font-size: 10px; display: inline-block; margin: 2px;">uniform bool uEnabled;</code>
            </div>
        `;
        panelContainer.appendChild(empty);
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
    
    // Create Float/Int sliders using SLUI UniformSlider
    if (floatUniforms.length > 0) {
        const section = createSection('Floats');
        
        for (const u of floatUniforms) {
            const slider = SLUI.UniformSlider({
                name: u.name,
                value: uniformManager.get(u.name) ?? u.default ?? 0.5,
                min: u.min ?? 0,
                max: u.max ?? 1,
                step: u.step ?? (u.type === 'int' ? 1 : 0.01),
                isInt: u.type === 'int',
                editable: false,     // Name is not editable
                showRemove: false,   // No remove button
                onChange: (value) => {
                    uniformManager.set(u.name, value);
                }
            });
            section.appendChild(slider);
        }
        
        panelContainer.appendChild(section);
    }
    
    // Create Color pickers using SLUI ColorUniform
    if (colorUniforms.length > 0) {
        const section = createSection('Colors');
        
        // Global SL-OS toggle at top of colors section
        const colorHeader = document.createElement('div');
        colorHeader.className = 'v2-uniforms-color-header';
        colorHeader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-end;
            margin-bottom: 8px;
            padding: 0 4px;
        `;
        
        const colorElements = [];
        let isNativeMode = false;
        
        const modeToggle = SLUI.SlideToggle({
            labelLeft: 'SL',
            labelRight: 'OS',
            value: false,
            size: 'small',
            onChange: (useOS) => {
                isNativeMode = useOS;
                colorElements.forEach(el => el.setNativeMode(useOS));
            }
        });
        colorHeader.appendChild(modeToggle);
        section.appendChild(colorHeader);
        
        // Color uniform rows
        for (const u of colorUniforms) {
            const val = uniformManager.get(u.name) || u.default || [0.5, 0.5, 0.5, 1.0];
            
            const colorUniform = SLUI.ColorUniform({
                name: u.name,
                r: val[0] ?? 0.5,
                g: val[1] ?? 0.5,
                b: val[2] ?? 0.5,
                a: val[3] ?? 1.0,
                hasAlpha: u.hasAlpha,
                editable: false,
                useNative: isNativeMode,
                onChange: (color) => {
                    if (u.hasAlpha) {
                        uniformManager.set(u.name, [color.r, color.g, color.b, color.a]);
                    } else {
                        uniformManager.set(u.name, [color.r, color.g, color.b]);
                    }
                }
            });
            
            colorElements.push(colorUniform);
            section.appendChild(colorUniform);
        }
        
        panelContainer.appendChild(section);
    }
    
    // Create Bool toggles - flowing layout, 2+ per line
    if (boolUniforms.length > 0) {
        const section = createSection('Booleans');
        
        const boolContainer = document.createElement('div');
        boolContainer.className = 'v2-uniform-bool-container';
        boolContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        `;
        
        for (const u of boolUniforms) {
            const row = document.createElement('div');
            row.className = 'v2-uniform-bool-row';
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: var(--bg-secondary, #1a1a1a);
                border-radius: 4px;
                flex: 0 0 auto;
                min-width: 100px;
            `;
            
            const toggle = SLUI.SlideToggle({
                value: uniformManager.get(u.name) ?? u.default ?? false,
                size: 'small',
                onChange: (val) => {
                    uniformManager.set(u.name, val);
                }
            });
            
            const label = document.createElement('span');
            label.textContent = u.name;
            label.style.cssText = `
                font-size: 11px;
                font-family: var(--font-code, 'JetBrains Mono', monospace);
                color: var(--text-primary, #c9d1d9);
                white-space: nowrap;
            `;
            
            row.appendChild(toggle);
            row.appendChild(label);
            boolContainer.appendChild(row);
        }
        
        section.appendChild(boolContainer);
        panelContainer.appendChild(section);
    }
    
    // Create Vector controls (non-color vec2/3/4) using VectorSliderStack
    if (vectorUniforms.length > 0) {
        const section = createSection('Vectors');
        
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
            
            section.appendChild(vectorStack);
        }
        
        panelContainer.appendChild(section);
    }
    
    // Add reset button
    const resetBtn = SLUI.Button({
        label: 'Reset to Defaults',
        variant: 'default',
        className: 'sl-fullwidth',
        onClick: () => {
            uniformManager.resetToDefaults();
            // Re-render with current uniforms
            updatePanel(uniformManager.getDetectedUniforms());
        }
    });
    resetBtn.style.marginTop = '12px';
    panelContainer.appendChild(resetBtn);
}

/**
 * Create a collapsible section
 */
function createSection(title) {
    const section = document.createElement('div');
    section.className = 'v2-uniforms-section';
    section.style.cssText = `
        margin-bottom: 12px;
    `;
    
    const header = document.createElement('div');
    header.className = 'v2-uniforms-section-header';
    header.textContent = title;
    header.style.cssText = `
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-muted, #8b949e);
        padding: 4px 0;
        margin-bottom: 6px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    section.appendChild(header);
    return section;
}

/**
 * Create panel content
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
    
    // Show current uniforms (or empty state)
    const uniforms = uniformManager.getDetectedUniforms();
    logger.debug('UI', 'Uniforms', `Creating panel content, ${uniforms.length} uniforms detected`);
    updatePanel(uniforms);
    
    return container;
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
    
    // Listen for uniform detection to update panel
    events.on(EVENTS.UNIFORMS_DETECTED, ({ uniforms }) => {
        updatePanel(uniforms);
    });
    
    logger.debug('UI', 'Uniforms', 'Uniforms panel registered');
}

export default { registerUniformsPanel };
