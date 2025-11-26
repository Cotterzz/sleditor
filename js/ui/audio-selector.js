// ============================================================================
// Audio Selector - UI for selecting audio files in audio channel tabs
// ============================================================================

import * as mediaLoader from '../media-loader.js';
import * as channels from '../channels.js';
import * as audioInput from '../audio-input.js';
import { state } from '../core.js';

/**
 * Create audio selector UI
 * @param {string} tabName - Tab name (e.g., 'audio_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {HTMLElement} Audio selector container
 */
export async function createAudioSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'audio-selector';
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
    const items = catalog.audio || [];
    
    // Get current selection
    const channel = channels.getChannel(channelNumber);
    const currentMediaId = channel?.mediaId;
    
    // Check catalog first, then external media
    let currentMedia = items.find(item => item.id === currentMediaId);
    if (!currentMedia && currentMediaId) {
        currentMedia = mediaLoader.getMediaInfo(currentMediaId);
    }
    
    // Current playing section
    const playingSection = document.createElement('div');
    playingSection.style.cssText = `
        padding: 12px;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
        flex-shrink: 0;
        display: flex;
        gap: 12px;
        align-items: center;
    `;
    
    if (currentMedia && channel?.audioData) {
        console.log('Audio selector: channel has audioData', {
            playing: channel.audioData.playing,
            hasAudio: !!channel.audioData.audio,
            hasAnalyser: !!channel.audioData.analyser
        });
        
        // Audio visualization
        const visualizer = document.createElement('canvas');
        visualizer.width = 150;
        visualizer.height = 80;
        visualizer.style.cssText = `
            border-radius: 4px;
            background: var(--bg-tertiary);
            border: 2px solid var(--accent-color);
            flex-shrink: 0;
        `;
        playingSection.appendChild(visualizer);
        
        // Start visualization updates
        startVisualization(visualizer, channel);
        
        // Info and controls column
        const controlsColumn = document.createElement('div');
        controlsColumn.style.cssText = `
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
        controlsColumn.appendChild(titleDiv);
        
        // Playback controls row
        const controlsRow = document.createElement('div');
        controlsRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        
        // Play/Pause button
        const playPauseBtn = document.createElement('button');
        playPauseBtn.textContent = channel.audioData.playing ? '⏸' : '▶';
        playPauseBtn.style.cssText = `
            background: var(--bg-tertiary);
            border: 1px solid var(--accent-color);
            color: var(--text-primary);
            padding: 4px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 14px;
        `;
        playPauseBtn.onclick = async () => {
            try {
                if (channel.audioData.playing) {
                    audioInput.pauseAudioChannel(channel.audioData);
                    playPauseBtn.textContent = '▶';
                } else {
                    await audioInput.playAudioChannel(channel.audioData);
                    playPauseBtn.textContent = '⏸';
                }
            } catch (error) {
                console.error('Play/pause error:', error);
                playPauseBtn.textContent = '▶';
                alert('Failed to play audio: ' + error.message);
            }
        };
        controlsRow.appendChild(playPauseBtn);
        
        // Loop checkbox
        const loopLabel = document.createElement('label');
        loopLabel.style.cssText = 'display: flex; align-items: center; gap: 4px; cursor: pointer; color: var(--text-primary); font-size: 11px;';
        const loopCheckbox = document.createElement('input');
        loopCheckbox.type = 'checkbox';
        loopCheckbox.checked = channel.audioData.audio?.loop || false;
        loopCheckbox.onchange = () => {
            audioInput.setAudioLoop(channel.audioData, loopCheckbox.checked);
        };
        loopLabel.appendChild(loopCheckbox);
        loopLabel.appendChild(document.createTextNode('Loop'));
        controlsRow.appendChild(loopLabel);
        
        // Volume slider
        const volumeLabel = document.createElement('div');
        volumeLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; flex: 1; color: var(--text-primary); font-size: 11px;';
        volumeLabel.appendChild(document.createTextNode('🔊'));
        const volumeSlider = document.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.min = '0';
        volumeSlider.max = '100';
        volumeSlider.value = String((channel.audioData.audio?.volume || 0.5) * 100);
        volumeSlider.style.cssText = 'flex: 1;';
        volumeSlider.oninput = () => {
            audioInput.setAudioVolume(channel.audioData, volumeSlider.value / 100);
        };
        volumeLabel.appendChild(volumeSlider);
        controlsRow.appendChild(volumeLabel);
        
        controlsColumn.appendChild(controlsRow);
        
        // Audio mode selector
        const modeRow = document.createElement('div');
        modeRow.style.cssText = 'display: flex; align-items: center; gap: 6px; color: var(--text-primary); font-size: 11px;';
        modeRow.appendChild(document.createTextNode('Quality:'));
        const modeSelect = document.createElement('select');
        modeSelect.style.cssText = 'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 2px 4px; border-radius: 2px; font-size: 11px; flex: 1;';
        
        Object.entries(audioInput.AUDIO_TEXTURE_MODES).forEach(([key, mode]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = mode.name;
            option.selected = (channel.audioMode || 'shadertoy') === key;
            modeSelect.appendChild(option);
        });
        
        modeSelect.onchange = async () => {
            // Reload audio channel with new mode
            await updateChannelAudioMode(channelNumber, modeSelect.value);
            // Refresh UI
            const container = document.getElementById(`${tabName}Container`);
            if (container) {
                container.innerHTML = '';
                const newSelector = await createAudioSelector(tabName, channelNumber);
                container.appendChild(newSelector);
            }
        };
        modeRow.appendChild(modeSelect);
        controlsColumn.appendChild(modeRow);
        
        // Resolution display
        const resolutionDiv = document.createElement('div');
        resolutionDiv.style.cssText = 'font-size: 10px; color: var(--text-secondary);';
        resolutionDiv.textContent = `${channel.resolution?.width || 512}×${channel.resolution?.height || 2} texture`;
        controlsColumn.appendChild(resolutionDiv);
        
        playingSection.appendChild(controlsColumn);
    } else {
        // No audio selected placeholder
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'text-align: center; padding: 20px; color: var(--text-secondary); width: 100%;';
        placeholder.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 8px;">🎵</div>
            <div style="font-size: 11px;">No audio selected</div>
        `;
        playingSection.appendChild(placeholder);
    }
    
    container.appendChild(playingSection);
    
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
    urlLabel.textContent = 'Import from GitHub';
    urlSection.appendChild(urlLabel);
    
    const urlRow = document.createElement('div');
    urlRow.style.cssText = 'display: flex; gap: 6px; align-items: center;';
    
    const urlPrefix = document.createElement('span');
    urlPrefix.style.cssText = 'font-size: 11px; color: var(--text-secondary); font-family: monospace; white-space: nowrap;';
    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
    urlRow.appendChild(urlPrefix);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'user/repo/branch/path/audio.mp3';
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
            alert('Please enter a GitHub path');
            return;
        }
        
        // Validate file extension
        if (!/\.(mp3|wav|ogg|m4a)$/i.test(userPath)) {
            alert('Only .mp3, .wav, .ogg, and .m4a files are supported');
            return;
        }
        
        const fullUrl = 'https://raw.githubusercontent.com/' + userPath;
        
        importBtn.disabled = true;
        importBtn.textContent = 'Loading...';
        
        try {
            await handleUrlImport(fullUrl, userPath, channelNumber);
            urlInput.value = '';
            importBtn.textContent = 'Import';
        } catch (error) {
            alert('Failed to load audio: ' + error.message);
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
    if (currentMedia && currentMedia.source === 'guc' && !allItems.find(item => item.id === currentMedia.id)) {
        allItems.unshift(currentMedia);
    }
    
    if (allItems.length === 0) {
        gridSection.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 10px;">🎵</div>
                <div>No audio files available</div>
                <div style="font-size: 11px; margin-top: 5px;">Add audio files to media/ folder or import from GitHub</div>
            </div>
        `;
    } else {
        title.textContent = `Available Audio (${allItems.length})`;
        gridSection.appendChild(title);
        
        // Grid of audio items
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 10px;
        `;
        
        allItems.forEach(item => {
            const card = createAudioCard(item, channelNumber, item.id === currentMediaId);
            grid.appendChild(card);
        });
        
        gridSection.appendChild(grid);
    }
    
    container.appendChild(gridSection);
    
    return container;
}

