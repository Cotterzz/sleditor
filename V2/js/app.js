/**
 * V2 App - Main application orchestrator
 * 
 * This module coordinates initialization across all systems.
 * It's the "conductor" - it doesn't do work itself, it tells
 * other modules when to do their work.
 */

import { logger } from './core/logger.js';
import { events, EVENTS } from './core/events.js';
import { state, resetProjectState } from './core/state.js';
import { actions } from './core/actions.js';
import { CONFIG } from './core/config.js';
import * as ui from './ui/index.js';
import { shaderManager } from './managers/ShaderManager.js';
import { uniformManager } from './managers/UniformManager.js';
import { channelManager } from './managers/ChannelManager.js';

// Track initialization
const initSteps = [];
let currentStepIndex = 0;

/**
 * Register an init step
 */
function step(name, fn) {
    initSteps.push({ name, fn });
}

/**
 * Run all initialization steps
 */
async function runInit() {
    const total = initSteps.length;
    const progressId = logger.info('App', 'Init', `Starting... 0/${total}`);
    
    events.emit(EVENTS.INIT_START, { total });
    
    for (const s of initSteps) {
        currentStepIndex++;
        state.init.currentStep = s.name;
        logger.update(progressId, `Initializing ${currentStepIndex}/${total}: ${s.name}`);
        
        try {
            await s.fn();
            logger.success('App', s.name, `✓ Complete`);
        } catch (err) {
            logger.error('App', s.name, `✗ Failed: ${err.message}`);
            events.emit(EVENTS.INIT_ERROR, { step: s.name, error: err });
            throw err;
        }
        
        events.emit(EVENTS.INIT_PROGRESS, { current: currentStepIndex, total, step: s.name });
    }
    
    logger.update(progressId, `Initialized ${total}/${total} ✓`);
    state.init.isComplete = true;
    state.init.steps = initSteps.map(s => s.name);
    
    logger.success('App', 'Init', 'Ready!');
    events.emit(EVENTS.INIT_COMPLETE);
}

// ============================================================================
// INIT STEPS - Define what happens during startup
// ============================================================================

// Step 1: Ensure shader defaults (BEFORE UI so editor has content)
step('Defaults', async () => {
    shaderManager.ensureDefaults();
    channelManager.init();
    
    // Sync project state with shader code
    // This ensures the sidebar reflects what code tabs exist
    syncProjectWithShaderState();
});

/**
 * Sync project.code with state.shader.code
 * Builds project element list from existing shader code
 */
function syncProjectWithShaderState() {
    // Reset channel manager to start fresh
    channelManager.reset();
    
    // Build code elements list
    const codeElements = [
        { id: 'Image', type: 'main', label: 'Main', icon: '📄', locked: true, channel: 0 }
    ];
    
    // Add Common if it has content (Common doesn't get a channel - it's shared code)
    if (state.shader.code?.Common?.trim()) {
        codeElements.push({ id: 'Common', type: 'common', label: 'Common', icon: '📄', locked: false });
    }
    
    // Add Buffers that have content - detect dynamically from state.shader.code keys
    // Any key starting with 'Buffer' followed by a letter is a buffer
    const bufferKeys = Object.keys(state.shader.code || {})
        .filter(key => /^Buffer[A-Z]$/.test(key))
        .sort(); // Sort alphabetically: BufferA, BufferB, etc.
    
    bufferKeys.forEach(bufferId => {
        if (state.shader.code?.[bufferId]?.trim()) {
            const letter = bufferId.replace('Buffer', '');
            // Allocate channel via ChannelManager for proper tracking
            const channel = channelManager.createBufferChannel(bufferId);
            codeElements.push({
                id: bufferId,
                type: 'buffer',
                label: `Buff ${letter}`,
                icon: '📄',
                locked: false,
                channel
            });
        }
    });
    
    // Set project code via actions
    actions.setProjectCode(codeElements);
    
    // Ensure mouse input always exists
    if (!state.project.inputs.find(i => i.id === 'mouse')) {
        actions.setProjectInputs([
            { id: 'mouse', type: 'mouse', label: 'Mouse', icon: '🖱️', locked: true }
        ]);
    }
    
    // Set initial open tabs
    actions.setOpenTabs(['Image']);
    actions.setActiveTab('Image');
    
    logger.debug('App', 'Project', `Synced project: ${state.project.code.length} code, ${state.project.media.length} media, ${state.project.inputs.length} inputs`);
}

// Step 2: UI System
step('UI', async () => {
    await ui.initUI();
});

// Step 2: Register Panels
step('Panels', async () => {
    ui.registerPanels();
});

// Step 3: Restore Layout (must be AFTER panels are registered)
step('Layout', async () => {
    ui.restoreLayout();
});

// Step 4: Reactive Bindings
step('Bindings', async () => {
    ui.setupReactiveBindings();
});

// Step 5: Open Console (on desktop)
step('Console', async () => {
    await new Promise(r => setTimeout(r, 50)); // Let UI settle
    ui.openConsole();
});

// Step 6: Config validation
step('Config', async () => {
    logger.debug('App', 'Config', `Version: ${CONFIG.APP_VERSION}`);
    logger.debug('App', 'Config', `Features: WebGPU=${CONFIG.FEATURES?.WEBGPU || false}, AI=${CONFIG.FEATURES?.AI_ASSIST || false}`);
});

// Step 7: Shader Manager & Uniform Manager (connects Editor → Renderer)
step('Shader', async () => {
    // Listen for renderer ready, then initialize managers
    events.on(EVENTS.RENDERER_READY, async ({ renderer }) => {
        logger.debug('App', 'Shader', 'Renderer ready, initializing managers...');
        
        // Initialize shader manager
        shaderManager.init(renderer);
        
        // Initialize uniform manager (listens for compile success to detect uniforms)
        uniformManager.init(renderer);
        
        // Compile the shader that's already in state (set by ensureDefaults)
        // Don't load from file - state.shader.code is the single source of truth
        shaderManager.compileNow();
    });
    
    // Also set up Ctrl+S to compile
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            events.emit(EVENTS.COMPILE_REQUEST);
        }
    });
});

// Future steps:
// step('Auth', async () => { ... });
// step('Gallery', async () => { ... });

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start the application
 */
export async function start() {
    logger.info('App', 'Start', `${CONFIG.APP_NAME} V2 starting...`);
    await runInit();
}

export default { start };
