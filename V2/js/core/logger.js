/**
 * V2 Logger - Core messaging/logging system
 * 
 * Initialized FIRST before any other module.
 * Intercepts browser console, stores messages with IDs for updates,
 * supports different message types and origin/sub-origin tracking.
 * 
 * Usage:
 *   import { logger, LOG_TYPE } from './core/logger.js';
 *   
 *   logger.info('Sleditor', 'Init', 'Starting application...');
 *   logger.warn('Browser', 'Deprecation', 'Feature X is deprecated');
 *   logger.error('Compiler', 'GLSL', 'Syntax error on line 42');
 *   
 *   // Updatable messages (for progress)
 *   const msgId = logger.info('Loader', 'Assets', 'Loading... 0%');
 *   logger.update(msgId, 'Loading... 50%');
 *   logger.update(msgId, 'Loading... 100% ✓');
 */

// Message types
export const LOG_TYPE = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    DEBUG: 'debug',
    SUCCESS: 'success',
    SYSTEM: 'system'
};

// Message structure
class LogMessage {
    constructor(type, origin, subOrigin, text, id = null) {
        this.id = id || crypto.randomUUID();
        this.type = type;
        this.origin = origin;         // e.g., 'Browser', 'Sleditor', 'Compiler'
        this.subOrigin = subOrigin;   // e.g., 'Error', 'Warning', 'Editor', 'GLSL'
        this.text = text;
        this.timestamp = Date.now();
        this.count = 1;               // For duplicate collapsing
    }
}

class Logger {
    #messages = [];
    #listeners = new Set();
    #originalConsole = {};
    #maxMessages = 1000;
    #interceptingConsole = false;
    
    constructor() {
        // Store original console methods before anything else
        this.#originalConsole = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: console.debug.bind(console)
        };
    }
    
    /**
     * Initialize logger and start intercepting browser console
     */
    init() {
        if (this.#interceptingConsole) return;
        
        this.#interceptingConsole = true;
        this.#interceptConsole();
        
        // Log our own initialization
        this.system('Logger', 'Init', 'Logger initialized');
        
        return this;
    }
    
    /**
     * Intercept browser console methods
     */
    #interceptConsole() {
        const self = this;
        
        console.log = (...args) => {
            self.#originalConsole.log(...args);
            self.#captureConsole(LOG_TYPE.INFO, 'Log', args);
        };
        
        console.info = (...args) => {
            self.#originalConsole.info(...args);
            self.#captureConsole(LOG_TYPE.INFO, 'Info', args);
        };
        
        console.warn = (...args) => {
            self.#originalConsole.warn(...args);
            self.#captureConsole(LOG_TYPE.WARN, 'Warning', args);
        };
        
        console.error = (...args) => {
            self.#originalConsole.error(...args);
            self.#captureConsole(LOG_TYPE.ERROR, 'Error', args);
        };
        
        console.debug = (...args) => {
            self.#originalConsole.debug(...args);
            self.#captureConsole(LOG_TYPE.DEBUG, 'Debug', args);
        };
        
        // Capture unhandled errors
        window.addEventListener('error', (event) => {
            self.error('Browser', 'Uncaught', `${event.message} at ${event.filename}:${event.lineno}`);
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason instanceof Error 
                ? event.reason.message 
                : String(event.reason);
            self.error('Browser', 'Promise', `Unhandled rejection: ${reason}`);
        });
    }
    
    /**
     * Convert console arguments to a string
     */
    #captureConsole(type, subOrigin, args) {
        const text = args.map(arg => {
            if (typeof arg === 'string') return arg;
            if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }).join(' ');
        
        this.#addMessage(new LogMessage(type, 'Browser', subOrigin, text));
    }
    
    /**
     * Add a message and notify listeners
     */
    #addMessage(message) {
        // Check for duplicate (same origin, subOrigin, text within last 5 messages)
        const recentIndex = this.#messages.slice(-5).findIndex(m => 
            m.origin === message.origin && 
            m.subOrigin === message.subOrigin && 
            m.text === message.text
        );
        
        if (recentIndex !== -1) {
            const actualIndex = this.#messages.length - 5 + recentIndex;
            this.#messages[actualIndex].count++;
            this.#messages[actualIndex].timestamp = message.timestamp;
            this.#notifyListeners('update', this.#messages[actualIndex]);
            return this.#messages[actualIndex].id;
        }
        
        this.#messages.push(message);
        
        // Trim if exceeds max
        if (this.#messages.length > this.#maxMessages) {
            this.#messages.shift();
        }
        
        this.#notifyListeners('add', message);
        return message.id;
    }
    
    /**
     * Notify all listeners of a change
     */
    #notifyListeners(action, message) {
        for (const listener of this.#listeners) {
            try {
                listener(action, message, this.#messages);
            } catch (e) {
                this.#originalConsole.error('Logger listener error:', e);
            }
        }
    }
    
    // ========== Public API ==========
    
    /**
     * Log an info message
     * @returns {string} Message ID for updates
     */
    info(origin, subOrigin, text) {
        return this.#addMessage(new LogMessage(LOG_TYPE.INFO, origin, subOrigin, text));
    }
    
    /**
     * Log a warning message
     * @returns {string} Message ID for updates
     */
    warn(origin, subOrigin, text) {
        return this.#addMessage(new LogMessage(LOG_TYPE.WARN, origin, subOrigin, text));
    }
    
    /**
     * Log an error message
     * @returns {string} Message ID for updates
     */
    error(origin, subOrigin, text) {
        return this.#addMessage(new LogMessage(LOG_TYPE.ERROR, origin, subOrigin, text));
    }
    
    /**
     * Log a debug message
     * @returns {string} Message ID for updates
     */
    debug(origin, subOrigin, text) {
        return this.#addMessage(new LogMessage(LOG_TYPE.DEBUG, origin, subOrigin, text));
    }
    
    /**
     * Log a success message
     * @returns {string} Message ID for updates
     */
    success(origin, subOrigin, text) {
        return this.#addMessage(new LogMessage(LOG_TYPE.SUCCESS, origin, subOrigin, text));
    }
    
    /**
     * Log a system message (for internal/meta messages)
     * @returns {string} Message ID for updates
     */
    system(origin, subOrigin, text) {
        return this.#addMessage(new LogMessage(LOG_TYPE.SYSTEM, origin, subOrigin, text));
    }
    
    /**
     * Update an existing message by ID
     * Useful for progress indicators: "Loading... 50%"
     */
    update(id, newText) {
        const message = this.#messages.find(m => m.id === id);
        if (message) {
            message.text = newText;
            message.timestamp = Date.now();
            this.#notifyListeners('update', message);
            return true;
        }
        return false;
    }
    
    /**
     * Subscribe to message changes
     * @param {Function} listener - (action, message, allMessages) => void
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    
    /**
     * Get all messages
     */
    getMessages() {
        return [...this.#messages];
    }
    
    /**
     * Get messages filtered by type
     */
    getMessagesByType(type) {
        return this.#messages.filter(m => m.type === type);
    }
    
    /**
     * Get messages filtered by origin
     */
    getMessagesByOrigin(origin) {
        return this.#messages.filter(m => m.origin === origin);
    }
    
    /**
     * Clear all messages
     */
    clear() {
        this.#messages = [];
        this.#notifyListeners('clear', null);
    }
    
    /**
     * Get the original console (for bypassing interception)
     */
    get console() {
        return this.#originalConsole;
    }
}

// Singleton instance - created immediately
export const logger = new Logger();

// Auto-initialize when this module is imported
logger.init();

export default logger;
