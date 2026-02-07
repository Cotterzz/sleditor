# Cursor Consistency and Visibility Fix

**Date**: January 28, 2026  
**Files Modified**: 
- `V2/js/ui/panels/shader-controls.js`
- `ui-system/ui.css`

## Issues Fixed

### 1. Inconsistent Cursor Types

**Problem**: Different draggable elements used different cursor types:
- Windows used `cursor: move` (four-way arrows)
- Toolbar used `cursor: grab` / `cursor: grabbing` (hand cursors)
- Shader Controls used `cursor: grab` / `cursor: grabbing` (hand cursors)

**Why This Was Wrong**: 
- The grab/grabbing cursors (hand icons) are semantically for **panning surfaces** (like Google Maps)
- The move cursor (four-way arrows) is for **moving objects/windows**
- Since we're moving windows, toolbars, and UI elements (not panning a surface), the move cursor is correct

**Solution**: Changed all draggable elements to use `cursor: move` for consistency.

### 2. Cursor Visibility in Different Themes

**Problem**: The shader controls drag cursor lost its black outline when certain themes were selected, appearing as all-white and being hard to see against light backgrounds.

**Root Cause**: The `grab`/`grabbing` cursor appearance varies by browser and OS theme. In some configurations, it renders as solid white without an outline, making it invisible on light backgrounds.

**Solution**: The `move` cursor (four-way arrows) has a built-in black outline in all browsers, ensuring visibility across all themes.

## Changes Made

### File: `V2/js/ui/panels/shader-controls.js`

Changed shader controls floating container from grab cursors to move cursor:

```javascript
// Line 660 - Before
floatingContainer.style.cursor = 'grabbing';

// Line 660 - After
floatingContainer.style.cursor = 'move';

// Line 673 - Before
if (floatingContainer) floatingContainer.style.cursor = 'grab';

// Line 673 - After  
if (floatingContainer) floatingContainer.style.cursor = 'move';

// Line 684 - Before
floatingContainer.style.cursor = 'grab';

// Line 684 - After
floatingContainer.style.cursor = 'move';
```

### File: `ui-system/ui.css`

Changed toolbar cursors from grab to move (lines 162-186):

```css
/* Before */
.sl-app[data-toolbar-position="left"] .sl-toolbar {
    cursor: grab;
}
.sl-app[data-toolbar-position="right"] .sl-toolbar {
    cursor: grab;
}
.sl-app[data-toolbar-position="top"] .sl-toolbar,
.sl-app[data-toolbar-position="bottom"] .sl-toolbar {
    cursor: grab;
}
.sl-toolbar-wrapper.dragging .sl-toolbar {
    cursor: grabbing;
}

/* After */
.sl-app[data-toolbar-position="left"] .sl-toolbar {
    cursor: move;
}
.sl-app[data-toolbar-position="right"] .sl-toolbar {
    cursor: move;
}
.sl-app[data-toolbar-position="top"] .sl-toolbar,
.sl-app[data-toolbar-position="bottom"] .sl-toolbar {
    cursor: move;
}
.sl-toolbar-wrapper.dragging .sl-toolbar {
    cursor: move;  /* Consistent during drag */
}
```

## Cursor Semantics

### When to Use Each Cursor:

| Cursor | Use Case | Example |
|--------|----------|---------|
| `move` | Moving objects, windows, UI elements | Window dragging, toolbar repositioning ✅ |
| `grab` / `grabbing` | Panning surfaces, scrolling canvases | Google Maps, image pan-zoom |
| `pointer` | Clickable elements | Buttons, links |
| `text` | Text selection | Text fields, content |
| `crosshair` | Precise positioning | Drawing tools |

## Testing

To verify the fixes:

1. **Shader Controls**:
   - Undock the shader controls (click dock button)
   - Hover over the floating controls bar
   - Should see **four-way arrows** cursor
   - Drag the controls around
   - Cursor should remain **four-way arrows** during drag

2. **Toolbar**:
   - Hover over the toolbar
   - Should see **four-way arrows** cursor
   - Drag toolbar to different position
   - Cursor should remain **four-way arrows**

3. **Windows**:
   - Hover near window edge (in the frame zone)
   - Should see **four-way arrows** cursor
   - Drag window around
   - Cursor should remain **four-way arrows**

4. **Cursor Visibility Across Themes**:
   - Switch between different themes (Hacker, Architect, Designer)
   - The move cursor should be clearly visible in all themes
   - The four-way arrows have a built-in black outline for contrast

## Related Elements Still Using Grab Cursor

These elements correctly use grab/grabbing cursors as they represent panning/adjustment actions:

- **Sliders**: `ui.css` lines 2177, 2203, 2355, 2365
  - Sliding a value is analogous to grabbing and dragging
  - Semantically correct usage

- **Tab Dragging**: `ui.css` lines 4270, 4274
  - Reordering tabs by grabbing them
  - Could arguably be `move`, but `grabbing` is acceptable for reordering

## Benefits

1. **Consistency**: All window/UI movement uses the same cursor
2. **Semantic Correctness**: Using the right cursor for the action
3. **Visibility**: Move cursor has built-in outline, works in all themes
4. **User Understanding**: Four-way arrows clearly indicate "this can be moved"
5. **Professional Polish**: Attention to cursor semantics shows UI quality

## Future Considerations

If we later add actual panning features (like panning a large canvas or image):
- Those should use `grab` / `grabbing` cursors
- Example: A large shader output that can be panned around
- Example: An image editor or node graph that supports panning

But for moving discrete UI elements (windows, toolbars, controls), `move` is correct.
