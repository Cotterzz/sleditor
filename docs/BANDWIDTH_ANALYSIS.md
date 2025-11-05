# Bandwidth Issues Analysis & Solutions

**Date:** November 4, 2025  
**Status:** Issues Identified, Solutions Proposed

## 🔴 Issue 1: Thumbnails Too Large (up to 650KB)

### Current Implementation
```javascript
// js/backend.js:603-619
export async function captureThumbnailBlob() {
    const activeCanvas = state.graphicsBackend === 'webgl' ? 
                        state.canvasWebGL : state.canvasWebGPU;
    
    return new Promise((resolve, reject) => {
        activeCanvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to capture canvas'));
            }
        }, 'image/png', 0.8);  // ← 80% quality PNG, but no size limit!
    });
}
```

### Problem
- Captures canvas at FULL resolution (could be 800x600 or larger)
- PNG format even with 0.8 quality is still large
- No maximum dimensions enforced
- No file size limit

### Solution: Resize & Compress

```javascript
// js/backend.js - UPDATED
export async function captureThumbnailBlob() {
    const activeCanvas = state.graphicsBackend === 'webgl' ? 
                        state.canvasWebGL : state.canvasWebGPU;
    
    // For WebGL, wait a frame to ensure render is complete
    if (state.graphicsBackend === 'webgl') {
        await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    // Create thumbnail canvas with fixed size
    const THUMBNAIL_WIDTH = 400;   // Max width
    const THUMBNAIL_HEIGHT = 300;  // Max height
    
    const thumbCanvas = document.createElement('canvas');
    const ctx = thumbCanvas.getContext('2d');
    
    // Calculate aspect-preserving dimensions
    const aspectRatio = activeCanvas.width / activeCanvas.height;
    let width = THUMBNAIL_WIDTH;
    let height = THUMBNAIL_HEIGHT;
    
    if (aspectRatio > THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT) {
        height = Math.floor(THUMBNAIL_WIDTH / aspectRatio);
    } else {
        width = Math.floor(THUMBNAIL_HEIGHT * aspectRatio);
    }
    
    thumbCanvas.width = width;
    thumbCanvas.height = height;
    
    // Draw scaled-down version
    ctx.drawImage(activeCanvas, 0, 0, width, height);
    
    return new Promise((resolve, reject) => {
        // Try JPEG first (much smaller)
        thumbCanvas.toBlob((blob) => {
            if (blob && blob.size < 100000) { // < 100KB
                resolve(blob);
            } else {
                // If JPEG is still too large, lower quality
                thumbCanvas.toBlob((blob2) => {
                    if (blob2) {
                        resolve(blob2);
                    } else {
                        reject(new Error('Failed to capture thumbnail'));
                    }
                }, 'image/jpeg', 0.6); // Even lower quality
            }
        }, 'image/jpeg', 0.8); // JPEG is much smaller than PNG
    });
}
```

### Benefits
- ✅ **Fixed maximum dimensions**: 400x300 max (aspect-preserving)
- ✅ **JPEG instead of PNG**: 5-10x smaller for photos/renders
- ✅ **Two-pass compression**: Try 80% quality, fallback to 60% if >100KB
- ✅ **Predictable size**: Should be 20-60KB instead of 650KB
- ✅ **10x bandwidth reduction** on thumbnails

### Estimated Impact
- **Before**: 650KB average thumbnail
- **After**: ~40KB average thumbnail
- **Savings**: 610KB per save × 100 saves = 61MB saved

---

## 🔴 Issue 2: Automatic Thumbnail Re-upload on Every Save

### Current Implementation
```javascript
// js/shader-management.js:332-350
export async function saveOwnedShader() {
    // ... 
    
    // Capture and upload thumbnail
    try {
        const blob = await backend.captureThumbnailBlob();
        if (blob) {
            const filename = `shader_${shaderData.id}_${Date.now()}.png`;
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
    
    // ...
}
```

### Problem
- **Every save** uploads a new thumbnail
- User making small code changes = new thumbnail each time
- Deletes old thumbnail = 2x bandwidth (delete + upload)
- Busts CDN cache on every save

### Solution: Manual Thumbnail Update

