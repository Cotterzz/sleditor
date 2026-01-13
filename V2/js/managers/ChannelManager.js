/**
 * ChannelManager - Global channel allocation and coordination
 * 
 * Sleditor uses a GLOBAL channel namespace:
 * - iChannel0 = Main (always)
 * - iChannel1+ = allocated sequentially as user creates buffers/media
 * 
 * This is different from Shadertoy's per-pass channel assignment.
 */

import { logger } from '../core/logger.js';
import { events, EVENTS } from '../core/events.js';
import { state } from '../core/state.js';

// ============================================================================
// Channel Registry
// ============================================================================

// Channel 0 is reserved for Main
const channels = new Map();
let nextChannelNumber = 1;

// Map passId to channelNumber (e.g., 'BufferA' → 1)
const passToChannel = new Map();

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize channel system
 */
export function init() {
    // Channel 0 = Main (always exists)
    channels.set(0, {
        type: 'main',
        passId: 'Image',
        source: null
    });
    
    passToChannel.set('Image', 0);
    
    // Initialize state namespace
    if (!state.channels) {
        state.channels = {};
    }
    
    logger.info('ChannelManager', 'Init', 'Channel system initialized (ch0 = Main)');
}

// ============================================================================
// Channel Allocation
// ============================================================================

/**
 * Create a channel for a buffer pass
 * @param {string} passId - 'BufferA', 'BufferB', etc.
 * @returns {number} Allocated channel number
 */
export function createBufferChannel(passId) {
    // Check if this pass already has a channel
    if (passToChannel.has(passId)) {
        return passToChannel.get(passId);
    }
    
    const channelNumber = nextChannelNumber++;
    
    channels.set(channelNumber, {
        type: 'buffer',
        passId: passId,
        source: null
    });
    
    passToChannel.set(passId, channelNumber);
    
    // Update state
    state.channels[`iChannel${channelNumber}`] = {
        type: 'buffer',
        passId: passId
    };
    
    logger.info('ChannelManager', 'Create', `Buffer channel created: ch${channelNumber} → ${passId}`);
    events.emit(EVENTS.CHANNEL_SET, { index: channelNumber, type: 'buffer', passId });
    
    return channelNumber;
}

/**
 * Create a channel for a media input (texture, audio, video, etc.)
 * @param {string} type - 'texture', 'audio', 'video', 'webcam', etc.
 * @param {Object} source - Source data (path, mediaId, etc.)
 * @returns {number} Allocated channel number
 */
export function createMediaChannel(type, source) {
    const channelNumber = nextChannelNumber++;
    
    channels.set(channelNumber, {
        type: type,
        passId: null,
        source: source
    });
    
    // Update state
    state.channels[`iChannel${channelNumber}`] = {
        type: type,
        source: source
    };
    
    logger.info('ChannelManager', 'Create', `Media channel created: ch${channelNumber} (${type})`);
    events.emit(EVENTS.CHANNEL_SET, { index: channelNumber, type, source });
    
    return channelNumber;
}

/**
 * Remove a channel
 * @param {number} channelNumber - Channel to remove
 */
export function removeChannel(channelNumber) {
    if (channelNumber === 0) {
        logger.warn('ChannelManager', 'Remove', 'Cannot remove channel 0 (Main)');
        return false;
    }
    
    const channel = channels.get(channelNumber);
    if (!channel) return false;
    
    // Remove pass mapping if it's a buffer
    if (channel.passId) {
        passToChannel.delete(channel.passId);
    }
    
    channels.delete(channelNumber);
    delete state.channels[`iChannel${channelNumber}`];
    
    logger.info('ChannelManager', 'Remove', `Channel removed: ch${channelNumber}`);
    events.emit(EVENTS.CHANNEL_CLEARED, { index: channelNumber });
    
    return true;
}

// ============================================================================
// Channel Queries
// ============================================================================

/**
 * Get channel info by number
 */
export function getChannel(channelNumber) {
    return channels.get(channelNumber) || null;
}

/**
 * Get channel number for a pass
 */
export function getChannelForPass(passId) {
    return passToChannel.get(passId) ?? null;
}

/**
 * Get all channels
 */
export function getAllChannels() {
    const result = [];
    for (const [num, ch] of channels) {
        result.push({ number: num, ...ch });
    }
    return result.sort((a, b) => a.number - b.number);
}

/**
 * Get channel count
 */
export function getChannelCount() {
    return channels.size;
}

/**
 * Get next available channel number (for UI display)
 */
export function getNextChannelNumber() {
    return nextChannelNumber;
}

// ============================================================================
// Buffer Pass Helpers
// ============================================================================

/**
 * Get next buffer letter (A, B, C, ...)
 */
export function getNextBufferLetter() {
    const usedLetters = new Set();
    for (const [, ch] of channels) {
        if (ch.type === 'buffer' && ch.passId) {
            const match = ch.passId.match(/Buffer([A-Z])/);
            if (match) usedLetters.add(match[1]);
        }
    }
    
    // Find first unused letter
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i); // A=65
        if (!usedLetters.has(letter)) {
            return letter;
        }
    }
    
    return null; // All letters used (unlikely)
}

/**
 * Build channel map for renderer
 * Maps channel numbers to their pass IDs or media info
 */
export function buildChannelMap() {
    const map = {};
    for (const [num, ch] of channels) {
        map[num] = {
            type: ch.type,
            passId: ch.passId,
            source: ch.source
        };
    }
    return map;
}

// ============================================================================
// Reset
// ============================================================================

/**
 * Reset channel system (for new shader)
 */
export function reset() {
    // Keep channel 0, remove all others
    for (const num of channels.keys()) {
        if (num !== 0) {
            channels.delete(num);
        }
    }
    
    // Clear pass mappings except Image
    for (const passId of passToChannel.keys()) {
        if (passId !== 'Image') {
            passToChannel.delete(passId);
        }
    }
    
    nextChannelNumber = 1;
    
    // Reset state
    state.channels = {
        iChannel0: { type: 'main', passId: 'Image' }
    };
    
    logger.info('ChannelManager', 'Reset', 'Channels reset');
    events.emit(EVENTS.CHANNEL_CLEARED, { all: true });
}

// ============================================================================
// Export
// ============================================================================

export const channelManager = {
    init,
    createBufferChannel,
    createMediaChannel,
    removeChannel,
    getChannel,
    getChannelForPass,
    getAllChannels,
    getChannelCount,
    getNextChannelNumber,
    getNextBufferLetter,
    buildChannelMap,
    reset
};

export default channelManager;
