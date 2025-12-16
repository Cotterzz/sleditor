// ============================================================================
// Volume Selector - UI for volume (3D texture) channel tabs
// ============================================================================

import * as channels from '../channels.js';
import * as volumeInput from '../volume-input.js';
import { state } from '../core.js';

/**
 * Create volume selector UI
 * @param {string} tabName - Tab name (e.g., 'volume_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {Promise<HTMLElement>} Volume selector container
 */
export async function createVolumeSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'volume-selector';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: auto;
    `;
    
    const channel = channels.getChannel(channelNumber);
    
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
    title.innerHTML = `<span style="font-size: 24px;">🧊</span> Volume Texture (3D)`;
    
    // Active indicator
    if (channel?.volumeData?.active) {
        const activeIndicator = document.createElement('span');
        activeIndicator.style.cssText = `
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #4CAF50;
            border-radius: 50%;
        `;
        title.appendChild(activeIndicator);
    }
    
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
    
    // Volume icon
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = 'font-size: 64px; text-align: center; margin-bottom: 8px;';
    iconDiv.textContent = '🧊';
    contentSection.appendChild(iconDiv);
    
    // Volume selection dropdown
    const selectSection = document.createElement('div');
    selectSection.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
    `;
    
    const selectLabel = document.createElement('div');
    selectLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;';
    selectLabel.textContent = 'Select Volume Texture:';
    selectSection.appendChild(selectLabel);
    
    const volumeSelect = document.createElement('select');
    volumeSelect.style.cssText = `
        width: 100%;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 12px;
    `;
    
    // Load available volumes from catalog (async)
    const availableVolumes = await volumeInput.getAvailableVolumes();
    availableVolumes.forEach(vol => {
        const option = document.createElement('option');
        option.value = vol.id;
        // Format size: cubic shows as N³, non-cubic shows as W×H×D
        const sizeStr = (vol.width === vol.height && vol.height === vol.depth)
            ? `${vol.width}³`
            : `${vol.width}×${vol.height}×${vol.depth}`;
        option.textContent = `${vol.name} (${sizeStr}, ${vol.channels}ch)`;
        if (channel?.volumeData?.volumeId === vol.id) {
            option.selected = true;
        }
        volumeSelect.appendChild(option);
    });
    
    volumeSelect.addEventListener('change', async () => {
        const volumeId = volumeSelect.value;
        await channels.changeVolumeTexture(channelNumber, volumeId);
        updateInfo();
    });
    
    selectSection.appendChild(volumeSelect);
    
    // Wrap mode selector
    const wrapLabel = document.createElement('div');
    wrapLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-top: 12px; margin-bottom: 8px;';
    wrapLabel.textContent = 'Wrap Mode:';
    selectSection.appendChild(wrapLabel);
    
    const wrapSelect = document.createElement('select');
    wrapSelect.style.cssText = `
        width: 100%;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 12px;
    `;
    
    ['clamp', 'repeat', 'mirror'].forEach(mode => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        if ((channel?.volumeData?.wrap || 'clamp') === mode) {
            option.selected = true;
        }
        wrapSelect.appendChild(option);
    });
    
    wrapSelect.addEventListener('change', async () => {
        const wrap = wrapSelect.value;
        await channels.changeVolumeWrapMode(channelNumber, wrap);
    });
    
    selectSection.appendChild(wrapSelect);
    contentSection.appendChild(selectSection);
    
    // Current volume info
    const infoSection = document.createElement('div');
    infoSection.id = `volume_info_${channelNumber}`;
    infoSection.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
        font-size: 11px;
        color: var(--text-secondary);
    `;
    
    function updateInfo() {
        const ch = channels.getChannel(channelNumber);
        if (ch?.volumeData) {
            const vd = ch.volumeData;
            const sizeStr = (vd.width === vd.height && vd.height === vd.depth)
                ? `${vd.width}×${vd.width}×${vd.width}`
                : `${vd.width}×${vd.height}×${vd.depth}`;
            infoSection.innerHTML = `
                <div style="font-weight: bold; color: var(--text-primary); margin-bottom: 8px;">Current Volume</div>
                <div>Name: ${vd.info?.name || 'Unknown'}</div>
                <div>Size: ${sizeStr}</div>
                <div>Channels: ${vd.channels}</div>
            `;
        } else {
            infoSection.innerHTML = `
                <div style="color: var(--text-secondary);">No volume loaded</div>
            `;
        }
    }
    updateInfo();
    contentSection.appendChild(infoSection);
    
    // GLSL usage info
    const usageInfo = document.createElement('div');
    usageInfo.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
        font-size: 10px;
        color: var(--text-secondary);
        line-height: 1.6;
    `;
    usageInfo.innerHTML = `
        <div style="font-weight: bold; color: var(--text-primary); margin-bottom: 8px;">GLSL Usage</div>
        <code style="font-size: 10px; display: block; background: var(--bg-primary); padding: 8px; border-radius: 2px; font-family: monospace; line-height: 1.8;">
// Sample 3D texture with xyz coordinates (0-1)<br>
vec4 sample = texture(iChannel${channelNumber}, vec3(uv, z));<br>
<br>
// For grey noise (R8), use .r channel<br>
float noise = texture(iChannel${channelNumber}, pos).r;
        </code>
    `;
    contentSection.appendChild(usageInfo);
    
    container.appendChild(contentSection);
    
    return container;
}

