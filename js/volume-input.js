// ============================================================================
// Volume Input - 3D Texture Loading and Management
// ============================================================================
// Handles loading binary 3D texture data and creating WebGL TEXTURE_3D
// ============================================================================

import { state } from './core.js';

// Cache for loaded volume data
const volumeCache = new Map();

// Catalog cache
let volumeCatalog = null;

/**
 * Load volume catalog from catalog.json
 * @returns {Promise<Array>} Array of volume definitions
 */
async function loadVolumeCatalog() {
    if (volumeCatalog) {
        return volumeCatalog;
    }
    
    try {
        const response = await fetch('media/catalog.json');
        if (!response.ok) {
            throw new Error('Failed to load catalog');
        }
        const catalog = await response.json();
        volumeCatalog = catalog.volumes || [];
        return volumeCatalog;
    } catch (error) {
        console.error('Failed to load volume catalog:', error);
        return [];
    }
}

/**
 * Get volume info by ID
 * @param {string} volumeId - Volume ID
 * @returns {Promise<Object|null>} Volume info or null
 */
async function getVolumeInfo(volumeId) {
    const catalog = await loadVolumeCatalog();
    return catalog.find(v => v.id === volumeId) || null;
}

/**
 * Load volume data from binary file
 * @param {string} volumeId - Volume texture ID
 * @returns {Promise<Uint8Array>} Volume data
 */
export async function loadVolumeData(volumeId) {
    if (volumeCache.has(volumeId)) {
        return volumeCache.get(volumeId);
    }
    
    const volumeInfo = await getVolumeInfo(volumeId);
    if (!volumeInfo) {
        throw new Error(`Unknown volume texture: ${volumeId}`);
    }
    
    const response = await fetch(volumeInfo.path);
    if (!response.ok) {
        throw new Error(`Failed to load volume: ${volumeInfo.path}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    let data = new Uint8Array(arrayBuffer);
    
    // Validate size
    const expectedSize = volumeInfo.size * volumeInfo.size * volumeInfo.size * volumeInfo.channels;
    if (data.length !== expectedSize) {
        // Shadertoy .bin files have a 20-byte header - skip it if present
        const headerSize = data.length - expectedSize;
        if (headerSize === 20) {
            console.log(`Volume file has ${headerSize}-byte header, skipping...`);
            data = data.slice(headerSize);
        } else {
            console.warn(`Volume data size mismatch: got ${data.length}, expected ${expectedSize}`);
        }
    }
    
    volumeCache.set(volumeId, data);
    return data;
}

/**
 * Create a 3D texture from volume data
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {string} volumeId - Volume texture ID
 * @returns {Promise<{texture: WebGLTexture, info: Object}>}
 */
export async function createVolumeTexture(gl, volumeId) {
    const volumeInfo = await getVolumeInfo(volumeId);
    if (!volumeInfo) {
        throw new Error(`Unknown volume texture: ${volumeId}`);
    }
    
    const data = await loadVolumeData(volumeId);
    const size = volumeInfo.size;
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, texture);
    
    // Upload 3D texture data
    if (volumeInfo.channels === 1) {
        // Single channel (R8)
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,
            gl.R8,
            size, size, size,
            0,
            gl.RED,
            gl.UNSIGNED_BYTE,
            data
        );
    } else {
        // RGBA
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,
            gl.RGBA8,
            size, size, size,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data
        );
    }
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    
    gl.bindTexture(gl.TEXTURE_3D, null);
    
    console.log(`✓ Volume texture created: ${volumeInfo.name} (${size}³, ${volumeInfo.channels} channels)`);
    
    return {
        texture,
        info: volumeInfo,
        size,
        channels: volumeInfo.channels
    };
}

/**
 * Create a volume channel
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {string} volumeId - Volume texture ID
 * @returns {Promise<Object>} Volume channel data
 */
export async function createVolumeChannel(gl, volumeId) {
    const result = await createVolumeTexture(gl, volumeId);
    
    return {
        texture: result.texture,
        volumeId,
        info: result.info,
        size: result.size,
        channels: result.channels,
        active: true
    };
}

/**
 * Cleanup volume channel resources
 * @param {Object} volumeData - Volume channel data
 */
export function cleanupVolumeChannel(volumeData) {
    if (volumeData?.texture) {
        const gl = state.glContext;
        if (gl) {
            gl.deleteTexture(volumeData.texture);
        }
    }
}

/**
 * Get list of available volumes for UI (async)
 * @returns {Promise<Array<{id: string, name: string, size: number, channels: number}>>}
 */
export async function getAvailableVolumes() {
    const catalog = await loadVolumeCatalog();
    return catalog.map(vol => ({
        id: vol.id,
        name: vol.name,
        size: vol.size,
        channels: vol.channels
    }));
}
