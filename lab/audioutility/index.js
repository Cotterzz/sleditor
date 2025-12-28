/**
 * WebGL-based audio shader processor (Shadertoy compatible)
 *
 * Supports Shadertoy's sound shader signature:
 *   vec2 mainSound(int samp, float time)
 *
 * Where:
 *   samp = absolute sample index from start (0, 1, 2, 3...)
 *   time = absolute time in seconds
 *
 * Usage:
 *
 * import { WebGLAudioShader } from './index.js';
 *
 * const shader = new WebGLAudioShader();
 *
 * await shader.init(`
 *   vec2 mainSound(int samp, float time) {
 *     return vec2(sin(6.2831 * 440.0 * time) * exp(-3.0 * time));
 *   }
 * `);
 *
 * shader.start();
 *
 * // Update shader (seamlessly transitions)
 * shader.setShader(`
 *   vec2 mainSound(int samp, float time) {
 *     float freq = 220.0 + sin(time) * 100.0;
 *     return vec2(sin(6.2831 * freq * time));
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
    this.sampleOffset = 0  // Cumulative sample count (integer)
    this.scheduledUntil = 0
    this.renderWorker = null
    this.shaderCode = null
    this.scheduledSources = []
    this.maxTextureSize = 4096
    this.bufferAheadTime = 0.5 // Keep 0.5 second of audio buffered
    this.generating = false
    this.gainNode = null
  }

  async init(shaderCode) {
    this.audioContext = new AudioContext()
    
    // Create gain node for volume control
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)

    // Create Web Worker for background rendering
    const workerCode = `
      let gl = null;
      let program = null;
      let sampleRateLocation = null;
      let sampleOffsetLocation = null;
      let framebuffer = null;
      let texture = null;
      let maxTextureSize = 4096;
      let currentWidth = 0;
      
      self.onmessage = async (e) => {
        if (e.data.type === 'init') {
          const { canvas, shaderCode } = e.data;
          setupWebGL(canvas, shaderCode);
        } else if (e.data.type === 'render') {
          const { numSamples, sampleRate, sampleOffset } = e.data;
          const audioData = generateAudio(numSamples, sampleRate, sampleOffset);
          if (audioData) {
            self.postMessage({ type: 'audioData', audioData, numSamples }, [audioData.buffer]);
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
        
        // Wrap user's mainSound function with our boilerplate
        // User writes: vec2 mainSound(int samp, float time) { ... }
        // We provide samp and time automatically
        const fragmentShaderSource = \`#version 300 es
          precision highp float;
          precision highp int;
          
          uniform float iSampleRate;
          uniform int iSampleOffset;
          
          out vec4 fragColor;
          
          // User's shader code (must define mainSound)
          \${shaderCode}
          
          void main() {
            // Calculate absolute sample index (integer, no precision loss)
            int samp = iSampleOffset + int(gl_FragCoord.x - 0.5);
            
            // Calculate time from sample index (full precision)
            float time = float(samp) / iSampleRate;
            
            // Call user's mainSound function
            vec2 sound = mainSound(samp, time);
            
            // Clamp to valid audio range
            sound = clamp(sound, -1.0, 1.0);
            
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
        sampleOffsetLocation = gl.getUniformLocation(program, 'iSampleOffset');
        
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
      
      function generateAudio(numSamples, sampleRate, sampleOffset) {
        const clampedSamples = Math.min(numSamples, maxTextureSize);
        
        if (currentWidth !== clampedSamples) {
          if (texture) gl.deleteTexture(texture);
          if (framebuffer) gl.deleteFramebuffer(framebuffer);
          
          texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, clampedSamples, 1, 0, gl.RGBA, gl.FLOAT, null);
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
        gl.uniform1i(sampleOffsetLocation, sampleOffset);
        
        gl.viewport(0, 0, clampedSamples, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        const pixelData = new Float32Array(clampedSamples * 4);
        gl.readPixels(0, 0, clampedSamples, 1, gl.RGBA, gl.FLOAT, pixelData);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        // Extract stereo audio from RGBA (R=left, G=right)
        const audioData = new Float32Array(clampedSamples * 2);
        for (let i = 0; i < clampedSamples; i++) {
          audioData[i * 2] = pixelData[i * 4];       // Left channel
          audioData[i * 2 + 1] = pixelData[i * 4 + 1]; // Right channel
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
        // Clear any previous errors on successful compile
        if (this.onSuccess) {
          this.onSuccess()
        }
      } else if (e.data.type === 'maxTextureSize') {
        this.maxTextureSize = e.data.size
      } else if (e.data.type === 'audioData') {
        this.generating = false
        this.onAudioDataGenerated(e.data.audioData, e.data.numSamples)
      } else if (e.data.type === 'error') {
        console.error('Audio shader error:', e.data.error)
        this.generating = false
        if (this.onError) {
          this.onError(e.data.error)
        }
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
      // Generate ~100ms of audio per batch (balance between latency and efficiency)
      const samplesToGenerate = Math.min(Math.floor(sampleRate * 0.1), this.maxTextureSize)

      this.renderWorker.postMessage({
        type: 'render',
        numSamples: samplesToGenerate,
        sampleRate,
        sampleOffset: this.sampleOffset
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
      this.renderWorker.postMessage({
        type: 'updateShader',
        shaderCode
      })
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

  onAudioDataGenerated(audioData, numSamples) {
    if (!this.isRunning) return

    const sampleRate = this.audioContext.sampleRate
    const actualSamples = audioData.length / 2

    // Create AudioBuffer
    const buffer = this.audioContext.createBuffer(2, actualSamples, sampleRate)
    const leftChannel = buffer.getChannelData(0)
    const rightChannel = buffer.getChannelData(1)

    for (let i = 0; i < actualSamples; i++) {
      leftChannel[i] = audioData[i * 2]
      rightChannel[i] = audioData[i * 2 + 1]
    }

    // Schedule playback
    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(this.gainNode)

    // Schedule from either current scheduled position or current time + small buffer
    const now = this.audioContext.currentTime
    const startTime = Math.max(this.scheduledUntil, now + 0.05)

    source.start(startTime)

    this.scheduledSources.push(source)
    this.scheduledUntil = startTime + buffer.duration
    
    // Advance sample offset for next batch
    this.sampleOffset += actualSamples

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
    this.sampleOffset = 0  // Reset to start
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

    this.sampleOffset = 0
    this.scheduledUntil = 0
  }
  
  // Restart from beginning (like visual shader restart)
  restart() {
    const wasRunning = this.isRunning
    this.stop()
    if (wasRunning) {
      this.start()
    }
  }
  
  // Set volume (0.0 to 1.0)
  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume))
    }
  }
  
  // Get current playback time in seconds
  getCurrentTime() {
    return this.sampleOffset / this.audioContext.sampleRate
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
