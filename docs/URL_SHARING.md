# URL-Based Shader Sharing

## 🔗 Overview

Sleditor now supports URL-based shader sharing! Users can share specific shaders via URLs, enabling:
- ✅ Direct links to examples
- ✅ Browser back/forward navigation
- ✅ Bookmarkable shaders
- 🔮 Future: Backend shader sharing with unguessable IDs

---

## 📖 How It Works

### **URL Formats**

#### **1. Example Shaders**
```
https://sleditor.com/#shader=glsl_hello
https://sleditor.com/#shader=raymarch
https://sleditor.com/#shader=audio_viz
```

#### **2. Backend Shaders (Coming Soon)**
```
https://sleditor.com/#id=abc123def456789
```

When backend is implemented:
- ✅ Unguessable IDs (nanoid or UUID)
- ✅ Anyone with link can view
- ✅ Only logged-in users can list/browse
- ✅ Private shaders won't appear in gallery

---

## 🎯 User Experience

### **Sharing an Example**
1. Load any example shader (e.g., `glsl_hello`)
2. Click the **🔗 Share** button in the toolbar
3. Link is copied to clipboard: `sleditor.com/#shader=glsl_hello`
4. Paste anywhere to share!

### **Loading from URL**
1. User clicks shared link
2. Sleditor loads automatically with that shader
3. URL updates as user navigates to other shaders
4. Browser back/forward buttons work!

### **Current Limitations**
- ❌ Can't share saved shaders yet (no backend)
- ❌ Can't share with custom code yet (only examples)
- ✅ Will be fixed once backend is added

---

## 🏗️ Implementation Details

### **Functions Added**

#### **`getShaderFromURL()`**
Parses URL hash parameters to extract shader identifier.

```javascript
// Returns example ID or null
const shaderId = getShaderFromURL();
// Examples:
// #shader=glsl_hello  → 'glsl_hello'
// #id=abc123         → null (backend not ready)
// (no hash)          → null
```

#### **`updateURLForShader(identifier, isExample)`**
Updates browser URL without reload (uses `history.pushState`).

```javascript
// Update URL for example
updateURLForShader('glsl_hello', true);
// → URL becomes #shader=glsl_hello

// Future: Update URL for backend shader
updateURLForShader('abc123def', false);
// → URL becomes #id=abc123def
```

#### **`generateShareableLink(identifier, isExample)`**
Generates full shareable URL.

```javascript
const link = generateShareableLink('glsl_hello', true);
// → 'https://sleditor.com/#shader=glsl_hello'
```

#### **`copyShareLink()`**
Copies current shader's shareable link to clipboard.

```javascript
// User clicks Share button
copyShareLink();
// → Copies link, shows success message
```

---

## 🔮 Backend Integration Plan

### **Step 1: Add Shareable ID Generation**
```javascript
// When saving to Supabase
const shader = {
  id: nanoid(12),              // Unguessable: 'abc123def456'
  user_id: user.id,
  title: 'My Shader',
  code: { graphics: '...', js: '...' },
  is_public: true,             // Public = anyone with link can view
  is_listed: false,            // Listed = appears in gallery
  created_at: new Date()
};
```

### **Step 2: Update URL Functions**
```javascript
function copyShareLink() {
  if (state.currentExample) {
    // Example shader
    return generateShareableLink(state.currentExample, true);
  } else if (state.currentSavedShader) {
    // Backend shader - use database ID
    return generateShareableLink(state.currentSavedShader.id, false);
  }
}
```

### **Step 3: Add Backend Loader**
```javascript
async function getShaderFromURL() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  
  if (params.has('id')) {
    const shaderId = params.get('id');
    
    // Fetch from Supabase
    const { data: shader, error } = await supabase
      .from('shaders')
      .select('*')
      .eq('id', shaderId)
      .eq('is_public', true)  // Only public shaders
      .single();
    
    if (shader) {
      loadBackendShader(shader);
    }
  }
}
```

