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
    },
    // Musical chromagram (12×12 note detection grid)
    chromagram: {
        name: 'Chromagram (12×12)',
        fftSize: 8192,      // Higher FFT for better note resolution
        width: 12,          // 12 columns (octaves/special)
        height: 12,         // 12 rows (semitones)
        description: 'Musical note detection (octaves × semitones)'
    },
    // High-res chromagram for better low-octave separation
    chromagram_hq: {
        name: 'Chromagram HQ (12×12)',
        fftSize: 16384,     // Double FFT for much better resolution
        width: 12,
        height: 12,
        description: 'High-res note detection (~3Hz/bin)'
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
    // For chromagram modes, use RGB8 format (red=energy, green=delta, blue=temporal avg)
    // For standard modes, use R8 format (red=energy only)
    const isChromagram = mode.startsWith('chromagram');
    const format = isChromagram ? gl.RGB : gl.RED;
    const internalFormat = isChromagram ? gl.RGB8 : gl.R8;
    
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        width,
        height,
        0,
        format,
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
        height,
        previousFrame: isChromagram ? new Float32Array(width * height) : null,  // Store previous frame for delta
        temporalAverage: isChromagram ? new Float32Array(width * height) : null  // Store temporal average for blue channel
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
 * Routes to appropriate update function based on mode
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to update
 * @param {AnalyserNode} analyser - Web Audio analyser node
 * @param {number} width - Texture width
 * @param {number} height - Texture height
 * @param {string} mode - Texture mode (optional, defaults to standard 2-row mode)
 * @param {Float32Array} previousFrame - Previous frame data for delta (chromagram only)
 * @param {Float32Array} temporalAverage - Temporal average data (chromagram only)
 */
export function updateAudioTexture(gl, texture, analyser, width, height, mode = 'shadertoy', previousFrame = null, temporalAverage = null) {
    if (!analyser) return;
    
    // Route to chromagram processor for 12×12 mode
    if (mode.startsWith('chromagram') || (width === 12 && height === 12)) {
        updateChromagramTexture(gl, texture, analyser, previousFrame, temporalAverage);
        return;
    }
    
    // Standard mode: 2-row texture (frequency + waveform)
    if (height !== 2) return;
    
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
 * Update chromagram texture with musical note analysis
 * Creates a 12×12 grid mapping FFT data to musical notes
 * 
 * Layout:
 *   Rows 0-11: Semitones (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
 *   Col 0: Sub-bass (< C1, ~32.7 Hz) / reserved for octave 0
 *   Col 1-9: Octaves 1-9 (32.7 Hz - 7902 Hz)
 *   Col 10: Octave 10 (8372 Hz - 16744 Hz) + ultrasonic catch-all (>16744 Hz)
 *   Col 11: Overall average energy level
 * 
 * Channels:
 *   Red: Current energy level (squared for emphasis)
 *   Green: Positive delta (energy increase) - great for beat detection!
 *   Blue: Temporal average (smoothed over time) - shows sustained notes
 * 
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to update
 * @param {AnalyserNode} analyser - Web Audio analyser node
 * @param {Float32Array} previousFrame - Previous frame data for delta calculation
 * @param {Float32Array} temporalAverage - Running average for temporal smoothing
 */
export function updateChromagramTexture(gl, texture, analyser, previousFrame, temporalAverage) {
    if (!analyser) return;
    
    // Get FFT data
    const frequencyBinCount = analyser.frequencyBinCount;
    const frequencyData = new Uint8Array(frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);
    
    // Calculate frequency per bin
    const sampleRate = analyser.context.sampleRate;
    const binWidth = sampleRate / analyser.fftSize;
    
    // Determine if this is HQ mode based on FFT size
    const isHQMode = analyser.fftSize >= 16384;
    
    // Initialize 12×12 grid (accumulator and count for averaging)
    const grid = new Float32Array(144).fill(0);
    const counts = new Float32Array(144).fill(0);
    
    // Note frequency boundaries (Hz) - C notes for each octave
    // Lower C1 threshold slightly to catch bins that round to C1
    const C1 = 30.0;     // Slightly below C1 (32.7 Hz) to catch nearby bins
    const B9 = 7902.13;  // End of octave 9
    
    // Total energy accumulator for column 11
    let totalEnergy = 0;
    let totalBins = 0;
    
    // Debug: Track which bins contribute to octave 1
    const oct1Bins = [];
    const oct9Bins = [];
    
    // Choose spreading parameters based on mode
    const spreadRange = isHQMode ? 0.8 : 1.5;  // HQ: tight, Standard: wide
    const spreadWidth = isHQMode ? 1 : 2;      // HQ: ±1, Standard: ±2
    
    // Process each FFT bin with fractional MIDI note spreading
    for (let bin = 0; bin < frequencyBinCount; bin++) {
        const hz = bin * binWidth;
        const value = frequencyData[bin] / 255.0; // Normalize to 0-1
        
        // Skip bin 0 (DC component, always zero)
        if (bin === 0) continue;
        
        // Skip if no energy
        if (value === 0) continue;
        
        // Accumulate total energy
        totalEnergy += value;
        totalBins++;
        
        // Musical range: convert Hz to MIDI note number (fractional)
        // MIDI note formula: n = 69 + 12 * log2(f / 440)
        // Where 440 Hz = A4 (MIDI note 69)
        // Handle very low frequencies gracefully
        if (hz < 10) continue; // Skip extremely low frequencies
        
        const midiFloat = 69 + 12 * Math.log2(hz / 440);
        
        // Determine if this should go to special columns
        if (midiFloat < 23) {
            // Very low, definitely sub-bass: column 0
            for (let row = 0; row < 12; row++) {
                const idx = row * 12 + 0;
                grid[idx] += value;
                counts[idx] += 1;
            }
            continue;
        }
        
        if (midiFloat >= 132) {
            // High freq (above B10, ~16.7kHz): column 10 catch-all (shared with octave 10)
            // Note: Octave 10 notes will populate their specific semitone rows
            // This catch-all distributes ultrasonic content across all rows
            for (let row = 0; row < 12; row++) {
                const idx = row * 12 + 10;
                grid[idx] += value;
                counts[idx] += 1;
            }
            continue;
        }
        
        // For notes in range, spread energy based on mode
        const centerMidi = Math.round(midiFloat);
        
        for (let midiOffset = -spreadWidth; midiOffset <= spreadWidth; midiOffset++) {
            const targetMidi = centerMidi + midiOffset;
            
            // Calculate distance-based weight
            const distance = Math.abs(midiFloat - targetMidi);
            if (distance > spreadRange) continue; // Too far, skip
            
            // Linear falloff weight
            const weight = Math.max(0, 1.0 - (distance / spreadRange));
            
            const octave = Math.floor(targetMidi / 12) - 1;
            const semitone = targetMidi % 12;
            
            // Accept octaves 1-10 (extended to include full musical range)
            if (octave >= 1 && octave <= 10 && weight > 0.01) {
                // Map octave to column: 1-9 use columns 1-9, octave 10 uses column 10
                const col = octave;
                const row = semitone;
                const idx = row * 12 + col;
                
                grid[idx] += value * weight;
                counts[idx] += weight;
                
                // Debug tracking
                if (octave === 1) {
                    oct1Bins.push({ 
                        bin, 
                        hz: hz.toFixed(1), 
                        midi: midiFloat.toFixed(2), 
                        targetMidi, 
                        semitone, 
                        value: value.toFixed(3), 
                        weight: weight.toFixed(3) 
                    });
                }
                if (octave === 9) {
                    oct9Bins.push({ 
                        bin, 
                        hz: hz.toFixed(1), 
                        midi: midiFloat.toFixed(2),
                        targetMidi,
                        semitone, 
                        value: value.toFixed(3), 
                        weight: weight.toFixed(3)
                    });
                }
            }
        }
    }
    
    // Average accumulated values (for display)
    for (let i = 0; i < 144; i++) {
        if (counts[i] > 0) {
            grid[i] /= counts[i];
        }
    }
    
    // Column 11: overall average energy level (same value for all rows)
    const avgLevel = totalBins > 0 ? totalEnergy / totalBins : 0;
    for (let row = 0; row < 12; row++) {
        grid[row * 12 + 11] = avgLevel;
    }
    
    // Calculate delta (change from previous frame)
    // Delta = current - previous, clamped to [0, inf) so negative = 0
    const delta = new Float32Array(144);
    for (let i = 0; i < 144; i++) {
        if (previousFrame) {
            const change = grid[i] - previousFrame[i];
            delta[i] = change > 0 ? change : 0.0;  // Positive only, negative = zero
            
            // Apply amplification to make beats visible
            delta[i] *= 15.0;
        } else {
            delta[i] = 0;
        }
    }
    
    // Store current frame for next delta calculation (BEFORE squaring)
    if (previousFrame) {
        previousFrame.set(grid);
    }
    
    // Square the energy values to emphasize strong notes and reduce weak ones
    // Do this BEFORE temporal average so all channels are on same scale
    for (let i = 0; i < 144; i++) {
        grid[i] = grid[i] * grid[i];
    }
    
    // Calculate temporal average (smoothed energy for blue channel)
    // Use exponential moving average with alpha = 0.2 (smooth over ~5 frames)
    const alpha = 0.2;  // How much of current frame to blend (0.1 = slow smooth, 0.3 = fast response)
    if (temporalAverage) {
        for (let i = 0; i < 144; i++) {
            // EMA: new_avg = alpha * current + (1 - alpha) * old_avg
            temporalAverage[i] = alpha * grid[i] + (1 - alpha) * temporalAverage[i];
        }
    }
    
    // Convert to Uint8Array with RGB format (red=energy, green=delta, blue=temporal avg)
    const textureData = new Uint8Array(144 * 3); // 3 channels
    for (let i = 0; i < 144; i++) {
        // Red: squared current energy (transients + sustained)
        textureData[i * 3 + 0] = Math.floor(Math.min(1.0, grid[i]) * 255);
        // Green: positive delta (beat/attack detection)
        textureData[i * 3 + 1] = Math.floor(Math.min(1.0, delta[i]) * 255);
        // Blue: temporal average SQUARED (sustained tones, very smooth, lower than instant)
        const blueSquared = temporalAverage ? temporalAverage[i] * temporalAverage[i] : 0;
        textureData[i * 3 + 2] = Math.floor(Math.min(1.0, blueSquared) * 255);
    }
    
    // Upload to GPU
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0, 0,           // x, y offset
        12, 12,         // width, height
        gl.RGB,         // 3-channel format
        gl.UNSIGNED_BYTE,
        textureData
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
        const { texture, mode: modeConfig, width, height, previousFrame, temporalAverage } = createAudioTexture(gl, mode);
        
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
            path: audioPath,
            previousFrame,  // Include previousFrame for delta calculation
            temporalAverage  // Include temporalAverage for blue channel
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

