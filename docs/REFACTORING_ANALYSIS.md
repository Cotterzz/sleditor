# SLEditor - Code Organization Analysis

## Executive Summary

### Current Status
- **Total JS files**: 31 (including backends)
- **Total JS LOC**: ~10,000
- **Largest modules**: `backend.js` (1019), `ui.js` (710), `shader-management.js` (652)
- **Inline styles in HTML**: 62 occurrences

### Key Findings
1. ✅ `index.js` is reasonably clean - recent additions are acceptable
2. ⚠️ **3 modules are too large** and need splitting
3. ⚠️ `index.html` still has 62 inline styles that should be extracted
4. ✅ Most modules are well-sized and focused
5. 📁 Project would benefit from folder organization

---

## 1. index.js Recent Additions Analysis

### What We Added Recently
1. **Fullscreen initialization** (`fullscreen.init()`) - ✅ GOOD
2. **Uniform controls button** - ✅ GOOD (proper delegation)
3. **Default shader slug loading** - ✅ ACCEPTABLE (bootstrap concern)

### Assessment
**VERDICT**: ✅ **index.js is still clean**

Recent additions follow the established pattern:
- Import module → Initialize module → Wire up events
- No business logic added
- Maintains separation of concerns

The default shader slug could theoretically move to `routing.js`, but it's acceptable as a bootstrap concern.

---

## 2. Module Purpose Overview Document

**Created**: `PROJECT_STRUCTURE.md`

This document provides:
- Purpose statement for each module
- What each module should/shouldn't contain
- Module size analysis
- Folder structure recommendations
- Design principles
- Recent additions review

**Usage**: Reference this before making changes or adding features.

---

## 3. index.html CSS Extraction Analysis

### Current State
- **62 inline `style=` attributes**
- Most are on key structural elements

### Can Be Extracted Immediately (Low Risk)

#### Category A: Flexbox Layouts (28 occurrences)
These are repetitive layout styles that should be CSS classes:

```html
<!-- Lines with: display: flex; align-items: center; gap: -->
- Top bar sections (4 occurrences)
- Social links (6 occurrences)
- Button groups (3 occurrences)
- Control panels (5 occurrences)
- Auth section (3 occurrences)
- Shader info displays (7 occurrences)
```

**Recommendation**: Create CSS classes like:
- `.flex-row` - `display: flex; align-items: center;`
- `.flex-col` - `display: flex; flex-direction: column;`
- `.gap-sm` / `.gap-md` / `.gap-lg` - Different gap sizes
- `.flex-1` - `flex: 1;`

#### Category B: Component-Specific Styles (20 occurrences)
Help panel positioning, image sizing, etc.

**Recommendation**: Move to `app.css` with specific selectors:
- `#helpPanel` positioning
- `#helpLogo`, `#helpContent` sizing
- `.logo-image` for branded images
- User avatar styles

#### Category C: Utility Styles (14 occurrences)
Font sizes, paddings, margins on specific elements.

**Recommendation**: Either:
1. Create utility classes (`.text-sm`, `.p-1`, etc.)
2. Move to component-specific CSS rules

### Risk Assessment

**LOW RISK** to extract:
- Flex container styles → CSS classes
- Help panel positioning → ID selectors in CSS
- Logo/image sizing → CSS classes

**MEDIUM RISK**:
- Button inline styles (might break if specificity changes)
- Modal content layouts (need testing)

**Recommendation**: Start with **Category A** (flexbox layouts) - easy wins, low risk.

---

## 4. Modules That Need Splitting

### Priority 1: backend.js (1019 lines) 🔴 URGENT

**Current responsibilities**:
- Supabase initialization
- Authentication (OAuth + email/password)
- Shader CRUD (create, read, update, delete)
- Like/view tracking
- Real-time subscriptions
- Bandwidth analytics

**Proposed split**:
```
js/backend/
├── index.js          # Init, expose facade (100 lines)
├── auth.js           # All auth logic (300 lines)
├── shaders.js        # Shader CRUD operations (250 lines)
├── community.js      # Likes, views, subscriptions (200 lines)
└── analytics.js      # Bandwidth tracking (150 lines)
```

**Benefits**:
- Much easier to understand and maintain
- Clear separation of concerns
- Can test each piece independently
- Natural boundaries for future features

---

### Priority 2: ui.js (710 lines) 🟡 SHOULD SPLIT

**Current responsibilities**:
- Play/pause/restart controls
- Volume control
- Panel divider dragging (3 dividers!)
- Canvas resizing
- Help panel dragging
- Theme switching
- Render mode cycling

**Proposed split**:
```
js/ui/
├── index.js          # Re-export facade (30 lines)
├── controls.js       # Play/pause/restart/volume (150 lines)
├── panels.js         # All divider dragging + help (300 lines)
├── canvas.js         # Canvas size management (150 lines)
└── theme.js          # Theme switching (80 lines)
```

**Benefits**:
- Each file has ONE clear purpose
- Easier to find and modify specific features
- Reduced cognitive load

---

### Priority 3: shader-management.js (652 lines) 🟡 SHOULD SPLIT

