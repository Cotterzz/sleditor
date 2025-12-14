// ============================================================================
// Webcam Input - Live video capture from webcam
// ============================================================================
// Provides real-time video frames from webcam as textures
// Similar to video-input.js but captures from device instead of file

import { state } from './core.js';

// Device preference storage keys
const WEBCAM_DEVICE_KEY = 'sleditor_webcam_device';
const WEBCAM_FLIP_KEY = 'sleditor_webcam_flip';

/**
 * Get saved flip horizontal setting
 * @returns {boolean}
 */
export function getSavedFlipHorizontal() {
    return localStorage.getItem(WEBCAM_FLIP_KEY) === 'true';
}

/**
 * Save flip horizontal preference
 * @param {boolean} flip
 */
export function saveFlipHorizontal(flip) {
    localStorage.setItem(WEBCAM_FLIP_KEY, flip ? 'true' : 'false');
}

/**
 * Get list of available webcam devices
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function getWebcamDevices() {
    try {
        // Request permission first (needed to get device labels)
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
        console.error('Failed to enumerate webcam devices:', error);
        return [];
    }
}

/**
 * Get saved webcam device ID
 * @returns {string|null}
 */
export function getSavedWebcamDevice() {
    return localStorage.getItem(WEBCAM_DEVICE_KEY);
}

/**
 * Save webcam device preference
 * @param {string} deviceId
 */
export function saveWebcamDevice(deviceId) {
    localStorage.setItem(WEBCAM_DEVICE_KEY, deviceId);
}

/**
 * Create webcam texture for WebGL
 * Matches video-input.js approach exactly
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @returns {WebGLTexture}
 */
export function createWebcamTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Create 1x1 placeholder (will be replaced when video uploads)
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
    );
    
    // Use NEAREST filtering to match video-input.js exactly
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    return texture;
}

/**
 * Create webcam channel - captures video from webcam
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {string} [deviceId] - Optional specific device ID
 * @returns {Promise<Object>} Webcam channel data
 */
export async function createWebcamChannel(gl, deviceId = null) {
    // Use saved device if not specified
    if (!deviceId) {
        deviceId = getSavedWebcamDevice();
    }
    
    // Build constraints
    const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
        },
        audio: false
    };
    
    // If we have a deviceId, add resolution constraints
    if (deviceId) {
        constraints.video = {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        };
    }
    
    try {
        // Request webcam access
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Get the actual device ID used
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        const actualDeviceId = settings.deviceId;
        
        // Save device preference
        if (actualDeviceId) {
            saveWebcamDevice(actualDeviceId);
        }
        
        console.log(`✓ Webcam access granted: ${videoTrack.label}`);
        
        // Create texture first (like video-input.js)
        const texture = createWebcamTexture(gl);
        
        // Create video element for the stream
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        
        // Wait for video to actually be playing with valid frame data
        await new Promise((resolve, reject) => {
            let isResolved = false;
            
            const onPlaying = () => {
                if (isResolved) return;
                isResolved = true;
                video.removeEventListener('playing', onPlaying);
                
                const width = video.videoWidth;
                const height = video.videoHeight;
                
                console.log(`✓ Webcam stream ready: ${width}×${height}`);
                
                // Small delay to ensure frame is fully rendered
                requestAnimationFrame(() => {
                    resolve({ width, height });
                });
            };
            
            video.addEventListener('playing', onPlaying);
            video.addEventListener('error', (e) => {
                if (isResolved) return;
                isResolved = true;
                reject(e);
            });
            
            // Start playback
            video.play().catch(reject);
        });
        
        const width = video.videoWidth;
        const height = video.videoHeight;
        
        // Create canvas buffer for consistent texture uploads
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const canvasCtx = canvas.getContext('2d');
        
        // Upload first frame via canvas (with optional flip)
        const flipH = getSavedFlipHorizontal();
        if (flipH) {
            canvasCtx.save();
            canvasCtx.scale(-1, 1);
            canvasCtx.drawImage(video, -width, 0, width, height);
            canvasCtx.restore();
        } else {
            canvasCtx.drawImage(video, 0, 0, width, height);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
        
        const webcamData = {
            stream,
            video,
            texture,
            width,
            height,
            canvas,
            canvasCtx,
            deviceId: actualDeviceId,
            deviceLabel: videoTrack.label,
            flipHorizontal: getSavedFlipHorizontal(),
            active: true
        };
        
        console.log(`✓ Webcam channel created (${width}×${height})`);
        
        return webcamData;
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            console.error('Webcam access denied by user');
            throw new Error('Webcam permission denied');
        } else if (error.name === 'NotFoundError') {
            console.error('No webcam found');
            throw new Error('No webcam found');
        } else if (error.name === 'NotReadableError') {
            console.error('Webcam is in use by another application');
            throw new Error('Webcam in use');
        } else {
            console.error('Failed to access webcam:', error);
            throw error;
        }
    }
}

/**
 * Create webcam channel with an already-obtained stream
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {MediaStream} stream - Already-obtained media stream
 * @returns {Promise<Object>} Webcam channel data
 */
