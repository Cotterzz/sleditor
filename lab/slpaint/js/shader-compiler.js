export class ShaderCompiler {
    constructor(gl) {
        this.gl = gl;
    }

    getVertexShader() {
        return `
            attribute vec2 a_position;
            varying vec2 v_texCoord;
            
            void main() {
                v_texCoord = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;
    }

    wrapFragmentShader(userCode) {
        return `
            precision mediump float;
            
            uniform sampler2D u_canvas;
            uniform sampler2D u_brushMask;
            uniform vec2 u_resolution;
            uniform vec2 u_brushPos;
            uniform float u_brushSize;
            uniform vec3 u_fgColor;
            uniform vec3 u_bgColor;
            uniform float u_time;
            uniform float u_pressure;
            
            varying vec2 v_texCoord;
            
            // Helper functions available to user
            float getBrushMask(vec2 uv) {
                vec2 brushUV = (uv * u_resolution - u_brushPos) / u_brushSize + 0.5;
                if (brushUV.x < 0.0 || brushUV.x > 1.0 || brushUV.y < 0.0 || brushUV.y > 1.0) {
                    return 0.0;
                }
                return texture2D(u_brushMask, brushUV).a;
            }
            
            vec4 getCanvasColor(vec2 uv) {
                return texture2D(u_canvas, uv);
            }
            
            vec4 getCanvasColorOffset(vec2 offset) {
                return texture2D(u_canvas, v_texCoord + offset / u_resolution);
            }
            
            // User's brush effect function
            ${userCode}
            
            void main() {
                gl_FragColor = brushEffect(v_texCoord);
            }
        `;
    }

    compile(fragmentCode) {
        const gl = this.gl;

        // Compile vertex shader
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, this.getVertexShader());
        gl.compileShader(vs);

        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            return { success: false, error: 'Vertex shader error: ' + gl.getShaderInfoLog(vs) };
        }

        // Compile fragment shader
        const wrappedCode = this.wrapFragmentShader(fragmentCode);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, wrappedCode);
        gl.compileShader(fs);

        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(fs);
            // Try to extract meaningful error
            return { success: false, error: this.parseError(error) };
        }

        // Link program
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            return { success: false, error: 'Link error: ' + gl.getProgramInfoLog(program) };
        }

        // Get uniform locations
        const uniforms = {
            canvas: gl.getUniformLocation(program, 'u_canvas'),
            brushMask: gl.getUniformLocation(program, 'u_brushMask'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            brushPos: gl.getUniformLocation(program, 'u_brushPos'),
            brushSize: gl.getUniformLocation(program, 'u_brushSize'),
            fgColor: gl.getUniformLocation(program, 'u_fgColor'),
            bgColor: gl.getUniformLocation(program, 'u_bgColor'),
            time: gl.getUniformLocation(program, 'u_time'),
            pressure: gl.getUniformLocation(program, 'u_pressure')
        };

        const attribs = {
            position: gl.getAttribLocation(program, 'a_position')
        };

        return {
            success: true,
            program,
            uniforms,
            attribs
        };
    }

    parseError(error) {
        // Try to make error messages more user-friendly
        const lines = error.split('\n');
        const relevantErrors = lines.filter(l => l.includes('ERROR'));
        return relevantErrors.length > 0 ? relevantErrors.join('\n') : error;
    }
}