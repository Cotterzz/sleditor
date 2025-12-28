/**
 * WebGL-based audio shader processor (Shadertoy compatible)
 * Version 2 - with waveform visualization support
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
    
    // Waveform visualization
    this.waveformCanvas = null
    this.waveformCtx = null
    this.waveformData = null
    this.waveformSampleRate = 48000
    this.waveformZoom = 1.0 // seconds visible
    this.waveformOffset = 0 // start time in seconds
    this.waveformMaxDuration = 60 // max seconds to cache
    this.waveformWorker = null
    this.waveformWorkerReady = false
    this.waveformWorkerError = null
  }

  async init(shaderCode) {
    this.audioContext = new AudioContext()
    this.waveformSampleRate = this.audioContext.sampleRate
    
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
        
        const fragmentShaderSource = \`#version 300 es
          precision highp float;
          precision highp int;
          
          uniform float iSampleRate;
          uniform int iSampleOffset;
          
          out vec4 fragColor;
          
          \${shaderCode}
          
          void main() {
            int samp = iSampleOffset + int(gl_FragCoord.x - 0.5);
            float time = float(samp) / iSampleRate;
            vec2 sound = mainSound(samp, time);
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

    // Create offscreen canvas for audio
    const canvas = document.createElement('canvas')
    const offscreen = canvas.transferControlToOffscreen()

    if (shaderCode) {
      await this.setShader(shaderCode, offscreen)
    }

    // Initialize waveform visualization worker
    await this.initWaveformWorker(shaderCode)

    // Start continuous generation loop
    this.generationLoop()

    return this
  }

  async initWaveformWorker(shaderCode) {
    // Create separate worker for waveform generation with decimation support
    const workerCode = `
      let gl = null;
      let program = null;
      let sampleRateLocation = null;
      let sampleOffsetLocation = null;
      let sampleStepLocation = null;
      let framebuffer = null;
      let texture = null;
      let maxTextureSize = 4096;
      let currentWidth = 0;
      let shaderValid = false;
      
      self.onmessage = async (e) => {
        if (e.data.type === 'init') {
          const { canvas, shaderCode } = e.data;
          setupWebGL(canvas, shaderCode);
        } else if (e.data.type === 'render') {
          if (!shaderValid) {
            self.postMessage({ type: 'waveformError', error: 'Shader not valid' });
            return;
          }
          const { startSample, endSample, outputWidth, sampleRate, requestId } = e.data;
          const result = generateDecimated(startSample, endSample, outputWidth, sampleRate);
          if (result) {
            self.postMessage({ 
              type: 'waveformData', 
              minMaxData: result, 
              startSample,
              endSample,
              outputWidth,
              requestId 
            }, [result.buffer]);
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
          self.postMessage({ type: 'waveformError', error: 'WebGL2 not supported' });
          return;
        }
        
        gl.getExtension('EXT_color_buffer_float');
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        
        updateShader(shaderCode);
        
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        
        if (program) {
          const positionLoc = gl.getAttribLocation(program, 'position');
          gl.enableVertexAttribArray(positionLoc);
          gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
        }
      }
      
      function updateShader(shaderCode) {
        shaderValid = false;
        
        const vertexShaderSource = \`#version 300 es
          in vec2 position;
          void main() {
            gl_Position = vec4(position, 0.0, 1.0);
          }
        \`;
        
        // Shader supports sparse sampling via iSampleStep uniform
        const fragmentShaderSource = \`#version 300 es
          precision highp float;
          precision highp int;
          
          uniform float iSampleRate;
          uniform int iSampleOffset;
          uniform int iSampleStep; // Step between samples (1 = consecutive, N = every Nth sample)
          
          out vec4 fragColor;
          
          \${shaderCode}
          
          void main() {
            int pixelIdx = int(gl_FragCoord.x - 0.5);
            int samp = iSampleOffset + pixelIdx * iSampleStep;
            float time = float(samp) / iSampleRate;
            vec2 sound = mainSound(samp, time);
            sound = clamp(sound, -1.0, 1.0);
            fragColor = vec4(sound, 0.0, 1.0);
          }
        \`;
        
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) {
          self.postMessage({ type: 'waveformError', error: 'Shader compilation failed' });
          return;
        }
        
        if (program) gl.deleteProgram(program);
        program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          self.postMessage({ type: 'waveformError', error: 'Shader link failed' });
          return;
        }
        
        gl.useProgram(program);
        
        sampleRateLocation = gl.getUniformLocation(program, 'iSampleRate');
        sampleOffsetLocation = gl.getUniformLocation(program, 'iSampleOffset');
        sampleStepLocation = gl.getUniformLocation(program, 'iSampleStep');
        
        // Re-setup vertex attrib
        const positionLoc = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
        
        shaderValid = true;
        self.postMessage({ type: 'waveformReady' });
      }
      
      function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const error = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      }
      
      // Generate decimated min/max data for waveform display
      // Uses iSampleStep for efficient GPU-based sparse sampling
      // Returns Float32Array with 4 values per output column: minL, maxL, minR, maxR
      function generateDecimated(startSample, endSample, outputWidth, sampleRate) {
        const totalSamples = endSample - startSample;
        
        // OVERSAMPLE: samples to render per output column for accurate min/max
        const OVERSAMPLE = 8;
        
        // Total samples to render (capped at texture size)
        const targetRenderSamples = Math.min(outputWidth * OVERSAMPLE, totalSamples, maxTextureSize);
        
        // Step between samples: 1 = every sample, N = every Nth sample
        const sampleStep = Math.max(1, Math.floor(totalSamples / targetRenderSamples));
        
        // Actual samples we'll render
        const renderWidth = Math.min(Math.ceil(totalSamples / sampleStep), maxTextureSize);
        
        // Resize texture if needed
        if (currentWidth !== renderWidth) {
          if (texture) gl.deleteTexture(texture);
          if (framebuffer) gl.deleteFramebuffer(framebuffer);
          
          texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, renderWidth, 1, 0, gl.RGBA, gl.FLOAT, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          
          framebuffer = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          
          currentWidth = renderWidth;
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        }
        
        // Single render pass with sparse sampling via iSampleStep
        gl.uniform1f(sampleRateLocation, sampleRate);
        gl.uniform1i(sampleOffsetLocation, startSample);
        gl.uniform1i(sampleStepLocation, sampleStep);
        
        gl.viewport(0, 0, renderWidth, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Read back the results
        const pixelData = new Float32Array(renderWidth * 4);
        gl.readPixels(0, 0, renderWidth, 1, gl.RGBA, gl.FLOAT, pixelData);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        // Result: 4 floats per output column (minL, maxL, minR, maxR)
        const result = new Float32Array(outputWidth * 4);
        
        // Map rendered samples to output columns
        const samplesPerColumn = renderWidth / outputWidth;
        
        for (let col = 0; col < outputWidth; col++) {
          const colStart = Math.floor(col * samplesPerColumn);
          const colEnd = Math.min(Math.ceil((col + 1) * samplesPerColumn), renderWidth);
          
          let minL = 1, maxL = -1, minR = 1, maxR = -1;
          let hasData = false;
          
          for (let i = colStart; i < colEnd; i++) {
            const left = pixelData[i * 4];
            const right = pixelData[i * 4 + 1];
            
            if (!hasData) {
              minL = maxL = left;
              minR = maxR = right;
              hasData = true;
            } else {
              minL = Math.min(minL, left);
              maxL = Math.max(maxL, left);
              minR = Math.min(minR, right);
              maxR = Math.max(maxR, right);
            }
          }
          
          // If no samples for this column, use nearest sample
          if (!hasData && renderWidth > 0) {
            const nearestIdx = Math.min(Math.floor(col * renderWidth / outputWidth), renderWidth - 1);
            minL = maxL = pixelData[nearestIdx * 4];
            minR = maxR = pixelData[nearestIdx * 4 + 1];
          }
          
          result[col * 4] = minL;
          result[col * 4 + 1] = maxL;
          result[col * 4 + 2] = minR;
          result[col * 4 + 3] = maxR;
        }
        
        return result;
      }
    `

    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    this.waveformWorker = new Worker(workerUrl)
    URL.revokeObjectURL(workerUrl)

    this.waveformWorker.onmessage = (e) => {
      if (e.data.type === 'waveformReady') {
        this.waveformWorkerReady = true
        this.waveformWorkerError = null
      } else if (e.data.type === 'waveformError') {
        this.waveformWorkerError = e.data.error
        // Still mark as "ready" so we don't hang, but track the error
        this.waveformWorkerReady = true
      } else if (e.data.type === 'waveformData') {
        this.onWaveformDataGenerated(e.data)
      }
    }

    const canvas2 = document.createElement('canvas')
    const offscreen2 = canvas2.transferControlToOffscreen()

    this.waveformWorker.postMessage({
      type: 'init',
      canvas: offscreen2,
      shaderCode
    }, [offscreen2])

    // Wait for ready with timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve() // Don't reject, just continue
      }, 5000)
      
      const check = setInterval(() => {
        if (this.waveformWorkerReady) {
          clearInterval(check)
          clearTimeout(timeout)
          resolve()
        }
      }, 10)
    })
  }

  generationLoop() {
    if (!this.isRunning) {
      requestAnimationFrame(() => this.generationLoop())
      return
    }

    const now = this.audioContext.currentTime
    const bufferedTime = this.scheduledUntil - now

    if (bufferedTime < this.bufferAheadTime && this.workerReady && !this.generating) {
      this.generating = true

      const sampleRate = this.audioContext.sampleRate
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

    // Also update waveform worker
    if (this.waveformWorker) {
      this.waveformWorkerReady = false
      this.waveformWorkerError = null
      this.waveformWorker.postMessage({
        type: 'updateShader',
        shaderCode
      })
      
      // Clear cached waveform data
      this.waveformCache = new Map()
      this.waveformPendingRequest = null
      
      // Wait for waveform worker with timeout
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve() // Don't hang forever
        }, 2000)
        
        const check = setInterval(() => {
          if (this.waveformWorkerReady) {
            clearInterval(check)
            clearTimeout(timeout)
            resolve()
          }
        }, 10)
      })
      
      // Regenerate visible waveform if shader is valid
      if (!this.waveformWorkerError) {
        this.requestWaveformUpdate()
      }
    }

    // Wait for audio worker to be ready with timeout
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve()
      }, 2000)
      
      const checkReady = setInterval(() => {
        if (this.workerReady) {
          clearInterval(checkReady)
          clearTimeout(timeout)
          resolve()
        }
      }, 10)
    })
  }

  onAudioDataGenerated(audioData, numSamples) {
    if (!this.isRunning) return

    const sampleRate = this.audioContext.sampleRate
    const actualSamples = audioData.length / 2

    const buffer = this.audioContext.createBuffer(2, actualSamples, sampleRate)
    const leftChannel = buffer.getChannelData(0)
    const rightChannel = buffer.getChannelData(1)

    for (let i = 0; i < actualSamples; i++) {
      leftChannel[i] = audioData[i * 2]
      rightChannel[i] = audioData[i * 2 + 1]
    }

    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(this.gainNode)

    const now = this.audioContext.currentTime
    const startTime = Math.max(this.scheduledUntil, now + 0.05)

    source.start(startTime)

    this.scheduledSources.push(source)
    this.scheduledUntil = startTime + buffer.duration
    
    this.sampleOffset += actualSamples

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source)
      if (idx > -1) this.scheduledSources.splice(idx, 1)
    }
  }

  // Waveform visualization methods
  waveformCache = new Map()
  waveformPendingRequest = null
  waveformRequestId = 0

  setupWaveformCanvas(canvas) {
    this.waveformCanvas = canvas
    this.waveformCtx = canvas.getContext('2d')
    
    // Set up mouse interactions
    let isDragging = false
    let dragStartX = 0
    let dragStartOffset = 0

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8
      const oldZoom = this.waveformZoom
      
      // Zoom limits: 1/60th second to 60 seconds
      this.waveformZoom = Math.max(1/60, Math.min(60, this.waveformZoom * zoomFactor))
      
      // Zoom toward mouse position
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseRatio = mouseX / canvas.width
      
      const oldTimeAtMouse = this.waveformOffset + oldZoom * mouseRatio
      const newTimeAtMouse = this.waveformOffset + this.waveformZoom * mouseRatio
      this.waveformOffset += (oldTimeAtMouse - newTimeAtMouse)
      this.waveformOffset = Math.max(0, this.waveformOffset)
      
      this.requestWaveformUpdate()
    })

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true
      dragStartX = e.clientX
      dragStartOffset = this.waveformOffset
      canvas.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return
      const dx = e.clientX - dragStartX
      const timePerPixel = this.waveformZoom / canvas.width
      this.waveformOffset = Math.max(0, dragStartOffset - dx * timePerPixel)
      this.requestWaveformUpdate()
    })

    window.addEventListener('mouseup', () => {
      isDragging = false
      canvas.style.cursor = 'grab'
    })

    canvas.style.cursor = 'grab'
    
    this.requestWaveformUpdate()
  }

  requestWaveformUpdate() {
    if (!this.waveformCanvas || !this.waveformWorkerReady || this.waveformWorkerError) {
      // Still draw what we have (or empty state)
      this.drawWaveform()
      return
    }

    const canvas = this.waveformCanvas
    const width = canvas.width
    const sampleRate = this.waveformSampleRate

    const startTime = this.waveformOffset
    const endTime = startTime + this.waveformZoom

    const startSample = Math.floor(startTime * sampleRate)
    const endSample = Math.ceil(endTime * sampleRate)

    // Create cache key for this exact view
    const cacheKey = `${startSample}-${endSample}-${width}`
    
    // Check if we already have this exact data
    if (this.waveformCache.has(cacheKey)) {
      this.drawWaveform()
      return
    }

    // Request new data - one request for the entire visible range
    // The worker will return pre-decimated min/max data (one entry per pixel)
    this.waveformRequestId++
    const requestId = this.waveformRequestId
    
    this.waveformPendingRequest = {
      cacheKey,
      requestId,
      startSample,
      endSample,
      width
    }
    
    this.waveformWorker.postMessage({
      type: 'render',
      startSample,
      endSample,
      outputWidth: width,
      sampleRate,
      requestId
    })

    // Draw with whatever data we have while waiting
    this.drawWaveform()
  }

  onWaveformDataGenerated(data) {
    const { minMaxData, startSample, endSample, outputWidth, requestId } = data
    
    // Only use if this is the current request (ignore stale responses)
    if (!this.waveformPendingRequest || this.waveformPendingRequest.requestId !== requestId) {
      return
    }
    
    const cacheKey = this.waveformPendingRequest.cacheKey
    
    this.waveformCache.set(cacheKey, {
      data: minMaxData,
      startSample,
      endSample,
      width: outputWidth
    })
    
    this.waveformPendingRequest = null
    
    // Limit cache size (keep last 10 views for quick back/forth)
    if (this.waveformCache.size > 10) {
      const firstKey = this.waveformCache.keys().next().value
      this.waveformCache.delete(firstKey)
    }
    
    this.drawWaveform()
  }

  drawWaveform() {
    if (!this.waveformCanvas || !this.waveformCtx) return

    const canvas = this.waveformCanvas
    const ctx = this.waveformCtx
    const width = canvas.width
    const height = canvas.height
    const midY = height / 2

    const startTime = this.waveformOffset
    const endTime = startTime + this.waveformZoom
    const sampleRate = this.waveformSampleRate

    const startSample = Math.floor(startTime * sampleRate)
    const endSample = Math.ceil(endTime * sampleRate)

    // Clear
    ctx.fillStyle = '#1e1e1e'
    ctx.fillRect(0, 0, width, height)

    // Draw center line
    ctx.strokeStyle = '#3c3c3c'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, midY)
    ctx.lineTo(width, midY)
    ctx.stroke()

    // Draw time markers
    this.drawTimeMarkers(ctx, width, height, startTime, endTime)

    // Find matching cache entry
    const cacheKey = `${startSample}-${endSample}-${width}`
    const cached = this.waveformCache.get(cacheKey)
    
    if (cached && cached.data) {
      // Draw from pre-computed min/max data
      // Data format: 4 floats per column (minL, maxL, minR, maxR)
      const data = cached.data
      
      for (let x = 0; x < width && x < cached.width; x++) {
        const minL = data[x * 4]
        const maxL = data[x * 4 + 1]
        const minR = data[x * 4 + 2]
        const maxR = data[x * 4 + 3]

        // Draw left channel (red)
        const y1L = midY - maxL * (midY - 10)
        const y2L = midY - minL * (midY - 10)
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + 0.5, y1L)
        ctx.lineTo(x + 0.5, y2L)
        ctx.stroke()

        // Draw right channel (green)
        const y1R = midY - maxR * (midY - 10)
        const y2R = midY - minR * (midY - 10)
        ctx.strokeStyle = 'rgba(80, 255, 80, 0.8)'
        ctx.beginPath()
        ctx.moveTo(x + 0.5, y1R)
        ctx.lineTo(x + 0.5, y2R)
        ctx.stroke()
      }
    } else if (this.waveformWorkerError) {
      // Show error state
      ctx.fillStyle = '#f44747'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Shader error - fix code to update waveform', width / 2, midY)
    } else if (this.waveformPendingRequest) {
      // Show loading state
      ctx.fillStyle = '#808080'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Generating waveform...', width / 2, midY)
    }

    // Draw playhead if running
    if (this.isRunning) {
      const currentTime = this.getCurrentTime()
      if (currentTime >= startTime && currentTime <= endTime) {
        const x = ((currentTime - startTime) / this.waveformZoom) * width
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    }
  }

  drawTimeMarkers(ctx, width, height, startTime, endTime) {
    const duration = endTime - startTime
    
    // Determine appropriate interval
    let interval
    if (duration <= 0.1) interval = 0.01
    else if (duration <= 0.5) interval = 0.05
    else if (duration <= 1) interval = 0.1
    else if (duration <= 5) interval = 0.5
    else if (duration <= 10) interval = 1
    else if (duration <= 30) interval = 5
    else interval = 10

    ctx.strokeStyle = '#4a4a4a'
    ctx.fillStyle = '#808080'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.lineWidth = 1

    const firstMark = Math.ceil(startTime / interval) * interval

    for (let t = firstMark; t <= endTime; t += interval) {
      const x = ((t - startTime) / duration) * width
      
      // Draw line
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      // Draw label
      const label = t < 1 ? `${(t * 1000).toFixed(0)}ms` : `${t.toFixed(1)}s`
      ctx.fillText(label, x, height - 5)
    }
  }

  start() {
    if (this.isRunning) return

    this.isRunning = true
    this.audioContext.resume()

    const now = this.audioContext.currentTime
    this.scheduledUntil = now
    this.sampleOffset = 0
    
    // Start waveform animation
    this.animateWaveform()
  }

  animateWaveform() {
    if (!this.isRunning) return
    this.drawWaveform()
    requestAnimationFrame(() => this.animateWaveform())
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
    
    this.drawWaveform()
  }
  
  restart() {
    const wasRunning = this.isRunning
    this.stop()
    if (wasRunning) {
      this.start()
    }
  }
  
  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume))
    }
  }
  
  getCurrentTime() {
    return this.sampleOffset / this.audioContext.sampleRate
  }

  dispose() {
    this.stop()
    if (this.renderWorker) {
      this.renderWorker.terminate()
    }
    if (this.waveformWorker) {
      this.waveformWorker.terminate()
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
  }
}

