// ============================================================================
// Microphone Input - Live audio capture from microphone
// ============================================================================
// Provides real-time audio analysis from microphone input
// Similar to audio-input.js but captures from device instead of file

import { state, saveSettings } from './core.js';
import { AUDIO_TEXTURE_MODES } from './audio-input.js';
import * as audioInput from './audio-input.js';

// Device preference storage key
const MIC_DEVICE_KEY = 'sleditor_mic_device';

/**
 * Get list of available microphone devices
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function getMicrophoneDevices() {
    try {
        // Request permission first (needed to get device labels)
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
        console.error('Failed to enumerate microphone devices:', error);
        return [];
    }
}

/**
 * Get saved microphone device ID
 * @returns {string|null}
 */
export function getSavedMicDevice() {
    return localStorage.getItem(MIC_DEVICE_KEY);
}

/**
 * Save microphone device preference
 * @param {string} deviceId
 */
export function saveMicDevice(deviceId) {
    localStorage.setItem(MIC_DEVICE_KEY, deviceId);
}

/**
 * Create microphone channel - captures audio from microphone
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {string} mode - Audio texture mode (shadertoy, chromagram, etc.)
 * @param {string} [deviceId] - Optional specific device ID
 * @returns {Promise<Object>} Mic channel data
 */
export async function createMicChannel(gl, mode = 'chromagram', deviceId = null) {
    const modeConfig = AUDIO_TEXTURE_MODES[mode] || AUDIO_TEXTURE_MODES.chromagram;
    
    // Use saved device if not specified
    if (!deviceId) {
        deviceId = getSavedMicDevice();
    }
    
    // Build constraints
    const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
    };
    
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Get the actual device ID used (in case we used 'true')
        const audioTrack = stream.getAudioTracks()[0];
        const actualDeviceId = audioTrack.getSettings().deviceId;
        
        // Save device preference
        if (actualDeviceId) {
            saveMicDevice(actualDeviceId);
        }
        
        console.log(`✓ Microphone access granted: ${audioTrack.label}`);
        
        // Create audio context if needed
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create source from stream
        const source = state.audioContext.createMediaStreamSource(stream);
        
        // Create analyser
        const analyser = state.audioContext.createAnalyser();
        analyser.fftSize = modeConfig.fftSize;
        analyser.smoothingTimeConstant = 0.8;
        
        // Connect source to analyser (no output needed - we just analyze)
        source.connect(analyser);
        
        // Create texture
        const texture = audioInput.createAudioTexture(gl, mode).texture || 
                       audioInput.createAudioTexture(gl, mode);
        
        // Create data arrays
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const waveformData = new Uint8Array(analyser.frequencyBinCount);
        
        // For chromagram modes, create grid and tracking arrays
        const isChromagram = mode.startsWith('chromagram');
        let previousFrame = null;
        let temporalAverage = null;
        
        if (isChromagram) {
            previousFrame = new Float32Array(144).fill(0);
            temporalAverage = new Float32Array(144).fill(0);
        }
        
        const micData = {
            stream,
            source,
            analyser,
            texture: texture.texture || texture,
            mode,
            width: modeConfig.width,
            height: modeConfig.height,
            frequencyData,
            waveformData,
            previousFrame,
            temporalAverage,
            deviceId: actualDeviceId,
            deviceLabel: audioTrack.label,
            active: true
        };
        
        console.log(`✓ Microphone channel created (${mode} mode, ${modeConfig.width}×${modeConfig.height})`);
        
        return micData;
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            console.error('Microphone access denied by user');
            throw new Error('Microphone permission denied');
        } else if (error.name === 'NotFoundError') {
            console.error('No microphone found');
            throw new Error('No microphone found');
        } else {
            console.error('Failed to access microphone:', error);
            throw error;
        }
    }
}

/**
 * Create mic channel with an already-obtained stream
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {string} mode - Audio texture mode
 * @param {MediaStream} stream - Already-obtained media stream
 * @returns {Promise<Object>} Mic channel data
 */
