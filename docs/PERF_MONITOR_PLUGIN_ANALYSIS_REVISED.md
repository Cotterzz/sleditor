# Performance Monitor - TRUE Integration Analysis

## You're Right - There IS Coupling!

### Dependencies Performance Monitor USES:

#### 1. Global State Access
```javascript
import { state } from './core.js';

// Line 369: Reads FPS
samples.fps = Math.round(state.fps || 0);

// Lines 127-129: Checks memory API
if (performance.memory) { ... }

// Lines 133-134: Checks screen refresh rate  
if (window.screen?.availWidth) { ... }
```

#### 2. Performance API Polling
```javascript
// Lines 416-419: Constantly polls performance.getEntriesByType()
const resources = performance.getEntriesByType('resource');

// Line 378-379: Reads memory
performance.memory.usedJSHeapSize

// Lines 299, 325, 333, 339, 354: performance.now() called 5 times per sample
```

#### 3. Window/Backend Access
```javascript
// Lines 492-503: Reads window.backend for Supabase stats
if (window.backend?.getBandwidthStats) {
    const stats = window.backend.getBandwidthStats();
}
```

#### 4. DOM Manipulation
```javascript
// Line 253: Appends to body
document.body.appendChild(panel);

// Lines 148-250: Creates 100+ DOM elements
document.createElement('div') × 50+
document.getElementById('perfTotal...') × 4
```

#### 5. RequestAnimationFrame Loop
```javascript
// Lines 354-363: Runs continuously once started!
function startSampling() {
    requestAnimationFrame(startSampling);  // Infinite loop!
}
```

## The REAL Problem: Active Polling

### It's Not Just "Called From 3 Files"

The performance monitor **actively runs every 200ms** checking:
- ✅ `performance.getEntriesByType('resource')` - Heavy API call
- ✅ `performance.memory` - Memory snapshot
- ✅ `state.fps` - Global state read
- ✅ `window.backend.getBandwidthStats()` - Module call
- ✅ Canvas rendering - 8 timelines + mini viz

**This runs whether the panel is open or not!**

## Revised Difficulty: **MODERATE** ⭐⭐⭐⭐

### Why It's Harder Than I Said:

1. **Active Sampling Loop**: Can't just "lazy load" - need to START/STOP the loop
2. **State Coupling**: Reads `state.fps` which is set by `render.js`
3. **Backend Coupling**: Calls `window.backend.getBandwidthStats()`
4. **Performance API Spam**: Polls `getEntriesByType()` constantly
5. **DOM Always Present**: Mini canvas added to DOM on init

## Plugin Conversion Strategy (Revised)

### Option 1: Lazy Load + Manual Start/Stop
**Difficulty**: Moderate ⭐⭐⭐⭐

```javascript
// js/index.js
let perfMonitor = null;
let perfMonitorActive = false;

async function initPerfMonitor() {
    if (!perfMonitor) {
        perfMonitor = await import('./performance-monitor.js');
    }
    if (!perfMonitorActive) {
        perfMonitor.init();
        perfMonitor.start();  // NEW: Start the sampling loop
        perfMonitorActive = true;
    }
}

// Optional: Stop when not needed
function stopPerfMonitor() {
    if (perfMonitor?.stop) {
        perfMonitor.stop();  // NEW: Stop the sampling loop
        perfMonitorActive = false;
    }
}
```

**Changes needed in performance-monitor.js:**
```javascript
// Add start/stop API
export function start() {
    if (!perfState.isActive) {
        perfState.isActive = true;
        startSampling();
    }
}

export function stop() {
    perfState.isActive = false;
    // RAF loop will naturally stop checking isActive
}
```

### Option 2: Null Object Pattern (Cleaner)
**Difficulty**: Moderate ⭐⭐⭐⭐

Create stub functions that do nothing when plugin isn't loaded:

```javascript
// js/render.js
let perfMonitor = {
    markFrameStart: () => {},
    markFrameEnd: () => {},
    markJSStart: () => {},
    markJSEnd: () => {}
};

// Later, when loaded:
perfMonitor = await import('./performance-monitor.js');
```

## The Key Issues:

### 1. **Sampling Loop Runs Always**
Currently starts in `createMiniVisualization()` (line 299):
```javascript
perfState.isActive = true;
perfState.lastSampleTime = performance.now();
startSampling();  // ← Starts infinite RAF loop
```

**Fix**: Don't start loop until explicitly requested.

### 2. **Calls To Plugin Are Synchronous**
```javascript
// render.js calls this 60 times/second
perfMonitor.markFrameStart();
```

If module isn't loaded yet, this breaks. Need null checks or stubs.

### 3. **Plugin Reads From Other Modules**
```javascript
window.backend.getBandwidthStats()  // Performance monitor → backend
state.fps                            // Performance monitor → core
```

These dependencies are INVERTED from normal plugin architecture.

## Recommended Approach: Hybrid

### Phase 1: Make It Disableable (30 min)
```javascript
// Add setting in core.js
const CONFIG = {
    enablePerfMonitor: true  // User can disable
};

// In index.js
if (CONFIG.enablePerfMonitor) {
    await import('./performance-monitor.js');
}
```

### Phase 2: Add Start/Stop (1 hour)
- Don't auto-start sampling loop
- Add `start()` / `stop()` methods
- Start only when button clicked or panel opened

### Phase 3: Full Plugin (3 hours)
- Event-based instead of polling
- Emit events instead of reading `state.fps`
- Register with plugin system
- Lazy load on first use

## The Honest Answer

**Making it a true plugin is MODERATE complexity** because:

✅ Code is isolated (good!)  
❌ It actively polls multiple APIs (bad!)  
❌ It reads from other modules (inverted dependency)  
❌ Sampling loop runs continuously (performance cost)  
❌ DOM mutations on init (not lazy)

**Estimated time for proper plugin conversion**: 2-3 hours

**Quick win (disable toggle)**: 30 minutes

Want me to start with the quick win (add disable setting)?

