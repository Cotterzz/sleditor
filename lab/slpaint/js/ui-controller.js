export class UIController {
    constructor(app) {
        this.app = app;
    }

    init() {
        // Brush size slider
        const brushSize = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        brushSize.addEventListener('input', (e) => {
            this.app.brushSize = parseInt(e.target.value);
            brushSizeValue.textContent = e.target.value;
        });

        // Color pickers
        document.getElementById('fgColor').addEventListener('input', (e) => {
            this.app.fgColor = this.hexToRgb(e.target.value);
        });

        document.getElementById('bgColor').addEventListener('input', (e) => {
            this.app.bgColor = this.hexToRgb(e.target.value);
        });

        // Canvas controls
        document.getElementById('clearCanvas').addEventListener('click', () => {
            this.app.clearCanvas();
        });

        document.getElementById('saveImage').addEventListener('click', () => {
            this.app.saveImage();
        });

        // Shader selector
        document.getElementById('shaderSelect').addEventListener('change', (e) => {
            this.app.loadShader(e.target.value);
        });

        // Add new shader button
        document.getElementById('addShader').addEventListener('click', () => {
            const name = prompt('Enter shader name:');
            if (name) {
                this.app.shaders[name] = this.app.shaders['solidBrush'];
                this.addShaderOption(name);
                document.getElementById('shaderSelect').value = name;
                this.app.loadShader(name);
            }
        });

        // Compile button
        document.getElementById('compileShader').addEventListener('click', () => {
            this.compileCurrentShader();
        });

        // Keyboard shortcut for compile
        document.getElementById('shaderCode').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.compileCurrentShader();
            }
        });
    }

    compileCurrentShader() {
        const code = document.getElementById('shaderCode').value;
        this.app.compileCustomShader(code);
    }

    updateShaderCode(code) {
        document.getElementById('shaderCode').value = code;
    }

    showError(message) {
        const errorDiv = document.getElementById('shaderError');
        errorDiv.textContent = message;
        errorDiv.classList.add('visible');
    }

    hideError() {
        document.getElementById('shaderError').classList.remove('visible');
    }

    addShaderOption(name) {
        const select = document.getElementById('shaderSelect');
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.insertBefore(option, select.lastElementChild);
    }

    updateBrushPreview(x, y, size) {
        const preview = document.getElementById('brushPreview');
        preview.style.left = x + 'px';
        preview.style.top = y + 'px';
        preview.style.width = size + 'px';
        preview.style.height = size + 'px';
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [1, 1, 1];
    }
}