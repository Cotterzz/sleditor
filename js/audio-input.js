// ============================================================================
// Audio Input - Audio channel management and texture generation
// ============================================================================
// Provides Shadertoy-compatible audio analysis textures from audio files

import { state } from './core.js';

// Audio texture modes (different FFT sizes for quality/performance tradeoff)
export const AUDIO_TEXTURE_MODES = {
    // Shadertoy-compatible (512 pixel texture from 1024 FFT bins)
    shadertoy: {
        name: 'Shadertoy (512)',
        fftSize: 2048,      // FFT size (Shadertoy default)
        width: 512,         // Texture width (downsampled from 1024 bins)
        height: 2,          // Rows: 0=waveform, 1=frequency
        description: 'Standard Shadertoy compatibility'
    },
    // Full FFT data from 2048 mode
    standard: {
        name: 'Standard (1024)',
        fftSize: 2048,
        width: 1024,
        height: 2,
        description: 'Full FFT resolution (no downsampling)'
    },
    // High quality mode
    high: {
        name: 'High Quality (2048)',
        fftSize: 4096,
        width: 2048,
        height: 2,
        description: 'Higher frequency resolution'
    },
    // Ultra quality (may impact performance)
    ultra: {
        name: 'Ultra (4096)',
        fftSize: 8192,
        width: 4096,
        height: 2,
        description: 'Maximum detail (may be slow)'
    }
};

/**
 * Create audio texture for WebGL
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {string} mode - Texture mode key from AUDIO_TEXTURE_MODES
 * @returns {Object} Texture and mode info
 */
export function createAudioTexture(gl, mode = 'shadertoy') {
    const modeConfig = AUDIO_TEXTURE_MODES[mode] || AUDIO_TEXTURE_MODES.shadertoy;
    const { width, height } = modeConfig;
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Create empty texture (will be updated each frame)
    // Use R8 format for grayscale audio data (efficient)
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        width,
        height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        null
    );
    
    // Audio textures should use nearest filtering for accuracy
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    console.log(`✓ Audio texture created: ${width}×${height} (${mode} mode)`);
    
    return {
        texture,
        mode: modeConfig,
        width,
        height
    };
}

/**
 * Create audio context and analyser for audio file
 * @param {string} audioPath - Path to audio file
 * @param {string} mode - Texture mode key
 * @returns {Promise<Object>} Audio element, analyser, and context
 */
export async function createAudioAnalyser(audioPath, mode = 'shadertoy') {
    const modeConfig = AUDIO_TEXTURE_MODES[mode] || AUDIO_TEXTURE_MODES.shadertoy;
    
    return new Promise((resolve, reject) => {
        // Always create a fresh AudioContext if needed
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const audioContext = state.audioContext;
        
        // IMPORTANT: Create a NEW audio element every time
        // You can only call createMediaElementSource() once per element
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.loop = true;
        audio.preload = 'auto';
        
        // Create analyser node
        const analyser = audioContext.createAnalyser();
        
        // For Shadertoy mode, use Web Audio API defaults (fftSize=2048, frequencyBinCount=1024)
        // For other modes, set the fftSize from config
        if (mode !== 'shadertoy') {
            analyser.fftSize = modeConfig.fftSize;
        }
        // Note: Shadertoy uses all default analyser settings:
        // - fftSize: 2048 (default)
        // - frequencyBinCount: 1024 (fftSize / 2)
        // - minDecibels: -100 (default)
        // - maxDecibels: -30 (default)
        // - smoothingTimeConstant: 0.8 (default)
        
        console.log(`Creating audio analyser (mode=${mode}): fftSize=${analyser.fftSize}, frequencyBinCount=${analyser.frequencyBinCount}`);
        
        // Create media source - this can only be done ONCE per audio element
        let source;
        try {
            source = audioContext.createMediaElementSource(audio);
            console.log('  ✓ MediaElementSource created');
        } catch (error) {
            console.error('  ✗ Failed to create media element source:', error);
            reject(new Error('Failed to create audio source: ' + error.message));
            return;
        }
        
        // Connect: source -> analyser -> global gain -> destination
        try {
            source.connect(analyser);
            const destination = state.gainNode || audioContext.destination;
            analyser.connect(destination);
            console.log('  ✓ Audio nodes connected');
        } catch (error) {
            console.error('  ✗ Failed to connect audio nodes:', error);
            reject(new Error('Failed to connect audio nodes: ' + error.message));
            return;
        }
        
        const canPlayHandler = () => {
            console.log(`✓ Audio ready: ${audioPath}`);
            // Remove listeners after successful load
            audio.removeEventListener('canplaythrough', canPlayHandler);
            audio.removeEventListener('error', errorHandler);
            resolve({
                audio,
                analyser,
                source,
                context: audioContext
            });
        };
        
        const errorHandler = (e) => {
            console.error(`Failed to load audio: ${audioPath}`, e);
            // Remove listeners on error
            audio.removeEventListener('canplaythrough', canPlayHandler);
            audio.removeEventListener('error', errorHandler);
            reject(new Error(`Failed to load audio: ${audioPath}`));
        };
        
        audio.addEventListener('canplaythrough', canPlayHandler);
        audio.addEventListener('error', errorHandler);
        
        // Set src LAST to trigger loading
        audio.src = audioPath;
    });
}

/**
 * Update audio texture with current analysis data
 * Shadertoy-compatible: uses 1024 FFT bins but only uses first 512 for texture
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to update
 * @param {AnalyserNode} analyser - Web Audio analyser node
 * @param {number} width - Texture width
 * @param {number} height - Texture height (should be 2)
 */
