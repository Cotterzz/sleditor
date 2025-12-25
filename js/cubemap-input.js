// ============================================================================
// Cubemap Input - Load and manage cubemap textures (6-face skyboxes)
// ============================================================================

import { state } from './core.js';
import * as mediaLoader from './media-loader.js';

// Face names in the order WebGL expects them
const CUBE_FACES = [
    { name: 'px', target: 'TEXTURE_CUBE_MAP_POSITIVE_X' },
    { name: 'nx', target: 'TEXTURE_CUBE_MAP_NEGATIVE_X' },
    { name: 'py', target: 'TEXTURE_CUBE_MAP_POSITIVE_Y' },
    { name: 'ny', target: 'TEXTURE_CUBE_MAP_NEGATIVE_Y' },
    { name: 'pz', target: 'TEXTURE_CUBE_MAP_POSITIVE_Z' },
    { name: 'nz', target: 'TEXTURE_CUBE_MAP_NEGATIVE_Z' }
];

/**
 * Load a cubemap texture from catalog
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} cubemapId - Cubemap ID from catalog
 * @param {Object} options - Texture options
 * @returns {Promise<{texture: WebGLTexture, size: number}>}
 */
export async function loadCubemapTexture(gl, cubemapId, options = {}) {
    const mediaInfo = mediaLoader.getMediaInfo(cubemapId);
    
    if (!mediaInfo || mediaInfo.type !== 'cubemap') {
        console.error(`Cubemap not found: ${cubemapId}`);
        return createFallbackCubemap(gl);
    }
    
    return loadCubemapFromPaths(gl, mediaInfo.path, mediaInfo.ext, mediaInfo.size, options);
}

/**
 * Load cubemap from folder path
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} basePath - Base folder path (e.g., "media/cubemaps/venice/")
 * @param {string} ext - File extension (e.g., ".jpg")
 * @param {number} size - Expected size of each face
 * @param {Object} options - Texture options
 * @returns {Promise<{texture: WebGLTexture, size: number}>}
 */
export async function loadCubemapFromPaths(gl, basePath, ext, size, options = {}) {
    const {
        filter = 'linear',  // 'linear' or 'mipmap'
    } = options;
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    
    if (filter === 'mipmap') {
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } else {
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    
    // Load all 6 faces
    const loadPromises = CUBE_FACES.map(async (face) => {
        const url = `${basePath}${face.name}${ext}`;
        const image = await loadImage(url);
        return { face, image };
    });
    
    try {
        const results = await Promise.all(loadPromises);
        
        // Upload each face to the cubemap
        for (const { face, image } of results) {
            const target = gl[face.target];
            gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        }
        
        // Generate mipmaps if requested
        if (filter === 'mipmap') {
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        }
        
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
        
        console.log(`✓ Cubemap loaded: ${basePath} (${size}×${size})`);
        
        return { texture, size: results[0].image.width };
        
    } catch (error) {
        console.error(`Failed to load cubemap: ${basePath}`, error);
        gl.deleteTexture(texture);
        return createFallbackCubemap(gl);
    }
}

/**
 * Load a single image
 * @param {string} url - Image URL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load: ${url}`));
        image.src = url;
    });
}

/**
 * Create a fallback cubemap (solid color)
 * @param {WebGLRenderingContext} gl - WebGL context
 * @returns {{texture: WebGLTexture, size: number}}
 */
export function createFallbackCubemap(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    
    // Create a 1x1 pixel for each face (gray color)
    const pixel = new Uint8Array([128, 128, 128, 255]);
    
    for (const face of CUBE_FACES) {
        const target = gl[face.target];
        gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    
    return { texture, size: 1 };
}

/**
 * Get list of available cubemaps from catalog
 * @returns {Array} List of cubemap info objects
 */
export function getAvailableCubemaps() {
    const catalog = mediaLoader.getCatalog?.() || { cubemaps: [] };
    return catalog.cubemaps || [];
}

/**
 * Cleanup a cubemap texture
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to delete
 */
export function cleanupCubemap(gl, texture) {
    if (gl && texture) {
        gl.deleteTexture(texture);
    }
}

