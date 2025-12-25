// ============================================================================
// WebGL Backend - GLSL Graphics
// ============================================================================

import { state, CONFIG, DERIVED } from '../core.js';
import * as channels from '../channels.js';

// ============================================================================
// Initialization
// ============================================================================

export async function init(canvas) {
    try {
        // Try WebGL2
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });

        if (!gl) {
            return { success: false, error: 'WebGL2 not available in this browser' };
        }

        // Create fullscreen quad
        createFullscreenQuad(gl);
        
        // Setup GL state
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        
        // Enable float texture rendering extension (required for RGBA32F framebuffers)
        const floatExt = gl.getExtension('EXT_color_buffer_float');
        if (floatExt) {
            console.log('✓ EXT_color_buffer_float enabled - using RGBA32F');
        } else {
            console.log('⚠ EXT_color_buffer_float not available - will use RGBA16F');
        }
        
        // Store in state
        state.glContext = gl;
        state.hasWebGL = true;
        
        console.log('✓ WebGL2 initialized successfully');
        return { success: true, gl };
    } catch (err) {
        console.warn('WebGL2 initialization failed:', err.message);
        return { success: false, error: err.message };
    }
}

function createFullscreenQuad(gl) {
    // Create vertex buffer for fullscreen quad
    const positions = new Float32Array([
        -1, -1,  // Bottom left
         1, -1,  // Bottom right
        -1,  1,  // Top left
         1,  1,  // Top right
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    state.glQuadBuffer = buffer;
}

/**
 * Initialize buffer resources (framebuffer for offscreen rendering)
 * Must be called AFTER init() and after channels.initMainBufferTextures()
 */
export function initBufferResources() {
    const gl = state.glContext;
    if (!gl) {
        console.warn('Cannot init buffer resources - WebGL not ready');
        return false;
    }
    
    if (state.glFramebuffer) {
        return true;
    }
    
    // Create framebuffer for offscreen rendering
    state.glFramebuffer = gl.createFramebuffer();
    
    // Create passthrough shader for displaying textures
    createDisplayProgram(gl);
    
    console.log('✓ WebGL framebuffer initialized');
    return true;
}

// Simple passthrough shader for displaying channel textures
// Supports linear colorspace mode (gamma correction) for compute.toys compatibility
let displayProgram = null;
let displayProgramLocs = null;

function createDisplayProgram(gl) {
    const vsSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;
    
    // Fragment shader with optional gamma correction for linear colorspace mode
    const fsSource = `#version 300 es
        precision highp float;
        in vec2 v_uv;
        out vec4 fragColor;
        uniform sampler2D u_texture;
        uniform int u_linearMode;  // 0 = sRGB (default), 1 = linear (apply gamma)
        
        // sRGB to linear conversion (what compute.toys expects as input)
        vec3 applyGamma(vec3 c) {
            return pow(c, vec3(1.0 / 2.2));
        }
        
        void main() {
            vec4 col = texture(u_texture, v_uv);
            vec3 rgb = col.rgb;
            
            // In linear mode, apply gamma correction to simulate compute.toys behavior
            if (u_linearMode == 1) {
                rgb = applyGamma(rgb);
            }
            
            fragColor = vec4(rgb, 1.0);
        }
    `;
    
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    
    displayProgram = gl.createProgram();
    gl.attachShader(displayProgram, vs);
    gl.attachShader(displayProgram, fs);
    gl.linkProgram(displayProgram);
    
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    
    displayProgramLocs = {
        a_position: gl.getAttribLocation(displayProgram, 'a_position'),
        u_texture: gl.getUniformLocation(displayProgram, 'u_texture'),
        u_linearMode: gl.getUniformLocation(displayProgram, 'u_linearMode')
    };
}

// ============================================================================
// Shader Compilation
// ============================================================================

export async function compileProgram(fragmentSource) {
    const gl = state.glContext;
    if (!gl) {
        return {
            success: false,
            errors: [{ lineNum: 1, message: 'WebGL not initialized' }]
        };
    }

    try {
        // Default vertex shader (fullscreen quad)
        const vertexSource = `#version 300 es
        in vec2 a_position;
        
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }`;

        // Compile vertex shader
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        if (!vertexShader) {
            return {
                success: false,
                errors: [{ lineNum: 1, message: 'Vertex shader compilation failed' }]
            };
        }

        // Compile fragment shader with error handling
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(fragmentShader);
            const errors = parseGLSLErrors(error, fragmentSource);
            gl.deleteShader(fragmentShader);
            gl.deleteShader(vertexShader);
            return { success: false, errors };
        }

        // Link program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        // Clean up shaders (program retains them)
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            return {
                success: false,
                errors: [{ lineNum: 1, message: 'Program link error: ' + error }]
            };
        }

        // Get uniform locations for built-in uniforms
        const uniforms = {
            u_time: gl.getUniformLocation(program, 'u_time'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution'),
            u_mouse: gl.getUniformLocation(program, 'u_mouse'),
            u_click: gl.getUniformLocation(program, 'u_click'),
            u_hover: gl.getUniformLocation(program, 'u_hover'),
            u_frame: gl.getUniformLocation(program, 'u_frame'),
            u_pixel: gl.getUniformLocation(program, 'u_pixel'),
            u_date: gl.getUniformLocation(program, 'u_date'),
        };

        // Get custom uniform locations (u_custom0 through u_custom84)
        for (let i = 0; i < 85; i++) {
            uniforms[`u_custom${i}`] = gl.getUniformLocation(program, `u_custom${i}`);
        }
        
        // Get custom int uniform locations (u_customInt0 through u_customInt9)
        for (let i = 0; i < 10; i++) {
            uniforms[`u_customInt${i}`] = gl.getUniformLocation(program, `u_customInt${i}`);
        }
        
        // Get custom bool uniform locations (u_customBool0 through u_customBool4)
        for (let i = 0; i < 5; i++) {
            uniforms[`u_customBool${i}`] = gl.getUniformLocation(program, `u_customBool${i}`);
        }

        return { success: true, program, uniforms };
    } catch (err) {
        return {
            success: false,
            errors: [{ lineNum: 1, message: err.message }]
        };
    }
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        console.error('Shader compilation error:', error);
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function parseGLSLErrors(infoLog, source) {
    const errors = [];
    const lines = infoLog.split('\n');

    for (const line of lines) {
        // WebGL error format: "ERROR: 0:23: 'col' : undeclared identifier"
        const match = line.match(/ERROR:\s*\d+:(\d+):\s*(.+)/);
        if (match) {
            errors.push({
                lineNum: parseInt(match[1]),
                linePos: 1,
                message: match[2].trim()
            });
        }
    }

    // If no specific errors parsed, return generic error
    if (errors.length === 0 && infoLog.trim()) {
        errors.push({
            lineNum: 1,
            linePos: 1,
            message: infoLog
        });
    }

    return errors;
}

// ============================================================================
// Rendering
// ============================================================================

export function renderFrame(uniformBuilder) {
    const gl = state.glContext;
    if (!gl || !state.glFramebuffer || !state.webglPasses?.length) {
        return;
    }
    
    try {
        channels.ensureBufferTextures(0);
        for (const pass of state.webglPasses) {
            if (pass.type === 'buffer') {
                renderBufferPass(gl, uniformBuilder, pass);
            } else if (pass.type === 'main') {
                renderBufferPass(gl, uniformBuilder, pass);
            }
        }
        displaySelectedChannel(gl);
    } catch (err) {
        console.error('WebGL multi-pass render error:', err);
        console.error(err.stack);
    }
}

function renderBufferPass(gl, uniformBuilder, pass) {
    const channel = channels.getChannel(pass.channelNumber);
    if (!channel) {
        return;
    }
    
    channels.ensureBufferTextures(pass.channelNumber);
    if (!channel.textures) {
        return;
    }
    
    const readTexture = channel.textures[channel.currentPing];
    const writeTexture = channel.textures[1 - channel.currentPing];
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.glFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);
    
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer incomplete:', status);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return;
    }
    
    gl.useProgram(pass.program);
    gl.viewport(0, 0, channel.resolution.width, channel.resolution.height);
    
    bindChannelTextures(gl, pass, readTexture);
    applyPassUniforms(gl, pass, uniformBuilder, channel.resolution);
    drawFullscreenQuad(gl, pass.program);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    channel.currentPing = 1 - channel.currentPing;
}

