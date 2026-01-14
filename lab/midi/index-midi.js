/**
 * WebGL-based audio shader processor with MIDI support
 * Modified from the original index.js to support MIDI uniforms
 */

export class WebGLAudioShader {
  constructor() {
    this.audioContext = null
    this.isRunning = false
    this.sampleOffset = 0
    this.scheduledUntil = 0
    this.renderWorker = null
    this.shaderCode = null
    this.scheduledSources = []
    this.maxTextureSize = 4096
    this.bufferAheadTime = 0.5
    this.generating = false
    this.gainNode = null
    
    // MIDI state
    this.midiNotes = Array(10).fill(null).map(() => ({
      noteNumber: -1,
      frequency: 0,
      velocity: 0,
      duration: 0
    }))
    this.activeNoteCount = 0
    
    // Waveform visualization
    this.waveformCanvas = null
    this.waveformCtx = null
    this.waveformData = null
    this.waveformSampleRate = 48000
    this.waveformZoom = 1.0  // Duration to display (0.1s to 10s)
    this.waveformWorker = null
    this.waveformWorkerReady = false
    this.waveformWorkerError = null
  }

  async init(shaderCode) {
    this.audioContext = new AudioContext()
    this.waveformSampleRate = this.audioContext.sampleRate
    
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)

