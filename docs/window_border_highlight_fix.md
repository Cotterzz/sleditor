# Window Border Highlight Fix

**Date**: January 28, 2026  
**Files Modified**: `ui-system/ui.css`

## Issues Fixed

### 1. Border Highlight Hidden by Content

**Problem**: The window border highlight was partially or completely hidden by window content, especially noticeable in the code editor and theme-dependent. This affected all three states:
- **Hover state**: When mouse is near window edge (frame-visible)
- **Dragging state**: When actively dragging the window
- **Resizing state**: When actively resizing the window

**Root Cause**: The outline was using `outline-offset: -2px`, which positioned it INSIDE the window body, allowing content to render over it.

**Solution**: Changed `outline-offset` from `-2px` to `0` for all three states, positioning the outline at the edge of the window body instead of inside it.

```css
/* Before - Hover */
.sl-window-container.frame-visible .sl-window-body {
    outline: 2px solid var(--accent);
    outline-offset: -2px;  /* ❌ Inside the window */
}

/* After - Hover */
.sl-window-container.frame-visible .sl-window-body {
    outline: 2px solid var(--accent);
    outline-offset: 0;  /* ✅ At the edge */
}

/* Before - Dragging/Resizing */
.sl-window-container.dragging .sl-window-body,
.sl-window-container.resizing .sl-window-body {
    outline: 2px solid var(--accent);
    outline-offset: -2px;  /* ❌ Inside the window */
}

/* After - Dragging/Resizing */
.sl-window-container.dragging .sl-window-body,
.sl-window-container.resizing .sl-window-body {
    outline: 2px solid var(--accent);
    outline-offset: 0;  /* ✅ At the edge */
}
```

### 2. Rendering Glitches in Glass Mode (Chrome Bug)

**Problem**: When the shader preview window was in glass/transparent mode, the border highlight caused rendering glitches in the background. This happened in all three states (hover, dragging, resizing). This is a Chrome compositor bug triggered by the accent color outline on transparent elements.

**Root Cause**: Chrome has a known bug where colored outlines on transparent elements can cause compositor artifacts during movement.

**Solution**: Added specific CSS rules for windows in glass mode that use black outline instead of the accent color for all three states.

```css
/* Glass mode hover: use black outline to avoid Chrome rendering bugs */
.sl-window-container.glass-mode.frame-visible .sl-window-body {
    outline-color: #000;
}

/* Glass mode dragging/resizing: use black outline to avoid Chrome rendering bugs */
.sl-window-container.glass-mode.dragging .sl-window-body,
.sl-window-container.glass-mode.resizing .sl-window-body {
    outline-color: #000;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}
```

## Implementation Details

### How Glass Mode is Detected

The preview panel (`V2/js/ui/panels/preview.js`) adds the `glass-mode` class to the window container when glass mode is enabled:

```javascript
// Line 73 in preview.js
if (windowContainer) {
    windowContainer.classList.add('glass-mode');
    // ... transparent styling
}
```

This class is used in CSS to apply the black outline specifically to glass mode windows.

### CSS Specificity

The glass mode rule is more specific than the general rule, so it correctly overrides:

```css
/* General (specificity: 0,3,0) */
.sl-window-container.dragging .sl-window-body { ... }

/* Glass mode (specificity: 0,4,0) - wins! */
.sl-window-container.glass-mode.dragging .sl-window-body { ... }
```

## Testing

To verify the fixes:

1. **Border Visibility - All States**:
   - Open any panel (editor, console, etc.)
   - **Hover**: Move mouse near window edge (not over content) - should see accent outline at edge
   - **Drag**: Drag the window by its frame - outline should remain visible and not be hidden by content
   - **Resize**: Grab a resize handle - outline should be visible during resize
   - In all cases, the outline should be at the window edge, not inside where content can hide it

2. **Glass Mode Rendering - All States**:
   - Open the Preview panel
   - Enable glass mode (transparent background)
   - **Hover**: Move mouse near window edge - should see BLACK outline (not accent color)
   - **Drag**: Drag the preview window around - should see BLACK outline, NO rendering glitches
   - **Resize**: Resize the window - should see BLACK outline, NO artifacts
   - The black outline prevents Chrome's compositor bug with transparent elements

3. **Normal Mode Still Works**:
   - Disable glass mode on preview
   - Test hover, drag, and resize
   - Should see the normal accent-colored outline in all three states

## Trade-offs

- **Glass Mode Outline Color**: Using black instead of the accent color is less visually cohesive, but necessary to avoid the Chrome bug. This is an acceptable trade-off since:
  - Glass mode is a special-case feature
  - The outline is only visible during dragging/resizing (temporary)
  - Avoiding rendering glitches is more important than visual consistency in this edge case
  - The black outline is still clearly visible against most backgrounds

- **Outline Position**: Using `outline-offset: 0` instead of `-2px` means:
  - The outline is at the exact edge of the window body
  - It's always fully visible (not hidden by content)
  - It doesn't overlap the window content area
  - The visual appearance is slightly different but more consistent

## Future Improvements

If Chrome fixes the compositor bug with transparent elements:
- The glass mode rule could be removed
- All windows could use the accent color consistently

Alternatively:
- Could detect the browser/version and only apply the black outline workaround for affected Chrome versions
- Could use a different visual indicator (border instead of outline) that doesn't trigger the bug
