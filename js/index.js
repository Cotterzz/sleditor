'use strict';

// Import all modules
import { state, CONFIG, DERIVED, AUDIO_MODES, LICENSE_TYPES, loadSettings, saveSettings, logStatus, updateDerived } from './core.js';
import * as webgpu from './backends/webgpu.js';
import * as webgl from './backends/webgl.js';
import * as audioWorklet from './backends/audio-worklet.js';
import * as backend from './backend.js';
import * as render from './render.js';
import * as editor from './editor.js';
import * as jsRuntime from './js-runtime.js';
import * as tabs from './tabs.js';
import * as save from './save.js';
import * as comments from './comments.js';
// Performance monitor disabled - kept for future use
// import * as perfMonitor from './performance-monitor.js';
import * as uniformControls from './uniform-controls.js';
import * as fullscreen from './fullscreen.js';
import * as vim from './vim.js';
import * as aiAssistSettings from './ai-assist-settings.js';
import { getBoilerplate, MINIMAL_JS, MINIMAL_GLSL, MINIMAL_GLSL_REGULAR, MINIMAL_GLSL_STOY, MINIMAL_GLSL_GOLF, MINIMAL_WGSL } from './examples.js';
import { HELP_SECTIONS } from './help-sections.js';
import * as tabConfig from './tab-config.js';
import * as ui from './ui.js';
import * as shaderManagement from './shader-management.js';
import * as compiler from './compiler.js';
import * as audio from './audio.js';
import * as routing from './routing.js';
import { UniformBuilder } from './uniforms.js';
import * as community from './community.js';
import * as waveformPanel from './ui/audio-waveform-panel.js';
import * as channels from './channels.js';
import * as mediaLoader from './media-loader.js';
import * as shadertoyBrowser from './ui/shadertoy-browser.js';

// Expose modules globally for inline functions and backwards compatibility
window.tabConfig = tabConfig;
window.ui = ui;
window.shaderManagement = shaderManagement;
window.HELP_SECTIONS = HELP_SECTIONS;

let pointerEventsAttached = false;

// ============================================================================
// Helper function for createNewShader that needs reloadShader reference
// ============================================================================

function createNewShader(type) {
    // Determine which minimal GLSL code to use
    const minimalGLSL = (type === 'glsl_regular') ? MINIMAL_GLSL_REGULAR : 
                       (type === 'glsl_stoy') ? MINIMAL_GLSL_STOY :
                       (type === 'glsl_golf') ? MINIMAL_GLSL_GOLF :
                       MINIMAL_GLSL;
    shaderManagement.createNewShader(type, minimalGLSL, MINIMAL_WGSL, compiler.reloadShader); 
}

// ============================================================================
// Shadertoy Import Handler
// ============================================================================

async function handleShadertoyImport(importedShader) {
    console.log('Importing Shadertoy shader:', importedShader.title);
    
    // Temporarily disable dirty tracking during import
    const wasInitializing = state.isInitializing;
    state.isInitializing = true;
    
    try {
        // Clear current state - treat this as a NEW shader owned by current user
        state.currentExample = null;
        state.currentDatabaseShader = null; // No database record - it's NEW
        state.isDirty = false;
        state.isForkMode = false;
        
        // Clear URL hash (this is a new unsaved shader)
        window.history.pushState(null, '', window.location.pathname);
        
        // Reset channels first
        channels.resetChannels();
        shaderManagement.resetEditorState();
        
        // Set up active tabs from the imported code_types
        state.activeTabs = [...(importedShader.code_types || ['glsl_stoy'])];
        
        // Load code into editors
        if (importedShader.code) {
            // Main graphics code
            const graphicsCode = importedShader.code.glsl_stoy || 
                                importedShader.code.glsl_fragment || 
                                importedShader.code.graphics || '';
            if (state.graphicsEditor && graphicsCode) {
                state.graphicsEditor.setValue(graphicsCode);
                state.tabCodeCache['glsl_stoy'] = graphicsCode;
            }
            
            // Common code
            if (importedShader.code.common && state.commonEditor) {
                state.commonEditor.setValue(importedShader.code.common);
                state.tabCodeCache['common'] = importedShader.code.common;
            }
            
            // Audio code (from Sound pass)
            if (importedShader.code.audio_glsl && state.audioEditor) {
                state.audioEditor.setValue(importedShader.code.audio_glsl);
                state.tabCodeCache['audio_glsl'] = importedShader.code.audio_glsl;
            }
            
            // Buffer code - stored with tabName as key (e.g., buffer_ch1)
            for (const [key, value] of Object.entries(importedShader.code)) {
                if (key.startsWith('buffer_ch') && value) {
                    state.tabCodeCache[key] = value;
                }
            }
        }
        
        // Load channel configuration if present
        if (importedShader.code && importedShader.code['_channel_meta']) {
            try {
                const channelConfig = JSON.parse(importedShader.code['_channel_meta']);
                await channels.loadChannelConfig(channelConfig);
            } catch (error) {
                console.error('Failed to load channel config:', error);
            }
        }
        
        // Update UI elements - title and description from import
        const titleEl = document.getElementById('shaderTitleDisplay');
        const creatorEl = document.getElementById('shaderCreator');
        const descEl = document.getElementById('shaderDescriptionDisplay');
        
        if (titleEl) titleEl.textContent = importedShader.title || 'Imported Shader';
        if (creatorEl) creatorEl.textContent = ''; // Current user will own it, not original author
        if (descEl) {
            const descText = importedShader.description || '';
            if (typeof marked !== 'undefined' && descText) {
                descEl.innerHTML = marked.parse(descText);
            } else {
                descEl.textContent = descText;
            }
        }
        
        // Reset likes/views (new shader has none)
        if (window.updateViewsAndLikes) {
            window.updateViewsAndLikes(null);
        }
        
        // Render tabs and switch to first tab
        tabs.renderTabs();
        const firstTab = state.activeTabs[0];
        if (firstTab) {
            tabs.switchTab(firstTab);
        }
        
        // Show waveform panel if audio_glsl is present
        if (state.activeTabs.includes('audio_glsl') && importedShader.code?.audio_glsl) {
            const container = document.getElementById('audioWaveformContainer');
            if (container) {
                waveformPanel.mountPanel(container);
                waveformPanel.onAudioShaderLoaded(importedShader.code.audio_glsl);
            }
        } else {
            waveformPanel.hide();
        }
        
        // Compile and reload the shader
        if (window.reloadShader) {
            await window.reloadShader();
        }
        await ui.restart(false);
        
        logStatus(`✓ Imported: ${importedShader.title}`, 'success');
        
    } finally {
        state.isInitializing = wasInitializing;
        
        // Mark as dirty AFTER isInitializing is reset, so the UI updates correctly
        // This is a new unsaved shader that needs to be saved
        state.isDirty = true;
        state.currentDatabaseShader = null; // Ensure it's null
        
        // Use setTimeout to ensure UI update happens after any pending operations
        setTimeout(() => {
            shaderManagement.updateSaveButtons();
        }, 0);
    }
}

