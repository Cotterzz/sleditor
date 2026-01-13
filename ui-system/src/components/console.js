/**
 * Console Component for SLUI
 * 
 * A simple, traditional console panel that displays log messages.
 * Minimal design - looks like a real terminal/console.
 */

// Type colors only - no icons, no backgrounds
const TYPE_CONFIG = {
    info:    { color: 'var(--console-info, #58a6ff)' },
    warn:    { color: 'var(--console-warn, #d29922)' },
    error:   { color: 'var(--console-error, #f85149)' },
    debug:   { color: 'var(--console-debug, #6e7681)' },
    success: { color: 'var(--console-success, #3fb950)' },
    system:  { color: 'var(--console-system, #a371f7)' }
};

/**
 * Format timestamp - compact HH:MM:SS.mmm
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

/**
 * Create a single log entry - simple single-line format
 * Format: [HH:MM:SS.mmm] [ORIGIN:SUB] message text
 */
function createLogEntry(message, options = {}) {
    const { showTimestamp = true } = options;
    const config = TYPE_CONFIG[message.type] || TYPE_CONFIG.info;
    
    const entry = document.createElement('div');
    entry.className = `slui-console-entry slui-console-${message.type}`;
    entry.dataset.id = message.id;
    entry.dataset.type = message.type;
    entry.dataset.origin = message.origin;
    
    // Single line, no wrap, horizontal scroll if needed
    entry.style.cssText = `
        font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.5;
        padding: 1px 8px;
        white-space: pre;
        color: var(--console-text, #c9d1d9);
    `;
    
    // Build the line as text
    let line = '';
    
    // Timestamp
    if (showTimestamp) {
        line += `[${formatTime(message.timestamp)}] `;
    }
    
    // Origin:SubOrigin in color
    const originText = `[${message.origin}:${message.subOrigin}]`;
    
    // Count suffix
    const countText = message.count > 1 ? ` (×${message.count})` : '';
    
    // Create as innerHTML for color support
    entry.innerHTML = `<span style="color: var(--console-time, #6e7681);">${showTimestamp ? `[${formatTime(message.timestamp)}] ` : ''}</span><span style="color: ${config.color};">${originText}</span> ${escapeHtml(message.text)}${countText ? `<span style="color: var(--console-time, #6e7681);">${countText}</span>` : ''}`;
    
    return entry;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Create the Console component
 */
export function Console(options = {}) {
    const {
        container,
        logger = null,
        maxHeight = '100%',
        showFilters = true,
        showTimestamp = true,
        showToolbar = true,
        autoScroll = true
    } = options;
    
    // State
    let activeFilters = new Set(['info', 'warn', 'error', 'debug', 'success', 'system']);
    let searchQuery = '';
    let isAutoScroll = autoScroll;
    let unsubscribe = null;
    
    // Create main container
    const wrapper = document.createElement('div');
    wrapper.className = 'slui-console';
    wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: ${maxHeight};
        background: var(--console-bg, #0d1117);
        border-radius: 6px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    `;
    
    // Toolbar - minimal, no title (window has title)
    let toolbar = null;
    if (showToolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'slui-console-toolbar';
        toolbar.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            background: var(--console-toolbar-bg, #161b22);
            border-bottom: 1px solid var(--console-border, rgba(255,255,255,0.1));
            flex-shrink: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        // Filter dropdown (simpler than buttons)
        if (showFilters) {
            const filterSelect = document.createElement('select');
            filterSelect.className = 'slui-console-filter-select';
            filterSelect.style.cssText = `
                padding: 2px 6px;
                border: 1px solid var(--console-border, rgba(255,255,255,0.2));
                border-radius: 3px;
                background: var(--console-input-bg, #0d1117);
                color: var(--console-text, #c9d1d9);
                font-size: 11px;
                font-family: inherit;
                cursor: pointer;
            `;
            
            filterSelect.innerHTML = `
                <option value="all">All</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="debug">Debug</option>
                <option value="success">Success</option>
                <option value="system">System</option>
            `;
            
            filterSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'all') {
                    activeFilters = new Set(['info', 'warn', 'error', 'debug', 'success', 'system']);
                } else {
                    activeFilters = new Set([val]);
                }
                renderMessages();
            });
            
            toolbar.appendChild(filterSelect);
        }
        
        // Search input
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'Filter...';
        search.className = 'slui-console-search';
        search.style.cssText = `
            padding: 4px 8px;
            border: 1px solid var(--console-border, rgba(255,255,255,0.1));
            border-radius: 4px;
            background: var(--console-input-bg, #0d1117);
            color: var(--console-text, #c9d1d9);
            font-size: 11px;
            width: 120px;
            outline: none;
        `;
        search.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderMessages();
        });
        toolbar.appendChild(search);
        
        // Clear button - text only
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.title = 'Clear console';
        clearBtn.style.cssText = `
            padding: 2px 8px;
            border: 1px solid var(--console-border, rgba(255,255,255,0.2));
            border-radius: 3px;
            background: transparent;
            color: var(--console-text, #c9d1d9);
            cursor: pointer;
            font-size: 10px;
            font-family: inherit;
            opacity: 0.7;
            transition: opacity 0.15s ease;
        `;
        clearBtn.addEventListener('mouseenter', () => clearBtn.style.opacity = '1');
        clearBtn.addEventListener('mouseleave', () => clearBtn.style.opacity = '0.7');
        clearBtn.addEventListener('click', () => {
            if (logger) logger.clear();
            renderMessages();
        });
        toolbar.appendChild(clearBtn);
        
        wrapper.appendChild(toolbar);
    }
    
    // Log entries container - horizontal scroll for long lines
    const entries = document.createElement('div');
    entries.className = 'slui-console-entries';
    entries.style.cssText = `
        flex: 1;
        overflow: auto;
        background: var(--console-bg, #0d1117);
    `;
    
    wrapper.appendChild(entries);
    
    // Status bar - minimal
    const statusBar = document.createElement('div');
    statusBar.className = 'slui-console-status';
    statusBar.style.cssText = `
        padding: 2px 8px;
        background: var(--console-toolbar-bg, #161b22);
        border-top: 1px solid var(--console-border, rgba(255,255,255,0.1));
        font-size: 10px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        color: var(--console-time, #6e7681);
        flex-shrink: 0;
    `;
    statusBar.textContent = '0 lines';
    wrapper.appendChild(statusBar);
    
    /**
     * Render all messages with current filters
     */
    function renderMessages() {
        entries.innerHTML = '';
        
        if (!logger) {
            const empty = document.createElement('div');
            empty.style.cssText = `
                padding: 20px;
                text-align: center;
                color: var(--console-time, #6e7681);
                font-size: 12px;
            `;
            empty.textContent = 'No logger connected';
            entries.appendChild(empty);
            return;
        }
        
        const messages = logger.getMessages();
        let visibleCount = 0;
        
        messages.forEach(msg => {
            // Type filter
            if (!activeFilters.has(msg.type)) return;
            
            // Search filter
            if (searchQuery) {
                const searchTarget = `${msg.origin} ${msg.subOrigin} ${msg.text}`.toLowerCase();
                if (!searchTarget.includes(searchQuery)) return;
            }
            
            entries.appendChild(createLogEntry(msg, { showTimestamp }));
            visibleCount++;
        });
        
        // Update status
        const totalCount = messages.length;
        statusBar.textContent = visibleCount === totalCount 
            ? `${totalCount} lines`
            : `${visibleCount}/${totalCount} lines`;
        
        if (isAutoScroll) {
            scrollToBottom();
        }
    }
    
    /**
     * Scroll to bottom
     */
    function scrollToBottom() {
        requestAnimationFrame(() => {
            entries.scrollTop = entries.scrollHeight;
        });
    }
    
    /**
     * Handle logger updates
     */
    function handleLoggerUpdate(action, message, allMessages) {
        if (action === 'clear') {
            entries.innerHTML = '';
            statusBar.textContent = '0 messages';
            return;
        }
        
        if (action === 'add') {
            // Check if passes filters
            if (!activeFilters.has(message.type)) return;
            if (searchQuery) {
                const searchTarget = `${message.origin} ${message.subOrigin} ${message.text}`.toLowerCase();
                if (!searchTarget.includes(searchQuery)) return;
            }
            
            entries.appendChild(createLogEntry(message, { showTimestamp }));
            
            // Update status
            const visibleCount = entries.children.length;
            const totalCount = allMessages.length;
            statusBar.textContent = visibleCount === totalCount 
                ? `${totalCount} lines`
                : `${visibleCount}/${totalCount} lines`;
            
            if (isAutoScroll) {
                scrollToBottom();
            }
        }
        
        if (action === 'update') {
            // Find and update the existing entry
            const existing = entries.querySelector(`[data-id="${message.id}"]`);
            if (existing) {
                const newEntry = createLogEntry(message, { showTimestamp });
                existing.replaceWith(newEntry);
            }
        }
    }
    
    // Subscribe to logger if provided
    if (logger) {
        unsubscribe = logger.subscribe(handleLoggerUpdate);
        renderMessages(); // Initial render
    }
    
    // Append to container if provided
    if (container) {
        container.appendChild(wrapper);
    }
    
    // Public API
    return {
        element: wrapper,
        
        scrollToBottom,
        
        setFilter(type, enabled = true) {
            if (enabled) {
                activeFilters.add(type);
            } else {
                activeFilters.delete(type);
            }
            renderMessages();
        },
        
        setFilters(types) {
            activeFilters = new Set(types);
            renderMessages();
        },
        
        search(query) {
            searchQuery = query.toLowerCase();
            renderMessages();
        },
        
        clear() {
            if (logger) logger.clear();
            renderMessages();
        },
        
        refresh() {
            renderMessages();
        },
        
        setLogger(newLogger) {
            if (unsubscribe) unsubscribe();
            if (newLogger) {
                unsubscribe = newLogger.subscribe(handleLoggerUpdate);
            }
            renderMessages();
        },
        
        destroy() {
            if (unsubscribe) unsubscribe();
            wrapper.remove();
        }
    };
}

export default Console;
