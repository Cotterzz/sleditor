/**
 * V2 State - Namespaced application state
 * 
 * Organized into clear sections per V2-approach.md:
 * - shader: current shader data
 * - render: playback state
 * - editor: Monaco instances and code cache
 * - auth: user authentication
 * - ui: UI preferences
 * - input: mouse/keyboard state
 * - channels: input textures/buffers
 */

export const state = {
    // Shader state
    shader: {
        id: null,
        title: 'Untitled',
        description: '',
        author: null,           // Author username
        authorId: null,         // Author user ID
        created: null,          // ISO date string
        modified: null,         // ISO date string
        views: 0,
        likes: 0,
        liked: false,           // Has current user liked this?
        license: 'default',     // Default license (matching current site)
        tags: [],               // Array of tag strings
        isDirty: false,
        isFork: false,
        parentId: null,         // If fork, original shader ID
        activeTabs: ['Image'],
        currentTab: 'Image',
        code: {                 // { tabName: code }
            Image: '',
            Common: '',
            BufferA: '',
            BufferB: '',
            BufferC: '',
            BufferD: ''
        },
    },
    
    // Render state
    render: {
        isPlaying: false,
        isPaused: false,
        frame: 0,
        time: 0,
        fps: 0,
        resolution: { width: 0, height: 0 },
    },
    
    // Editor state
    editor: {
        graphics: null,         // Monaco instance
        audio: null,
        js: null,
        common: null,
        autoCompile: false,     // Auto-compile on code change (OFF by default)
    },
    
    // Auth state
    auth: {
        user: null,
        isLoggedIn: false,
        isLoading: false,
    },
    
    // UI state (sleditor-specific, not SLUI)
    ui: {
        isInitialized: false,
        currentPanel: null,
        isFullscreen: false,
    },
    
    // Input state
    input: {
        mouse: { x: 0, y: 0, buttons: 0 },
        keyboard: {},
    },
    
    // Channels state
    channels: {
        // Will be populated by ChannelManager
    },
    
    // Init state
    init: {
        isComplete: false,
        currentStep: null,
        steps: [],
    }
};

/**
 * Reset shader state (for new/load operations)
 */
export function resetShaderState() {
    state.shader.id = null;
    state.shader.title = 'Untitled';
    state.shader.description = '';
    state.shader.author = null;
    state.shader.authorId = null;
    state.shader.created = null;
    state.shader.modified = null;
    state.shader.views = 0;
    state.shader.likes = 0;
    state.shader.liked = false;
    state.shader.license = 'default';
    state.shader.tags = [];
    state.shader.isDirty = false;
    state.shader.isFork = false;
    state.shader.parentId = null;
    state.shader.activeTabs = ['Image'];
    state.shader.currentTab = 'Image';
    state.shader.code = {
        Image: '',
        Common: '',
        BufferA: '',
        BufferB: '',
        BufferC: '',
        BufferD: ''
    };
}

/**
 * Reset render state
 */
export function resetRenderState() {
    state.render.isPlaying = false;
    state.render.isPaused = false;
    state.render.frame = 0;
    state.render.time = 0;
}

export default state;
