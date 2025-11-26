// ============================================================================
// CORE - Shared Application State and Configuration
// ============================================================================

export const AUDIO_MODES = {
    GPU: 'gpu',
    WORKLET: 'worklet',
    NONE: 'none'
};

// LocalStorage management
const STORAGE_KEY = 'sleditor_settings';

export function loadSettings() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.warn('Failed to load settings from localStorage:', e);
        return {};
    }
}

export function saveSettings(settings) {
    try {
        const current = loadSettings();
        const merged = { ...current, ...settings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
        console.warn('Failed to save settings to localStorage:', e);
    }
}

export const CONFIG = {
    audioBlockDuration: 0.1,
    channels: 2,
    volume: 0.5,
    screenSize: 512,
    computeThreads: 64,
    computeBufferSize: 65536,  // 64 KB (was 2 MB) - for data sharing between passes
};

// These will be set after AudioContext is created
export const DERIVED = {
    sampleRate: 0,              // Read from AudioContext
    samplesPerBlock: 0,         // Calculated from actual sample rate
    audioBufferSize: 0,         // Calculated from samplesPerBlock
    audioWorkgroups: 0,         // Ceil(samplesPerBlock / computeThreads)
};

export const UNIFORM_STRUCT = {
    time: 0,
    audioCurrentTime: 1,
    audioPlayTime: 2,
    audioFractTime: 3,
    audioFrame: 4,
    SIZE: 5,
};

// Application State
export const state = {
    // Backend selection (independent systems)
    graphicsBackend: null,  // 'webgpu' | 'webgl' | null
    audioBackend: null,     // 'webgpu' | 'worklet' | null
    
    // Capability detection
    hasWebGPU: false,
    hasWebGL: false,
    
    // WebGPU state
    gpuDevice: null,
    
    // WebGL state (future)
    glContext: null,
    glProgram: null, // Legacy field (main program) - kept for compatibility
    glUniforms: null, // Legacy field
    glFramebuffer: null,
    webglPasses: [],
    
    // Audio state
    audioContext: null,
    gainNode: null,
    audioMode: AUDIO_MODES.NONE,  // Keep for compatibility
    audioWorkletNode: null,
    
    // Canvas elements (separate for WebGPU and WebGL)
    canvasWebGPU: null,
    canvasWebGL: null,
    canvasWidth: 512,
    canvasHeight: 512,
    pixelScale: 1,  // 1=high, 2=medium, 4=low resolution
    renderMode: 0,  // 0=pixelated, 1=smooth
    gpuContext: null,
    bindGroupLayout: null,
    graphicsPipeline: null,
    audioPipeline: null,
    uniformBuffer: null,
    computeBuffer: null,
    phaseStateBuffer: null,
    audioBufferGPU: null,
    audioBuffersReadback: [null, null],
    uniformBuilder: null,  // Shared UniformBuilder instance for uniform controls
    
    // Canvas resizing
    isResizing: false,
    resizeStartX: 0,
    resizeStartY: 0,
    resizeStartWidth: 0,
    resizeStartHeight: 0,
    
    lastFrameTime: 0,
    visualFrame: 0,        // Visual frame counter (increments every render)
    audioFrame: 0,         // Audio frame counter (increments when audio generated)
    nextAudioTime: 0,
    startTime: 0,          // When animation started (for time offset)
    pausedTime: 0,         // Total time spent paused
    lastPauseTime: 0,      // When we last paused
    lastVirtualTime: 0,    // Last time value sent to shaders
    isRecording: false,
    recordingFrame: 0,
    recordingBaseTime: 0,
    recordingFps: 60,
    recordingTime: 0,
    
    // FPS tracking
    fps: 0,
    fpsFrameCount: 0,
    fpsLastTime: 0,
    
    // Theme
    isDarkMode: false,
    
    // Editor settings
    isVimMode: false,
    vimStatusNodes: [],  // Store vim mode handlers for each editor
    jsExecutionMode: 'function',  // 'function' (new Function) or 'module' (dynamic import)
    
    readbackIndex: 0,
    pendingAudio: false,
    isRunning: false,      // System initialized and ready
    isPlaying: true,       // Currently playing (default true)
    isRecompiling: false,  // Temporarily pause rendering during shader recompilation
    currentCompileToken: 0,
    mediaStartUnlocked: false, // Media playback unlock (audio/video need user gesture)

    // Monaco editors
    boilerplateEditor: null,
    graphicsEditor: null,
    audioEditor: null,
    jsEditor: null,
    
    // Active tabs and current example
    activeTabs: ['glsl_fragment'],  // Default to GLSL fragment shader
    currentTab: 'glsl_fragment',
    currentExample: 'glsl_hello',
    currentAudioType: null,  // 'gpu' or 'worklet' - tracks which audio tab is active
    tabCodeCache: {},        // Code per tab for editors sharing Monaco instances
    
    // Save/Load tracking
    isDirty: false,  // Track unsaved changes
    isInitializing: true,  // Prevent dirty marking during initial load
    currentDatabaseShader: null,  // Currently loaded database shader (Supabase)
    isAnonymousGolfURL: false,  // Flag for read-only golf URLs (from #g:)
    
    // Authentication
    currentUser: null,  // Supabase user object when signed in
    
    userState: null,
    userInit: null,
    userEnterframe: null,
    mouseX: 0.5,
    mouseY: 0.5,
    mouseHoverX: 0,
    mouseHoverY: 0,
    mouseDragX: 0,
    mouseDragY: 0,
    mouseLastDownX: 0,
    mouseLastDownY: 0,
    mouseClickX: 0,
    mouseClickY: 0,
    mouseClickPhase: 'idle', // 'idle' | 'pressed' | 'held' | 'released'
    mouseIsDown: false,
    activePointerId: null,
};

if (typeof window !== 'undefined') {
    window.appState = state;
}

if (typeof window !== 'undefined') {
    window.appState = state;
}

// Update DERIVED values based on audio context
export function updateDerived(audioContext) {
    DERIVED.sampleRate = audioContext.sampleRate;
    DERIVED.samplesPerBlock = Math.floor(CONFIG.audioBlockDuration * DERIVED.sampleRate);
    DERIVED.audioBufferSize = DERIVED.samplesPerBlock * CONFIG.channels * 4; // Float32 = 4 bytes
    DERIVED.audioWorkgroups = Math.ceil(DERIVED.samplesPerBlock / CONFIG.computeThreads);
}

// Status logging helper
export function logStatus(message, type = 'info') {
    const errorDisplay = document.getElementById('errorDisplay');
    if (!errorDisplay) return;
    
    errorDisplay.textContent = message;
    errorDisplay.className = type;  // 'info', 'error', or 'success'
}

