// ============================================================================
// Shader Management - Creating, Editing, and Saving Shaders
// ============================================================================
// Handles:
// - Creating new shaders (GLSL/WGSL)
// - Edit mode (forking/editing)
// - Save operations (inline, owned shaders)
// - Dirty tracking
// - Save modals
// ============================================================================

import { state, logStatus } from './core.js';
import * as tabs from './tabs.js';
import * as backend from './backend.js';
import * as uniformControls from './uniform-controls.js';
import * as channels from './channels.js';

// Expose for index.html to use
window.shaderManagement = {
    createNewShader,
    showNewShaderMenu,
    enterEditMode,
    exitEditMode,
    isInEditMode,
    isShaderOwnedByUser,
    handleSaveForkClick,
    saveOwnedShader,
    saveShaderInline,
    markDirty,
    setupDirtyTracking,
    updateSaveButton
};

// ============================================================================
// Create New Shader
// ============================================================================

export function createNewShader(type, MINIMAL_GLSL, MINIMAL_WGSL, reloadShader) {
    // Check for unsaved changes
    if (state.isDirty) {
        const confirmed = confirm('You have unsaved changes. Create new shader anyway?');
        if (!confirmed) return;
    }
    
    // Clear current state
    state.currentExample = null;
    state.currentDatabaseShader = null;
    state.isDirty = false;
    state.isAnonymousGolfURL = false;  // Clear read-only flag for new shaders
    
    // Clear URL hash
    window.history.pushState(null, '', window.location.pathname);
    
    // Reset title and description
    const titleEl = document.getElementById('shaderTitleDisplay');
    const creatorEl = document.getElementById('shaderCreator');
    const descEl = document.getElementById('shaderDescriptionDisplay');
    if (titleEl) titleEl.textContent = 'Untitled';
    if (creatorEl) creatorEl.textContent = '';
    if (descEl) descEl.textContent = '';
    
    // Reset likes and views display
    if (window.updateViewsAndLikes) {
        window.updateViewsAndLikes(null);
    }
    
    // Temporarily disable dirty tracking
    const wasInitializing = state.isInitializing;
    state.isInitializing = true;
    
    // Reset channels to default state
    channels.resetChannels();
    
    // Set up tabs and code based on type
    if (type === 'glsl' || type === 'glsl_regular' || type === 'glsl_stoy' || type === 'glsl_golf') {
        // Determine which GLSL tab type to use
        const tabType = type === 'glsl_regular' ? 'glsl_regular' : 
                       type === 'glsl_stoy' ? 'glsl_stoy' :
                       type === 'glsl_golf' ? 'glsl_golf' :
                       'glsl_fragment';
        
        state.activeTabs = [tabType];
        state.currentTab = tabType;
        
        if (state.graphicsEditor) {
            state.graphicsEditor.setValue(MINIMAL_GLSL);
        }
    } else if (type === 'wgsl') {
        state.activeTabs = ['graphics'];
        state.currentTab = 'graphics';
        
        if (state.graphicsEditor) {
            state.graphicsEditor.setValue(MINIMAL_WGSL);
        }
    }
    
    // Clear other editors
    if (state.audioEditor) {
        state.audioEditor.setValue('');
    }
    if (state.jsEditor) {
        state.jsEditor.setValue('');
    }
    
    // Update tabs
    tabs.renderTabs();
    tabs.switchTab(state.currentTab);
    
    // Recompile
    reloadShader().then(() => {
        setTimeout(() => {
            state.isInitializing = wasInitializing;
            state.isDirty = false;
            
            // Enter edit mode (like forking) - makes title editable, shows save button, etc.
            enterEditMode(true);
        }, 100);
    });
    
    logStatus(`✓ New ${type.toUpperCase()} shader created`, 'success');
}