// ============================================================================
// Load Example
// ============================================================================

function loadExample(exampleId) {
    const example = EXAMPLES[exampleId];
    if (!example) return;
    
    // Temporarily disable dirty tracking while loading
    const wasInitializing = state.isInitializing;
    state.isInitializing = true;
    
    state.currentExample = exampleId;
    state.currentDatabaseShader = null;
    state.isDirty = false;
    state.isForkMode = false;  // Clear fork mode when loading example
    shaderManagement.updateSaveButton();
    
    // Convert old 'audio' tab to new format
    const updatedTabs = example.tabs.map(tab => {
        if (tab === 'audio') {
            const isWorklet = example.audio && (example.audio.includes('AudioWorkletProcessor') || 
                             example.audio.includes('registerProcessor'));
            return isWorklet ? 'audio_worklet' : 'audio_gpu';
        }
        return tab;
    });
    
    state.activeTabs = [...updatedTabs];
    
    // Determine audio type
    if (state.activeTabs.includes('audio_gpu')) {
        state.currentAudioType = 'gpu';
    } else if (state.activeTabs.includes('audio_worklet')) {
        state.currentAudioType = 'worklet';
    } else {
        state.currentAudioType = null;
    }
    
    // Load code into editors
    if (state.graphicsEditor) {
        state.graphicsEditor.setValue(example.graphics || '');
    }
    if (state.audioEditor) {
        state.audioEditor.setValue(example.audio || '');
    }
    if (state.jsEditor) {
        state.jsEditor.setValue(example.js || MINIMAL_JS);
    }
    // Clear common editor when loading examples (examples don't have common code)
    if (state.commonEditor) {
        state.commonEditor.setValue('');
    }
    
    // Update UI
    tabs.renderTabs();
    tabs.switchTab(updatedTabs[0] || 'graphics');
    
    // Show/hide waveform panel based on audio type
    if (state.activeTabs.includes('audio_glsl') && example.audio) {
        const container = document.getElementById('audioWaveformContainer');
        if (container) {
            waveformPanel.mountPanel(container);
            waveformPanel.onAudioShaderLoaded(example.audio);
        }
    } else {
        waveformPanel.hide();
    }
    
    // Update shader info
    document.getElementById('shaderTitleDisplay').textContent = example.name;
    document.getElementById('shaderCreator').textContent = example.creator ? `by ${example.creator}` : '';
    document.getElementById('shaderDescriptionDisplay').textContent = example.description || '';
    updateLicenseDisplay('default');
    
    // Reload shader and restart (maintains play/pause state)
    if (state.isRunning) {
        compiler.reloadShader().then((success) => {
            ui.restart();
            // Re-enable dirty tracking after load completes
            setTimeout(() => {
                state.isInitializing = wasInitializing;
            }, 100);
        });
    } else {
        // Re-enable dirty tracking immediately if not running
        setTimeout(() => {
            state.isInitializing = wasInitializing;
        }, 100);
    }
    
    // Update URL for sharing
    routing.updateURLForShader(exampleId, true);
}

// ============================================================================
// Setup UI
// ============================================================================