export function updateAudioTexture(gl, texture, analyser, width, height) {
    if (!analyser || height !== 2) return;
    
    // Shadertoy uses the default fftSize of 2048, giving frequencyBinCount of 1024
    // But their texture is only 512 pixels wide
    // Looking at their code, they pass a 1024-element array to a 512-pixel texture update
    // This likely just uses the FIRST 512 elements, not downsampling
    
    const frequencyBinCount = analyser.frequencyBinCount;
    
    // Get full frequency data (typically 1024 elements)
    const fullFrequencyData = new Uint8Array(frequencyBinCount);
    analyser.getByteFrequencyData(fullFrequencyData);
    
    // Get full waveform data
    const fullWaveformData = new Uint8Array(frequencyBinCount);
    analyser.getByteTimeDomainData(fullWaveformData);
    
    // For Shadertoy compatibility: just use the first 'width' samples
    // Don't skip samples - just truncate to texture width
    const frequencyData = fullFrequencyData.slice(0, width);
    const waveformData = fullWaveformData.slice(0, width);
    
    // Update texture
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Row 0: Frequency spectrum (FFT) - SHADERTOY HAS FREQUENCY ON ROW 0!
    gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0, 0,           // x, y offset
        width, 1,       // width, height
        gl.RED,
        gl.UNSIGNED_BYTE,
        frequencyData
    );
    
    // Row 1: Waveform (time domain) - SHADERTOY HAS WAVEFORM ON ROW 1!
    gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0, 1,           // x, y offset
        width, 1,       // width, height
        gl.RED,
        gl.UNSIGNED_BYTE,
        waveformData
    );
    
    gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Load audio from URL and create complete audio channel
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {string} audioPath - Path to audio file
 * @param {string} mode - Texture mode key
 * @returns {Promise<Object>} Complete audio channel object
 */
export async function loadAudioChannel(gl, audioPath, mode = 'shadertoy') {
    try {
        // Create texture
        const { texture, mode: modeConfig, width, height } = createAudioTexture(gl, mode);
        
        // Create audio and analyser
        const { audio, analyser, source, context } = await createAudioAnalyser(audioPath, mode);
        
        console.log('✓ Audio channel loaded, creating return object with playing=false');
        
        return {
            texture,
            audio,
            analyser,
            source,
            context,
            mode: modeConfig,
            width,
            height,
            playing: false,  // Always start paused
            path: audioPath
        };
    } catch (error) {
        console.error('Failed to create audio channel:', error);
        throw error;
    }
}

/**
 * Clean up audio channel resources
 * @param {Object} channel - Audio channel object
 */
export function cleanupAudioChannel(channel) {
    if (!channel) return;
    
    console.log('Cleaning up audio channel...', {
        hasAudio: !!channel.audio,
        hasSource: !!channel.source,
        hasAnalyser: !!channel.analyser
    });
    
    // Disconnect Web Audio nodes FIRST (before touching audio element)
    if (channel.source) {
        try {
            channel.source.disconnect();
            console.log('  ✓ Source disconnected');
        } catch (e) {
            console.warn('  Error disconnecting source:', e.message);
        }
        channel.source = null;
    }
    
    if (channel.analyser) {
        try {
            channel.analyser.disconnect();
            console.log('  ✓ Analyser disconnected');
        } catch (e) {
            console.warn('  Error disconnecting analyser:', e.message);
        }
        channel.analyser = null;
    }
    
    // THEN stop and cleanup audio element
    if (channel.audio) {
        try {
            // Stop playback first
            channel.audio.pause();
            channel.audio.currentTime = 0;
            
            // Remove ALL event listeners by cloning the element (nuclear option but effective)
            // This prevents any lingering error/load events from firing
            const oldAudio = channel.audio;
            const newAudio = oldAudio.cloneNode(false);
            if (oldAudio.parentNode) {
                oldAudio.parentNode.replaceChild(newAudio, oldAudio);
            }
            
            // Clear src AFTER cloning to prevent events
            channel.audio.src = '';
            channel.audio.load();
            console.log('  ✓ Audio element cleaned');
        } catch (e) {
            console.warn('  Error cleaning up audio element:', e.message);
        }
        channel.audio = null;
    }
    
    channel.playing = false;
    console.log('✓ Audio channel fully cleaned up');
}

/**
 * Play audio channel
 * @param {Object} channel - Audio channel object
 */
export async function playAudioChannel(channel) {
    if (!channel || !channel.audio) {
        console.error('Cannot play audio: channel or audio element missing');
        return;
    }
    
    console.log('🎵 Attempting to play audio...');
    
    // Resume audio context if suspended (required by some browsers)
    if (channel.context && channel.context.state === 'suspended') {
        console.log('  Resuming audio context...');
        await channel.context.resume();
    }
    
    try {
        await channel.audio.play();
        channel.playing = true;
        console.log('  ▶ Audio playing');
    } catch (error) {
        console.error('  ✗ Failed to play audio:', error);
        channel.playing = false;
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('audio-play-blocked', { detail: { error } }));
        }
        throw error; // Re-throw so UI can handle it
    }
}

/**
 * Pause audio channel
 * @param {Object} channel - Audio channel object
 */
export function pauseAudioChannel(channel) {
    if (!channel || !channel.audio) {
        console.error('Cannot pause audio: channel or audio element missing');
        return;
    }
    
    console.log('⏸ Pausing audio...');
    channel.audio.pause();
    channel.playing = false;
    console.log('  ✓ Audio paused');
}

/**
 * Set audio volume
 * @param {Object} channel - Audio channel object
 * @param {number} volume - Volume (0.0 to 1.0)
 */
export function setAudioLoop(channel, loop) {
    if (!channel || !channel.audio) return;
    
    channel.audio.loop = loop;
}

