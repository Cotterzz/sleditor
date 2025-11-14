// ============================================================================
// Media Loader - Load and manage image/video assets
// ============================================================================

let catalog = null;
const externalMedia = new Map(); // Store URL-imported media

/**
 * Load media catalog from JSON
 * @returns {Promise<Object>} Catalog with images and videos
 */
export async function loadMediaCatalog() {
    if (catalog) return catalog;
    
    try {
        const response = await fetch('media/catalog.json');
        catalog = await response.json();
        console.log('✓ Media catalog loaded:', catalog);
        return catalog;
    } catch (error) {
        console.error('Failed to load media catalog:', error);
        return { images: [], videos: [] };
    }
}

/**
 * Register external media (e.g., from URL import)
 * @param {Object} mediaInfo - Media info object
 */
export function registerExternalMedia(mediaInfo) {
    externalMedia.set(mediaInfo.id, mediaInfo);
    console.log(`✓ Registered external media: ${mediaInfo.id}`);
}

/**
 * Get media info by ID
 * @param {string} mediaId - Media ID from catalog or external
 * @returns {Object|null} Media info or null if not found
 */
export function getMediaInfo(mediaId) {
    // Check external media first (URL imports)
    if (externalMedia.has(mediaId)) {
        return externalMedia.get(mediaId);
    }
    
    // Then check catalog
    if (!catalog) {
        console.warn('Catalog not loaded yet');
        return null;
    }
    
    const image = catalog.images.find(img => img.id === mediaId);
    if (image) return image;
    
    const video = catalog.videos.find(vid => vid.id === mediaId);
    if (video) return video;
    
    return null;
}

/**
 * Apply texture parameters based on options
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to configure
 * @param {Object} options - Texture options {vflip, wrap, filter, anisotropic}
 */
export function applyTextureParameters(gl, texture, options = {}) {
    const {
        vflip = true,
        wrap = 'repeat',
        filter = 'mipmap',
        anisotropic = false
    } = options;
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Wrap mode
    let wrapMode;
    switch (wrap) {
        case 'repeat':
            wrapMode = gl.REPEAT;
            break;
        case 'mirror':
            wrapMode = gl.MIRRORED_REPEAT;
            break;
        case 'clamp':
        default:
            wrapMode = gl.CLAMP_TO_EDGE;
            break;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
    
    // Filter mode
    switch (filter) {
        case 'mipmap':
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            // Generate mipmaps (must be done after texImage2D)
            gl.generateMipmap(gl.TEXTURE_2D);
            break;
        case 'linear':
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            break;
        case 'nearest':
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            break;
    }
    
    // Anisotropic filtering (if supported and requested)
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
        if (anisotropic) {
            const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
        } else {
            // Explicitly disable anisotropic filtering
            gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 1.0);
        }
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Load image as WebGL texture
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} imagePath - Path to image file
 * @param {Object} options - Texture options {vflip, wrap, filter, anisotropic}
 * @returns {Promise<WebGLTexture>} Texture object
 */
export async function loadImageTexture(gl, imagePath, options = {}) {
    const { vflip = true } = options;
    
    return new Promise((resolve, reject) => {
        const texture = gl.createTexture();
        const image = new Image();
        
        // Set crossOrigin BEFORE setting src (critical for CORS)
        image.crossOrigin = 'anonymous';
        
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            
            // V-flip handling (Shadertoy default: images are Y-down, GLSL is Y-up)
            if (vflip) {
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            }
            
            // Upload image data
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                image
            );
            
            // Reset flip setting
            if (vflip) {
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            }
            
            gl.bindTexture(gl.TEXTURE_2D, null);
            
            // Apply texture parameters (wrap, filter, anisotropic)
            applyTextureParameters(gl, texture, options);
            
            console.log(`✓ Image texture loaded: ${imagePath} (${image.width}×${image.height})`);
            resolve(texture);
        };
        
        image.onerror = () => {
            console.error(`Failed to load image: ${imagePath}`);
            reject(new Error(`Failed to load image: ${imagePath}`));
        };
        
        image.src = imagePath;
    });
}

/**
 * Create fallback checkerboard texture
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {number} size - Texture size (default 256)
 * @returns {WebGLTexture} Checkerboard texture
 */
export function createFallbackTexture(gl, size = 256) {
    const texture = gl.createTexture();
    const data = new Uint8Array(size * size * 4);
    
    // Generate checkerboard pattern
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const checker = (Math.floor(x / 16) + Math.floor(y / 16)) % 2;
            const value = checker ? 255 : 128;
            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            data[i + 3] = 255;   // A
        }
    }
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        size,
        size,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
    );
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    console.log('✓ Fallback texture created');
    return texture;
}

/**
 * Create video texture and element
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} videoPath - Path to video file
 * @returns {Promise<{texture: WebGLTexture, videoElement: HTMLVideoElement}>}
 */
export async function createVideoTexture(gl, videoPath) {
    return new Promise((resolve, reject) => {
        const texture = gl.createTexture();
        const video = document.createElement('video');
        
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true; // Start muted to allow autoplay
        video.preload = 'metadata';
        
        video.addEventListener('loadeddata', () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            
            // Set texture parameters
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            
            // Upload first frame
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                video
            );
            
            gl.bindTexture(gl.TEXTURE_2D, null);
            
            console.log(`✓ Video texture created: ${videoPath} (${video.videoWidth}×${video.videoHeight})`);
            resolve({ texture, videoElement: video });
        });
        
        video.addEventListener('error', () => {
            console.error(`Failed to load video: ${videoPath}`);
            reject(new Error(`Failed to load video: ${videoPath}`));
        });
        
        video.src = videoPath;
    });
}

/**
 * Update video texture with current frame
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {WebGLTexture} texture - Texture to update
 * @param {HTMLVideoElement} videoElement - Video element
 */
export function updateVideoTexture(gl, texture, videoElement) {
    if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            videoElement
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