export function showNewShaderMenu() {
    const btn = document.getElementById('newShaderBtn');
    
    // Create menu if it doesn't exist
    let menu = document.getElementById('newShaderMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'newShaderMenu';
        menu.style.cssText = `
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            padding: 4px;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(menu);
    }
    
    // Build menu options
    menu.innerHTML = '';
    
    // === GLSL Section ===
    const glslHeader = document.createElement('div');
    glslHeader.textContent = 'GLSL (WebGL)';
    glslHeader.style.cssText = `
        padding: 4px 12px;
        font-size: 11px;
        font-weight: bold;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    menu.appendChild(glslHeader);
    
    const glslRegularOption = document.createElement('div');
    glslRegularOption.textContent = '🎨 Regular (GLSL)';
    glslRegularOption.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        color: var(--text-primary);
    `;
    glslRegularOption.onmouseenter = () => glslRegularOption.style.background = 'var(--bg-primary)';
    glslRegularOption.onmouseleave = () => glslRegularOption.style.background = 'transparent';
    glslRegularOption.onclick = () => {
        window.createNewShader('glsl_regular');
        menu.style.display = 'none';
    };
    
    const glslStoyOption = document.createElement('div');
    glslStoyOption.textContent = '🔺 S-Toy (GLSL)';
    glslStoyOption.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        color: var(--text-primary);
    `;
    glslStoyOption.onmouseenter = () => glslStoyOption.style.background = 'var(--bg-primary)';
    glslStoyOption.onmouseleave = () => glslStoyOption.style.background = 'transparent';
    glslStoyOption.onclick = () => {
        window.createNewShader('glsl_stoy');
        menu.style.display = 'none';
    };
    
    const glslGolfOption = document.createElement('div');
    glslGolfOption.textContent = '⛳ Golf (GLSL)';
    glslGolfOption.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        color: var(--text-primary);
    `;
    glslGolfOption.onmouseenter = () => glslGolfOption.style.background = 'var(--bg-primary)';
    glslGolfOption.onmouseleave = () => glslGolfOption.style.background = 'transparent';
    glslGolfOption.onclick = () => {
        window.createNewShader('glsl_golf');
        menu.style.display = 'none';
    };
    
    const glslRawOption = document.createElement('div');
    glslRawOption.textContent = '🔺 Raw (GLSL)';
    glslRawOption.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        color: var(--text-primary);
    `;
    glslRawOption.onmouseenter = () => glslRawOption.style.background = 'var(--bg-primary)';
    glslRawOption.onmouseleave = () => glslRawOption.style.background = 'transparent';
    glslRawOption.onclick = () => {
        window.createNewShader('glsl');
        menu.style.display = 'none';
    };
    
    menu.appendChild(glslRegularOption);
    menu.appendChild(glslStoyOption);
    menu.appendChild(glslGolfOption);
    menu.appendChild(glslRawOption);
    
    // === WGSL Section ===
    const wgslHeader = document.createElement('div');
    wgslHeader.textContent = 'WGSL (WebGPU)';
    wgslHeader.style.cssText = `
        padding: 8px 12px 4px 12px;
        font-size: 11px;
        font-weight: bold;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-top: 1px solid var(--border-color);
        margin-top: 4px;
    `;
    menu.appendChild(wgslHeader);
    
    const wgslOption = document.createElement('div');
    wgslOption.textContent = '🎨 Graphics (WGSL)';
    wgslOption.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        color: var(--text-primary);
    `;
    wgslOption.onmouseenter = () => wgslOption.style.background = 'var(--bg-primary)';
    wgslOption.onmouseleave = () => wgslOption.style.background = 'transparent';
    wgslOption.onclick = () => {
        window.createNewShader('wgsl');
        menu.style.display = 'none';
    };
    
    // Disable WGSL if WebGPU not available
    if (!state.hasWebGPU) {
        wgslOption.style.color = 'var(--text-secondary)';
        wgslOption.style.cursor = 'default';
        wgslOption.style.pointerEvents = 'none';
        wgslOption.textContent += ' (WebGPU not available)';
    }
    
    menu.appendChild(wgslOption);
    
    // Position menu above button (button is at bottom of screen)
    const rect = btn.getBoundingClientRect();
    menu.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.top = 'auto'; // Clear any previous top value
    menu.style.display = 'block';
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// ============================================================================
// Edit Mode
// ============================================================================

export function isShaderOwnedByUser() {
    return state.currentDatabaseShader && state.currentUser && 
           state.currentDatabaseShader.user_id === state.currentUser.id;
}

export function isInEditMode() {
    return document.getElementById('shaderTitleInput')?.style.display === 'block';
}

export function enterEditMode(isFork = false) {
    const titleDisplay = document.getElementById('shaderTitleDisplay');
    const titleInput = document.getElementById('shaderTitleInput');
    const descDisplay = document.getElementById('shaderDescriptionDisplay');
    const descInput = document.getElementById('shaderDescriptionInput');
    const visibilityControls = document.getElementById('visibilityControls');
    
    if (!titleDisplay || !titleInput) return;
    
    // Get current values
    let currentTitle = titleDisplay.textContent || 'Untitled';
    // For description, get the raw markdown from the database shader if available
    // Otherwise fall back to the text content (for new shaders)
    let currentDesc = state.currentDatabaseShader?.description || descInput.value || '';
    
    // If forking, prefix title
    if (isFork && state.currentDatabaseShader) {
        currentTitle = `Fork of: ${state.currentDatabaseShader.title}`;
    }
    
    // Show inputs, hide displays
    titleDisplay.style.display = 'none';
    titleInput.style.display = 'block';
    titleInput.value = currentTitle;
    
    descDisplay.style.display = 'none';
    descInput.style.display = 'block';
    descInput.value = currentDesc;
    
    // NOTE: Golf URLs don't call enterEditMode() at all, so this check is unnecessary
    // and was causing all shaders to become non-editable after viewing a golf URL
    /*
    // If this is an anonymous golf URL, make fields read-only
    if (state.isAnonymousGolfURL) {
        titleInput.disabled = true;
        descInput.disabled = true;
        titleInput.style.opacity = '0.7';
        descInput.style.opacity = '0.7';
        titleInput.style.cursor = 'not-allowed';
        descInput.style.cursor = 'not-allowed';
    } else {
        // Ensure fields are enabled for normal edit mode
        titleInput.disabled = false;
        descInput.disabled = false;
        titleInput.style.opacity = '1';
        descInput.style.opacity = '1';
        titleInput.style.cursor = 'text';
        descInput.style.cursor = 'text';
    }
    */
    
    // Always ensure fields are enabled in edit mode
    titleInput.disabled = false;
    descInput.disabled = false;
    titleInput.style.opacity = '1';
    descInput.style.opacity = '1';
    titleInput.style.cursor = 'text';
    descInput.style.cursor = 'text';
    
    // Show visibility controls
    if (visibilityControls) {
        visibilityControls.style.display = 'block';
        
        // Set default visibility - private by default when forking, keep current when editing owned
        const defaultVisibility = isFork ? 'private' : (state.currentDatabaseShader?.visibility || 'private');
        if (defaultVisibility === 'private') {
            document.getElementById('visibilityPrivate').checked = true;
        } else {
            document.getElementById('visibilityPublished').checked = true;
        }
    }
    
    updateSaveButton();
}

export function exitEditMode() {
    const titleDisplay = document.getElementById('shaderTitleDisplay');
    const titleInput = document.getElementById('shaderTitleInput');
    const descDisplay = document.getElementById('shaderDescriptionDisplay');
    const descInput = document.getElementById('shaderDescriptionInput');
    const visibilityControls = document.getElementById('visibilityControls');
    
    if (!titleDisplay || !titleInput) return;
    
    // Hide inputs, show displays
    titleInput.style.display = 'none';
    titleDisplay.style.display = 'block';
    
    descInput.style.display = 'none';
    descDisplay.style.display = 'block';
    
    // Render description as markdown
    const descText = descInput.value || '';
    if (typeof marked !== 'undefined' && descText) {
        descDisplay.innerHTML = marked.parse(descText);
    } else {
        descDisplay.textContent = descText;
    }
    
    // Hide visibility controls
    if (visibilityControls) {
        visibilityControls.style.display = 'none';
    }
    
    updateSaveButton();
}

// ============================================================================
// Save Operations  
// ============================================================================

export async function handleSaveForkClick() {
    // Check if user is signed in
    if (!state.currentUser) {
        logStatus('⚠ Sign in to save shaders to the cloud', 'error');
        return;
    }
    
    const isOwned = isShaderOwnedByUser();
    
    // Already in edit mode - save
    if (isInEditMode()) {
        await saveShaderInline();
        return;
    }
    
    // Viewing owned shader - save directly
    if (isOwned) {
        await saveOwnedShader();
        return;
    }
    
    // Viewing someone else's shader - enter fork mode
    enterEditMode(true);
}

export async function saveOwnedShader() {
    if (!state.currentDatabaseShader) {
        logStatus('⚠ No shader to save', 'error');
        return;
    }
    
    const shaderData = {
        id: state.currentDatabaseShader.id,
        title: state.currentDatabaseShader.title,
        description: state.currentDatabaseShader.description,
        tags: state.currentDatabaseShader.tags || [],
        visibility: state.currentDatabaseShader.visibility || 'published',
        code: {},
        code_types: [...state.activeTabs.filter(t => t !== 'boilerplate')]
    };
    
    // Collect code from editors using tab config
    state.activeTabs.forEach(tabName => {
        if (tabName === 'boilerplate') return; // Skip boilerplate
        
        const tabConfig = window.tabConfig.getTabConfig(tabName);
        if (!tabConfig) return;
        
        const editor = window.tabConfig.getEditorForTab(tabName, state);
        if (editor) {
            shaderData.code[tabConfig.dbKey] = editor.getValue();
        }
    });
    
    // Collect channel configuration
    const channelConfig = channels.getChannelConfig();
    if (channelConfig.channels.length > 1) { // More than just main channel
        shaderData.code['_channel_meta'] = JSON.stringify(channelConfig);
    }
    
    // Collect uniform controls configuration
    shaderData.uniform_config = uniformControls.getUniformConfig();
    
    // Capture and upload thumbnail
    try {
        const blob = await backend.captureThumbnailBlob();
        if (blob) {
            const filename = `shader_${shaderData.id}_${Date.now()}.jpg`;
            const uploadResult = await backend.uploadThumbnail(blob, filename);
            
            if (uploadResult.success) {
                // Delete old thumbnail
                if (state.currentDatabaseShader?.thumbnail_url) {
                    const oldFilename = state.currentDatabaseShader.thumbnail_url.split('/').pop();
                    backend.deleteThumbnail(oldFilename).catch(() => {});
                }
                shaderData.thumbnail_url = uploadResult.url;
            }
        }
    } catch (err) {
        console.error('Thumbnail error:', err);
    }
    
    // Save to database
    const result = await backend.saveShader(shaderData);
    
    if (result.success) {
        state.isDirty = false;
        state.currentDatabaseShader = result.shader;
        updateSaveButton();
        
        // Dispatch event to update gallery
        window.dispatchEvent(new CustomEvent('shader-saved', { detail: result.shader }));
        
        logStatus('✓ Shader updated');
    } else {
        logStatus('✗ Failed to save: ' + result.error, 'error');
    }
}

export async function saveShaderInline() {
    const titleInput = document.getElementById('shaderTitleInput');
    const descInput = document.getElementById('shaderDescriptionInput');
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    
    if (!title) {
        logStatus('⚠ Title is required', 'error');
        titleInput.focus();
        return;
    }
    
    // Get visibility
    const visibility = document.getElementById('visibilityPrivate').checked ? 'private' : 'published';
    
    const shaderData = {
        title,
        description,
        tags: [],
        visibility,
        code: {},
        code_types: [...state.activeTabs.filter(t => t !== 'boilerplate')]
    };
    
    // If updating owned shader, include ID
    if (isShaderOwnedByUser() && state.currentDatabaseShader) {
        shaderData.id = state.currentDatabaseShader.id;
    }
    
    // Collect code from editors using tab config
    state.activeTabs.forEach(tabName => {
        if (tabName === 'boilerplate') return; // Skip boilerplate
        
        const tabConfig = window.tabConfig.getTabConfig(tabName);
        if (!tabConfig) return;
        
        const editor = window.tabConfig.getEditorForTab(tabName, state);
        if (editor) {
            shaderData.code[tabConfig.dbKey] = editor.getValue();
        }
    });
    
    // Collect channel configuration
    const channelConfig = channels.getChannelConfig();
    if (channelConfig.channels.length > 1) { // More than just main channel
        shaderData.code['_channel_meta'] = JSON.stringify(channelConfig);
    }
    
    // Collect uniform controls configuration
    shaderData.uniform_config = uniformControls.getUniformConfig();
    
    // Capture and upload thumbnail
    try {
        logStatus('📸 Capturing thumbnail...');
        const blob = await backend.captureThumbnailBlob();
        
        if (blob) {
            const filename = shaderData.id 
                ? `shader_${shaderData.id}_${Date.now()}.jpg`
                : `shader_${Date.now()}.jpg`;
                
            const uploadResult = await backend.uploadThumbnail(blob, filename);
            
            if (uploadResult.success) {
                // Delete old thumbnail if updating
                if (shaderData.id && state.currentDatabaseShader?.thumbnail_url) {
                    const oldFilename = state.currentDatabaseShader.thumbnail_url.split('/').pop();
                    backend.deleteThumbnail(oldFilename).catch(() => {});
                }
                shaderData.thumbnail_url = uploadResult.url;
                logStatus('✓ Thumbnail uploaded', 'success');
            }
        }
    } catch (err) {
        console.error('Thumbnail error:', err);
    }
    
    // Save to database
    const result = await backend.saveShader(shaderData);
    
    if (result.success) {
        state.isDirty = false;
        state.currentDatabaseShader = result.shader;
        
        // Update displayed title/description
        const titleDisplay = document.getElementById('shaderTitleDisplay');
        const descDisplay = document.getElementById('shaderDescriptionDisplay');
        if (titleDisplay) titleDisplay.textContent = title;
        if (descDisplay) {
            // Render description as markdown
            if (typeof marked !== 'undefined' && description) {
                descDisplay.innerHTML = marked.parse(description);
            } else {
                descDisplay.textContent = description;
            }
        }
        
        // Update URL with slug
        if (result.shader.slug) {
            window.history.pushState(null, '', `#id=${result.shader.slug}`);
        }
        
        // Exit edit mode
        exitEditMode();
        
        // Dispatch event to update gallery
        window.dispatchEvent(new CustomEvent('shader-saved', { detail: result.shader }));
        
        logStatus('✓ Shader saved to cloud');
    } else {
        logStatus('✗ Failed to save: ' + result.error, 'error');
    }
}

