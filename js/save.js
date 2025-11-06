// ============================================================================
// Save - Gallery, Thumbnails (Database Only)
// ============================================================================

import { state, logStatus } from './core.js';
import * as backend from './backend.js';
import * as tabs from './tabs.js';
import { getTabIcon, getTabLabel, dbKeyToTabName, getEditorForTab } from './tab-config.js';

// ============================================================================
// Thumbnail Capture
// ============================================================================

export function captureThumbnail() {
    try {
        // Capture active canvas as data URL
        const activeCanvas = state.graphicsBackend === 'webgl' ? state.canvasWebGL : state.canvasWebGPU;
        return activeCanvas.toDataURL('image/png', 0.8);
    } catch (e) {
        console.error('Failed to capture thumbnail:', e);
        return null;
    }
}

// ============================================================================
// Gallery Population
// ============================================================================

let isPopulatingGallery = false;
let currentGalleryTab = 'my'; // Track current tab

// Cache for each gallery tab
let galleryCache = {
    my: null,
    community: null,
    examples: null
};

// Track if user was logged in when cache was created
let cacheUserState = null;

/**
 * Map legacy code keys to current tab names
 * Handles old database shaders with non-standard keys
 */
function mapLegacyCodeKey(dbKey, tabs = []) {
    // Special case: 'graphics' key is ambiguous (could be GLSL or WGSL)
    // Check tabs array to disambiguate
    if (dbKey === 'graphics') {
        // If tabs includes 'glsl_fragment', this is a legacy GLSL shader
        if (tabs.includes('glsl_fragment')) {
            return 'glsl_fragment';
        }
        // Otherwise it's a real WGSL shader
        return 'graphics';
    }
    
    // Use standard legacy key mapping for all other keys
    return dbKeyToTabName(dbKey);
}

export async function populateGallery(tab = currentGalleryTab, forceRefresh = false) {
    const galleryContent = document.getElementById('galleryContent');
    if (!galleryContent) return;
    
    // Prevent concurrent calls
    if (isPopulatingGallery) {
        console.log('Gallery already populating, skipping duplicate call');
        return;
    }
    
    isPopulatingGallery = true;
    currentGalleryTab = tab;
    
    // Update active tab button
    document.querySelectorAll('.gallery-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    try {
        // Check if user login state changed (invalidate "my" cache)
        const isLoggedIn = state.currentUser !== null;
        if (tab === 'my' && cacheUserState !== null && cacheUserState !== isLoggedIn) {
            console.log('User login state changed, invalidating "my" cache');
            galleryCache.my = null;
        }
        cacheUserState = isLoggedIn;
        
        // Check cache first (unless force refresh)
        if (!forceRefresh && galleryCache[tab] && galleryCache[tab].length >= 0) {
            console.log(`Using cached data for '${tab}' tab`);
            renderGalleryFromCache(galleryContent, tab);
            isPopulatingGallery = false;
            return;
        }
        
        galleryContent.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">Loading...</div>';
        
        // Small delay to ensure any other concurrent calls are blocked
        await new Promise(resolve => setTimeout(resolve, 10));
        
        galleryContent.innerHTML = '';
        
        // ===== MY SHADERS TAB =====
        if (tab === 'my') {
            if (isLoggedIn) {
                // Load from database for logged-in users
                const myResult = await backend.loadMyShaders();
                if (myResult.success && myResult.shaders.length > 0) {
                    // Cache the shaders
                    galleryCache.my = myResult.shaders;
                    
                    myResult.shaders.forEach(shader => {
                        const item = createGalleryItem(shader, true);
                        if (item) galleryContent.appendChild(item);
                    });
                } else {
                    galleryCache.my = [];
                    const noShaders = document.createElement('div');
                    noShaders.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);';
                    noShaders.innerHTML = `
                        <div style="font-size: 48px; margin-bottom: 10px;">📝</div>
                        <div>No shaders yet</div>
                        <div style="font-size: 12px; margin-top: 5px;">Fork an example to get started!</div>
                    `;
                    galleryContent.appendChild(noShaders);
                }
            } else {
                // Not logged in - show sign in prompt
                galleryCache.my = [];
                const noShaders = document.createElement('div');
                noShaders.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);';
                noShaders.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 10px;">🔒</div>
                    <div>Sign in to save your shaders</div>
                    <div style="font-size: 12px; margin-top: 5px;">Your creations will be saved to the cloud!</div>
                `;
                galleryContent.appendChild(noShaders);
            }
        }
        
        // ===== COMMUNITY TAB =====
        else if (tab === 'community') {
            // Require login to view community gallery (anti-scraping measure)
            if (!state.currentUser) {
                const loginRequired = document.createElement('div');
                loginRequired.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);';
                loginRequired.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 10px;">🔒</div>
                    <div>Sign in to browse community shaders</div>
                    <div style="font-size: 12px; margin-top: 5px;">Published shaders are still accessible via direct link</div>
                `;
                galleryContent.appendChild(loginRequired);
                return;
            }
            
            const result = await backend.loadPublicShaders();
            
            if (result.success && result.shaders.length > 0) {
                // Cache the shaders
                galleryCache.community = result.shaders;
                
                result.shaders.forEach(shader => {
                    const item = createGalleryItem(shader, false);
                    if (item) galleryContent.appendChild(item);
                });
            } else {
                galleryCache.community = [];
                const noShaders = document.createElement('div');
                noShaders.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);';
                noShaders.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 10px;">🌐</div>
                    <div>${result.error || 'No community shaders yet'}</div>
                    <div style="font-size: 12px; margin-top: 5px;">Be the first to share your work!</div>
                `;
                galleryContent.appendChild(noShaders);
            }
        }
        
        // ===== EXAMPLES TAB =====
        else if (tab === 'examples') {
            const result = await backend.loadExamples();
            
            if (result.success && result.shaders.length > 0) {
                // Cache the shaders
                galleryCache.examples = result.shaders;
                
                result.shaders.forEach(shader => {
                    const item = createGalleryItem(shader, false);
                    if (item) galleryContent.appendChild(item);
                });
            } else {
                galleryCache.examples = [];
                const noExamples = document.createElement('div');
                noExamples.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);';
                noExamples.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 10px;">❓</div>
                    <div>${result.error || 'No examples found'}</div>
                `;
                galleryContent.appendChild(noExamples);
            }
        }
    } finally {
        isPopulatingGallery = false;
    }
}

