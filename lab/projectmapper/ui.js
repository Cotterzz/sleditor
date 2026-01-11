// ===================== UI UPDATES =====================
function updateFileList() {
    ProjectMapperState.fileList.innerHTML = '';

    for (const [path, data] of ProjectMapperState.state.files) {
        const item = document.createElement('div');
        item.className = `file-item ${data.type} ${data.isExternal ? 'external' : ''}`;

        const icons = { html: '📄', css: '🎨', js: '⚡', other: '📦' };

        item.innerHTML = `
            <span class="icon">${data.isExternal ? '🔗' : icons[data.type] || '📦'}</span>
            <span class="name">${ProjectMapperUtils.getFileName(path)}</span>
            <span class="status ${data.parsed ? 'parsed' : 'pending'}">${data.parsed ? '✓' : '...'}</span>
        `;

        item.addEventListener('click', () => {
            selectNode(data.node);
            // Center on node
            // TODO: pan canvas to node
        });

        ProjectMapperState.fileList.appendChild(item);
    }
}

function updateStats() {
    document.getElementById('statFiles').textContent = ProjectMapperState.state.files.size;
    document.getElementById('statFunctions').textContent =
        ProjectMapperState.state.nodes.filter(n => n.type === 'function').length;
    document.getElementById('statDeps').textContent =
        ProjectMapperState.state.links.filter(l => l.type === 'hierarchy').length;
    document.getElementById('statCalls').textContent =
        ProjectMapperState.state.links.filter(l => l.type === 'call').length;
}

function selectNode(node) {
    if (ProjectMapperState.state.selectedNode) {
        ProjectMapperState.state.selectedNode.element.classList.remove('selected');
    }
    ProjectMapperState.state.selectedNode = node;

    // Track selected node for showing call connections
    // Can be a function OR a file node (js type)
    if (node && (node.type === 'function' || node.type === 'js')) {
        window.selectedFunction = node;
    } else {
        window.selectedFunction = null;
    }

    if (node) {
        node.element.classList.add('selected');
        showNodeInfo(node);
    } else {
        document.getElementById('selectedInfo').style.display = 'none';
    }

    redrawAll();
}

function showNodeInfo(node) {
    const container = document.getElementById('selectedInfo');
    const details = document.getElementById('selectedDetails');

    container.style.display = 'block';

    let html = `
        <div class="info-item">
            <span class="label">Type:</span>
            <span class="value">${node.type}${node.data.isExternal ? ' (CDN)' : ''}</span>
        </div>
        <div class="info-item">
            <span class="label">Name:</span>
            <span class="value">${node.label}</span>
        </div>
    `;

    if (node.data.path) {
        const displayPath = node.data.path.length > 40
            ? '...' + node.data.path.slice(-37)
            : node.data.path;
        html += `
            <div class="info-item">
                <span class="label">Path:</span>
                <span class="value" title="${node.data.path}">${displayPath}</span>
            </div>
        `;
    }

    if (node.data.functions && node.data.functions.length > 0) {
        html += `
            <div class="info-item">
                <span class="label">Functions:</span>
                <span class="value">${node.data.functions.length}</span>
            </div>
            <div class="info-item" style="font-size: 10px; color: var(--text-secondary);">
                ${node.data.functions.slice(0, 10).join(', ')}${node.data.functions.length > 10 ? '...' : ''}
            </div>
        `;
    }

    if (node.data.exports && node.data.exports.length > 0) {
        html += `
            <div class="info-item">
                <span class="label">Exports:</span>
                <span class="value">${node.data.exports.length}</span>
            </div>
        `;
    }

    if (node.children.length > 0) {
        html += `
            <div class="info-item">
                <span class="label">Dependencies:</span>
                <span class="value">${node.children.length}</span>
            </div>
        `;
    }

    if (node.containedNodes.length > 0) {
        html += `
            <div class="info-item">
                <span class="label">Contains:</span>
                <span class="value">${node.containedNodes.length} functions</span>
            </div>
        `;
    }

    if (node.data.inlineConfigs && node.data.inlineConfigs.length > 0) {
        html += `
            <div class="info-item">
                <span class="label">Inline Scripts:</span>
                <span class="value">${node.data.inlineConfigs.length}</span>
            </div>
        `;
    }

    // Show call statistics
    if (node.type === 'function' || node.type === 'js') {
        const nodeId = node.id;
        const containerId = node.container ? node.container.id : nodeId;

        let callsCount = 0;
        let calledByCount = 0;

        for (const link of ProjectMapperState.state.links) {
            if (link.type === 'call') {
                if (node.type === 'function') {
                    // For functions
                    const toNode = ProjectMapperState.state.nodes.find(n => n.id === link.to);
                    if (toNode && toNode.id === nodeId) calledByCount++;
                    if (link.from === containerId) callsCount++;
                } else {
                    // For files
                    const toNode = ProjectMapperState.state.nodes.find(n => n.id === link.to);
                    if (link.from === nodeId) callsCount++;
                    if (toNode && toNode.container && toNode.container.id === nodeId) calledByCount++;
                }
            }
        }

        html += `
            <div class="info-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);">
                <span class="label" style="color: var(--success);">↗ Calls:</span>
                <span class="value">${callsCount}</span>
            </div>
            <div class="info-item">
                <span class="label" style="color: var(--pink);">↙ Called by:</span>
                <span class="value">${calledByCount}</span>
            </div>
        `;
    }

    details.innerHTML = html;
}

// Export UI functions
window.ProjectMapperUI = {
    updateFileList,
    updateStats,
    selectNode,
    showNodeInfo
};