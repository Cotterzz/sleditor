// ============================================================================
// Channels - Channel/buffer management and coordination
// ============================================================================

import { state } from './core.js';
import * as mediaLoader from './media-loader.js';
import * as audioInput from './audio-input.js';
import * as videoInput from './video-input.js';
import * as micInput from './mic-input.js';
import * as webcamInput from './webcam-input.js';
import * as keyboardInput from './keyboard-input.js';
import * as volumeInput from './volume-input.js';

// Channel state
const channelState = {
    channels: [],           // Array of channel objects
    nextChannelNumber: 1,   // Next available channel number (0 is reserved for main)
    selectedOutputChannel: 0 // Which channel to display
};

function emitChannelChangeEvent(detail = {}) {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('channels-changed', { detail }));
    }
}

/**
 * Create a WebGL texture for buffer rendering
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {number} width - Texture width
 * @param {number} height - Texture height
 * @returns {WebGLTexture} Created texture
 */
function createBufferTexture(gl, width, height) {
    // Always try to enable float render targets (RGBA32F); fall back to RGBA16F if unavailable
    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) {
        console.warn('EXT_color_buffer_float not available - using RGBA16F for buffer textures');
    }
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    const internalFormat = floatExt ? gl.RGBA32F : gl.RGBA16F;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.FLOAT, null);
    
    // Buffers are used primarily for data passing, so default to NEAREST filtering.
    // If users request smoother sampling (linear/mipmap/aniso), we'll revisit and
    // re-enable the extension checks + live options UI.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    return texture;
}

function getBufferChannelsSortedLeftToRight() {
    const buffers = channelState.channels.filter(ch => ch.type === 'buffer' && ch.number !== 0);
    return buffers.sort((a, b) => {
        const aIndex = a.tabName ? state.activeTabs.indexOf(a.tabName) : Number.MAX_SAFE_INTEGER;
        const bIndex = b.tabName ? state.activeTabs.indexOf(b.tabName) : Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
    });
}

function ensureChannelTexturesInternal(channel, width, height) {
    if (!channel || channel.type !== 'buffer') {
        return channel;
    }
    
    const gl = state.glContext;
    if (!gl) {
        console.warn('Cannot create buffer textures - WebGL not ready');
        return null;
    }
    
    const targetWidth = width || state.canvasWidth;
    const targetHeight = height || state.canvasHeight;
    
    if (!channel.textures) {
        channel.textures = [
            createBufferTexture(gl, targetWidth, targetHeight),
            createBufferTexture(gl, targetWidth, targetHeight)
        ];
        channel.currentPing = 0;
        channel.resolution = { width: targetWidth, height: targetHeight };
        console.log(`✓ Buffer textures created for ch${channel.number} (${targetWidth}×${targetHeight})`);
    }
    
    return channel;
}

/**
 * Initialize channels system
 */
export function init() {
    console.log('Initializing channels system');
    
    // Create main buffer channel (ch0) without textures yet
    // Textures will be created by initMainBufferTextures() after WebGL is ready
    channelState.channels.push({
        number: 0,
        type: 'buffer',
        name: 'Main(ch0)',
        tabName: null, // Set when shader loads
        resolution: { width: state.canvasWidth, height: state.canvasHeight },
        textures: null, // Will be created by initMainBufferTextures()
        framebuffer: null, // Created in webgl.js
        currentPing: 0
    });
    
    emitChannelChangeEvent();
}

/**
 * Initialize ping-pong textures for main buffer (ch0)
 * Must be called AFTER WebGL context is initialized
 * @returns {boolean} Success
 */
export function initMainBufferTextures() {
    const gl = state.glContext;
    if (!gl) {
        console.warn('Cannot init main buffer textures - WebGL not ready');
        return false;
    }
    
    const ch0 = channelState.channels.find(ch => ch.number === 0);
    if (!ch0) {
        console.error('Main buffer channel (ch0) not found!');
        return false;
    }
    
    // If already initialized, skip
    if (ch0.textures) {
        console.log('Main buffer textures already initialized');
        return true;
    }
    
    const width = state.canvasWidth;
    const height = state.canvasHeight;
    
    // Create ping-pong texture pair
    const texture0 = createBufferTexture(gl, width, height);
    const texture1 = createBufferTexture(gl, width, height);
    
    ch0.textures = [texture0, texture1];
    ch0.resolution = { width, height };
    ch0.currentPing = 0;
    
    console.log(`✓ Main buffer textures initialized (${width}×${height}, ping-pong pair)`);
    return true;
}

/**
 * Create a new channel
 * @param {string} type - 'image', 'video', or 'buffer'
 * @param {Object} data - Channel-specific data
 * @returns {number} Channel number
 */