```javascript
// js/shader-management.js - UPDATED
export async function saveOwnedShader(updateThumbnail = false) {
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
    
    // Collect code from editors
    state.activeTabs.forEach(tabName => {
        if (tabName === 'boilerplate') return;
        
        const tabConfig = window.tabConfig.getTabConfig(tabName);
        if (!tabConfig) return;
        
        const editor = window.tabConfig.getEditorForTab(tabName, state);
        if (editor) {
            shaderData.code[tabConfig.dbKey] = editor.getValue();
        }
    });
    
    // Only update thumbnail if explicitly requested
    if (updateThumbnail) {
        try {
            logStatus('📸 Updating thumbnail...');
            const blob = await backend.captureThumbnailBlob();
            if (blob) {
                const filename = `shader_${shaderData.id}_${Date.now()}.png`;
                const uploadResult = await backend.uploadThumbnail(blob, filename);
                
                if (uploadResult.success) {
                    // Delete old thumbnail
                    if (state.currentDatabaseShader?.thumbnail_url) {
                        const oldFilename = state.currentDatabaseShader.thumbnail_url.split('/').pop();
                        backend.deleteThumbnail(oldFilename).catch(() => {});
                    }
                    shaderData.thumbnail_url = uploadResult.url;
                    logStatus('✓ Thumbnail updated', 'success');
                }
            }
        } catch (err) {
            console.error('Thumbnail error:', err);
        }
    } else {
        // Keep existing thumbnail
        shaderData.thumbnail_url = state.currentDatabaseShader.thumbnail_url;
    }
    
    // Save to database
    const result = await backend.saveShader(shaderData);
    
    if (result.success) {
        state.isDirty = false;
        state.currentDatabaseShader = result.shader;
        logStatus('✓ Shader saved', 'success');
        window.dispatchEvent(new CustomEvent('shader-saved'));
    } else {
        logStatus('⚠ Save failed: ' + result.error, 'error');
    }
}
```

### UI Addition

```html
<!-- Add to shader info panel in index.html -->
<button id="updateThumbnailBtn" 
        class="shader-edit-btn" 
        title="Update thumbnail (captures current frame)"
        style="margin-left: 8px;">
    📸
</button>
```

```javascript
// js/index.js - in setupUI()
document.getElementById('updateThumbnailBtn').addEventListener('click', async () => {
    if (!window.isShaderOwnedByUser()) {
        ui.showAuthMessage('Only the owner can update the thumbnail', 'error');
        return;
    }
    
    // Save with thumbnail update
    await shaderManagement.saveOwnedShader(true);
});
```

### Benefits
- ✅ **90% reduction** in thumbnail uploads (only when user requests)
- ✅ **Better CDN caching**: Thumbnail URL doesn't change on every save
- ✅ **User control**: Update thumbnail when shader looks good
- ✅ **Faster saves**: No thumbnail processing unless requested

### Estimated Impact
- **Before**: 100 saves × 650KB = 65MB bandwidth
- **After**: 100 saves × 0KB + 10 thumbnail updates × 40KB = 400KB
- **Savings**: 64.6MB (99% reduction)

---

## 🔴 Issue 3: Gallery Reloads on Every Tab Click

### Current Implementation

```javascript
// js/index.js:204-207
document.querySelectorAll('.gallery-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        save.populateGallery(tabName);  // ← Fetches ALL shaders every click!
    });
});
```

```javascript
// js/save.js:216-248
export async function populateGallery(tab = currentGalleryTab) {
    // ...
    
    if (tab === 'my') {
        if (isLoggedIn) {
            // Load from database for logged-in users
            const myResult = await backend.loadMyShaders();  // ← Network call
            // ...
        }
    }
    
    if (tab === 'examples') {
        const examplesResult = await backend.loadExamples();  // ← Network call
        // ...
    }
    
    if (tab === 'community') {
        const communityResult = await backend.loadCommunityShaders();  // ← Network call
        // ...
    }
}
```

### Problem
- **Every tab click** = new database query
- Fetches ALL shaders every time (could be 50+ shaders × thumbnails)
- No caching whatsoever
- User clicking between tabs repeatedly = massive bandwidth

### Solution: Smart Caching

