// ============================================================================
// Video Selector - UI for selecting video files in video channel tabs
// ============================================================================

import * as mediaLoader from '../media-loader.js';
import * as channels from '../channels.js';
import * as videoInput from '../video-input.js';
import { state } from '../core.js';

/**
 * Create video selector UI
 * @param {string} tabName - Tab name (e.g., 'video_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {HTMLElement} Video selector container
 */
export async function createVideoSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'video-selector';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
    `;
    
    const channel = channels.getChannel(channelNumber);
    if (!channel) {
        container.innerHTML = '<div style="color: var(--text-secondary);">Channel not found</div>';
        return container;
    }
    
    // ========== VIDEO PREVIEW SECTION ==========
    const previewSection = document.createElement('div');
    previewSection.style.cssText = `
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    // Video preview container
    const videoPreview = document.createElement('div');
    videoPreview.style.cssText = `
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    `;
    
    // Loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = `
        color: var(--text-secondary);
        font-size: 14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    `;
    loadingDiv.innerHTML = `
        <div style="font-size: 32px;">🎬</div>
        <div>No video selected</div>
    `;
    videoPreview.appendChild(loadingDiv);
    
    // If video is loaded, show it
    if (channel.videoData && channel.videoData.video) {
        const video = channel.videoData.video;
        video.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;
        videoPreview.innerHTML = '';
        videoPreview.appendChild(video);
    }
    
    previewSection.appendChild(videoPreview);
    
    // Status text
    const statusText = document.createElement('div');
    statusText.style.cssText = `
        font-size: 11px;
        color: var(--text-secondary);
        text-align: center;
    `;
    
    if (channel.videoData) {
        const state = channel.videoData.playing ? '▶ Playing' : '⏸ Paused';
        const loop = channel.videoData.loop ? ' · Loop' : '';
        statusText.textContent = `${state}${loop} · ${channel.videoData.width}×${channel.videoData.height}`;
    } else {
        statusText.textContent = 'Playback and volume controlled by main shader controls';
    }
    previewSection.appendChild(statusText);
    
    container.appendChild(previewSection);
    
    // ========== CONTROLS SECTION ==========
    const controlsSection = document.createElement('div');
    controlsSection.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
    `;
    
    // Loop checkbox
    const loopLabel = document.createElement('label');
    loopLabel.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text-primary);
        cursor: pointer;
        user-select: none;
    `;
    
    const loopCheckbox = document.createElement('input');
    loopCheckbox.type = 'checkbox';
    loopCheckbox.checked = channel.videoData?.loop || false;
    loopCheckbox.addEventListener('change', () => {
        videoInput.setVideoLoop(channel, loopCheckbox.checked);
        updateStatus();
    });
    
    loopLabel.appendChild(loopCheckbox);
    loopLabel.appendChild(document.createTextNode('Loop'));
    controlsSection.appendChild(loopLabel);
    
    container.appendChild(controlsSection);
    
    // ========== MEDIA SELECTOR ==========
    const selectorSection = document.createElement('div');
    selectorSection.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    // Header with video count
    const catalog = await mediaLoader.loadMediaCatalog();
    const videoCount = catalog.videos?.length || 0;
    
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: var(--text-secondary);
    `;
    header.innerHTML = `
        <span>Available Videos (${videoCount})</span>
        <span style="font-size: 10px;">Click to load</span>
    `;
    selectorSection.appendChild(header);
    
    // Video grid
    const videoGrid = document.createElement('div');
    videoGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 8px;
        max-height: 300px;
        overflow-y: auto;
    `;
    
    // Add catalog videos
    if (catalog.videos && catalog.videos.length > 0) {
        catalog.videos.forEach(vid => {
            const item = createVideoItem(vid, channelNumber, channel, videoPreview, statusText, loopCheckbox);
            videoGrid.appendChild(item);
        });
    } else {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-secondary); font-size: 12px;';
        empty.textContent = 'No videos in catalog';
        videoGrid.appendChild(empty);
    }
    
    selectorSection.appendChild(videoGrid);
    
    // ========== EXTERNAL URL INPUT ==========
    const urlSection = document.createElement('div');
    urlSection.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
        border-top: 1px solid var(--border-color);
    `;
    
    const urlLabel = document.createElement('div');
    urlLabel.style.cssText = 'font-size: 12px; color: var(--text-secondary);';
    urlLabel.textContent = 'Import from URL:';
    urlSection.appendChild(urlLabel);
    
    // Source selector row
    const sourceRow = document.createElement('div');
    sourceRow.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px;';
    
    const sourceLabel = document.createElement('span');
    sourceLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
    sourceLabel.textContent = 'Source:';
    sourceRow.appendChild(sourceLabel);
    
    const sourceSelect = document.createElement('select');
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
        <option value="cloudinary">Cloudinary</option>
    `;
    sourceRow.appendChild(sourceSelect);
    urlSection.appendChild(sourceRow);
    
    const urlInputContainer = document.createElement('div');
    urlInputContainer.style.cssText = 'display: flex; gap: 6px; align-items: center;';
    
    const urlPrefix = document.createElement('span');
    urlPrefix.style.cssText = 'font-size: 11px; color: var(--text-secondary); font-family: monospace; white-space: nowrap;';
    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
    urlInputContainer.appendChild(urlPrefix);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'user/repo/branch/path/video.mp4';
    urlInput.style.cssText = `
        flex: 1;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 3px;
        padding: 6px 8px;
        color: var(--text-primary);
        font-size: 11px;
        font-family: monospace;
    `;
    
    // Update prefix and placeholder when source changes
    sourceSelect.onchange = () => {
        if (sourceSelect.value === 'cloudinary') {
            urlPrefix.textContent = 'https://res.cloudinary.com/';
            urlInput.placeholder = 'cloud_name/video/upload/path/video.mp4';
        } else {
            urlPrefix.textContent = 'https://raw.githubusercontent.com/';
            urlInput.placeholder = 'user/repo/branch/path/video.mp4';
        }
    };
    
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.style.cssText = `
        background: var(--accent-color);
        border: none;
        border-radius: 3px;
        padding: 6px 16px;
        color: white;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
    `;
    
    loadBtn.addEventListener('click', async () => {
        const userPath = urlInput.value.trim();
        if (!userPath) return;
        
        // Check file extension
        const validExts = ['.mp4', '.webm', '.ogv', '.mov'];
        const hasValidExt = validExts.some(ext => userPath.toLowerCase().endsWith(ext));
        if (!hasValidExt) {
            alert('Path must point to a video file (.mp4, .webm, .ogv, .mov)');
            return;
        }
        
        // Build full URL based on source
        let fullUrl;
        let source = 'guc';
        if (sourceSelect.value === 'cloudinary') {
            fullUrl = 'https://res.cloudinary.com/' + userPath;
            source = 'cloudinary';
        } else {
            fullUrl = 'https://raw.githubusercontent.com/' + userPath;
            source = 'guc';
        }
        
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';
        
        try {
            await loadVideoFromUrl(fullUrl, userPath, source, channelNumber, channel, videoPreview, statusText, loopCheckbox);
            urlInput.value = '';
        } catch (error) {
            alert('Failed to load video: ' + error.message);
        } finally {
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load';
        }
    });
    
    urlInputContainer.appendChild(urlInput);
    urlInputContainer.appendChild(loadBtn);
    urlSection.appendChild(urlInputContainer);
    
    selectorSection.appendChild(urlSection);
    container.appendChild(selectorSection);
    
    // Helper to update status text
    function updateStatus() {
        if (channel.videoData) {
            const state = channel.videoData.playing ? '▶ Playing' : '⏸ Paused';
            const loop = channel.videoData.loop ? ' · Loop' : '';
            statusText.textContent = `${state}${loop} · ${channel.videoData.width}×${channel.videoData.height}`;
        }
    }
    
    return container;
}

/**
 * Create a video item for the grid
 */
function createVideoItem(videoInfo, channelNumber, channel, videoPreview, statusText, loopCheckbox) {
    const item = document.createElement('div');
    item.style.cssText = `
        cursor: pointer;
        border: 2px solid ${channel.mediaId === videoInfo.id ? 'var(--accent-color)' : 'var(--border-color)'};
        border-radius: 4px;
        overflow: hidden;
        transition: border-color 0.2s, transform 0.2s;
        background: var(--bg-tertiary);
    `;
    
    item.addEventListener('mouseenter', () => {
        if (channel.mediaId !== videoInfo.id) {
            item.style.borderColor = '#0e639c';
        }
    });
    
    item.addEventListener('mouseleave', () => {
        if (channel.mediaId !== videoInfo.id) {
            item.style.borderColor = 'var(--border-color)';
        }
    });
    
    // Thumbnail
    const thumb = document.createElement('div');
    thumb.style.cssText = `
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    `;
    
    if (videoInfo.thumb) {
        const img = document.createElement('img');
        img.src = videoInfo.thumb;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        thumb.appendChild(img);
        
        // Play icon overlay
        const playIcon = document.createElement('div');
        playIcon.textContent = '▶';
        playIcon.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 24px;
            color: rgba(255, 255, 255, 0.8);
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;
        thumb.appendChild(playIcon);
    } else {
        thumb.innerHTML = '<div style="color: var(--text-secondary); font-size: 32px;">🎬</div>';
    }
    
    item.appendChild(thumb);
    
    // Name
    const name = document.createElement('div');
    name.textContent = videoInfo.name || videoInfo.id;
    name.style.cssText = `
        padding: 4px 6px;
        font-size: 10px;
        color: var(--text-primary);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    item.appendChild(name);
    
    // Click to load
    item.addEventListener('click', async () => {
        item.style.pointerEvents = 'none';
        const oldBorder = item.style.borderColor;
        item.style.borderColor = 'var(--accent-color)';
        
        try {
            await loadVideoFromCatalog(videoInfo, channelNumber, channel, videoPreview, statusText, loopCheckbox);
        } catch (error) {
            console.error('Failed to load video:', error);
            item.style.borderColor = oldBorder;
        } finally {
            item.style.pointerEvents = '';
        }
    });
    
    return item;
}

