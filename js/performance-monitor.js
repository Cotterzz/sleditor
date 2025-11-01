// ============================================================================
// Performance Monitor
// Real-time performance statistics with visual timeline
// ============================================================================

import { state } from './core.js';

// ============================================================================
// Configuration
// ============================================================================

const SAMPLE_INTERVAL = 200; // Sample every 200ms (5 samples/sec)
const HISTORY_DURATION = 60000; // Keep 60 seconds of history
const MAX_SAMPLES = Math.ceil(HISTORY_DURATION / SAMPLE_INTERVAL); // 300 samples

const STATS_CONFIG = {
    fps: {
        label: 'FPS',
        color: '#00ff00',
        max: 60, // Will adjust to refresh rate
        unit: '',
        type: 'linear'
    },
    frameTime: {
        label: 'Frame',
        color: '#0088ff',
        max: 16.67, // ms for 60fps
        unit: 'ms',
        type: 'linear'
    },
    jsTime: {
        label: 'JS',
        color: '#aa00ff',
        max: 16.67, // ms for 60fps
        unit: 'ms',
        type: 'linear'
    },
    memory: {
        label: 'Memory',
        color: '#ff8800',
        max: 100, // Will be set to heap limit
        unit: 'MB',
        type: 'linear',
        available: false
    },
    netRequests: {
        label: 'Net Req',
        color: '#00ffff',
        max: 10, // Logarithmic scale
        unit: '',
        type: 'logarithmic'
    },
    netSize: {
        label: 'Net Size',
        color: '#ffff00',
        max: 1, // MB, adaptive
        unit: 'KB',
        type: 'linear'
    },
    netBandwidth: {
        label: 'Net BW',
        color: '#ff00ff',
        max: 1, // MB/s, adaptive
        unit: 'KB/s',
        type: 'linear'
    },
    wsMessages: {
        label: 'WS Msgs',
        color: '#00ffaa',
        max: 10, // Logarithmic scale
        unit: '',
        type: 'logarithmic'
    }
};

// ============================================================================
// State
// ============================================================================

const perfState = {
    isActive: false,
    lastSampleTime: 0,
    lastFrameTime: 0,
    frameStartTime: 0,
    
    // Current frame measurements
    currentFPS: 0,
    currentFrameTime: 0,
    currentJSTime: 0,
    
    // Counters
    wsMessageCount: 0,
    lastNetworkResourceCount: 0,
    networkBytesWindow: [], // Sliding window for bandwidth calculation
    
    // History buffers (circular)
    history: {},
    historyIndex: 0,
    
    // UI elements
    panel: null,
    statSquares: {},
    timelineCanvases: {},
    miniCanvas: null
};

// Initialize history buffers
Object.keys(STATS_CONFIG).forEach(key => {
    perfState.history[key] = new Array(MAX_SAMPLES).fill(0);
});

// ============================================================================
// Initialization
// ============================================================================

export function init() {
    // Check for memory API availability
    if (performance.memory) {
        STATS_CONFIG.memory.available = true;
        STATS_CONFIG.memory.max = performance.memory.jsHeapSizeLimit / (1024 * 1024); // Convert to MB
    }
    
    // Adjust FPS max to refresh rate if available
    if (window.screen?.availWidth) {
        const refreshRate = window.screen.refreshRate || 60;
        STATS_CONFIG.fps.max = refreshRate;
        STATS_CONFIG.frameTime.max = 1000 / refreshRate;
        STATS_CONFIG.jsTime.max = 1000 / refreshRate;
    }
    
    console.log('✓ Performance monitor initialized');
}

// ============================================================================
// UI Creation
// ============================================================================

