/**
 * Theme Editor Panel Registration
 * 
 * Registers the Theme Editor component as a SLUI panel.
 * Provides live theme editing and export capabilities.
 */

import { logger } from '../../core/logger.js';
import { CONFIG } from '../../core/config.js';

/**
 * Register the theme editor panel with SLUI
 * @param {object} SLUI - The SLUI instance
 */
export function registerThemeEditorPanel(SLUI) {
    // Import the component dynamically to avoid circular deps
    import(CONFIG.SLUI_PATH.replace('src/index.js', 'src/components/theme-editor.js')).then(({ ThemeEditor }) => {
        
        SLUI.registerPanel({
            id: 'theme-editor',
            icon: '🎨',
            title: 'Theme Editor',
            showInToolbar: true,
            defaultWidth: 380,
            defaultHeight: 600,
            createContent: () => {
                const container = document.createElement('div');
                container.style.cssText = 'height: 100%; position: relative; overflow: hidden;';
                
                // Create the Theme Editor component
                const editor = ThemeEditor({ container });
                
                // Store reference for potential cleanup
                container._themeEditor = editor;
                
                return container;
            },
            onWindowClosed: (container) => {
                // Cleanup if needed
                if (container._themeEditor) {
                    container._themeEditor.destroy();
                }
            }
        });
        
        logger.debug('UI', 'ThemeEditor', 'Theme editor panel registered');
        
    }).catch(err => {
        console.error('Failed to load ThemeEditor component:', err);
    });
}

export default { registerThemeEditorPanel };