/**
 * Load video from catalog
 */
async function loadVideoFromCatalog(videoInfo, channelNumber, channel, videoPreview, statusText, loopCheckbox) {
    // Show loading state
    videoPreview.innerHTML = `
        <div style="color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="font-size: 32px;">⏳</div>
            <div style="font-size: 12px;">Loading video...</div>
        </div>
    `;
    
    const gl = state.glContext;
    if (!gl) {
        throw new Error('WebGL context not available');
    }
    
    // Cleanup old video
    if (channel.videoData) {
        videoInput.cleanupVideoChannel(channel);
    }
    
    // Load new video
    const videoData = await videoInput.loadVideoChannel(gl, videoInfo.path);
    
    // Update channel
    channel.videoData = videoData;
    channel.texture = videoData.texture;
    channel.resolution = { width: videoData.width, height: videoData.height };
    channel.mediaId = videoInfo.id;
    
    // Update loop state from checkbox
    videoInput.setVideoLoop(channel, loopCheckbox.checked);
    
    // Show video element
    const video = videoData.video;
    video.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
    
    // Update status
    const loopText = videoData.loop ? ' · Loop' : '';
    statusText.textContent = `⏸ Paused${loopText} · ${videoData.width}×${videoData.height}`;
    
    console.log(`✓ Video channel ${channelNumber} loaded:`, videoInfo.name);
}