/**
 * Create audio card element
 * @param {Object} audioInfo - Audio info from catalog
 * @param {number} channelNumber - Channel number
 * @param {boolean} isSelected - Whether this audio is currently selected
 * @returns {HTMLElement} Audio card
 */
function createAudioCard(audioInfo, channelNumber, isSelected) {
    const card = document.createElement('div');
    card.className = 'audio-card';
    card.style.cssText = `
        border: 2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'};
        border-radius: 4px;
        padding: 8px;
        cursor: pointer;
        transition: all 0.2s;
        background: var(--bg-secondary);
        display: flex;
        flex-direction: column;
        align-items: center;
    `;
    
    // Icon
    const icon = document.createElement('div');
    icon.textContent = '🎵';
    icon.style.cssText = `
        font-size: 32px;
        margin-bottom: 6px;
    `;
    card.appendChild(icon);
    
    // Name
    const name = document.createElement('div');
    name.textContent = audioInfo.name;
    name.style.cssText = `
        font-size: 10px;
        color: var(--text-primary);
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
    `;
    card.appendChild(name);
    
    // Duration (if available)
    if (audioInfo.duration) {
        const duration = document.createElement('div');
        duration.textContent = formatDuration(audioInfo.duration);
        duration.style.cssText = `
            font-size: 9px;
            color: var(--text-secondary);
            margin-top: 2px;
        `;
        card.appendChild(duration);
    }
    
    // Click handler
    card.onclick = () => handleAudioSelect(audioInfo.id, channelNumber);
    
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
 * Handle audio selection
 * @param {string} audioId - Audio ID
 * @param {number} channelNumber - Channel number
 */
async function handleAudioSelect(audioId, channelNumber) {
    console.log(`Audio selected: ${audioId} for ch${channelNumber}`);
    
    // Update channel with new audio
    const success = await channels.updateChannelMedia(channelNumber, audioId);
    
    if (!success) {
        console.error('Failed to update channel audio');
        return;
    }
    
    // Refresh the audio selector UI
    const tabName = `audio_ch${channelNumber}`;
    const container = document.getElementById(`${tabName}Container`);
    if (container) {
        container.innerHTML = '';
        const newSelector = await createAudioSelector(tabName, channelNumber);
        container.appendChild(newSelector);
    }
}

/**
 * Handle URL import from GitHub
 * @param {string} fullUrl - Complete GitHub raw URL
 * @param {string} userPath - User-provided path
 * @param {number} channelNumber - Channel number
 */
async function handleUrlImport(fullUrl, userPath, channelNumber) {
    console.log(`Importing audio from URL: ${fullUrl}`);
    
    // Create a special media ID for URL-sourced audio
    const mediaId = 'guc:' + userPath;
    
    // Extract title from path
    const filename = userPath.split('/').pop();
    const title = filename.replace(/\.(mp3|wav|ogg|m4a)$/i, '');
    
    // Add to media catalog temporarily (in-memory only)
    const mediaInfo = {
        id: mediaId,
        type: 'audio',
        name: title,
        path: fullUrl,
        source: 'guc',
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
    
    console.log(`✓ URL imported: ${title}`);
    
    // Refresh the audio selector UI
    const tabName = `audio_ch${channelNumber}`;
    const container = document.getElementById(`${tabName}Container`);
    if (container) {
        container.innerHTML = '';
        const newSelector = await createAudioSelector(tabName, channelNumber);
        container.appendChild(newSelector);
    }
}

/**
 * Update channel audio mode (reload with different FFT size)
 * @param {number} channelNumber - Channel number
 * @param {string} newMode - New mode key
 */
async function updateChannelAudioMode(channelNumber, newMode) {
    const channel = channels.getChannel(channelNumber);
    if (!channel || channel.type !== 'audio') return;
    
    // Store current media ID
    const mediaId = channel.mediaId;
    if (!mediaId) return;
    
    // Update mode in channel
    channel.audioMode = newMode;
    
    // Reload audio with new mode
    await channels.updateChannelMedia(channelNumber, mediaId);
}

/**
 * Start visualization updates for canvas
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} channel - Audio channel
 */
function startVisualization(canvas, channel) {
    if (!channel.audioData || !channel.audioData.analyser) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    function draw() {
        if (!channel.audioData || !channel.audioData.analyser) return;
        
        const analyser = channel.audioData.analyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = 'rgb(20, 20, 25)';
        ctx.fillRect(0, 0, width, height);
        
        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height;
            
            const hue = (i / bufferLength) * 360;
            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
        
        requestAnimationFrame(draw);
    }
    
    draw();
}

/**
 * Format duration in seconds to MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