    // Create Web Worker for background rendering with MIDI support
    const workerCode = `
      let gl = null;
      let program = null;
      let sampleRateLocation = null;
      let sampleOffsetLocation = null;
      let framebuffer = null;
      let texture = null;
      let maxTextureSize = 4096;
      let currentWidth = 0;
      
      // MIDI uniform locations
      let midiNoteLocations = [];
      let activeNoteCountLocation = null;
      
      // MIDI state
      let midiNotes = Array(10).fill(null).map(() => ({
        noteNumber: -1,
        frequency: 0,
        velocity: 0,
        duration: 0
      }));
      let activeNoteCount = 0;
      
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
        } else if (e.data.type === 'updateMIDI') {
          midiNotes = e.data.midiNotes;
          activeNoteCount = e.data.activeNoteCount;
          updateMIDIUniforms();
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
          
          // MIDI uniforms
          struct MIDINote {
            float noteNumber;
            float frequency;
            float velocity;
            float duration;
          };
          
          uniform MIDINote midiNotes[10];
          uniform int activeNoteCount;
          
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
        activeNoteCountLocation = gl.getUniformLocation(program, 'activeNoteCount');
        
        // Get MIDI note uniform locations
        midiNoteLocations = [];
        for (let i = 0; i < 10; i++) {
          midiNoteLocations.push({
            noteNumber: gl.getUniformLocation(program, \`midiNotes[\${i}].noteNumber\`),
            frequency: gl.getUniformLocation(program, \`midiNotes[\${i}].frequency\`),
            velocity: gl.getUniformLocation(program, \`midiNotes[\${i}].velocity\`),
            duration: gl.getUniformLocation(program, \`midiNotes[\${i}].duration\`)
          });
        }
        
        // Initialize MIDI uniforms with empty state
        updateMIDIUniforms();
        
        self.postMessage({ type: 'ready' });
      }
      
      function updateMIDIUniforms() {
        if (!program || !gl) return;
        
        gl.useProgram(program);
        
        // Update MIDI note uniforms
        for (let i = 0; i < 10; i++) {
          const note = midiNotes[i];
          const locs = midiNoteLocations[i];
          if (locs) {
            gl.uniform1f(locs.noteNumber, note.noteNumber);
            gl.uniform1f(locs.frequency, note.frequency);
            gl.uniform1f(locs.velocity, note.velocity);
            gl.uniform1f(locs.duration, note.duration);
          }
        }
        
        if (activeNoteCountLocation) {
          gl.uniform1i(activeNoteCountLocation, activeNoteCount);
        }
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
        
        updateMIDIUniforms();
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

    const canvas = document.createElement('canvas')
    const offscreen = canvas.transferControlToOffscreen()

    if (shaderCode) {
      await this.setShader(shaderCode, offscreen)
    }

    await this.initWaveformWorker(shaderCode)
    this.generationLoop()

    return this
  }

  async initWaveformWorker(shaderCode) {
    // Waveform worker with MIDI support
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
      
      // MIDI uniforms
      let midiNoteLocations = [];
      let activeNoteCountLocation = null;
      let midiNotes = Array(10).fill(null).map(() => ({
        noteNumber: -1,
        frequency: 0,
        velocity: 0,
        duration: 0
      }));
      let activeNoteCount = 0;
      
      self.onmessage = async (e) => {
        if (e.data.type === 'init') {
          const { canvas, shaderCode } = e.data;
          setupWebGL(canvas, shaderCode);
        } else if (e.data.type === 'render') {
          if (!shaderValid) {
            self.postMessage({ type: 'waveformError', error: 'Shader not valid' });
            return;
          }
          const { startSample, endSample, outputWidth, sampleRate, requestId, midiUniforms } = e.data;
          
          // Update MIDI state from the render request
          if (midiUniforms) {
            midiNotes = midiUniforms.midiNotes || midiNotes;
            activeNoteCount = midiUniforms.activeNoteCount || 0;
          }
          
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
        } else if (e.data.type === 'updateMIDI') {
          midiNotes = e.data.midiNotes;
          activeNoteCount = e.data.activeNoteCount;
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
        
        const fragmentShaderSource = \`#version 300 es
          precision highp float;
          precision highp int;
          
          uniform float iSampleRate;
          uniform int iSampleOffset;
          uniform int iSampleStep;
          
          struct MIDINote {
            float noteNumber;
            float frequency;
            float velocity;
            float duration;
          };
          
          uniform MIDINote midiNotes[10];
          uniform int activeNoteCount;
          
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
        activeNoteCountLocation = gl.getUniformLocation(program, 'activeNoteCount');
        
        midiNoteLocations = [];
        for (let i = 0; i < 10; i++) {
          midiNoteLocations.push({
            noteNumber: gl.getUniformLocation(program, \`midiNotes[\${i}].noteNumber\`),
            frequency: gl.getUniformLocation(program, \`midiNotes[\${i}].frequency\`),
            velocity: gl.getUniformLocation(program, \`midiNotes[\${i}].velocity\`),
            duration: gl.getUniformLocation(program, \`midiNotes[\${i}].duration\`)
          });
        }
        
        const positionLoc = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
        
        // Initialize MIDI uniforms with empty state
        updateMIDIUniforms();
        
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
      
      function updateMIDIUniforms() {
        if (!program || !gl) return;
        
        gl.useProgram(program);
        
        for (let i = 0; i < 10; i++) {
          const note = midiNotes[i];
          const locs = midiNoteLocations[i];
          if (locs) {
            gl.uniform1f(locs.noteNumber, note.noteNumber);
            gl.uniform1f(locs.frequency, note.frequency);
            gl.uniform1f(locs.velocity, note.velocity);
            gl.uniform1f(locs.duration, note.duration);
          }
        }
        
        if (activeNoteCountLocation) {
          gl.uniform1i(activeNoteCountLocation, activeNoteCount);
        }
      }
      
      function generateDecimated(startSample, endSample, outputWidth, sampleRate) {
        const totalSamples = endSample - startSample;
        const OVERSAMPLE = 8;
        const targetRenderSamples = Math.min(outputWidth * OVERSAMPLE, totalSamples, maxTextureSize);
        const sampleStep = Math.max(1, Math.floor(totalSamples / targetRenderSamples));
        const renderWidth = Math.min(Math.ceil(totalSamples / sampleStep), maxTextureSize);
        
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
        
        updateMIDIUniforms();
        gl.uniform1f(sampleRateLocation, sampleRate);
        gl.uniform1i(sampleOffsetLocation, startSample);
        gl.uniform1i(sampleStepLocation, sampleStep);
        
        gl.viewport(0, 0, renderWidth, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        const pixelData = new Float32Array(renderWidth * 4);
        gl.readPixels(0, 0, renderWidth, 1, gl.RGBA, gl.FLOAT, pixelData);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        const result = new Float32Array(outputWidth * 4);
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
        console.error('Waveform worker error:', e.data.error)
        this.waveformWorkerError = e.data.error
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

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve()
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

    if (this.waveformWorker) {
      this.waveformWorkerReady = false
      this.waveformWorkerError = null
      this.waveformWorker.postMessage({
        type: 'updateShader',
        shaderCode
      })
      
      this.waveformCache = new Map()
      this.waveformPendingRequest = null
      
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve()
        }, 2000)
        
        const check = setInterval(() => {
          if (this.waveformWorkerReady) {
            clearInterval(check)
            clearTimeout(timeout)
            resolve()
          }
        }, 10)
      })
      
      if (!this.waveformWorkerError) {
        this.requestWaveformUpdate()
      }
    }

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

  // Waveform methods (keeping core functionality from original)
  waveformCache = new Map()
  waveformPendingRequest = null
  waveformRequestId = 0

  setupWaveformCanvas(canvas) {
    this.waveformCanvas = canvas
    this.waveformCtx = canvas.getContext('2d')
    
    // Zoom with mouse wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 1.5 : 0.667
      
      // Zoom range: 0.01s (10ms) to 10s
      this.waveformZoom = Math.max(0.01, Math.min(10, this.waveformZoom * zoomFactor))
      
      this.requestWaveformUpdate()
    })

    this.requestWaveformUpdate()
  }

  requestWaveformUpdate() {
    if (!this.waveformCanvas || !this.waveformWorkerReady || this.waveformWorkerError) {
      this.drawWaveform()
      return
    }

    const canvas = this.waveformCanvas
    const width = canvas.width
    const sampleRate = this.waveformSampleRate

    // Always render from sample 0 with current MIDI state
    // This shows "what the current notes sound like" regardless of playback position
    const startSample = 0
    const endSample = Math.floor(this.waveformZoom * sampleRate)

    // Cache key includes MIDI state hash to invalidate when notes change
    const midiHash = this.activeNoteCount + '-' + (this.midiNotes[0]?.noteNumber || 0)
    const cacheKey = `${startSample}-${endSample}-${width}-${midiHash}`
    
    if (this.waveformCache.has(cacheKey)) {
      this.drawWaveform()
      return
    }
    
    // Clear old cache when MIDI changes
    if (this.lastMidiHash && this.lastMidiHash !== midiHash) {
      this.waveformCache.clear()
    }
    this.lastMidiHash = midiHash
    
    // Don't request if we already have a pending request
    if (this.waveformPendingRequest) {
      return
    }

    this.waveformRequestId++
    const requestId = this.waveformRequestId
    
    this.waveformPendingRequest = {
      cacheKey,
      requestId,
      startSample,
      endSample,
      width
    }
    
    // Include current MIDI state with the render request!
    const midiUniforms = {
      midiNotes: this.midiNotes,
      activeNoteCount: this.activeNoteCount
    }
    
    this.waveformWorker.postMessage({
      type: 'render',
      startSample,
      endSample,
      outputWidth: width,
      sampleRate,
      requestId,
      midiUniforms  // Send MIDI state with each request
    })

    this.drawWaveform()
  }

  onWaveformDataGenerated(data) {
    const { minMaxData, startSample, endSample, outputWidth, requestId } = data
    
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

    const sampleRate = this.waveformSampleRate
    const startSample = 0
    const endSample = Math.floor(this.waveformZoom * sampleRate)

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

    // Draw time scale info in corner
    const timeLabel = this.waveformZoom < 1 ? 
      `${(this.waveformZoom * 1000).toFixed(0)}ms` : 
      `${this.waveformZoom.toFixed(1)}s`
    ctx.fillStyle = '#808080'
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(timeLabel + ' window', 10, 20)

    const midiHash = this.activeNoteCount + '-' + (this.midiNotes[0]?.noteNumber || 0)
    const cacheKey = `${startSample}-${endSample}-${width}-${midiHash}`
    const cached = this.waveformCache.get(cacheKey)
    
    if (cached && cached.data) {
      const data = cached.data
      
      for (let x = 0; x < width && x < cached.width; x++) {
        const minL = data[x * 4]
        const maxL = data[x * 4 + 1]
        const minR = data[x * 4 + 2]
        const maxR = data[x * 4 + 3]

        const y1L = midY - maxL * (midY - 10)
        const y2L = midY - minL * (midY - 10)
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + 0.5, y1L)
        ctx.lineTo(x + 0.5, y2L)
        ctx.stroke()

        const y1R = midY - maxR * (midY - 10)
        const y2R = midY - minR * (midY - 10)
        ctx.strokeStyle = 'rgba(80, 255, 80, 0.8)'
        ctx.beginPath()
        ctx.moveTo(x + 0.5, y1R)
        ctx.lineTo(x + 0.5, y2R)
        ctx.stroke()
      }
    } else if (this.waveformWorkerError) {
      ctx.fillStyle = '#f44747'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Shader error - fix code to update waveform', width / 2, midY)
    } else if (this.waveformPendingRequest) {
      ctx.fillStyle = '#808080'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Rendering...', width / 2, midY)
    }
  }

  drawTimeMarkers(ctx, width, height, startTime, endTime) {
    const duration = endTime - startTime
    
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
      
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      const label = t < 1 ? `${(t * 1000).toFixed(0)}ms` : `${t.toFixed(1)}s`
      ctx.fillText(label, x, height - 5)
    }
  }

  // Update MIDI state - stores locally and sends to workers
  updateMIDI(midiNotes, activeNoteCount, triggerWaveform = false) {
    this.midiNotes = midiNotes
    this.activeNoteCount = activeNoteCount
    
    // Send to audio worker
    if (this.renderWorker) {
      this.renderWorker.postMessage({
        type: 'updateMIDI',
        midiNotes,
        activeNoteCount
      })
    }
    
    // Only trigger waveform update when explicitly requested (note on/off, not duration changes)
    if (triggerWaveform && this.waveformCanvas) {
      this.requestWaveformUpdate()
    }
  }

  start() {
    if (this.isRunning) return

    this.isRunning = true
    this.audioContext.resume()

    const now = this.audioContext.currentTime
    this.scheduledUntil = now
    this.sampleOffset = 0
    
    this.animateWaveform()
  }

  animateWaveform() {
    if (!this.isRunning) return
    
    // Just redraw - waveform updates are triggered by MIDI changes
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
