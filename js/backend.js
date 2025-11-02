// ============================================================================
// Backend - Supabase Authentication & Storage
// ============================================================================

import { state, logStatus } from './core.js';
import * as perfMonitor from './performance-monitor.js';

// Supabase credentials (set at module level so they're available immediately)
const SUPABASE_URL = 'https://vnsdnskppjwktvksxxvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuc2Ruc2twcGp3a3R2a3N4eHZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NTY3NzUsImV4cCI6MjA3NzAzMjc3NX0.aBQBLgDm0iDpuHZoN_SY-hNe_Z0oX4caFx4glI1Dm1M';

let supabase = null;

export function init() {
    // Check if credentials are set
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
        console.warn('⚠️ Supabase credentials not configured in js/backend.js');
        console.warn('Get your credentials from: Supabase Dashboard → Project Settings → API');
        return;
    }
    
    // Initialize Supabase client
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✓ Supabase initialized');
    
    // Listen for auth state changes
    // This handles both initial session and subsequent auth changes
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            onUserSignedIn(session.user);
        } else if (event === 'SIGNED_OUT') {
            onUserSignedOut();
        } else if (event === 'INITIAL_SESSION' && !session) {
            // No session on initial load - populate gallery with localStorage/examples
            if (window.save && window.save.populateGallery) {
                window.save.populateGallery();
            }
        }
    });
}

// Sign in with OAuth provider (GitHub, Google, etc.)
export async function signInWithOAuth(provider) {
    if (!supabase) {
        window.showAuthMessage?.('Supabase not initialized', 'error');
        return;
    }
    
    console.log('Signing in with', provider);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider, // 'github', 'google', 'facebook'
        options: {
            redirectTo: window.location.origin // Auto-detect local or production URL
        }
    });
    
    if (error) {
        window.showAuthMessage?.(`Sign in failed: ${error.message}`, 'error');
        console.error('Sign in error:', error);
    }
    // User will be redirected to OAuth provider
}

// Sign in with email/password
export async function signInWithEmail(email, password) {
    if (!supabase) {
        window.showAuthMessage?.('Supabase not initialized', 'error');
        return { success: false };
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) {
        window.showAuthMessage?.(`Sign in failed: ${error.message}`, 'error');
        return { success: false, error };
    }
    
    window.showAuthMessage?.('Signed in successfully!', 'success');
    return { success: true };
}

// Sign up with email/password
export async function signUpWithEmail(email, password, displayName) {
    if (!supabase) {
        window.showAuthMessage?.('Supabase not initialized', 'error');
        return { success: false };
    }
    
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            emailRedirectTo: window.location.origin,
            data: {
                display_name: displayName  // Store display name in user metadata
            }
        }
    });
    
    if (error) {
        window.showAuthMessage?.(`Sign up failed: ${error.message}`, 'error');
        return { success: false, error };
    }
    
    // Show prominent success message in modal
    window.showAuthMessage?.(
        '✓ Account created! Please check your email to confirm your account. ' +
        'Check your spam folder if you don\'t see it.',
        'success'
    );
    return { success: true };
}

// Sign out
export async function signOut() {
    if (!supabase) {
        window.showAuthMessage?.('Supabase not initialized', 'error');
        return;
    }
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
        logStatus('✗ Sign out failed', 'error');
        console.error(error);
    } else {
        logStatus('✓ Signed out', 'success');
    }
}

// Called when user signs in
function onUserSignedIn(user) {
    console.log('User signed in:', user);
    state.currentUser = user;
    
    // Extract user info (different providers have different metadata)
    // Priority: display_name (email signup) > full_name (OAuth) > user_name > name > email prefix
    const username = user.user_metadata?.display_name
                  || user.user_metadata?.full_name 
                  || user.user_metadata?.user_name 
                  || user.user_metadata?.name
                  || user.email?.split('@')[0]
                  || 'User';
    
    const avatarUrl = user.user_metadata?.avatar_url 
                   || user.user_metadata?.picture 
                   || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
    
    // Update UI - show user menu, hide sign in button
    document.getElementById('signInBtn').style.display = 'none';
    document.getElementById('userMenu').style.display = 'flex';
    document.getElementById('username').textContent = username;
    document.getElementById('userAvatar').src = avatarUrl;
    
    // Update save/fork button state
    if (window.updateSaveButton) {
        window.updateSaveButton();
    }
    
    // Refresh gallery to show user's database shaders instead of localStorage
    if (window.save && window.save.populateGallery) {
        window.save.populateGallery();
    }
    
    logStatus(`✓ Welcome, ${username}!`, 'success');
}

