// ===================== STATE MANAGEMENT =====================
const state = {
    files: new Map(), // path -> { type, content, parsed, node }
    nodes: [],
    links: [], // { from, to, type: 'hierarchy' | 'call' }
    selectedNode: null,
    isDragging: false,
    draggedNode: null,
    dragOffset: { x: 0, y: 0 }
};

// ===================== DOM REFS =====================
const canvasArea = document.getElementById('canvasArea');
const nodeLayer = document.getElementById('nodeLayer');
const svgLayer = document.getElementById('svgLayer');
const svgLayerTop = document.getElementById('svgLayerTop');
const fileList = document.getElementById('fileList');
const logArea = document.getElementById('logArea');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');

// Export state and DOM references
window.ProjectMapperState = {
    state,
    canvasArea,
    nodeLayer,
    svgLayer,
    svgLayerTop,
    fileList,
    logArea,
    loading,
    loadingText
};