function setupUI() {
    // Canvas elements (separate for WebGPU and WebGL)
    state.canvasWebGPU = document.getElementById('canvasWebGPU');
    state.canvasWebGL = document.getElementById('canvasWebGL');
    const canvasContainer = document.getElementById('canvasContainer');
    canvasContainer.classList.add('explicit-height');
    canvasContainer.style.height = state.canvasHeight + 'px';
    
    // Click on canvas container focuses the active canvas (for keyboard input)
    canvasContainer.addEventListener('click', () => {
        const activeCanvas = state.canvasWebGL.style.display !== 'none' ? state.canvasWebGL : state.canvasWebGPU;
        activeCanvas.focus();
    });
    
    // Set initial canvas size
    ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, false);
    
    // Setup panel dividers and canvas observer (using ui module)
    ui.setupPanelDividers();
    ui.setupHorizontalCanvasDivider();
    ui.setupCanvasResizeObserver();
    ui.initTimeline();
    
    // Setup help drag listeners (mouse and touch)
    document.addEventListener('mousemove', ui.doHelpDrag);
    document.addEventListener('mouseup', ui.stopHelpDrag);
    document.addEventListener('touchmove', ui.doHelpDrag, { passive: false });
    document.addEventListener('touchend', ui.stopHelpDrag);
    document.addEventListener('touchcancel', ui.stopHelpDrag);
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Cmd+S (Mac) or Ctrl+S (Windows/Linux) - Save shader
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            document.getElementById('saveShaderBtn')?.click();
        }
    });
    
    // Event listeners
    document.getElementById('playPauseBtn').addEventListener('click', ui.togglePlayPause);
    document.getElementById('restartBtn').addEventListener('click', () => ui.restart(true));
    document.getElementById('reloadBtn').addEventListener('click', () => compiler.reloadShader());
    document.getElementById('newShaderBtn').addEventListener('click', shaderManagement.showNewShaderMenu);
    document.getElementById('addPassBtn').addEventListener('click', tabs.showAddPassMenu);
    document.getElementById('optionsBtn').addEventListener('click', tabs.showOptionsMenu);
    // Performance monitor button removed
    // document.getElementById('perfMonitorBtn').addEventListener('click', () => perfMonitor.togglePanel());
    document.getElementById('uniformControlsBtn').addEventListener('click', () => uniformControls.toggle());
    // Help button - draggable divider (mouse and touch)
    const helpToggleBtn = document.getElementById('helpToggleBtn');
    helpToggleBtn.addEventListener('mousedown', (e) => ui.startHelpDrag(e));
    helpToggleBtn.addEventListener('touchstart', (e) => ui.startHelpDrag(e), { passive: false });
    helpToggleBtn.style.cursor = 'ns-resize';
    
    // Auth buttons
    document.getElementById('signInBtn').addEventListener('click', () => {
        document.getElementById('signInModal').style.display = 'flex';
    });
    
    document.getElementById('signOutBtn').addEventListener('click', () => {
        backend.signOut();
    });
    
    document.getElementById('closeSignInModal').addEventListener('click', () => {
        document.getElementById('signInModal').style.display = 'none';
        hideAuthMessage();
        // Clear form fields
        document.getElementById('emailInput').value = '';
        document.getElementById('passwordInput').value = '';
        document.getElementById('displayNameInput').value = '';
    });
    
    // OAuth sign-in
    document.getElementById('signInGitHub').addEventListener('click', () => {
        backend.signInWithOAuth('github');
    });
    
    // Edit shader button
    document.getElementById('editShaderButton').addEventListener('click', () => {
        shaderManagement.enterEditMode(false); // false = editing owned shader, not forking
    });
    
    // Like button
    document.getElementById('likeButton').addEventListener('click', community.handleLikeClick);
    
    // Top-level tab switching (Comments / Gallery)
    document.querySelectorAll('.top-level-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.dataset.panel;
            ui.switchTopLevelPanel(panel);
        });
    });
    
    ui.initChannelViewer();
    
    // Gallery tab switching
    document.querySelectorAll('.gallery-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // If clicking the refresh button, force refresh
            if (e.target.classList.contains('gallery-refresh-btn')) {
                e.stopPropagation();
                const tabName = tab.dataset.tab;
                save.populateGallery(tabName, true); // Force refresh
                return;
            }
            
            // Otherwise, normal tab switch (uses cache if available)
            const tabName = tab.dataset.tab;
            save.populateGallery(tabName);
        });
    });
    
    // Note: Gallery population moved to after backend.init() to ensure Supabase is ready
    
    document.getElementById('signInGoogle').addEventListener('click', () => {
        backend.signInWithOAuth('google');
    });
    
    document.getElementById('signInFacebook').addEventListener('click', () => {
        backend.signInWithOAuth('facebook');
    });
    
    // Email/password sign-in
    document.getElementById('emailSignIn').addEventListener('click', async () => {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        
        if (!email || !password) {
            showAuthMessage('Please enter email and password', 'error');
            return;
        }
        
        const result = await backend.signInWithEmail(email, password);
        if (result.success) {
            hideAuthMessage();
            document.getElementById('signInModal').style.display = 'none';
        }
    });
    
    // Email/password sign-up
    document.getElementById('emailSignUp').addEventListener('click', async () => {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        const displayName = document.getElementById('displayNameInput').value;
        
        if (!email || !password) {
            showAuthMessage('Please enter email and password', 'error');
            return;
        }
        
        if (!displayName) {
            showAuthMessage('Please enter a display name', 'error');
            return;
        }
        
        const result = await backend.signUpWithEmail(email, password, displayName);
        
        // Modal will stay open to show success/error message
        // If there was an error, the message is already shown by backend.signUpWithEmail
        console.log('Signup result:', result);
    });
    
    // ==================== Profile Popup ====================
    
    const profileModal = document.getElementById('profileModal');
    const profileAvatarPreview = document.getElementById('profileAvatarPreview');
    const profileAvatarInput = document.getElementById('profileAvatarInput');
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileMessage = document.getElementById('profileMessage');
    const profileSaveBtn = document.getElementById('profileSaveBtn');
    const profileCancelBtn = document.getElementById('profileCancelBtn');
    const userProfileBtn = document.getElementById('userProfileBtn');
    const notificationBadge = document.getElementById('notificationBadge');
    const notificationsList = document.getElementById('notificationsList');
    const profileTabNotifications = document.getElementById('profileTabNotifications');
    const profileTabSettings = document.getElementById('profileTabSettings');
    const notificationsContent = document.getElementById('notificationsContent');
    const profileSettingsContent = document.getElementById('profileSettingsContent');
    const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
    const closeNotificationsBtn = document.getElementById('closeNotificationsBtn');
    
    let pendingAvatarFile = null; // Store file to upload on save
    let currentAvatarUrl = null;  // Track current avatar URL for deletion
    
    // Tab switching
    function switchProfileTab(tab) {
        if (tab === 'notifications') {
            profileTabNotifications.style.borderBottomColor = 'var(--accent-color)';
            profileTabNotifications.style.color = 'var(--text-primary)';
            profileTabSettings.style.borderBottomColor = 'transparent';
            profileTabSettings.style.color = 'var(--text-secondary)';
            notificationsContent.style.display = 'block';
            profileSettingsContent.style.display = 'none';
        } else {
            profileTabSettings.style.borderBottomColor = 'var(--accent-color)';
            profileTabSettings.style.color = 'var(--text-primary)';
            profileTabNotifications.style.borderBottomColor = 'transparent';
            profileTabNotifications.style.color = 'var(--text-secondary)';
            notificationsContent.style.display = 'none';
            profileSettingsContent.style.display = 'block';
        }
    }
    
    profileTabNotifications.addEventListener('click', () => switchProfileTab('notifications'));
    profileTabSettings.addEventListener('click', () => switchProfileTab('settings'));
    
    // Load and render notifications
    async function loadNotifications() {
        notificationsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Loading...</div>';
        
        const result = await backend.getNotifications(50);
        
        if (!result.success || result.notifications.length === 0) {
            notificationsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No notifications yet</div>';
            return;
        }
        
        notificationsList.innerHTML = '';
        
        for (const notif of result.notifications) {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 12px;
                border-bottom: 1px solid var(--border-color);
                cursor: pointer;
                transition: background 0.2s;
                ${notif.read ? 'opacity: 0.6;' : ''}
            `;
            item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-secondary)');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');
            
            // Build notification text
            let icon = '🔔';
            let text = '';
            switch (notif.type) {
                case 'like':
                    icon = '❤️';
                    text = `<strong>${notif.source_user_name || 'Someone'}</strong> liked your shader <strong>${notif.shader_title || 'Untitled'}</strong>`;
                    break;
                case 'comment':
                    icon = '💬';
                    text = `<strong>${notif.source_user_name || 'Someone'}</strong> commented on <strong>${notif.shader_title || 'Untitled'}</strong>`;
                    break;
                case 'reply':
                    icon = '↩️';
                    text = `<strong>${notif.source_user_name || 'Someone'}</strong> replied to your comment on <strong>${notif.shader_title || 'Untitled'}</strong>`;
                    break;
                case 'achievement':
                    icon = '🏆';
                    text = notif.message || 'You earned an achievement!';
                    break;
                default:
                    text = notif.message || 'New notification';
            }
            
            // Time ago
            const timeAgo = getTimeAgo(new Date(notif.created_at));
            
            item.innerHTML = `
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <span style="font-size: 18px;">${icon}</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; color: var(--text-primary); line-height: 1.4;">${text}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${timeAgo}</div>
                    </div>
                </div>
            `;
            
            // Click to open shader (and switch to comments for comment/reply notifications)
            if (notif.shader_id) {
                item.addEventListener('click', async () => {
                    profileModal.style.display = 'none';
                    
                    // Navigate to shader
                    window.location.hash = `#id=${notif.shader_id}`;
                    
                    // For comment/reply notifications, switch to comments tab after shader loads
                    if (notif.type === 'comment' || notif.type === 'reply') {
                        // Wait for shader to load, then switch to comments
                        setTimeout(() => {
                            const ui = window.ui;
                            if (ui && ui.switchTopLevelPanel) {
                                ui.switchTopLevelPanel('comments');
                            }
                        }, 500);
                    }
                });
            }
            
            notificationsList.appendChild(item);
        }
    }
    
    // Helper: time ago
    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }
    
    // Update notification badge
    async function updateNotificationBadge() {
        if (!state.currentUser) {
            notificationBadge.style.display = 'none';
            return;
        }
        
        const count = await backend.getUnreadNotificationCount();
        
        if (count > 0) {
            notificationBadge.textContent = count > 99 ? '99+' : count;
            notificationBadge.style.display = 'inline';
        } else {
            notificationBadge.style.display = 'none';
        }
    }
    
    // Expose for external use
    window.updateNotificationBadge = updateNotificationBadge;
    
    // Open profile popup when clicking user name/avatar
    userProfileBtn.addEventListener('click', async () => {
        // Reset to notifications tab
        switchProfileTab('notifications');
        
        // Populate profile settings with current values
        profileDisplayName.value = state.userDisplayName || '';
        profileAvatarPreview.src = state.userAvatarUrl || 'https://ui-avatars.com/api/?name=User&background=random';
        currentAvatarUrl = state.userProfile?.avatar_url || null;
        pendingAvatarFile = null;
        profileMessage.style.display = 'none';
        
        // Show modal
        profileModal.style.display = 'flex';
        
        // Load notifications
        await loadNotifications();
        
        // Mark all as read and update badge
        await backend.markNotificationsRead();
        notificationBadge.style.display = 'none';
    });
    
    // Clear all notifications
    clearNotificationsBtn.addEventListener('click', async () => {
        clearNotificationsBtn.disabled = true;
        clearNotificationsBtn.textContent = 'Clearing...';
        
        await backend.clearAllNotifications();
        notificationsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No notifications</div>';
        
        clearNotificationsBtn.disabled = false;
        clearNotificationsBtn.textContent = 'Clear All';
    });
    
    // Close notifications
    closeNotificationsBtn.addEventListener('click', () => {
        profileModal.style.display = 'none';
    });
    
    // Hover effect for profile button
    userProfileBtn.addEventListener('mouseenter', () => {
        userProfileBtn.style.background = 'var(--bg-secondary)';
    });
    userProfileBtn.addEventListener('mouseleave', () => {
        userProfileBtn.style.background = 'transparent';
    });
    
    // Handle avatar file selection
    profileAvatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showProfileMessage('Please select an image file', 'error');
            return;
        }
        
        // Validate file size (max 5MB before resize)
        if (file.size > 5 * 1024 * 1024) {
            showProfileMessage('Image too large (max 5MB)', 'error');
            return;
        }
        
        // Preview the image
        const reader = new FileReader();
        reader.onload = (e) => {
            profileAvatarPreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
        
        pendingAvatarFile = file;
        showProfileMessage('Avatar selected - click Save to upload', 'info');
    });
    
    // Save profile
    profileSaveBtn.addEventListener('click', async () => {
        const displayName = profileDisplayName.value.trim();
        
        // Validate display name
        if (displayName.length < 2 || displayName.length > 32) {
            showProfileMessage('Display name must be 2-32 characters', 'error');
            return;
        }
        
        profileSaveBtn.disabled = true;
        profileSaveBtn.textContent = 'Saving...';
        
        try {
            let newAvatarUrl = currentAvatarUrl;
            
            // Upload new avatar if selected
            if (pendingAvatarFile) {
                showProfileMessage('Uploading avatar...', 'info');
                
                const uploadResult = await backend.uploadAvatar(pendingAvatarFile, state.currentUser.id);
                
                if (!uploadResult.success) {
                    showProfileMessage('Failed to upload avatar: ' + uploadResult.error, 'error');
                    profileSaveBtn.disabled = false;
                    profileSaveBtn.textContent = 'Save Profile';
                    return;
                }
                
                // Delete old avatar if exists
                if (currentAvatarUrl) {
                    const oldFilename = currentAvatarUrl.split('/').pop();
                    backend.deleteAvatar(oldFilename);
                }
                
                newAvatarUrl = uploadResult.url;
            }
            
            // Save profile to database
            showProfileMessage('Saving profile...', 'info');
            const saveResult = await backend.saveProfile(state.currentUser.id, displayName, newAvatarUrl);
            
            if (!saveResult.success) {
                showProfileMessage('Failed to save: ' + saveResult.error, 'error');
                profileSaveBtn.disabled = false;
                profileSaveBtn.textContent = 'Save Profile';
                return;
            }
            
            // Update local state
            state.userDisplayName = displayName;
            state.userAvatarUrl = newAvatarUrl || state.userAvatarUrl;
            state.userProfile = saveResult.profile;
            
            // Update header UI
            document.getElementById('username').textContent = displayName;
            if (newAvatarUrl) {
                document.getElementById('userAvatar').src = newAvatarUrl;
            }
            
            showProfileMessage('Profile saved!', 'success');
            
            // Close modal after short delay
            setTimeout(() => {
                profileModal.style.display = 'none';
            }, 1000);
            
        } catch (error) {
            console.error('Profile save error:', error);
            showProfileMessage('Error: ' + error.message, 'error');
        } finally {
            profileSaveBtn.disabled = false;
            profileSaveBtn.textContent = 'Save Profile';
        }
    });
    
    // Cancel profile edit
    profileCancelBtn.addEventListener('click', () => {
        pendingAvatarFile = null;
        profileModal.style.display = 'none';
    });
    
    // Close on backdrop click
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) {
            pendingAvatarFile = null;
            profileModal.style.display = 'none';
        }
    });
    
    function showProfileMessage(message, type) {
        profileMessage.textContent = message;
        profileMessage.style.display = 'block';
        profileMessage.style.background = type === 'error' ? '#ff4444' : 
                                          type === 'success' ? '#44aa44' : 
                                          'var(--bg-secondary)';
        profileMessage.style.color = type === 'info' ? 'var(--text-primary)' : 'white';
    }
    
    // ==================== End Profile Popup ====================
    
    // Volume control
    document.getElementById('volumeSlider').addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        CONFIG.volume = vol;
        if (state.gainNode) state.gainNode.gain.value = vol;
    });
    
    // Pixel scale control
    document.getElementById('pixelScaleSlider').addEventListener('input', (e) => {
        const scaleIndex = parseInt(e.target.value);
        const scales = [1, 2, 3, 4, 6, 8];
        state.pixelScale = scales[scaleIndex];
        if (state.uniformBuilder) {
            state.uniformBuilder.setPixelSize(state.pixelScale);
        }
        ui.updateCanvasSize(state.canvasWidth, state.canvasHeight, true);
    });
    
    // Render mode cycling
    document.getElementById('renderModeIcon').addEventListener('click', () => {
        console.log('Render mode button clicked, current mode:', state.renderMode);
        state.renderMode = (state.renderMode + 1) % 2;
        console.log('  -> New mode:', state.renderMode);
        ui.updateRenderMode();
    });
    
    // Colorspace toggle (sRGB vs linear)
    document.getElementById('colorspaceIcon').addEventListener('click', () => {
        const newLinear = !state.linearColorspace;
        
        // Update backend based on current graphics mode
        if (state.graphicsBackend === 'webgpu') {
            webgpu.setColorspace(newLinear);
        } else if (state.graphicsBackend === 'webgl') {
            webgl.setColorspace(newLinear);
        } else {
            state.linearColorspace = newLinear;
        }
        
        // Update UI
        ui.updateColorspaceIcon();
    });
    
    setupPointerEvents();
    
    // Handle visibility change - resync audio timing when tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.audioContext && state.isPlaying) {
            const ctx = state.audioContext;
            state.nextAudioTime = Math.ceil(ctx.currentTime / CONFIG.audioBlockDuration) * CONFIG.audioBlockDuration;
            state.pendingAudio = false;
        }
    });
    
    // Custom events
    window.addEventListener('toggle-theme', ui.toggleTheme);
    window.addEventListener('toggle-vim', vim.toggleVimMode);
    window.addEventListener('toggle-js-exec-mode', audio.toggleJSExecMode);
    window.addEventListener('load-example', (e) => loadExample(e.detail));
    
    // Browser back/forward navigation support (for OLD example URLs - deprecated)
    window.addEventListener('hashchange', () => {
        const urlShader = routing.getShaderFromURL();
        // Only load if it's an old-style example URL (no 'id=' present)
        if (urlShader && !window.location.hash.includes('id=') && urlShader !== state.currentExample) {
            console.log('[OLD FORMAT] Navigating to example from URL:', urlShader);
            loadExample(urlShader);
        }
    });
    window.addEventListener('stop-audio', compiler.stopAudio);
    window.addEventListener('tab-removed-recompile', () => {
        if (state.isRunning) {
            compiler.reloadShader();
        }
    });
    
    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (state.isDirty) {
            e.preventDefault();
            e.returnValue = ''; // Chrome requires returnValue to be set
            return ''; // Some browsers need a return value
        }
    });
}