// Helper: Render gallery from cached data
function renderGalleryFromCache(container, tab) {
    container.innerHTML = '';
    
    const cached = galleryCache[tab];
    if (!cached || cached.length === 0) {
        // Shouldn't happen, but handle it
        populateGallery(tab, true); // Force refresh
        return;
    }
    
    const isLoggedIn = state.currentUser !== null;
    const isMyTab = tab === 'my';
    
    cached.forEach(shader => {
        const item = createGalleryItem(shader, isMyTab && isLoggedIn);
        if (item) container.appendChild(item);
    });
}

// Optimistic updates: Add shader to cache without refetch
export function addShaderToCache(shader) {
    if (!galleryCache.my) galleryCache.my = [];
    
    // Check if shader already exists (avoid duplicates)
    const existsInCache = galleryCache.my.some(s => s.id === shader.id);
    if (existsInCache) {
        // Update instead of add
        updateShaderInCache(shader.id, shader);
        return;
    }
    
    // Add to beginning of cached array
    galleryCache.my.unshift(shader);
    
    // If currently viewing "my" tab, update UI optimistically
    if (currentGalleryTab === 'my') {
        const galleryContent = document.getElementById('galleryContent');
        if (galleryContent) {
            renderGalleryFromCache(galleryContent, 'my');
        }
    }
}

// Optimistic updates: Update shader in cache
export function updateShaderInCache(shaderId, updates) {
    ['my', 'community', 'examples'].forEach(tab => {
        if (!galleryCache[tab]) return;
        
        const index = galleryCache[tab].findIndex(s => s.id === shaderId);
        if (index !== -1) {
            galleryCache[tab][index] = { ...galleryCache[tab][index], ...updates };
            
            // If currently viewing this tab, update UI
            if (currentGalleryTab === tab) {
                const galleryContent = document.getElementById('galleryContent');
                if (galleryContent) {
                    renderGalleryFromCache(galleryContent, tab);
                }
            }
        }
    });
}

// Optimistic updates: Remove shader from cache
export function removeShaderFromCache(shaderId) {
    ['my', 'community', 'examples'].forEach(tab => {
        if (!galleryCache[tab]) return;
        
        const index = galleryCache[tab].findIndex(s => s.id === shaderId);
        if (index !== -1) {
            galleryCache[tab].splice(index, 1);
            
            // If currently viewing this tab, update UI
            if (currentGalleryTab === tab) {
                const galleryContent = document.getElementById('galleryContent');
                if (galleryContent) {
                    renderGalleryFromCache(galleryContent, tab);
                }
            }
        }
    });
}

