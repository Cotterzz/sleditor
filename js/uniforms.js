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
            mouse: [0, 0],
        };
        
        // Raw buffer for WebGPU
        this.buffer = new ArrayBuffer(256);
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
    
    setMouse(x, y) {
        this.data.mouse = [x, y];
        // Write to buffer for WGSL (indices 5-6)
        this.f32[5] = x;
        this.f32[6] = y;
    }
    
    setFrame(value) {
        this.data.frame = value;
        // Frame counter isn't in the uniform buffer for WGSL, but GLSL needs it
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
                this.data.mouse[0], 
                this.data.mouse[1]);
        }
        if (locations.u_frame) {
            gl.uniform1i(locations.u_frame, this.data.frame || 0);
        }
        
        // Custom uniforms (u_custom0 to u_custom14 map to buffer indices 7-21)
        for (let i = 0; i < 15; i++) {
            const loc = locations[`u_custom${i}`];
            if (loc) {
                gl.uniform1f(loc, this.f32[7 + i]);
            }
        }
        
        // Custom int uniforms (u_customInt0 to u_customInt2 map to buffer indices 22-24)
        for (let i = 0; i < 3; i++) {
            const loc = locations[`u_customInt${i}`];
            if (loc) {
                gl.uniform1i(loc, this.i32[22 + i]);
            }
        }
        
        // Custom bool uniforms (u_customBool0 to u_customBool1 map to buffer indices 25-26)
        for (let i = 0; i < 2; i++) {
            const loc = locations[`u_customBool${i}`];
            if (loc) {
                gl.uniform1i(loc, this.i32[25 + i]);
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

