// ============================================================================
// Cubemap Selector - UI for cubemap (skybox) channel tabs
// ============================================================================

import * as channels from '../channels.js';
import * as cubemapInput from '../cubemap-input.js';
import * as mediaLoader from '../media-loader.js';
import { state } from '../core.js';

/**
 * Create cubemap selector UI
 * @param {string} tabName - Tab name (e.g., 'cubemap_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {Promise<HTMLElement>} Cubemap selector container
 */
export async function createCubemapSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'cubemap-selector';
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
    title.innerHTML = `<span style="font-size: 24px;">🌐</span> Cubemap (Skybox)`;
    
    // Active indicator
    if (channel?.texture) {
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
    
    // Cubemap preview (thumbnail)
    const previewDiv = document.createElement('div');
    previewDiv.style.cssText = `
        width: 128px;
        height: 128px;
        margin: 0 auto;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid var(--border-color);
        background: var(--bg-secondary);
    `;
    
    const previewImg = document.createElement('img');
    previewImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
    
    // Get current cubemap info
    const mediaInfo = channel?.mediaId ? mediaLoader.getMediaInfo(channel.mediaId) : null;
    if (mediaInfo?.thumb) {
        previewImg.src = mediaInfo.thumb;
        previewImg.alt = mediaInfo.name || 'Cubemap';
    } else {
        previewImg.src = '';
        previewImg.alt = 'No cubemap selected';
        previewDiv.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;">🌐</div>';
    }
    
    if (mediaInfo?.thumb) {
        previewDiv.innerHTML = '';
        previewDiv.appendChild(previewImg);
    }
    contentSection.appendChild(previewDiv);
    
    // Cubemap selection dropdown
    const selectSection = document.createElement('div');
    selectSection.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
    `;
    
    const selectLabel = document.createElement('div');
    selectLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;';
    selectLabel.textContent = 'Select Cubemap:';
    selectSection.appendChild(selectLabel);
    
    const cubemapSelect = document.createElement('select');
    cubemapSelect.style.cssText = `
        width: 100%;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 12px;
    `;
    
    // Load available cubemaps from catalog
    const catalog = mediaLoader.getCatalog();
    const availableCubemaps = catalog?.cubemaps || [];
    
    // Add placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = '-- Select a cubemap --';
    cubemapSelect.appendChild(placeholderOption);
    
    availableCubemaps.forEach(cm => {
        const option = document.createElement('option');
        option.value = cm.id;
        option.textContent = `${cm.name} (${cm.size}×${cm.size})`;
        option.selected = channel?.mediaId === cm.id;
        cubemapSelect.appendChild(option);
    });
    
    cubemapSelect.addEventListener('change', async () => {
        const selectedId = cubemapSelect.value;
        if (selectedId) {
            await changeCubemap(channelNumber, selectedId);
            
            // Update preview
            const newMediaInfo = mediaLoader.getMediaInfo(selectedId);
            if (newMediaInfo?.thumb) {
                previewDiv.innerHTML = '';
                const newImg = document.createElement('img');
                newImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                newImg.src = newMediaInfo.thumb;
                newImg.alt = newMediaInfo.name;
                previewDiv.appendChild(newImg);
            }
        }
    });
    
    selectSection.appendChild(cubemapSelect);
    contentSection.appendChild(selectSection);
    
    // Info section
    const infoSection = document.createElement('div');
    infoSection.style.cssText = `
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
        font-size: 11px;
        color: var(--text-secondary);
    `;
    
    if (channel?.mediaId && mediaInfo) {
        infoSection.innerHTML = `
            <div style="margin-bottom: 4px;"><strong>ID:</strong> ${channel.mediaId}</div>
            <div style="margin-bottom: 4px;"><strong>Size:</strong> ${mediaInfo.size}×${mediaInfo.size} per face</div>
            <div><strong>Faces:</strong> 6 (px, nx, py, ny, pz, nz)</div>
        `;
    } else {
        infoSection.textContent = 'No cubemap loaded';
    }
    contentSection.appendChild(infoSection);
    
    // Usage hint
    const usageHint = document.createElement('div');
    usageHint.style.cssText = `
        padding: 12px;
        background: rgba(100, 200, 255, 0.1);
        border: 1px solid rgba(100, 200, 255, 0.3);
        border-radius: 4px;
        font-size: 11px;
        color: var(--text-secondary);
    `;
    usageHint.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 6px; color: var(--text-primary);">GLSL Usage:</div>
        <code style="font-family: monospace; font-size: 10px;">
            uniform samplerCube iChannel${channelNumber};<br>
            vec3 color = texture(iChannel${channelNumber}, direction).rgb;
        </code>
    `;
    contentSection.appendChild(usageHint);
    
    container.appendChild(contentSection);
    
    return container;
}

/**
 * Change the cubemap for a channel
 * @param {number} channelNumber - Channel number
 * @param {string} cubemapId - New cubemap ID
 */
async function changeCubemap(channelNumber, cubemapId) {
    const channel = channels.getChannel(channelNumber);
    if (!channel || channel.type !== 'cubemap') {
        console.error('Cannot change cubemap: invalid channel');
        return;
    }
    
    const gl = state.glContext;
    if (!gl) {
        console.error('WebGL context not available');
        return;
    }
    
    // Cleanup old texture
    if (channel.texture) {
        cubemapInput.cleanupCubemap(gl, channel.texture);
    }
    
    // Load new cubemap
    try {
        const result = await cubemapInput.loadCubemapTexture(gl, cubemapId);
        channel.texture = result.texture;
        channel.resolution = { width: result.size, height: result.size };
        channel.mediaId = cubemapId;
        
        console.log(`✓ Cubemap changed: ch${channelNumber} → ${cubemapId}`);
    } catch (error) {
        console.error('Failed to change cubemap:', error);
    }
}