function createGalleryItem(data, isOwned = false) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.style.position = 'relative';
    
    // Add data-shader-id for realtime updates
    if (data.id) {
        item.setAttribute('data-shader-id', data.id);
    }
    
    // Check if shader requires WebGPU
    const codeTypes = data.tabs || data.code_types || [];
    // 'graphics' is ambiguous - check code keys to determine if it's WGSL (WebGPU) or GLSL (WebGL)
    const hasGraphicsTab = codeTypes.includes('graphics');
    const isWGSL = hasGraphicsTab && (data.code?.wgsl_graphics || data.code?.graphics) && !data.code?.glsl_fragment;
    const needsWebGPU = codeTypes.some(t => t === 'wgsl_graphics' || t === 'wgsl_audio' || t === 'audio_gpu') || isWGSL;
    
    // Skip WebGPU shaders if WebGPU is not available
    if (needsWebGPU && !state.hasWebGPU) {
        return null; // Will be filtered out
    }
    
    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'gallery-item-thumbnail';
    
    // Get thumbnail URL
    const thumbnailUrl = data.thumbnail_url || data.thumbnail;
    
    if (thumbnailUrl) {
        const img = document.createElement('img');
        img.src = thumbnailUrl;
        img.alt = data.title || data.name;
        img.onerror = () => {
            thumbnail.innerHTML = '<div>No Preview</div>';
        };
        thumbnail.appendChild(img);
    } else {
        thumbnail.innerHTML = '<div>No Preview</div>';
    }
    
    // Tech icons overlay
    const icons = document.createElement('div');
    icons.className = 'gallery-item-icons';
    
    // Get tabs/code_types (different for localStorage vs database)
    const tabs = data.tabs || data.code_types || [];
    
    tabs.forEach(tab => {
        if (tab !== 'help' && tab !== 'boilerplate') {
            const icon = document.createElement('span');
            icon.className = 'gallery-item-icon';
            icon.textContent = getTabIcon(tab);
            icon.title = getTabLabel(tab);
            icons.appendChild(icon);
        }
    });
    if (icons.children.length > 0) {
        thumbnail.appendChild(icons);
    }
    
    // Delete button for owned database shaders only
    if (isOwned) {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete shader';
        deleteBtn.className = 'gallery-delete-btn';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            
            // Show confirmation dialog
            const confirmed = confirm(`Delete "${data.title || data.name}"?\n\nThis action cannot be undone.`);
            if (!confirmed) return;
            
            // Delete from database
            const result = await backend.deleteShader(data.id);
            if (result.success) {
                // Update UI immediately
                removeShaderFromCache(data.id);
                logStatus('✓ Shader deleted');
                
                // If this was the current shader, load first example
                if (state.currentDatabaseShader?.id === data.id) {
                    const examplesResult = await backend.loadExamples();
                    if (examplesResult.success && examplesResult.shaders.length > 0) {
                        loadDatabaseShader(examplesResult.shaders[0]);
                    }
                }
            } else {
                logStatus('✗ Failed to delete: ' + result.error, 'error');
            }
        };
        thumbnail.appendChild(deleteBtn);
    }
    
    // Click handler - database only
    item.onclick = () => loadDatabaseShader(data);
    
    // Info
    const info = document.createElement('div');
    info.className = 'gallery-item-info';
    
    const title = document.createElement('div');
    title.className = 'gallery-item-title';
    title.textContent = data.title || data.name;
    title.title = data.title || data.name;
    
    info.appendChild(title);
    
    // Username
    if (data.creator_name) {
        const username = document.createElement('div');
        username.className = 'gallery-item-username';
        username.textContent = `by ${data.creator_name}`;
        username.style.cssText = 'font-size: 10px; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        info.appendChild(username);
    }
    
    // Views and Likes stats
    {
        const stats = document.createElement('div');
        stats.className = 'gallery-item-stats';
        stats.style.cssText = 'display: flex; gap: 8px; font-size: 10px; color: var(--text-secondary); margin-top: 4px;';
        
        // Views
        const views = document.createElement('span');
        views.style.cssText = 'display: flex; align-items: center; gap: 2px;';
        views.innerHTML = `👁️ ${data.view_count || 0}`;
        stats.appendChild(views);
        
        // Likes
        const likes = document.createElement('span');
        likes.className = 'gallery-likes-container';
        likes.style.cssText = 'display: flex; align-items: center; gap: 2px;';
        likes.innerHTML = `❤️ <span class="gallery-likes">${data.like_count || 0}</span>`;
        stats.appendChild(likes);
        
        info.appendChild(stats);
    }
    
    item.appendChild(thumbnail);
    item.appendChild(info);
    
    return item;
}