function bindChannelTextures(gl, pass, readTexture) {
    pass.requiredChannels.forEach(chNum => {
        const textureInfo = getChannelTexture(chNum, pass, readTexture);
        const loc = pass.channelUniformLocations?.[chNum];
        if (!textureInfo?.texture || loc == null) {
            return;
        }
        gl.activeTexture(gl.TEXTURE0 + chNum);
        if (textureInfo.is3D) {
            gl.bindTexture(gl.TEXTURE_3D, textureInfo.texture);
        } else if (textureInfo.isCubemap) {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, textureInfo.texture);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
        }
        gl.uniform1i(loc, chNum);
    });
}

function getChannelTexture(channelNumber, pass, readTexture) {
    if (channelNumber === pass.channelNumber && readTexture) {
        return { texture: readTexture, is3D: false };
    }
    
    const channel = channels.getChannel(channelNumber);
    if (!channel) return null;
    
    if (channel.type === 'image' || channel.type === 'video' || channel.type === 'audio' ||
        channel.type === 'mic' || channel.type === 'webcam' || channel.type === 'keyboard') {
        return { texture: channel.texture || null, is3D: false, isCubemap: false };
    }
    
    if (channel.type === 'volume') {
        return { texture: channel.texture || null, is3D: true, isCubemap: false };
    }
    
    if (channel.type === 'cubemap' || channel.isCubemap) {
        return { texture: channel.texture || null, is3D: false, isCubemap: true };
    }
    
    if (channel.type === 'buffer') {
        channels.ensureBufferTextures(channel.number);
        if (!channel.textures) {
            return null;
        }
        return { texture: channel.textures[channel.currentPing], is3D: false };
    }
    
    return null;
}

