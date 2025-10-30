// ============================================================================
// Save - localStorage, Gallery, Thumbnails
// ============================================================================

import { state, logStatus } from './core.js';
import * as backend from './backend.js';
import * as tabs from './tabs.js';

const MAX_SAVED_SHADERS = 10;

// Tab icon/label helpers - duplicated here to avoid circular dependency
function getTabIcon(tabName) {
    const icons = {
        boilerplate: '📄',
        graphics: '🎨',
        audio_gpu: '🔊',
        audio_worklet: '🎵',
        js: '⚡',
        help: '❓'
    };
    return icons[tabName] || '📝';
}

function getTabLabel(tabName) {
    const labels = {
        boilerplate: 'Boilerplate',
        graphics: 'Graphics',
        audio_gpu: 'Audio (WGSL)',
        audio_worklet: 'Audio (Worklet)',
        js: 'JavaScript',
        help: 'Help'
    };
    return labels[tabName] || tabName;
}

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
// localStorage Management
// ============================================================================

export function getAllSavedShaders() {
    try {
        const saved = localStorage.getItem('savedShaders');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error('Failed to load saved shaders:', e);
        return [];
    }
}

export function saveShaderToStorage(title, description, tags) {
    const thumbnail = captureThumbnail();
    
    const shaderData = {
        id: Date.now(),
        title: title.trim(),
        description: description.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(t => t),
        thumbnail: thumbnail,
        code: {
            boilerplate: state.boilerplateEditor ? state.boilerplateEditor.getValue() : '',
            graphics: state.graphicsEditor ? state.graphicsEditor.getValue() : '',
            audio_gpu: state.activeTabs.includes('audio_gpu') && state.audioEditor ? state.audioEditor.getValue() : '',
            audio_worklet: state.activeTabs.includes('audio_worklet') && state.audioEditor ? state.audioEditor.getValue() : '',
            js: state.jsEditor ? state.jsEditor.getValue() : ''
        },
        tabs: [...state.activeTabs],
        currentTab: state.currentTab,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        pixelScale: state.pixelScale,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    };
    
    let savedShaders = getAllSavedShaders();
    
    // If editing an existing saved shader, update it
    if (state.currentSavedShader) {
        const index = savedShaders.findIndex(s => s.id === state.currentSavedShader.id);
        if (index !== -1) {
            shaderData.id = state.currentSavedShader.id;
            shaderData.created = state.currentSavedShader.created;
            savedShaders[index] = shaderData;
        } else {
            savedShaders.push(shaderData);
        }
    } else {
        savedShaders.push(shaderData);
    }
    
    // Enforce limit
    if (savedShaders.length > MAX_SAVED_SHADERS) {
        // Sort by modified date, keep most recent
        savedShaders.sort((a, b) => new Date(b.modified) - new Date(a.modified));
        savedShaders = savedShaders.slice(0, MAX_SAVED_SHADERS);
    }
    
    try {
        localStorage.setItem('savedShaders', JSON.stringify(savedShaders));
        state.currentSavedShader = shaderData;
        state.isDirty = false;
        
        // Dispatch event to update UI
        window.dispatchEvent(new CustomEvent('shader-saved'));
        
        return { success: true, shader: shaderData };
    } catch (e) {
        console.error('Failed to save shader:', e);
        return { success: false, error: e.message };
    }
}

