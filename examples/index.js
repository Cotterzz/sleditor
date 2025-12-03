/**
 * WebGL-based audio shader processor (Infinite streaming with background rendering)
 *
 * Usage:
 *
 * import { WebGLAudioShader } from './audio-shader.js';
 *
 * const shader = new WebGLAudioShader();
 *
 * await shader.init(`
 *   vec2 mainSound(float time) {
 *     return vec2(sin(time * 440.0 * 6.28318));
 *   }
 * `);
 *
 * shader.start();
 *
 * // Update shader (seamlessly transitions)
 * shader.setShader(`
 *   vec2 mainSound(float time) {
 *     float freq = 220.0 + sin(time) * 100.0;
 *     return vec2(sin(time * freq * 6.28318));
 *   }
 * `);
 *
 * // When done
 * shader.stop();
 * shader.dispose();
 */

export class WebGLAudioShader {
  constructor() {
    this.audioContext = null
    this.isRunning = false
    this.currentTime = 0
    this.scheduledUntil = 0
    this.renderWorker = null
    this.shaderCode = null
    this.scheduledSources = []
    this.maxTextureSize = 4096
    this.bufferAheadTime = 1.0 // Keep 1 second of audio buffered
    this.generating = false
  }

  async init(shaderCode) {
    this.audioContext = new AudioContext()

    // Create Web Worker for background rendering
    const workerCode = `
      let gl = null;
      let program = null;
      let sampleRateLocation = null;
      let timeOffsetLocation = null;
      let framebuffer = null;
      let texture = null;
      let maxTextureSize = 4096;
      let currentWidth = 0;
      
      self.onmessage = async (e) => {
        if (e.data.type === 'init') {
          const { canvas, shaderCode } = e.data;
          setupWebGL(canvas, shaderCode);
        } else if (e.data.type === 'render') {
          const { numSamples, sampleRate, timeOffset } = e.data;
          const audioData = generateAudio(numSamples, sampleRate, timeOffset);
          if (audioData) {
            self.postMessage({ type: 'audioData', audioData }, [audioData.buffer]);
          } else {
            self.postMessage({ type: 'error', error: 'Generation failed' });
          }
        } else if (e.data.type === 'updateShader') {
          const { shaderCode } = e.data;
          updateShader(shaderCode);
        }
      };
      
      function setupWebGL(canvas, shaderCode) {
        gl = canvas.getContext('webgl2', {
          alpha: false,
          depth: false,
          stencil: false,
          antialias: false,
          powerPreference: 'high-performance'
        });
        
        if (!gl) {
          self.postMessage({ type: 'error', error: 'WebGL2 not supported' });
          return;
        }
        
        const floatExt = gl.getExtension('EXT_color_buffer_float');
        if (!floatExt) {
          self.postMessage({ type: 'error', error: 'Float textures not supported' });
          return;
        }
        
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        self.postMessage({ type: 'maxTextureSize', size: maxTextureSize });
        
        updateShader(shaderCode);
        
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        
        const positionLoc = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
      }
      
      function updateShader(shaderCode) {
        const vertexShaderSource = \`#version 300 es
          in vec2 position;
          void main() {
            gl_Position = vec4(position, 0.0, 1.0);
          }
        \`;
        
        const fragmentShaderSource = \`#version 300 es
          precision highp float;
          uniform float iSampleRate;
          uniform float iTimeOffset;
          out vec4 fragColor;
          
          \${shaderCode}
          
          void main() {
            float time = (gl_FragCoord.x - 0.5) / iSampleRate + iTimeOffset;
            vec2 sound = mainSound(time);
            fragColor = vec4(sound, 0.0, 1.0);
          }
        \`;
        
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) return;
        
        if (program) gl.deleteProgram(program);
        program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          self.postMessage({ type: 'error', error: 'Shader link error: ' + gl.getProgramInfoLog(program) });
          return;
        }
        
        gl.useProgram(program);
        
        sampleRateLocation = gl.getUniformLocation(program, 'iSampleRate');
        timeOffsetLocation = gl.getUniformLocation(program, 'iTimeOffset');
        
        self.postMessage({ type: 'ready' });
      }
      
      function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          self.postMessage({ type: 'error', error: 'Shader error: ' + gl.getShaderInfoLog(shader) });
          return null;
        }
        
        return shader;
      }
      
      function generateAudio(numSamples, sampleRate, timeOffset) {
        const clampedSamples = Math.min(numSamples, maxTextureSize);
        
        if (currentWidth !== clampedSamples) {
          if (texture) gl.deleteTexture(texture);
          if (framebuffer) gl.deleteFramebuffer(framebuffer);
          
          texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, clampedSamples, 1, 0, gl.RGBA, gl.FLOAT, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          
          framebuffer = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          
          const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          if (status !== gl.FRAMEBUFFER_COMPLETE) {
            self.postMessage({ type: 'error', error: 'Framebuffer error: ' + status });
            return null;
          }
          
          currentWidth = clampedSamples;
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        }
        
        gl.uniform1f(sampleRateLocation, sampleRate);
        gl.uniform1f(timeOffsetLocation, timeOffset);
        
        gl.viewport(0, 0, clampedSamples, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        const pixelData = new Float32Array(clampedSamples * 4);
        gl.readPixels(0, 0, clampedSamples, 1, gl.RGBA, gl.FLOAT, pixelData);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        const audioData = new Float32Array(clampedSamples * 2);
        for (let i = 0; i < clampedSamples; i++) {
          audioData[i * 2] = pixelData[i * 4];
          audioData[i * 2 + 1] = pixelData[i * 4 + 1];
        }
        
        return audioData;
      }
    `

    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    this.renderWorker = new Worker(workerUrl)
    URL.revokeObjectURL(workerUrl)

    // Handle worker messages
    this.renderWorker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        this.workerReady = true
      } else if (e.data.type === 'maxTextureSize') {
        this.maxTextureSize = e.data.size
      } else if (e.data.type === 'audioData') {
        this.generating = false
        this.onAudioDataGenerated(e.data.audioData)
      } else if (e.data.type === 'error') {
        console.error('Worker error:', e.data.error)
        this.generating = false
      }
    }

    // Create offscreen canvas
    const canvas = document.createElement('canvas')
    const offscreen = canvas.transferControlToOffscreen()

    if (shaderCode) {
      await this.setShader(shaderCode, offscreen)
    }

    // Start continuous generation loop
    this.generationLoop()

    return this
  }

  generationLoop() {
    if (!this.isRunning) {
      requestAnimationFrame(() => this.generationLoop())
      return
    }

    // Check how much audio is buffered ahead
    const now = this.audioContext.currentTime
    const bufferedTime = this.scheduledUntil - now

    // Request more audio if buffer is low and not already generating
    if (bufferedTime < this.bufferAheadTime && this.workerReady && !this.generating) {
      this.generating = true

      const sampleRate = this.audioContext.sampleRate
      const maxSafeSamples = Math.min(this.maxTextureSize, 8192)

      this.renderWorker.postMessage({
        type: 'render',
        numSamples: maxSafeSamples,
        sampleRate,
        timeOffset: this.currentTime
      })
    }

    requestAnimationFrame(() => this.generationLoop())
  }

  async setShader(shaderCode, offscreen = null) {
    this.shaderCode = shaderCode
    this.workerReady = false

    if (offscreen) {
      this.renderWorker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          shaderCode
        },
        [offscreen]
      )
    } else {
      const wasRunning = this.isRunning
      if (wasRunning) {
        this.stop()
      }

      this.renderWorker.postMessage({
        type: 'updateShader',
        shaderCode
      })

      await new Promise((resolve) => {
        const checkReady = setInterval(() => {
          if (this.workerReady) {
            clearInterval(checkReady)
            resolve()
          }
        }, 10)
      })

      if (wasRunning) {
        this.start()
      }
    }

    // Wait for worker to be ready
    await new Promise((resolve) => {
      const checkReady = setInterval(() => {
        if (this.workerReady) {
          clearInterval(checkReady)
          resolve()
        }
      }, 10)
    })
  }

  onAudioDataGenerated(audioData) {
    if (!this.isRunning) return

    const sampleRate = this.audioContext.sampleRate
    const numSamples = audioData.length / 2

    // Create AudioBuffer
    const buffer = this.audioContext.createBuffer(2, numSamples, sampleRate)
    const leftChannel = buffer.getChannelData(0)
    const rightChannel = buffer.getChannelData(1)

    for (let i = 0; i < numSamples; i++) {
      leftChannel[i] = audioData[i * 2]
      rightChannel[i] = audioData[i * 2 + 1]
    }

    // Schedule playback
    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(this.audioContext.destination)

    // Schedule from either current scheduled position or current time + small buffer
    const now = this.audioContext.currentTime
    const startTime = Math.max(this.scheduledUntil, now + 0.1)

    source.start(startTime)

    this.scheduledSources.push(source)
    this.scheduledUntil = startTime + buffer.duration
    this.currentTime += buffer.duration

    // Clean up old sources
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source)
      if (idx > -1) this.scheduledSources.splice(idx, 1)
    }
  }

  start() {
    if (this.isRunning) return

    this.isRunning = true
    this.audioContext.resume()

    // Initialize timing
    const now = this.audioContext.currentTime
    this.scheduledUntil = now
    this.currentTime = 0
  }

  stop() {
    this.isRunning = false

    this.scheduledSources.forEach((source) => {
      try {
        source.stop()
        source.disconnect()
      } catch (e) {}
    })
    this.scheduledSources = []

    this.currentTime = 0
    this.scheduledUntil = 0
  }

  dispose() {
    this.stop()
    if (this.renderWorker) {
      this.renderWorker.terminate()
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
  }
}