function setupPointerEvents() {
    if (pointerEventsAttached) return;
    const canvases = [state.canvasWebGL, state.canvasWebGPU];
    canvases.forEach(canvas => attachPointerListeners(canvas));
    pointerEventsAttached = true;
}

function attachPointerListeners(canvas) {
    if (!canvas) return;
    
    // Only attach pointerdown - other listeners added dynamically during drag
    // This pattern matches the working UI system sliders
    canvas.addEventListener('pointerdown', (event) => {
        // For mouse, only accept primary button (left click)
        if (event.pointerType === 'mouse') {
            if (event.button !== undefined && event.button !== 0) return;
        }
        
        const pos = getPointerPosition(canvas, event);
        if (!pos) return;
        event.preventDefault();
        
        // Capture pointer on the element for reliable mobile tracking
        canvas.setPointerCapture(event.pointerId);
        
        // Set initial state
        state.activePointerId = event.pointerId;
        state.mouseIsDown = true;
        state.mouseDragX = pos.pixelX;
        state.mouseDragY = pos.pixelY;
        state.mouseLastDownX = pos.pixelX;
        state.mouseLastDownY = pos.pixelY;
        state.mouseClickX = pos.pixelX;
        state.mouseClickY = pos.pixelY;
        state.mouseClickPhase = 'pressed';
        updateHoverState(pos);
        
        // Move handler - attached to element, not document
        const handleMove = (e) => {
            const movePos = getPointerPosition(canvas, e);
            if (!movePos) return;
            e.preventDefault();
            
            updateHoverState(movePos);
            state.mouseDragX = movePos.pixelX;
            state.mouseDragY = movePos.pixelY;
            state.mouseLastDownX = movePos.pixelX;
            state.mouseLastDownY = movePos.pixelY;
        };
        
        // Up/cancel handler - clean up
        const handleUp = (e) => {
            canvas.releasePointerCapture(e.pointerId);
            canvas.removeEventListener('pointermove', handleMove);
            canvas.removeEventListener('pointerup', handleUp);
            canvas.removeEventListener('pointercancel', handleUp);
            
            const upPos = getPointerPosition(canvas, e);
            if (upPos) {
                updateHoverState(upPos);
            }
            
            state.activePointerId = null;
            state.mouseIsDown = false;
            state.mouseClickPhase = 'released';
        };
        
        // Attach move/up/cancel to the element itself
        canvas.addEventListener('pointermove', handleMove);
        canvas.addEventListener('pointerup', handleUp);
        canvas.addEventListener('pointercancel', handleUp);
        
    }, { passive: false });
}

