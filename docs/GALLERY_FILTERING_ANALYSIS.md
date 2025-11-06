# Gallery Filtering Analysis

## Current Implementation

### Gallery Tabs
Currently there are **3 tabs** in the gallery UI (`index.html` lines 289-300):
1. **My Shaders** - User's own shaders
2. **Community** - Published shaders from all users
3. **Examples** - Built-in example shaders

### Backend Functions & Filtering

#### 1. `loadExamples()` (`js/backend.js` line 428)
```javascript
.from('shaders')
.select('*')
.eq('visibility', 'example')  // ← Filters by visibility
.order('created_at', { ascending: true })
```
**Filters:**
- `visibility = 'example'`
- WebGPU shaders filtered out if browser doesn't support WebGPU (client-side)
- **NO tag filtering currently**

#### 2. `loadMyShaders()` (`js/backend.js` line 478)
```javascript
.from('shaders')
.select('*')
.eq('user_id', user.id)  // ← User's own shaders only
.order('created_at', { ascending: false })
```
**Filters:**
- By current user ID
- JS shaders are filtered out (client-side, line 503+)

#### 3. `loadPublicShaders()` (`js/backend.js` line 512)
```javascript
.from('shaders')
.select('*')
.eq('visibility', 'published')  // ← Filters by visibility
.order('created_at', { ascending: false })
.limit(50)  // ← Only 50 most recent
```
**Filters:**
- `visibility = 'published'`
- Limited to 50 shaders
- JS shaders are filtered out (client-side)
- **NO tag filtering currently**

---

## Database Schema

Based on the code, the `shaders` table has:
- `visibility` - Values: `'example'`, `'published'`, `'private'`
- `tags` - Array field (referenced in `shader-management.js` line 417)
- `code_types` - Array of active tab types
- `user_id` - Creator's user ID
- `creator_name` - Display name
- Other fields: `title`, `description`, `thumbnail_url`, `slug`, etc.

**Currently `tags` are stored but NOT used for filtering!**

---

## What's Possible

### Option 1: Add Tag Filtering to Existing Tabs
You could modify `loadExamples()` to accept a tag filter:

```javascript
export async function loadExamples(tag = null) {
    let query = supabase
        .from('shaders')
        .select('*')
        .eq('visibility', 'example');
    
    if (tag) {
        query = query.contains('tags', [tag]);  // Filter by tag
    }
    
    return query.order('created_at', { ascending: true });
}
```

Then add a tag filter UI in the Examples tab with buttons for:
- All
- Lessons
- Glossary
- WebGL
- WebGPU

### Option 2: Split "Examples" into Multiple Tabs
Replace the single "Examples" tab with:
- **Examples** - General examples (no specific tag)
- **Lessons** - `tags` contains `'lesson'`
- **Glossary** - `tags` contains `'glossary'`

Each would call `loadExamples(tagFilter)` with different parameters.

### Option 3: Add Sub-tabs / Filter Bar
Keep 3 main tabs, but add a filter bar below the tabs that appears when "Examples" is active:
```
[My Shaders] [Community] [Examples*]
  └─ [All] [Lessons] [Glossary] [WebGL] [WebGPU]
```

---

## Supabase Query Capabilities

Supabase (PostgreSQL) supports:
- **Array contains**: `.contains('tags', ['lesson'])` - Check if array contains value
- **Array overlap**: `.overlaps('tags', ['lesson', 'tutorial'])` - Any match
- **Multiple filters**: Chain `.eq()`, `.contains()`, `.in()`, etc.
- **OR conditions**: `.or('tag1.eq.lesson,tag2.eq.tutorial')`

---

## Recommended Approach

Based on your description ("built-in should be a tab with examples, lessons and glossary as tag filters"):

### Phase 1: Add Tag Filtering to Examples Tab
1. Modify `loadExamples()` in `backend.js` to accept optional `tag` parameter
2. Add filter buttons/pills in the Examples tab UI
3. Use existing `tags` field in database (no schema changes needed)

### Phase 2: Tech Type Filtering
Add WebGL/WebGPU filters based on `code_types` array:
- WebGL: Has `glsl_fragment`, `glsl_regular`, `glsl_stoy`, or `glsl_golf`
- WebGPU: Has `graphics` (WGSL) or `wgsl_audio` or `audio_gpu`

This can be client-side filtering or server-side using `.contains('code_types', [...])`

---

## Current Limitations
1. **No tag filtering UI** - Tags are stored but not exposed in gallery
2. **Hard limit of 50 on community** - Could increase or add pagination
3. **No search/sort options** - Only time-based ordering
4. **Client-side JS filtering** - Security measure, but means JS shaders invisible in gallery
5. **No combined filters** - Can't filter "WebGL + Lesson" easily without client-side logic

---

## Next Steps
1. Decide on UI approach (sub-tabs, filter bar, or separate tabs)
2. Modify `loadExamples()` to accept filter parameters
3. Add filter UI components
4. Update gallery population logic in `save.js`
5. Consider adding `.tags` field to shader creation/edit UI (currently exists but unused)

