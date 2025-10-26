# JS Security & Performance Testing Guide

## 🔍 Verification Steps

### **1. Check Console Logs - Verify Mode is Active**

When you compile a shader with JS, you should see:

#### Function Mode (default):
```
📦 Compiling JS with Function Eval (compatible)
  ✓ Function compilation took 0.123ms
▶️  Executing enterframe() compiled with: function
```

#### Module Mode (optimized):
```
🚀 Compiling JS with Dynamic Import (optimized)
  ✓ Module import took 1.456ms
▶️  Executing enterframe() compiled with: module
```

### **2. Toggle Between Modes**

1. Open Console (F12)
2. Click **⚙ Options** → **⚡ JS: Function Eval**
3. Console should show: `⚙️  JS Execution Mode toggled: function → module`
4. Status bar shows: `✓ JS execution mode: Module Import (optimized)`
5. Click again to toggle back
6. Console should show: `⚙️  JS Execution Mode toggled: module → function`

---

## 🧪 Security Tests

### **Test 1: Block localStorage**
```javascript
function enterframe(state, api) {
    localStorage.setItem('test', 'hacked');
}
```
**Expected:** Red error line on `localStorage`, message: `Security violation: Access to localStorage is blocked.`

### **Test 2: Block fetch**
```javascript
function enterframe(state, api) {
    fetch('https://evil.com');
}
```
**Expected:** Red error line on `fetch`, message: `Security violation: fetch() is blocked. No network access allowed.`

### **Test 3: Block document access**
```javascript
function enterframe(state, api) {
    document.body.innerHTML = '<h1>Hacked</h1>';
}
```
**Expected:** Red error line on `document`, message: `Security violation: Access to document is blocked. Use api.* methods instead.`

### **Test 4: Block eval**
```javascript
function enterframe(state, api) {
    eval('console.log("hacked")');
}
```
**Expected:** Red error line on `eval`, message: `Security violation: eval() is blocked.`

### **Test 5: Block window access**
```javascript
function init() {
    return { w: window };
}
```
**Expected:** Red error line on `window`, message: `Security violation: Access to window is blocked. Use api.* methods instead.`

### **Test 6: Block SharedArrayBuffer (NEW)**
```javascript
function enterframe(state, api) {
    const sab = new SharedArrayBuffer(1024);
}
```
**Expected:** Red error line on `SharedArrayBuffer`, message: `Security violation: SharedArrayBuffer is blocked (timing attack vector).`

### **Test 7: Block Atomics**
```javascript
function enterframe(state, api) {
    Atomics.wait(buffer, 0, 0);
}
```
**Expected:** Red error line on `Atomics`, message: `Security violation: Atomics is blocked (timing attack vector).`

### **Test 8: Block bracket notation bypass**
```javascript
function enterframe(state, api) {
    window['localStorage']['setItem']('x', 'y');
}
```
**Expected:** Red error line on `window` AND `['localStorage']`, multiple security violations.

### **Test 9: Block String.fromCharCode obfuscation**
```javascript
function enterframe(state, api) {
    const w = String.fromCharCode(119,105,110,100,111,119);
}
```
**Expected:** Red error line on `String.fromCharCode`, message: `Security violation: String.fromCharCode is blocked (obfuscation technique).`

### **Test 10: Block constructor escape**
```javascript
function enterframe(state, api) {
    const F = [].constructor;
}
```
**Expected:** Red error line on `constructor`, message: `Security violation: Access to constructor is blocked.`

---

## ⚡ Performance Benchmark

### **Heavy Computation Test**

```javascript
function init() {
    return { frameCount: 0, totalTime: 0 };
}

function enterframe(state, api) {
    const start = performance.now();
    
    // Heavy computation
    let sum = 0;
    for (let i = 0; i < 5000000; i++) {
        sum += Math.sin(i) * Math.cos(i);
    }
    api.uniforms.setCustomFloat(0, sum);
    
    const elapsed = performance.now() - start;
    state.totalTime += elapsed;
    state.frameCount++;
    
    // Log every second
    if (state.frameCount % 60 === 0) {
        const avgTime = state.totalTime / state.frameCount;
        console.log(`Avg enterframe time: ${avgTime.toFixed(2)}ms (${(1000/avgTime).toFixed(1)} calls/sec)`);
    }
}
```