// Called when user signs out
function onUserSignedOut() {
    console.log('User signed out');
    state.currentUser = null;
    state.currentDatabaseShader = null;
    
    // Update UI - hide user menu, show sign in button
    document.getElementById('signInBtn').style.display = 'flex';
    document.getElementById('userMenu').style.display = 'none';
    
    // Update save/fork button state
    if (window.updateSaveButton) {
        window.updateSaveButton();
    }
    
    // Refresh gallery to show localStorage shaders instead of user shaders
    if (window.save && window.save.populateGallery) {
        window.save.populateGallery();
    }
    
    // Exit edit mode if in it
    if (window.exitEditMode && window.isInEditMode && window.isInEditMode()) {
        window.exitEditMode();
    }
    
    logStatus('✓ Signed out', 'success');
}

// Getters
export function getSupabase() {
    return supabase;
}

export function isSignedIn() {
    return state.currentUser !== null;
}

export function getCurrentUser() {
    return state.currentUser;
}

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Generate a public URL for a file in Supabase Storage
 * @param {string} bucket - Bucket name (e.g., 'thumbnails')
 * @param {string} path - File path within bucket (e.g., 'new.png')
 * @returns {string} - Public URL to the file
 */
export function getStorageUrl(bucket, path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Convenience function for thumbnail URLs
 * @param {string} filename - Filename (e.g., 'new.png')
 * @returns {string} - Public URL to the thumbnail
 */
export function getThumbnailUrl(filename) {
    return getStorageUrl('thumbnails', filename);
}

// ============================================================================
// Shader CRUD Operations
// ============================================================================

/**
 * Save shader to database
 * @param {Object} shaderData - Shader data to save
 * @returns {Object} { success, shader, error }
 */
export async function saveShader(shaderData) {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    if (!isSignedIn()) {
        return { success: false, error: 'Must be signed in to save' };
    }

    try {
        // Get current user's display name
        const currentUser = state.currentUser;
        const creatorName = currentUser?.user_metadata?.display_name 
                         || currentUser?.user_metadata?.full_name
                         || currentUser?.user_metadata?.user_name
                         || currentUser?.user_metadata?.name
                         || currentUser?.email?.split('@')[0]
                         || 'Anonymous';
        
        // Prepare data
        const data = {
            title: shaderData.title,
            description: shaderData.description || null,
            tags: shaderData.tags || [],
            code_types: shaderData.code_types || [],
            code: shaderData.code || {},
            visibility: shaderData.visibility || 'private',
            creator_name: creatorName
        };
        
        // Only include thumbnail_url if provided (don't overwrite with null on updates)
        if (shaderData.thumbnail_url) {
            data.thumbnail_url = shaderData.thumbnail_url;
        }

        let result;

        // Update existing shader
        if (shaderData.id) {
            result = await supabase
                .from('shaders')
                .update(data)
                .eq('id', shaderData.id)
                .select()
                .single();
        }
        // Insert new shader
        else {
            // For new shaders, ensure thumbnail_url is set (even if null)
            if (!data.thumbnail_url) {
                data.thumbnail_url = null;
            }
            
            result = await supabase
                .from('shaders')
                .insert(data)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        console.log('✓ Shader saved:', result.data);
        return { success: true, shader: result.data };

    } catch (error) {
        console.error('Save shader error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load shader by ID or slug
 * @param {string} idOrSlug - Shader ID (uuid) or slug
 * @returns {Object} { success, shader, error }
 */
export async function loadShader(idOrSlug) {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // Try loading by slug first (more common for URLs)
        let result = await supabase
            .from('shaders')
            .select('*')
            .eq('slug', idOrSlug)
            .single();

        // If not found, try by ID
        if (result.error && result.error.code === 'PGRST116') {
            result = await supabase
                .from('shaders')
                .select('*')
                .eq('id', idOrSlug)
                .single();
        }

        if (result.error) throw result.error;

        // SECURITY: Block access to JS shaders if not owned by current user (XSS risk)
        // Examples are trusted, so they're always allowed
        const shader = result.data;
        const hasJS = shader.code_types && (
            shader.code_types.includes('js') || 
            shader.code_types.includes('javascript')
        );
        
        if (hasJS) {
            const isOwner = state.currentUser && shader.user_id === state.currentUser.id;
            const isExample = shader.visibility === 'example';
            
            if (!isOwner && !isExample) {
                console.warn('⚠️ Access denied: JS shader not owned by current user');
                return { 
                    success: false, 
                    error: 'This shader contains JavaScript and is temporarily unavailable for security reasons.' 
                };
            }
        }

        console.log('✓ Shader loaded:', result.data);
        return { success: true, shader: result.data };

    } catch (error) {
        console.error('Load shader error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load all examples (visibility = 'example')
 * @returns {Object} { success, shaders, error }
 */
export async function loadExamples() {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // Fetch shaders
        const result = await supabase
            .from('shaders')
            .select('*')
            .eq('visibility', 'example')
            .order('created_at', { ascending: true });

        if (result.error) throw result.error;
        
        // Filter out WebGPU shaders if WebGPU is not available
        let filteredShaders = result.data;
        if (!state.hasWebGPU) {
            filteredShaders = result.data.filter(shader => {
                const codeTypes = shader.code_types || [];
                const hasGraphicsTab = codeTypes.includes('graphics');
                const isWGSL = hasGraphicsTab && (shader.code?.wgsl_graphics || shader.code?.graphics) && !shader.code?.glsl_fragment;
                const needsWebGPU = codeTypes.some(t => t === 'wgsl_graphics' || t === 'wgsl_audio' || t === 'audio_gpu') || isWGSL;
                return !needsWebGPU;
            });
        }
        
        // Examples are trusted - no need to filter JS
        // Use creator_name if available, fallback to "Community"
        const shadersWithUsername = filteredShaders.map(shader => ({
            ...shader,
            username: shader.creator_name || 'Community'
        }));

        return { success: true, shaders: shadersWithUsername };

    } catch (error) {
        console.error('Load examples error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load user's own shaders
 * @returns {Object} { success, shaders, error }
 */
export async function loadMyShaders() {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    if (!isSignedIn()) {
        return { success: false, error: 'Must be signed in' };
    }

    try {
        const result = await supabase
            .from('shaders')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('updated_at', { ascending: false });

        if (result.error) throw result.error;

        return { success: true, shaders: result.data };

    } catch (error) {
        console.error('Load my shaders error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load public/community shaders (published by users)
 * @returns {Object} { success, shaders, error }
 */
export async function loadPublicShaders() {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const result = await supabase
            .from('shaders')
            .select('*')
            .eq('visibility', 'published')
            .order('created_at', { ascending: false })
            .limit(50); // Limit to 50 most recent

        if (result.error) throw result.error;

        // SECURITY: Filter out shaders with JavaScript (XSS risk)
        // Remove this filter when JS sandboxing is fully implemented
        const filteredShaders = result.data.filter(shader => {
            const hasJS = shader.code_types && (
                shader.code_types.includes('js') || 
                shader.code_types.includes('javascript')
            );
            return !hasJS;
        });

        return { success: true, shaders: filteredShaders };

    } catch (error) {
        console.error('Load public shaders error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete shader by ID
 * @param {string} shaderId - Shader ID to delete
 * @returns {Object} { success, error }
 */
export async function deleteShader(shaderId) {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // First, get the shader to find its thumbnail
        const shaderResult = await supabase
            .from('shaders')
            .select('thumbnail_url')
            .eq('id', shaderId)
            .single();

        const thumbnailUrl = shaderResult.data?.thumbnail_url;

        // Delete shader from database
        const result = await supabase
            .from('shaders')
            .delete()
            .eq('id', shaderId);

        if (result.error) throw result.error;

        // Delete thumbnail from storage (fire-and-forget, non-critical)
        if (thumbnailUrl) {
            const filename = thumbnailUrl.split('/').pop();
            deleteThumbnail(filename).catch(err => {
                console.warn('Thumbnail cleanup on delete failed (non-critical):', err);
            });
        }

        console.log('✓ Shader deleted:', shaderId);
        return { success: true };

    } catch (error) {
        console.error('Delete shader error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Thumbnail Upload
// ============================================================================

/**
 * Upload thumbnail to Supabase Storage
 * @param {Blob} imageBlob - Image blob from canvas
 * @param {string} filename - Filename (e.g., 'abc123xyz.png')
 * @returns {Object} { success, url, error }
 */
export async function uploadThumbnail(imageBlob, filename) {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // Upload to storage
        const result = await supabase.storage
            .from('thumbnails')
            .upload(filename, imageBlob, {
                contentType: 'image/png',
                upsert: true  // Overwrite if exists
            });

        if (result.error) throw result.error;

        // Get public URL
        const url = getStorageUrl('thumbnails', filename);

        console.log('✓ Thumbnail uploaded:', url);
        return { success: true, url };

    } catch (error) {
        console.error('Upload thumbnail error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a thumbnail from storage
 * @param {string} filename - Filename (e.g., 'shader_abc123_1234567890.png')
 * @returns {Promise<Object>} { success, error }
 */
export async function deleteThumbnail(filename) {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const { error } = await supabase.storage
            .from('thumbnails')
            .remove([filename]);

        if (error) throw error;

        console.log('✓ Old thumbnail deleted:', filename);
        return { success: true };

    } catch (error) {
        console.error('Delete thumbnail error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Capture canvas as blob (for thumbnail upload)
 * @returns {Promise<Blob>}
 */
export async function captureThumbnailBlob() {
    const activeCanvas = state.graphicsBackend === 'webgl' ? state.canvasWebGL : state.canvasWebGPU;
    
    // For WebGL, wait a frame to ensure render is complete
    if (state.graphicsBackend === 'webgl') {
        await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    return new Promise((resolve, reject) => {
        activeCanvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to capture canvas'));
            }
        }, 'image/png', 0.8);
    });
}

// ============= VIEWS AND LIKES =============

export async function incrementViewCount(shaderId) {
    if (!supabase || !shaderId) return;

    try {
        // Increment the view count
        const { error } = await supabase.rpc('increment_view_count', { 
            shader_id: shaderId 
        });

        if (error) throw error;
        
        // Fetch updated count
        const { data } = await supabase
            .from('shaders')
            .select('view_count')
            .eq('id', shaderId)
            .single();
        
        return data?.view_count || 0;
    } catch (error) {
        console.error('Failed to increment view count:', error);
        return 0;
    }
}

export async function checkIfLiked(shaderId) {
    if (!supabase || !shaderId || !state.currentUser) {
        console.log('⚠️ checkIfLiked: Missing required data');
        return false;
    }

    try {
        // Select shader_id (which exists) or use count
        const { data, error } = await supabase
            .from('shader_likes')
            .select('shader_id')
            .eq('shader_id', shaderId)
            .eq('user_id', state.currentUser.id)
            .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 or 1 results

        if (error) {
            console.error('❌ checkIfLiked error:', error);
            return false;
        }

        const isLiked = !!data;
        console.log('✓ checkIfLiked result:', isLiked, 'for shader:', shaderId);
        return isLiked;
    } catch (error) {
        console.error('❌ Failed to check like status (catch):', error);
        return false;
    }
}

export async function likeShader(shaderId) {
    if (!supabase || !shaderId || !state.currentUser) {
        return { success: false, error: 'Must be logged in to like' };
    }

    try {
        console.log('❤️ Attempting to like shader:', shaderId);
        
        // Insert like (trigger will auto-update count)
        const { error } = await supabase
            .from('shader_likes')
            .insert({ 
                shader_id: shaderId,
                user_id: state.currentUser.id 
            });

        if (error) {
            console.error('Like insert error:', error);
            // Check if already liked (unique constraint violation)
            if (error.code === '23505') {
                return { success: false, error: 'Already liked' };
            }
            throw error;
        }

        console.log('✅ Like inserted successfully');
        return { success: true };
    } catch (error) {
        console.error('Failed to like shader:', error);
        return { success: false, error: error.message };
    }
}

export async function unlikeShader(shaderId) {
    if (!supabase || !shaderId || !state.currentUser) {
        return { success: false, error: 'Must be logged in to unlike' };
    }

    try {
        console.log('💔 Attempting to unlike shader:', shaderId);
        
        // Delete like (trigger will auto-update count)
        const { error } = await supabase
            .from('shader_likes')
            .delete()
            .eq('shader_id', shaderId)
            .eq('user_id', state.currentUser.id);

        if (error) {
            console.error('Unlike delete error:', error);
            throw error;
        }

        console.log('✅ Like removed successfully');
        return { success: true };
    } catch (error) {
        console.error('Failed to unlike shader:', error);
        return { success: false, error: error.message };
    }
}

let likesSubscription = null;

export function subscribeToLikes(shaderId, onLikeChange) {
    if (!supabase || !shaderId) return;

    // Unsubscribe from previous
    if (likesSubscription) {
        supabase.removeChannel(likesSubscription);
        likesSubscription = null;
    }

    // Subscribe to likes for this shader
    likesSubscription = supabase
        .channel(`likes:${shaderId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'shader_likes',
                filter: `shader_id=eq.${shaderId}`
            },
            async (payload) => {
                // Count websocket message for performance monitoring
                perfMonitor.countWebSocketMessage();
                
                console.log('🔔 Real-time like change detected:', payload.eventType, 'for shader:', shaderId);
                
                // Small delay to ensure all DB operations complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Fetch updated like count and check if current user liked
                const { data, error } = await supabase
                    .from('shaders')
                    .select('like_count')
                    .eq('id', shaderId)
                    .single();

                if (error) {
                    console.error('Error fetching like count:', error);
                    return;
                }

                const isLiked = await checkIfLiked(shaderId);
                
                console.log('📊 Updated like data - Count:', data?.like_count, 'IsLiked:', isLiked);
                
                if (onLikeChange) {
                    onLikeChange(data?.like_count || 0, isLiked);
                }
            }
        )
        .subscribe();

    return likesSubscription;
}

export function unsubscribeFromLikes() {
    if (likesSubscription) {
        supabase.removeChannel(likesSubscription);
        likesSubscription = null;
    }
}

// ============= COMMENTS =============

export async function loadComments(shaderId) {
    if (!supabase || !shaderId) {
        return { success: false, error: 'Missing parameters' };
    }

    try {
        // Fetch comments (without user join - not allowed from client)
        const { data, error } = await supabase
            .from('shader_comments')
            .select('id, shader_id, user_id, content, parent_comment_id, created_at, user_display_name')
            .eq('shader_id', shaderId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Map content to comment_text for consistency with UI
        const comments = data.map(comment => ({
            ...comment,
            comment_text: comment.content,
            // If user_display_name is null/empty, show as "Anonymous"
            user_display_name: comment.user_display_name || 'Anonymous'
        }));

        return { success: true, comments };
    } catch (error) {
        console.error('Failed to load comments:', error);
        return { success: false, error: error.message };
    }
}

export async function addComment(shaderId, commentText, parentCommentId = null) {
    if (!supabase || !shaderId || !commentText || !state.currentUser) {
        return { success: false, error: 'Missing parameters or not logged in' };
    }

    try {
        // Get display name from current user
        const displayName = state.currentUser.user_metadata?.display_name || 
                           state.currentUser.email?.split('@')[0] || 
                           'Anonymous';

        const { data, error } = await supabase
            .from('shader_comments')
            .insert({
                shader_id: shaderId,
                user_id: state.currentUser.id,
                content: commentText,
                parent_comment_id: parentCommentId,
                user_display_name: displayName
            })
            .select()
            .single();

        if (error) throw error;

        console.log('✓ Comment added:', data);
        return { success: true, comment: data };
    } catch (error) {
        console.error('Failed to add comment:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteComment(commentId) {
    if (!supabase || !commentId || !state.currentUser) {
        return { success: false, error: 'Missing parameters or not logged in' };
    }

    try {
        // Delete comment (only if owned by current user - RLS will enforce)
        const { error } = await supabase
            .from('shader_comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', state.currentUser.id);

        if (error) throw error;

        console.log('✓ Comment deleted:', commentId);
        return { success: true };
    } catch (error) {
        console.error('Failed to delete comment:', error);
        return { success: false, error: error.message };
    }
}

let commentsSubscription = null;

export function subscribeToComments(shaderId, onCommentChange) {
    if (!supabase || !shaderId) return;

    // Unsubscribe from previous
    if (commentsSubscription) {
        supabase.removeChannel(commentsSubscription);
        commentsSubscription = null;
    }

    // Subscribe to comments for this shader
    commentsSubscription = supabase
        .channel(`comments:${shaderId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'shader_comments',
                filter: `shader_id=eq.${shaderId}`
            },
            (payload) => {
                // Count websocket message for performance monitoring
                perfMonitor.countWebSocketMessage();
                
                console.log('🔔 Comment change detected:', payload.eventType);
                if (onCommentChange) {
                    onCommentChange();
                }
            }
        )
        .subscribe();

    return commentsSubscription;
}

export function unsubscribeFromComments() {
    if (commentsSubscription) {
        supabase.removeChannel(commentsSubscription);
        commentsSubscription = null;
    }
}