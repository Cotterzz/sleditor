// ============================================================================
// Backend - Supabase Authentication & Storage
// ============================================================================

import { state, logStatus } from './core.js';
import * as perfMonitor from './performance-monitor.js';
import * as render from './render.js';

// Supabase credentials (set at module level so they're available immediately)
const SUPABASE_URL = 'https://vnsdnskppjwktvksxxvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuc2Ruc2twcGp3a3R2a3N4eHZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NTY3NzUsImV4cCI6MjA3NzAzMjc3NX0.aBQBLgDm0iDpuHZoN_SY-hNe_Z0oX4caFx4glI1Dm1M';

let supabase = null;

// Bandwidth tracking
const bandwidthStats = {
    totalBytes: 0,
    totalRequests: 0,
    byType: {
        api: { bytes: 0, requests: 0 },      // REST API calls
        storage: { bytes: 0, requests: 0 },  // Storage (thumbnails, etc.)
        realtime: { bytes: 0, requests: 0 }  // Realtime subscriptions
    }
};

// Track bandwidth for a request
function trackBandwidth(type, bytes) {
    bandwidthStats.totalBytes += bytes;
    bandwidthStats.totalRequests++;
    bandwidthStats.byType[type].bytes += bytes;
    bandwidthStats.byType[type].requests++;
    
    // Log to console in KB
    const totalKB = (bandwidthStats.totalBytes / 1024).toFixed(1);
    const thisKB = (bytes / 1024).toFixed(1);
    console.log(`[Supabase ${type}] +${thisKB} KB | Total: ${totalKB} KB (${bandwidthStats.totalRequests} requests)`);
    
    // Update performance monitor if available
    if (window.perfMonitor?.trackSupabaseBandwidth) {
        window.perfMonitor.trackSupabaseBandwidth(bytes);
    }
}

// Expose stats for external access
export function getBandwidthStats() {
    return {
        ...bandwidthStats,
        totalMB: (bandwidthStats.totalBytes / 1024 / 1024).toFixed(2),
        apiMB: (bandwidthStats.byType.api.bytes / 1024 / 1024).toFixed(2),
        storageMB: (bandwidthStats.byType.storage.bytes / 1024 / 1024).toFixed(2),
        realtimeMB: (bandwidthStats.byType.realtime.bytes / 1024 / 1024).toFixed(2)
    };
}

// Expose supabase client for Edge Function calls
export function getSupabaseClient() {
    return supabase;
}

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
            // No session on initial load - show SOTW for non-logged-in users
            if (window.save && window.save.populateGallery) {
                window.save.populateGallery('sotw', false); // Default to SOTW for guests
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
    
    try {
        // Add 10 second timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Signup timeout - server not responding')), 10000)
        );
        
        const signupPromise = supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                emailRedirectTo: window.location.origin,
                data: {
                    display_name: displayName  // Store display name in user metadata
                }
            }
        });
        
        const result = await Promise.race([signupPromise, timeoutPromise]);
        const { data, error } = result;
        
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
    } catch (error) {
        window.showAuthMessage?.(`Sign up error: ${error.message}`, 'error');
        return { success: false, error };
    }
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
async function onUserSignedIn(user) {
    console.log('User signed in:', user);
    state.currentUser = user;
    
    // Extract default user info from auth provider
    // Priority: display_name (email signup) > full_name (OAuth) > user_name > name > email prefix
    const defaultUsername = user.user_metadata?.display_name
                  || user.user_metadata?.full_name 
                  || user.user_metadata?.user_name 
                  || user.user_metadata?.name
                  || user.email?.split('@')[0]
                  || 'User';
    
    const defaultAvatarUrl = user.user_metadata?.avatar_url 
                   || user.user_metadata?.picture 
                   || `https://ui-avatars.com/api/?name=${encodeURIComponent(defaultUsername)}&background=random`;
    
    // Try to get user's custom profile (overrides defaults)
    let username = defaultUsername;
    let avatarUrl = defaultAvatarUrl;
    
    const profile = await getProfile(user.id);
    if (profile) {
        // Use profile data if available (override auth defaults)
        if (profile.display_name) {
            username = profile.display_name;
        }
        if (profile.avatar_url) {
            avatarUrl = profile.avatar_url;
        }
        console.log('✓ Profile loaded:', profile);
    }
    
    // Store effective display name and avatar for use elsewhere
    state.userDisplayName = username;
    state.userAvatarUrl = avatarUrl;
    state.userProfile = profile; // null if no custom profile exists
    
    // Update UI - show user menu, hide sign in button
    document.getElementById('signInBtn').style.display = 'none';
    document.getElementById('userMenu').style.display = 'flex';
    document.getElementById('username').textContent = username;
    document.getElementById('userAvatar').src = avatarUrl;
    
    // Update save/fork button state
    if (window.updateSaveButton) {
        window.updateSaveButton();
    }
    
    // Update notification badge
    if (window.updateNotificationBadge) {
        window.updateNotificationBadge();
    }
    
    // Refresh gallery to show user's database shaders
    // Cache will auto-invalidate due to user state change
    if (window.save && window.save.populateGallery) {
        window.save.populateGallery('my', false); // Use cache if valid
    }
    
    logStatus(`✓ Welcome, ${username}!`, 'success');
}