### **Expected Results**

| Mode | Avg Time | Calls/sec | Browser |
|------|----------|-----------|---------|
| Function Eval | ~150ms | ~6.7/sec | Chrome |
| Module Import | ~145ms | ~6.9/sec | Chrome (3% faster) |
| Function Eval | ~90ms | ~11.1/sec | Firefox |
| Module Import | ~85ms | ~11.8/sec | Firefox (6% faster) |

**Note:** Performance difference is subtle because:
- JIT optimization happens on first run (both methods get optimized eventually)
- Heavy math operations dominate (Math.sin/cos are native)
- Real difference shows in complex object manipulation, closures, and loops

### **Better Performance Test - Object Creation**

```javascript
function init() {
    return { frameCount: 0, totalTime: 0 };
}

function enterframe(state, api) {
    const start = performance.now();
    
    // Object creation and manipulation (shows JIT difference better)
    const objects = [];
    for (let i = 0; i < 100000; i++) {
        objects.push({
            x: Math.random(),
            y: Math.random(),
            z: Math.random(),
            calc: function() { return this.x * this.y + this.z; }
        });
    }
    
    let sum = 0;
    for (const obj of objects) {
        sum += obj.calc();
    }
    
    api.uniforms.setCustomFloat(0, sum);
    
    const elapsed = performance.now() - start;
    state.totalTime += elapsed;
    state.frameCount++;
    
    // Log every second
    if (state.frameCount % 60 === 0) {
        const avgTime = state.totalTime / state.frameCount;
        console.log(`Avg enterframe time: ${avgTime.toFixed(2)}ms (${(1000/avgTime).toFixed(1)} calls/sec)`);
    }
}
```

This test should show **5-15% performance difference** because module imports receive full V8 JIT optimization immediately.

---

## 🎯 Quick Verification Checklist

- [ ] Console shows correct compilation mode (📦 or 🚀)
- [ ] Toggle switches mode (check console: ⚙️ toggled)
- [ ] Security violations are caught (try `localStorage`, `fetch`, `document`)
- [ ] Performance difference is measurable (use object creation test)
- [ ] Settings persist on page reload (toggle, reload, check Options menu)
- [ ] Both modes work correctly (no runtime errors)

---

## 🐛 Troubleshooting

### "I don't see any console logs"
- Open DevTools (F12)
- Make sure Console tab is selected
- Try toggling JS execution mode in Options

### "No performance difference"
- Make sure you're using heavy computation test
- Run for at least 60 frames to get accurate average
- Try the object creation test instead of Math operations
- Dynamic import may be slightly SLOWER on first compile (blob creation overhead)

### "Security violations not caught"
- Make sure you're in the JS tab (not GLSL or WGSL)
- Check that code is actually compiling (click Reload button)
- Look for red underline in editor

### "Toggle doesn't work"
- Check console for toggle message
- Verify `state.jsExecutionMode` in console: `console.log(state.jsExecutionMode)`
- Clear localStorage and reload: `localStorage.clear(); location.reload()`

---

## 📊 Why Performance Difference is Small

1. **JIT Eventually Optimizes Both**: V8 will optimize frequently-called functions regardless of method
2. **Native Operations Dominate**: Math.sin/cos are native C++ code, not JS
3. **Modern Browsers Are Smart**: Chrome/Firefox have similar performance for both methods
4. **Compilation Happens Once**: Runtime performance is what matters, not compile time

**The real benefit:** Dynamic import is the STANDARD ES6 way, more maintainable, and ready for future optimizations. It also allows us to potentially add `import` statements inside user code later.

