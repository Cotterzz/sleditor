// ============================================================================
// Channels - Channel/buffer management and coordination
// ============================================================================

import { state } from './core.js';
import * as mediaLoader from './media-loader.js';

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
        // Video support - Phase 3
        console.log('Video channels not yet implemented');
        return -1;
    } else if (type === 'buffer') {
        channel.resolution = { width: state.canvasWidth, height: state.canvasHeight };
        channel.textures = null; // Created lazily when rendering
        channel.framebuffer = null;
        console.log(`Buffer channel stub created: ch${channelNumber}`);
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
    
    if (channel.type !== 'image') {
        console.warn(`Only image channels can be updated (ch${channelNumber} is ${channel.type})`);
        return false;
    }
    
    const gl = state.glContext || state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl');
    if (!gl) {
        console.error('WebGL context not available');
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
            // Include texture options
            vflip: ch.vflip,
            wrap: ch.wrap,
            filter: ch.filter,
            anisotropic: ch.anisotropic
        }))
    };
}

/**
 * Reset channel state (for new shaders)
 */
export function resetChannels() {
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
    
    // Clear existing channels (except main)
    channelState.channels = channelState.channels.filter(ch => ch.number === 0);
    
    channelState.selectedOutputChannel = config.selectedOutputChannel || 0;
    
    // Sort channels by number to recreate them in order
    const sortedChannels = [...config.channels].sort((a, b) => a.number - b.number);
    
    // Ensure WebGL is initialized before creating image channels
    const needsWebGL = sortedChannels.some(ch => ch.number !== 0 && ch.type === 'image');
    if (needsWebGL && !state.glContext) {
        console.log('Initializing WebGL for image channels...');
        const webgl = await import('./backends/webgl.js');
        const webglResult = await webgl.init(state.canvasWebGL);
        if (!webglResult.success) {
            console.error('Failed to initialize WebGL for channels');
            return;
        }
        console.log('✓ WebGL initialized, state.glContext:', !!state.glContext);
    }
    
    // Recreate channels (except main which is already created)
    for (const ch of sortedChannels) {
        if (ch.number === 0) continue; // Skip main
        
        // Set nextChannelNumber to match the channel we're about to create
        channelState.nextChannelNumber = ch.number;
        
        if (ch.type === 'image' && ch.mediaId) {
            // If this is an external media (URL import), re-register it
            if (ch.mediaId.startsWith('guc:')) {
                const userPath = ch.mediaId.substring(4); // Remove 'guc:' prefix
                const fullUrl = 'https://raw.githubusercontent.com/' + userPath;
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
                    source: 'guc',
                    url: fullUrl,
                    userPath: userPath
                };
                
                mediaLoader.registerExternalMedia(mediaInfo);
                console.log(`✓ Re-registered external media: ${ch.mediaId}`);
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
    
    if (channel.type === 'image' || channel.type === 'video') {
        return channel.texture || null;
    }
    
    if (channel.number === 0) {
        ensureChannelTexturesInternal(channel);
        return channel.textures ? channel.textures[channel.currentPing] : null;
    }
    
    return null;
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
        getChannelTextureForDisplay
    };
}