/**
 * Load video from external URL
 * @param {string} fullUrl - Complete URL
 * @param {string} userPath - User-provided path (used for mediaId)
 * @param {string} source - Source identifier ('guc' or 'cloudinary')
 */
async function loadVideoFromUrl(fullUrl, userPath, source, channelNumber, channel, videoPreview, statusText, loopCheckbox) {
    // Show loading state
    videoPreview.innerHTML = `
        <div style="color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="font-size: 32px;">⏳</div>
            <div style="font-size: 12px;">Loading video...</div>
        </div>
    `;
    
    const gl = state.glContext;
    if (!gl) {
        throw new Error('WebGL context not available');
    }
    
    // Cleanup old video
    if (channel.videoData) {
        videoInput.cleanupVideoChannel(channel);
    }
    
    // Load new video
    const videoData = await videoInput.loadVideoChannel(gl, fullUrl);
    
    // Create mediaId with source prefix for save/load
    const mediaId = source + ':' + userPath;
    
    // Update channel
    channel.videoData = videoData;
    channel.texture = videoData.texture;
    channel.resolution = { width: videoData.width, height: videoData.height };
    channel.mediaId = mediaId;
    
    // Update loop state from checkbox
    videoInput.setVideoLoop(channel, loopCheckbox.checked);
    
    // Show video element
    const video = videoData.video;
    video.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
    
    // Update status
    const loopText = videoData.loop ? ' · Loop' : '';
    statusText.textContent = `⏸ Paused${loopText} · ${videoData.width}×${videoData.height}`;
    
    console.log(`✓ Video channel ${channelNumber} loaded from ${source}: ${userPath}`);
}