function applyPassUniforms(gl, pass, uniformBuilder, resolution) {
    uniformBuilder.applyWebGL(gl, pass.uniforms);
    
    if (pass.uniforms.u_resolution && resolution) {
        gl.uniform2f(pass.uniforms.u_resolution, resolution.width, resolution.height);
    }
    
    if (pass.uniforms.u_frame) {
        gl.uniform1i(pass.uniforms.u_frame, state.visualFrame);
    }
}

function drawFullscreenQuad(gl, program) {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.glQuadBuffer);
    const a_position = gl.getAttribLocation(program, 'a_position');
    if (a_position >= 0) {
        gl.enableVertexAttribArray(a_position);
        gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);
    }
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    if (a_position >= 0) {
        gl.disableVertexAttribArray(a_position);
    }
}

function displaySelectedChannel(gl) {
    const selected = channels.getSelectedOutputChannel();
    let channel = channels.getChannel(selected) || channels.getChannel(0);
    
    // Volume (3D) textures can't be displayed directly - always use main output (ch0)
    if (channel?.type === 'volume') {
        channel = channels.getChannel(0);
    }
    
    // Skip if we somehow still have a volume or no valid channel
    if (!channel || channel.type === 'volume') return;
    
    let texture = channels.getChannelTextureForDisplay(channel.number);
    
    if (!texture && channel.number !== 0) {
        channel = channels.getChannel(0);
        texture = channels.getChannelTextureForDisplay(0);
    }
    
    if (!texture || !channel) return;
    
    // Don't try to display 3D textures
    if (channel.is3D) return;
    
    // Use passthrough shader instead of blitFramebuffer (more compatible)
    if (!displayProgram) return;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.disable(gl.BLEND);
    
    gl.useProgram(displayProgram);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(displayProgramLocs.u_texture, 0);
    gl.uniform1i(displayProgramLocs.u_linearMode, state.linearColorspace ? 1 : 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, state.glQuadBuffer);
    gl.enableVertexAttribArray(displayProgramLocs.a_position);
    gl.vertexAttribPointer(displayProgramLocs.a_position, 2, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ============================================================================
// Cleanup
// ============================================================================

export function disposePassPrograms(passList = state.webglPasses) {
    const gl = state.glContext;
    if (!gl || !passList) return;
    passList.forEach(pass => {
        if (pass?.program) {
            gl.deleteProgram(pass.program);
        }
    });
}

export function cleanup() {
    const gl = state.glContext;
    if (!gl) return;

    disposePassPrograms(state.webglPasses);
    state.webglPasses = [];
    state.glProgram = null;

    if (state.glQuadBuffer) {
        gl.deleteBuffer(state.glQuadBuffer);
        state.glQuadBuffer = null;
    }

    if (state.glFramebuffer) {
        gl.deleteFramebuffer(state.glFramebuffer);
        state.glFramebuffer = null;
    }

    state.glUniforms = null;
    state.glContext = null;
    state.graphicsBackend = null;
    state.hasWebGL = false;
}

// ============================================================================
// Colorspace Configuration
// ============================================================================

/**
 * Update the colorspace mode (can be called during rendering)
 * For WebGL, this is applied via gamma correction in the display shader
 * @param {boolean} linear - true for linear (compute.toys), false for sRGB (Shadertoy)
 */
export function setColorspace(linear) {
    state.linearColorspace = linear;
    // The actual gamma correction is applied in displaySelectedChannel via u_linearMode uniform
    console.log(`✓ WebGL colorspace set to ${linear ? 'linear (gamma corrected)' : 'sRGB'}`);
}