function getPointerPosition(canvas, event) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    
    const rawX = (event.clientX - rect.left) / rect.width;
    const rawY = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
    
    const normX = Math.min(1, Math.max(0, rawX));
    const normY = Math.min(1, Math.max(0, 1 - rawY));
    
    const width = canvas.width || state.canvasWidth;
    const height = canvas.height || state.canvasHeight;
    const pixelX = normX * width;
    const pixelY = normY * height;
    
    return { pixelX, pixelY, normX, normY };
}

function updateHoverState(pos) {
    state.mouseHoverX = pos.pixelX;
    state.mouseHoverY = pos.pixelY;
    state.mouseX = pos.normX;
    state.mouseY = pos.normY;
}

// ============================================================================
// Canvas Management - Thin wrapper to ui module
// ============================================================================

// This wrapper is kept for window exposure and backwards compatibility
async function updateCanvasSize(width, height, recompile = true) {
    return await ui.updateCanvasSize(width, height, recompile);
}

// ============================================================================
// Top-Level Panel Switching - Thin wrapper to ui module
// ============================================================================

// This wrapper is kept for backwards compatibility
function switchTopLevelPanel(panelName) {
    ui.switchTopLevelPanel(panelName);
}

// ============================================================================
// Community Features - Thin wrappers to community module
// ============================================================================

