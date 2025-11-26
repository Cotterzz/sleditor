// ============================================================================
// Video Input - Video channel management and texture generation
// ============================================================================
// Provides video playback as textures for shader input

import { state } from './core.js';

/**
 * Create video texture for WebGL
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @returns {WebGLTexture} Empty texture (will be updated each frame)
 */
export function createVideoTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Create empty texture (will be populated when video loads)
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
    
    // Use nearest filtering (like buffer passes, no mipmaps)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    return texture;
}

/**
 * Load video and create video element
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {string} videoPath - Path to video file
 * @returns {Promise<Object>} Video channel data
 */
export async function loadVideoChannel(gl, videoPath) {
    return new Promise((resolve, reject) => {
        // Create texture first
        const texture = createVideoTexture(gl);
        
        // Create video element
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.loop = false; // Default to no loop (can be changed by user)
        video.muted = true; // Always muted (we ignore video audio)
        video.preload = 'auto';
        video.playsInline = true; // Important for mobile
        
        let isResolved = false;
        
        // When first frame is loaded
        video.addEventListener('loadeddata', () => {
            if (isResolved) return;
            isResolved = true;
            
            const width = video.videoWidth;
            const height = video.videoHeight;
            
            console.log(`✓ Video loaded: ${videoPath} (${width}×${height})`);
            
            // Upload first frame to texture (with vertical flip)
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip Y by default
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                video
            );
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // Reset
            gl.bindTexture(gl.TEXTURE_2D, null);
            
            resolve({
                texture,
                video,
                width,
                height,
                playing: false,
                loop: false
            });
        });
        
        video.addEventListener('error', (e) => {
            if (isResolved) return;
            isResolved = true;
            
            console.error(`Failed to load video: ${videoPath}`, e);
            reject(new Error(`Failed to load video: ${videoPath}`));
        });
        
        // Start loading
        video.src = videoPath;
    });
}

/**
 * Update video texture with current frame
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to update
 * @param {HTMLVideoElement} video - Video element
 */
export function updateVideoTexture(gl, texture, video) {
    // Only update if we have a current frame
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip Y by default
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            video
        );
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // Reset
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

/**
 * Play video channel
 * @param {Object} channel - Channel with videoData
 * @returns {Promise<void>}
 */
export async function playVideoChannel(channel) {
    if (!channel.videoData || !channel.videoData.video) {
        console.warn('Cannot play video: channel or video element missing');
        return;
    }
    
    const video = channel.videoData.video;
    
    try {
        await video.play();
        channel.videoData.playing = true;
        console.log('✓ Video playing');
    } catch (error) {
        console.warn('Video play failed:', error);
        throw error; // Let caller handle autoplay restrictions
    }
}

/**
 * Pause video channel
 * @param {Object} channel - Channel with videoData
 */
export function pauseVideoChannel(channel) {
    if (!channel.videoData || !channel.videoData.video) {
        return;
    }
    
    const video = channel.videoData.video;
    video.pause();
    channel.videoData.playing = false;
    console.log('✓ Video paused');
}

/**
 * Restart video (seek to beginning)
 * @param {Object} channel - Channel with videoData
 */
export function restartVideoChannel(channel) {
    if (!channel.videoData || !channel.videoData.video) {
        return;
    }
    
    const video = channel.videoData.video;
    video.currentTime = 0;
    console.log('✓ Video restarted (seeked to 0)');
}

/**
 * Set video loop state
 * @param {Object} channel - Channel with videoData
 * @param {boolean} loop - Whether to loop
 */
export function setVideoLoop(channel, loop) {
    if (!channel.videoData || !channel.videoData.video) {
        return;
    }
    
    channel.videoData.video.loop = loop;
    channel.videoData.loop = loop;
}

/**
 * Cleanup video channel resources
 * @param {Object} channel - Channel with videoData
 */
export function cleanupVideoChannel(channel) {
    if (!channel.videoData) return;
    
    console.log('Cleaning up video channel:', channel.number);
    
    const video = channel.videoData.video;
    if (video) {
        // Pause and reset
        video.pause();
        video.currentTime = 0;
        
        // Clear source to release resources
        video.src = '';
        video.load();
        
        // Remove from DOM if attached
        if (video.parentNode) {
            video.parentNode.removeChild(video);
        }
    }
    
    // Clean up WebGL texture
    if (channel.texture && state.glContext) {
        state.glContext.deleteTexture(channel.texture);
        channel.texture = null;
    }
    
    channel.videoData = null;
}

