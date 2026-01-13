/**
 * Sleditor V2 - Entry Point
 * 
 * This file is intentionally minimal.
 * It only does two things:
 * 1. Import logger first (to capture all console output)
 * 2. Start the app
 * 
 * All initialization logic is in app.js
 */

// Logger MUST be imported first - it intercepts console immediately
import './core/logger.js';

// App orchestrator
import { start } from './app.js';

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