export function loadSavedShader(shaderId) {
    const savedShaders = getAllSavedShaders();
    const shader = savedShaders.find(s => s.id === shaderId);
    
    if (!shader) {
        console.error('Shader not found:', shaderId);
        return { success: false, error: 'Shader not found' };
    }
    
    // Clear example reference (we're loading a saved shader now)
    state.currentExample = null;
    state.currentSavedShader = shader;
    state.isDirty = false;
    
    // Don't restore canvas size - use current resolution
    // Pixel scale is also kept at current value
    
    // Restore tabs
    state.activeTabs = [...shader.tabs];
    
    // Determine current audio type from tabs
    if (state.activeTabs.includes('audio_gpu')) {
        state.currentAudioType = 'gpu';
    } else if (state.activeTabs.includes('audio_worklet')) {
        state.currentAudioType = 'worklet';
    } else {
        state.currentAudioType = null;
    }
    
    // Load code into editors
    if (state.boilerplateEditor && shader.code.boilerplate) {
        state.boilerplateEditor.setValue(shader.code.boilerplate);
    }
    if (state.graphicsEditor) {
        state.graphicsEditor.setValue(shader.code.graphics || '');
    }
    if (state.audioEditor) {
        const audioCode = shader.code.audio_gpu || shader.code.audio_worklet || '';
        state.audioEditor.setValue(audioCode);
        
        // Set correct language for audio editor
        const language = state.currentAudioType === 'worklet' ? 'javascript' : 'wgsl';
        monaco.editor.setModelLanguage(state.audioEditor.getModel(), language);
    }
    if (state.jsEditor) {
        state.jsEditor.setValue(shader.code.js || '');
    }
    
    // Dispatch events for UI updates
    window.dispatchEvent(new CustomEvent('shader-loaded', { detail: shader }));
    
    return { success: true, shader };
}

export function deleteSavedShader(shaderId) {
    if (!confirm('Delete this saved shader?')) return { success: false, cancelled: true };
    
    let savedShaders = getAllSavedShaders();
    savedShaders = savedShaders.filter(s => s.id !== shaderId);
    
    try {
        localStorage.setItem('savedShaders', JSON.stringify(savedShaders));
        
        // If we deleted the currently loaded shader, clear the reference
        if (state.currentSavedShader && state.currentSavedShader.id === shaderId) {
            state.currentSavedShader = null;
        }
        
        // Dispatch event to refresh gallery
        window.dispatchEvent(new CustomEvent('shader-deleted'));
        logStatus('✓ Shader deleted');
        return { success: true };
    } catch (e) {
        console.error('Failed to delete shader:', e);
        logStatus('✗ Failed to delete shader');
        return { success: false, error: e.message };
    }
}

// ============================================================================
// Gallery Population
// ============================================================================

let isPopulatingGallery = false;
let currentGalleryTab = 'my'; // Track current tab

