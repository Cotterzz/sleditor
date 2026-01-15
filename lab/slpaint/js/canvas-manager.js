export class CanvasManager {
    constructor(gl, canvas) {
        this.gl = gl;
        this.canvas = canvas;

        // Create two textures for ping-pong rendering
        this.textures = [
            this.createTexture(),
            this.createTexture()
        ];
        this.framebuffers = [
            this.createFramebuffer(this.textures[0]),
            this.createFramebuffer(this.textures[1])
        ];
        this.currentTexture = 0;

        // Create brush mask texture
        this.brushMaskTexture = this.createBrushMask(256);

        // Setup display shader for rendering texture to screen
        this.displayProgram = this.createDisplayProgram();
        this.quadBuffer = this.createQuadBuffer();
    }

    createTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            this.canvas.width, this.canvas.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    createFramebuffer(texture) {
        const gl = this.gl;
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, texture, 0
        );
        return fb;
    }

    createBrushMask(size) {
        const gl = this.gl;
        const data = new Uint8Array(size * size * 4);
        const center = size / 2;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - center;
                const dy = y - center;
                const dist = Math.sqrt(dx * dx + dy * dy) / center;
                const alpha = Math.max(0, 1 - dist);
                const idx = (y * size + x) * 4;
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = Math.floor(alpha * 255);
            }
        }

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            size, size, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, data
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return texture;
    }

    createDisplayProgram() {
        const gl = this.gl;
        
        const vsSource = `
            attribute vec2 a_position;
            varying vec2 v_texCoord;
            void main() {
                v_texCoord = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform sampler2D u_texture;
            varying vec2 v_texCoord;
            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
            }
        `;

        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        return {
            program,
            attribs: {
                position: gl.getAttribLocation(program, 'a_position')
            },
            uniforms: {
                texture: gl.getUniformLocation(program, 'u_texture')
            }
        };
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    }

    createQuadBuffer() {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), gl.STATIC_DRAW);
        return buffer;
    }

    getCurrentTexture() {
        return this.textures[this.currentTexture];
    }

    getTargetFramebuffer() {
        return this.framebuffers[1 - this.currentTexture];
    }

    swap() {
        this.currentTexture = 1 - this.currentTexture;
    }

    clear(color) {
        const gl = this.gl;

        // Clear both framebuffers
        for (let i = 0; i < 2; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            gl.clearColor(color[0], color[1], color[2], 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        // Clear main canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(color[0], color[1], color[2], 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    displayToScreen() {
        const gl = this.gl;
        const prog = this.displayProgram;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        gl.useProgram(prog.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.getCurrentTexture());
        gl.uniform1i(prog.uniforms.texture, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(prog.attribs.position);
        gl.vertexAttribPointer(prog.attribs.position, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}