export function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'perfMonitorPanel';
    panel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px;
        z-index: 10000;
        display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: monospace;
        font-size: 11px;
        max-height: calc(100vh - 100px);
        overflow-y: auto;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Performance Monitor';
    title.style.cssText = `
        font-weight: bold;
        margin-bottom: 12px;
        font-size: 13px;
        color: var(--text-primary);
    `;
    panel.appendChild(title);
    
    // Create stats container
    const statsContainer = document.createElement('div');
    statsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    
    Object.entries(STATS_CONFIG).forEach(([key, config]) => {
        const statRow = document.createElement('div');
        statRow.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
        
        // Label and current value
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        
        const label = document.createElement('span');
        label.textContent = config.label;
        label.style.color = config.color;
        header.appendChild(label);
        
        const value = document.createElement('span');
        value.id = `perfValue-${key}`;
        value.style.cssText = 'color: var(--text-secondary);';
        value.textContent = config.available === false ? 'N/A' : '0';
        header.appendChild(value);
        
        statRow.appendChild(header);
        
        // Current stat square
        const square = document.createElement('div');
        square.style.cssText = `
            width: 24px;
            height: 24px;
            background: ${config.available === false ? '#333' : '#000'};
            border: 1px solid ${config.color};
            border-radius: 3px;
            margin-bottom: 4px;
        `;
        perfState.statSquares[key] = square;
        statRow.appendChild(square);
        
        // Timeline canvas
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 24;
        canvas.style.cssText = `
            width: 300px;
            height: 24px;
            border: 1px solid ${config.color};
            border-radius: 3px;
            background: #000;
        `;
        perfState.timelineCanvases[key] = canvas;
        statRow.appendChild(canvas);
        
        statsContainer.appendChild(statRow);
    });
    
    panel.appendChild(statsContainer);
    document.body.appendChild(panel);
    perfState.panel = panel;
    
    return panel;
}

export function createMiniVisualization() {
    const canvas = document.createElement('canvas');
    canvas.width = 300; // 1:1 with MAX_SAMPLES for no aliasing
    canvas.height = 24; // 8 stats × 3 pixels
    canvas.style.cssText = `
        width: 300px;
        height: 24px;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        vertical-align: middle;
        margin-left: 8px;
    `;
    perfState.miniCanvas = canvas;
    
    // Start sampling immediately for mini visualization
    perfState.isActive = true;
    perfState.lastSampleTime = performance.now();
    startSampling();
    
    return canvas;
}

export function togglePanel() {
    if (!perfState.panel) {
        createPanel();
    }
    
    const isVisible = perfState.panel.style.display !== 'none';
    perfState.panel.style.display = isVisible ? 'none' : 'block';
}

// ============================================================================
// Measurement Functions
// ============================================================================

export function markFrameStart() {
    perfState.frameStartTime = performance.now();
}

export function markFrameEnd() {
    if (!perfState.frameStartTime) return;
    
    const now = performance.now();
    const frameTime = now - perfState.frameStartTime;
    
    perfState.currentFrameTime = frameTime;
    perfState.lastFrameTime = now;
}

export function markJSStart() {
    perfState.jsStartTime = performance.now();
}

export function markJSEnd() {
    if (!perfState.jsStartTime) return;
    
    const jsTime = performance.now() - perfState.jsStartTime;
    perfState.currentJSTime = jsTime;
}

export function countWebSocketMessage() {
    perfState.wsMessageCount++;
}

// ============================================================================
// Sampling & Data Collection
// ============================================================================

function startSampling() {
    if (!perfState.isActive) return;
    
    const now = performance.now();
    const elapsed = now - perfState.lastSampleTime;
    
    if (elapsed >= SAMPLE_INTERVAL) {
        collectSample();
        perfState.lastSampleTime = now;
    }
    
    requestAnimationFrame(startSampling);
}

