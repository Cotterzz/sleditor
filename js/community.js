// ============================================================================
// Community Features - Likes and Views
// ============================================================================
// This module handles shader likes, views, and real-time community interactions.

import { state, logStatus } from './core.js';
import * as backend from './backend.js';

// ============================================================================
// Views and Likes Management
// ============================================================================

export async function updateViewsAndLikes(shader) {
    const viewCountEl = document.getElementById('viewCount');
    const likeCountEl = document.getElementById('likeCount');
    const likeButton = document.getElementById('likeButton');
    const likeIcon = document.getElementById('likeIcon');
    const likeText = document.getElementById('likeText');
    
    if (!shader || !shader.id) {
        // No shader loaded, hide/reset UI
        if (viewCountEl) viewCountEl.textContent = '0';
        if (likeCountEl) likeCountEl.textContent = '0';
        if (likeButton) likeButton.classList.remove('liked');
        if (likeIcon) likeIcon.textContent = '🤍';
        if (likeText) likeText.textContent = 'Like';
        backend.unsubscribeFromLikes();
        return;
    }
    
    // Update view count
    if (viewCountEl) {
        viewCountEl.textContent = shader.view_count || '0';
    }
    
    // Increment view count in background (don't await)
    backend.incrementViewCount(shader.id).then(newCount => {
        if (viewCountEl && newCount) {
            viewCountEl.textContent = newCount;
        }
    });
    
    // Update like count
    if (likeCountEl) {
        likeCountEl.textContent = shader.like_count || '0';
    }
    
    // Check if user has liked this shader
    console.log('🔍 Checking initial like state for shader:', shader.id);
    const isLiked = await backend.checkIfLiked(shader.id);
    console.log('📌 Initial like state:', isLiked);
    updateLikeButtonState(isLiked);
    
    // Subscribe to real-time like updates
    backend.subscribeToLikes(shader.id, (newCount, newIsLiked) => {
        if (likeCountEl) {
            likeCountEl.textContent = newCount;
        }
        
        // Update cached shader data if this is the currently loaded shader
        if (state.currentDatabaseShader && state.currentDatabaseShader.id === shader.id) {
            state.currentDatabaseShader.like_count = newCount;
        }
        
        // Update gallery thumbnail if it exists
        const galleryThumb = document.querySelector(`[data-shader-id="${shader.id}"] .gallery-likes`);
        if (galleryThumb) {
            galleryThumb.textContent = newCount;
        }
        
        // Animate if count changed (someone else liked)
        const currentIsLiked = likeButton?.classList.contains('liked');
        if (currentIsLiked === newIsLiked && likeIcon) {
            // Same like state but count changed = someone else liked/unliked
            animateLikeIcon();
        }
        
        updateLikeButtonState(newIsLiked);
    });
}

function updateLikeButtonState(isLiked) {
    const likeButton = document.getElementById('likeButton');
    const likeIcon = document.getElementById('likeIcon');
    const likeText = document.getElementById('likeText');
    
    console.log('🔄 Updating like button state to:', isLiked ? 'LIKED' : 'NOT LIKED');
    
    if (!likeButton) return;
    
    if (isLiked) {
        likeButton.classList.add('liked');
        if (likeIcon) likeIcon.textContent = '❤️';
        if (likeText) likeText.textContent = 'Liked';
    } else {
        likeButton.classList.remove('liked');
        if (likeIcon) likeIcon.textContent = '🤍';
        if (likeText) likeText.textContent = 'Like';
    }
}

function animateLikeIcon() {
    const likeIcon = document.getElementById('likeIcon');
    if (!likeIcon) return;
    
    likeIcon.classList.remove('like-animate');
    // Force reflow to restart animation
    void likeIcon.offsetWidth;
    likeIcon.classList.add('like-animate');
    
    // Remove animation class after it completes
    setTimeout(() => {
        likeIcon.classList.remove('like-animate');
    }, 300);
}

// ============================================================================
// Like Click Handler
// ============================================================================

let isLikeActionPending = false;

export async function handleLikeClick() {
    const shader = state.currentDatabaseShader;
    if (!shader || !shader.id) return;
    
    if (!state.currentUser) {
        logStatus('Please sign in to like shaders', 'error');
        return;
    }
    
    // Prevent double-clicks
    if (isLikeActionPending) return;
    isLikeActionPending = true;
    
    const likeButton = document.getElementById('likeButton');
    const isCurrentlyLiked = likeButton?.classList.contains('liked');
    
    // Disable button during action
    likeButton.style.opacity = '0.5';
    likeButton.style.pointerEvents = 'none';
    
    // Animate the icon
    animateLikeIcon();
    
    // Toggle like - DON'T update UI here, let the real-time subscription handle it
    try {
        if (isCurrentlyLiked) {
            await backend.unlikeShader(shader.id);
        } else {
            await backend.likeShader(shader.id);
        }
        
        // Wait a moment for the subscription to update
        await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
        // Re-enable button
        likeButton.style.opacity = '1';
        likeButton.style.pointerEvents = 'auto';
        isLikeActionPending = false;
    }
}