// ============================================================================
// Dirty Tracking
// ============================================================================

export function markDirty() {
    if (state.isInitializing) return; // Skip during initial load
    state.isDirty = true;
    updateSaveButton();
}

export function setupDirtyTracking(editor) {
    if (!editor) return;
    editor.onDidChangeModelContent(() => {
        markDirty();
    });
}

// ============================================================================
// Save Button
// ============================================================================

export function updateSaveButton() {
    const btn = document.getElementById('saveShaderBtn');
    const editBtn = document.getElementById('editShaderButton');
    if (!btn) return;
    
    const isOwned = isShaderOwnedByUser();
    const inEditMode = isInEditMode();
    const isLoggedIn = !!state.currentUser;
    
    // Not logged in - show save icon (will use modal), hide edit button
    if (!isLoggedIn) {
        btn.textContent = state.isDirty ? '💾*' : '💾';
        btn.title = 'Save shader (requires sign in)';
        if (editBtn) editBtn.style.display = 'none';
        return;
    }
    
    // In edit mode (forking or editing owned) - show save button, hide edit button
    if (inEditMode) {
        btn.textContent = state.isDirty ? '💾*' : '💾';
        btn.title = isOwned ? 'Save changes' : 'Save as new shader';
        if (editBtn) editBtn.style.display = 'none';
        return;
    }
    
    // Viewing owned shader - show save button and edit button
    if (isOwned) {
        btn.textContent = state.isDirty ? '💾*' : '💾';
        btn.title = state.isDirty ? 'Save changes' : 'Saved';
        if (editBtn) editBtn.style.display = 'inline-block';
        return;
    }
    
    // Viewing someone else's shader - show fork button, hide edit button
    const forkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: middle;"><circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="2" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2" stroke="currentColor" stroke-width="2"/><path d="M6 8v3c0 2 1 3 3 3h7M18 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    btn.innerHTML = state.isDirty ? forkIcon + '*' : forkIcon;
    btn.title = state.isDirty ? 'Fork this shader (unsaved changes)' : 'Fork this shader';
    if (editBtn) editBtn.style.display = 'none';
}