// This wrapper is kept for window exposure
async function updateViewsAndLikes(shader) {
    return await community.updateViewsAndLikes(shader);
}

// ============================================================================
// Save Button Setup (Database Only)
// ============================================================================

function setupSaveButton() {
    // Save button handler - saves owned shaders
    document.getElementById('saveShaderBtn').addEventListener('click', shaderManagement.handleSaveClick);
    
    // Fork button handler - creates a copy
    document.getElementById('forkShaderBtn').addEventListener('click', shaderManagement.handleForkClick);
    
    // Custom events
    window.addEventListener('shader-saved', (e) => {
        const shader = e.detail;
        
        if (shader && shader.id) {
            // Database save - use optimistic update
            save.addShaderToCache(shader);
        }
        
        shaderManagement.updateSaveButton();
    });
    window.addEventListener('shader-deleted', (e) => {
        const shaderId = e.detail?.id;
        if (shaderId) {
            save.removeShaderFromCache(shaderId);
        }
        // No need to call populateGallery() - optimistic update handles it
        shaderManagement.updateSaveButton();
    });
    window.addEventListener('shader-loaded', (e) => {
        const shader = e.detail;
        
        // Temporarily disable dirty tracking while loading
        const wasInitializing = state.isInitializing;
        state.isInitializing = true;
        
        // Update save button
        shaderManagement.updateSaveButton();
        
        // Don't change canvas size or pixel scale - use current values
        
        // Update shader info
        document.getElementById('shaderTitleDisplay').textContent = shader.title;
        document.getElementById('shaderCreator').textContent = shader.creator ? `by ${shader.creator}` : '';
        document.getElementById('shaderDescriptionDisplay').textContent = shader.description || '';
        updateLicenseDisplay(shader.license || 'default');
        
        // Update UI
        tabs.renderTabs();
        
        // Switch to saved tab (or first tab)
        if (shader.currentTab && state.activeTabs.includes(shader.currentTab)) {
            tabs.switchTab(shader.currentTab);
        } else if (state.activeTabs.length > 0) {
        tabs.switchTab(state.activeTabs[0]);
        }
        
        // Reload shader and restart (maintains play/pause state)
        if (state.isRunning) {
            compiler.reloadShader().then(() => {
                ui.restart();
                // Re-enable dirty tracking after load completes
                setTimeout(() => {
                    state.isInitializing = wasInitializing;
                }, 100);
            });
        } else {
            // Re-enable dirty tracking immediately if not running
            setTimeout(() => {
                state.isInitializing = wasInitializing;
            }, 100);
        }
    });
}

