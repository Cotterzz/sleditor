export class BrushEngine {
    constructor(gl, canvasManager, shaderCompiler) {
        this.gl = gl;
        this.canvasManager = canvasManager;
        this.shaderCompiler = shaderCompiler;
        this.currentProgram = null;
        this.quadBuffer = this.createQuadBuffer();
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

    setShader(code) {
        const result = this.shaderCompiler.compile(code);
        if (result.success) {
            // Clean up old program
            if (this.currentProgram) {
                this.gl.deleteProgram(this.currentProgram.program);
            }
            this.currentProgram = result;
        }
        return result;
    }

    apply(params) {
        if (!this.currentProgram) return;

        const gl = this.gl;
        const cm = this.canvasManager;
        const prog = this.currentProgram;

        // Render to target framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, cm.getTargetFramebuffer());
        gl.viewport(0, 0, cm.canvas.width, cm.canvas.height);

        gl.useProgram(prog.program);

        // Bind current canvas texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cm.getCurrentTexture());
        gl.uniform1i(prog.uniforms.canvas, 0);

        // Bind brush mask texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, cm.brushMaskTexture);
        gl.uniform1i(prog.uniforms.brushMask, 1);

        // Set uniforms
        gl.uniform2f(prog.uniforms.resolution, cm.canvas.width, cm.canvas.height);
        gl.uniform2f(prog.uniforms.brushPos, params.x, params.y);
        gl.uniform1f(prog.uniforms.brushSize, params.size);
        gl.uniform3fv(prog.uniforms.fgColor, params.fgColor);
        gl.uniform3fv(prog.uniforms.bgColor, params.bgColor);
        gl.uniform1f(prog.uniforms.time, params.time);
        gl.uniform1f(prog.uniforms.pressure, params.pressure);

        // Draw fullscreen quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(prog.attribs.position);
        gl.vertexAttribPointer(prog.attribs.position, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Swap textures
        cm.swap();

        // Display result
        cm.displayToScreen();
    }
}