### **Step 4: Security Model**
```sql
-- Row Level Security in Supabase
CREATE POLICY "Anyone can view public shaders by ID"
ON shaders FOR SELECT
USING (is_public = true);

CREATE POLICY "Only logged-in users can list shaders"
ON shaders FOR SELECT
USING (
  auth.uid() IS NOT NULL  -- Must be logged in
  AND is_listed = true    -- Only listed shaders
);
```

**Result:**
- ✅ Anyone can view shader if they have the link
- ✅ Only logged-in users can browse gallery
- ✅ Prevents abuse (can't enumerate all shaders)
- ✅ Users can keep shaders unlisted but still shareable

---

## 📋 Testing Guide

### **Test 1: Share Example**
1. Load `glsl_hello` example
2. Click 🔗 Share button
3. Verify status shows: `✓ Share link copied: sleditor.com/#shader=glsl_hello`
4. Open new tab
5. Paste URL
6. Verify `glsl_hello` loads automatically

### **Test 2: Browser Navigation**
1. Load `glsl_hello`
2. Load `raymarch`
3. Click browser back button
4. Verify `glsl_hello` loads
5. Click forward button
6. Verify `raymarch` loads

### **Test 3: URL on Page Load**
1. Navigate to `sleditor.com/#shader=audio_viz`
2. Refresh page
3. Verify `audio_viz` loads instead of default

### **Test 4: Invalid Shader**
1. Navigate to `sleditor.com/#shader=nonexistent`
2. Verify default shader loads (graceful fallback)
3. Console shows: "Shader not found"

### **Test 5: Saved Shader (No Backend Yet)**
1. Save a custom shader
2. Click 🔗 Share button
3. Verify status shows: `⚠ Saved shaders can't be shared yet (backend coming soon)`

### **Test 6: Backend ID (Not Implemented)**
1. Navigate to `sleditor.com/#id=abc123`
2. Console shows: `Backend shader ID detected: abc123 (backend not implemented yet)`
3. Default shader loads

---

## 🎨 UI Changes

### **New Button**
```html
<button id="shareBtn" class="uiBtn" title="Copy shareable link">🔗</button>
```

Located in toolbar next to Save button (💾).

### **Status Messages**
```javascript
// Success
✓ Share link copied: sleditor.com/#shader=glsl_hello

// Not sharable yet
⚠ Saved shaders can't be shared yet (backend coming soon)

// No shader loaded
⚠ No shader loaded to share
```

---

## 🚀 Future Enhancements

### **Short URLs** (Optional)
Use a URL shortener for cleaner links:
```
Before: sleditor.com/#id=abc123def456789ghijk
After:  sled.io/abc123
```

### **QR Codes**
Generate QR codes for sharing at conferences:
```javascript
function generateQRCode(url) {
  return QRCode.toDataURL(url);
}
```

### **Social Media Previews** (Open Graph)
Add metadata for rich social media cards:
```html
<meta property="og:title" content="Raymarching Sphere - Sleditor">
<meta property="og:image" content="https://sleditor.com/thumbnails/abc123.png">
```

### **Embedded Shader Viewer**
Allow embedding shaders in other sites:
```html
<iframe src="https://sleditor.com/embed/abc123" width="800" height="600"></iframe>
```

---

## 📊 Analytics (Future)

Track sharing metrics:
```javascript
// When sharing
analytics.track('shader_shared', {
  shader_id: shaderId,
  method: 'link_copy'
});

// When loading from URL
analytics.track('shader_loaded_from_url', {
  shader_id: shaderId,
  referrer: document.referrer
});
```

---

## 🎯 Conclusion

URL sharing is now **production-ready** for examples!

**Current State:**
- ✅ Examples shareable via URL
- ✅ Browser navigation works
- ✅ Clean UX with Share button

**Next Steps:**
- 🔮 Add backend (Supabase)
- 🔮 Enable saved shader sharing
- 🔮 Implement security model

This feature lays the groundwork for full social sharing while providing immediate value for sharing examples!