function collectSample() {
    const samples = {};
    
    // FPS (from state)
    samples.fps = Math.round(state.fps || 0);
    
    // Frame Time
    samples.frameTime = perfState.currentFrameTime;
    
    // JS Time
    samples.jsTime = perfState.currentJSTime;
    
    // Memory (if available)
    if (STATS_CONFIG.memory.available && performance.memory) {
        samples.memory = performance.memory.usedJSHeapSize / (1024 * 1024); // MB
    } else {
        samples.memory = 0;
    }
    
    // Network Stats
    const netStats = collectNetworkStats();
    samples.netRequests = netStats.requests;
    samples.netSize = netStats.size;
    samples.netBandwidth = netStats.bandwidth;
    
    // WebSocket Messages (count since last sample)
    samples.wsMessages = perfState.wsMessageCount;
    perfState.wsMessageCount = 0; // Reset counter
    
    // Store in history
    Object.keys(samples).forEach(key => {
        perfState.history[key][perfState.historyIndex] = samples[key];
    });
    
    perfState.historyIndex = (perfState.historyIndex + 1) % MAX_SAMPLES;
    
    // Update UI
    updateUI(samples);
}

function collectNetworkStats() {
    const resources = performance.getEntriesByType('resource');
    const newResourceCount = resources.length;
    const newResources = resources.slice(perfState.lastNetworkResourceCount);
    perfState.lastNetworkResourceCount = newResourceCount;
    
    // Count and size of new requests
    const requests = newResources.length;
    const size = newResources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024; // KB
    
    // Bandwidth calculation (rolling window)
    const now = performance.now();
    perfState.networkBytesWindow.push({ time: now, bytes: size * 1024 });
    
    // Remove entries older than 1 second
    perfState.networkBytesWindow = perfState.networkBytesWindow.filter(
        entry => now - entry.time < 1000
    );
    
    const totalBytes = perfState.networkBytesWindow.reduce((sum, entry) => sum + entry.bytes, 0);
    const bandwidth = totalBytes / 1024; // KB/s
    
    // Update adaptive maxes
    if (size > STATS_CONFIG.netSize.max * 0.8) {
        STATS_CONFIG.netSize.max = Math.ceil(size * 1.5);
    }
    if (bandwidth > STATS_CONFIG.netBandwidth.max * 0.8) {
        STATS_CONFIG.netBandwidth.max = Math.ceil(bandwidth * 1.5);
    }
    
    return { requests, size, bandwidth };
}

// ============================================================================
// UI Update
// ============================================================================

function updateUI(samples) {
    Object.entries(samples).forEach(([key, value]) => {
        const config = STATS_CONFIG[key];
        if (!config) return;
        
        // Skip unavailable stats
        if (config.available === false) return;
        
        // Calculate percentage with special scaling
        let percentage = calculatePercentage(key, value, config);
        
        // Update value display
        const valueEl = document.getElementById(`perfValue-${key}`);
        if (valueEl) {
            let displayValue = value;
            if (config.unit === 'ms' || config.unit === 'KB' || config.unit === 'KB/s' || config.unit === 'MB') {
                displayValue = value.toFixed(1);
            } else {
                displayValue = Math.round(value);
            }
            valueEl.textContent = `${displayValue}${config.unit}`;
        }
        
        // Update square color
        const square = perfState.statSquares[key];
        if (square) {
            square.style.background = getColorForPercentage(config.color, percentage);
        }
        
        // Update timeline
        const canvas = perfState.timelineCanvases[key];
        if (canvas) {
            drawTimeline(canvas, key, config);
        }
    });
    
    // Update mini visualization
    if (perfState.miniCanvas) {
        drawMiniVisualization();
    }
}

function calculatePercentage(key, value, config) {
    // Special handling for FPS (inverted)
    if (key === 'fps') {
        // 60fps = 0%, 0fps = 100% (so dropped frames are visible)
        return Math.min(100, Math.max(0, 100 - (value / config.max) * 100));
    }
    
    // Logarithmic scale for small numbers (network, websocket)
    if (config.type === 'logarithmic') {
        if (value === 0) return 0;
        return Math.min(100, (Math.log10(value + 1) / Math.log10(config.max + 1)) * 100);
    }
    
    // Tanh scale for frame time, JS time, and memory (makes small values more visible)
    if (key === 'frameTime' || key === 'jsTime' || key === 'memory') {
        // Use tanh to compress the scale: small values become more visible
        // tanh(x) ranges from 0 to ~1, we scale input to make it sensitive
        const normalized = value / config.max;
        const scaled = Math.tanh(normalized * 5); // Scale factor of 5 for sensitivity
        return Math.min(100, scaled * 100);
    }
    
    // Linear scale (default)
    return Math.min(100, (value / config.max) * 100);
}