// ============================================================================
// Load Database Shader
// ============================================================================

export function loadDatabaseShader(shader) {
    console.log('Loading database shader:', shader);
    
    // Check if shader requires WebGPU
    // 'graphics' is ambiguous - check code keys to determine if it's WGSL (WebGPU) or GLSL (WebGL)
    const hasGraphicsTab = shader.code_types?.includes('graphics');
    const isWGSL = hasGraphicsTab && (shader.code?.wgsl_graphics || shader.code?.graphics) && !shader.code?.glsl_fragment;
    const needsWebGPU = shader.code_types?.some(t => t === 'wgsl_graphics' || t === 'wgsl_audio' || t === 'audio_gpu') || isWGSL;
    
    if (needsWebGPU && !state.hasWebGPU) {
        logStatus('⚠️ This shader requires WebGPU, which is not available in your browser', 'error');
        alert('WebGPU Required\n\nThis shader requires WebGPU support, which is not available in your current browser.\n\nTo view this shader, please use:\n• Chrome 113+\n• Edge 113+\n• Safari 18+ (macOS 14+, iOS 18+)\n\nAlternatively, try a GLSL shader instead.');
        return;
    }
    
    // Update URL to shareable link
    if (shader.slug) {
        const newHash = `#id=${shader.slug}`;
        if (window.location.hash !== newHash) {
            window.history.pushState(null, '', newHash);
        }
    }
    
    // Temporarily disable dirty tracking
    const wasInitializing = state.isInitializing;
    state.isInitializing = true;
    
    // Clear current references
    state.currentExample = null;
    state.isDirty = false;
    
    // Store current shader for potential editing
    state.currentDatabaseShader = shader;
    
    // Update shader title, creator, and description in UI
    const titleEl = document.getElementById('shaderTitleDisplay');
    const creatorEl = document.getElementById('shaderCreator');
    const descEl = document.getElementById('shaderDescriptionDisplay');
    if (titleEl) titleEl.textContent = shader.title || 'Untitled';
    if (creatorEl) creatorEl.textContent = shader.creator_name ? `by ${shader.creator_name}` : '';
    if (descEl) {
        const descText = shader.description || '';
        if (typeof marked !== 'undefined' && descText) {
            descEl.innerHTML = marked.parse(descText);
        } else {
            descEl.textContent = descText;
        }
    }
    
    // Update views and likes UI (call window function if available)
    if (window.updateViewsAndLikes) {
        window.updateViewsAndLikes(shader);
    }
    
    // Set active tabs from code_types (filter out legacy 'help' and 'boilerplate' tabs)
    state.activeTabs = (shader.code_types || []).filter(t => t !== 'help' && t !== 'boilerplate');
    
    // Load code into editors
    if (shader.code) {
        Object.keys(shader.code).forEach(dbKey => {
            const code = shader.code[dbKey];
            if (!code) return;
            
            // Map DB key to tab name (handles legacy naming)
            const tabName = mapLegacyCodeKey(dbKey, shader.code_types);
            const editor = getEditorForTab(tabName, state);
            
            if (editor) {
                editor.setValue(code);
                
                // Set correct language for audio editor
                if (tabName === 'audio_worklet') {
                    monaco.editor.setModelLanguage(editor.getModel(), 'javascript');
                } else if (tabName === 'audio_gpu') {
                    monaco.editor.setModelLanguage(editor.getModel(), 'wgsl');
                }
            }
        });
    }
    
    // Update boilerplate if needed
    if (state.boilerplateEditor) {
        const getBoilerplate = window.getBoilerplate;
        if (getBoilerplate) {
            state.boilerplateEditor.setValue(getBoilerplate());
        }
    }
    
    // Render tabs
    tabs.renderTabs();
    
    // Switch to first tab
    const firstTab = state.activeTabs[0];
    if (firstTab) {
        tabs.switchTab(firstTab);
    }
    
    // Recompile
    if (window.reloadShader) {
        window.reloadShader().then(() => {
            setTimeout(() => {
                state.isInitializing = wasInitializing;
            }, 100);
        });
    }
    
    // Exit edit mode if we were in it
    if (window.exitEditMode && window.isInEditMode && window.isInEditMode()) {
        window.exitEditMode();
    }
    
    // Update save button to reflect clean state
    if (window.updateSaveButton) {
        window.updateSaveButton();
    }
}