export async function createWebcamChannelWithStream(gl, stream) {
    // Get the actual device ID used
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const actualDeviceId = settings.deviceId;
    
    // Save device preference
    if (actualDeviceId) {
        saveWebcamDevice(actualDeviceId);
    }
    
    console.log(`✓ Webcam access granted: ${videoTrack.label}`);
    
    // Create texture first (like video-input.js)
    const texture = createWebcamTexture(gl);
    
    // Create video element for the stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    
    // Wait for video to actually be playing with valid frame data
    await new Promise((resolve, reject) => {
        let isResolved = false;
        
        const onPlaying = () => {
            if (isResolved) return;
            isResolved = true;
            video.removeEventListener('playing', onPlaying);
            
            const width = video.videoWidth;
            const height = video.videoHeight;
            
            console.log(`✓ Webcam stream ready: ${width}×${height}`);
            
            // Small delay to ensure frame is fully rendered
            requestAnimationFrame(() => {
                resolve({ width, height });
            });
        };
        
        video.addEventListener('playing', onPlaying);
        video.addEventListener('error', (e) => {
            if (isResolved) return;
            isResolved = true;
            reject(e);
        });
        
        // Start playback
        video.play().catch(reject);
    });
    
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Create canvas buffer for consistent texture uploads
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const canvasCtx = canvas.getContext('2d');
    
    // Upload first frame via canvas (with optional flip)
    const flipH = getSavedFlipHorizontal();
    if (flipH) {
        canvasCtx.save();
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(video, -width, 0, width, height);
        canvasCtx.restore();
    } else {
        canvasCtx.drawImage(video, 0, 0, width, height);
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    const webcamData = {
        stream,
        video,
        texture,
        width,
        height,
        canvas,
        canvasCtx,
        deviceId: actualDeviceId,
        deviceLabel: videoTrack.label,
        flipHorizontal: getSavedFlipHorizontal(),
        active: true
    };
    
    console.log(`✓ Webcam channel created with stream (${width}×${height})`);
    
    return webcamData;
}

/**
 * Update webcam texture with current frame
 * Uses canvas as intermediate buffer to normalize webcam data from various formats
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {Object} webcamData - Webcam channel data
 */
export function updateWebcamTexture(gl, webcamData) {
    if (!webcamData || !webcamData.active || !webcamData.video) return;
    
    const video = webcamData.video;
    
    // Only update if we have a current frame
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
        // Check if video dimensions changed (can happen with some webcams)
        if (video.videoWidth !== webcamData.width || video.videoHeight !== webcamData.height) {
            webcamData.width = video.videoWidth;
            webcamData.height = video.videoHeight;
            // Resize canvas buffer if dimensions changed
            if (webcamData.canvas) {
                webcamData.canvas.width = webcamData.width;
                webcamData.canvas.height = webcamData.height;
            }
            console.log(`Webcam dimensions updated: ${webcamData.width}×${webcamData.height}`);
        }
        
        // Use canvas as intermediate buffer (normalizes webcam data formats)
        if (!webcamData.canvas) {
            webcamData.canvas = document.createElement('canvas');
            webcamData.canvas.width = webcamData.width;
            webcamData.canvas.height = webcamData.height;
            webcamData.canvasCtx = webcamData.canvas.getContext('2d');
        }
        
        // Draw video to canvas (with optional horizontal flip)
        if (webcamData.flipHorizontal) {
            webcamData.canvasCtx.save();
            webcamData.canvasCtx.scale(-1, 1);
            webcamData.canvasCtx.drawImage(video, -webcamData.width, 0, webcamData.width, webcamData.height);
            webcamData.canvasCtx.restore();
        } else {
            webcamData.canvasCtx.drawImage(video, 0, 0, webcamData.width, webcamData.height);
        }
        
        // Upload canvas to texture
        gl.bindTexture(gl.TEXTURE_2D, webcamData.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            webcamData.canvas
        );
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

/**
 * Stop webcam capture and cleanup
 * @param {Object} webcamData - Webcam channel data
 */
export function stopWebcamChannel(webcamData) {
    if (!webcamData) return;
    
    console.log('Stopping webcam channel');
    
    webcamData.active = false;
    
    // Stop all tracks
    if (webcamData.stream) {
        webcamData.stream.getTracks().forEach(track => {
            track.stop();
            console.log(`✓ Stopped track: ${track.label}`);
        });
    }
    
    // Clean up video element
    if (webcamData.video) {
        webcamData.video.srcObject = null;
        webcamData.video.src = '';
        if (webcamData.video.parentNode) {
            webcamData.video.parentNode.removeChild(webcamData.video);
        }
    }
    
    // Clean up texture
    if (webcamData.texture && state.glContext) {
        state.glContext.deleteTexture(webcamData.texture);
        webcamData.texture = null;
    }
}

/**
 * Set flip horizontal on webcam data
 * @param {Object} webcamData - Webcam channel data
 * @param {boolean} flip - Whether to flip horizontally
 */
export function setFlipHorizontal(webcamData, flip) {
    if (!webcamData) return;
    webcamData.flipHorizontal = flip;
    saveFlipHorizontal(flip);
}

/**
 * Change webcam device
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {Object} channel - Channel object
 * @param {string} deviceId - New device ID
 */
export async function changeWebcamDevice(gl, channel, deviceId) {
    // Stop current webcam
    if (channel.webcamData) {
        stopWebcamChannel(channel.webcamData);
    }
    
    // Create new webcam channel with new device
    channel.webcamData = await createWebcamChannel(gl, deviceId);
    channel.texture = channel.webcamData.texture;
    channel.resolution = { 
        width: channel.webcamData.width, 
        height: channel.webcamData.height 
    };
    
    return channel.webcamData;
}

