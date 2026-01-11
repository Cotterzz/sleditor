// ===================== UTILITIES =====================
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    ProjectMapperState.logArea.appendChild(entry);
    ProjectMapperState.logArea.scrollTop = ProjectMapperState.logArea.scrollHeight;
}

function getFileType(path) {
    if (path.endsWith('.html') || path.endsWith('.htm')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.js') || path.endsWith('.mjs')) return 'js';
    return 'other';
}

// Files to ignore (injected by dev server, etc.)
const IGNORE_FILES = [
    'fiveserver.js',
    'livereload.js',
    'browser-sync',
    '__vite',
    '__webpack'
];

function shouldIgnoreFile(path) {
    const filename = getFileName(path).toLowerCase();
    return IGNORE_FILES.some(ignore => filename.includes(ignore.toLowerCase()));
}

function getFileName(path) {
    return path.split('/').pop();
}

function isExternalUrl(path) {
    return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//');
}

function resolvePath(base, relative) {
    if (isExternalUrl(relative)) return relative;
    if (relative.startsWith('/')) return relative;

    const baseParts = base.split('/');
    baseParts.pop(); // Remove filename
    const relativeParts = relative.split('/');

    for (const part of relativeParts) {
        if (part === '..') {
            baseParts.pop();
        } else if (part !== '.') {
            baseParts.push(part);
        }
    }

    return baseParts.join('/');
}

function generateId() {
    return 'node_' + Math.random().toString(36).substr(2, 9);
}

// ===================== FILE LOADING =====================
async function loadFile(path) {
    if (isExternalUrl(path)) {
        log(`Skipping external: ${getFileName(path)}`, 'warning');
        return null;
    }

    // Skip obvious package names that shouldn't be treated as files
    const commonPackages = ['path', 'fs', 'http', 'https', 'url', 'querystring', 'crypto', 'util', 'stream', 'events', 'os', 'assert', 'zlib', 'buffer', 'child_process', 'cluster', 'dgram', 'dns', 'net', 'readline', 'repl', 'tls', 'tty', 'vm'];
    if (commonPackages.includes(path) || path.match(/^[a-z][a-z0-9_-]*$/)) {
        log(`Skipping likely package: ${path}`, 'warning');
        return null;
    }

    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        log(`Loaded: ${getFileName(path)}`, 'success');
        return content;
    } catch (err) {
        log(`Failed to load: ${path} - ${err.message}`, 'error');
        return null;
    }
}

// Export utilities
window.ProjectMapperUtils = {
    log,
    getFileType,
    shouldIgnoreFile,
    getFileName,
    isExternalUrl,
    resolvePath,
    generateId,
    loadFile
};