export async function createChannel(type, data) {
    const channelNumber = channelState.nextChannelNumber;
    
    const channel = {
        number: channelNumber,
        type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)}(ch${channelNumber})`,
        tabName: data.tabName || `${type}_ch${channelNumber}`,
        resolution: null,
        texture: null,
        textures: null, // For ping-pong (buffers only)
        framebuffer: null,
        currentPing: 0,
        // Texture options (for images/videos)
        vflip: data.vflip !== undefined ? data.vflip : true, // Default ON (Shadertoy style)
        wrap: data.wrap || 'repeat', // 'repeat', 'clamp', or 'mirror'
        filter: data.filter || 'mipmap', // 'mipmap', 'linear', or 'nearest'
        anisotropic: data.anisotropic !== undefined ? data.anisotropic : false
    };
    
    if (type === 'image') {
        // Load image texture - use state.glContext if available, otherwise get from canvas
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available - state.glContext:', !!state.glContext, 'canvas:', !!state.canvasWebGL);
            return -1;
        }
        
        console.log(`Creating channel ${channelNumber}: WebGL context available:`, !!gl);
        
        try {
            if (data.mediaId) {
                // User selected a specific image
                const mediaInfo = mediaLoader.getMediaInfo(data.mediaId);
                if (mediaInfo) {
                    const textureOptions = {
                        vflip: channel.vflip,
                        wrap: channel.wrap,
                        filter: channel.filter,
                        anisotropic: channel.anisotropic
                    };
                    channel.texture = await mediaLoader.loadImageTexture(gl, mediaInfo.path, textureOptions);
                    channel.resolution = { width: mediaInfo.width, height: mediaInfo.height };
                    channel.mediaId = data.mediaId;
                    channel.mediaPath = mediaInfo.path;
                } else {
                    console.warn(`Media not found: ${data.mediaId}, using fallback`);
                    channel.texture = mediaLoader.createFallbackTexture(gl);
                    channel.resolution = { width: 256, height: 256 };
                }
            } else {
                // No media selected yet - use fallback silently
                channel.texture = mediaLoader.createFallbackTexture(gl);
                channel.resolution = { width: 256, height: 256 };
                channel.mediaId = null;
            }
        } catch (error) {
            console.error('Failed to load image:', error);
            channel.texture = mediaLoader.createFallbackTexture(gl);
            channel.resolution = { width: 256, height: 256 };
        }
    } else if (type === 'video') {
        // Load video texture
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available for video channel');
            return -1;
        }
        
        console.log(`Creating video channel ${channelNumber}: WebGL context available:`, !!gl);
        
        try {
            if (data.mediaId) {
                // User selected a specific video file
                const mediaInfo = mediaLoader.getMediaInfo(data.mediaId);
                if (mediaInfo) {
                    const videoData = await videoInput.loadVideoChannel(gl, mediaInfo.path);
                    channel.texture = videoData.texture;
                    channel.videoData = videoData;
                    channel.resolution = { width: videoData.width, height: videoData.height };
                    channel.mediaId = data.mediaId;
                    
                    // Set loop if specified
                    if (data.loop !== undefined) {
                        videoInput.setVideoLoop(channel, data.loop);
                    }
                    
                    console.log(`✓ Video channel loaded: ${mediaInfo.name} (${videoData.width}×${videoData.height})`);
                } else {
                    // MediaId not found, use fallback
                    channel.texture = mediaLoader.createFallbackTexture(gl);
                    channel.resolution = { width: 256, height: 256 };
                    channel.mediaId = null;
                }
            } else {
                // No media selected yet - use fallback silently
                channel.texture = mediaLoader.createFallbackTexture(gl);
                channel.resolution = { width: 256, height: 256 };
                channel.mediaId = null;
            }
        } catch (error) {
            console.error('Failed to load video:', error);
            channel.texture = mediaLoader.createFallbackTexture(gl);
            channel.resolution = { width: 256, height: 256 };
            channel.mediaId = null;
        }
        
        // Auto-play if shader is running and media start unlocked
        if (channel.videoData && state.isPlaying && state.mediaStartUnlocked) {
            videoInput.playVideoChannel(channel).catch(err => {
                console.warn(`Failed to auto-play video channel ch${channelNumber}:`, err);
            });
        }
    } else if (type === 'audio') {
        // Load audio texture
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available for audio channel');
            return -1;
        }
        
        console.log(`Creating audio channel ${channelNumber}: WebGL context available:`, !!gl);
        
        // Store audio mode preference
        channel.audioMode = data.audioMode || 'shadertoy';
        
        try {
            if (data.mediaId) {
                // User selected a specific audio file
                const mediaInfo = mediaLoader.getMediaInfo(data.mediaId);
                if (mediaInfo) {
                    const audioData = await audioInput.loadAudioChannel(gl, mediaInfo.path, channel.audioMode);
                    channel.texture = audioData.texture;
                    channel.audioData = audioData;
                    channel.resolution = { width: audioData.width, height: audioData.height };
                    channel.mediaId = data.mediaId;
                    channel.mediaPath = mediaInfo.path;
                    console.log(`✓ Audio channel loaded: ${mediaInfo.name} (${audioData.width}×${audioData.height})`);
                } else {
                    console.warn(`Audio media not found: ${data.mediaId}, using silent fallback`);
                    // Create empty audio texture as fallback
                    const { texture, width, height } = audioInput.createAudioTexture(gl, channel.audioMode);
                    channel.texture = texture;
                    channel.resolution = { width, height };
                }
            } else {
                // No audio selected yet - create empty texture
                const { texture, width, height } = audioInput.createAudioTexture(gl, channel.audioMode);
                channel.texture = texture;
                channel.resolution = { width, height };
                channel.mediaId = null;
            }
        } catch (error) {
            console.error('Failed to load audio:', error);
            // Fallback to empty texture
            const { texture, width, height } = audioInput.createAudioTexture(gl, channel.audioMode);
            channel.texture = texture;
            channel.resolution = { width, height };
        }
        
        // Auto-play if shader is running and media start unlocked
        if (channel.audioData && state.isPlaying && state.mediaStartUnlocked) {
            audioInput.playAudioChannel(channel.audioData).catch(err => {
                console.warn(`Failed to auto-play audio channel ch${channelNumber}:`, err);
            });
        }
    } else if (type === 'buffer') {
        channel.resolution = { width: state.canvasWidth, height: state.canvasHeight };
        channel.textures = null; // Created lazily when rendering
        channel.framebuffer = null;
        console.log(`Buffer channel stub created: ch${channelNumber}`);
    } else if (type === 'mic') {
        // Microphone input channel - doesn't auto-start, requires user interaction
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available for mic channel');
            return -1;
        }
        
        // Store audio mode preference (default to chromagram for mic)
        channel.audioMode = data.audioMode || 'chromagram';
        
        // Create empty texture - mic will be started on user click
        const textureResult = audioInput.createAudioTexture(gl, channel.audioMode);
        channel.texture = textureResult.texture || textureResult;
        const modeConfig = audioInput.AUDIO_TEXTURE_MODES[channel.audioMode];
        channel.resolution = { width: modeConfig.width, height: modeConfig.height };
        channel.micData = null; // Will be populated when mic starts
        
        console.log(`Mic channel stub created: ch${channelNumber} (awaiting user activation)`);
    } else if (type === 'webcam') {
        // Webcam input channel - doesn't auto-start, requires user interaction
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available for webcam channel');
            return -1;
        }
        
        // Create fallback texture - webcam will be started on user click
        channel.texture = mediaLoader.createFallbackTexture(gl);
        channel.resolution = { width: 256, height: 256 };
        channel.webcamData = null; // Will be populated when webcam starts
        
        console.log(`Webcam channel stub created: ch${channelNumber} (awaiting user activation)`);
    } else if (type === 'keyboard') {
        // Keyboard input channel - initializes immediately (no permissions needed)
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available for keyboard channel');
            return -1;
        }
        
        // Create keyboard channel (starts immediately)
        channel.keyboardData = keyboardInput.createKeyboardChannel(gl);
        channel.texture = channel.keyboardData.texture;
        channel.resolution = { width: 256, height: 3 };
        
        console.log(`✓ Keyboard channel created: ch${channelNumber}`);
    } else if (type === 'volume') {
        // Volume (3D texture) channel
        let gl = state.glContext;
        if (!gl) {
            console.warn('state.glContext not set, trying to get from canvas...');
            gl = state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
        }
        
        if (!gl) {
            console.error('WebGL context not available for volume channel');
            return -1;
        }
        
        // Create volume channel with default texture
        const volumeId = data?.volumeId || 'grey_noise_32';
        try {
            channel.volumeData = await volumeInput.createVolumeChannel(gl, volumeId);
            channel.texture = channel.volumeData.texture;
            channel.resolution = { 
                width: channel.volumeData.width, 
                height: channel.volumeData.height,
                depth: channel.volumeData.depth 
            };
            channel.is3D = true; // Mark as 3D texture
            console.log(`✓ Volume channel created: ch${channelNumber} (${volumeId})`);
        } catch (error) {
            console.error('Failed to create volume channel:', error);
            return -1;
        }
    }
    
    channelState.channels.push(channel);
    channelState.nextChannelNumber++; // Only increment after successful creation
    console.log(`✓ Channel created: ch${channelNumber} (${type})`);
    emitChannelChangeEvent({ action: 'create', channel });
    
    return channelNumber;
}

/**
 * Delete a channel
 * @param {number} channelNumber - Channel to delete
 */
export function deleteChannel(channelNumber) {
    const index = channelState.channels.findIndex(ch => ch.number === channelNumber);
    if (index === -1) {
        console.warn(`Channel ${channelNumber} not found`);
        return;
    }
    
    const channel = channelState.channels[index];
    
    // Cleanup audio resources
    if (channel.type === 'audio' && channel.audioData) {
        audioInput.cleanupAudioChannel(channel.audioData);
    }
    
    // Cleanup video resources
    if (channel.type === 'video' && channel.videoData) {
        videoInput.cleanupVideoChannel(channel);
    }
    
    // Cleanup mic resources
    if (channel.type === 'mic' && channel.micData) {
        micInput.stopMicChannel(channel.micData);
    }
    
    // Cleanup webcam resources
    if (channel.type === 'webcam' && channel.webcamData) {
        webcamInput.stopWebcamChannel(channel.webcamData);
    }
    
    // Cleanup keyboard resources
    if (channel.type === 'keyboard' && channel.keyboardData) {
        keyboardInput.stopKeyboardChannel(channel.keyboardData);
    }
    
    // Cleanup volume resources
    if (channel.type === 'volume' && channel.volumeData) {
        volumeInput.cleanupVolumeChannel(channel.volumeData);
    }
    
    // Cleanup WebGL resources
    const gl = state.graphicsBackend === 'webgl' ? state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl') : null;
    
    if (channel.texture && gl) {
        gl.deleteTexture(channel.texture);
    }
    
    if (channel.textures && gl) {
        channel.textures.forEach(tex => {
            if (tex) {
                gl.deleteTexture(tex);
            }
        });
        channel.textures = null;
    }
    
    // Remove from array
    channelState.channels.splice(index, 1);
    if (channelState.selectedOutputChannel === channelNumber) {
        channelState.selectedOutputChannel = 0;
    }
    
    console.log(`✓ Channel deleted: ch${channelNumber}`);
    emitChannelChangeEvent({ action: 'delete', channelNumber });
}

/**
 * Update an existing channel's media
 * @param {number} channelNumber - Channel to update
 * @param {string} mediaId - New media ID
 * @returns {boolean} Success
 */
export async function updateChannelMedia(channelNumber, mediaId) {
    const channel = channelState.channels.find(ch => ch.number === channelNumber);
    if (!channel) {
        console.warn(`Channel ${channelNumber} not found`);
        return false;
    }
    
    const gl = state.glContext || state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
    if (!gl) {
        console.error('WebGL context not available');
        return false;
    }
    
    // Handle audio channels
    if (channel.type === 'audio') {
        // Cleanup old audio
        if (channel.audioData) {
            audioInput.cleanupAudioChannel(channel.audioData);
        }
        
        // Delete old texture
        if (channel.texture) {
            gl.deleteTexture(channel.texture);
        }
        
        try {
            if (mediaId) {
                const mediaInfo = mediaLoader.getMediaInfo(mediaId);
                if (mediaInfo) {
                    const audioMode = channel.audioMode || 'shadertoy';
                    const audioData = await audioInput.loadAudioChannel(gl, mediaInfo.path, audioMode);
                    channel.texture = audioData.texture;
                    channel.audioData = audioData;
                    channel.resolution = { width: audioData.width, height: audioData.height };
                    channel.mediaId = mediaId;
                    channel.mediaPath = mediaInfo.path;
                    console.log(`✓ Audio channel updated: ch${channelNumber} → ${mediaInfo.name}`);
                    return true;
                } else {
                    console.warn(`Audio media not found: ${mediaId}`);
                    const { texture, width, height } = audioInput.createAudioTexture(gl, channel.audioMode || 'shadertoy');
                    channel.texture = texture;
                    channel.resolution = { width, height };
                    channel.mediaId = null;
                    return false;
                }
            } else {
                // Clear to empty audio texture
                const { texture, width, height } = audioInput.createAudioTexture(gl, channel.audioMode || 'shadertoy');
                channel.texture = texture;
                channel.resolution = { width, height };
                channel.mediaId = null;
                console.log(`✓ Audio channel cleared: ch${channelNumber}`);
                return true;
            }
        } catch (error) {
            console.error('Failed to update audio channel:', error);
            const { texture, width, height } = audioInput.createAudioTexture(gl, channel.audioMode || 'shadertoy');
            channel.texture = texture;
            channel.resolution = { width, height };
            return false;
        }
    }
    
    // Handle image channels
    if (channel.type !== 'image') {
        console.warn(`Unsupported channel type for media update (ch${channelNumber} is ${channel.type})`);
        return false;
    }
    
    // Delete old texture
    if (channel.texture) {
        gl.deleteTexture(channel.texture);
    }
    
    // Load new texture with current options
    try {
        if (mediaId) {
            const mediaInfo = mediaLoader.getMediaInfo(mediaId);
            if (mediaInfo) {
                const textureOptions = {
                    vflip: channel.vflip,
                    wrap: channel.wrap,
                    filter: channel.filter,
                    anisotropic: channel.anisotropic
                };
                channel.texture = await mediaLoader.loadImageTexture(gl, mediaInfo.path, textureOptions);
                channel.resolution = { width: mediaInfo.width, height: mediaInfo.height };
                channel.mediaId = mediaId;
                channel.mediaPath = mediaInfo.path;
                console.log(`✓ Channel updated: ch${channelNumber} → ${mediaInfo.name}`);
                return true;
            } else {
                console.warn(`Media not found: ${mediaId}, using fallback`);
                channel.texture = mediaLoader.createFallbackTexture(gl);
                channel.resolution = { width: 256, height: 256 };
                channel.mediaId = null;
                return false;
            }
        } else {
            // Clear to fallback
            channel.texture = mediaLoader.createFallbackTexture(gl);
            channel.resolution = { width: 256, height: 256 };
            channel.mediaId = null;
            console.log(`✓ Channel cleared: ch${channelNumber}`);
            return true;
        }
    } catch (error) {
        console.error('Failed to update channel:', error);
        channel.texture = mediaLoader.createFallbackTexture(gl);
        channel.resolution = { width: 256, height: 256 };
        return false;
    }
}

/**
 * Update texture options for a channel (live update without reloading image)
 * @param {number} channelNumber - Channel to update
 * @param {Object} options - New texture options {vflip, wrap, filter, anisotropic}
 * @returns {boolean} Success
 */
export function updateTextureOptions(channelNumber, options) {
    const channel = channelState.channels.find(ch => ch.number === channelNumber);
    if (!channel) {
        console.warn(`Channel ${channelNumber} not found`);
        return false;
    }
    
    if (channel.type !== 'image') {
        console.warn(`Only image channels have texture options (ch${channelNumber} is ${channel.type})`);
        return false;
    }
    
    const gl = state.glContext || state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
    if (!gl || !channel.texture) {
        console.error('WebGL context or texture not available');
        return false;
    }
    
    // Update channel options
    if (options.vflip !== undefined) channel.vflip = options.vflip;
    if (options.wrap !== undefined) channel.wrap = options.wrap;
    if (options.filter !== undefined) channel.filter = options.filter;
    if (options.anisotropic !== undefined) channel.anisotropic = options.anisotropic;
    
    // For vflip, need to reload the texture
    if (options.vflip !== undefined && channel.mediaId) {
        // Reload texture with new vflip setting
        updateChannelMedia(channelNumber, channel.mediaId);
    } else {
        // For other options, just update texture parameters (no reload needed)
        const textureOptions = {
            vflip: channel.vflip,
            wrap: channel.wrap,
            filter: channel.filter,
            anisotropic: channel.anisotropic
        };
        mediaLoader.applyTextureParameters(gl, channel.texture, textureOptions);
        console.log(`✓ Texture options updated for ch${channelNumber}`);
    }
    
    return true;
}

/**
 * Get channel by number
 * @param {number} channelNumber - Channel number
 * @returns {Object|null} Channel object or null
 */
export function getChannel(channelNumber) {
    return channelState.channels.find(ch => ch.number === channelNumber) || null;
}

/**
 * Get all channels
 * @returns {Array} Array of channel objects
 */
export function getChannels() {
    return channelState.channels;
}

/**
 * Get execution order (for multi-pass rendering)
 * For Phase 1, just returns main channel
 * @returns {Array} Channels in execution order
 */
export function getExecutionOrder() {
    return getBufferChannelsSortedLeftToRight();
}

export function getBufferExecutionOrder() {
    const ordered = getBufferChannelsSortedLeftToRight();
    return ordered.slice().reverse();
}

/**
 * Parse GLSL code for iChannel usage
 * @param {string} glslCode - GLSL shader code
 * @returns {Array<number>} Array of channel numbers used
 */
export function parseChannelUsage(glslCode) {
    const channels = new Set();
    
    // Match iChannel0, iChannel1, etc.
    const regex = /iChannel(\d+)/g;
    let match;
    
    while ((match = regex.exec(glslCode)) !== null) {
        const channelNum = parseInt(match[1]);
        if (channelNum >= 0 && channelNum <= 15) { // Reasonable limit
            channels.add(channelNum);
        }
    }
    
    return Array.from(channels).sort((a, b) => a - b);
}

/**
 * Get channel configuration for persistence
 * @returns {Object} Configuration object
 */
export function getChannelConfig() {
    return {
        selectedOutputChannel: channelState.selectedOutputChannel,
        nextChannelNumber: channelState.nextChannelNumber,
        channels: channelState.channels.map(ch => ({
            number: ch.number,
            type: ch.type,
            name: ch.name,
            tabName: ch.tabName,
            mediaId: ch.mediaId,
            mediaPath: ch.mediaPath,
            resolution: ch.resolution,
            // Include texture options (for images)
            vflip: ch.vflip,
            wrap: ch.wrap,
            filter: ch.filter,
            anisotropic: ch.anisotropic,
            // Include audio options
            audioMode: ch.audioMode,
            // Include video options
            loop: ch.videoData?.loop || false,
            // Include volume options
            volumeId: ch.volumeData?.volumeId
        }))
    };
}

/**
 * Reset channel state (for new shaders)
 */
export function resetChannels() {
    // Cleanup all channels except main
    channelState.channels.forEach(ch => {
        if (ch.number !== 0) {
            // Cleanup audio resources
            if (ch.type === 'audio' && ch.audioData) {
                audioInput.cleanupAudioChannel(ch.audioData);
            }
            
            // Cleanup video resources
            if (ch.type === 'video' && ch.videoData) {
                videoInput.cleanupVideoChannel(ch);
            }
            
            // Cleanup mic resources
            if (ch.type === 'mic' && ch.micData) {
                micInput.stopMicChannel(ch.micData);
            }
            
            // Cleanup webcam resources
            if (ch.type === 'webcam' && ch.webcamData) {
                webcamInput.stopWebcamChannel(ch.webcamData);
            }
            
            // Cleanup keyboard resources
            if (ch.type === 'keyboard' && ch.keyboardData) {
                keyboardInput.stopKeyboardChannel(ch.keyboardData);
            }
            
            // Cleanup volume resources
            if (ch.type === 'volume' && ch.volumeData) {
                volumeInput.cleanupVolumeChannel(ch.volumeData);
            }
            
            // Remove UI container if it exists
            if (ch.tabName) {
                const container = document.getElementById(`${ch.tabName}Container`);
                if (container) {
                    console.log(`  Removing UI container for ${ch.tabName}`);
                    container.remove();
                }
            }
            
            // Cleanup WebGL textures
            const gl = state.glContext;
            if (gl) {
                if (ch.texture) {
                    gl.deleteTexture(ch.texture);
                }
                if (ch.textures) {
                    ch.textures.forEach(tex => {
                        if (tex) gl.deleteTexture(tex);
                    });
                }
            }
        }
    });
    
    // Clear all channels except main
    channelState.channels = channelState.channels.filter(ch => ch.number === 0);
    channelState.nextChannelNumber = 1;
    channelState.selectedOutputChannel = 0;
    console.log('✓ Channels reset');
    emitChannelChangeEvent({ action: 'reset' });
}

/**
 * Resize main buffer textures when canvas size changes
 * @param {number} width - New width
 * @param {number} height - New height
 * @returns {boolean} Success
 */
export function resizeMainBuffer(width, height) {
    const ch0 = channelState.channels.find(ch => ch.number === 0);
    if (!ch0) {
        console.error('Main buffer channel (ch0) not found!');
        return false;
    }
    
    if (!ch0.textures) {
        // Not initialized yet, just update resolution
        ch0.resolution = { width, height };
        return true;
    }
    
    const gl = state.glContext;
    if (!gl) {
        console.warn('Cannot resize main buffer - WebGL not available');
        return false;
    }
    
    // Delete old textures
    gl.deleteTexture(ch0.textures[0]);
    gl.deleteTexture(ch0.textures[1]);
    
    // Create new textures at new size
    ch0.textures[0] = createBufferTexture(gl, width, height);
    ch0.textures[1] = createBufferTexture(gl, width, height);
    ch0.resolution = { width, height };
    ch0.currentPing = 0; // Reset ping-pong
    
    console.log(`✓ Main buffer resized to ${width}×${height}`);
    return true;
}

export function resizeAllBufferChannels(width, height) {
    const gl = state.glContext;
    channelState.channels.forEach(ch => {
        if (ch.type !== 'buffer' || ch.number === 0) {
            return;
        }
        
        ch.resolution = { width, height };
        
        if (ch.textures && gl) {
            gl.deleteTexture(ch.textures[0]);
            gl.deleteTexture(ch.textures[1]);
            ch.textures[0] = createBufferTexture(gl, width, height);
            ch.textures[1] = createBufferTexture(gl, width, height);
            ch.currentPing = 0;
            console.log(`✓ Buffer ch${ch.number} resized to ${width}×${height}`);
        }
    });
}

/**
 * Clear main buffer textures (for restart)
 * @returns {boolean} Success
 */
export function clearMainBuffer() {
    const ch0 = channelState.channels.find(ch => ch.number === 0);
    if (!ch0) {
        return false;
    }
    
    if (!state.glContext) {
        ch0.textures = null;
        ch0.currentPing = 0;
        console.warn('clearMainBuffer: WebGL not ready, deferring texture recreation');
        return false;
    }
    
    resizeMainBuffer(state.canvasWidth, state.canvasHeight);
    console.log('✓ Main buffer cleared');
    return true;
}

export function ensureBufferTextures(channelNumber) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'buffer') {
        return channel;
    }
    return ensureChannelTexturesInternal(channel);
}

/**
 * Load channel configuration
 * @param {Object} config - Configuration object
 */
export async function loadChannelConfig(config) {
    if (!config || !config.channels) {
        console.log('No channel config to load - resetting to defaults');
        resetChannels();
        return;
    }
    
    // Cleanup existing channels (except main) before clearing
    channelState.channels.forEach(ch => {
        if (ch.number !== 0) {
            // Cleanup audio resources
            if (ch.type === 'audio' && ch.audioData) {
                audioInput.cleanupAudioChannel(ch.audioData);
            }
            
            // Cleanup video resources
            if (ch.type === 'video' && ch.videoData) {
                videoInput.cleanupVideoChannel(ch);
            }
            
            // Cleanup mic resources
            if (ch.type === 'mic' && ch.micData) {
                micInput.stopMicChannel(ch.micData);
            }
            
            // Cleanup webcam resources
            if (ch.type === 'webcam' && ch.webcamData) {
                webcamInput.stopWebcamChannel(ch.webcamData);
            }
            
            // Cleanup keyboard resources
            if (ch.type === 'keyboard' && ch.keyboardData) {
                keyboardInput.stopKeyboardChannel(ch.keyboardData);
            }
            
            // Cleanup volume resources
            if (ch.type === 'volume' && ch.volumeData) {
                volumeInput.cleanupVolumeChannel(ch.volumeData);
            }
            
            // Cleanup WebGL textures
            const gl = state.glContext;
            if (gl) {
                if (ch.texture) {
                    gl.deleteTexture(ch.texture);
                }
                if (ch.textures) {
                    ch.textures.forEach(tex => {
                        if (tex) gl.deleteTexture(tex);
                    });
                }
            }
        }
    });
    
    // Clear existing channels (except main)
    channelState.channels = channelState.channels.filter(ch => ch.number === 0);
    
    channelState.selectedOutputChannel = config.selectedOutputChannel || 0;
    
    // Sort channels by number to recreate them in order
    const sortedChannels = [...config.channels].sort((a, b) => a.number - b.number);
    
    // Ensure WebGL is initialized before creating ANY channels (images, videos, audio, mic, webcam need it!)
    const needsWebGL = sortedChannels.some(ch => ch.number !== 0 && 
        (ch.type === 'image' || ch.type === 'audio' || ch.type === 'video' || 
         ch.type === 'mic' || ch.type === 'webcam'));
    if (needsWebGL) {
        // Always ensure WebGL is available and properly initialized
        if (!state.glContext || !state.hasWebGL) {
            console.log('Initializing WebGL for channels (image/audio)...');
            const webgl = await import('./backends/webgl.js');
            const webglResult = await webgl.init(state.canvasWebGL);
            if (!webglResult.success) {
                console.error('Failed to initialize WebGL for channels');
                return;
            }
            console.log('✓ WebGL initialized for channels, state.glContext:', !!state.glContext);
        } else {
            console.log('WebGL already initialized, reusing existing context');
        }
    }
    
    // Recreate channels (except main which is already created)
    for (const ch of sortedChannels) {
        if (ch.number === 0) continue; // Skip main
        
        // Set nextChannelNumber to match the channel we're about to create
        channelState.nextChannelNumber = ch.number;
        
        if (ch.type === 'audio' && ch.mediaId) {
            // Re-register external audio if needed
            if (ch.mediaId.startsWith('guc:') || ch.mediaId.startsWith('cloudinary:')) {
                const source = ch.mediaId.startsWith('cloudinary:') ? 'cloudinary' : 'guc';
                const prefixLength = source === 'cloudinary' ? 11 : 4;
                const userPath = ch.mediaId.substring(prefixLength);
                
                let fullUrl;
                if (source === 'cloudinary') {
                    fullUrl = 'https://res.cloudinary.com/' + userPath;
                } else {
                    fullUrl = 'https://raw.githubusercontent.com/' + userPath;
                }
                
                const filename = userPath.split('/').pop();
                const title = filename.replace(/\.(mp3|wav|ogg|m4a)$/i, '');
                
                const mediaInfo = {
                    id: ch.mediaId,
                    type: 'audio',
                    name: title,
                    path: fullUrl,
                    source: source,
                    url: fullUrl,
                    userPath: userPath
                };
                
                mediaLoader.registerExternalMedia(mediaInfo);
                console.log(`✓ Re-registered external audio: ${ch.mediaId}`);
            }
            
            const channelNumber = await createChannel('audio', {
                mediaId: ch.mediaId,
                tabName: ch.tabName,
                audioMode: ch.audioMode || 'shadertoy'
            });
            
            // Add tab to active tabs if channel was created successfully
            if (channelNumber !== -1 && ch.tabName) {
                if (!state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
                
                // IMPORTANT: Force recreation of the selector UI by removing old container
                const oldContainer = document.getElementById(`${ch.tabName}Container`);
                if (oldContainer) {
                    console.log(`  Removing stale container for ${ch.tabName}`);
                    oldContainer.remove();
                }
            }
        } else if (ch.type === 'video' && ch.mediaId) {
            // Re-register external video if needed
            if (ch.mediaId.startsWith('guc:') || ch.mediaId.startsWith('cloudinary:')) {
                const source = ch.mediaId.startsWith('cloudinary:') ? 'cloudinary' : 'guc';
                const prefixLength = source === 'cloudinary' ? 11 : 4;
                const userPath = ch.mediaId.substring(prefixLength);
                
                let fullUrl;
                if (source === 'cloudinary') {
                    fullUrl = 'https://res.cloudinary.com/' + userPath;
                } else {
                    fullUrl = 'https://raw.githubusercontent.com/' + userPath;
                }
                
                const filename = userPath.split('/').pop();
                const title = filename.replace(/\.(mp4|webm|ogv|mov)$/i, '');
                
                const mediaInfo = {
                    id: ch.mediaId,
                    type: 'video',
                    name: title,
                    path: fullUrl,
                    thumb: null, // No thumbnail for external videos
                    source: source,
                    url: fullUrl,
                    userPath: userPath
                };
                
                mediaLoader.registerExternalMedia(mediaInfo);
                console.log(`✓ Re-registered external video: ${ch.mediaId}`);
            }
            
            const channelNumber = await createChannel('video', {
                mediaId: ch.mediaId,
                tabName: ch.tabName,
                loop: ch.loop || false
            });
            
            // Add tab to active tabs if channel was created successfully
            if (channelNumber !== -1 && ch.tabName) {
                if (!state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
                
                // IMPORTANT: Force recreation of the selector UI by removing old container
                const oldContainer = document.getElementById(`${ch.tabName}Container`);
                if (oldContainer) {
                    console.log(`  Removing stale container for ${ch.tabName}`);
                    oldContainer.remove();
                }
            }
        } else if (ch.type === 'image' && ch.mediaId) {
            // If this is an external media (URL import), re-register it
            const externalPrefixes = ['guc:', 'polyhaven:', 'imgbb:', 'cloudinary:'];
            const matchedPrefix = externalPrefixes.find(p => ch.mediaId.startsWith(p));
            
            if (matchedPrefix) {
                const source = matchedPrefix.slice(0, -1); // Remove trailing ':'
                const userPath = ch.mediaId.substring(matchedPrefix.length);
                
                // Build full URL based on source
                let fullUrl;
                switch (source) {
                    case 'polyhaven':
                        fullUrl = 'https://dl.polyhaven.org/file/ph-assets/' + userPath;
                        break;
                    case 'imgbb':
                        fullUrl = 'https://i.ibb.co/' + userPath;
                        break;
                    case 'cloudinary':
                        fullUrl = 'https://res.cloudinary.com/' + userPath;
                        break;
                    default: // guc
                        fullUrl = 'https://raw.githubusercontent.com/' + userPath;
                }
                
                const filename = userPath.split('/').pop();
                const title = filename.replace(/\.(png|jpg|jpeg)$/i, '');
                
                // Re-register external media so it can be found
                const mediaInfo = {
                    id: ch.mediaId,
                    type: 'image',
                    name: title,
                    path: fullUrl,
                    thumb: fullUrl,
                    width: 0, // Will be set when texture loads
                    height: 0,
                    source: source,
                    url: fullUrl,
                    userPath: userPath
                };
                
                mediaLoader.registerExternalMedia(mediaInfo);
                console.log(`✓ Re-registered external media: ${ch.mediaId} from ${source}`);
            }
            
            const channelNumber = await createChannel('image', {
                mediaId: ch.mediaId,
                tabName: ch.tabName,
                // Pass texture options from saved config
                vflip: ch.vflip,
                wrap: ch.wrap,
                filter: ch.filter,
                anisotropic: ch.anisotropic
            });
            
            // Add tab to active tabs if channel was created successfully
            if (channelNumber !== -1 && ch.tabName) {
                if (!state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
            }
        } else if (ch.type === 'mic') {
            // Mic channels - recreate and try to auto-start
            const channelNumber = await createChannel('mic', {
                tabName: ch.tabName,
                audioMode: ch.audioMode || 'chromagram'
            });
            
            if (channelNumber !== -1 && ch.tabName) {
                if (!state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
                
                // Try to auto-start mic (will fail silently if permission not granted)
                try {
                    await startMicChannel(channelNumber);
                } catch (error) {
                    console.log(`Mic channel ch${channelNumber} awaiting user activation`);
                }
                
                // Remove old container to force recreation
                const oldContainer = document.getElementById(`${ch.tabName}Container`);
                if (oldContainer) {
                    oldContainer.remove();
                }
            }
        } else if (ch.type === 'webcam') {
            // Webcam channels - recreate and try to auto-start
            const channelNumber = await createChannel('webcam', {
                tabName: ch.tabName
            });
            
            if (channelNumber !== -1 && ch.tabName) {
                if (!state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
                
                // Try to auto-start webcam (will fail silently if permission not granted)
                try {
                    await startWebcamChannel(channelNumber);
                } catch (error) {
                    console.log(`Webcam channel ch${channelNumber} awaiting user activation`);
                }
                
                // Remove old container to force recreation
                const oldContainer = document.getElementById(`${ch.tabName}Container`);
                if (oldContainer) {
                    oldContainer.remove();
                }
            }
        } else if (ch.type === 'keyboard') {
            // Keyboard channels - recreate (starts immediately, no permissions)
            const channelNumber = await createChannel('keyboard', {
                tabName: ch.tabName
            });
            
            if (channelNumber !== -1 && ch.tabName) {
                if (!state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
                
                // Remove old container to force recreation
                const oldContainer = document.getElementById(`${ch.tabName}Container`);
                if (oldContainer) {
                    oldContainer.remove();
                }
            }
        } else if (ch.type === 'buffer') {
            channelState.channels.push({
                number: ch.number,
                type: 'buffer',
                name: ch.name || `Buffer(ch${ch.number})`,
                tabName: ch.tabName || `buffer_ch${ch.number}`,
                resolution: ch.resolution || { width: state.canvasWidth, height: state.canvasHeight },
                textures: null,
                framebuffer: null,
                currentPing: 0
            });
            if (ch.tabName && !state.activeTabs.includes(ch.tabName)) {
                state.activeTabs.push(ch.tabName);
            }
        } else if (ch.type === 'volume') {
            // Volume (3D texture) channels - recreate
            const channelNumber = await createChannel('volume', {
                tabName: ch.tabName,
                volumeId: ch.volumeId || 'grey_noise_32'
            });
            
            if (channelNumber !== -1) {
                // Apply wrap mode if saved
                if (ch.wrap && ch.wrap !== 'clamp') {
                    await changeVolumeWrapMode(channelNumber, ch.wrap);
                }
                
                if (ch.tabName && !state.activeTabs.includes(ch.tabName)) {
                    state.activeTabs.push(ch.tabName);
                }
                
                // Remove old container to force recreation
                const oldContainer = document.getElementById(`${ch.tabName}Container`);
                if (oldContainer) {
                    oldContainer.remove();
                }
            }
        }
    }
    
    // Set nextChannelNumber to the next available after all loaded channels
    const maxChannelNumber = Math.max(...channelState.channels.map(ch => ch.number), 0);
    channelState.nextChannelNumber = maxChannelNumber + 1;
    
    if (!getChannel(channelState.selectedOutputChannel)) {
        channelState.selectedOutputChannel = 0;
    }
    
    console.log(`✓ Loaded ${config.channels.length - 1} channel(s), next channel will be ch${channelState.nextChannelNumber}`);
    emitChannelChangeEvent({ action: 'load' });
}

/**
 * Set selected output channel (which channel to display)
 * @param {number} channelNumber - Channel to display
 */
export function setSelectedOutputChannel(channelNumber) {
    const channel = getChannel(channelNumber);
    if (channel) {
        channelState.selectedOutputChannel = channelNumber;
        emitChannelChangeEvent({ action: 'select', channelNumber });
        console.log(`✓ Output channel set to ch${channelNumber}`);
    } else {
        console.warn(`Channel ${channelNumber} not found`);
    }
}

/**
 * Get selected output channel
 * @returns {number} Selected channel number
 */
export function getSelectedOutputChannel() {
    return channelState.selectedOutputChannel;
}


export function getAvailableViewerChannels() {
    return [...channelState.channels]
        // Filter out volume channels - they can't be displayed in 2D viewer
        .filter(ch => ch.type !== 'volume')
        .sort((a, b) => a.number - b.number)
        .map(ch => ({
            number: ch.number,
            type: ch.type,
            label: ch.name || `${ch.type.charAt(0).toUpperCase() + ch.type.slice(1)}(ch${ch.number})`
        }));
}

export function getChannelTextureForDisplay(channelNumber) {
    const channel = getChannel(channelNumber) || getChannel(0);
    if (!channel) return null;
    
    if (channel.type === 'buffer') {
        ensureBufferTextures(channel.number);
        return channel.textures ? channel.textures[channel.currentPing] : null;
    }
    
    if (channel.type === 'image' || channel.type === 'video' || channel.type === 'audio' ||
        channel.type === 'mic' || channel.type === 'webcam' || channel.type === 'keyboard') {
        return channel.texture || null;
    }
    
    if (channel.number === 0) {
        ensureChannelTexturesInternal(channel);
        return channel.textures ? channel.textures[channel.currentPing] : null;
    }
    
    return null;
}

/**
 * Update all audio channel textures (called each frame)
 * @param {WebGL2RenderingContext} gl - WebGL context
 */
export function updateAudioTextures(gl) {
    getAudioChannels()
        .filter(ch => ch.audioData.playing)
        .forEach(ch => {
            audioInput.updateAudioTexture(
                gl, 
                ch.texture, 
                ch.audioData.analyser, 
                ch.resolution.width, 
                ch.resolution.height,
                ch.audioMode || 'shadertoy',  // Pass mode for routing
                ch.audioData.previousFrame,   // Pass previous frame for delta calculation
                ch.audioData.temporalAverage  // Pass temporal average for blue channel
            );
        });
}

function getAudioChannels() {
    return channelState.channels.filter(ch => ch.type === 'audio' && ch.audioData);
}

export function hasAudioChannels() {
    return getAudioChannels().length > 0;
}

export function playAudioChannels() {
    const audioChannels = getAudioChannels();
    if (audioChannels.length === 0) {
        return Promise.resolve();
    }
    if (!state.mediaStartUnlocked) {
        return Promise.reject(new Error('Media start locked'));
    }
    return Promise.all(audioChannels.map(ch => audioInput.playAudioChannel(ch.audioData)));
}

export function pauseAudioChannels() {
    getAudioChannels().forEach(ch => {
        audioInput.pauseAudioChannel(ch.audioData);
    });
}

export function restartAudioChannels(shouldPlay = state.isPlaying) {
    const audioChannels = getAudioChannels();
    audioChannels.forEach(ch => {
        const audio = ch.audioData.audio;
        if (audio) {
            audio.currentTime = 0;
        }
    });
    if (shouldPlay) {
        return playAudioChannels();
    }
    pauseAudioChannels();
    return Promise.resolve();
}

/**
 * Update all video channel textures (called each frame)
 * @param {WebGL2RenderingContext} gl - WebGL context
 */
export function updateVideoTextures(gl) {
    getVideoChannels()
        .filter(ch => ch.videoData.playing)
        .forEach(ch => {
            videoInput.updateVideoTexture(gl, ch.texture, ch.videoData.video);
        });
}

function getVideoChannels() {
    return channelState.channels.filter(ch => ch.type === 'video' && ch.videoData);
}

export function hasVideoChannels() {
    return getVideoChannels().length > 0;
}

export function playVideoChannels() {
    const videoChannels = getVideoChannels();
    if (videoChannels.length === 0) {
        return Promise.resolve();
    }
    if (!state.mediaStartUnlocked) {
        return Promise.reject(new Error('Media start locked'));
    }
    return Promise.all(videoChannels.map(ch => videoInput.playVideoChannel(ch)));
}

export function pauseVideoChannels() {
    getVideoChannels().forEach(ch => {
        videoInput.pauseVideoChannel(ch);
    });
}

export function restartVideoChannels(shouldPlay = state.isPlaying) {
    const videoChannels = getVideoChannels();
    videoChannels.forEach(ch => {
        videoInput.restartVideoChannel(ch);
    });
    if (shouldPlay) {
        return playVideoChannels();
    }
    pauseVideoChannels();
    return Promise.resolve();
}

export function hasMediaChannels() {
    return hasAudioChannels() || hasVideoChannels();
}

// ============================================================================
// Mic Channel Management
// ============================================================================

/**
 * Get all mic channels
 * @returns {Object[]} Mic channels
 */
export function getMicChannels() {
    return channelState.channels.filter(ch => ch.type === 'mic');
}

/**
 * Check if any mic channels exist
 * @returns {boolean}
 */
export function hasMicChannels() {
    return getMicChannels().length > 0;
}

/**
 * Start mic capture for a channel
 * @param {number} channelNumber - Channel number
 * @returns {Promise<void>}
 */
export async function startMicChannel(channelNumber) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'mic') {
        throw new Error(`Channel ${channelNumber} is not a mic channel`);
    }
    
    const gl = state.glContext;
    if (!gl) {
        throw new Error('WebGL context not available');
    }
    
    const mode = channel.audioMode || 'chromagram';
    channel.micData = await micInput.createMicChannel(gl, mode);
    channel.texture = channel.micData.texture;
    channel.resolution = { 
        width: channel.micData.width, 
        height: channel.micData.height 
    };
    
    console.log(`✓ Mic channel started: ch${channelNumber}`);
}

/**
 * Stop mic capture for a channel
 * @param {number} channelNumber - Channel number
 */
export function stopMicChannel(channelNumber) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'mic') return;
    
    if (channel.micData) {
        micInput.stopMicChannel(channel.micData);
        channel.micData = null;
    }
}

/**
 * Restart mic channel with new audio mode
 * @param {number} channelNumber - Channel number
 * @param {string} mode - New audio mode
 */
export async function restartMicChannel(channelNumber, mode) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'mic') return;
    
    // Stop current mic if active
    if (channel.micData) {
        micInput.stopMicChannel(channel.micData);
    }
    
    // Update mode
    channel.audioMode = mode;
    
    // Start with new mode
    await startMicChannel(channelNumber);
}

/**
 * Update all mic channel textures
 * @param {WebGL2RenderingContext} gl - WebGL context
 */
export function updateMicTextures(gl) {
    const micChannels = getMicChannels();
    micChannels.forEach(ch => {
        if (ch.micData && ch.micData.active) {
            micInput.updateMicTexture(
                gl,
                ch.micData,
                ch.micData.previousFrame,
                ch.micData.temporalAverage
            );
        }
    });
}

// ============================================================================
// Webcam Channel Management
// ============================================================================

/**
 * Get all webcam channels
 * @returns {Object[]} Webcam channels
 */
export function getWebcamChannels() {
    return channelState.channels.filter(ch => ch.type === 'webcam');
}

/**
 * Check if any webcam channels exist
 * @returns {boolean}
 */
export function hasWebcamChannels() {
    return getWebcamChannels().length > 0;
}

/**
 * Start webcam capture for a channel
 * @param {number} channelNumber - Channel number
 * @returns {Promise<void>}
 */
export async function startWebcamChannel(channelNumber) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'webcam') {
        throw new Error(`Channel ${channelNumber} is not a webcam channel`);
    }
    
    const gl = state.glContext;
    if (!gl) {
        throw new Error('WebGL context not available');
    }
    
    channel.webcamData = await webcamInput.createWebcamChannel(gl);
    channel.texture = channel.webcamData.texture;
    channel.resolution = { 
        width: channel.webcamData.width, 
        height: channel.webcamData.height 
    };
    
    console.log(`✓ Webcam channel started: ch${channelNumber}`);
}

/**
 * Stop webcam capture for a channel
 * @param {number} channelNumber - Channel number
 */
export function stopWebcamChannel(channelNumber) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'webcam') return;
    
    if (channel.webcamData) {
        webcamInput.stopWebcamChannel(channel.webcamData);
        channel.webcamData = null;
    }
}

/**
 * Update all webcam channel textures
 * @param {WebGL2RenderingContext} gl - WebGL context
 */
export function updateWebcamTextures(gl) {
    const webcamChannels = getWebcamChannels();
    webcamChannels.forEach(ch => {
        if (ch.webcamData && ch.webcamData.active) {
            webcamInput.updateWebcamTexture(gl, ch.webcamData);
            
            // Sync resolution from webcamData (may change if video dimensions update)
            if (ch.webcamData.width !== ch.resolution.width || 
                ch.webcamData.height !== ch.resolution.height) {
                ch.resolution.width = ch.webcamData.width;
                ch.resolution.height = ch.webcamData.height;
            }
        }
    });
}

// ============================================================================
// Keyboard Channel Functions
// ============================================================================

/**
 * Get all keyboard channels
 * @returns {Object[]} Keyboard channels
 */
export function getKeyboardChannels() {
    return channelState.channels.filter(ch => ch.type === 'keyboard');
}

/**
 * Check if any keyboard channels exist
 * @returns {boolean}
 */
export function hasKeyboardChannels() {
    return getKeyboardChannels().length > 0;
}

/**
 * Update all keyboard channel textures (called each frame)
 * @param {WebGL2RenderingContext} gl - WebGL context
 */
export function updateKeyboardTextures(gl) {
    const keyboardChannels = getKeyboardChannels();
    keyboardChannels.forEach(ch => {
        if (ch.keyboardData && ch.keyboardData.active) {
            keyboardInput.updateKeyboardTexture(gl);
        }
    });
}

/**
 * Clear keyboard hit states (called at end of each frame)
 */
export function clearKeyboardHitStates() {
    if (hasKeyboardChannels()) {
        keyboardInput.clearHitStates();
    }
}

/**
 * Focus canvas for keyboard input (call when shader with keyboard is loaded)
 */
export function focusCanvasForKeyboard() {
    if (hasKeyboardChannels()) {
        keyboardInput.focusCanvas();
    }
}

// ============================================================================
// Volume Channel Functions
// ============================================================================

/**
 * Get all volume channels
 * @returns {Object[]} Volume channels
 */
export function getVolumeChannels() {
    return channelState.channels.filter(ch => ch.type === 'volume');
}

/**
 * Check if any volume channels exist
 * @returns {boolean}
 */
export function hasVolumeChannels() {
    return getVolumeChannels().length > 0;
}

/**
 * Change volume texture for a channel
 * @param {number} channelNumber - Channel number
 * @param {string} volumeId - New volume texture ID
 */
export async function changeVolumeTexture(channelNumber, volumeId) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'volume') {
        console.error(`Channel ${channelNumber} is not a volume channel`);
        return;
    }
    
    const gl = state.glContext;
    if (!gl) {
        console.error('WebGL context not available');
        return;
    }
    
    // Cleanup old texture
    if (channel.volumeData) {
        volumeInput.cleanupVolumeChannel(channel.volumeData);
    }
    
    // Create new volume texture
    try {
        channel.volumeData = await volumeInput.createVolumeChannel(gl, volumeId);
        channel.texture = channel.volumeData.texture;
        channel.resolution = {
            width: channel.volumeData.width,
            height: channel.volumeData.height,
            depth: channel.volumeData.depth
        };
        console.log(`✓ Volume texture changed: ch${channelNumber} → ${volumeId}`);
        emitChannelChangeEvent({ action: 'update', channel });
    } catch (error) {
        console.error('Failed to change volume texture:', error);
    }
}

/**
 * Change wrap mode for a volume channel
 * @param {number} channelNumber - Channel number
 * @param {string} wrap - Wrap mode ('repeat', 'mirror', 'clamp')
 */
export async function changeVolumeWrapMode(channelNumber, wrap) {
    const channel = getChannel(channelNumber);
    if (!channel || channel.type !== 'volume') {
        console.error(`Channel ${channelNumber} is not a volume channel`);
        return;
    }
    
    const gl = state.glContext;
    if (!gl) {
        console.error('WebGL context not available');
        return;
    }
    
    if (!channel.texture) {
        console.error('Volume texture not loaded');
        return;
    }
    
    // Update wrap mode
    volumeInput.setVolumeWrapMode(gl, channel.texture, wrap);
    
    // Store wrap mode in channel data
    if (channel.volumeData) {
        channel.volumeData.wrap = wrap;
    }
    channel.wrap = wrap;
    
    emitChannelChangeEvent({ action: 'update', channel });
}

// Expose limited debugging helpers
if (typeof window !== 'undefined') {
    window.channelsDebug = {
        getChannels,
        getChannel,
        getChannelConfig,
        parseChannelUsage,
        getAvailableViewerChannels,
        setSelectedOutputChannel,
        getSelectedOutputChannel,
        getChannelTextureForDisplay,
        hasAudioChannels
    };
}