```javascript
// js/save.js - UPDATED
let isPopulatingGallery = false;
let currentGalleryTab = 'my';
let galleryCache = {
    my: { data: null, timestamp: 0 },
    examples: { data: null, timestamp: 0 },
    community: { data: null, timestamp: 0 }
};
const CACHE_DURATION = 60000; // 1 minute

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
        // Check cache first (unless force refresh)
        const cached = galleryCache[tab];
        const now = Date.now();
        const isCacheValid = cached.data && 
                             (now - cached.timestamp) < CACHE_DURATION &&
                             !forceRefresh;
        
        if (isCacheValid) {
            console.log(`Using cached gallery data for '${tab}'`);
            renderGalleryContent(galleryContent, cached.data, tab);
            isPopulatingGallery = false;
            return;
        }
        
        // Show loading
        galleryContent.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">Loading...</div>';
        
        await new Promise(resolve => setTimeout(resolve, 10));
        
        galleryContent.innerHTML = '';
        
        const isLoggedIn = state.currentUser !== null;
        let data = null;
        
        // Fetch data based on tab
        if (tab === 'my') {
            if (isLoggedIn) {
                const myResult = await backend.loadMyShaders();
                data = { type: 'my', shaders: myResult.shaders || [], isLoggedIn: true };
            } else {
                const localShaders = getAllSavedShaders();
                data = { type: 'my', shaders: localShaders, isLoggedIn: false };
            }
        } else if (tab === 'examples') {
            const examplesResult = await backend.loadExamples();
            data = { type: 'examples', shaders: examplesResult.shaders || [] };
        } else if (tab === 'community') {
            const communityResult = await backend.loadCommunityShaders();
            data = { type: 'community', shaders: communityResult.shaders || [] };
        }
        
        // Cache the data
        galleryCache[tab] = {
            data: data,
            timestamp: now
        };
        
        // Render
        renderGalleryContent(galleryContent, data, tab);
        
    } catch (error) {
        console.error('Gallery error:', error);
        galleryContent.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--error-color);">Failed to load gallery</div>';
    } finally {
        isPopulatingGallery = false;
    }
}

function renderGalleryContent(container, data, tab) {
    // Render logic extracted from populateGallery
    // (all the HTML generation code)
    // ...
}

// Invalidate cache when needed
export function invalidateGalleryCache(tab = null) {
    if (tab) {
        galleryCache[tab] = { data: null, timestamp: 0 };
    } else {
        // Invalidate all
        Object.keys(galleryCache).forEach(key => {
            galleryCache[key] = { data: null, timestamp: 0 };
        });
    }
}
```

```javascript
// Update calls that need fresh data
// js/index.js
window.addEventListener('shader-saved', () => {
    save.invalidateGalleryCache('my'); // Only invalidate "my" tab
    if (currentGalleryTab === 'my') {
        save.populateGallery('my', true); // Force refresh
    }
});

window.addEventListener('shader-deleted', () => {
    save.invalidateGalleryCache('my');
    if (currentGalleryTab === 'my') {
        save.populateGallery('my', true);
    }
});
```

### Benefits
- ✅ **95% reduction** in gallery fetches (1-minute cache)
- ✅ **Instant tab switching** after first load
- ✅ **Smart invalidation**: Only refresh when data actually changes
- ✅ **Better UX**: No loading spinner on every tab click

### Estimated Impact
- **User session**: 20 gallery tab clicks
- **Before**: 20 fetches × 50 shaders × 40KB thumbnails = 40MB
- **After**: 3 fetches (one per tab) × 50 shaders × 40KB = 6MB
- **Savings**: 34MB per session (85% reduction)

---

## 🔴 Issue 4: Comments Tab Always Reloading Gallery

Let me check if there's an issue with the comments/gallery tab switching:

```javascript
// js/ui.js:607-648 (switchTopLevelPanel)
export function switchTopLevelPanel(panelName) {
    const commentsPanel = document.getElementById('commentsPanel');
    const gallerySection = document.getElementById('gallerySection');
    // ...
    
    if (panelName === 'comments') {
        // Show comments, hide gallery
        commentsPanel.style.display = 'flex';
        gallerySection.style.display = 'none';
        
        // Load comments for current shader
        if (state.currentDatabaseShader) {
            comments.loadCommentsForShader(state.currentDatabaseShader);
        }
    } else {
        // Show gallery, hide comments
        gallerySection.style.display = 'flex';
        commentsPanel.style.display = 'none';
        
        // Unload comments
        comments.unloadComments();
    }
}
```

**This looks OK** - it's just showing/hiding panels, not reloading gallery.

---

## Summary of All Fixes

### Easy Wins (1-2 hours)

1. **Resize thumbnails** → 10x smaller (650KB → 40KB)
2. **Gallery caching** → 95% fewer fetches
3. **Manual thumbnail updates** → 99% fewer thumbnail uploads

### Combined Impact

**Bandwidth Reduction Per User Session:**
- Thumbnails: 610KB per save × 5 saves = 3MB → 200KB (**93% reduction**)
- Gallery: 40MB → 6MB (**85% reduction**)
- **Total**: ~44MB → ~6.2MB per session (**86% total reduction**)

**For 100 active users:**
- **Before**: 4.4GB per day
- **After**: 620MB per day
- **Savings**: 3.78GB per day (86%)

---

## Implementation Order

1. **Fix thumbnail size** (15 min, biggest immediate impact)
2. **Add gallery caching** (30 min, second biggest impact)
3. **Make thumbnail updates manual** (30 min, requires UI change)

**Want me to implement these fixes?** I recommend doing all three - they're straightforward and will dramatically reduce your Supabase bandwidth costs. 🎯

