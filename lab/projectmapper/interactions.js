// ===================== PAN & ZOOM STATE =====================
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;

// Selected function for showing connections
window.selectedFunction = null;

// ===================== INTERACTION FUNCTIONS =====================
function onNodeMouseDown(e, node) {
    if (e.button !== 0) return;
    e.stopPropagation();

    ProjectMapperState.state.isDragging = true;
    ProjectMapperState.state.draggedNode = node;

    // Calculate drag offset accounting for zoom
    const rect = node.element.getBoundingClientRect();
    ProjectMapperState.state.dragOffset = {
        x: (e.clientX - rect.left) / zoomLevel,
        y: (e.clientY - rect.top) / zoomLevel
    };

    node.element.classList.add('dragging');
    ProjectMapperUI.selectNode(node);
}

function moveNodeWithChildren(node, dx, dy) {
    node.x += dx;
    node.y += dy;
    node.element.style.left = node.x + 'px';
    node.element.style.top = node.y + 'px';

    // Move all children recursively
    for (const child of node.children) {
        moveNodeWithChildren(child, dx, dy);
    }
}

// Update all layer transforms
function updateTransform() {
    const transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    ProjectMapperState.nodeLayer.style.transform = transform;
    ProjectMapperState.nodeLayer.style.transformOrigin = '0 0';
    // SVG layers handled separately in redrawAll
}

// Reset pan and zoom
function resetPan() {
    panOffset = { x: 0, y: 0 };
    zoomLevel = 1;
    updateTransform();
    ProjectMapperRenderer.redrawAll();
}

function updateZoomDisplay() {
    document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
}

// ===================== EVENT LISTENERS =====================
document.addEventListener('mousemove', (e) => {
    // Handle panning
    if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;

        const tempOffset = { x: panOffset.x + dx, y: panOffset.y + dy };
        const transform = `translate(${tempOffset.x}px, ${tempOffset.y}px) scale(${zoomLevel})`;
        ProjectMapperState.nodeLayer.style.transform = transform;
        ProjectMapperState.nodeLayer.style.transformOrigin = '0 0';
        // Redraw lines to match new positions
        ProjectMapperRenderer.redrawAll();
        return;
    }

    if (!ProjectMapperState.state.isDragging || !ProjectMapperState.state.draggedNode) return;

    const node = ProjectMapperState.state.draggedNode;
    if (node.container) return; // Don't drag contained nodes

    const rect = ProjectMapperState.canvasArea.getBoundingClientRect();

    // Account for zoom level in position calculation
    const newX = (e.clientX - rect.left - panOffset.x) / zoomLevel - ProjectMapperState.state.dragOffset.x;
    const newY = (e.clientY - rect.top - panOffset.y) / zoomLevel - ProjectMapperState.state.dragOffset.y;

    const dx = newX - node.x;
    const dy = newY - node.y;

    // Move node and all its children
    moveNodeWithChildren(node, dx, dy);

    ProjectMapperRenderer.redrawAll();
});

document.addEventListener('mouseup', (e) => {
    if (isPanning) {
        panOffset.x += e.clientX - panStart.x;
        panOffset.y += e.clientY - panStart.y;
        isPanning = false;
        ProjectMapperState.canvasArea.style.cursor = 'default';
    }

    if (ProjectMapperState.state.draggedNode) {
        ProjectMapperState.state.draggedNode.element.classList.remove('dragging');
    }
    ProjectMapperState.state.isDragging = false;
    ProjectMapperState.state.draggedNode = null;
});

ProjectMapperState.canvasArea.addEventListener('mousedown', (e) => {
    if (e.target === ProjectMapperState.canvasArea || e.target === ProjectMapperState.nodeLayer ||
        e.target === ProjectMapperState.svgLayer || e.target === ProjectMapperState.svgLayerTop) {

        if (e.button === 0) {
            // Left click on empty space - start panning
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            ProjectMapperState.canvasArea.style.cursor = 'grabbing';
        }

        ProjectMapperUI.selectNode(null);
    }
});

// Zoom handler
ProjectMapperState.canvasArea.addEventListener('wheel', (e) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));

    if (newZoom !== zoomLevel) {
        // Zoom towards mouse position
        const rect = ProjectMapperState.canvasArea.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Adjust pan to zoom towards mouse
        const zoomRatio = newZoom / zoomLevel;
        panOffset.x = mouseX - (mouseX - panOffset.x) * zoomRatio;
        panOffset.y = mouseY - (mouseY - panOffset.y) * zoomRatio;

        zoomLevel = newZoom;
        updateZoomDisplay();
        updateTransform();
        ProjectMapperRenderer.redrawAll();
    }
}, { passive: false });

// ===================== BUTTON HANDLERS =====================
document.getElementById('scanBtn').addEventListener('click', () => {
    // This will be defined in main.js
    scanProject();
});

document.getElementById('autoLayoutBtn').addEventListener('click', () => {
    // This will be defined in main.js
    autoLayout();
});

document.getElementById('resetBtn').addEventListener('click', () => {
    resetPan();
});

document.getElementById('zoomInBtn').addEventListener('click', () => {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 0.1);
    updateZoomDisplay();
    updateTransform();
    ProjectMapperRenderer.redrawAll();
});

document.getElementById('zoomOutBtn').addEventListener('click', () => {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 0.1);
    updateZoomDisplay();
    updateTransform();
    ProjectMapperRenderer.redrawAll();
});

// Export interaction functions
window.ProjectMapperInteractions = {
    onNodeMouseDown,
    moveNodeWithChildren,
    updateTransform,
    resetPan,
    updateZoomDisplay
};