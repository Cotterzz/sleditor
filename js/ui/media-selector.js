// ============================================================================
// Media Selector - UI for selecting media in channel tabs
// ============================================================================

import * as mediaLoader from '../media-loader.js';
import * as channels from '../channels.js';
import { state } from '../core.js';

/**
 * Create media selector UI
 * @param {string} tabName - Tab name (e.g., 'image_ch1')
 * @param {string} channelType - 'image' or 'video'
 * @param {number} channelNumber - Channel number
 * @returns {HTMLElement} Media selector container
 */
export async function createMediaSelector(tabName, channelType, channelNumber) {
    const container = document.createElement('div');
    container.className = 'media-selector';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: hidden;
    `;
    
    // Load catalog
    const catalog = await mediaLoader.loadMediaCatalog();
    const items = channelType === 'image' ? catalog.images : catalog.videos;
    
    if (items.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 10px;">📂</div>
                <div>No ${channelType}s available</div>
                <div style="font-size: 11px; margin-top: 5px;">Add ${channelType} files to media/ folder</div>
            </div>
        `;
        return container;
    }
    
    // Get current selection
    const channel = channels.getChannel(channelNumber);
    const currentMediaId = channel?.mediaId;
    
    // Check catalog first, then external media
    let currentMedia = items.find(item => item.id === currentMediaId);
    if (!currentMedia && currentMediaId) {
        // Try to get from external media (URL imports)
        currentMedia = mediaLoader.getMediaInfo(currentMediaId);
    }
    
    // Preview section - horizontal layout with image on left, info on right
    const previewSection = document.createElement('div');
    previewSection.style.cssText = `
        padding: 12px;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
        flex-shrink: 0;
        display: flex;
        gap: 12px;
    `;
    
    if (currentMedia) {
        // Left side: Image preview
        const previewImg = document.createElement('img');
        previewImg.src = currentMedia.path;
        previewImg.alt = currentMedia.name;
        previewImg.style.cssText = `
            width: 150px;
            height: 150px;
            object-fit: contain;
            border-radius: 4px;
            background: var(--bg-tertiary);
            border: 2px solid var(--accent-color);
            flex-shrink: 0;
        `;
        previewSection.appendChild(previewImg);
        
        // Right side: Info and options (vertical layout)
        const infoColumn = document.createElement('div');
        infoColumn.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
            min-width: 0;
        `;
        
        // Title
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = 'font-size: 12px; font-weight: bold; color: var(--text-primary);';
        titleDiv.textContent = currentMedia.name;
        infoColumn.appendChild(titleDiv);
        
        // Resolution
        const resolutionDiv = document.createElement('div');
        resolutionDiv.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
        resolutionDiv.textContent = `${currentMedia.width}×${currentMedia.height}`;
        infoColumn.appendChild(resolutionDiv);
        
        // Texture options (vertical)
        const optionsDiv = document.createElement('div');
        optionsDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 11px;
            margin-top: 4px;
        `;
        
        // V-Flip checkbox
        const vflipLabel = document.createElement('label');
        vflipLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--text-primary);';
        const vflipCheckbox = document.createElement('input');
        vflipCheckbox.type = 'checkbox';
        vflipCheckbox.checked = channel?.vflip !== undefined ? channel.vflip : true;
        vflipCheckbox.onchange = () => {
            channels.updateTextureOptions(channelNumber, { vflip: vflipCheckbox.checked });
        };
        vflipLabel.appendChild(vflipCheckbox);
        vflipLabel.appendChild(document.createTextNode('V-Flip'));
        optionsDiv.appendChild(vflipLabel);
        
        // Wrap dropdown
        const wrapRow = document.createElement('div');
        wrapRow.style.cssText = 'display: flex; align-items: center; gap: 6px; color: var(--text-primary);';
        wrapRow.appendChild(document.createTextNode('Wrap:'));
        const wrapSelect = document.createElement('select');
        wrapSelect.style.cssText = 'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 2px 4px; border-radius: 2px; font-size: 11px; flex: 1;';
        ['repeat', 'clamp', 'mirror'].forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            option.selected = (channel?.wrap || 'repeat') === mode;
            wrapSelect.appendChild(option);
        });
        wrapSelect.onchange = () => {
            channels.updateTextureOptions(channelNumber, { wrap: wrapSelect.value });
        };
        wrapRow.appendChild(wrapSelect);
        optionsDiv.appendChild(wrapRow);
        
        // Filter dropdown
        const filterRow = document.createElement('div');
        filterRow.style.cssText = 'display: flex; align-items: center; gap: 6px; color: var(--text-primary);';
        filterRow.appendChild(document.createTextNode('Filter:'));
        const filterSelect = document.createElement('select');
        filterSelect.style.cssText = 'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 2px 4px; border-radius: 2px; font-size: 11px; flex: 1;';
        ['mipmap', 'linear', 'nearest'].forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            option.selected = (channel?.filter || 'mipmap') === mode;
            filterSelect.appendChild(option);
        });
        filterSelect.onchange = () => {
            channels.updateTextureOptions(channelNumber, { filter: filterSelect.value });
        };
        filterRow.appendChild(filterSelect);
        optionsDiv.appendChild(filterRow);
        
        // Anisotropic checkbox
        const anisoLabel = document.createElement('label');
        anisoLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--text-primary);';
        const anisoCheckbox = document.createElement('input');
        anisoCheckbox.type = 'checkbox';
        anisoCheckbox.checked = channel?.anisotropic || false;
        anisoCheckbox.onchange = () => {
            channels.updateTextureOptions(channelNumber, { anisotropic: anisoCheckbox.checked });
        };
        
        // Check if anisotropic is supported
        const gl = state.glContext || state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        const ext = gl?.getExtension('EXT_texture_filter_anisotropic');
        if (!ext) {
            anisoLabel.style.opacity = '0.5';
            anisoLabel.title = 'Anisotropic filtering not supported by this browser';
        }
        
        anisoLabel.appendChild(anisoCheckbox);
        anisoLabel.appendChild(document.createTextNode('Anisotropic'));
        optionsDiv.appendChild(anisoLabel);
        
        infoColumn.appendChild(optionsDiv);
        previewSection.appendChild(infoColumn);
    } else {
        // No image selected placeholder
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'text-align: center; padding: 20px; color: var(--text-secondary); width: 100%;';
        placeholder.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 8px;">🖼️</div>
            <div style="font-size: 11px;">No image selected</div>
        `;
        previewSection.appendChild(placeholder);
    }
    
    container.appendChild(previewSection);
    
    // URL Import section
    const urlSection = document.createElement('div');
    urlSection.style.cssText = `
        padding: 10px 12px;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-primary);
        flex-shrink: 0;
    `;
    
    const urlLabel = document.createElement('div');
    urlLabel.style.cssText = 'font-size: 11px; font-weight: bold; margin-bottom: 6px; color: var(--text-secondary);';
    urlLabel.textContent = 'Import from URL';
    urlSection.appendChild(urlLabel);
    
    // Source selector (only for images)
    let sourceSelect = null;
    if (channelType === 'image') {
        const sourceRow = document.createElement('div');
        sourceRow.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px;';
        
        const sourceLabel = document.createElement('span');
        sourceLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
        sourceLabel.textContent = 'Source:';
        sourceRow.appendChild(sourceLabel);
        
        sourceSelect = document.createElement('select');
        sourceSelect.style.cssText = `
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 2px;
        `;
        sourceSelect.innerHTML = `
            <option value="github">GitHub</option>
            <option value="polyhaven">Poly Haven</option>
            <option value="imgbb">ImgBB</option>
            <option value="cloudinary">Cloudinary</option>
        `;
        sourceRow.appendChild(sourceSelect);
        urlSection.appendChild(sourceRow);
    }
    
    const urlRow = document.createElement('div');
    urlRow.style.cssText = 'display: flex; gap: 6px; align-items: center;';
    
    const urlPrefix = document.createElement('span');
    urlPrefix.style.cssText = 'font-size: 11px; color: var(--text-secondary); font-family: monospace; white-space: nowrap;';
    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
    urlRow.appendChild(urlPrefix);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'user/repo/branch/path/image.png';
    urlInput.style.cssText = `
        flex: 1;
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 2px;
        font-family: monospace;
    `;
    urlRow.appendChild(urlInput);
    
    // Update prefix and placeholder when source changes (images only)
    if (channelType === 'image' && sourceSelect) {
        sourceSelect.onchange = () => {
            switch (sourceSelect.value) {
                case 'polyhaven':
                    urlPrefix.textContent = 'https://dl.polyhaven.org/file/ph-assets/';
                    urlInput.placeholder = 'HDRIs/hdri_name/hdri_file.png';
                    break;
                case 'imgbb':
                    urlPrefix.textContent = 'https://i.ibb.co/';
                    urlInput.placeholder = 'XXXXXXXX/image.png';
                    break;
                case 'cloudinary':
                    urlPrefix.textContent = 'https://res.cloudinary.com/';
                    urlInput.placeholder = 'cloud_name/image/upload/path/image.png';
                    break;
                default: // github
                    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
                    urlInput.placeholder = 'user/repo/branch/path/image.png';
            }
        };
    }
    
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import';
    importBtn.style.cssText = `
        background: var(--bg-tertiary);
        border: 1px solid var(--accent-color);
        color: var(--accent-color);
        padding: 4px 12px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 11px;
        font-weight: bold;
        white-space: nowrap;
        transition: all 0.2s;
    `;
    importBtn.onmouseenter = () => {
        importBtn.style.background = 'var(--accent-color)';
        importBtn.style.color = 'white';
    };
    importBtn.onmouseleave = () => {
        if (!importBtn.disabled) {
            importBtn.style.background = 'var(--bg-tertiary)';
            importBtn.style.color = 'var(--accent-color)';
        }
    };
    importBtn.onclick = async () => {
        const userPath = urlInput.value.trim();
        if (!userPath) {
            alert('Please enter a path');
            return;
        }
        
        // Validate file extension
        if (!/\.(png|jpg|jpeg)$/i.test(userPath)) {
            alert('Only .png, .jpg, and .jpeg files are supported');
            return;
        }
        
        // Build full URL based on source
        let fullUrl;
        let source = 'guc'; // Default to GitHub User Content
        
        if (channelType === 'image' && sourceSelect) {
            switch (sourceSelect.value) {
                case 'polyhaven':
                    fullUrl = 'https://dl.polyhaven.org/file/ph-assets/' + userPath;
                    source = 'polyhaven';
                    break;
                case 'imgbb':
                    fullUrl = 'https://i.ibb.co/' + userPath;
                    source = 'imgbb';
                    break;
                case 'cloudinary':
                    fullUrl = 'https://res.cloudinary.com/' + userPath;
                    source = 'cloudinary';
                    break;
                default: // github
                    fullUrl = 'https://raw.githubusercontent.com/' + userPath;
                    source = 'guc';
            }
        } else {
            fullUrl = 'https://raw.githubusercontent.com/' + userPath;
        }
        
        importBtn.disabled = true;
        importBtn.textContent = 'Loading...';
        
        try {
            await handleUrlImport(fullUrl, userPath, channelNumber, channelType, source);
            urlInput.value = '';
            importBtn.textContent = 'Import';
        } catch (error) {
            alert('Failed to load image: ' + error.message);
            importBtn.textContent = 'Import';
        } finally {
            importBtn.disabled = false;
        }
    };
    urlRow.appendChild(importBtn);
    
    urlSection.appendChild(urlRow);
    container.appendChild(urlSection);
    
    // Scrollable grid section
    const gridSection = document.createElement('div');
    gridSection.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 12px;
    `;
    
    // Title
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 11px; font-weight: bold; margin-bottom: 12px; color: var(--text-secondary);';
    
    // Collect all available items (catalog + external)
    const allItems = [...items];
    
    // Add external media if current selection is external
    const externalSources = ['guc', 'polyhaven', 'imgbb', 'cloudinary'];
    if (currentMedia && externalSources.includes(currentMedia.source) && !allItems.find(item => item.id === currentMedia.id)) {
        allItems.unshift(currentMedia); // Add at beginning
    }
    
    title.textContent = `Available ${channelType.charAt(0).toUpperCase() + channelType.slice(1)}s (${allItems.length})`;
    gridSection.appendChild(title);
    
    // Grid of media items
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 10px;
    `;
    
    allItems.forEach(item => {
        const card = createMediaCard(item, channelType, channelNumber, item.id === currentMediaId);
        grid.appendChild(card);
    });
    
    gridSection.appendChild(grid);
    container.appendChild(gridSection);
    
    return container;
}

/**
 * Create media card element
 * @param {Object} mediaInfo - Media info from catalog
 * @param {string} channelType - 'image' or 'video'
 * @param {number} channelNumber - Channel number
 * @param {boolean} isSelected - Whether this media is currently selected
 * @returns {HTMLElement} Media card
 */
function createMediaCard(mediaInfo, channelType, channelNumber, isSelected) {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.style.cssText = `
        border: 2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'};
        border-radius: 4px;
        padding: 6px;
        cursor: pointer;
        transition: all 0.2s;
        background: var(--bg-secondary);
    `;
    
    // Thumbnail
    const thumb = document.createElement('img');
    thumb.src = mediaInfo.thumb || mediaInfo.path;
    thumb.alt = mediaInfo.name;
    thumb.style.cssText = `
        width: 100%;
        height: 80px;
        object-fit: cover;
        border-radius: 2px;
        background: var(--bg-tertiary);
    `;
    card.appendChild(thumb);
    
    // Name
    const name = document.createElement('div');
    name.textContent = mediaInfo.name;
    name.style.cssText = `
        font-size: 10px;
        color: var(--text-primary);
        margin-top: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;
    card.appendChild(name);
    
    // Resolution
    const resolution = document.createElement('div');
    resolution.textContent = `${mediaInfo.width}×${mediaInfo.height}`;
    resolution.style.cssText = `
        font-size: 9px;
        color: var(--text-secondary);
        margin-top: 2px;
    `;
    card.appendChild(resolution);
    
    // Click handler
    card.onclick = () => handleMediaSelect(mediaInfo.id, channelNumber, channelType);
    
    // Hover effect
    card.onmouseenter = () => {
        if (!isSelected) {
            card.style.borderColor = 'var(--accent-color)';
            card.style.opacity = '0.8';
        }
    };
    card.onmouseleave = () => {
        if (!isSelected) {
            card.style.borderColor = 'var(--border-color)';
            card.style.opacity = '1';
        }
    };
    
    return card;
}

