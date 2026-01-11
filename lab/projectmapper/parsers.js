// ===================== PARSING UTILITIES =====================

// Remove comments from JavaScript code (both // and /* */)
// This is a simplified implementation - for production, consider using a proper tokenizer
function removeComments(code) {
    let result = '';
    let i = 0;

    while (i < code.length) {
        const char = code[i];
        const nextChar = i + 1 < code.length ? code[i + 1] : '';

        if (char === '/' && nextChar === '/') {
            // Single line comment
            while (i < code.length && code[i] !== '\n') {
                i++;
            }
        } else if (char === '/' && nextChar === '*') {
            // Multi-line comment
            i += 2; // Skip /*
            while (i < code.length - 1) {
                if (code[i] === '*' && code[i + 1] === '/') {
                    i += 2; // Skip */
                    break;
                }
                i++;
            }
        } else {
            result += char;
            i++;
        }
    }

    return result;
}

// Check if a position in code is inside a comment
function isInComment(code, position) {
    // Check for single-line comments
    for (let i = position; i >= 0; i--) {
        if (code[i] === '\n') break;
        if (code[i] === '/' && i > 0 && code[i - 1] === '/') {
            return true;
        }
    }

    // Check for multi-line comments
    let inMultilineComment = false;
    for (let i = 0; i <= position; i++) {
        if (!inMultilineComment && i < code.length - 1 && code[i] === '/' && code[i + 1] === '*') {
            inMultilineComment = true;
            i++; // Skip the *
        } else if (inMultilineComment && i < code.length - 1 && code[i] === '*' && code[i + 1] === '/') {
            inMultilineComment = false;
            i++; // Skip the /
        }
    }

    return inMultilineComment;
}

// Check if a position in code is inside a string or regex literal
// This is a simplified check - for production, use a proper parser
function isInLiteral(code, position) {
    let inString = false;
    let stringChar = '';
    let inRegex = false;
    let braceDepth = 0;
    let parenDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < position && i < code.length; i++) {
        const char = code[i];
        const prevChar = i > 0 ? code[i - 1] : '';
        const nextChar = i + 1 < code.length ? code[i + 1] : '';

        // Handle strings
        if (!inRegex && !inString) {
            if (char === '"' || char === "'") {
                inString = true;
                stringChar = char;
            } else if (char === '`') {
                inString = true;
                stringChar = '`';
            }
        } else if (inString) {
            if (char === stringChar && prevChar !== '\\') {
                // Handle escaped quotes
                let escapeCount = 0;
                let j = i - 1;
                while (j >= 0 && code[j] === '\\') {
                    escapeCount++;
                    j--;
                }
                if (escapeCount % 2 === 0) {
                    inString = false;
                    stringChar = '';
                }
            } else if (stringChar === '`' && char === '$' && nextChar === '{') {
                // Template literal interpolation
                braceDepth++;
            }
        } else if (inRegex) {
            if (char === '/' && prevChar !== '\\') {
                // Check for regex flags
                let flags = '';
                let j = i + 1;
                while (j < code.length && /[gimyus]/.test(code[j])) {
                    flags += code[j];
                    j++;
                }
                // End of regex if next char is not a flag
                if (!/[gimyus]/.test(nextChar) || j > i + 1) {
                    inRegex = false;
                }
            }
        }

        // Track regex start (after operator that could precede regex)
        if (!inString && !inRegex && char === '/' &&
            (prevChar === '' || /[=!<>?:&|,;({[+\-*/%]/.test(prevChar))) {
            inRegex = true;
        }

        // Track braces for template literals
        if (inString && stringChar === '`') {
            if (char === '{') braceDepth++;
            if (char === '}') braceDepth--;
        }
    }

    return inString || inRegex || braceDepth > 0;
}

// Find all occurrences of a pattern while avoiding literals and comments
function findOccurrences(content, pattern, callback) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
        // Check if this match is in a comment or literal
        if (!isInComment(content, match.index) && !isInLiteral(content, match.index)) {
            callback(match, match.index);
        }
    }
}

// Simple version for finding patterns (without comment/literal filtering)
function findOccurrencesSimple(content, pattern, callback) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
        callback(match, match.index);
    }
}

