/**
 * Shader Info Panel
 * 
 * Displays shader metadata, license, and comments.
 * Uses marked.js for markdown rendering.
 * 
 * Tabs:
 * - Info: Title, Author, Date, Views, Likes, Description
 * - License: License selection and display
 * - Comments: Comment thread (future)
 * 
 * Display mode by default, edit mode toggled with pencil icon.
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state } from '../../core/state.js';
import { actions } from '../../core/actions.js';
import { CONFIG } from '../../core/config.js';

// License types (matching current site - js/core.js)
const LICENSE_TYPES = {
    default: {
        name: 'Default',
        tooltip: 'All rights reserved, but forking on-site with attribution is allowed.'
    },
    all_rights_reserved: {
        name: 'All Rights Reserved',
        tooltip: 'Others can view only. All use requires your permission.'
    },
    cc0: {
        name: 'CC0 (Public Domain)',
        tooltip: 'No restrictions. Anyone can use for any purpose.'
    },
    mit: {
        name: 'MIT License',
        tooltip: 'Free to use with attribution. Popular for code.'
    },
    gpl3: {
        name: 'GPL-3.0',
        tooltip: 'Copyleft, derivatives must be open source.'
    },
    cc_by: {
        name: 'CC BY 4.0',
        tooltip: 'Free to use and modify with attribution.'
    },
    cc_by_sa: {
        name: 'CC BY-SA 4.0',
        tooltip: 'Attribution required. Derivatives must use same license.'
    },
    cc_by_nc: {
        name: 'CC BY-NC 4.0',
        tooltip: 'Non-commercial use only, with attribution.'
    },
    cc_by_nc_sa: {
        name: 'CC BY-NC-SA 4.0',
        tooltip: 'Non-commercial, attribution, same license for derivatives.'
    },
    custom: {
        name: 'Custom',
        tooltip: 'See shader comments or description for license.'
    }
};

// Placeholder data for development
const PLACEHOLDER_SHADER = {
    title: 'Untitled Shader',
    author: 'Anonymous',
    authorId: null,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    views: 0,
    likes: 0,
    liked: false,
    description: `Shader description here.

**Markdown is supported!**`,
    license: 'default',
    tags: []
};

/**
 * Register the shader info panel with SLUI
 */
export function registerShaderInfoPanel(SLUI) {
    SLUI.registerPanel({
        id: 'shader-info',
        icon: `<img src="${CONFIG.SLUI_ICONS}info32.png" srcset="${CONFIG.SLUI_ICONS}info64.png 2x" width="24" height="24" alt="Info" onerror="this.outerHTML='ℹ️'">`,
        title: 'Shader Info',
        showInToolbar: true,
        tabbed: true,
        tabGroup: 'shader-info',
        tabs: () => [
            {
                id: 'info',
                label: 'Info',
                icon: 'ℹ️',
                closable: false,
                content: () => createInfoTab()
            },
            {
                id: 'license',
                label: 'License',
                icon: '📜',
                closable: false,
                content: () => createLicenseTab()
            },
            {
                id: 'comments',
                label: 'Comments',
                icon: '💬',
                closable: false,
                content: () => createCommentsTab()
            }
        ]
    });
    
    logger.info('UI', 'ShaderInfo', 'Shader Info panel registered');
}

// ============================================================================
// INFO TAB
// ============================================================================

