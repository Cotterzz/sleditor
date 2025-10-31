// ============================================================================
// WebGL Backend - GLSL Graphics
// ============================================================================

import { state, CONFIG, DERIVED } from '../core.js';

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

// ============================================================================
// Shader Compilation
// ============================================================================

export async function compile(fragmentSource) {
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
            u_frame: gl.getUniformLocation(program, 'u_frame'),
        };

        // Get custom uniform locations (u_custom0 through u_custom14)
        for (let i = 0; i < 15; i++) {
            uniforms[`u_custom${i}`] = gl.getUniformLocation(program, `u_custom${i}`);
        }

        // Update state
        state.glProgram = program;
        state.glUniforms = uniforms;
        state.graphicsBackend = 'webgl';

        return { success: true, program };
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

    if (!gl || !state.glProgram) {
        console.warn('WebGL not ready for rendering');
        return;
    }

    try {
        // Use program
        gl.useProgram(state.glProgram);

        // Set viewport
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear canvas
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Apply uniforms using the uniform builder
        uniformBuilder.applyWebGL(gl, state.glUniforms);

        // Also set frame counter
        if (state.glUniforms.u_frame) {
            gl.uniform1i(state.glUniforms.u_frame, state.visualFrame);
        }

        // Setup vertex attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, state.glQuadBuffer);
        const a_position = gl.getAttribLocation(state.glProgram, 'a_position');
        if (a_position >= 0) {
            gl.enableVertexAttribArray(a_position);
            gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);
        }

        // Draw fullscreen quad
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Cleanup
        if (a_position >= 0) {
            gl.disableVertexAttribArray(a_position);
        }
    } catch (err) {
        console.error('WebGL render error:', err);
        console.error('Stack:', err.stack);
    }
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanup() {
    const gl = state.glContext;
    if (!gl) return;

    if (state.glProgram) {
        gl.deleteProgram(state.glProgram);
        state.glProgram = null;
    }

    if (state.glQuadBuffer) {
        gl.deleteBuffer(state.glQuadBuffer);
        state.glQuadBuffer = null;
    }

    state.glUniforms = null;
    state.glContext = null;
    state.graphicsBackend = null;
    state.hasWebGL = false;
}

