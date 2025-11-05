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

// ============================================================================
// Navigation Handler
// ============================================================================

let isNavigating = false;
let previousHash = window.location.hash;

export async function handleHashChange() {
    // Prevent recursive calls
    if (isNavigating) return;
    
    const urlHash = window.location.hash;
    
    // Check for unsaved changes
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
    // If hash is cleared, load first example
    else if (!urlHash || urlHash === '#') {
        const examplesResult = await backend.loadExamples();
        if (examplesResult.success && examplesResult.shaders.length > 0) {
            save.loadDatabaseShader(examplesResult.shaders[0]);
        }
    }
}

// ============================================================================
// Setup Navigation Listeners
// ============================================================================

export function setupNavigationListeners() {
    window.addEventListener('hashchange', handleHashChange);
}

