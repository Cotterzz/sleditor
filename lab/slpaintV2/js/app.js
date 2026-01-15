/* global require, monaco */
(() => {
    const MONACO_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min';

    window.MonacoEnvironment = {
        getWorkerUrl: function () {
            const code = `
                self.MonacoEnvironment = { baseUrl: '${MONACO_CDN}/' };
                importScripts('${MONACO_CDN}/vs/base/worker/workerMain.js');
            `;
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
        }
    };

    require.config({ paths: { vs: `${MONACO_CDN}/vs` } });

    const BRUSHES = {
        basicBrush: {
            name: 'Basic Brush',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);

    // Soft falloff
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);
    intensity = intensity * intensity * (3.0 - 2.0 * intensity);

    vec3 brushColor = u_foreground;
    outColor = vec4(mix(current.rgb, brushColor, intensity * u_opacity), 1.0);
}`
        },
        airbrush: {
            name: 'Airbrush',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);

    float sigma = u_brushSize * 0.4;
    float intensity = exp(-(dist * dist) / (2.0 * sigma * sigma));
    intensity *= 0.3;

    vec3 brushColor = u_foreground;
    outColor = vec4(mix(current.rgb, brushColor, intensity * u_opacity), 1.0);
}`
        },
        smudge: {
            name: 'Smudge',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);

    vec2 delta = u_brushPos - u_lastBrushPos;
    vec2 smudgeDir = delta / u_resolution;
    float smudgeAmount = intensity * 0.6;
    vec2 sampleUV = uv - smudgeDir * smudgeAmount;
    vec3 smudged = texture(u_canvas, sampleUV).rgb;

    outColor = vec4(mix(current.rgb, smudged, intensity * u_opacity), 1.0);
}`
        },
        blur: {
            name: 'Blur',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);

    vec3 blurred = vec3(0.0);
    float samples = 0.0;
    vec2 texel = 1.0 / u_resolution;

    for (float x = -2.0; x <= 2.0; x += 1.0) {
        for (float y = -2.0; y <= 2.0; y += 1.0) {
            vec2 offset = vec2(x, y) * texel;
            blurred += texture(u_canvas, uv + offset).rgb;
            samples += 1.0;
        }
    }

    blurred /= samples;
    outColor = vec4(mix(current.rgb, blurred, intensity * u_opacity), 1.0);
}`
        },
        pixelate: {
            name: 'Pixelate',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);

    float pixelSize = 10.0;
    vec2 pixelCoord = floor(gl_FragCoord.xy / pixelSize) * pixelSize;
    vec2 pixelUV = pixelCoord / u_resolution;
    vec3 pixelated = texture(u_canvas, pixelUV).rgb;

    outColor = vec4(mix(current.rgb, pixelated, intensity * u_opacity), 1.0);
}`
        },
        rainbow: {
            name: 'Rainbow',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);
    intensity = intensity * intensity * (3.0 - 2.0 * intensity);

    vec2 toPixel = gl_FragCoord.xy - u_brushPos;
    float angle = atan(toPixel.y, toPixel.x);
    float hue = fract(angle / 6.28318 + u_time * 0.5);
    vec3 brushColor = hsv2rgb(vec3(hue, 0.8, 1.0));

    outColor = vec4(mix(current.rgb, brushColor, intensity * u_opacity), 1.0);
}`
        },
        noise: {
            name: 'Noise Texture',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);

    vec2 noiseCoord = gl_FragCoord.xy * 0.08 + u_time * 10.0;
    float n = random(floor(noiseCoord));
    vec3 brushColor = u_foreground * (0.5 + n * 0.5);

    outColor = vec4(mix(current.rgb, brushColor, intensity * u_opacity), 1.0);
}`
        },
        eraser: {
            name: 'Eraser',
            shader: `#version 300 es
precision highp float;