export async function populateGallery(tab = currentGalleryTab) {
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
        galleryContent.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">Loading...</div>';
        
        // Small delay to ensure any other concurrent calls are blocked
        await new Promise(resolve => setTimeout(resolve, 10));
        
        galleryContent.innerHTML = '';
        
        const isLoggedIn = state.currentUser !== null;
        
        // ===== MY SHADERS TAB =====
        if (tab === 'my') {
            if (isLoggedIn) {
                // Load from database for logged-in users
                const myResult = await backend.loadMyShaders();
                if (myResult.success && myResult.shaders.length > 0) {
                    myResult.shaders.forEach(shader => {
                        const item = createGalleryItem(shader, 'database', true);
                        galleryContent.appendChild(item);
                    });
                } else {
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
                // Show localStorage shaders for non-logged-in users
                const savedShaders = getAllSavedShaders();
                if (savedShaders.length > 0) {
                    savedShaders.forEach(shader => {
                        const item = createGalleryItem(shader, 'localStorage', false);
                        galleryContent.appendChild(item);
                    });
                } else {
                    const noShaders = document.createElement('div');
                    noShaders.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);';
                    noShaders.innerHTML = `
                        <div style="font-size: 48px; margin-bottom: 10px;">📝</div>
                        <div>No saved shaders</div>
                        <div style="font-size: 12px; margin-top: 5px;">Sign in to save to the cloud!</div>
                    `;
                    galleryContent.appendChild(noShaders);
                }
            }
        }
        
        // ===== COMMUNITY TAB =====
        else if (tab === 'community') {
            const result = await backend.loadPublicShaders();
            
            if (result.success && result.shaders.length > 0) {
                result.shaders.forEach(shader => {
                    const item = createGalleryItem(shader, 'database', false);
                    galleryContent.appendChild(item);
                });
            } else {
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
                result.shaders.forEach(shader => {
                    const item = createGalleryItem(shader, 'database', false);
                    galleryContent.appendChild(item);
                });
            } else {
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

function createGalleryItem(data, source, isOwned = false) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.style.position = 'relative';
    
    const isLocalStorage = source === 'localStorage';
    const isDatabase = source === 'database';
    
    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'gallery-item-thumbnail';
    
    // Get thumbnail URL (different property names for localStorage vs database)
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
    
    // Delete button for owned shaders (localStorage or database)
    if (isOwned || isLocalStorage) {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete shader';
        deleteBtn.className = 'gallery-delete-btn';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            
            // Show confirmation dialog
            const confirmed = confirm(`Delete "${data.title || data.name}"?\n\nThis action cannot be undone.`);
            if (!confirmed) return;
            
            if (isLocalStorage) {
                deleteSavedShader(data.id);
            } else if (isDatabase) {
                // Delete from database
                const result = await backend.deleteShader(data.id);
                if (result.success) {
                    populateGallery(); // Refresh gallery
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
            }
        };
        thumbnail.appendChild(deleteBtn);
    }
    
    // Click handler
    if (isLocalStorage) {
        item.onclick = () => loadSavedShader(data.id);
    } else if (isDatabase) {
        item.onclick = () => loadDatabaseShader(data);
    }
    
    // Info
    const info = document.createElement('div');
    info.className = 'gallery-item-info';
    
    const title = document.createElement('div');
    title.className = 'gallery-item-title';
    title.textContent = data.title || data.name;
    title.title = data.title || data.name;
    
    info.appendChild(title);
    
    // Username (for database shaders)
    if (isDatabase && data.creator_name) {
        const username = document.createElement('div');
        username.className = 'gallery-item-username';
        username.textContent = `by ${data.creator_name}`;
        username.style.cssText = 'font-size: 10px; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        info.appendChild(username);
    }
    
    // Views and Likes stats (for database shaders)
    if (isDatabase) {
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
        likes.style.cssText = 'display: flex; align-items: center; gap: 2px;';
        likes.innerHTML = `❤️ ${data.like_count || 0}`;
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
    state.currentSavedShader = null;
    state.isDirty = false;
    
    // Store current shader for potential editing
    state.currentDatabaseShader = shader;
    
    // Update shader title, creator, and description in UI
    const titleEl = document.getElementById('shaderTitleDisplay');
    const creatorEl = document.getElementById('shaderCreator');
    const descEl = document.getElementById('shaderDescriptionDisplay');
    if (titleEl) titleEl.textContent = shader.title || 'Untitled';
    if (creatorEl) creatorEl.textContent = shader.creator_name ? `by ${shader.creator_name}` : '';
    if (descEl) descEl.textContent = shader.description || '';
    
    // Update views and likes UI (call window function if available)
    if (window.updateViewsAndLikes) {
        window.updateViewsAndLikes(shader);
    }
    
    // Set active tabs from code_types
    state.activeTabs = [...(shader.code_types || [])];
    
    // Add help tab if not present
    if (!state.activeTabs.includes('help')) {
        state.activeTabs.push('help');
    }
    
    // Load code into editors
    if (state.graphicsEditor && shader.code) {
        // Find graphics code (could be glsl_fragment, glsl_vertex, wgsl_graphics, or graphics)
        const graphicsCode = shader.code.glsl_fragment || shader.code.wgsl_graphics || shader.code.graphics || '';
        state.graphicsEditor.setValue(graphicsCode);
    }
    
    if (state.audioEditor && shader.code) {
        const audioCode = shader.code.wgsl_audio || shader.code.audioworklet || '';
        state.audioEditor.setValue(audioCode);
        
        // Set correct language
        const isWorklet = shader.code_types?.includes('audioworklet');
        const language = isWorklet ? 'javascript' : 'wgsl';
        monaco.editor.setModelLanguage(state.audioEditor.getModel(), language);
    }
    
    if (state.jsEditor && shader.code?.javascript) {
        state.jsEditor.setValue(shader.code.javascript);
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

