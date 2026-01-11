// ===================== NODE CREATION =====================
function createNode(id, type, label, x, y) {
    const el = document.createElement('div');
    el.className = `node ${type}`;
    el.dataset.id = id;

    const icons = {
        html: '📄',
        css: '🎨',
        js: '⚡',
        function: 'ƒ',
        external: '🔗'
    };

    el.innerHTML = `
        <div class="node-icon">${icons[type] || '📦'}</div>
        <span class="node-label" title="${label}">${label}</span>
    `;

    const node = {
        id,
        type,
        label,
        x,
        y,
        element: el,
        parent: null,
        children: [],
        containedNodes: [],
        container: null,
        data: {}
    };

    el.style.left = x + 'px';
    el.style.top = y + 'px';

    // Event listeners
    el.addEventListener('mousedown', (e) => onNodeMouseDown(e, node));

    return node;
}

function addNode(node) {
    ProjectMapperState.state.nodes.push(node);
    ProjectMapperState.nodeLayer.appendChild(node.element);
}

function addLink(fromId, toId, type = 'hierarchy') {
    // Avoid duplicates
    const exists = ProjectMapperState.state.links.some(l =>
        l.from === fromId && l.to === toId && l.type === type
    );
    if (!exists) {
        ProjectMapperState.state.links.push({ from: fromId, to: toId, type });
    }
}

// ===================== CONTAINER LOGIC =====================
function containNode(child, parent) {
    child.container = parent;
    parent.containedNodes.push(child);

    // Update DOM
    updateContainerDOM(parent);
    child.element.classList.add('contained');
}

function updateContainerDOM(containerNode) {
    const el = containerNode.element;

    if (containerNode.containedNodes.length > 0) {
        el.classList.add('is-container');

        let header = el.querySelector('.node-header');
        let contents = el.querySelector('.node-contents');

        if (!header) {
            const icon = el.querySelector('.node-icon');
            const label = el.querySelector('.node-label');

            header = document.createElement('div');
            header.className = 'node-header';
            if (icon) header.appendChild(icon.cloneNode(true));
            if (label) header.appendChild(label.cloneNode(true));

            contents = document.createElement('div');
            contents.className = 'node-contents';

            el.innerHTML = '';
            el.appendChild(header);
            el.appendChild(contents);
        }

        contents.innerHTML = '';
        containerNode.containedNodes.forEach(contained => {
            contained.element.style.position = 'relative';
            contained.element.style.left = 'auto';
            contained.element.style.top = 'auto';
            contents.appendChild(contained.element);
        });
    }
}

// Export node functions
window.ProjectMapperNodes = {
    createNode,
    addNode,
    addLink,
    containNode,
    updateContainerDOM
};