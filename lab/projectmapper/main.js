// ===================== SCANNING =====================
async function scanProject() {
    ProjectMapperState.loading.classList.remove('hidden');
    ProjectMapperState.loadingText.textContent = 'Starting scan...';

    // Clear previous state
    ProjectMapperState.state.files.clear();
    ProjectMapperState.state.nodes = [];
    ProjectMapperState.state.links = [];
    ProjectMapperState.nodeLayer.innerHTML = '';
    ProjectMapperState.fileList.innerHTML = '';

    try {
        // Get selected project path from dropdown
        const projectSelect = document.getElementById('projectSelect');
        const entryPoint = projectSelect.value;

        ProjectMapperUtils.log(`Scanning project: ${entryPoint}`, 'info');
        await scanFile(entryPoint, null, 100, 100);

        // Auto layout
        autoLayout();

        // Find function calls between files
        findAllFunctionCalls();

        // Update UI
        ProjectMapperUI.updateFileList();
        ProjectMapperUI.updateStats();
        ProjectMapperRenderer.redrawAll();

        ProjectMapperUtils.log('Scan complete!', 'success');
    } catch (err) {
        ProjectMapperUtils.log(`Scan failed: ${err.message}`, 'error');
    }

    ProjectMapperState.loading.classList.add('hidden');
}

async function scanFile(path, parentNode, x, y) {
    if (ProjectMapperState.state.files.has(path)) return ProjectMapperState.state.files.get(path).node;

    // Skip ignored files
    if (ProjectMapperUtils.shouldIgnoreFile(path)) {
        ProjectMapperUtils.log(`Ignoring: ${ProjectMapperUtils.getFileName(path)} (dev server injection)`, 'warning');
        return null;
    }

    ProjectMapperState.loadingText.textContent = `Scanning: ${ProjectMapperUtils.getFileName(path)}`;

    // Check for external imports (npm:, pkg:)
    const isPackage = path.startsWith('npm:') || path.startsWith('pkg:');
    const isExternal = ProjectMapperUtils.isExternalUrl(path) || isPackage;
    const type = isPackage ? 'external' : ProjectMapperUtils.getFileType(path);

    // Get display name
    let displayName = ProjectMapperUtils.getFileName(path);
    if (isPackage) {
        displayName = path.replace(/^npm:/, '').replace(/^pkg:/, '');
    }

    // Create node
    const node = ProjectMapperNodes.createNode(
        ProjectMapperUtils.generateId(),
        isExternal ? 'external' : type,
        displayName,
        x, y
    );
    node.data.path = path;
    node.data.isExternal = isExternal;
    node.data.isPackage = isPackage;

    ProjectMapperNodes.addNode(node);

    // Track in files map
    ProjectMapperState.state.files.set(path, {
        type,
        content: null,
        parsed: false,
        node,
        isExternal
    });

    // Add hierarchy link to parent
    if (parentNode) {
        ProjectMapperNodes.addLink(parentNode.id, node.id, 'hierarchy');
        node.parent = parentNode;
        parentNode.children.push(node);
    }

    // Don't parse external files
    if (isExternal) {
        ProjectMapperState.state.files.get(path).parsed = true;
        return node;
    }

    // Load and parse the file
    const content = await ProjectMapperUtils.loadFile(path);
    if (!content) {
        ProjectMapperState.state.files.get(path).parsed = true;
        return node;
    }

    ProjectMapperState.state.files.get(path).content = content;

    if (type === 'html') {
        const parsed = ProjectMapperParsers.parseHTML(content, path);
        let childY = y;
        let childX = x + 200;

        // Process regular scripts (external ones already filtered out by parser)
        for (const script of parsed.scripts) {
            await scanFile(script, node, childX, childY);
            childY += 60;
        }

        // Process ES modules (skip packages)
        for (const mod of parsed.modules) {
            if (mod.startsWith('pkg:')) {
                continue;
            }
            await scanFile(mod, node, childX, childY);
            childY += 60;
        }

        // Process styles (external ones already filtered out by parser)
        for (const style of parsed.styles) {
            await scanFile(style, node, childX, childY);
            childY += 60;
        }

        // Note inline configs in the node data
        if (parsed.inlineConfigs.length > 0) {
            node.data.inlineConfigs = parsed.inlineConfigs;
            ProjectMapperUtils.log(`Found ${parsed.inlineConfigs.length} inline config(s) in ${ProjectMapperUtils.getFileName(path)}`, 'info');
        }
    } else if (type === 'js') {
        const parsed = ProjectMapperParsers.parseJS(content, path);
        node.data.functions = parsed.functions;
        node.data.exports = parsed.exports;

        // Add functions as contained nodes
        for (const func of parsed.functions) {
            const funcNode = ProjectMapperNodes.createNode(
                ProjectMapperUtils.generateId(),
                'function',
                func.name + '()',
                0, 0
            );
            funcNode.data.functionName = func.name;
            funcNode.data.body = func.body;
            funcNode.data.parentFile = path;
            funcNode.data.isExported = parsed.exports.includes(func.name);
            ProjectMapperState.state.nodes.push(funcNode);
            ProjectMapperNodes.containNode(funcNode, node);
        }

        // Log function count
        if (parsed.functions.length > 0) {
            ProjectMapperUtils.log(`Found ${parsed.functions.length} functions in ${ProjectMapperUtils.getFileName(path)}`, 'info');
        }

        // Process imports (skip external CDN and package imports)
        let childY = y;
        let childX = x + 200;
        for (const imp of parsed.imports) {
            // Skip external CDN and package imports
            if (imp.startsWith('cdn:') || imp.startsWith('npm:') || imp.startsWith('pkg:')) {
                continue;
            }
            await scanFile(imp, node, childX, childY);
            childY += 60;
        }
    }

    ProjectMapperState.state.files.get(path).parsed = true;
    return node;
}