/**
 * Handle media selection
 * @param {string} mediaId - Media ID
 * @param {number} channelNumber - Channel number
 * @param {string} channelType - 'image' or 'video'
 */
async function handleMediaSelect(mediaId, channelNumber, channelType) {
    console.log(`Media selected: ${mediaId} for ch${channelNumber}`);
    
    // Update existing channel instead of delete/create
    const success = await channels.updateChannelMedia(channelNumber, mediaId);
    
    if (!success) {
        console.error('Failed to update channel media');
        return;
    }
    
    // Refresh the media selector UI
    const tabName = `${channelType}_ch${channelNumber}`;
    const container = document.getElementById(`${tabName}Container`);
    if (container) {
        container.innerHTML = '';
        const newSelector = await createMediaSelector(tabName, channelType, channelNumber);
        container.appendChild(newSelector);
    }
    
    // No need to recompile - texture binding happens every frame
    // The render loop will automatically use the new texture
}

/**
 * Handle URL import from GitHub or other sources
 * @param {string} fullUrl - Complete URL
 * @param {string} userPath - User-provided path (used as title)
 * @param {number} channelNumber - Channel number
 * @param {string} channelType - 'image' or 'video'
 * @param {string} source - Source identifier ('guc', 'polyhaven', etc.)
 */