// ============================================================================
// License Display Helper
// ============================================================================

function initLicenseDropdown() {
    const licenseSelect = document.getElementById('shaderLicenseSelect');
    if (!licenseSelect) return;
    
    // Clear and populate dropdown with license options
    licenseSelect.innerHTML = '';
    for (const [key, info] of Object.entries(LICENSE_TYPES)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = info.name;
        option.title = info.tooltip;
        licenseSelect.appendChild(option);
    }
}

function updateLicenseDisplay(licenseKey) {
    const licenseDisplay = document.getElementById('shaderLicenseDisplay');
    if (!licenseDisplay) return;
    
    const license = LICENSE_TYPES[licenseKey] || LICENSE_TYPES.default;
    const nameSpan = licenseDisplay.querySelector('.license-name');
    if (nameSpan) {
        nameSpan.textContent = license.name;
    }
    licenseDisplay.title = license.tooltip;
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    // Load settings
    const settings = loadSettings();
    if (settings.isDarkMode !== undefined) {
        state.isDarkMode = settings.isDarkMode;
    }
    if (settings.isVimMode !== undefined) {
        state.isVimMode = settings.isVimMode;
    }
    if (settings.jsExecutionMode !== undefined) {
        // Always use sandboxed mode now (ignore saved setting)
        state.jsExecutionMode = 'sandboxed';
    }
    ui.applyTheme();
    
    setupUI();
    setupSaveButton();
    initLicenseDropdown();
    
    // Initialize media and channels
    await mediaLoader.loadMediaCatalog();
    channels.init();
    
    // Initialize backend (Supabase auth)
    backend.init();
    
    // Populate default gallery tab (after backend init so Supabase is ready)
    save.populateGallery('genuary');
    
    // Performance monitor disabled - kept for future use
    // perfMonitor.init();
    
    // Initialize uniform controls
    uniformControls.init();
    
    // Initialize fullscreen mode
    fullscreen.init();
    aiAssistSettings.init();
    
    // Initialize Shadertoy Browser
    shadertoyBrowser.init();
    shadertoyBrowser.setImportCallback(handleShadertoyImport);
    const stBrowserBtn = document.getElementById('shadertoyBrowserBtn');
    if (stBrowserBtn) {
        stBrowserBtn.addEventListener('click', () => shadertoyBrowser.open());
    }
    
    // Performance monitor mini visualization disabled
    // const perfBtn = document.getElementById('perfMonitorBtn');
    // const miniCanvas = perfMonitor.createMiniVisualization();
    // perfBtn.appendChild(miniCanvas);
    
    // Initialize audio FIRST
    audio.initWebAudio();
    
    // Initialize uniform builder (needed for uniform controls)
    state.uniformBuilder = new UniformBuilder();
    state.uniformBuilder.setPixelSize(state.pixelScale || 1);
    
    // Initialize Monaco with empty initial code (actual shader will load after init)
    const initialCode = {
        boilerplate: getBoilerplate(),
        graphics: '',
        audio: '',
        audioLanguage: 'wgsl',
        js: MINIMAL_JS
    };
    
    await editor.initMonaco(null, initialCode);
    
    // Set up dirty tracking for all editors
    // (markDirty checks isInitializing flag to prevent marking during load)
    shaderManagement.setupDirtyTracking(state.graphicsEditor);
    shaderManagement.setupDirtyTracking(state.audioEditor);
    shaderManagement.setupDirtyTracking(state.jsEditor);
    shaderManagement.setupDirtyTracking(state.boilerplateEditor);
    // Help is read-only, no need to track
    
    // Load vim library asynchronously after a short delay
    // This ensures Monaco has fully loaded all its language modules first
    setTimeout(() => {
    vim.loadVimLibrary().then((success) => {
        if (success) {
            // Apply vim mode state (will show/hide status bar accordingly)
            vim.applyVimMode();
        }
    });
    }, 1000);
    
    // Try to initialize WebGPU first (hello_world is WGSL)
    const webgpuResult = await webgpu.init(state.canvasWebGPU);
    state.hasWebGPU = webgpuResult.success;
    
    // Don't initialize WebGL yet - can't share canvas context with WebGPU
    // WebGL will be initialized on-demand when a GLSL shader is loaded
    state.hasWebGL = true;  // Assume available (WebGL2 is widely supported)
    
    console.log('Graphics backends:', {
        WebGPU: state.hasWebGPU,
        WebGL: '(not initialized - will init on-demand)'
    });
    
    // Gallery will be populated by auth state change listener in backend.js
    
    // Check if a shader is specified in URL
    const urlHash = window.location.hash;
    let shaderToLoad = null;
    
    // Check for #g: (golf shader in URL) - handle this before loading defaults
    if (urlHash.startsWith('#g:')) {
        const code = decodeURIComponent(urlHash.substring(3));
        console.log('Loading golf shader from URL on init:', code.length, 'chars');
        
        // Mark as anonymous golf URL view (read-only)
        state.isAnonymousGolfURL = true;
        
        // Reset channels for new shader
        channels.resetChannels();
        
        // Set up golf tab
        state.activeTabs = ['glsl_golf'];
        state.currentTab = 'glsl_golf';
        
        // Load the code
        state.graphicsEditor.setValue(code);
        
        // Update tabs and compile
        tabs.renderTabs();
        tabs.switchTab('glsl_golf');
        
        await compiler.reloadShader();
        
        // Set title and description for anonymous golf shader (set display elements BEFORE enterEditMode)
        const titleDisplay = document.getElementById('shaderTitleDisplay');
        const descDisplay = document.getElementById('shaderDescriptionDisplay');
        if (titleDisplay && descDisplay) {
            titleDisplay.textContent = `Golfed: ${code.length} chars of code from url`;
            descDisplay.textContent = `Use http://gsl.golf/#g:${code} to get here`;
        }
        
        // Start render loop
        console.log('Starting render loop for golf shader, canvas size:', state.canvasWebGL.width, 'x', state.canvasWebGL.height);
        render.start();
        
        // Set up playback state
        state.isRunning = true;
        ui.restart();
        state.isPlaying = true;
        state.audioContext.resume();
        ui.updatePlayPauseButton();
        
        // For anonymous golf URLs, do NOT enter edit mode - keep the display-only view
        // The title/description are already set in the display elements above
        
        // Mark initialization complete
        setTimeout(() => {
            state.isInitializing = false;
        }, 200);
        
        // Setup navigation listeners and return (don't load default example)
        routing.setupNavigationListeners();
        return;
    }
    
    // Check for #id=slug (database shader)
    if (urlHash.includes('id=')) {
        const slug = urlHash.split('id=')[1]?.split('&')[0];
        if (slug) {
            console.log('Loading shader from URL slug:', slug);
            const result = await backend.loadShader(slug);
            if (result.success) {
                shaderToLoad = result.shader;
            } else {
                console.warn('Failed to load shader from URL:', result.error);
            }
        }
    } 
    // If it's an old-style #shader= URL (before database migration), clear it
    else if (urlHash.includes('shader=')) {
        console.log('Clearing old example URL format');
        window.history.replaceState(null, '', window.location.pathname);
    }
    
    // If still nothing, load default example
    if (!shaderToLoad) {
        const defaultSlug = 'x4yrjxhgw';
        const defaultResult = await backend.loadShader(defaultSlug);
        
        if (defaultResult.success) {
            shaderToLoad = defaultResult.shader;
            console.log('Loading default example:', shaderToLoad.title);
        } else {
            console.warn('Failed to load default shader, falling back to first example');
            const examplesResult = await backend.loadExamples();
            if (examplesResult.success && examplesResult.shaders.length > 0) {
                shaderToLoad = examplesResult.shaders[0];
                console.log('Loading first example:', shaderToLoad.title);
            }
        }
    }
    
    // Load the shader
    if (shaderToLoad) {
        console.log('Loading shader:', shaderToLoad.title);
        save.loadDatabaseShader(shaderToLoad);
        // Note: loadDatabaseShader() calls reloadShader() internally
    } else {
        // Fallback if no shaders in database yet
    tabs.renderTabs();
        tabs.switchTab('glsl_fragment');
        
        // Only compile if we didn't load a database shader
        const compileSuccess = await compiler.reloadShader();
        console.log('Initial shader compilation:', compileSuccess ? 'success' : 'failed');
    }
    
    // IMPORTANT: Start render loop BEFORE setting isRunning = true
    console.log('Starting render loop, canvas size:', state.canvasWebGPU.width, 'x', state.canvasWebGPU.height);
        render.start();
    
    // Initialize render mode (must be AFTER graphics backend is set)
    ui.updateRenderMode();
    
    // Now set up playback state
    state.isRunning = true;
    ui.restart();
    
    // Only auto-start playback if AudioContext is running (not suspended)
    // If suspended, the audio start overlay will handle starting playback


    state.isPlaying = true;
    
    if (state.audioContext?.state === 'running') {

        ui.updatePlayPauseButton();
    } else {
        // Keep paused until user interacts with overlay
        state.isPlaying = false;
        ui.updatePlayPauseButton();
    }
    
    // Mark initialization complete - now dirty tracking can start
    // Small delay to ensure all initial setValue calls have completed
    setTimeout(() => {
        state.isInitializing = false;
    }, 200);
}


