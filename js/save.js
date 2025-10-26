// ============================================================================
// Save - localStorage, Gallery, Thumbnails
// ============================================================================

import { state, logStatus } from './core.js';

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

export function populateGallery(examples) {
    const galleryContent = document.getElementById('galleryContent');
    if (!galleryContent) return;
    
    galleryContent.innerHTML = '';
    
    // ===== MY SHADERS SECTION =====
    const savedShaders = getAllSavedShaders();
    if (savedShaders.length > 0) {
        const myShadersHeader = document.createElement('h3');
        myShadersHeader.textContent = 'My Shaders';
        myShadersHeader.style.cssText = 'grid-column: 1 / -1; margin: 10px 0 5px 0; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 14px;';
        galleryContent.appendChild(myShadersHeader);
        
        savedShaders.forEach(shader => {
            const item = createGalleryItem(shader, true);
            galleryContent.appendChild(item);
        });
        
        // Divider before examples
        const divider = document.createElement('hr');
        divider.style.cssText = 'grid-column: 1 / -1; margin: 15px 0 10px 0; border: none; border-top: 1px solid var(--border-color);';
        galleryContent.appendChild(divider);
    }
    
    // ===== EXAMPLES SECTION =====
    const examplesHeader = document.createElement('h3');
    examplesHeader.textContent = 'Examples';
    examplesHeader.style.cssText = 'grid-column: 1 / -1; margin: 10px 0 5px 0; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 14px;';
    galleryContent.appendChild(examplesHeader);
    
    // Create gallery items for each example
    if (examples) {
        Object.keys(examples).forEach(exampleId => {
            const example = examples[exampleId];
            
            // Skip examples that require WebGPU if it's not available
            if (!state.hasWebGPU && example.webgpuRequired) {
                return;
            }
            
            const item = createGalleryItem({ ...example, id: exampleId }, false);
            item.onclick = () => {
                window.dispatchEvent(new CustomEvent('load-example', { detail: exampleId }));
            };
            galleryContent.appendChild(item);
        });
    }
}

function createGalleryItem(data, isSaved) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    if (isSaved) {
        item.style.position = 'relative';
    }
    
    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'gallery-item-thumbnail';
    
    if (data.thumbnail) {
        const img = document.createElement('img');
        img.src = data.thumbnail;
        img.alt = data.title || data.name;
        if (!isSaved) {
            img.onerror = () => {
                thumbnail.innerHTML = '<div>No Preview</div>';
            };
        }
        thumbnail.appendChild(img);
    } else {
        thumbnail.innerHTML = '<div>No Preview</div>';
    }
    
    // Tech icons overlay
    const icons = document.createElement('div');
    icons.className = 'gallery-item-icons';
    data.tabs.forEach(tab => {
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
    
    // Delete button for saved shaders
    if (isSaved) {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete shader';
        deleteBtn.className = 'gallery-delete-btn';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSavedShader(data.id);
        };
        thumbnail.appendChild(deleteBtn);
        
        // Click to load
        item.onclick = () => loadSavedShader(data.id);
    }
    
    // Info
    const info = document.createElement('div');
    info.className = 'gallery-item-info';
    
    const title = document.createElement('div');
    title.className = 'gallery-item-title';
    title.textContent = data.title || data.name;
    title.title = data.title || data.name;
    
    info.appendChild(title);
    
    item.appendChild(thumbnail);
    item.appendChild(info);
    
    return item;
}

