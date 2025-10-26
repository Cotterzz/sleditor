// ============================================================================
// JS Sanitizer - Security Validation for User Code
// ============================================================================

// ============================================================================
// Blocked Patterns - APIs that are forbidden
// ============================================================================

const BLOCKED_PATTERNS = [
    // DOM access (direct)
    { pattern: /\bdocument\b/g, message: 'Access to document is blocked. Use api.* methods instead.' },
    { pattern: /\bwindow\b/g, message: 'Access to window is blocked. Use api.* methods instead.' },
    { pattern: /\bparent\b/g, message: 'Access to parent is blocked.' },
    { pattern: /\btop\b/g, message: 'Access to top is blocked.' },
    { pattern: /\bself\b/g, message: 'Access to self is blocked.' },
    { pattern: /\bframes\b/g, message: 'Access to frames is blocked.' },
    { pattern: /\bglobalThis\b/g, message: 'Access to globalThis is blocked.' },
    
    // Storage (direct)
    { pattern: /\blocalStorage\b/g, message: 'Access to localStorage is blocked.' },
    { pattern: /\bsessionStorage\b/g, message: 'Access to sessionStorage is blocked.' },
    { pattern: /\bindexedDB\b/g, message: 'Access to indexedDB is blocked.' },
    { pattern: /\bcookies?\b/g, message: 'Access to cookies is blocked.' },
    
    // Network (direct)
    { pattern: /\bfetch\s*\(/g, message: 'fetch() is blocked. No network access allowed.' },
    { pattern: /\bXMLHttpRequest\b/g, message: 'XMLHttpRequest is blocked. No network access allowed.' },
    { pattern: /\bWebSocket\b/g, message: 'WebSocket is blocked. No network access allowed.' },
    { pattern: /\bEventSource\b/g, message: 'EventSource is blocked. No network access allowed.' },
    { pattern: /\bnavigator\.sendBeacon\b/g, message: 'sendBeacon is blocked. No network access allowed.' },
    
    // Navigation
    { pattern: /\blocation\b/g, message: 'Access to location is blocked.' },
    { pattern: /\bhistory\b/g, message: 'Access to history is blocked.' },
    { pattern: /\bopen\s*\(/g, message: 'window.open() is blocked.' },
    
    // Dangerous eval-like functions
    { pattern: /\beval\s*\(/g, message: 'eval() is blocked.' },
    { pattern: /\bnew\s+Function\s*\(/g, message: 'Function constructor is blocked.' },
    { pattern: /\bsetTimeout\s*\(\s*['"`]/g, message: 'setTimeout with string is blocked. Use function instead.' },
    { pattern: /\bsetInterval\s*\(\s*['"`]/g, message: 'setInterval with string is blocked. Use function instead.' },
    
    // Workers and frames
    { pattern: /\bnew\s+Worker\b/g, message: 'Worker creation is blocked.' },
    { pattern: /\bnew\s+SharedWorker\b/g, message: 'SharedWorker creation is blocked.' },
    { pattern: /\bimportScripts\b/g, message: 'importScripts is blocked.' },
    { pattern: /\bcreateElement\s*\(\s*['"`]iframe/g, message: 'iframe creation is blocked.' },
    { pattern: /\bcreateElement\s*\(\s*['"`]script/g, message: 'script creation is blocked.' },
    
    // PostMessage (to prevent escape attempts)
    { pattern: /\bpostMessage\b/g, message: 'postMessage is blocked.' },
    
    // Import/export (we wrap this ourselves)
    { pattern: /\bimport\s+/g, message: 'import statements are not allowed. Use provided APIs only.' },
    { pattern: /\bexport\s+/g, message: 'export statements are not allowed. Functions are auto-exported.' },
    
    // Prototype pollution
    { pattern: /\bObject\.prototype\b/g, message: 'Modifying Object.prototype is blocked.' },
    { pattern: /\bArray\.prototype\b/g, message: 'Modifying Array.prototype is blocked.' },
    { pattern: /\bFunction\.prototype\b/g, message: 'Modifying Function.prototype is blocked.' },
    
    // Constructor access (can be used to escape scope)
    { pattern: /\bconstructor\b/g, message: 'Access to constructor is blocked.' },
    { pattern: /\b__proto__\b/g, message: 'Access to __proto__ is blocked.' },
    
    // ============================================================================
    // NEW: Timing attacks and advanced bypasses
    // ============================================================================
    
    // Timing attack vectors (Spectre-class attacks)
    { pattern: /\bSharedArrayBuffer\b/g, message: 'SharedArrayBuffer is blocked (timing attack vector).' },
    { pattern: /\bAtomics\b/g, message: 'Atomics is blocked (timing attack vector).' },
    
    // Property access bypasses (bracket notation to evade simple detection)
    { pattern: /\['localStorage'\]/g, message: 'Bracket notation access to localStorage is blocked.' },
    { pattern: /\["localStorage"\]/g, message: 'Bracket notation access to localStorage is blocked.' },
    { pattern: /\['sessionStorage'\]/g, message: 'Bracket notation access to sessionStorage is blocked.' },
    { pattern: /\["sessionStorage"\]/g, message: 'Bracket notation access to sessionStorage is blocked.' },
    { pattern: /\['fetch'\]/g, message: 'Bracket notation access to fetch is blocked.' },
    { pattern: /\["fetch"\]/g, message: 'Bracket notation access to fetch is blocked.' },
    { pattern: /\['eval'\]/g, message: 'Bracket notation access to eval is blocked.' },
    { pattern: /\["eval"\]/g, message: 'Bracket notation access to eval is blocked.' },
    
    // Property access via computed strings
    { pattern: /\[['"`]document['"`]\]/g, message: 'Computed access to document is blocked.' },
    { pattern: /\[['"`]window['"`]\]/g, message: 'Computed access to window is blocked.' },
    
    // Template literal string building (e.g., `${'doc'}${'ument'}`)
    // This is hard to catch perfectly, but we can catch common patterns
    { pattern: /String\.fromCharCode/g, message: 'String.fromCharCode is blocked (obfuscation technique).' },
    { pattern: /String\.fromCodePoint/g, message: 'String.fromCodePoint is blocked (obfuscation technique).' },
    
    // Function.prototype tricks to get global context
    { pattern: /\(\s*function\s*\(\s*\)\s*\{\s*\}\s*\)\.constructor/g, message: 'Function constructor access via prototype is blocked.' },
    { pattern: /\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)\.constructor/g, message: 'Function constructor access via arrow function is blocked.' },
    
    // 'this' in non-strict mode points to global object
    // In strict mode (ES6 modules) this is undefined, so less risky, but block anyway
    { pattern: /\bthis\s*\[/g, message: 'Property access via "this" is blocked.' },
    
    // arguments.callee.caller can leak scope (deprecated but still works)
    { pattern: /\barguments\.callee/g, message: 'arguments.callee is blocked.' },
    { pattern: /\barguments\.caller/g, message: 'arguments.caller is blocked.' },
    
    // Access to Function via various methods
    { pattern: /\(\[\]\)\.constructor\.constructor/g, message: 'Indirect Function constructor access is blocked.' },
    { pattern: /\(\{\}\)\.constructor\.constructor/g, message: 'Indirect Function constructor access is blocked.' },
];

// ============================================================================
// Sanitization
// ============================================================================

/**
 * Sanitize user JS code for security violations
 * @param {string} code - User code to sanitize
 * @returns {object} - { success: boolean, errors: [{lineNum, column, endColumn, message}] }
 */
export function sanitize(code) {
    const errors = [];
    const lines = code.split('\n');
    
    for (const blocked of BLOCKED_PATTERNS) {
        // Reset regex lastIndex
        blocked.pattern.lastIndex = 0;
        
        let match;
        while ((match = blocked.pattern.exec(code)) !== null) {
            // Find line number and column
            let lineNum = 1;
            let lineStart = 0;
            let pos = match.index;
            
            for (let i = 0; i < code.length && i < pos; i++) {
                if (code[i] === '\n') {
                    lineNum++;
                    lineStart = i + 1;
                }
            }
            
            const column = pos - lineStart + 1;
            const endColumn = column + match[0].length;
            
            errors.push({
                lineNum,
                column,
                endColumn,
                message: `Security violation: ${blocked.message}`
            });
        }
    }
    
    if (errors.length > 0) {
        return { success: false, errors };
    }
    
    return { success: true };
}

// ============================================================================
// Safe API Whitelist (for documentation)
// ============================================================================

/**
 * These JavaScript APIs are safe and allowed:
 * 
 * - Math.*             (all math functions)
 * - console.*          (logging)
 * - performance.now()  (timing)
 * - Date               (time functions)
 * - JSON               (parsing/stringifying)
 * - Array methods      (map, filter, reduce, etc.)
 * - Object methods     (keys, values, entries, etc.)
 * - String methods     (all string functions)
 * - Number methods     (all number functions)
 * - Typed Arrays       (Float32Array, Int32Array, etc.)
 * - Set, Map, WeakMap, WeakSet
 * - Promise            (async/await)
 * - Proxy, Reflect
 * 
 * Everything else must be accessed via the api.* object:
 * - api.time           (current time)
 * - api.mouse          (mouse position)
 * - api.uniforms.*     (set uniforms)
 * - api.audio.*        (audio worklet communication)
 */