async function handleUrlImport(fullUrl, userPath, channelNumber, channelType, source = 'guc') {
    console.log(`Importing from URL: ${fullUrl}`);
    
    // Create a special media ID for URL-sourced images
    const mediaId = source + ':' + userPath;
    
    // Extract title from path (filename without extension)
    const filename = userPath.split('/').pop();
    const title = filename.replace(/\.(png|jpg|jpeg)$/i, '');
    
    // Load the image to get dimensions
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Enable CORS
    
    await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image from URL'));
        img.src = fullUrl;
    });
    
    // Add to media catalog temporarily (in-memory only)
    const mediaInfo = {
        id: mediaId,
        type: 'image',
        name: title,
        path: fullUrl,
        thumb: fullUrl,
        width: img.width,
        height: img.height,
        source: source,
        url: fullUrl,
        userPath: userPath
    };
    
    // Register with media loader
    mediaLoader.registerExternalMedia(mediaInfo);
    
    // Update channel with this media
    const success = await channels.updateChannelMedia(channelNumber, mediaId);
    
    if (!success) {
        throw new Error('Failed to update channel');
    }
    
    console.log(`✓ URL imported: ${title} (${img.width}×${img.height})`);
    
    // Refresh the media selector UI
    const tabName = `${channelType}_ch${channelNumber}`;
    const container = document.getElementById(`${tabName}Container`);
    if (container) {
        container.innerHTML = '';
        const newSelector = await createMediaSelector(tabName, channelType, channelNumber);
        container.appendChild(newSelector);
    }
}