function findAllFunctionCalls() {
    // Collect all known function names -> node
    const allFunctions = new Map();
    for (const node of ProjectMapperState.state.nodes) {
        if (node.type === 'function' && node.data.functionName) {
            allFunctions.set(node.data.functionName, node);
        }
    }

    // For each JS file, find which functions call which
    for (const [path, fileData] of ProjectMapperState.state.files) {
        if (fileData.type !== 'js' || !fileData.content) continue;

        const functionsInFile = fileData.node.containedNodes;

        // For each function in this file, check what it calls
        for (const callerNode of functionsInFile) {
            const callerName = callerNode.data.functionName;
            const callerBody = callerNode.data.body || '';

            for (const [funcName, funcNode] of allFunctions) {
                // Skip self-calls
                if (funcName === callerName) continue;

                // Check if this function calls the target
                const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
                if (callRegex.test(callerBody)) {
                    // Link from calling function to called function
                    ProjectMapperNodes.addLink(callerNode.id, funcNode.id, 'call');
                }
            }
        }

        // Also check top-level calls (not in any function)
        for (const [funcName, funcNode] of allFunctions) {
            const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
            if (callRegex.test(fileData.content)) {
                // Check if any function in this file already links to it
                const alreadyLinked = functionsInFile.some(fn =>
                    ProjectMapperState.state.links.some(l => l.from === fn.id && l.to === funcNode.id)
                );
                if (!alreadyLinked) {
                    // Link from file node for top-level calls
                    ProjectMapperNodes.addLink(fileData.node.id, funcNode.id, 'call');
                }
            }
        }
    }

    ProjectMapperUI.updateStats();
}

// ===================== LAYOUT =====================
function autoLayout() {
    // Reset pan first
    ProjectMapperInteractions.resetPan();

    // Group nodes by depth for horizontal layout
    const rootNodes = ProjectMapperState.state.nodes.filter(n => !n.parent && !n.container);

    const COLUMN_WIDTH = 160;
    const ROW_GAP = 4;
    const COL_GAP = 30;
    const MAX_COLUMN_HEIGHT = 600; // Wrap to new sub-column after this

    // Collect all nodes by their depth level
    const nodesByDepth = new Map();

    function collectByDepth(node, depth) {
        if (!nodesByDepth.has(depth)) {
            nodesByDepth.set(depth, []);
        }
        nodesByDepth.get(depth).push(node);

        for (const child of node.children) {
            collectByDepth(child, depth + 1);
        }
    }

    for (const root of rootNodes) {
        collectByDepth(root, 0);
    }

    // Get node height (use actual if rendered, else estimate)
    function getNodeHeight(node) {
        if (node.element.offsetHeight > 0) {
            return node.element.offsetHeight;
        }
        const baseHeight = 32;
        const containedHeight = node.containedNodes.length * 22;
        return Math.max(baseHeight, containedHeight + 36);
    }

    // Layout each depth - wrap to sub-columns when too tall
    const maxDepth = Math.max(...nodesByDepth.keys());
    let baseX = 50;

    for (let depth = 0; depth <= maxDepth; depth++) {
        const nodesAtDepth = nodesByDepth.get(depth) || [];

        let x = baseX;
        let y = 30;
        let maxWidthInColumn = COLUMN_WIDTH;

        for (const node of nodesAtDepth) {
            const nodeHeight = getNodeHeight(node);

            // Wrap to new sub-column if too tall
            if (y + nodeHeight > MAX_COLUMN_HEIGHT && y > 30) {
                x += maxWidthInColumn + 20;
                y = 30;
                maxWidthInColumn = COLUMN_WIDTH;
            }

            node.x = x;
            node.y = y;
            node.element.style.left = x + 'px';
            node.element.style.top = y + 'px';

            y += nodeHeight + ROW_GAP;
        }

        // Move base X for next depth level
        baseX = x + maxWidthInColumn + COL_GAP;
    }

    ProjectMapperInteractions.updateTransform();
    ProjectMapperRenderer.redrawAll();
}

// ===================== INIT =====================
ProjectMapperUtils.log('Project Mapper ready. Click "Scan Project" to begin.', 'info');

// Export main functions
window.ProjectMapperMain = {
    scanProject,
    scanFile,
    findAllFunctionCalls,
    autoLayout
};