**Current responsibilities**:
- New shader creation (multiple types)
- Edit mode/display mode switching
- Save workflows
- Fork workflows  
- Dirty state management
- Title/description editing

**Proposed split**:
```
js/shader/
├── index.js          # Re-export facade (30 lines)
├── creation.js       # New shader workflows (250 lines)
└── editing.js        # Edit/save/fork/dirty state (372 lines)
```

**Benefits**:
- Separate "creation" from "modification" concerns
- Clearer code paths

---

### Lower Priority: save.js (558 lines) 🟢 MODERATE

Currently OK but could be split:
```
js/data/
├── save.js           # Main loading logic (300 lines)
└── gallery.js        # Gallery rendering/caching (258 lines)
```

Not urgent - wait until it grows more.

---

## 5. Folder Structure Recommendations

### Current (Flat)
```
js/
├── 28 files at root level
└── backends/ (3 files)
```

**Problem**: Hard to navigate, unclear organization

### Proposed (Organized)
```
js/
├── core.js
├── index.js
│
├── rendering/          # Rendering pipeline
│   ├── render.js
│   ├── compiler.js
│   └── backends/
│       ├── webgl.js
│       ├── webgpu.js
│       └── audio-worklet.js
│
├── ui/                 # User interface
│   ├── index.js
│   ├── controls.js
│   ├── panels.js
│   ├── canvas.js
│   ├── theme.js
│   ├── fullscreen.js
│   └── uniform-controls.js
│
├── editor/             # Code editing
│   ├── editor.js
│   ├── tabs.js
│   ├── tab-config.js
│   └── vim.js
│
├── shader/             # Shader management
│   ├── index.js
│   ├── creation.js
│   ├── editing.js
│   ├── boilerplate.js
│   └── examples.js
│
├── backend/            # Supabase
│   ├── index.js
│   ├── auth.js
│   ├── shaders.js
│   ├── community.js
│   └── analytics.js
│
├── data/               # Data & content
│   ├── save.js
│   ├── routing.js
│   ├── comments.js
│   └── help-sections.js
│
└── runtime/            # Execution
    ├── js-runtime.js
    ├── uniforms.js
    ├── audio.js
    └── performance-monitor.js
```

**Benefits**:
- Clear mental model of codebase
- Easy to find related code
- Natural organization for new features
- Better for IDE navigation

---

## Recommended Action Plan

### Phase 1: Documentation (DONE ✅)
- [x] Create PROJECT_STRUCTURE.md

### Phase 2: Quick Wins (1-2 hours)
1. Extract Category A inline styles from `index.html` (flexbox layouts)
2. Delete `sanitizer.js` (unused)
3. Test that nothing breaks

### Phase 3: Critical Refactoring (4-6 hours)
1. **Split `backend.js`** into `backend/` folder
   - This is the most important - it's 1000+ lines!
   - Create auth.js, shaders.js, community.js, analytics.js
   - Test auth, save, load, likes thoroughly

### Phase 4: UI Refactoring (3-4 hours)
1. **Split `ui.js`** into `ui/` folder
   - Extract controls.js, panels.js, canvas.js, theme.js
   - Test all divider dragging, play/pause, canvas resize

### Phase 5: Shader Refactoring (2-3 hours)
1. **Split `shader-management.js`** into `shader/` folder
   - Move boilerplate.js and examples.js here too
   - Test new shader, edit, save, fork workflows

### Phase 6: Folder Organization (2-3 hours)
1. Create folder structure
2. Move files into folders
3. Update all imports
4. Test thoroughly

---

## CSS Extraction Quick Start

### 1. Create new utility classes in `app.css`:

```css
/* Flex utilities */
.flex-row { display: flex; align-items: center; }
.flex-col { display: flex; flex-direction: column; }
.gap-xs { gap: 2px; }
.gap-sm { gap: 4px; }
.gap-md { gap: 6px; }
.gap-lg { gap: 8px; }
.gap-xl { gap: 12px; }
.flex-1 { flex: 1; }
.flex-center { display: flex; justify-content: center; align-items: center; }

/* Spacing utilities */
.p-1 { padding: 4px; }
.p-2 { padding: 8px; }
.pl-1 { padding-left: 4px; }
.pr-1 { padding-right: 4px; }

/* Text utilities */
.text-xs { font-size: 11px; }
.text-sm { font-size: 12px; }
.text-md { font-size: 14px; }
.font-semibold { font-weight: 600; }
```

### 2. Replace in HTML:

**Before**:
```html
<div style="display: flex; align-items: center; gap: 6px;">
```

**After**:
```html
<div class="flex-row gap-md">
```

### 3. Test each change:
- Load page
- Check layout
- Test interactions
- Commit if working

---

## Summary

1. ✅ **index.js is fine** - recent additions are appropriate
2. 📄 **Documentation created** - PROJECT_STRUCTURE.md for reference
3. ⚠️ **62 inline styles** can be extracted - start with flexbox (low risk)
4. 🔴 **3 large modules** need splitting - backend.js is highest priority
5. 📁 **Folder structure** would greatly improve navigation

**Immediate next steps**:
1. Review PROJECT_STRUCTURE.md
2. Extract flexbox inline styles (quick win)
3. Plan backend.js split (critical refactor)