// Called when user signs out
function onUserSignedOut() {
    console.log('User signed out');
    state.currentUser = null;
    state.currentDatabaseShader = null;
    state.userDisplayName = null;
    state.userAvatarUrl = null;
    state.userProfile = null;
    
    // Update UI - hide user menu, show sign in button
    document.getElementById('signInBtn').style.display = 'flex';
    document.getElementById('userMenu').style.display = 'none';
    
    // Update save/fork button state
    if (window.updateSaveButton) {
        window.updateSaveButton();
    }
    
    // Refresh gallery to show sign-in prompt
    // Cache will auto-invalidate due to user state change
    if (window.save && window.save.populateGallery) {
        window.save.populateGallery('my', false); // Use cache if valid
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
        // Get current user's display name (prefer profile, fallback to auth)
        const creatorName = state.userDisplayName || 'Anonymous';
        
        // Prepare data
        const data = {
            title: shaderData.title,
            description: shaderData.description || null,
            tags: shaderData.tags || [],
            code_types: shaderData.code_types || [],
            code: shaderData.code || {},
            visibility: shaderData.visibility || 'private',
            creator_name: creatorName,
            uniform_config: shaderData.uniform_config || null,
            license: shaderData.license || 'default'
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
        // Check if it looks like a UUID (try by ID first if so)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
        
        let result;
        
        if (isUUID) {
            // Load by ID directly for UUIDs
            result = await supabase
                .from('shaders')
                .select('*')
                .eq('id', idOrSlug)
                .single();
        } else {
            // Try loading by slug first (more common for URLs)
            result = await supabase
                .from('shaders')
                .select('*')
                .eq('slug', idOrSlug)
                .single();

            // If not found by slug, try by ID as fallback
            if (result.error) {
                result = await supabase
                    .from('shaders')
                    .select('*')
                    .eq('id', idOrSlug)
                    .single();
            }
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
        
        // Track bandwidth
        const estimatedBytes = JSON.stringify(result.data).length;
        trackBandwidth('api', estimatedBytes);
        
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
        
        // Track bandwidth
        const estimatedBytes = JSON.stringify(shadersWithUsername).length;
        trackBandwidth('api', estimatedBytes);

        return { success: true, shaders: shadersWithUsername };

    } catch (error) {
        console.error('Load examples error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load shader of the week entries (latest first)
 * @returns {Object} { success, entries, error }
 */
export async function loadSotwEntries() {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }
    
    try {
        const result = await supabase
            .from('shader_of_the_week')
            .select(`
                *,
                shader:shaders(*)
            `)
            .order('feature_date', { ascending: false });
        
        if (result.error) throw result.error;
        
        const entries = [];
        for (const entry of result.data) {
            const shader = entry.shader;
            if (!shader) continue;
            
            const codeTypes = shader.code_types || [];
            const hasGraphicsTab = codeTypes.includes('graphics');
            const isWGSL = hasGraphicsTab && (shader.code?.wgsl_graphics || shader.code?.graphics) && !shader.code?.glsl_fragment;
            const needsWebGPU = codeTypes.some(t => t === 'wgsl_graphics' || t === 'wgsl_audio' || t === 'audio_gpu') || isWGSL;
            if (needsWebGPU && !state.hasWebGPU) {
                continue;
            }
            
            entries.push({
                feature_date: entry.feature_date,
                shader: {
                    ...shader,
                    feature_date: entry.feature_date
                }
            });
        }
        
        const estimatedBytes = JSON.stringify(entries).length;
        trackBandwidth('api', estimatedBytes);
        
        return { success: true, entries };
    } catch (error) {
        console.error('Load SOTW error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load user's own shaders
 * @returns {Object} { success, shaders, error }
 */
export async function loadMyShaders(limit = 20, offset = 0) {
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
            .order('updated_at', { ascending: false })
            .range(offset, offset + limit);

        if (result.error) throw result.error;
        
        // Track bandwidth (estimate JSON size)
        const estimatedBytes = JSON.stringify(result.data).length;
        trackBandwidth('api', estimatedBytes);

        return { success: true, shaders: result.data, hasMore: result.data.length >= limit };

    } catch (error) {
        console.error('Load my shaders error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load public/community shaders (published by users) with pagination
 * @param {number} limit - Number of shaders to fetch (default 20)
 * @param {number} offset - Offset for pagination (default 0)
 * @returns {Object} { success, shaders, hasMore, error }
 */
export async function loadPublicShaders(limit = 20, offset = 0) {
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const result = await supabase
            .from('shaders')
            .select('*')
            .eq('visibility', 'published')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit);

        if (result.error) throw result.error;
        
        // Track bandwidth
        const estimatedBytes = JSON.stringify(result.data).length;
        trackBandwidth('api', estimatedBytes);

        // Check if there are more results (if we got full page, there might be more)
        const hasMore = result.data.length === limit + 1;
        const shaders = hasMore ? result.data.slice(0, limit) : result.data;

        return { success: true, shaders, hasMore: result.data.length >= limit };

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
                contentType: 'image/jpeg',
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
 * @param {string} filename - Filename (e.g., 'shader_abc123_1234567890.jpg')
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
 * Resizes to 256x256 and converts to JPEG for bandwidth efficiency
 * @returns {Promise<Blob>}
 */
export async function captureThumbnailBlob() {
    // If paused, render a single frame first to ensure canvas has current content
    if (!state.isPlaying) {
        render.renderOnce();
    }
    
    const activeCanvas = state.graphicsBackend === 'webgl' ? state.canvasWebGL : state.canvasWebGPU;
    
    // Wait a frame to ensure render is complete
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // Create thumbnail canvas at fixed 256x256 size
    const THUMBNAIL_SIZE = 256;
    const thumbCanvas = document.createElement('canvas');
    const ctx = thumbCanvas.getContext('2d');
    
    thumbCanvas.width = THUMBNAIL_SIZE;
    thumbCanvas.height = THUMBNAIL_SIZE;
    
    // Draw scaled-down version (centered and cropped to square)
    const sourceAspect = activeCanvas.width / activeCanvas.height;
    let sx = 0, sy = 0, sw = activeCanvas.width, sh = activeCanvas.height;
    
    if (sourceAspect > 1) {
        // Wider than tall - crop sides
        sw = activeCanvas.height;
        sx = (activeCanvas.width - sw) / 2;
    } else {
        // Taller than wide - crop top/bottom
        sh = activeCanvas.width;
        sy = (activeCanvas.height - sh) / 2;
    }
    
    ctx.drawImage(activeCanvas, sx, sy, sw, sh, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    
    // Convert to JPEG with 80% quality
    return new Promise((resolve, reject) => {
        thumbCanvas.toBlob((blob) => {
            if (blob) {
                console.log(`Thumbnail: ${Math.round(blob.size / 1024)}KB (JPEG 256×256)`);
                resolve(blob);
            } else {
                reject(new Error('Failed to capture canvas'));
            }
        }, 'image/jpeg', 0.8);
    });
}

// ============= USER PROFILES =============

/**
 * Get user profile by user ID
 * Returns null if profile doesn't exist (user hasn't created one yet)
 */
export async function getProfile(userId) {
    if (!supabase || !userId) return null;
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', userId)
            .single();
        
        if (error) {
            // PGRST116 = no rows found, which is expected for new users
            if (error.code !== 'PGRST116') {
                console.error('Get profile error:', error);
            }
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('Get profile error:', error);
        return null;
    }
}

/**
 * Create or update user profile (upsert)
 */
export async function saveProfile(userId, displayName, avatarUrl) {
    if (!supabase || !userId) {
        return { success: false, error: 'Not initialized or missing user ID' };
    }
    
    // Validate display name
    if (!displayName || displayName.length < 2 || displayName.length > 32) {
        return { success: false, error: 'Display name must be 2-32 characters' };
    }
    
    // Sanitize display name (remove potential XSS)
    const sanitizedName = displayName
        .replace(/[<>]/g, '') // Remove angle brackets
        .trim();
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                display_name: sanitizedName,
                avatar_url: avatarUrl || null,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        console.log('✓ Profile saved:', data);
        return { success: true, profile: data };
    } catch (error) {
        console.error('Save profile error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Upload avatar image to storage
 * Resizes to 256x256 and converts to JPEG
 * Uses thumbnails/avatars/ folder to reuse existing bucket policies
 */
export async function uploadAvatar(imageFile, userId) {
    if (!supabase || !userId || !imageFile) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    try {
        // Create image element to load the file
        const img = new Image();
        const loadPromise = new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        img.src = URL.createObjectURL(imageFile);
        await loadPromise;
        
        // Resize to 256x256 (centered crop)
        const AVATAR_SIZE = 256;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        
        // Calculate crop to center
        const sourceSize = Math.min(img.width, img.height);
        const sx = (img.width - sourceSize) / 2;
        const sy = (img.height - sourceSize) / 2;
        
        ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        
        // Clean up object URL
        URL.revokeObjectURL(img.src);
        
        // Convert to blob
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Failed to create avatar blob'));
            }, 'image/jpeg', 0.85);
        });
        
        console.log(`Avatar: ${Math.round(blob.size / 1024)}KB (JPEG 256×256)`);
        
        // Generate filename with avatars/ prefix (stored in thumbnails bucket)
        const filename = `avatars/avatar_${userId}_${Date.now()}.jpg`;
        
        // Upload to thumbnails bucket (avatars folder)
        const { error: uploadError } = await supabase.storage
            .from('thumbnails')
            .upload(filename, blob, {
                contentType: 'image/jpeg',
                upsert: false
            });
        
        if (uploadError) throw uploadError;
        
        const url = getStorageUrl('thumbnails', filename);
        console.log('✓ Avatar uploaded:', url);
        
        return { success: true, url, filename };
    } catch (error) {
        console.error('Upload avatar error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete an avatar from storage
 * Avatars are stored in thumbnails/avatars/ folder
 */
export async function deleteAvatar(filename) {
    if (!supabase || !filename) return;
    
    try {
        // If filename doesn't include path, it might be just the filename from URL
        // Extract just the path portion after the bucket name
        let filePath = filename;
        if (filename.includes('/avatars/')) {
            // Extract everything from 'avatars/' onwards
            const match = filename.match(/avatars\/[^?]+/);
            if (match) filePath = match[0];
        }
        
        const { error } = await supabase.storage
            .from('thumbnails')
            .remove([filePath]);
        
        if (error) throw error;
        console.log('✓ Old avatar deleted:', filePath);
    } catch (error) {
        console.error('Delete avatar error:', error);
    }
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
        
        // First, get shader info for notification
        const { data: shader, error: shaderError } = await supabase
            .from('shaders')
            .select('user_id, title')
            .eq('id', shaderId)
            .single();
        
        if (shaderError) {
            console.error('Failed to fetch shader for like:', shaderError);
        }
        
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
        
        // Create notification for shader owner (fire-and-forget)
        if (shader?.user_id) {
            createNotification(shader.user_id, 'like', {
                shaderId: shaderId,
                shaderTitle: shader.title || 'Untitled'
            }).catch(err => console.warn('Like notification failed:', err));
        }
        
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
        // Fetch comments
        const { data: commentsData, error: commentsError } = await supabase
            .from('shader_comments')
            .select('id, shader_id, user_id, content, parent_comment_id, created_at, user_display_name')
            .eq('shader_id', shaderId)
            .order('created_at', { ascending: true });

        if (commentsError) throw commentsError;

        // Get unique user IDs from comments
        const userIds = [...new Set(commentsData.map(c => c.user_id).filter(Boolean))];
        
        // Fetch profiles for those users (if any)
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url')
                .in('id', userIds);
            
            if (!profilesError && profilesData) {
                // Create a map for quick lookup
                profilesData.forEach(p => {
                    profilesMap[p.id] = p;
                });
            }
        }

        // Map content to comment_text for consistency with UI
        // Use profile data if available (overrides stored display_name)
        const comments = commentsData.map(comment => {
            const profile = profilesMap[comment.user_id];
            return {
                ...comment,
                comment_text: comment.content,
                // Prefer profile display_name over stored user_display_name
                user_display_name: profile?.display_name || comment.user_display_name || 'Anonymous',
                // Add avatar URL from profile
                user_avatar_url: profile?.avatar_url || null
            };
        });

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
        // Get display name (prefer profile, fallback to auth)
        const displayName = state.userDisplayName || 'Anonymous';

        // Fetch shader info for notification
        const { data: shader, error: shaderError } = await supabase
            .from('shaders')
            .select('user_id, title')
            .eq('id', shaderId)
            .single();
        
        if (shaderError) {
            console.warn('Failed to fetch shader for comment notification:', shaderError);
        }

        // If this is a reply, get the parent comment's author
        let parentCommentAuthorId = null;
        if (parentCommentId) {
            const { data: parentComment, error: parentError } = await supabase
                .from('shader_comments')
                .select('user_id')
                .eq('id', parentCommentId)
                .single();
            
            if (!parentError && parentComment) {
                parentCommentAuthorId = parentComment.user_id;
            }
        }

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
        
        // Create notifications (fire-and-forget)
        if (shader?.user_id) {
            // Notify shader owner about new comment
            createNotification(shader.user_id, 'comment', {
                shaderId: shaderId,
                shaderTitle: shader.title || 'Untitled',
                commentId: data.id
            }).catch(err => console.warn('Comment notification failed:', err));
        }
        
        // If this is a reply, also notify the parent commenter
        if (parentCommentAuthorId && parentCommentAuthorId !== shader?.user_id) {
            createNotification(parentCommentAuthorId, 'reply', {
                shaderId: shaderId,
                shaderTitle: shader?.title || 'Untitled',
                commentId: data.id
            }).catch(err => console.warn('Reply notification failed:', err));
        }
        
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

export async function updateComment(commentId, newContent) {
    if (!supabase || !commentId || !newContent || !state.currentUser) {
        return { success: false, error: 'Missing parameters or not logged in' };
    }

    try {
        const { data, error } = await supabase
            .from('shader_comments')
            .update({ content: newContent })
            .eq('id', commentId)
            .eq('user_id', state.currentUser.id)
            .select()
            .single();

        if (error) throw error;

        console.log('✓ Comment updated:', commentId);
        return { success: true, comment: data };
    } catch (error) {
        console.error('Failed to update comment:', error);
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

// ============================================================================
// Notifications
// ============================================================================

/**
 * Create a notification for a user
 * @param {string} recipientId - User ID to notify
 * @param {string} type - Notification type: 'like', 'comment', 'reply', 'achievement', 'system'
 * @param {Object} options - Additional data
 * @param {string} options.sourceUserId - Who triggered the notification
 * @param {string} options.sourceUserName - Display name of source user
 * @param {string} options.shaderId - Related shader ID
 * @param {string} options.shaderTitle - Shader title
 * @param {string} options.commentId - Related comment ID (for replies)
 * @param {string} options.message - Custom message
 * @returns {Object} { success, notification, error }
 */
export async function createNotification(recipientId, type, options = {}) {
    if (!supabase || !recipientId || !type) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    // Don't notify yourself
    if (state.currentUser && recipientId === state.currentUser.id) {
        console.log('Skipping self-notification');
        return { success: true, skipped: true };
    }
    
    try {
        // Note: We don't use .select() here because the SELECT policy only allows
        // users to read their OWN notifications, and we're creating one for someone else
        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id: recipientId,
                type: type,
                source_user_id: options.sourceUserId || state.currentUser?.id || null,
                source_user_name: options.sourceUserName || state.userDisplayName || 'Someone',
                shader_id: options.shaderId || null,
                shader_title: options.shaderTitle || null,
                comment_id: options.commentId || null,
                message: options.message || null
            });
        
        if (error) throw error;
        
        console.log('🔔 Notification created:', type, 'for user', recipientId);
        return { success: true };
    } catch (error) {
        // Don't fail the main action if notification fails
        console.error('Failed to create notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get count of unread notifications for current user
 * @returns {number} Unread count
 */
export async function getUnreadNotificationCount() {
    if (!supabase || !state.currentUser) {
        return 0;
    }
    
    try {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', state.currentUser.id)
            .eq('read', false);
        
        if (error) throw error;
        
        return count || 0;
    } catch (error) {
        console.error('Failed to get notification count:', error);
        return 0;
    }
}

/**
 * Get notifications for current user
 * @param {number} limit - Max notifications to fetch
 * @returns {Object} { success, notifications, error }
 */
export async function getNotifications(limit = 50) {
    if (!supabase || !state.currentUser) {
        return { success: false, notifications: [], error: 'Not logged in' };
    }
    
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        
        // Track bandwidth
        const estimatedBytes = JSON.stringify(data).length;
        trackBandwidth('api', estimatedBytes);
        
        return { success: true, notifications: data || [] };
    } catch (error) {
        console.error('Failed to get notifications:', error);
        return { success: false, notifications: [], error: error.message };
    }
}

/**
 * Mark all notifications as read for current user
 * @returns {Object} { success, error }
 */
export async function markNotificationsRead() {
    if (!supabase || !state.currentUser) {
        return { success: false, error: 'Not logged in' };
    }
    
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', state.currentUser.id)
            .eq('read', false);
        
        if (error) throw error;
        
        console.log('✓ Notifications marked as read');
        return { success: true };
    } catch (error) {
        console.error('Failed to mark notifications read:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a notification
 * @param {string} notificationId - Notification ID to delete
 * @returns {Object} { success, error }
 */
export async function deleteNotification(notificationId) {
    if (!supabase || !notificationId || !state.currentUser) {
        return { success: false, error: 'Missing parameters' };
    }
    
    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .eq('user_id', state.currentUser.id);
        
        if (error) throw error;
        
        return { success: true };
    } catch (error) {
        console.error('Failed to delete notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Clear all notifications for current user
 * @returns {Object} { success, error }
 */
export async function clearAllNotifications() {
    if (!supabase || !state.currentUser) {
        return { success: false, error: 'Not logged in' };
    }
    
    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', state.currentUser.id);
        
        if (error) throw error;
        
        console.log('✓ All notifications cleared');
        return { success: true };
    } catch (error) {
        console.error('Failed to clear notifications:', error);
        return { success: false, error: error.message };
    }
}