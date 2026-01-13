/**
 * Tutorials Panel - Embedded YouTube video tutorials
 * 
 * Features:
 * - YouTube iframe embed (YouTube provides all player controls)
 * - Video list with titles and descriptions
 * - Currently playing indicator
 * 
 * Layout:
 * ┌────────────────────────────────────┐
 * │ ┌────────────────────────────────┐ │
 * │ │      YouTube Player            │ │
 * │ │      (16:9 aspect ratio)       │ │
 * │ └────────────────────────────────┘ │
 * │                                    │
 * │ ● Getting Started         [2:30]   │
 * │ ○ Your First Shader       [5:15]   │
 * │ ○ Glass Mode              [3:45]   │
 * │ ○ Custom Uniforms         [4:20]   │
 * └────────────────────────────────────┘
 */

import { logger } from '../../core/logger.js';

// Tutorial video list - add your YouTube video IDs here
const TUTORIALS = [
    {
        id: '5MqkBU86YYQ',  // Placeholder - replace with actual video IDs
        title: 'New Sleditor UI',
        duration: '1:00',
        description: 'The new interface is here!'
    },
    {
        id: 'PZ3V-6J80Qo',
        title: 'SDF Builder',
        duration: '1:18',
        description: 'The SDF Builder is here!'
    }
];

let currentVideoIndex = 0;
let iframeEl = null;
let listContainer = null;

/**
 * Register the tutorials panel with SLUI
 */
export function registerTutorialsPanel(SLUI) {
    SLUI.registerPanel({
        id: 'tutorials',
        icon: '🎬',
        title: 'Tutorials',
        showInToolbar: true,
        width: 480,
        height: 520,
        createContent: () => createTutorialsContent()
    });
    
    logger.debug('UI', 'Tutorials', 'Tutorials panel registered');
}

/**
 * Create the tutorials panel content
 */
function createTutorialsContent() {
    const container = document.createElement('div');
    container.className = 'v2-tutorials';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-secondary, #161b22);
        font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    `;
    
    // Video player container (16:9 aspect ratio)
    const playerWrapper = document.createElement('div');
    playerWrapper.className = 'v2-tutorials-player';
    playerWrapper.style.cssText = `
        position: relative;
        width: 100%;
        padding-top: 56.25%; /* 16:9 aspect ratio */
        background: #000;
        flex-shrink: 0;
    `;
    
    // YouTube iframe
    iframeEl = document.createElement('iframe');
    iframeEl.className = 'v2-tutorials-iframe';
    iframeEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
    `;
    iframeEl.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframeEl.allowFullscreen = true;
    
    // Load first video
    loadVideo(0);
    
    playerWrapper.appendChild(iframeEl);
    container.appendChild(playerWrapper);
    
    // Video list
    listContainer = document.createElement('div');
    listContainer.className = 'v2-tutorials-list';
    listContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 8px;
    `;
    
    // Render video list
    renderVideoList();
    
    container.appendChild(listContainer);
    
    return container;
}

/**
 * Load a video by index
 */
function loadVideo(index) {
    if (index < 0 || index >= TUTORIALS.length) return;
    
    currentVideoIndex = index;
    const video = TUTORIALS[index];
    
    // YouTube embed URL with parameters
    // - rel=0: Don't show related videos from other channels
    // - modestbranding=1: Minimal YouTube branding
    const embedUrl = `https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1`;
    
    if (iframeEl) {
        iframeEl.src = embedUrl;
        iframeEl.title = video.title;
    }
    
    // Update list selection
    renderVideoList();
    
    logger.debug('Tutorials', 'Play', `Playing: ${video.title}`);
}

/**
 * Render the video list
 */
function renderVideoList() {
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    TUTORIALS.forEach((video, index) => {
        const isActive = index === currentVideoIndex;
        
        const item = document.createElement('div');
        item.className = 'v2-tutorials-item';
        item.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 12px;
            margin-bottom: 4px;
            border-radius: 6px;
            cursor: pointer;
            background: ${isActive ? 'var(--bg-tertiary, #21262d)' : 'transparent'};
            border-left: 3px solid ${isActive ? 'var(--accent, #58a6ff)' : 'transparent'};
            transition: background 0.15s;
        `;
        
        item.addEventListener('mouseenter', () => {
            if (!isActive) item.style.background = 'var(--bg-tertiary, #21262d)';
        });
        item.addEventListener('mouseleave', () => {
            if (!isActive) item.style.background = 'transparent';
        });
        item.addEventListener('click', () => loadVideo(index));
        
        // Play indicator
        const indicator = document.createElement('span');
        indicator.textContent = isActive ? '▶' : '○';
        indicator.style.cssText = `
            font-size: 10px;
            color: ${isActive ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #8b949e)'};
            margin-top: 3px;
            width: 14px;
            flex-shrink: 0;
        `;
        item.appendChild(indicator);
        
        // Title and description
        const textContainer = document.createElement('div');
        textContainer.style.cssText = `
            flex: 1;
            min-width: 0;
        `;
        
        const title = document.createElement('div');
        title.textContent = video.title;
        title.style.cssText = `
            font-size: 13px;
            font-weight: ${isActive ? '600' : '400'};
            color: var(--text-primary, #c9d1d9);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        textContainer.appendChild(title);
        
        const desc = document.createElement('div');
        desc.textContent = video.description;
        desc.style.cssText = `
            font-size: 11px;
            color: var(--text-muted, #8b949e);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        textContainer.appendChild(desc);
        
        item.appendChild(textContainer);
        
        // Duration
        const duration = document.createElement('span');
        duration.textContent = video.duration;
        duration.style.cssText = `
            font-size: 11px;
            color: var(--text-muted, #8b949e);
            font-family: 'JetBrains Mono', monospace;
            flex-shrink: 0;
        `;
        item.appendChild(duration);
        
        listContainer.appendChild(item);
    });
}

export default { registerTutorialsPanel };