export async function createMicChannelWithStream(gl, mode = 'chromagram', stream) {
    const modeConfig = AUDIO_TEXTURE_MODES[mode] || AUDIO_TEXTURE_MODES.chromagram;
    
    // Get the actual device ID used
    const audioTrack = stream.getAudioTracks()[0];
    const actualDeviceId = audioTrack.getSettings().deviceId;
    
    // Save device preference
    if (actualDeviceId) {
        saveMicDevice(actualDeviceId);
    }
    
    console.log(`✓ Microphone access granted: ${audioTrack.label}`);
    
    // Create audio context if needed
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Create source from stream
    const source = state.audioContext.createMediaStreamSource(stream);
    
    // Create analyser
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = modeConfig.fftSize;
    analyser.smoothingTimeConstant = 0.8;
    
    // Connect source to analyser (no output needed - we just analyze)
    source.connect(analyser);
    
    // Create texture
    const texture = audioInput.createAudioTexture(gl, mode).texture || 
                   audioInput.createAudioTexture(gl, mode);
    
    // Create data arrays
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const waveformData = new Uint8Array(analyser.frequencyBinCount);
    
    // For chromagram modes, create grid and tracking arrays
    const isChromagram = mode.startsWith('chromagram');
    let previousFrame = null;
    let temporalAverage = null;
    
    if (isChromagram) {
        previousFrame = new Float32Array(144).fill(0);
        temporalAverage = new Float32Array(144).fill(0);
    }
    
    const micData = {
        stream,
        source,
        analyser,
        texture: texture.texture || texture,
        mode,
        width: modeConfig.width,
        height: modeConfig.height,
        frequencyData,
        waveformData,
        previousFrame,
        temporalAverage,
        deviceId: actualDeviceId,
        deviceLabel: audioTrack.label,
        active: true
    };
    
    console.log(`✓ Microphone channel created with stream (${mode} mode, ${modeConfig.width}×${modeConfig.height})`);
    
    return micData;
}

/**
 * Update microphone texture with current audio data
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {Object} micData - Mic channel data
 * @param {Float32Array} [previousFrame] - Previous frame for delta calculation
 * @param {Float32Array} [temporalAverage] - Temporal average array
 */
export function updateMicTexture(gl, micData, previousFrame, temporalAverage) {
    if (!micData || !micData.active || !micData.analyser) return;
    
    // Use the shared audio texture update function
    // Pass width, height, and mode - the function will get frequency data itself
    audioInput.updateAudioTexture(
        gl,
        micData.texture,
        micData.analyser,
        micData.width,
        micData.height,
        micData.mode,
        previousFrame || micData.previousFrame,
        temporalAverage || micData.temporalAverage
    );
}

/**
 * Stop microphone capture and cleanup
 * @param {Object} micData - Mic channel data
 */
export function stopMicChannel(micData) {
    if (!micData) return;
    
    console.log('Stopping microphone channel');
    
    micData.active = false;
    
    // Stop all tracks
    if (micData.stream) {
        micData.stream.getTracks().forEach(track => {
            track.stop();
            console.log(`✓ Stopped track: ${track.label}`);
        });
    }
    
    // Disconnect audio nodes
    if (micData.source) {
        try {
            micData.source.disconnect();
        } catch (e) {
            // Already disconnected
        }
    }
    
    // Clean up texture
    if (micData.texture && state.glContext) {
        state.glContext.deleteTexture(micData.texture);
        micData.texture = null;
    }
}

/**
 * Change microphone device
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {Object} channel - Channel object
 * @param {string} deviceId - New device ID
 */
export async function changeMicDevice(gl, channel, deviceId) {
    // Stop current mic
    if (channel.micData) {
        stopMicChannel(channel.micData);
    }
    
    // Create new mic channel with new device
    const mode = channel.audioMode || 'chromagram';
    channel.micData = await createMicChannel(gl, mode, deviceId);
    channel.texture = channel.micData.texture;
    channel.resolution = { 
        width: channel.micData.width, 
        height: channel.micData.height 
    };
    
    return channel.micData;
}

