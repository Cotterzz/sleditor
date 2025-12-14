// ============================================================================
// Keyboard Selector - UI for keyboard channel tabs
// ============================================================================

import * as channels from '../channels.js';
import { state } from '../core.js';

/**
 * Create keyboard selector UI
 * @param {string} tabName - Tab name (e.g., 'keyboard_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {Promise<HTMLElement>} Keyboard selector container
 */
export async function createKeyboardSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'keyboard-selector';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: auto;
    `;
    
    // Header section
    const headerSection = document.createElement('div');
    headerSection.style.cssText = `
        padding: 12px;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
        flex-shrink: 0;
    `;
    
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; font-weight: bold; color: var(--text-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;';
    title.innerHTML = `<span style="font-size: 24px;">⌨️</span> Keyboard Input`;
    
    // Active indicator
    const activeIndicator = document.createElement('span');
    activeIndicator.style.cssText = `
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #4CAF50;
        border-radius: 50%;
        animation: pulse 1.5s infinite;
    `;
    title.appendChild(activeIndicator);
    
    // Add pulse animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
    container.appendChild(style);
    
    headerSection.appendChild(title);
    container.appendChild(headerSection);
    
    // Main content
    const contentSection = document.createElement('div');
    contentSection.style.cssText = `
        padding: 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;
    
    // Large keyboard icon
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = 'font-size: 64px; text-align: center; margin-bottom: 8px;';
    iconDiv.textContent = '⌨️';
    contentSection.appendChild(iconDiv);
    
    // Recommendation message
    const recommendation = document.createElement('div');
    recommendation.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
        border-left: 3px solid var(--accent-color);
        font-size: 11px;
        color: var(--text-secondary);
        line-height: 1.6;
        margin-bottom: 8px;
    `;
    recommendation.innerHTML = `
        <div style="font-weight: bold; color: var(--text-primary); margin-bottom: 8px;">💡 Recommendation</div>
        <div>This keyboard texture buffer is for <strong>Shadertoy compatibility only</strong>.</div>
        <div style="margin-top: 8px;">For new projects, use a <strong>JS tab</strong> with the <code>api.keys</code> functions instead — no texture channel required!</div>
    `;
    contentSection.appendChild(recommendation);
    
    // JS API example (always show, as it's the recommended approach)
    const jsInfo = document.createElement('div');
    jsInfo.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
        font-size: 11px;
        color: var(--text-secondary);
        margin-bottom: 8px;
    `;
    jsInfo.innerHTML = `
        <div style="font-weight: bold; color: var(--text-primary); margin-bottom: 8px;">✨ Recommended: JS API</div>
        <div style="margin-bottom: 8px;">Add a JS tab and use:</div>
        <code style="font-size: 10px; display: block; background: var(--bg-primary); padding: 8px; border-radius: 2px; line-height: 1.8; font-family: monospace;">
api.keys.isDown("W")      // true while held<br>
api.keys.isDown(87)       // same, using keyCode<br>
api.keys.isHit("Space")   // true once on press<br>
api.keys.isToggled("T")   // alternates each press
        </code>
    `;
    contentSection.appendChild(jsInfo);
    
    // Shadertoy texture info
    const textureInfo = document.createElement('div');
    textureInfo.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
        font-size: 10px;
        color: var(--text-secondary);
        line-height: 1.5;
        opacity: 0.8;
    `;
    textureInfo.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 6px;">Shadertoy Texture Format (256×3)</div>
        <code style="font-size: 9px; background: var(--bg-primary); padding: 2px 4px; border-radius: 2px;">
            texture(iChannel${channelNumber}, vec2(keyCode/256., row/3.)).r
        </code>
        <div style="margin-top: 6px; font-size: 9px;">
            Row 0: down | Row 1: hit | Row 2: toggle<br>
            Keys: A-Z=65-90, 0-9=48-57, Space=32, Arrows=37-40
        </div>
    `;
    contentSection.appendChild(textureInfo);
    
    container.appendChild(contentSection);
    
    return container;
}
