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

// Glass mode control
uniform float uGlassMode;

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
    let glassMode = 0.0;
    
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
        const displayFS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uGlassMode;
uniform int uLinearMode; // 0 = sRGB (default), 1 = linear (apply gamma)
out vec4 fragColor;

// Gamma correction for linear colorspace mode
vec3 applyGamma(vec3 c) {
    return pow(c, vec3(1.0 / 2.2));
}

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTexture, 0));
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
            uLinearMode: gl.getUniformLocation(displayProgram, 'uLinearMode')
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
        
        logger.debug('Render', 'Channel', `Channel ${channelNumber} created (${width}×${height})`);
        return channelNumber;
    }
    
    /**
     * Create a float texture for buffer rendering
     */
    function createBufferTexture(width, height) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Use RGBA32F if available, otherwise RGBA16F
        const hasFloat = gl.getExtension('EXT_color_buffer_float');
        const internalFormat = hasFloat ? gl.RGBA32F : gl.RGBA16F;
        
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        return texture;
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
            uGlassMode: gl.getUniformLocation(program, 'uGlassMode')
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
        
        // Set custom uniforms
        applyCustomUniforms(pass.program);
        
        // Bind channel textures
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
            
            gl.uniform1i(loc, index);
        });
        
        // Draw
        gl.bindVertexArray(quadVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Swap ping-pong
        channel.currentPing = writeIndex;
        
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
        
        // FPS tracking
        fpsFrames++;
        if (now - fpsTime >= 1000) {
            fps = fpsFrames;
            fpsFrames = 0;
            fpsTime = now;
            events.emit(EVENTS.RENDER_FRAME, { fps, frame, time });
        }
        
        // Resize handling
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            resizeChannels(width, height);
        }
        
        // Render ALL passes to their textures (including main!)
        // This enables ch0 self-reference and buffers reading ch0
        for (const passId of passOrder) {
            renderPass(passId, time, deltaTime);
        }
        
        // Blit selected channel to canvas (default: ch0 = main)
        blitToCanvas(selectedDisplayChannel);
        
        frame++;
        animationId = requestAnimationFrame(renderFrame);
    }
    
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
                events.emit(EVENTS.COMPILE_SUCCESS);
                return true;
            } else {
                events.emit(EVENTS.COMPILE_ERROR, { message: 'Compilation failed', errors: result.errors });
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
            let channelNumber = 0; // Main = 0
            
            // Compile Image (main) first
            if (codeMap.Image) {
                const result = compilePass('Image', codeMap.Image, 0);
                if (!result.success) {
                    errors.push({ passId: 'Image', errors: result.errors });
                }
            }
            
            // Compile buffers (A=1, B=2, etc.)
            const bufferOrder = ['BufferA', 'BufferB', 'BufferC', 'BufferD', 'BufferE', 'BufferF'];
            let bufferChannel = 1;
            
            for (const bufferId of bufferOrder) {
                if (codeMap[bufferId] && codeMap[bufferId].trim()) {
                    const result = compilePass(bufferId, codeMap[bufferId], bufferChannel);
                    if (!result.success) {
                        errors.push({ passId: bufferId, errors: result.errors });
                    }
                    bufferChannel++;
                } else {
                    // Remove pass if code is empty
                    if (passes.has(bufferId)) {
                        this.removePass(bufferId);
                    }
                }
            }
            
            updatePassOrder();
            
            if (errors.length === 0) {
                logger.success('Render', 'Compile', `All passes compiled (${passes.size} total)`);
                events.emit(EVENTS.COMPILE_SUCCESS);
                return { success: true, errors: [] };
            } else {
                logger.error('Render', 'Compile', `${errors.length} pass(es) failed`);
                events.emit(EVENTS.COMPILE_ERROR, { message: 'Compilation failed', errors: errors[0]?.errors || [] });
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
            logger.debug('Render', 'Playback', 'Paused');
            events.emit(EVENTS.RENDER_STOP);
        },
        
        restart() {
            frame = 0;
            startTime = performance.now();
            pauseTime = 0;
            // Clear all buffer textures
            for (const [, ch] of channels) {
                ch.currentPing = 0;
            }
            logger.debug('Render', 'Playback', 'Restarted');
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
        },
        
        /**
         * Set colorspace mode
         * @param {boolean} linear - true for linear (compute.toys), false for sRGB (Shadertoy)
         */
        setColorspace(linear) {
            linearColorspace = linear;
            logger.debug('Render', 'Colorspace', linear ? 'Linear (gamma corrected)' : 'sRGB');
            // If paused, re-render to show the change
            if (!isPlaying) {
                blitToCanvas(selectedDisplayChannel);
            }
        },
        
        /**
         * Get current colorspace mode
         */
        getColorspace() {
            return linearColorspace;
        },
        
        getState() {
            return {
                isPlaying,
                time: isPlaying ? (performance.now() - startTime) / 1000 : (pauseTime - startTime) / 1000,
                frame,
                fps,
                resolution: { width: canvas.width, height: canvas.height },
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
                // Find the pass that writes to this channel
                let label = num === 0 ? 'Main' : `ch${num}`;
                for (const [passId, pass] of passes) {
                    if (pass.channelNumber === num) {
                        label = passId === 'Image' ? 'Main' : passId;
                        break;
                    }
                }
                available.push({
                    number: num,
                    label,
                    type: ch.type || 'buffer'
                });
            }
            return available.sort((a, b) => a.number - b.number);
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
