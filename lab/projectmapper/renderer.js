// ===================== DRAWING =====================
function redrawAll() {
    ProjectMapperState.svgLayer.innerHTML = '';
    ProjectMapperState.svgLayerTop.innerHTML = '';

    // Draw hierarchy lines
    for (const link of ProjectMapperState.state.links) {
        if (link.type === 'hierarchy') {
            const fromNode = ProjectMapperState.state.nodes.find(n => n.id === link.from);
            const toNode = ProjectMapperState.state.nodes.find(n => n.id === link.to);
            if (fromNode && toNode && !toNode.container) {
                drawHierarchyLine(fromNode, toNode);
            }
        }
    }

    // Draw call lines based on selection
    if (window.selectedFunction) {
        // selectedFunction can be a function node or a file node
        const isFileNode = window.selectedFunction.type !== 'function';

        for (const link of ProjectMapperState.state.links) {
            if (link.type === 'call') {
                const fromNode = ProjectMapperState.state.nodes.find(n => n.id === link.from);
                const toNode = ProjectMapperState.state.nodes.find(n => n.id === link.to);

                if (!fromNode || !toNode) continue;

                let isOutgoing = false;
                let isIncoming = false;

                if (isFileNode) {
                    // File node selected - show all calls to/from functions in this file
                    const selectedFileId = window.selectedFunction.id;

                    // Outgoing: this file's functions call other functions
                    if (fromNode.id === selectedFileId ||
                        (fromNode.container && fromNode.container.id === selectedFileId)) {
                        isOutgoing = true;
                    }

                    // Incoming: other functions call this file's functions
                    if (toNode.container && toNode.container.id === selectedFileId) {
                        isIncoming = true;
                    }
                } else {
                    // Individual function selected
                    const funcId = window.selectedFunction.id;

                    // Outgoing: this function calls another (fromNode is selected function)
                    if (fromNode.id === funcId) {
                        isOutgoing = true;
                    }

                    // Incoming: another function calls this one (toNode is selected function)
                    if (toNode.id === funcId) {
                        isIncoming = true;
                    }
                }

                if (isOutgoing) {
                    drawCallLine(fromNode, toNode, true); // Green - outgoing
                }
                if (isIncoming) {
                    drawCallLine(fromNode, toNode, false); // Pink - incoming
                }
            }
        }
    }
}

function drawHierarchyLine(from, to) {
    const rect = ProjectMapperState.canvasArea.getBoundingClientRect();
    const fromRect = from.element.getBoundingClientRect();
    const toRect = to.element.getBoundingClientRect();

    // Get screen positions and convert to canvas space
    const x1 = fromRect.right - rect.left;
    const y1 = fromRect.top - rect.top + fromRect.height / 2;
    const x2 = toRect.left - rect.left;
    const y2 = toRect.top - rect.top + toRect.height / 2;

    const midX = (x1 + x2) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
    path.classList.add('hierarchy-line');
    ProjectMapperState.svgLayer.appendChild(path);
}

function drawCallLine(from, to, isOutgoing = true) {
    const rect = ProjectMapperState.canvasArea.getBoundingClientRect();

    const fromEl = from.element;
    const toEl = to.element;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Get screen positions
    const x1 = fromRect.left - rect.left + fromRect.width / 2;
    const y1 = fromRect.top - rect.top + fromRect.height / 2;
    const x2 = toRect.left - rect.left + toRect.width / 2;
    const y2 = toRect.top - rect.top + toRect.height / 2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const perpX = -dy / dist;
    const perpY = dx / dist;
    const curveAmount = Math.min(dist * 0.2, 30);
    const mx = (x1 + x2) / 2 + perpX * curveAmount;
    const my = (y1 + y2) / 2 + perpY * curveAmount;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my}, ${x2} ${y2}`);
    path.classList.add('call-line');
    if (!isOutgoing) path.classList.add('incoming');
    ProjectMapperState.svgLayerTop.appendChild(path);

    // Draw arrow at end
    const arrowSize = 8;
    // Calculate direction at end of curve
    const t = 0.95;
    const endX = (1-t)*(1-t)*x1 + 2*(1-t)*t*mx + t*t*x2;
    const endY = (1-t)*(1-t)*y1 + 2*(1-t)*t*my + t*t*y2;
    const dirX = (x2 - mx) / Math.hypot(x2 - mx, y2 - my);
    const dirY = (y2 - my) / Math.hypot(x2 - mx, y2 - my);

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const ax = x2;
    const ay = y2;
    const p1x = ax - dirX * arrowSize - dirY * arrowSize * 0.5;
    const p1y = ay - dirY * arrowSize + dirX * arrowSize * 0.5;
    const p2x = ax - dirX * arrowSize + dirY * arrowSize * 0.5;
    const p2y = ay - dirY * arrowSize - dirX * arrowSize * 0.5;

    arrow.setAttribute('points', `${ax},${ay} ${p1x},${p1y} ${p2x},${p2y}`);
    arrow.classList.add('call-arrow');
    if (!isOutgoing) arrow.classList.add('incoming');
    ProjectMapperState.svgLayerTop.appendChild(arrow);
}

// Export renderer functions
window.ProjectMapperRenderer = {
    redrawAll,
    drawHierarchyLine,
    drawCallLine
};