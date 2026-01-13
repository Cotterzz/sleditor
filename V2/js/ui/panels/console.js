/**
 * Console Panel Registration
 * 
 * Wires the V2 logger to the SLUI Console component.
 * This is sleditor-specific panel configuration.
 */

import { CONFIG } from '../../core/config.js';

/**
 * Register the console panel with SLUI
 * @param {object} SLUI - The SLUI instance
 * @param {object} logger - The V2 logger instance
 */
export function registerConsolePanel(SLUI, logger) {
    SLUI.registerPanel({
        id: 'console',
        icon: `<img src="${CONFIG.SLUI_ICONS}console32.png" srcset="${CONFIG.SLUI_ICONS}console64.png 2x" width="24" height="24" alt="Console">`,
        title: 'Console',
        showInToolbar: true,
        createContent: () => {
            const container = document.createElement('div');
            container.style.cssText = 'height: 100%; display: flex; flex-direction: column;';
            
            // Create SLUI Console component connected to our logger
            SLUI.Console({
                container,
                logger: logger,
                showFilters: true,
                showTimestamp: true,
                showToolbar: true,
                autoScroll: true
            });
            
            return container;
        }
    });
    
    logger.debug('UI', 'Console', 'Console panel registered');
}

export default { registerConsolePanel };