// ===================== PARSING =====================
function parseHTML(content, basePath) {
    const results = {
        scripts: [],
        styles: [],
        modules: [],
        inlineConfigs: []
    };

    // Find ALL script tags with a more robust regex
    // This handles attributes in any order
    const scriptTagRegex = /<script([^>]*)>([^<]*)<\/script>|<script([^>]*)\/>/gi;
    let match;

    while ((match = scriptTagRegex.exec(content)) !== null) {
        const attrs = match[1] || match[3] || '';
        const inlineContent = match[2] || '';

        // Extract src attribute
        const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
        const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);

        const src = srcMatch ? srcMatch[1] : null;
        const type = typeMatch ? typeMatch[1] : null;

        if (src) {
            if (ProjectMapperUtils.isExternalUrl(src)) {
                // Skip external CDN scripts completely
                continue;
            }
            const resolved = ProjectMapperUtils.resolvePath(basePath, src);
            if (type === 'module') {
                results.modules.push(resolved);
            } else {
                results.scripts.push(resolved);
            }
        } else if (inlineContent.trim()) {
            // Check for interesting inline configs (like require.config)
            if (inlineContent.includes('require.config') ||
                inlineContent.includes('import ') ||
                inlineContent.includes('paths:')) {
                results.inlineConfigs.push({
                    type: type || 'inline',
                    preview: inlineContent.trim().substring(0, 100) + '...'
                });

                // Parse import statements from inline module scripts
                if (type === 'module' && inlineContent.includes('import ')) {
                    const importRegex = /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g;
                    let importMatch;
                    while ((importMatch = importRegex.exec(inlineContent)) !== null) {
                        const importPath = importMatch[1];
                        if (importPath.startsWith('.') || importPath.startsWith('/')) {
                            const resolved = ProjectMapperUtils.resolvePath(basePath, importPath);
                            if (!results.modules.includes(resolved)) {
                                results.modules.push(resolved);
                            }
                        } else {
                            // Package import
                            const pkgRef = 'pkg:' + importPath;
                            if (!results.modules.includes(pkgRef)) {
                                results.modules.push(pkgRef);
                            }
                        }
                    }
                }
            }
        }
    }

    // Find link tags (CSS) - handle attributes in any order
    const linkRegex = /<link([^>]*)>/gi;
    while ((match = linkRegex.exec(content)) !== null) {
        const attrs = match[1];
        const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
        const relMatch = attrs.match(/rel\s*=\s*["']([^"']+)["']/i);

        if (hrefMatch && relMatch && relMatch[1].toLowerCase() === 'stylesheet') {
            const href = hrefMatch[1];
            if (ProjectMapperUtils.isExternalUrl(href)) {
                // Skip external CDN stylesheets completely
                continue;
            }
            results.styles.push(ProjectMapperUtils.resolvePath(basePath, href));
        }
    }

    return results;
}

