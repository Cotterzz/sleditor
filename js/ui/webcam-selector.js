// ============================================================================
// Webcam Selector - UI for webcam channel tabs
// ============================================================================

import * as channels from '../channels.js';
import * as webcamInput from '../webcam-input.js';
import { state } from '../core.js';

/**
 * Create webcam selector UI
 * @param {string} tabName - Tab name (e.g., 'webcam_ch1')
 * @param {number} channelNumber - Channel number
 * @returns {Promise<HTMLElement>} Webcam selector container
 */
export async function createWebcamSelector(tabName, channelNumber) {
    const container = document.createElement('div');
    container.className = 'webcam-selector';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: hidden;
    `;
    
    const channel = channels.getChannel(channelNumber);
    const isActive = channel?.webcamData?.active;
    
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
    title.innerHTML = `<span style="font-size: 24px;">📹</span> Webcam Input`;
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
        overflow: auto;
    `;
    
    if (isActive) {
        // Active webcam display
        const activeInfo = document.createElement('div');
        activeInfo.style.cssText = `
            padding: 12px;
            background: var(--bg-secondary);
            border-radius: 4px;
            border: 1px solid var(--accent-color);
        `;
        
        const deviceName = document.createElement('div');
        deviceName.style.cssText = 'font-size: 12px; font-weight: bold; color: var(--text-primary); margin-bottom: 4px;';
        deviceName.textContent = channel.webcamData.deviceLabel || 'Webcam';
        activeInfo.appendChild(deviceName);
        
        const status = document.createElement('div');
        status.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
        status.textContent = `Active • ${channel.webcamData.width}×${channel.webcamData.height}`;
        activeInfo.appendChild(status);
        
        contentSection.appendChild(activeInfo);
        
        // Live preview
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = `
            position: relative;
            width: 100%;
            max-width: 400px;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid var(--border-color);
            background: #000;
        `;
        
        // Clone video for preview (don't use the actual video element)
        const previewVideo = document.createElement('video');
        previewVideo.srcObject = channel.webcamData.stream;
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewVideo.autoplay = true;
        previewVideo.style.cssText = `
            width: 100%;
            display: block;
            transform: scaleX(-1); /* Mirror for natural selfie view */
        `;
        previewContainer.appendChild(previewVideo);
        
        // Update preview mirror based on flip setting
        // If flip is ON, shader receives flipped, so preview should NOT be mirrored (they cancel out)
        // If flip is OFF, shader receives unflipped, so preview should be mirrored for selfie view
        const isFlipped = channel.webcamData.flipHorizontal;
        previewVideo.style.transform = isFlipped ? 'scaleX(1)' : 'scaleX(-1)';
        
        // Mirror indicator
        const mirrorNote = document.createElement('div');
        mirrorNote.style.cssText = `
            position: absolute;
            bottom: 4px;
            left: 4px;
            font-size: 9px;
            color: rgba(255,255,255,0.6);
            background: rgba(0,0,0,0.5);
            padding: 2px 6px;
            border-radius: 2px;
        `;
        mirrorNote.textContent = isFlipped ? 'Flip enabled (mirrored in shader)' : 'Preview mirrored (shader receives unmirrored)';
        previewContainer.appendChild(mirrorNote);
        
        contentSection.appendChild(previewContainer);
        
        // Flip horizontal toggle
        const flipSection = createFlipToggle(channel, tabName, previewVideo);
        contentSection.appendChild(flipSection);
        
        // Device selector
        const deviceSection = await createDeviceSelector(channel, channelNumber, tabName);
        contentSection.appendChild(deviceSection);
        
    } else {
        // Not active - show start button
        const startSection = document.createElement('div');
        startSection.style.cssText = `
            text-align: center;
            padding: 40px;
        `;
        
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size: 64px; margin-bottom: 16px;';
        icon.textContent = '📹';
        startSection.appendChild(icon);
        
        const message = document.createElement('div');
        message.style.cssText = 'color: var(--text-secondary); margin-bottom: 16px; font-size: 12px;';
        message.textContent = 'Click to enable webcam input';
        startSection.appendChild(message);
        
        const startBtn = document.createElement('button');
        startBtn.textContent = 'Enable Webcam';
        startBtn.style.cssText = `
            background: var(--accent-color);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: opacity 0.2s;
        `;
        startBtn.onmouseenter = () => startBtn.style.opacity = '0.8';
        startBtn.onmouseleave = () => startBtn.style.opacity = '1';
        startBtn.onclick = async () => {
            startBtn.disabled = true;
            startBtn.textContent = 'Requesting permission...';
            
            try {
                await channels.startWebcamChannel(channelNumber);
                
                // Refresh UI
                const containerEl = document.getElementById(`${tabName}Container`);
                if (containerEl) {
                    containerEl.innerHTML = '';
                    const newSelector = await createWebcamSelector(tabName, channelNumber);
                    containerEl.appendChild(newSelector);
                }
            } catch (error) {
                alert('Failed to enable webcam: ' + error.message);
                startBtn.disabled = false;
                startBtn.textContent = 'Enable Webcam';
            }
        };
        startSection.appendChild(startBtn);
        
        contentSection.appendChild(startSection);
    }
    
    container.appendChild(contentSection);
    
    return container;
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
        const devices = await webcamInput.getWebcamDevices();
        const currentDeviceId = channel.webcamData?.deviceId;
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${device.deviceId.slice(0, 8)}`;
            option.selected = device.deviceId === currentDeviceId;
            deviceSelect.appendChild(option);
        });
        
        deviceSelect.onchange = async () => {
            const newDeviceId = deviceSelect.value;
            
            // Change device
            await webcamInput.changeWebcamDevice(state.glContext, channel, newDeviceId);
            
            // Refresh UI
            const containerEl = document.getElementById(`${tabName}Container`);
            if (containerEl) {
                containerEl.innerHTML = '';
                const newSelector = await createWebcamSelector(tabName, channelNumber);
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
 * Create flip horizontal toggle
 */
function createFlipToggle(channel, tabName, previewVideo) {
    const flipSection = document.createElement('div');
    flipSection.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
    `;
    
    const label = document.createElement('label');
    label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 11px;
        color: var(--text-primary);
    `;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = channel.webcamData?.flipHorizontal || false;
    checkbox.onchange = () => {
        const flip = checkbox.checked;
        webcamInput.setFlipHorizontal(channel.webcamData, flip);
        
        // Update preview to match (flip preview so it shows what shader sees)
        // If flip is ON, shader sees mirrored, so preview should NOT be CSS-mirrored
        // If flip is OFF, shader sees unmirrored, so preview should be CSS-mirrored for selfie view
        previewVideo.style.transform = flip ? 'scaleX(1)' : 'scaleX(-1)';
    };
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode('Flip Horizontal (mirror in shader)'));
    
    flipSection.appendChild(label);
    
    return flipSection;
}

