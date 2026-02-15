/**
 * WebGL Renderer - Shadertoy-compatible with Multipass Support
 * 
 * Supports:
 * - Multiple passes (Image, BufferA, BufferB, etc.)
 * - Global channel namespace (iChannel0 = Main, iChannel1 = first created, etc.)
 * - Ping-pong buffers for self-referencing passes
 * - Common code prepended to all passes
 */

import { logger } from '../core/logger.js';
import { events, EVENTS } from '../core/events.js';
import { state } from '../core/state.js';

// ============================================================================
// GLSL Boilerplate
// ============================================================================

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 position;
void main() {
    gl_Position = vec4(position, 0.0, 1.0);
}`;

// Boilerplate prefix - channel uniforms are injected dynamically
const FRAGMENT_PREFIX = `#version 300 es
precision highp float;

// Shadertoy-compatible uniforms
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform float iSampleRate;

// Sleditor-specific uniforms
uniform float uGlassMode;  // Glass mode control (transparent background)
uniform int iTheme;        // Current theme ID (0=default, 1=designer, 2=architect, 3=coder, 4=hacker, 5=engineer)

out vec4 fragColor;

`;

const FRAGMENT_SUFFIX = `
void main() {
    mainImage(fragColor, gl_FragCoord.xy);
    if (uGlassMode < 0.5) {
        fragColor.a = 1.0;
    }
}`;

// ============================================================================
// Renderer Factory
// ============================================================================

/**
 * Create a WebGL renderer with multipass support
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {Object} options - Renderer options
 */
export function createRenderer(canvas, options = {}) {
    const { alpha = false } = options;
    
    const gl = canvas.getContext('webgl2', {
        alpha: alpha,
        premultipliedAlpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    });
    
    if (!gl) {
        logger.error('Render', 'WebGL', 'WebGL2 not supported');
        return null;
    }
    
    // Enable float textures for HDR buffers
    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (floatExt) {
        logger.debug('Render', 'WebGL', 'Float textures enabled (RGBA32F)');
    }
    
    // Enable linear filtering on float textures (required for linear/mipmap on buffers)
    const floatLinearExt = gl.getExtension('OES_texture_float_linear');
    const halfFloatLinearExt = gl.getExtension('OES_texture_half_float_linear');
    if (floatLinearExt) {
        logger.debug('Render', 'WebGL', 'Float texture linear filtering enabled (32-bit)');
    } else {
        logger.warn('Render', 'WebGL', 'OES_texture_float_linear not available - RGBA32F filtering limited to NEAREST');
    }
    if (halfFloatLinearExt) {
        logger.debug('Render', 'WebGL', 'Half-float texture linear filtering enabled (16-bit)');
    }
    
    logger.debug('Render', 'WebGL', `WebGL2 context created (alpha: ${alpha})`);
    
    // ========================================================================
    // State
    // ========================================================================
    
    let quadVAO = null;
    let framebuffer = null;
    
    // Passes: Map<passId, PassData>
    // PassData: { program, uniforms, channelUniforms, channelNumber, requiredChannels }
    const passes = new Map();
    
    // Channels: Map<channelNumber, ChannelData>
    // ChannelData: { textures: [ping, pong], currentPing: 0|1, type, resolution }
    const channels = new Map();
    
    // Execution order (buffer passes first, then main)
    let passOrder = [];
    
    // Main pass reference (channel 0)
    let mainPassId = 'Image';
    
    // Common code (prepended to all passes)
    let commonCode = '';
    
    // Playback state
    let isPlaying = false;
    let startTime = 0;
    let pauseTime = 0;
    let frame = 0;
    let lastFrameTime = 0;
    let animationId = null;
    let mouse = { x: 0, y: 0, clickX: 0, clickY: 0, down: false };
    let fps = 0;
    let fpsFrames = 0;
    let fpsTime = 0;
    let audioContext = null; // Shared AudioContext for all audio channels
    let gainNode = null; // Global gain node for volume control
    let glassMode = 0.0;
    let pixelScale = 1; // Resolution divider (1 = full, 2 = half, etc.)
    let pixelated = true; // true = nearest neighbor (sharp pixels), false = linear (smooth)
    
    // Custom uniforms (shared across passes)
    let customUniforms = {};
    
    // Boilerplate line count for error adjustment
    const boilerplateLines = FRAGMENT_PREFIX.split('\n').length - 1;
    
    // Display program for blitting textures to canvas
    let displayProgram = null;
    let displayUniforms = {};
    
    // Which channel to display (default 0 = main output)
    let selectedDisplayChannel = 0;
    
    // Colorspace mode (false = sRGB/Shadertoy, true = Linear/compute.toys)
    let linearColorspace = false;
    
    // Sampler cache for per-receiver filter settings
    // Key: "filter:wrap" (e.g., "mipmap:repeat"), Value: WebGLSampler
    const samplerCache = new Map();
    
    // Track which channels need mipmap generation (any receiver uses mipmap filter)
    const mipmapNeeded = new Set();
    
    // Current theme ID for iTheme uniform (0=default, 1=designer, etc.)
    let currentThemeId = 0;
    
    // ========================================================================
    // Initialization
    // ========================================================================
    
    function init() {
        // Create fullscreen quad
        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        quadVAO = vao;
        
        // Create shared framebuffer
        framebuffer = gl.createFramebuffer();
        
        // Create passthrough display program
        createDisplayProgram();
        
        // Initialize channel 0 (Main) with ping-pong textures
        createChannel(0, canvas.width || 800, canvas.height || 600);
        
        logger.debug('Render', 'Init', 'Renderer initialized with multipass support');
    }
    
    /**
     * Create passthrough shader for displaying textures to canvas
     */
    function createDisplayProgram() {
        // Display shader with glass mode and colorspace (gamma correction) support
        // Stretches texture to fill the entire canvas regardless of texture resolution
        const displayFS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uGlassMode;
uniform int uLinearMode; // 0 = sRGB (default), 1 = linear (apply gamma)
uniform vec2 uCanvasResolution; // Canvas size for proper UV mapping
out vec4 fragColor;

// Gamma correction for linear colorspace mode
vec3 applyGamma(vec3 c) {
    return pow(c, vec3(1.0 / 2.2));
}

void main() {
    // UV from 0 to 1 across the canvas, stretching texture to fit
    vec2 uv = gl_FragCoord.xy / uCanvasResolution;
    vec4 col = texture(uTexture, uv);
    vec3 rgb = col.rgb;
    
    // In linear mode, apply gamma correction (compute.toys compatibility)
    if (uLinearMode == 1) {
        rgb = applyGamma(rgb);
    }
    
    fragColor = vec4(rgb, uGlassMode > 0.5 ? col.a : 1.0);
}`;
        
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VERTEX_SHADER);
        gl.compileShader(vs);
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, displayFS);
        gl.compileShader(fs);
        
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            logger.error('Render', 'Display', 'Display shader compile error: ' + gl.getShaderInfoLog(fs));
            return;
        }
        
        displayProgram = gl.createProgram();
        gl.attachShader(displayProgram, vs);
        gl.attachShader(displayProgram, fs);
        gl.bindAttribLocation(displayProgram, 0, 'position');
        gl.linkProgram(displayProgram);
        
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        
        if (!gl.getProgramParameter(displayProgram, gl.LINK_STATUS)) {
            logger.error('Render', 'Display', 'Display program link error');
            return;
        }
        
        displayUniforms = {
            uTexture: gl.getUniformLocation(displayProgram, 'uTexture'),
            uGlassMode: gl.getUniformLocation(displayProgram, 'uGlassMode'),
            uLinearMode: gl.getUniformLocation(displayProgram, 'uLinearMode'),
            uCanvasResolution: gl.getUniformLocation(displayProgram, 'uCanvasResolution')
        };
        
        logger.debug('Render', 'Display', 'Display program created with colorspace support');
    }
    
    // ========================================================================
    // Channel Management
    // ========================================================================
    
    /**
     * Create or resize a channel's textures
     */
    function createChannel(channelNumber, width, height) {
        const existing = channels.get(channelNumber);
        
        // Delete old textures if resizing
        if (existing?.textures) {
            existing.textures.forEach(t => t && gl.deleteTexture(t));
        }
        
        // Create ping-pong texture pair
        const textures = [
            createBufferTexture(width, height),
            createBufferTexture(width, height)
        ];
        
        channels.set(channelNumber, {
            textures,
            currentPing: 0,
            type: channelNumber === 0 ? 'main' : 'buffer',
            resolution: { width, height }
        });
        
        logger.keyed(`channel-${channelNumber}`, 'debug', 'Render', 'Channel', `Channel ${channelNumber} created (${width}×${height})`);
        return channelNumber;
    }
    
    /**
     * Create a float texture for buffer rendering with mipmap support
     * Uses texStorage2D to pre-allocate all mip levels
     */
    function createBufferTexture(width, height) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Use RGBA32F if available, otherwise RGBA16F
        const hasFloat = gl.getExtension('EXT_color_buffer_float');
        const internalFormat = hasFloat ? gl.RGBA32F : gl.RGBA16F;
        
        // Calculate mip levels for potential mipmap generation
        const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
        
        // Use texStorage2D to pre-allocate all mip levels (immutable storage)
        // This allows generateMipmap() to work efficiently
        gl.texStorage2D(gl.TEXTURE_2D, mipLevels, internalFormat, width, height);
        
        // Default filter/wrap (will be overridden by samplers when bound)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        return texture;
    }
    
    // Anisotropic extension (cached for sampler use)
    let anisoExt = null;
    let maxAnisotropy = 1;
    
    /**
     * Get or create a sampler with specific filter, wrap, and anisotropic settings
     * Samplers are cached by their settings key
     */
    function getOrCreateSampler(filter, wrap, anisotropic = false) {
        const key = `${filter}:${wrap}:${anisotropic ? 'aniso' : 'none'}`;
        if (samplerCache.has(key)) {
            return samplerCache.get(key);
        }
        
        const sampler = gl.createSampler();
        
        // Set filter mode
        let minFilter, magFilter;
        switch (filter) {
            case 'mipmap':
                minFilter = gl.LINEAR_MIPMAP_LINEAR;
                magFilter = gl.LINEAR;
                break;
            case 'nearest':
                minFilter = gl.NEAREST;
                magFilter = gl.NEAREST;
                break;
            case 'linear':
            default:
                minFilter = gl.LINEAR;
                magFilter = gl.LINEAR;
        }
        gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, magFilter);
        
        // Set wrap mode
        let wrapMode;
        switch (wrap) {
            case 'clamp':
                wrapMode = gl.CLAMP_TO_EDGE;
                break;
            case 'mirror':
                wrapMode = gl.MIRRORED_REPEAT;
                break;
            case 'repeat':
            default:
                wrapMode = gl.REPEAT;
        }
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrapMode);
        
        // Set anisotropic filtering on sampler (if extension available)
        if (!anisoExt) {
            anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
            if (anisoExt) {
                maxAnisotropy = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            }
        }
        if (anisoExt && anisotropic) {
            gl.samplerParameterf(sampler, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
        }
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrapMode);
        
        samplerCache.set(key, sampler);
        logger.debug('Render', 'Sampler', `Created sampler: ${key}`);
        return sampler;
    }
    
    /**
     * Get channel settings from the matrix for a specific receiver+source pair
     * Falls back to source defaults if useDefault is true
     * Anisotropic is always from the source (not per-receiver)
     */
    function getMatrixSettings(receiverId, sourceChannelNumber) {
        
        // Find the source ID from channel number
        let sourceId = null;
        for (const [passId, pass] of passes) {
            if (pass.channelNumber === sourceChannelNumber) {
                sourceId = passId;
                break;
            }
        }
        
        // Check for texture sources
        const channel = channels.get(sourceChannelNumber);
        if (channel?.type === 'texture' && channel.url) {
            // Find media element with this URL
            for (const media of (state.project?.media || [])) {
                if (media.channel === sourceChannelNumber) {
                    sourceId = media.id;
                    break;
                }
            }
        }
        
        // Get anisotropic from source (it's a source-level setting, not per-receiver)
        const anisotropic = channel?.options?.anisotropic || false;
        
        if (!sourceId) {
            return { filter: 'nearest', wrap: 'clamp', anisotropic };
        }
        
        // Get matrix settings
        const matrix = state.shader?.channelMatrix || {};
        const key = `${receiverId}:${sourceId}`;
        const settings = matrix[key];
        
        if (!settings || settings.useDefault !== false) {
            // Use source defaults
            if (channel?.type === 'texture' && channel.options) {
                return {
                    filter: channel.options.filter || 'mipmap',
                    wrap: channel.options.wrap || 'repeat',
                    anisotropic
                };
            }
            // Buffer defaults (buffers don't have anisotropic)
            return { filter: 'nearest', wrap: 'clamp', anisotropic: false };
        }
        
        return {
            filter: settings.filter || 'nearest',
            wrap: settings.wrap || 'clamp',
            anisotropic
        };
    }
    
    /**
     * Analyze which channels need mipmap generation based on matrix settings
     */
    function updateMipmapNeeded() {
        mipmapNeeded.clear();
        
        const matrix = state.shader?.channelMatrix || {};
        
        // Check all matrix entries for mipmap filter usage
        for (const [key, settings] of Object.entries(matrix)) {
            if (settings.useDefault === false && settings.filter === 'mipmap') {
                // Parse source from key "receiverId:sourceId"
                const [receiverId, sourceId] = key.split(':');
                
                // Find the channel number for this source (could be a buffer pass)
                let found = false;
                for (const [passId, pass] of passes) {
                    if (passId === sourceId) {
                        mipmapNeeded.add(pass.channelNumber);
                        found = true;
                        break;
                    }
                }
                
                // Also check texture/media channels
                if (!found) {
                    for (const [num, channel] of channels) {
                        if (channel.type === 'texture') {
                            for (const media of (state.project?.media || [])) {
                                if (media.id === sourceId && media.channel === num) {
                                    mipmapNeeded.add(num);
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                }
            }
        }
        
        // Also check texture defaults - if any texture has mipmap as default
        for (const [num, channel] of channels) {
            if (channel.type === 'texture' && channel.options?.filter === 'mipmap') {
                mipmapNeeded.add(num);
            }
        }
        
        if (mipmapNeeded.size > 0) {
            logger.debug('Render', 'Mipmap', `Channels needing mipmap gen: [${Array.from(mipmapNeeded).join(', ')}]`);
        }
    }
    
    /**
     * Get the current readable texture for a channel
     */
    function getChannelTexture(channelNumber) {
        const channel = channels.get(channelNumber);
        if (!channel?.textures) return null;
        return channel.textures[channel.currentPing];
    }
    
    /**
     * Ensure channel textures match canvas size
     */
    function resizeChannels(width, height) {
        for (const [num, channel] of channels) {
            if (channel.type === 'main' || channel.type === 'buffer') {
                if (channel.resolution.width !== width || channel.resolution.height !== height) {
                    createChannel(num, width, height);
                }
            }
        }
    }
    
    // ========================================================================
    // Shader Compilation
    // ========================================================================
    
    /**
     * Parse which iChannels a shader uses
     */
    function parseChannelUsage(code) {
        const used = new Set();
        const regex = /iChannel(\d+)/g;
        let match;
        while ((match = regex.exec(code)) !== null) {
            used.add(parseInt(match[1], 10));
        }
        return Array.from(used).sort((a, b) => a - b);
    }
    
    /**
     * Build channel uniform declarations
     */
    function buildChannelUniforms(requiredChannels) {
        return requiredChannels.map(n => `uniform sampler2D iChannel${n};`).join('\n');
    }
    
    /**
     * Compile a single pass
     */
    function compilePass(passId, userCode, channelNumber) {
        // Parse which channels this pass needs
        const requiredChannels = parseChannelUsage(userCode);
        
        // Build full fragment source
        const channelDecls = buildChannelUniforms(requiredChannels);
        const commonSection = commonCode ? `// === Common ===\n${commonCode}\n\n` : '';
        const fullFragment = FRAGMENT_PREFIX + channelDecls + '\n' + commonSection + userCode + FRAGMENT_SUFFIX;
        
        // Count injected lines for error adjustment
        const injectedLines = boilerplateLines + 
            (channelDecls ? channelDecls.split('\n').length : 0) +
            (commonCode ? commonCode.split('\n').length + 3 : 0);
        
        // Compile
        const { program, error } = createProgram(fullFragment);
        
        if (error) {
            const errors = parseErrors(error, injectedLines);
            return { success: false, errors, passId };
        }
        
        // Get uniform locations
        const uniforms = getUniformLocations(program);
        
        // Get channel uniform locations
        const channelUniforms = {};
        requiredChannels.forEach(n => {
            channelUniforms[n] = gl.getUniformLocation(program, `iChannel${n}`);
        });
        
        // Store pass data
        const passData = {
            program,
            uniforms,
            channelUniforms,
            channelNumber,
            requiredChannels
        };
        
        // Delete old program if exists
        const old = passes.get(passId);
        if (old?.program) {
            gl.deleteProgram(old.program);
        }
        
        passes.set(passId, passData);
        
        // Ensure channel exists for this pass
        if (!channels.has(channelNumber)) {
            createChannel(channelNumber, canvas.width || 800, canvas.height || 600);
        }
        
        logger.debug('Render', 'Compile', `Pass ${passId} (ch${channelNumber}) compiled, uses: ${requiredChannels.join(', ') || 'none'}`);
        
        return { success: true, passId };
    }
    
    /**
     * Create GL program from fragment source
     */
    function createProgram(fragmentSource) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VERTEX_SHADER);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(vs);
            gl.deleteShader(vs);
            return { program: null, error: `Vertex: ${error}` };
        }
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(fs);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return { program: null, error };
        }
        
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, 'position');
        gl.linkProgram(prog);
        
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(prog);
            gl.deleteProgram(prog);
            return { program: null, error: `Link: ${error}` };
        }
        
        return { program: prog, error: null };
    }
    
    /**
     * Get standard uniform locations
     */
    function getUniformLocations(program) {
        return {
            iResolution: gl.getUniformLocation(program, 'iResolution'),
            iTime: gl.getUniformLocation(program, 'iTime'),
            iTimeDelta: gl.getUniformLocation(program, 'iTimeDelta'),
            iFrame: gl.getUniformLocation(program, 'iFrame'),
            iMouse: gl.getUniformLocation(program, 'iMouse'),
            iDate: gl.getUniformLocation(program, 'iDate'),
            iSampleRate: gl.getUniformLocation(program, 'iSampleRate'),
            uGlassMode: gl.getUniformLocation(program, 'uGlassMode'),
            iTheme: gl.getUniformLocation(program, 'iTheme')
        };
    }
    
    /**
     * Parse GLSL errors and adjust line numbers
     */
    function parseErrors(errorLog, injectedLines = 0) {
        const errors = [];
        const regex = /(?:ERROR|error):\s*\d+:(\d+):\s*(.+)/g;
        let match;
        
        while ((match = regex.exec(errorLog)) !== null) {
            const rawLine = parseInt(match[1], 10);
            const adjusted = Math.max(1, rawLine - injectedLines);
            errors.push({ line: adjusted, message: match[2].trim() });
        }
        
        if (errors.length === 0 && errorLog.trim()) {
            errors.push({ line: 1, message: errorLog.trim() });
        }
        
        return errors;
    }
    
    // ========================================================================
    // Rendering
    // ========================================================================
    
    /**
     * Update pass execution order
     */
    function updatePassOrder() {
        // Buffers first (sorted by channel number), then main
        const buffers = [];
        let main = null;
        
        for (const [id, pass] of passes) {
            if (pass.channelNumber === 0) {
                main = id;
            } else {
                buffers.push({ id, channelNumber: pass.channelNumber });
            }
        }
        
        buffers.sort((a, b) => a.channelNumber - b.channelNumber);
        passOrder = buffers.map(b => b.id);
        if (main) passOrder.push(main);
        
        logger.debug('Render', 'Order', `Pass order: ${passOrder.join(' → ')}`);
    }
    
    /**
     * Render a single pass to its channel's texture
     */
    function renderPass(passId, time, deltaTime) {
        const pass = passes.get(passId);
        if (!pass) return;
        
        const channel = channels.get(pass.channelNumber);
        if (!channel) return;
        
        const { width, height } = channel.resolution;
        
        // Determine write target (opposite of read)
        const writeIndex = 1 - channel.currentPing;
        const writeTexture = channel.textures[writeIndex];
        
        // Bind framebuffer and attach write texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);
        gl.viewport(0, 0, width, height);
        
        // Use pass program
        gl.useProgram(pass.program);
        
        // Set standard uniforms
        const u = pass.uniforms;
        gl.uniform3f(u.iResolution, width, height, 1.0);
        gl.uniform1f(u.iTime, time);
        gl.uniform1f(u.iTimeDelta, deltaTime);
        gl.uniform1i(u.iFrame, frame);
        gl.uniform4f(u.iMouse, mouse.x, height - mouse.y,
            mouse.down ? mouse.clickX : 0, mouse.down ? height - mouse.clickY : 0);
        const date = new Date();
        gl.uniform4f(u.iDate, date.getFullYear(), date.getMonth(), date.getDate(),
            date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds());
        gl.uniform1f(u.iSampleRate, 44100);
        gl.uniform1f(u.uGlassMode, glassMode);
        gl.uniform1i(u.iTheme, currentThemeId);
        
        // Set custom uniforms
        applyCustomUniforms(pass.program);
        
        // Bind channel textures with per-receiver sampler settings
        const boundSamplerUnits = [];
        pass.requiredChannels.forEach((chNum, index) => {
            const loc = pass.channelUniforms[chNum];
            if (loc === null) return;
            
            gl.activeTexture(gl.TEXTURE0 + index);
            
            // Self-reference: use read texture of this channel
            if (chNum === pass.channelNumber) {
                gl.bindTexture(gl.TEXTURE_2D, channel.textures[channel.currentPing]);
            } else {
                // Reference to another channel
                const otherTex = getChannelTexture(chNum);
                if (otherTex) {
                    gl.bindTexture(gl.TEXTURE_2D, otherTex);
                }
            }
            
            // Get matrix settings for this receiver+source pair
            const matrixSettings = getMatrixSettings(passId, chNum);
            const sampler = getOrCreateSampler(matrixSettings.filter, matrixSettings.wrap, matrixSettings.anisotropic);
            gl.bindSampler(index, sampler);
            boundSamplerUnits.push(index);
            
            gl.uniform1i(loc, index);
        });
        
        // Draw
        gl.bindVertexArray(quadVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Unbind samplers (restore texture's own parameters)
        boundSamplerUnits.forEach(unit => gl.bindSampler(unit, null));
        
        // Swap ping-pong
        channel.currentPing = writeIndex;
        
        // Generate mipmaps if any receiver needs them for this channel
        if (mipmapNeeded.has(pass.channelNumber)) {
            gl.bindTexture(gl.TEXTURE_2D, channel.textures[channel.currentPing]);
            gl.generateMipmap(gl.TEXTURE_2D);
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    
    /**
     * Blit a channel's texture to canvas using passthrough shader
     */
    function blitToCanvas(channelNumber = 0) {
        if (!displayProgram) {
            logger.warn('Render', 'Blit', 'No display program');
            return;
        }
        
        const texture = getChannelTexture(channelNumber);
        if (!texture) {
            logger.warn('Render', 'Blit', `No texture for channel ${channelNumber}`);
            return;
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        gl.useProgram(displayProgram);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(displayUniforms.uTexture, 0);
        gl.uniform1f(displayUniforms.uGlassMode, glassMode);
        gl.uniform1i(displayUniforms.uLinearMode, linearColorspace ? 1 : 0);
        gl.uniform2f(displayUniforms.uCanvasResolution, canvas.width, canvas.height);
        
        gl.bindVertexArray(quadVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    /**
     * Apply custom uniforms to current program
     */
    function applyCustomUniforms(program) {
        for (const name in customUniforms) {
            const u = customUniforms[name];
            const loc = gl.getUniformLocation(program, name);
            if (!loc) continue;
            
            const v = u.value;
            switch (u.type) {
                case 'float': gl.uniform1f(loc, v); break;
                case 'int': gl.uniform1i(loc, v); break;
                case 'bool': gl.uniform1i(loc, v ? 1 : 0); break;
                case 'vec2': gl.uniform2f(loc, v[0], v[1]); break;
                case 'vec3': gl.uniform3f(loc, v[0], v[1], v[2]); break;
                case 'vec4': gl.uniform4f(loc, v[0], v[1], v[2], v[3]); break;
            }
        }
    }
    
    /**
     * Main render frame
     */
    function renderFrame() {
        if (!isPlaying) return;
        
        const now = performance.now();
        const deltaTime = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        const time = (now - startTime) / 1000;
        
        // FPS tracking (calculated once per second)
        fpsFrames++;
        if (now - fpsTime >= 1000) {
            fps = fpsFrames;
            fpsFrames = 0;
            fpsTime = now;
        }
        
        // Emit frame event every frame (for timeline/UI updates)
        events.emit(EVENTS.RENDER_FRAME, { fps, frame, time });
        
        // Render single frame (shared logic)
        renderSingleFrame(time, deltaTime);
        
        frame++;
        animationId = requestAnimationFrame(renderFrame);
    }
    
    /**
     * Update all video channel textures with current frame
     */
    function updateVideoTextures() {
        for (const [num, ch] of channels) {
            if (ch.type === 'video' && ch.video && ch.video.readyState >= ch.video.HAVE_CURRENT_DATA) {
                const texture = ch.textures[0];
                gl.bindTexture(gl.TEXTURE_2D, texture);
                if (ch.vflip) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                }
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ch.video);
                if (ch.vflip) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                }
            }
        }
    }
    
    /**
     * Update all audio channel textures with FFT data
     */
    function updateAudioTextures() {
        for (const [num, ch] of channels) {
            if (ch.type === 'audio' && ch.analyser) {
                const texture = ch.textures[0];
                const { width, height } = ch.modeConfig;
                const isChromagram = ch.mode.startsWith('chromagram');
                
                if (isChromagram) {
                    updateChromagramTexture(texture, ch.analyser, ch.previousFrame, ch.temporalAverage);
                } else {
                    updateStandardAudioTexture(texture, ch.analyser, width, height);
                }
            }
        }
    }
    
    /**
     * Update standard 2-row audio texture (row 0=frequency, row 1=waveform)
     */
    function updateStandardAudioTexture(texture, analyser, width, height) {
        if (height !== 2) return;
        
        const frequencyBinCount = analyser.frequencyBinCount;
        const fullFrequencyData = new Uint8Array(frequencyBinCount);
        const fullWaveformData = new Uint8Array(frequencyBinCount);
        
        analyser.getByteFrequencyData(fullFrequencyData);
        analyser.getByteTimeDomainData(fullWaveformData);
        
        // Truncate to texture width (Shadertoy style)
        const frequencyData = fullFrequencyData.slice(0, width);
        const waveformData = fullWaveformData.slice(0, width);
        
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Row 0: Frequency spectrum (FFT)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 1, gl.RED, gl.UNSIGNED_BYTE, frequencyData);
        
        // Row 1: Waveform (time domain)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 1, width, 1, gl.RED, gl.UNSIGNED_BYTE, waveformData);
        
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
    
    /**
     * Update 12x12 chromagram texture for musical note detection
     * Red=current energy, Green=delta (attack), Blue=temporal average
     */
    function updateChromagramTexture(texture, analyser, previousFrame, temporalAverage) {
        const frequencyBinCount = analyser.frequencyBinCount;
        const frequencyData = new Uint8Array(frequencyBinCount);
        analyser.getByteFrequencyData(frequencyData);
        
        const sampleRate = analyser.context.sampleRate;
        const binWidth = sampleRate / analyser.fftSize;
        const isHQMode = analyser.fftSize >= 16384;
        
        // 12x12 grid accumulator
        const grid = new Float32Array(144).fill(0);
        const counts = new Float32Array(144).fill(0);
        
        let totalEnergy = 0, totalBins = 0;
        const spreadRange = isHQMode ? 0.8 : 1.5;
        const spreadWidth = isHQMode ? 1 : 2;
        
        // Process FFT bins to musical notes
        for (let bin = 1; bin < frequencyBinCount; bin++) {
            const hz = bin * binWidth;
            const value = frequencyData[bin] / 255.0;
            if (value === 0 || hz < 10) continue;
            
            totalEnergy += value;
            totalBins++;
            
            const midiFloat = 69 + 12 * Math.log2(hz / 440);
            
            // Sub-bass (column 0)
            if (midiFloat < 23) {
                for (let row = 0; row < 12; row++) {
                    grid[row * 12] += value;
                    counts[row * 12] += 1;
                }
                continue;
            }
            
            // Ultrasonic (column 10 catch-all)
            if (midiFloat >= 132) {
                for (let row = 0; row < 12; row++) {
                    grid[row * 12 + 10] += value;
                    counts[row * 12 + 10] += 1;
                }
                continue;
            }
            
            // Spread energy to nearby notes
            const centerMidi = Math.round(midiFloat);
            for (let offset = -spreadWidth; offset <= spreadWidth; offset++) {
                const targetMidi = centerMidi + offset;
                const distance = Math.abs(midiFloat - targetMidi);
                if (distance > spreadRange) continue;
                
                const weight = Math.max(0, 1.0 - distance / spreadRange);
                const octave = Math.floor(targetMidi / 12) - 1;
                const semitone = targetMidi % 12;
                
                if (octave >= 1 && octave <= 10 && weight > 0.01) {
                    const col = octave;
                    const idx = semitone * 12 + col;
                    grid[idx] += value * weight;
                    counts[idx] += weight;
                }
            }
        }
        
        // Average accumulated values
        for (let i = 0; i < 144; i++) {
            if (counts[i] > 0) grid[i] /= counts[i];
        }
        
        // Column 11: overall energy
        const avgLevel = totalBins > 0 ? totalEnergy / totalBins : 0;
        for (let row = 0; row < 12; row++) {
            grid[row * 12 + 11] = avgLevel;
        }
        
        // Square for emphasis
        for (let i = 0; i < 144; i++) {
            grid[i] = grid[i] * grid[i];
        }
        
        // Calculate delta (green channel)
        const delta = new Float32Array(144);
        for (let i = 0; i < 144; i++) {
            if (previousFrame) {
                const change = grid[i] - previousFrame[i];
                delta[i] = change > 0 ? change * grid[i] * 50.0 : 0;
            }
        }
        if (previousFrame) previousFrame.set(grid);
        
        // Update temporal average (blue channel)
        const alpha = 0.2;
        if (temporalAverage) {
            for (let i = 0; i < 144; i++) {
                temporalAverage[i] = alpha * grid[i] + (1 - alpha) * temporalAverage[i];
            }
        }
        
        // Build RGB texture data
        const textureData = new Uint8Array(144 * 3);
        for (let i = 0; i < 144; i++) {
            textureData[i * 3] = Math.floor(Math.min(1.0, grid[i]) * 255);
            textureData[i * 3 + 1] = Math.floor(Math.min(1.0, delta[i]) * 255);
            const blueSquared = temporalAverage ? temporalAverage[i] * temporalAverage[i] : 0;
            textureData[i * 3 + 2] = Math.floor(Math.min(1.0, blueSquared) * 255);
        }
        
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 12, 12, gl.RGB, gl.UNSIGNED_BYTE, textureData);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
    
    /**
     * Update canvas CSS for pixelated vs smooth rendering
     */
    function updateCanvasRenderMode() {
        if (pixelScale > 1 && pixelated) {
            // Sharp, blocky pixels - use pixelated (Chrome/Safari) with crisp-edges fallback (Firefox)
            canvas.style.imageRendering = 'crisp-edges';
            // Override with pixelated if supported (more widely supported now)
            if (CSS.supports('image-rendering', 'pixelated')) {
                canvas.style.imageRendering = 'pixelated';
            }
        } else {
            // Smooth interpolation (browser default)
            canvas.style.imageRendering = 'auto';
        }
    }
    
    /**
     * Render a single frame (used by both render loop and on-demand requests)
     */
    function renderSingleFrame(time, deltaTime) {
        // Resize handling - apply pixel scale for resolution divider
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;
        const renderWidth = Math.floor(displayWidth / pixelScale);
        const renderHeight = Math.floor(displayHeight / pixelScale);
        
        if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
            canvas.width = renderWidth;
            canvas.height = renderHeight;
            resizeChannels(renderWidth, renderHeight);
        }
        
        // Update video textures with current frame
        updateVideoTextures();
        
        // Update audio textures with FFT data
        updateAudioTextures();
        
        // Render ALL passes to their textures (including main!)
        // This enables ch0 self-reference and buffers reading ch0
        for (const passId of passOrder) {
            renderPass(passId, time, deltaTime);
        }
        
        // Blit selected channel to canvas (default: ch0 = main)
        blitToCanvas(selectedDisplayChannel);
    }
    
    /**
     * Render a single frame when paused (for immediate visual feedback)
     * Called when state changes that need to be reflected visually
     */
    function renderFrameIfPaused() {
        if (isPlaying) return; // Already rendering
        
        // Calculate current paused time
        const now = performance.now();
        const time = pauseTime > 0 ? (pauseTime - startTime) / 1000 : 0;
        const deltaTime = 0; // No delta when paused
        
        renderSingleFrame(time, deltaTime);
        logger.debug('Render', 'Frame', 'Rendered single frame while paused');
    }
    
    // Listen for frame requests (render when paused)
    events.on(EVENTS.RENDER_FRAME_REQUESTED, () => {
        renderFrameIfPaused();
    });
    
    // Listen for channel matrix changes
    events.on(EVENTS.RENDER_CHANNEL_CHANGED, () => {
        updateMipmapNeeded();
        renderFrameIfPaused();
    });
    
    // ========================================================================
    // Public API
    // ========================================================================
    
    init();
    
    return {
        /**
         * Set common code (prepended to all passes)
         */
        setCommonCode(code) {
            commonCode = code || '';
            logger.debug('Render', 'Common', `Common code set (${commonCode.length} chars)`);
        },
        
        /**
         * Compile a pass
         * @param {string} passId - 'Image', 'BufferA', etc.
         * @param {string} code - User shader code
         * @param {number} channelNumber - Output channel (0 = main)
         */
        compilePass(passId, code, channelNumber = 0) {
            const result = compilePass(passId, code, channelNumber);
            if (result.success) {
                updatePassOrder();
                updateMipmapNeeded(); // Refresh which channels need mipmap generation
            }
            return result;
        },
        
        /**
         * Remove a pass
         */
        removePass(passId) {
            const pass = passes.get(passId);
            if (pass) {
                gl.deleteProgram(pass.program);
                passes.delete(passId);
                updatePassOrder();
                logger.debug('Render', 'Pass', `Removed pass: ${passId}`);
            }
        },
        
        /**
         * Compile and set shader code (legacy single-pass API)
         * For backwards compatibility with existing code
         */
        setShader(code) {
            customUniforms = {};
            const result = compilePass('Image', code, 0);
            if (result.success) {
                updatePassOrder();
                updateMipmapNeeded();
                events.emit(EVENTS.COMPILE_SUCCESS);
                // Render immediately to show new shader
                renderFrameIfPaused();
                return true;
            } else {
                // Log errors with line numbers
                const passErrors = result.errors || [];
                for (const err of passErrors) {
                    logger.error('Compiler', 'Image', `Line ${err.line}: ${err.message}`);
                }
                events.emit(EVENTS.COMPILE_ERROR, { 
                    tabId: 'Image',
                    message: 'Image compilation failed', 
                    errors: passErrors 
                });
                return false;
            }
        },
        
        /**
         * Compile all passes from a code map
         * @param {Object} codeMap - { Image: '...', BufferA: '...', Common: '...' }
         * @returns {Object} - { success, errors: [] }
         */
        compileAll(codeMap) {
            customUniforms = {};
            
            // Set common code first
            if (codeMap.Common) {
                this.setCommonCode(codeMap.Common);
            }
            
            const errors = [];
            
            // Track which passes we've compiled this round
            const compiledPassIds = new Set();
            
            // Compile passes based on state.project.code (which has actual channel assignments)
            for (const codeEl of state.project.code) {
                // Skip Common - it's just shared code, not a pass
                if (codeEl.type === 'common') continue;
                
                const passId = codeEl.id;
                const channelNumber = codeEl.channel ?? 0;
                
                if (codeMap[passId] && codeMap[passId].trim()) {
                    const result = compilePass(passId, codeMap[passId], channelNumber);
                    if (!result.success) {
                        errors.push({ passId, errors: result.errors });
                    }
                    compiledPassIds.add(passId);
                } else if (passes.has(passId)) {
                    // Remove pass if code is empty
                    this.removePass(passId);
                }
            }
            
            // Clean up any passes that no longer exist in project.code
            for (const passId of passes.keys()) {
                if (!compiledPassIds.has(passId)) {
                    this.removePass(passId);
                }
            }
            
            updatePassOrder();
            
            if (errors.length === 0) {
                logger.success('Render', 'Compile', `All passes compiled (${passes.size} total)`);
                events.emit(EVENTS.COMPILE_SUCCESS);
                // Render immediately to show new shader
                renderFrameIfPaused();
                return { success: true, errors: [] };
            } else {
                // Log each failed pass with its errors
                for (const failedPass of errors) {
                    const passErrors = failedPass.errors || [];
                    if (passErrors.length > 0) {
                        for (const err of passErrors) {
                            logger.error('Compiler', failedPass.passId, `Line ${err.line}: ${err.message}`);
                        }
                    } else {
                        logger.error('Compiler', failedPass.passId, 'Compilation failed (no details)');
                    }
                    
                    // Emit error event with tabId for Monaco markers
                    events.emit(EVENTS.COMPILE_ERROR, { 
                        tabId: failedPass.passId,
                        message: `${failedPass.passId} compilation failed`, 
                        errors: passErrors 
                    });
                }
                
                logger.error('Render', 'Compile', `${errors.length} pass(es) failed`);
                return { success: false, errors };
            }
        },
        
        /**
         * Get pass info
         */
        getPassInfo() {
            const info = [];
            for (const [id, pass] of passes) {
                info.push({
                    id,
                    channelNumber: pass.channelNumber,
                    requiredChannels: pass.requiredChannels
                });
            }
            return info;
        },
        
        /**
         * Get channel info
         */
        getChannelInfo() {
            const info = [];
            for (const [num, ch] of channels) {
                info.push({
                    number: num,
                    type: ch.type,
                    resolution: ch.resolution
                });
            }
            return info;
        },
        
        // Playback controls
        play() {
            if (isPlaying) return;
            isPlaying = true;
            if (pauseTime > 0) {
                startTime += performance.now() - pauseTime;
            } else {
                startTime = performance.now();
            }
            pauseTime = 0;
            lastFrameTime = performance.now();
            fpsTime = performance.now();
            animationId = requestAnimationFrame(renderFrame);
            
            // Play video channels
            for (const [num, ch] of channels) {
                if (ch.type === 'video' && ch.video && !ch.playing) {
                    ch.video.play().catch(e => logger.warn('Render', 'Video', `Play failed: ${e.message}`));
                    ch.playing = true;
                }
            }
            
            // Play audio channels
            if (audioContext?.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            for (const [num, ch] of channels) {
                if (ch.type === 'audio' && ch.audio && !ch.playing) {
                    ch.audio.play().catch(e => logger.warn('Render', 'Audio', `Play failed: ${e.message}`));
                    ch.playing = true;
                }
            }
            
            logger.debug('Render', 'Playback', 'Playing');
            events.emit(EVENTS.RENDER_START);
        },
        
        pause() {
            if (!isPlaying) return;
            isPlaying = false;
            pauseTime = performance.now();
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            
            // Pause video channels
            for (const [num, ch] of channels) {
                if (ch.type === 'video' && ch.video && ch.playing) {
                    ch.video.pause();
                    ch.playing = false;
                }
            }
            
            // Pause audio channels
            for (const [num, ch] of channels) {
                if (ch.type === 'audio' && ch.audio && ch.playing) {
                    ch.audio.pause();
                    ch.playing = false;
                }
            }
            
            logger.debug('Render', 'Playback', 'Paused');
            events.emit(EVENTS.RENDER_STOP);
        },
        
        restart() {
            frame = 0;
            startTime = performance.now();
            pauseTime = 0;
            // Clear all buffer textures and reset videos/audios
            for (const [, ch] of channels) {
                ch.currentPing = 0;
                // Reset video to start
                if (ch.type === 'video' && ch.video) {
                    ch.video.currentTime = 0;
                }
                // Reset audio to start
                if (ch.type === 'audio' && ch.audio) {
                    ch.audio.currentTime = 0;
                }
            }
            logger.debug('Render', 'Playback', 'Restarted');
        },
        
        /**
         * Seek to a specific time in seconds
         * Adjusts startTime so that elapsed time equals the target
         * @param {number} targetSeconds - Time to seek to
         */
        seek(targetSeconds) {
            targetSeconds = Math.max(0, targetSeconds);
            const targetMs = targetSeconds * 1000;
            
            if (isPlaying) {
                // Adjust startTime so (now - startTime) = targetMs
                startTime = performance.now() - targetMs;
            } else {
                // If paused, adjust both startTime and pauseTime
                pauseTime = performance.now();
                startTime = pauseTime - targetMs;
            }
            
            // Seek video channels to match shader time
            for (const [num, ch] of channels) {
                if (ch.type === 'video' && ch.video) {
                    const videoDuration = ch.video.duration || 1;
                    let videoTime = targetSeconds;
                    if (ch.loop && videoDuration > 0) {
                        videoTime = targetSeconds % videoDuration;
                    } else {
                        videoTime = Math.min(targetSeconds, videoDuration);
                    }
                    ch.video.currentTime = videoTime;
                    // Note: Video 'seeked' event will trigger re-render when frame is ready
                }
                // Seek audio channels to match shader time
                if (ch.type === 'audio' && ch.audio) {
                    const audioDuration = ch.audio.duration || 1;
                    let audioTime = targetSeconds;
                    if (ch.loop && audioDuration > 0) {
                        audioTime = targetSeconds % audioDuration;
                    } else {
                        audioTime = Math.min(targetSeconds, audioDuration);
                    }
                    ch.audio.currentTime = audioTime;
                }
            }
            
            // Render a single frame if paused (uses renderSingleFrame for proper video texture update)
            if (!isPlaying) {
                renderSingleFrame(targetSeconds, 0);
            }
            
            // Emit frame event to update UI
            const time = targetSeconds;
            events.emit(EVENTS.RENDER_FRAME, { fps, frame, time });
            
            logger.keyed('seek', 'debug', 'Render', 'Seek', `Seeked to ${targetSeconds.toFixed(2)}s`);
        },
        
        setMouse(x, y, down = false, click = false) {
            mouse.x = x;
            mouse.y = y;
            mouse.down = down;
            if (click) {
                mouse.clickX = x;
                mouse.clickY = y;
            }
        },
        
        setGlassMode(enabled) {
            glassMode = enabled ? 1.0 : 0.0;
            // Render a frame to show the change immediately
            renderFrameIfPaused();
        },
        
        /**
         * Set theme ID for iTheme uniform
         * @param {number} themeId - Theme ID (0=default, 1=designer, 2=architect, 3=coder, 4=hacker, 5=engineer)
         */
        setThemeId(themeId) {
            currentThemeId = themeId;
            // Render a frame to show the theme change immediately
            renderFrameIfPaused();
        },
        
        /**
         * Get current theme ID
         */
        getThemeId() {
            return currentThemeId;
        },
        
        /**
         * Set colorspace mode
         * @param {boolean} linear - true for linear (compute.toys), false for sRGB (Shadertoy)
         */
        setColorspace(linear) {
            linearColorspace = linear;
            logger.debug('Render', 'Colorspace', linear ? 'Linear (gamma corrected)' : 'sRGB');
            // Render a frame to show the change immediately
            renderFrameIfPaused();
        },
        
        /**
         * Get current colorspace mode
         */
        getColorspace() {
            return linearColorspace;
        },
        
        /**
         * Set audio volume (0.0 to 1.0)
         * @param {number} volume - Volume level (0 = muted, 1 = full)
         */
        setVolume(volume) {
            volume = Math.max(0, Math.min(1, volume));
            if (gainNode) {
                gainNode.gain.value = volume;
            }
            logger.keyed('volume', 'debug', 'Render', 'Volume', `Volume set to ${Math.round(volume * 100)}%`);
        },
        
        /**
         * Get current audio volume
         */
        getVolume() {
            return gainNode ? gainNode.gain.value : 1;
        },
        
        /**
         * Set pixel scale / resolution divider (1 = full, 2 = half, etc.)
         * Lower resolution = faster rendering for complex shaders
         * @param {number} scale - Scale factor (1, 2, 3, 4, 6, 8)
         */
        setPixelScale(scale) {
            scale = Math.max(1, Math.min(8, Math.floor(scale)));
            if (pixelScale !== scale) {
                pixelScale = scale;
                // Force resize on next frame
                canvas.width = 0;
                canvas.height = 0;
                // Update canvas rendering mode based on scale
                updateCanvasRenderMode();
                logger.keyed('pixelscale', 'debug', 'Render', 'Scale', `Pixel scale set to ${scale}x`);
                // Render a frame to show the change immediately
                renderFrameIfPaused();
            }
        },
        
        /**
         * Get current pixel scale
         */
        getPixelScale() {
            return pixelScale;
        },
        
        /**
         * Set pixelated mode (sharp pixels vs smooth interpolation)
         * @param {boolean} enabled - true for sharp pixels, false for smooth
         */
        setPixelated(enabled) {
            pixelated = enabled;
            updateCanvasRenderMode();
            logger.keyed('pixelmode', 'debug', 'Render', 'Mode', pixelated ? 'Sharp pixels' : 'Smooth interpolation');
        },
        
        /**
         * Get current pixelated mode
         */
        getPixelated() {
            return pixelated;
        },
        
        getState() {
            return {
                isPlaying,
                time: isPlaying ? (performance.now() - startTime) / 1000 : (pauseTime - startTime) / 1000,
                frame,
                fps,
                resolution: { width: canvas.width, height: canvas.height },
                pixelScale,
                pixelated,
                volume: gainNode ? gainNode.gain.value : 1,
                passCount: passes.size,
                channelCount: channels.size
            };
        },
        
        setUniform(name, value, type) {
            if (!type) {
                if (typeof value === 'boolean') type = 'bool';
                else if (typeof value === 'number') type = Number.isInteger(value) ? 'int' : 'float';
                else if (Array.isArray(value)) {
                    type = value.length === 2 ? 'vec2' : value.length === 3 ? 'vec3' : 'vec4';
                }
            }
            customUniforms[name] = { value, type };
        },
        
        getUniform(name) {
            return customUniforms[name]?.value;
        },
        
        clearCustomUniforms() {
            customUniforms = {};
        },
        
        /**
         * Set which channel to display in the preview
         * @param {number} channelNumber - Channel number (0 = main, 1 = BufferA, etc.)
         */
        setDisplayChannel(channelNumber) {
            if (channels.has(channelNumber)) {
                selectedDisplayChannel = channelNumber;
                logger.debug('Render', 'Channel', `Display channel set to ${channelNumber}`);
                events.emit(EVENTS.RENDER_CHANNEL_CHANGED, { channel: channelNumber });
                // If paused, re-render to show the new channel
                if (!isPlaying) {
                    blitToCanvas(selectedDisplayChannel);
                }
            } else {
                logger.warn('Render', 'Channel', `Channel ${channelNumber} not found, staying on ${selectedDisplayChannel}`);
            }
        },
        
        /**
         * Get the currently displayed channel number
         */
        getDisplayChannel() {
            return selectedDisplayChannel;
        },
        
        /**
         * Get list of available display channels
         * @returns {Array<{number: number, label: string, type: string}>}
         */
        getAvailableDisplayChannels() {
            const available = [];
            for (const [num, ch] of channels) {
                // Try to find the element's label from state.project (single source of truth)
                let displayLabel = null;
                
                // Check code elements (Main, Buffers)
                const codeEl = state.project?.code?.find(c => c.channel === num);
                if (codeEl) {
                    displayLabel = `${num} (${codeEl.label})`;
                }
                
                // Check media elements (Textures, Audio, Video)
                if (!displayLabel) {
                    const mediaEl = state.project?.media?.find(m => m.channel === num);
                    if (mediaEl) {
                        displayLabel = `${num} (${mediaEl.label})`;
                    }
                }
                
                // Check input elements (Keyboard, Webcam, Mic)
                if (!displayLabel) {
                    const inputEl = state.project?.inputs?.find(i => i.channel === num);
                    if (inputEl) {
                        displayLabel = `${num} (${inputEl.label})`;
                    }
                }
                
                // Fallback: use channel type
                if (!displayLabel) {
                    displayLabel = `${num} (Ch ${num})`;
                }
                
                available.push({
                    number: num,
                    label: displayLabel,
                    type: ch.type || 'buffer'
                });
            }
            return available.sort((a, b) => a.number - b.number);
        },
        
        /**
         * Request a single frame render (useful when paused)
         * For external code that needs to trigger a visual update
         */
        requestFrame() {
            renderFrameIfPaused();
        },
        
        /**
         * Load an image as a texture and assign it to a channel
         * @param {number} channelNumber - Channel number (e.g., 5 for iChannel5)
         * @param {string} url - Image URL to load
         * @param {Object} options - Texture options {filter, wrap, vflip, anisotropic}
         * @returns {Promise<boolean>} Success
         */
        async loadTexture(channelNumber, url, options = {}) {
            try {
                const { 
                    filter = 'linear', 
                    wrap = 'repeat',
                    vflip = true,  // Default true for Shadertoy compatibility
                    anisotropic = false 
                } = options;
                
                // Load image
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
                    img.src = url;
                });
                
                // Create texture
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                
                // V-flip handling (Shadertoy default: images are Y-down, GLSL is Y-up)
                if (vflip) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                }
                
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                
                // Reset flip setting
                if (vflip) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                }
                
                // Always generate mipmaps for textures - they're needed if ANY matrix cell
                // uses mipmap filtering, and the cost is one-time at load (unlike buffers)
                gl.generateMipmap(gl.TEXTURE_2D);
                
                // Set default filtering (will be overridden by samplers when matrix is used)
                if (filter === 'nearest') {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                } else if (filter === 'mipmap') {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                } else {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                }
                
                // Set wrapping
                let wrapMode;
                switch (wrap) {
                    case 'clamp': wrapMode = gl.CLAMP_TO_EDGE; break;
                    case 'mirror': wrapMode = gl.MIRRORED_REPEAT; break;
                    default: wrapMode = gl.REPEAT;
                }
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
                
                // Anisotropic filtering
                const anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
                if (anisoExt) {
                    if (anisotropic) {
                        const maxAniso = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
                        gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
                    } else {
                        gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, 1.0);
                    }
                }
                
                // Delete old channel textures if they exist
                const existing = channels.get(channelNumber);
                if (existing?.textures) {
                    existing.textures.forEach(t => t && gl.deleteTexture(t));
                }
                
                // Store as a texture channel (not a buffer - no ping-pong needed)
                channels.set(channelNumber, {
                    textures: [texture, texture], // Same texture for both (no ping-pong)
                    currentPing: 0,
                    type: 'texture',
                    resolution: { width: img.width, height: img.height },
                    url, // Store URL for reference
                    options: { filter, wrap, vflip, anisotropic } // Store options for UI
                });
                
                logger.success('Render', 'Texture', `Loaded texture to iChannel${channelNumber}: ${img.width}×${img.height}`);
                
                // Emit channel changed event so UI (dropdown) can update
                events.emit(EVENTS.RENDER_CHANNEL_CHANGED, { channel: channelNumber, type: 'texture' });
                
                // Render a frame to show the new texture
                renderFrameIfPaused();
                
                return true;
            } catch (err) {
                logger.error('Render', 'Texture', `Failed to load texture: ${err.message}`);
                return false;
            }
        },
        
        /**
         * Update texture options for an existing channel (requires reload)
         * @param {number} channelNumber - Channel number
         * @param {Object} options - New options {filter, wrap, vflip, anisotropic}
         * @returns {Promise<boolean>} Success
         */
        async updateTextureOptions(channelNumber, options) {
            const ch = channels.get(channelNumber);
            if (!ch || ch.type !== 'texture' || !ch.url) {
                logger.warn('Render', 'Texture', `Channel ${channelNumber} is not a reloadable texture`);
                return false;
            }
            
            // Merge with existing options
            const newOptions = { ...ch.options, ...options };
            
            // Reload texture with new options
            return this.loadTexture(channelNumber, ch.url, newOptions);
        },
        
        /**
         * Set a texture channel from an existing WebGL texture
         * @param {number} channelNumber - Channel number
         * @param {WebGLTexture} texture - WebGL texture
         * @param {number} width - Texture width
         * @param {number} height - Texture height
         */
        setChannelTexture(channelNumber, texture, width, height) {
            const existing = channels.get(channelNumber);
            if (existing?.textures) {
                existing.textures.forEach(t => t && gl.deleteTexture(t));
            }
            
            channels.set(channelNumber, {
                textures: [texture, texture],
                currentPing: 0,
                type: 'texture',
                resolution: { width, height }
            });
            
            logger.debug('Render', 'Texture', `Set texture on iChannel${channelNumber}`);
            renderFrameIfPaused();
        },
        
        /**
         * Clear a texture channel (remove texture, free memory)
         * @param {number} channelNumber - Channel number
         */
        clearChannel(channelNumber) {
            const existing = channels.get(channelNumber);
            if (existing) {
                if (existing.textures) {
                    existing.textures.forEach(t => t && gl.deleteTexture(t));
                }
                // Clean up video element if present
                if (existing.video) {
                    existing.video.pause();
                    existing.video.src = '';
                    existing.video.load();
                }
                // Clean up audio element and Web Audio nodes if present
                if (existing.audio) {
                    existing.audio.pause();
                    existing.audio.src = '';
                }
                if (existing.source) {
                    try { existing.source.disconnect(); } catch (e) {}
                }
                if (existing.analyser) {
                    try { existing.analyser.disconnect(); } catch (e) {}
                }
                channels.delete(channelNumber);
                logger.debug('Render', 'Channel', `Cleared iChannel${channelNumber}`);
            }
        },
        
        /**
         * Load a video and assign it to a channel
         * @param {number} channelNumber - Channel number
         * @param {string} url - Video URL
         * @param {Object} options - Video options {loop, vflip}
         * @returns {Promise<boolean>} Success
         */
        async loadVideo(channelNumber, url, options = {}) {
            try {
                const { loop = true, vflip = true } = options;
                
                // Create video element
                const video = document.createElement('video');
                video.crossOrigin = 'anonymous';
                video.loop = loop;
                video.muted = true; // Always muted
                video.preload = 'auto';
                video.playsInline = true;
                
                // Wait for video to load
                await new Promise((resolve, reject) => {
                    video.addEventListener('loadeddata', resolve, { once: true });
                    video.addEventListener('error', () => reject(new Error(`Failed to load: ${url}`)), { once: true });
                    video.src = url;
                });
                
                const width = video.videoWidth;
                const height = video.videoHeight;
                
                // Create texture
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                
                // Upload first frame with vflip
                if (vflip) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                }
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                if (vflip) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                }
                
                // Video uses nearest filtering by default (like buffers)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                
                // Delete old channel if exists
                const existing = channels.get(channelNumber);
                if (existing) {
                    if (existing.textures) {
                        existing.textures.forEach(t => t && gl.deleteTexture(t));
                    }
                    if (existing.video) {
                        existing.video.pause();
                        existing.video.src = '';
                    }
                }
                
                // Add seeked event listener to re-render when video seek completes while paused
                video.addEventListener('seeked', () => {
                    if (!isPlaying) {
                        // Video frame is now available at new position, re-render
                        renderFrameIfPaused();
                    }
                });
                
                // Store video channel
                channels.set(channelNumber, {
                    textures: [texture, texture], // Same texture (no ping-pong)
                    currentPing: 0,
                    type: 'video',
                    resolution: { width, height },
                    url,
                    video,
                    vflip,
                    loop,
                    playing: false
                });
                
                logger.success('Render', 'Video', `Loaded video to iChannel${channelNumber}: ${width}×${height}`);
                
                // Emit channel changed event so UI (dropdown) can update
                events.emit(EVENTS.RENDER_CHANNEL_CHANGED, { channel: channelNumber, type: 'video' });
                
                // Auto-play if shader is playing
                if (isPlaying) {
                    video.play().catch(e => logger.warn('Render', 'Video', `Autoplay blocked: ${e.message}`));
                    channels.get(channelNumber).playing = true;
                }
                
                renderFrameIfPaused();
                return true;
            } catch (err) {
                logger.error('Render', 'Video', `Failed to load video: ${err.message}`);
                return false;
            }
        },
        
        /**
         * Set video loop option
         */
        setVideoLoop(channelNumber, loop) {
            const ch = channels.get(channelNumber);
            if (ch?.type === 'video' && ch.video) {
                ch.video.loop = loop;
                ch.loop = loop;
                logger.debug('Render', 'Video', `iChannel${channelNumber} loop: ${loop}`);
            }
        },
        
        /**
         * Play all video channels
         */
        playVideos() {
            for (const [num, ch] of channels) {
                if (ch.type === 'video' && ch.video && !ch.playing) {
                    ch.video.play().catch(e => logger.warn('Render', 'Video', `Play failed: ${e.message}`));
                    ch.playing = true;
                }
            }
        },
        
        /**
         * Pause all video channels
         */
        pauseVideos() {
            for (const [num, ch] of channels) {
                if (ch.type === 'video' && ch.video && ch.playing) {
                    ch.video.pause();
                    ch.playing = false;
                }
            }
        },
        
        // ================================================================
        // AUDIO CHANNEL SUPPORT
        // ================================================================
        
        /**
         * Audio texture modes (from legacy audio-input.js)
         */
        AUDIO_MODES: {
            shadertoy: { name: 'Shadertoy (512)', fftSize: 2048, width: 512, height: 2, desc: 'Standard Shadertoy compatibility' },
            standard: { name: 'Standard (1024)', fftSize: 2048, width: 1024, height: 2, desc: 'Full FFT resolution' },
            high: { name: 'High Quality (2048)', fftSize: 4096, width: 2048, height: 2, desc: 'Higher frequency resolution' },
            ultra: { name: 'Ultra (4096)', fftSize: 8192, width: 4096, height: 2, desc: 'Maximum detail' },
            chromagram: { name: 'Chromagram (12×12)', fftSize: 8192, width: 12, height: 12, desc: 'Musical note detection' },
            chromagram_hq: { name: 'Chromagram HQ (12×12)', fftSize: 16384, width: 12, height: 12, desc: 'High-res note detection' }
        },
        
        /**
         * Load audio and create audio channel with FFT analyser
         * @param {number} channelNumber - Channel number
         * @param {string} url - Audio file URL
         * @param {Object} options - {mode, loop}
         * @returns {Promise<boolean>} Success
         */
        async loadAudio(channelNumber, url, options = {}) {
            const { mode = 'shadertoy', loop = true } = options;
            const modeConfig = this.AUDIO_MODES[mode] || this.AUDIO_MODES.shadertoy;
            
            try {
                // Create or get AudioContext and global gain node
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    gainNode = audioContext.createGain();
                    gainNode.connect(audioContext.destination);
                }
                
                // Create audio element
                const audio = document.createElement('audio');
                audio.crossOrigin = 'anonymous';
                audio.loop = loop;
                audio.preload = 'auto';
                
                // Wait for audio to load
                await new Promise((resolve, reject) => {
                    audio.addEventListener('canplaythrough', resolve, { once: true });
                    audio.addEventListener('error', () => reject(new Error(`Failed to load: ${url}`)), { once: true });
                    audio.src = url;
                });
                
                // Create analyser
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = modeConfig.fftSize;
                
                // Connect: audio -> analyser -> gainNode -> destination
                const source = audioContext.createMediaElementSource(audio);
                source.connect(analyser);
                analyser.connect(gainNode);
                
                // Create texture
                const isChromagram = mode.startsWith('chromagram');
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                
                const format = isChromagram ? gl.RGB : gl.RED;
                const internalFormat = isChromagram ? gl.RGB8 : gl.R8;
                
                gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, modeConfig.width, modeConfig.height, 0, format, gl.UNSIGNED_BYTE, null);
                
                // Audio textures use nearest filtering (data-only)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                
                // Clean up old channel
                const existing = channels.get(channelNumber);
                if (existing) {
                    if (existing.audio) {
                        existing.audio.pause();
                        existing.audio.src = '';
                    }
                    if (existing.source) existing.source.disconnect();
                    if (existing.analyser) existing.analyser.disconnect();
                    if (existing.textures) existing.textures.forEach(t => t && gl.deleteTexture(t));
                }
                
                // Store audio channel
                channels.set(channelNumber, {
                    textures: [texture, texture],
                    currentPing: 0,
                    type: 'audio',
                    resolution: { width: modeConfig.width, height: modeConfig.height },
                    url,
                    audio,
                    analyser,
                    source,
                    mode,
                    modeConfig,
                    loop,
                    playing: false,
                    // Chromagram-specific buffers
                    previousFrame: isChromagram ? new Float32Array(144) : null,
                    temporalAverage: isChromagram ? new Float32Array(144) : null
                });
                
                logger.success('Render', 'Audio', `Loaded audio to iChannel${channelNumber}: ${modeConfig.width}×${modeConfig.height} (${mode})`);
                
                // Emit channel changed event
                events.emit(EVENTS.RENDER_CHANNEL_CHANGED, { channel: channelNumber, type: 'audio' });
                
                // Auto-play if shader is playing
                if (isPlaying) {
                    if (audioContext.state === 'suspended') await audioContext.resume();
                    audio.play().catch(e => logger.warn('Render', 'Audio', `Autoplay blocked: ${e.message}`));
                    channels.get(channelNumber).playing = true;
                }
                
                renderFrameIfPaused();
                return true;
            } catch (err) {
                logger.error('Render', 'Audio', `Failed to load audio: ${err.message}`);
                return false;
            }
        },
        
        /**
         * Set audio loop option
         */
        setAudioLoop(channelNumber, loop) {
            const ch = channels.get(channelNumber);
            if (ch?.type === 'audio' && ch.audio) {
                ch.audio.loop = loop;
                ch.loop = loop;
            }
        },
        
        /**
         * Change audio mode (requires reload)
         */
        async setAudioMode(channelNumber, mode) {
            const ch = channels.get(channelNumber);
            if (!ch || ch.type !== 'audio' || !ch.url) return false;
            
            return this.loadAudio(channelNumber, ch.url, { mode, loop: ch.loop });
        },
        
        /**
         * Play all audio channels
         */
        async playAudios() {
            if (audioContext?.state === 'suspended') {
                await audioContext.resume();
            }
            for (const [num, ch] of channels) {
                if (ch.type === 'audio' && ch.audio && !ch.playing) {
                    ch.audio.play().catch(e => logger.warn('Render', 'Audio', `Play failed: ${e.message}`));
                    ch.playing = true;
                }
            }
        },
        
        /**
         * Pause all audio channels
         */
        pauseAudios() {
            for (const [num, ch] of channels) {
                if (ch.type === 'audio' && ch.audio && ch.playing) {
                    ch.audio.pause();
                    ch.playing = false;
                }
            }
        },
        
        /**
         * Get channel info (for UI display)
         */
        getChannelInfo(channelNumber) {
            const ch = channels.get(channelNumber);
            if (!ch) return null;
            return {
                type: ch.type,
                resolution: ch.resolution,
                url: ch.url
            };
        },
        
        /**
         * Refresh mipmap needs based on current channel matrix settings
         * Call this when matrix settings change
         */
        refreshMatrixSettings() {
            updateMipmapNeeded();
            // Re-render to apply new sampler settings
            renderFrameIfPaused();
        },
        
        destroy() {
            if (animationId) cancelAnimationFrame(animationId);
            for (const [, pass] of passes) {
                gl.deleteProgram(pass.program);
            }
            for (const [, ch] of channels) {
                ch.textures.forEach(t => t && gl.deleteTexture(t));
            }
            if (framebuffer) gl.deleteFramebuffer(framebuffer);
            if (quadVAO) gl.deleteVertexArray(quadVAO);
            logger.debug('Render', 'Cleanup', 'Renderer destroyed');
        }
    };
}

export default { createRenderer };