function getColorForPercentage(baseColor, percentage) {
    if (percentage === 0) return '#000000';
    
    // Parse base color (hex)
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    let finalR, finalG, finalB;
    
    if (percentage <= 50) {
        // 0-50%: Black → Full Color
        const factor = percentage / 50;
        finalR = Math.round(r * factor);
        finalG = Math.round(g * factor);
        finalB = Math.round(b * factor);
    } else {
        // 50-100%: Full Color → Washed Out (add white)
        const factor = (percentage - 50) / 50;
        finalR = Math.round(r + (255 - r) * factor);
        finalG = Math.round(g + (255 - g) * factor);
        finalB = Math.round(b + (255 - b) * factor);
    }
    
    return `rgb(${finalR}, ${finalG}, ${finalB})`;
}

function drawTimeline(canvas, key, config) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Get history data (in chronological order)
    const history = perfState.history[key];
    const startIndex = perfState.historyIndex;
    
    // Draw each sample as a vertical line
    for (let i = 0; i < MAX_SAMPLES; i++) {
        const dataIndex = (startIndex + i) % MAX_SAMPLES;
        const value = history[dataIndex];
        
        if (value === 0) continue;
        
        // Calculate percentage using new scaling function
        const percentage = calculatePercentage(key, value, config);
        
        // X position (left = oldest, right = newest)
        const x = Math.floor((i / MAX_SAMPLES) * width);
        
        // Y position and height (bottom-up bar)
        const barHeight = Math.floor((percentage / 100) * height);
        const y = height - barHeight;
        
        // Color
        ctx.fillStyle = getColorForPercentage(config.color, percentage);
        ctx.fillRect(x, y, Math.ceil(width / MAX_SAMPLES) + 1, barHeight);
    }
}

function drawMiniVisualization() {
    if (!perfState.miniCanvas) return;
    
    const canvas = perfState.miniCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width; // 300px
    const height = canvas.height; // 24px (8 stats × 3px)
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    const statKeys = Object.keys(STATS_CONFIG);
    const startIndex = perfState.historyIndex;
    
    // Draw each stat row (3 pixels tall)
    statKeys.forEach((key, statIndex) => {
        const config = STATS_CONFIG[key];
        if (config.available === false) {
            // Draw dark grey for unavailable stats
            ctx.fillStyle = '#333333';
            ctx.fillRect(0, statIndex * 3, width, 3);
            return;
        }
        
        const history = perfState.history[key];
        const y = statIndex * 3;
        
        // Draw 3px square for current value
        const currentValue = history[(startIndex - 1 + MAX_SAMPLES) % MAX_SAMPLES];
        const currentPercentage = calculatePercentage(key, currentValue, config);
        ctx.fillStyle = getColorForPercentage(config.color, currentPercentage);
        ctx.fillRect(0, y, 3, 3);
        
        // Draw horizontal history (1:1 pixel mapping, no aliasing)
        const historyWidth = width - 3; // 297 pixels
        
        for (let x = 0; x < historyWidth; x++) {
            // 1:1 mapping: each pixel = one sample
            const dataIndex = (startIndex - x - 2 + MAX_SAMPLES) % MAX_SAMPLES;
            const value = history[dataIndex];
            
            if (value === 0) continue;
            
            const percentage = calculatePercentage(key, value, config);
            ctx.fillStyle = getColorForPercentage(config.color, percentage);
            
            // Draw 1px wide, 3px tall column
            ctx.fillRect(3 + x, y, 1, 3);
        }
    });
}

// ============================================================================
// Public API
// ============================================================================

export const perfMonitor = {
    init,
    createMiniVisualization,
    togglePanel,
    markFrameStart,
    markFrameEnd,
    markJSStart,
    markJSEnd,
    countWebSocketMessage
};

