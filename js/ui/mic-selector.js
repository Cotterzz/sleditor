// ============================================================================
// Mic Selector - UI for microphone channel tabs
// ============================================================================

import * as channels from '../channels.js';
import * as micInput from '../mic-input.js';
import * as audioInput from '../audio-input.js';
import { state } from '../core.js';

/**
 * Create microphone selector UI
 * @param {string} tabName - Tab name (e.g., 'mic_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {Promise<HTMLElement>} Mic selector container
 */
export async function createMicSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'mic-selector';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: hidden;
    `;
    
    const channel = channels.getChannel(channelNumber);
    const isActive = channel?.micData?.active;
    
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
    title.innerHTML = `<span style="font-size: 24px;">🎤</span> Microphone Input`;
    headerSection.appendChild(title);
    
    if (isActive) {
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
    }
    
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
    
    if (isActive) {
        // Active mic display
        const activeInfo = document.createElement('div');
        activeInfo.style.cssText = `
            padding: 12px;
            background: var(--bg-secondary);
            border-radius: 4px;
            border: 1px solid var(--accent-color);
        `;
        
        const deviceName = document.createElement('div');
        deviceName.style.cssText = 'font-size: 12px; font-weight: bold; color: var(--text-primary); margin-bottom: 4px;';
        deviceName.textContent = channel.micData.deviceLabel || 'Microphone';
        activeInfo.appendChild(deviceName);
        
        const status = document.createElement('div');
        status.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
        status.textContent = `Active • ${channel.resolution?.width}×${channel.resolution?.height} texture`;
        activeInfo.appendChild(status);
        
        contentSection.appendChild(activeInfo);
        
        // Visualization canvas
        const visualizer = document.createElement('canvas');
        visualizer.width = 300;
        visualizer.height = 100;
        visualizer.style.cssText = `
            width: 100%;
            max-width: 400px;
            border-radius: 4px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
        `;
        contentSection.appendChild(visualizer);
        
        // Start visualization
        startMicVisualization(visualizer, channel);
        
        // Audio mode selector
        const modeRow = createModeSelector(channel, channelNumber, tabName);
        contentSection.appendChild(modeRow);
        
        // Device selector
        const deviceSection = await createDeviceSelector(channel, channelNumber, tabName);
        contentSection.appendChild(deviceSection);
        
    } else {
        // Not active - show retry option (mic was already attempted when channel was added)
        const startSection = document.createElement('div');
        startSection.style.cssText = `
            text-align: center;
            padding: 40px;
        `;
        
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size: 64px; margin-bottom: 16px;';
        icon.textContent = '🎤';
        startSection.appendChild(icon);
        
        const message = document.createElement('div');
        message.style.cssText = 'color: var(--text-secondary); margin-bottom: 16px; font-size: 12px;';
        message.textContent = 'Microphone access denied or unavailable';
        startSection.appendChild(message);
        
        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'Try Again';
        retryBtn.style.cssText = `
            background: var(--accent-color);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        retryBtn.onclick = async () => {
            message.textContent = 'Requesting microphone access...';
            retryBtn.disabled = true;
            
            try {
                await channels.startMicChannel(channelNumber);
                const containerEl = document.getElementById(`${tabName}Container`);
                if (containerEl) {
                    containerEl.innerHTML = '';
                    const newSelector = await createMicSelector(tabName, channelNumber);
                    containerEl.appendChild(newSelector);
                }
            } catch (e) {
                message.textContent = 'Microphone access denied or unavailable';
                retryBtn.disabled = false;
            }
        };
        startSection.appendChild(retryBtn);
        
        contentSection.appendChild(startSection);
    }
    
    container.appendChild(contentSection);
    
    return container;
}

/**
 * Create audio mode selector
 */
function createModeSelector(channel, channelNumber, tabName) {
    const modeRow = document.createElement('div');
    modeRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
    `;
    
    const label = document.createElement('span');
    label.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
    label.textContent = 'Mode:';
    modeRow.appendChild(label);
    
    const modeSelect = document.createElement('select');
    modeSelect.style.cssText = `
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        padding: 4px 8px;
        border-radius: 2px;
        font-size: 11px;
        flex: 1;
    `;
    
    Object.entries(audioInput.AUDIO_TEXTURE_MODES).forEach(([key, mode]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = mode.name;
        option.selected = (channel.audioMode || 'chromagram') === key;
        modeSelect.appendChild(option);
    });
    
    modeSelect.onchange = async () => {
        channel.audioMode = modeSelect.value;
        
        // Restart mic with new mode
        await channels.restartMicChannel(channelNumber, modeSelect.value);
        
        // Refresh UI
        const containerEl = document.getElementById(`${tabName}Container`);
        if (containerEl) {
            containerEl.innerHTML = '';
            const newSelector = await createMicSelector(tabName, channelNumber);
            containerEl.appendChild(newSelector);
        }
    };
    
    modeRow.appendChild(modeSelect);
    
    return modeRow;
}

/**
 * Create device selector dropdown
 */
async function createDeviceSelector(channel, channelNumber, tabName) {
    const deviceSection = document.createElement('div');
    deviceSection.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
    `;
    
    const label = document.createElement('span');
    label.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
    label.textContent = 'Device:';
    deviceSection.appendChild(label);
    
    const deviceSelect = document.createElement('select');
    deviceSelect.style.cssText = `
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        padding: 4px 8px;
        border-radius: 2px;
        font-size: 11px;
        flex: 1;
    `;
    
    // Get available devices
    try {
        const devices = await micInput.getMicrophoneDevices();
        const currentDeviceId = channel.micData?.deviceId;
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
            option.selected = device.deviceId === currentDeviceId;
            deviceSelect.appendChild(option);
        });
        
        deviceSelect.onchange = async () => {
            const newDeviceId = deviceSelect.value;
            
            // Change device
            await micInput.changeMicDevice(state.glContext, channel, newDeviceId);
            
            // Refresh UI
            const containerEl = document.getElementById(`${tabName}Container`);
            if (containerEl) {
                containerEl.innerHTML = '';
                const newSelector = await createMicSelector(tabName, channelNumber);
                containerEl.appendChild(newSelector);
            }
        };
    } catch (error) {
        const errorOption = document.createElement('option');
        errorOption.textContent = 'Failed to list devices';
        deviceSelect.appendChild(errorOption);
        deviceSelect.disabled = true;
    }
    
    deviceSection.appendChild(deviceSelect);
    
    return deviceSection;
}

/**
 * Start mic visualization
 */
function startMicVisualization(canvas, channel) {
    if (!channel.micData || !channel.micData.analyser) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    function draw() {
        if (!channel.micData || !channel.micData.active || !channel.micData.analyser) return;
        
        const analyser = channel.micData.analyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = 'rgb(20, 20, 25)';
        ctx.fillRect(0, 0, width, height);
        
        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height;
            
            // Use green/blue gradient for mic (different from audio files)
            const hue = 120 + (i / bufferLength) * 60;
            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
        
        requestAnimationFrame(draw);
    }
    
    draw();
}

