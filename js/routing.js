// ============================================================================
// URL Routing and Navigation
// ============================================================================
// This module handles URL-based shader loading and browser navigation.

import { state } from './core.js';
import * as backend from './backend.js';
import * as save from './save.js';
import * as shaderManagement from './shader-management.js';

// ============================================================================
// URL Parameter Handling
// ============================================================================

export function getShaderFromURL() {
    // Support both hash (#shader=example) and query params (?shader=example)
    // Hash is preferred because it doesn't trigger page reload
    
    const hash = window.location.hash.slice(1); // Remove '#'
    const params = new URLSearchParams(hash);
    
    // Check for example shader: #shader=glsl_hello
    if (params.has('shader')) {
        return params.get('shader');
    }
    
    // Check for future backend shader: #id=abc123def
    if (params.has('id')) {
        // When backend is ready, this will fetch from database
        // For now, return null (no backend yet)
        const shaderId = params.get('id');
        console.log('Backend shader ID detected:', shaderId, '(backend not implemented yet)');
        return null;
    }
    
    return null;
}

export function updateURLForShader(identifier, isExample = true) {
    // Update URL without triggering page reload
    const param = isExample ? 'shader' : 'id';
    const newHash = `#${param}=${identifier}`;
    
    // Only update if different to avoid history spam
    if (window.location.hash !== newHash) {
        window.history.pushState(null, '', newHash);
    }
}

export function generateShareableLink(identifier, isExample = true) {
    const param = isExample ? 'shader' : 'id';
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#${param}=${identifier}`;
}

/**
 * Generate a shareable URL for a golf shader
 * @param {string} code - The golf shader code
 * @returns {string} - URL with encoded golf shader
 */
export function generateGolfURL(code) {
    const baseUrl = window.location.origin + window.location.pathname;
    const encoded = encodeURIComponent(code);
    return `${baseUrl}#g:${encoded}`;
}

/**
 * Update URL to golf format when in golf mode
 * @param {string} code - The golf shader code
 */
export function updateURLForGolf(code) {
    const encoded = encodeURIComponent(code);
    const newHash = `#g:${encoded}`;
    
    // Only update if different
    if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
    }
}

// ============================================================================
// Navigation Handler
// ============================================================================

let isNavigating = false;
let previousHash = window.location.hash;

export async function handleHashChange() {
    // Prevent recursive calls
    if (isNavigating) return;
    
    const urlHash = window.location.hash;
    
    // Check for #g: (golf shader in URL)
    if (urlHash.startsWith('#g:')) {
        const code = decodeURIComponent(urlHash.substring(3));
        console.log('Loading golf shader from URL:', code.length, 'chars');
        
        // Check for unsaved changes
        if (state.isDirty) {
            const message = 'You have unsaved changes. Load golf shader from URL anyway?';
            if (!confirm(message)) {
                isNavigating = true;
                window.history.replaceState(null, '', previousHash || '#');
                isNavigating = false;
                return;
            }
        }
        
        // Update previous hash
        previousHash = urlHash;
        
        // Create new golf shader with the URL code
        // Import needed functions dynamically to avoid circular dependencies
        const { createNewShader } = await import('./index.js');
        
        // Clear state
        state.currentExample = null;
        state.currentDatabaseShader = null;
        state.isDirty = false;
        state.isInitializing = true;
        
        // Reset channels
        const channels = await import('./channels.js');
        channels.resetChannels();
        
        // Set up golf tab
        state.activeTabs = ['glsl_golf'];
        state.currentTab = 'glsl_golf';
        
        // Load the code
        if (state.graphicsEditor) {
            state.graphicsEditor.setValue(code);
        }
        
        // Update tabs and compile
        const tabs = await import('./tabs.js');
        tabs.renderTabs();
        tabs.switchTab('glsl_golf');
        
        const compiler = await import('./compiler.js');
        await compiler.reloadShader();
        
        setTimeout(() => {
            state.isInitializing = false;
        }, 100);
        
        // Enter edit mode
        shaderManagement.enterEditMode(true);
        
        return;
    }
    
    // Check for unsaved changes (for non-golf navigation)
    if (state.isDirty) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        if (!confirm(message)) {
            // User cancelled - restore previous hash without triggering another event
            isNavigating = true;
            window.history.replaceState(null, '', previousHash || '#');
            isNavigating = false;
            return;
        }
        // User confirmed - clear dirty flag and update button
        state.isDirty = false;
        shaderManagement.updateSaveButton();
    }
    
    // Update previous hash for next navigation
    previousHash = urlHash;
    
    // Check for #id=slug (database shader)
    if (urlHash.includes('id=')) {
        const slug = urlHash.split('id=')[1]?.split('&')[0];
        if (slug) {
            console.log('Loading shader from navigation:', slug);
            const result = await backend.loadShader(slug);
            if (result.success) {
                save.loadDatabaseShader(result.shader);
            } else {
                console.warn('Failed to load shader:', result.error);
            }
        }
    } 
    // If hash is cleared, load default example
    else if (!urlHash || urlHash === '#') {
        // Load specific default shader by slug
        const defaultSlug = 'x4yrjxhgw';
        const defaultResult = await backend.loadShader(defaultSlug);
        
        if (defaultResult.success) {
            save.loadDatabaseShader(defaultResult.shader);
        } else {
            // Fallback to first example if default not found
            console.warn('Failed to load default shader, falling back to first example');
            const examplesResult = await backend.loadExamples();
            if (examplesResult.success && examplesResult.shaders.length > 0) {
                save.loadDatabaseShader(examplesResult.shaders[0]);
            }
        }
    }
}

// ============================================================================
// Setup Navigation Listeners
// ============================================================================

export function setupNavigationListeners() {
    window.addEventListener('hashchange', handleHashChange);
}