function createInfoTab() {
    const container = document.createElement('div');
    container.className = 'v2-shader-info-tab';
    container.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 100%;
        overflow-y: auto;
    `;
    
    const shader = getShaderData();
    
    // Title
    const titleEl = document.createElement('h2');
    titleEl.textContent = shader.title || 'Untitled';
    titleEl.style.cssText = `
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary, #fff);
    `;
    container.appendChild(titleEl);
    
    // "Created by Author on Date"
    const byline = document.createElement('div');
    byline.style.cssText = 'font-size: 13px; color: var(--text-secondary, #8b949e);';
    const author = shader.author || 'Anonymous';
    const date = shader.created ? new Date(shader.created).toLocaleDateString() : 'Unknown date';
    byline.innerHTML = `Created by <a href="#" style="color: var(--accent, #58a6ff); text-decoration: none;">${escapeHtml(author)}</a> on ${date}`;
    container.appendChild(byline);
    
    // Likes and Views (bigger icons)
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display: flex; align-items: center; gap: 20px; padding: 8px 0;';
    
    // Likes (clickable)
    const likesEl = document.createElement('div');
    likesEl.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 15px; cursor: pointer;';
    likesEl.innerHTML = `<span style="font-size: 20px;">${shader.liked ? '❤️' : '🤍'}</span><span>${formatNumber(shader.likes)}</span>`;
    likesEl.title = 'Like this shader';
    likesEl.addEventListener('click', () => {
        shader.liked = !shader.liked;
        shader.likes += shader.liked ? 1 : -1;
        actions.setShaderLikeState(shader.liked, shader.likes);
        likesEl.innerHTML = `<span style="font-size: 20px;">${shader.liked ? '❤️' : '🤍'}</span><span>${formatNumber(shader.likes)}</span>`;
    });
    statsRow.appendChild(likesEl);
    
    // Views
    const viewsEl = document.createElement('div');
    viewsEl.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 15px; color: var(--text-secondary);';
    viewsEl.innerHTML = `<span style="font-size: 18px;">👁️</span><span>${formatNumber(shader.views)}</span>`;
    statsRow.appendChild(viewsEl);
    
    container.appendChild(statsRow);
    
    // Tags
    if (shader.tags && shader.tags.length > 0) {
        const tagsRow = document.createElement('div');
        tagsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px;';
        shader.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.textContent = tag;
            tagEl.style.cssText = `
                padding: 3px 10px;
                background: var(--bg-tertiary, #30363d);
                border-radius: 12px;
                font-size: 12px;
                color: var(--text-secondary, #8b949e);
            `;
            tagsRow.appendChild(tagEl);
        });
        container.appendChild(tagsRow);
    }
    
    // Description
    const descSection = document.createElement('div');
    descSection.style.cssText = `
        margin-top: 8px;
        padding-top: 12px;
        border-top: 1px solid var(--border, rgba(255,255,255,0.1));
    `;
    
    const descContent = document.createElement('div');
    descContent.className = 'v2-markdown-content';
    descContent.style.cssText = 'font-size: 14px; line-height: 1.6; color: var(--text-secondary, #8b949e);';
    renderMarkdown(shader.description || '*No description*', descContent);
    descSection.appendChild(descContent);
    container.appendChild(descSection);
    
    addMarkdownStyles();
    
    return container;
}

// ============================================================================
// LICENSE TAB
// ============================================================================

function createLicenseTab() {
    const container = document.createElement('div');
    container.className = 'v2-license-tab';
    container.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        overflow-y: auto;
    `;
    
    const shader = getShaderData();
    const licenseKey = shader.license || 'default';
    const license = LICENSE_TYPES[licenseKey] || LICENSE_TYPES.default;
    
    // License name
    const nameEl = document.createElement('h3');
    nameEl.textContent = license.name;
    nameEl.style.cssText = `
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary, #fff);
    `;
    container.appendChild(nameEl);
    
    // License description
    const descEl = document.createElement('p');
    descEl.textContent = license.tooltip;
    descEl.style.cssText = `
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-secondary, #8b949e);
    `;
    container.appendChild(descEl);
    
    return container;
}

// ============================================================================
// COMMENTS TAB
// ============================================================================

function createCommentsTab() {
    const container = document.createElement('div');
    container.className = 'v2-comments-tab';
    container.style.cssText = `
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted, #6e7681);
        font-size: 14px;
    `;
    
    container.textContent = 'No comments yet';
    
    return container;
}

// ============================================================================
// HELPERS
// ============================================================================

function getShaderData() {
    return {
        title: state.shader?.title || PLACEHOLDER_SHADER.title,
        author: state.shader?.author || PLACEHOLDER_SHADER.author,
        created: state.shader?.created || PLACEHOLDER_SHADER.created,
        views: state.shader?.views ?? PLACEHOLDER_SHADER.views,
        likes: state.shader?.likes ?? PLACEHOLDER_SHADER.likes,
        liked: state.shader?.liked ?? PLACEHOLDER_SHADER.liked,
        description: state.shader?.description || PLACEHOLDER_SHADER.description,
        license: state.shader?.license || PLACEHOLDER_SHADER.license,
        tags: state.shader?.tags || PLACEHOLDER_SHADER.tags
    };
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderMarkdown(text, container) {
    if (typeof marked !== 'undefined') {
        try {
            container.innerHTML = marked.parse(text || '');
        } catch (e) {
            container.textContent = text || '';
        }
    } else {
        // Basic fallback
        container.innerHTML = (text || '')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }
}

function addMarkdownStyles() {
    if (document.getElementById('v2-markdown-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'v2-markdown-styles';
    styles.textContent = `
        .v2-markdown-content h1, .v2-markdown-content h2, .v2-markdown-content h3 {
            margin: 12px 0 6px 0;
            color: var(--text-primary, #fff);
        }
        .v2-markdown-content h1 { font-size: 1.4em; }
        .v2-markdown-content h2 { font-size: 1.2em; }
        .v2-markdown-content h3 { font-size: 1.1em; }
        .v2-markdown-content p { margin: 6px 0; }
        .v2-markdown-content code {
            padding: 2px 6px;
            background: var(--bg-tertiary, #30363d);
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9em;
            color: var(--accent, #58a6ff);
        }
        .v2-markdown-content pre {
            padding: 12px;
            background: var(--bg-tertiary, #1e1e1e);
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .v2-markdown-content pre code {
            padding: 0;
            background: none;
            color: var(--text-primary, #d4d4d4);
        }
        .v2-markdown-content ul, .v2-markdown-content ol {
            margin: 6px 0;
            padding-left: 20px;
        }
        .v2-markdown-content a {
            color: var(--accent, #58a6ff);
            text-decoration: none;
        }
        .v2-markdown-content a:hover { text-decoration: underline; }
        .v2-markdown-content blockquote {
            margin: 8px 0;
            padding: 6px 12px;
            border-left: 3px solid var(--accent, #58a6ff);
            background: var(--bg-tertiary, #161b22);
        }
    `;
    document.head.appendChild(styles);
}

export default { registerShaderInfoPanel };
