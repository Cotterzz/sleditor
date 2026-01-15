import { CanvasManager } from './canvas-manager.js';
import { ShaderCompiler } from './shader-compiler.js';
import { BrushEngine } from './brush-engine.js';
import { UIController } from './ui-controller.js';
import { defaultShaders } from '../shaders/default-shaders.js';

class ShaderPaintApp {
    constructor() {
        this.canvas = document.getElementById('paintCanvas');
        this.gl = this.canvas.getContext('webgl', {
            preserveDrawingBuffer: true,
            premultipliedAlpha: false
        });

        if (!this.gl) {
            alert('WebGL not supported!');
            return;
        }

        // Initialize modules
        this.shaderCompiler = new ShaderCompiler(this.gl);
        this.canvasManager = new CanvasManager(this.gl, this.canvas);
        this.brushEngine = new BrushEngine(this.gl, this.canvasManager, this.shaderCompiler);
        this.ui = new UIController(this);

        // State
        this.shaders = { ...defaultShaders };
        this.currentShader = 'solidBrush';
        this.brushSize = 50;
        this.fgColor = [1, 1, 1];
        this.bgColor = [0, 0, 0];
        this.isDrawing = false;
        this.lastPos = null;

        this.init();
    }

    init() {
        // Initialize canvas with background color
        this.canvasManager.clear(this.bgColor);

        // Load initial shader
        this.loadShader(this.currentShader);

        // Setup event listeners
        this.setupCanvasEvents();
        this.ui.init();

        // Start render loop
        this.render();
    }

    loadShader(name) {
        const shaderCode = this.shaders[name];
        if (!shaderCode) return false;

        const result = this.brushEngine.setShader(shaderCode);
        if (result.success) {
            this.currentShader = name;
            this.ui.updateShaderCode(shaderCode);
            this.ui.hideError();
        } else {
            this.ui.showError(result.error);
        }
        return result.success;
    }

    compileCustomShader(code) {
        const result = this.brushEngine.setShader(code);
        if (result.success) {
            this.shaders['custom'] = code;
            this.currentShader = 'custom';
            this.ui.hideError();
        } else {
            this.ui.showError(result.error);
        }
        return result;
    }

    setupCanvasEvents() {
        const canvas = this.canvas;
        const container = canvas.parentElement;

        // Mouse events
        canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
        canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
        canvas.addEventListener('mouseup', () => this.onPointerUp());
        canvas.addEventListener('mouseleave', () => this.onPointerUp());

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onPointerDown(e.touches[0]);
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onPointerMove(e.touches[0]);
        });
        canvas.addEventListener('touchend', () => this.onPointerUp());

        // Brush preview
        container.addEventListener('mousemove', (e) => {
            this.ui.updateBrushPreview(e.clientX, e.clientY, this.brushSize);
        });
    }

    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    onPointerDown(e) {
        this.isDrawing = true;
        const pos = this.getCanvasCoords(e);
        this.lastPos = pos;
        this.applyBrush(pos.x, pos.y);
    }

    onPointerMove(e) {
        if (!this.isDrawing) return;

        const pos = this.getCanvasCoords(e);
        
        // Interpolate between last position and current for smooth strokes
        if (this.lastPos) {
            const dx = pos.x - this.lastPos.x;
            const dy = pos.y - this.lastPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const step = Math.max(2, this.brushSize / 8);

            if (dist > step) {
                const steps = Math.ceil(dist / step);
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const x = this.lastPos.x + dx * t;
                    const y = this.lastPos.y + dy * t;
                    this.applyBrush(x, y);
                }
            }
        }

        this.lastPos = pos;
    }

    onPointerUp() {
        this.isDrawing = false;
        this.lastPos = null;
    }

    applyBrush(x, y) {
        this.brushEngine.apply({
            x: x,
            y: this.canvas.height - y, // Flip Y for WebGL
            size: this.brushSize,
            fgColor: this.fgColor,
            bgColor: this.bgColor,
            time: performance.now() / 1000,
            pressure: 1.0
        });
    }

    clearCanvas() {
        this.canvasManager.clear(this.bgColor);
    }

    saveImage() {
        const link = document.createElement('a');
        link.download = 'shader-paint.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    render() {
        // Main render loop (for any animations/updates)
        requestAnimationFrame(() => this.render());
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ShaderPaintApp();
});