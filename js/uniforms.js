// ============================================================================
// Uniform Management - Abstraction for WebGPU and WebGL
// ============================================================================

import { state, UNIFORM_STRUCT } from './core.js';

/**
 * Unified uniform builder that works for both backends
 * Builds a uniform data structure that can be consumed by either:
 * - WebGPU: writeBuffer with ArrayBuffer
 * - WebGL: individual uniform calls
 */
export class UniformBuilder {
    constructor() {
        // Common data structure (works for both backends)
        this.data = {
            time: 0,
            audioCurrentTime: 0,
            audioPlayTime: 0,
            audioFractTime: 0,
            audioFrame: 0,
            resolution: [0, 0],
            mouseDrag: [0, 0],
            mouseClick: [0, 0],
            mouseHover: [0, 0],
            pixel: 1,
            date: [0, 0, 0, 0],
        };
        
        // Raw buffer for WebGPU (expanded for 85 floats + 10 ints + 5 bools)
        // Layout: [0-6]=built-in, [7-91]=floats(85), [92-101]=ints(10), [102-106]=bools(5)
        this.buffer = new ArrayBuffer(512);
        this.f32 = new Float32Array(this.buffer);
        this.i32 = new Int32Array(this.buffer);
    }
    
    setTime(value) {
        this.data.time = value;
        this.f32[UNIFORM_STRUCT.time] = value;
    }
    
    setAudioTime(current, play, fract) {
        this.data.audioCurrentTime = current;
        this.data.audioPlayTime = play;
        this.data.audioFractTime = fract;
        this.f32[UNIFORM_STRUCT.audioCurrentTime] = current;
        this.f32[UNIFORM_STRUCT.audioPlayTime] = play;
        this.f32[UNIFORM_STRUCT.audioFractTime] = fract;
    }
    
    setAudioFrame(value) {
        this.data.audioFrame = value;
        this.i32[UNIFORM_STRUCT.audioFrame] = value;
    }
    
    setResolution(width, height) {
        this.data.resolution = [width, height];
        // WebGPU doesn't need this (reads from texture size)
    }
    
    setMouseDrag(x = 0, y = 0) {
        this.data.mouseDrag = [x, y];
    }

    setMouseClick(x = 0, y = 0) {
        this.data.mouseClick = [x, y];
    }

    setMouseHover(pixelX = 0, pixelY = 0, normX = 0, normY = 0) {
        this.data.mouseHover = [pixelX, pixelY];
        this.f32[5] = normX;
        this.f32[6] = normY;
    }
    
    setFrame(value) {
        this.data.frame = value;
        // Frame counter isn't in the uniform buffer for WGSL, but GLSL needs it
    }

    setPixelSize(value = 1) {
        const safeValue = Number.isFinite(value) && value > 0 ? value : 1;
        this.data.pixel = safeValue;
    }

    setDate(yearMinusOne, monthMinusOne, day, seconds) {
        this.data.date = [yearMinusOne, monthMinusOne, day, seconds];
    }
    
    /**
     * Apply uniforms to WebGPU backend
     */
    applyWebGPU(device) {
        device.queue.writeBuffer(state.uniformBuffer, 0, this.buffer);
    }
    
    /**
     * Apply uniforms to WebGL backend (GLSL fragment shaders)
     */
    applyWebGL(gl, locations) {
        if (!locations) return;
        
        // Built-in uniforms
        if (locations.u_time) {
            gl.uniform1f(locations.u_time, this.data.time);
        }
        if (locations.u_resolution) {
            gl.uniform2f(locations.u_resolution, 
                this.data.resolution[0], 
                this.data.resolution[1]);
        }
        if (locations.u_mouse) {
            gl.uniform2f(locations.u_mouse, 
                this.data.mouseDrag[0], 
                this.data.mouseDrag[1]);
        }
        if (locations.u_frame) {
            gl.uniform1i(locations.u_frame, this.data.frame || 0);
        }
        if (locations.u_click) {
            gl.uniform2f(locations.u_click, 
                this.data.mouseClick[0], 
                this.data.mouseClick[1]);
        }
        if (locations.u_hover) {
            gl.uniform2f(locations.u_hover, 
                this.data.mouseHover[0], 
                this.data.mouseHover[1]);
        }
        if (locations.u_pixel) {
            gl.uniform1f(locations.u_pixel, this.data.pixel ?? 1.0);
        }
        if (locations.u_date) {
            const d = this.data.date || [0, 0, 0, 0];
            gl.uniform4f(locations.u_date, d[0], d[1], d[2], d[3]);
        }
        
        // Custom uniforms (u_custom0 to u_custom84 map to buffer indices 7-91)
        for (let i = 0; i < 85; i++) {
            const loc = locations[`u_custom${i}`];
            if (loc) {
                gl.uniform1f(loc, this.f32[7 + i]);
            }
        }
        
        // Custom int uniforms (u_customInt0 to u_customInt9 map to buffer indices 92-101)
        for (let i = 0; i < 10; i++) {
            const loc = locations[`u_customInt${i}`];
            if (loc) {
                gl.uniform1i(loc, this.i32[92 + i]);
            }
        }
        
        // Custom bool uniforms (u_customBool0 to u_customBool4 map to buffer indices 102-106)
        for (let i = 0; i < 5; i++) {
            const loc = locations[`u_customBool${i}`];
            if (loc) {
                gl.uniform1i(loc, this.i32[102 + i]);
            }
        }
    }
    
    /**
     * Get raw buffer for WebGPU
     */
    getBuffer() {
        return this.buffer;
    }
    
    /**
     * Get typed arrays for user JS manipulation
     */
    getArrays() {
        return { f32: this.f32, i32: this.i32 };
    }
}