function parseJS(content, basePath) {
    const results = {
        functions: [], // Now array of { name, body }
        imports: [],
        exports: [],
        calls: []
    };

    // Find function declarations with their bodies
    const reserved = ['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'new', 'typeof', 'delete', 'void', 'throw', 'class', 'extends', 'super', 'this', 'import', 'export', 'default', 'from', 'as', 'try', 'finally'];
    const seenNames = new Set();

    // Find function declarations - use multiple simpler patterns
    const functionPatterns = [
        // function name(
        /function\s+(\w+)\s*\(/g,
        // const/let/var name = function
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function/g,
        // const/let/var name = (args) =>
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
        // async function name(
        /async\s+function\s+(\w+)\s*\(/g,
        // name = function
        /(\w+)\s*=\s*(?:async\s*)?function/g,
        // name = (args) =>
        /(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g
    ];

    for (const pattern of functionPatterns) {
        let funcMatch;
        while ((funcMatch = pattern.exec(content)) !== null) {
            const funcName = funcMatch[1];
            if (!funcName || reserved.includes(funcName) || seenNames.has(funcName)) continue;

            // Extra validation - check context before the match
            const beforeContext = content.substring(Math.max(0, funcMatch.index - 20), funcMatch.index);
            if (beforeContext.includes('.') && !beforeContext.trim().endsWith('=')) continue;

            seenNames.add(funcName);

            // For arrow functions and function expressions, try to find the body
            let funcBody = '';
            const afterFuncMatch = content.substring(funcMatch.index);
            const braceStart = afterFuncMatch.indexOf('{');

            if (braceStart !== -1) {
                let braceCount = 0;
                let inString = false;
                let stringChar = '';
                let inRegex = false;
                let bodyEnd = braceStart;

                for (let i = braceStart; i < Math.min(afterFuncMatch.length, braceStart + 5000); i++) {
                    const char = afterFuncMatch[i];
                    const prevChar = i > 0 ? afterFuncMatch[i - 1] : '';

                    // Handle strings and regex
                    if (!inRegex && !inString) {
                        if (char === '"' || char === "'" || char === '`') {
                            inString = true;
                            stringChar = char;
                        } else if (char === '/' && /[=!<>?:&|,;({[+*\-%]/.test(prevChar)) {
                            inRegex = true;
                        }
                    } else if (inString) {
                        if (char === stringChar && prevChar !== '\\') {
                            let escapeCount = 0;
                            let j = i - 1;
                            while (j >= 0 && afterFuncMatch[j] === '\\') {
                                escapeCount++;
                                j--;
                            }
                            if (escapeCount % 2 === 0) {
                                inString = false;
                                stringChar = '';
                            }
                        }
                    } else if (inRegex) {
                        if (char === '/' && prevChar !== '\\') {
                            inRegex = false;
                        }
                    }

                    // Count braces only when not in strings or regex
                    if (!inString && !inRegex) {
                        if (char === '{') {
                            braceCount++;
                        } else if (char === '}') {
                            braceCount--;
                            if (braceCount === 0) {
                                bodyEnd = i + 1;
                                break;
                            }
                        }
                    }
                }

                funcBody = afterFuncMatch.substring(braceStart, bodyEnd);
            }

            results.functions.push({ name: funcName, body: funcBody });
        }
    }

    // Find ES module imports - multiple patterns
    // import x from './path'
    // import { x } from './path'
    // import * as x from './path'
    // import './path'
    findOccurrencesSimple(content, /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g, (match) => {
        const importPath = match[1];
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
            // Relative import - resolve path
            let resolved = ProjectMapperUtils.resolvePath(basePath, importPath);
            // Add .js extension if missing
            if (!resolved.endsWith('.js') && !resolved.endsWith('.mjs')) {
                resolved += '.js';
            }
            results.imports.push(resolved);
        } else {
            // Package or external import - mark as package
            results.imports.push('pkg:' + importPath);
        }
    });

    // Find dynamic imports: import('./path')
    findOccurrencesSimple(content, /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match) => {
        const importPath = match[1];
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
            let resolved = ProjectMapperUtils.resolvePath(basePath, importPath);
            if (!resolved.endsWith('.js') && !resolved.endsWith('.mjs')) {
                resolved += '.js';
            }
            if (!results.imports.includes(resolved)) {
                results.imports.push(resolved);
            }
        } else {
            // Package import
            const pkgRef = 'pkg:' + importPath;
            if (!results.imports.includes(pkgRef)) {
                results.imports.push(pkgRef);
            }
        }
    });

    // Find require calls
    findOccurrencesSimple(content, /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match) => {
        const requirePath = match[1];
        if (requirePath.startsWith('.') || requirePath.startsWith('/')) {
            results.imports.push(ProjectMapperUtils.resolvePath(basePath, requirePath));
        } else {
            results.imports.push('npm:' + requirePath);
        }
    });

    // Find exports (to understand module interface)
    findOccurrencesSimple(content, /export\s+(?:default\s+)?(?:function|class|const|let|var)?\s*(\w+)/g, (match) => {
        if (match[1] && !results.exports.includes(match[1])) {
            results.exports.push(match[1]);
        }
    });

    return results;
}

function findFunctionCalls(content, knownFunctions) {
    const calls = [];

    // Find all potential function calls with a simple pattern
    findOccurrences(content, /\b(\w+)\s*\(/g, (match, index) => {
        const funcName = match[1];

        // Only consider functions we know about
        if (!knownFunctions.has(funcName)) return;

        // Additional check: make sure this isn't a function definition
        const beforeCall = content.substring(Math.max(0, index - 50), index).trim();

        // Skip if this looks like a function definition
        if (beforeCall.endsWith('function') ||
            beforeCall.match(/\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:function)?$/)) {
            return;
        }

        // Skip if it's part of a property access like obj.method(
        if (beforeCall.endsWith('.')) {
            return;
        }

        if (!calls.includes(funcName)) {
            calls.push(funcName);
        }
    });

    return calls;
}

// Export parsers
window.ProjectMapperParsers = {
    parseHTML,
    parseJS,
    findFunctionCalls
};