// Make some functions global for Monaco keyboard shortcuts and backend
window.reloadShader = compiler.reloadShader;
window.togglePlayPause = ui.togglePlayPause;
window.showAuthMessage = ui.showAuthMessage;

// Expose JS execution mode switcher for testing
window.setJSExecutionMode = (mode) => {
    const validModes = ['function', 'module', 'sandboxed'];
    if (!validModes.includes(mode)) {
        console.error(`Invalid mode. Use: ${validModes.join(', ')}`);
        return;
    }
    
    state.jsExecutionMode = mode;
    console.log(`✓ JS Execution Mode set to: ${mode}`);
    console.log('  Recompile shader to apply changes');
    
    if (mode === 'sandboxed') {
        console.log('  🔒 SANDBOXED MODE: User code runs in isolated AudioWorklet');
        console.log('     - No DOM access');
        console.log('     - No network access');
        console.log('     - Browser-enforced isolation');
    }
};
window.hideAuthMessage = ui.hideAuthMessage;
window.updateSaveButton = shaderManagement.updateSaveButton;
window.isShaderOwnedByUser = shaderManagement.isShaderOwnedByUser;
window.isInEditMode = shaderManagement.isInEditMode;
window.enterEditMode = shaderManagement.enterEditMode;
window.exitEditMode = shaderManagement.exitEditMode;
window.save = save; // Expose save module for backend.js
window.backend = backend; // Expose backend module for performance monitor
window.updateViewsAndLikes = updateViewsAndLikes; // Expose for save.js
window.createNewShader = createNewShader; // Expose for UI
window.updateCanvasSize = updateCanvasSize; // Expose for UI

// Setup navigation listeners
routing.setupNavigationListeners();

// Start application
window.addEventListener('load', init);

