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

/**
 * Initialize channels system
 */
export function init() {
    console.log('Initializing channels system');
    
    // Create main buffer channel (ch0)
    channelState.channels.push({
        number: 0,
        type: 'buffer',
        name: 'Main(ch0)',
        tabName: null, // Set when shader loads
        resolution: { width: state.canvasWidth, height: state.canvasHeight },
        textures: null, // Created in webgl.js
        framebuffer: null,
        currentPing: 0
    });
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
        // Buffer support - Phase 2
        console.log('Buffer channels not yet implemented');
        return -1;
    }
    
    channelState.channels.push(channel);
    channelState.nextChannelNumber++; // Only increment after successful creation
    console.log(`✓ Channel created: ch${channelNumber} (${type})`);
    
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
    if (channel.texture) {
        const gl = state.graphicsBackend === 'webgl' ? state.canvasWebGL.getContext('webgl2') || state.canvasWebGL.getContext('webgl') : null;
        if (gl) {
            gl.deleteTexture(channel.texture);
        }
    }
    
    // Remove from array
    channelState.channels.splice(index, 1);
    console.log(`✓ Channel deleted: ch${channelNumber}`);
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
    // Phase 1: Only main pass
    return channelState.channels.filter(ch => ch.type === 'buffer');
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
        }
        // Other types in future phases
    }
    
    // Set nextChannelNumber to the next available after all loaded channels
    const maxChannelNumber = Math.max(...channelState.channels.map(ch => ch.number), 0);
    channelState.nextChannelNumber = maxChannelNumber + 1;
    
    console.log(`✓ Loaded ${config.channels.length - 1} channel(s), next channel will be ch${channelState.nextChannelNumber}`);
}

/**
 * Set selected output channel (which channel to display)
 * @param {number} channelNumber - Channel to display
 */
export function setSelectedOutputChannel(channelNumber) {
    if (getChannel(channelNumber)) {
        channelState.selectedOutputChannel = channelNumber;
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

// Expose for debugging
window.channels = {
    getChannels,
    getChannel,
    getChannelConfig,
    parseChannelUsage
};