uniform sampler2D u_canvas;
uniform vec2 u_brushPos;
uniform vec2 u_lastBrushPos;
uniform float u_brushSize;
uniform float u_opacity;
uniform vec3 u_foreground;
uniform vec3 u_background;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 current = texture(u_canvas, uv);
    float dist = distance(gl_FragCoord.xy, u_brushPos);
    float intensity = 1.0 - smoothstep(0.0, u_brushSize, dist);
    intensity *= intensity;

    vec3 brushColor = u_background;
    outColor = vec4(mix(current.rgb, brushColor, intensity * u_opacity), 1.0);
}`
        }
    };

    const DEFAULT_BRUSH_KEY = 'basicBrush';

    const FULLSCREEN_VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

    const PRESENT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
}`;

    class ShaderPaintEngine {
        constructor(canvas) {
            this.canvas = canvas;
            this.gl = canvas.getContext('webgl2', {
                preserveDrawingBuffer: true,
                antialias: false
            });

            if (!this.gl) {
                throw new Error('WebGL2 not supported');
            }

            this.brushSizeCss = 50;
            this.opacity = 1.0;
            this.foregroundColor = [0, 0, 0];
            this.backgroundColor = [1, 1, 1];
            this.time = 0;
            this.isDrawing = false;
            this.lastDrawPos = null;
            this.lastInputPos = null;
            this.pointQueue = [];
            this.maxDabsPerFrame = 24;
            this.dabCount = 0;

            this.initGL();
            this.resize();
            this.clearCanvas();
        }

        initGL() {
            const gl = this.gl;

            this.quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([
                    -1, -1,
                    1, -1,
                    -1, 1,
                    1, 1
                ]),
                gl.STATIC_DRAW
            );

            this.presentProgram = this.createProgram(FULLSCREEN_VERTEX, PRESENT_FRAGMENT);
            this.presentAttribs = {
                position: gl.getAttribLocation(this.presentProgram, 'a_position')
            };
            this.presentUniforms = {
                texture: gl.getUniformLocation(this.presentProgram, 'u_texture')
            };
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.floor(rect.width * dpr));
            const height = Math.max(1, Math.floor(rect.height * dpr));

            if (this.width === width && this.height === height && this.dpr === dpr) {
                return;
            }

            this.width = width;
            this.height = height;
            this.dpr = dpr;
            this.canvas.width = width;
            this.canvas.height = height;

            const gl = this.gl;
            this.canvasTexture = this.createTexture(width, height);
            this.scratchTexture = this.createTexture(width, height);
            this.canvasFbo = this.createFramebuffer(this.canvasTexture);
            this.scratchFbo = this.createFramebuffer(this.scratchTexture);
            gl.viewport(0, 0, width, height);
        }

        createTexture(width, height) {
            const gl = this.gl;
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return texture;
        }

        createFramebuffer(texture) {
            const gl = this.gl;
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            return framebuffer;
        }

        createProgram(vertexSource, fragmentSource) {
            const gl = this.gl;
            const vs = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vs, vertexSource);
            gl.compileShader(vs);

            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
                const error = gl.getShaderInfoLog(vs);
                gl.deleteShader(vs);
                throw new Error(`Vertex shader error:\n${error}`);
            }

            const fs = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fs, fragmentSource);
            gl.compileShader(fs);

            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                const error = gl.getShaderInfoLog(fs);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                throw new Error(`Fragment shader error:\n${error}`);
            }

            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const error = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                throw new Error(`Program link error:\n${error}`);
            }

            return program;
        }

        compileBrushProgram(code) {
            const gl = this.gl;
            const program = this.createProgram(FULLSCREEN_VERTEX, code);
            if (this.brushProgram) {
                gl.deleteProgram(this.brushProgram);
            }
            this.brushProgram = program;
            this.brushAttribs = {
                position: gl.getAttribLocation(program, 'a_position')
            };
            this.brushUniforms = {
                canvas: gl.getUniformLocation(program, 'u_canvas'),
                brushPos: gl.getUniformLocation(program, 'u_brushPos'),
                lastBrushPos: gl.getUniformLocation(program, 'u_lastBrushPos'),
                brushSize: gl.getUniformLocation(program, 'u_brushSize'),
                opacity: gl.getUniformLocation(program, 'u_opacity'),
                foreground: gl.getUniformLocation(program, 'u_foreground'),
                background: gl.getUniformLocation(program, 'u_background'),
                resolution: gl.getUniformLocation(program, 'u_resolution'),
                time: gl.getUniformLocation(program, 'u_time')
            };
        }

        clearCanvas() {
            const gl = this.gl;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.canvasFbo);
            gl.viewport(0, 0, this.width, this.height);
            gl.clearColor(this.backgroundColor[0], this.backgroundColor[1], this.backgroundColor[2], 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            this.present();
        }

        getBrushRect(x, y, size) {
            const left = Math.max(0, Math.floor(x - size));
            const bottom = Math.max(0, Math.floor(y - size));
            const right = Math.min(this.width, Math.ceil(x + size));
            const top = Math.min(this.height, Math.ceil(y + size));
            return {
                x: left,
                y: bottom,
                w: Math.max(0, right - left),
                h: Math.max(0, top - bottom)
            };
        }

        applyBrush(x, y) {
            if (!this.brushProgram) {
                return;
            }

            const gl = this.gl;
            const size = this.brushSizeCss * this.dpr;
            const rect = this.getBrushRect(x, y, size);

            if (rect.w === 0 || rect.h === 0) {
                return;
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratchFbo);
            gl.viewport(0, 0, this.width, this.height);
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(rect.x, rect.y, rect.w, rect.h);

            gl.useProgram(this.brushProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
            this.setUniform1i(this.brushUniforms.canvas, 0);
            this.setUniform2f(this.brushUniforms.brushPos, x, y);
            const last = this.lastDrawPos || { x, y };
            this.setUniform2f(this.brushUniforms.lastBrushPos, last.x, last.y);
            this.setUniform1f(this.brushUniforms.brushSize, size);
            this.setUniform1f(this.brushUniforms.opacity, this.opacity);
            this.setUniform3fv(this.brushUniforms.foreground, this.foregroundColor);
            this.setUniform3fv(this.brushUniforms.background, this.backgroundColor);
            this.setUniform2f(this.brushUniforms.resolution, this.width, this.height);
            this.setUniform1f(this.brushUniforms.time, this.time);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.enableVertexAttribArray(this.brushAttribs.position);
            gl.vertexAttribPointer(this.brushAttribs.position, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            gl.disable(gl.SCISSOR_TEST);

            gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratchFbo);
            gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, rect.x, rect.y, rect.x, rect.y, rect.w, rect.h);

            this.lastDrawPos = { x, y };
            this.dabCount += 1;
            this.presentNeeded = true;
        }

        present() {
            const gl = this.gl;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.width, this.height);
            gl.useProgram(this.presentProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
            gl.uniform1i(this.presentUniforms.texture, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.enableVertexAttribArray(this.presentAttribs.position);
            gl.vertexAttribPointer(this.presentAttribs.position, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            this.presentNeeded = false;
        }

        setUniform1f(location, value) {
            if (location !== null) {
                this.gl.uniform1f(location, value);
            }
        }

        setUniform1i(location, value) {
            if (location !== null) {
                this.gl.uniform1i(location, value);
            }
        }

        setUniform2f(location, x, y) {
            if (location !== null) {
                this.gl.uniform2f(location, x, y);
            }
        }

        setUniform3fv(location, value) {
            if (location !== null) {
                this.gl.uniform3fv(location, value);
            }
        }

        enqueueStrokePoint(x, y) {
            const spacing = Math.max(1, this.brushSizeCss * this.dpr * 0.15);

            if (!this.lastInputPos) {
                this.lastInputPos = { x, y };
                this.pointQueue.push({ x, y });
                return;
            }

            const dx = x - this.lastInputPos.x;
            const dy = y - this.lastInputPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.max(1, Math.ceil(dist / spacing));

            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                this.pointQueue.push({
                    x: this.lastInputPos.x + dx * t,
                    y: this.lastInputPos.y + dy * t
                });
            }

            this.lastInputPos = { x, y };

            if (this.pointQueue.length > 2000) {
                this.pointQueue.splice(0, this.pointQueue.length - 2000);
            }
        }

        processQueue() {
            const limit = this.maxDabsPerFrame;
            let count = 0;
            while (this.pointQueue.length > 0 && count < limit) {
                const point = this.pointQueue.shift();
                this.applyBrush(point.x, point.y);
                count += 1;
            }
        }

        tick(now) {
            this.time = now / 1000;
            this.processQueue();
            if (this.presentNeeded) {
                this.present();
            }
        }
    }

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return [r, g, b];
    }

    function initApp() {
        const canvas = document.getElementById('paintCanvas');
        const brushPreview = document.getElementById('brushPreview');
        const canvasContainer = document.getElementById('canvasContainer');
        const stats = document.getElementById('stats');

        let engine;
        try {
            engine = new ShaderPaintEngine(canvas);
        } catch (error) {
            stats.textContent = error.message;
            return;
        }

        const editor = monaco.editor.create(document.getElementById('editor'), {
            value: BRUSHES[DEFAULT_BRUSH_KEY].shader,
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false }
        });

        const brushSelect = document.getElementById('brushSelect');
        const brushSize = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        const brushOpacity = document.getElementById('brushOpacity');
        const brushOpacityValue = document.getElementById('brushOpacityValue');
        const foregroundColor = document.getElementById('foregroundColor');
        const backgroundColor = document.getElementById('backgroundColor');
        const compileBtn = document.getElementById('compileBtn');
        const clearBtn = document.getElementById('clearBtn');
        const saveBtn = document.getElementById('saveBtn');
        const compileStatus = document.getElementById('compileStatus');
        const errorLog = document.getElementById('errorLog');

        Object.entries(BRUSHES).forEach(([key, brush]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = brush.name;
            brushSelect.appendChild(option);
        });
        brushSelect.value = DEFAULT_BRUSH_KEY;

        function setStatusOk(message) {
            compileStatus.textContent = message;
            compileStatus.classList.remove('error');
            compileStatus.classList.add('ok');
            errorLog.classList.remove('visible');
        }

        function setStatusError(message) {
            compileStatus.textContent = 'Error';
            compileStatus.classList.remove('ok');
            compileStatus.classList.add('error');
            errorLog.textContent = message;
            errorLog.classList.add('visible');
        }

        function compileShader() {
            try {
                engine.compileBrushProgram(editor.getValue());
                setStatusOk('Compiled');
            } catch (error) {
                setStatusError(error.message);
            }
        }

        compileShader();

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            compileShader();
        });

        compileBtn.addEventListener('click', compileShader);

        brushSelect.addEventListener('change', (event) => {
            const brushKey = event.target.value;
            editor.setValue(BRUSHES[brushKey].shader);
            compileShader();
        });

        brushSize.addEventListener('input', (event) => {
            const value = parseInt(event.target.value, 10);
            engine.brushSizeCss = value;
            brushSizeValue.textContent = value;
            brushPreview.style.width = `${value * 2}px`;
            brushPreview.style.height = `${value * 2}px`;
        });

        brushOpacity.addEventListener('input', (event) => {
            const value = parseInt(event.target.value, 10);
            engine.opacity = value / 100;
            brushOpacityValue.textContent = `${value}%`;
        });

        foregroundColor.addEventListener('input', (event) => {
            engine.foregroundColor = hexToRgb(event.target.value);
        });

        backgroundColor.addEventListener('input', (event) => {
            engine.backgroundColor = hexToRgb(event.target.value);
        });

        clearBtn.addEventListener('click', () => {
            engine.dabCount = 0;
            engine.clearCanvas();
        });

        saveBtn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = 'shader-paint.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });

        function updateBrushPreview(clientX, clientY) {
            const rect = canvasContainer.getBoundingClientRect();
            brushPreview.style.left = `${clientX - rect.left}px`;
            brushPreview.style.top = `${clientY - rect.top}px`;
            brushPreview.style.display = 'block';
        }

        function getCanvasCoords(clientX, clientY) {
            const rect = canvas.getBoundingClientRect();
            const x = (clientX - rect.left) * engine.dpr;
            const y = (rect.bottom - clientY) * engine.dpr;
            return { x, y };
        }

        function updateStats() {
            stats.textContent = `Dabs: ${engine.dabCount} | Queue: ${engine.pointQueue.length}`;
        }

        canvas.addEventListener('pointerdown', (event) => {
            canvas.setPointerCapture(event.pointerId);
            engine.isDrawing = true;
            engine.lastInputPos = null;
            engine.lastDrawPos = null;
            const coords = getCanvasCoords(event.clientX, event.clientY);
            engine.enqueueStrokePoint(coords.x, coords.y);
        });

        canvas.addEventListener('pointermove', (event) => {
            updateBrushPreview(event.clientX, event.clientY);
            if (!engine.isDrawing) {
                return;
            }
            const coords = getCanvasCoords(event.clientX, event.clientY);
            engine.enqueueStrokePoint(coords.x, coords.y);
        });

        canvas.addEventListener('pointerup', (event) => {
            canvas.releasePointerCapture(event.pointerId);
            engine.isDrawing = false;
            engine.lastInputPos = null;
            engine.lastDrawPos = null;
        });

        canvas.addEventListener('pointerleave', () => {
            engine.isDrawing = false;
            engine.lastInputPos = null;
            engine.lastDrawPos = null;
            brushPreview.style.display = 'none';
        });

        canvas.addEventListener('pointercancel', () => {
            engine.isDrawing = false;
            engine.lastInputPos = null;
            engine.lastDrawPos = null;
            brushPreview.style.display = 'none';
        });

        window.addEventListener('resize', () => {
            engine.resize();
            engine.clearCanvas();
        });

        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            setStatusError('WebGL context lost. Reload to recover.');
        });

        function tick(now) {
            engine.tick(now);
            updateStats();
            requestAnimationFrame(tick);
        }

        brushPreview.style.width = `${engine.brushSizeCss * 2}px`;
        brushPreview.style.height = `${engine.brushSizeCss * 2}px`;
        requestAnimationFrame(tick);
    }

    require(['vs/editor/editor.main'], initApp);
})();
