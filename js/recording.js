import { state } from './core.js';

const RECORDING_FPS = 60;
const RECORDING_BITRATE = 8_000_000;
const DEFAULT_MUXER_PROFILE = '540p';

const MUXER_PROFILES = {
    '540p': {
        key: '540p',
        label: 'mp4-muxer 540p',
        codec: 'avc1.42E01E', // Baseline profile, Level 3.0 (≤414,720px)
        maxPixels: 414_720,
        bitrate: 5_000_000,
        fps: RECORDING_FPS
    },
    '1080p': {
        key: '1080p',
        label: 'mp4-muxer 1080p',
        codec: 'avc1.640028', // High profile, Level 4.0 (≤2,097,152px)
        maxPixels: 2_097_152,
        bitrate: 12_000_000,
        fps: RECORDING_FPS
    }
};

function getElapsedSeconds() {
    return (performance.now() - state.startTime - state.pausedTime) * 0.001;
}

function resetRecordingTimeState(forceTime) {
    const baseline = Number.isFinite(forceTime) ? forceTime : getElapsedSeconds();
    state.recordingFrame = 0;
    state.recordingBaseTime = 0;
    state.recordingFps = RECORDING_FPS;
    state.recordingTime = baseline;
    state.lastVirtualTime = baseline;
}

function prepareRecordingTimeOverride(fps) {
    const baseline = getElapsedSeconds();
    state.recordingBaseTime = baseline;
    state.recordingFrame = 0;
    state.recordingFps = fps;
    state.recordingTime = baseline;
    state.lastVirtualTime = baseline;
}

function finalizeRecordingTimeOverride() {
    resetRecordingTimeState();
}

const METHOD_CONFIG = {
    none: {
        label: 'None',
        supported: false
    },
    muxer: {
        label: 'mp4-muxer',
        supported: true,
        createRecorder: (canvas, options = {}) =>
            new Mp4MuxerRecorder(canvas, {
                fps: options.fps ?? RECORDING_FPS,
                bitrate: options.bitrate ?? RECORDING_BITRATE,
                codec: options.codec
            })
    },
    ffmpeg: {
        label: 'FFmpeg (WASM)',
        supported: false,
        message: 'FFmpeg path coming soon (heavy module ~30MB)'
    },
    mp4box: {
        label: 'MP4Box.js',
        supported: false,
        message: 'MP4Box path coming soon'
    }
};

let recordingSelect;
let recordingStatus;
let recordingButton;
let muxerProfileSelect;
let currentMethod = 'none';
let currentMuxerProfile = DEFAULT_MUXER_PROFILE;
let muxerSupportCheckToken = 0;
let isRecording = false;
let framesCaptured = 0;
let activeRecorder = null;

function getSelectedMuxerProfile() {
    return MUXER_PROFILES[currentMuxerProfile] ?? MUXER_PROFILES[DEFAULT_MUXER_PROFILE];
}

function isMuxerMethod() {
    return currentMethod === 'muxer';
}

function updateMuxerControlsVisibility() {
    if (!muxerProfileSelect) return;
    muxerProfileSelect.style.display = isMuxerMethod() ? 'block' : 'none';
}

function handleMuxerProfileChange() {
    if (!muxerProfileSelect) return;
    const nextProfile = muxerProfileSelect.value || DEFAULT_MUXER_PROFILE;
    if (nextProfile === currentMuxerProfile && isMuxerMethod()) {
        // Force re-check if profile is unchanged but user triggered change event.
        evaluateMuxerAvailability();
        return;
    }
    currentMuxerProfile = nextProfile;
    if (isMuxerMethod()) {
        evaluateMuxerAvailability();
    }
}

function validateMuxerResolution(profile, canvas) {
    if (!canvas) {
        return { ok: false, message: 'Canvas not ready' };
    }
    const pixelCount = canvas.width * canvas.height;
    if (pixelCount === 0) {
        return { ok: false, message: 'Canvas not ready' };
    }
    if (pixelCount > profile.maxPixels) {
        return { ok: false, message: 'Resolution not supported' };
    }
    return { ok: true };
}

function getCurrentMethodLabel(config, profileOverride) {
    if (profileOverride?.label) {
        return profileOverride.label;
    }
    if (isMuxerMethod()) {
        return getSelectedMuxerProfile().label;
    }
    return config?.label || 'Recorder';
}

async function evaluateMuxerAvailability() {
    if (!isMuxerMethod()) return;

    const profile = getSelectedMuxerProfile();
    const canvas = state.canvasWebGL;
    const validation = validateMuxerResolution(profile, canvas);
    if (!validation.ok) {
        setRecordingText(validation.message);
        setDevStatus(validation.message);
        updateUI(false);
        return;
    }

    if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') {
        const msg = 'Codec not supported';
        setRecordingText(msg);
        setDevStatus(msg);
        updateUI(false);
        return;
    }

    const token = ++muxerSupportCheckToken;
    const checkingMessage = 'Checking codec…';
    setRecordingText(checkingMessage);
    setDevStatus('');
    updateUI(false);

    try {
        const config = {
            codec: profile.codec,
            width: canvas.width,
            height: canvas.height,
            bitrate: profile.bitrate ?? RECORDING_BITRATE,
            framerate: profile.fps ?? RECORDING_FPS
        };
        const support = await VideoEncoder.isConfigSupported(config);
        if (token !== muxerSupportCheckToken || !isMuxerMethod()) {
            return;
        }
        if (!support?.supported) {
            const msg = 'Codec not supported';
            setRecordingText(msg);
            setDevStatus(msg);
            updateUI(false);
            return;
        }
        setRecordingText(`${profile.label} ready`);
        setDevStatus('');
        updateUI(true);
    } catch (err) {
        if (token !== muxerSupportCheckToken || !isMuxerMethod()) {
            return;
        }
        console.warn('VideoEncoder support check failed', err);
        const msg = 'Codec not supported';
        setRecordingText(msg);
        setDevStatus(msg);
        updateUI(false);
    }
}

export function initUI() {
    recordingSelect = document.getElementById('recordingMethod');
    recordingStatus = document.getElementById('recordingStatus');
    recordingButton = document.getElementById('recordingButton');
    muxerProfileSelect = document.getElementById('muxerProfileSelect');

    if (!recordingSelect || !recordingStatus || !recordingButton) {
        return;
    }

    recordingSelect.addEventListener('change', handleMethodChange);
    if (muxerProfileSelect) {
        muxerProfileSelect.value = currentMuxerProfile;
        muxerProfileSelect.addEventListener('change', handleMuxerProfileChange);
    }
    recordingButton.addEventListener('click', toggleRecording);
    updateMuxerControlsVisibility();
    updateUI();
    setRecordingText('Recording disabled');
}

function handleMethodChange() {
    const method = recordingSelect.value;
    if (method === currentMethod) {
        return;
    }

    const wasRecording = isRecording;
    if (wasRecording) {
        isRecording = false;
        state.isRecording = false;
    }
    stopRecordingInternal({ finalizeTime: wasRecording });
    activeRecorder = null;
    currentMethod = method;
    if (method === 'muxer') {
        muxerSupportCheckToken++;
    }
    updateMuxerControlsVisibility();

    if (method === 'none') {
        setRecordingText('Recording disabled');
        setDevStatus('');
        updateUI();
        return;
    }

    const config = METHOD_CONFIG[method];
    if (!config?.supported) {
        const msg = 'Coming soon';
        setRecordingText(msg);
        setDevStatus(msg);
        updateUI(false);
        return;
    }

    if (method === 'muxer') {
        evaluateMuxerAvailability();
        return;
    }

    setRecordingText(`${config.label} ready`);
    setDevStatus('');
    updateUI(true);
}

function updateUI(isReady = false) {
    recordingButton.disabled = !(isReady && METHOD_CONFIG[currentMethod]?.supported);
    recordingButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
}

function setRecordingText(text) {
    if (recordingStatus) {
        recordingStatus.textContent = text;
    }
}

function setDevStatus(message) {
    const bar = document.getElementById('errorDisplay');
    if (!bar) return;
    if (message) {
        bar.dataset.recordingStatus = 'true';
        bar.textContent = message;
    } else if (bar.dataset.recordingStatus) {
        bar.textContent = '';
        delete bar.dataset.recordingStatus;
    }
}

async function toggleRecording() {
    if (isRecording) {
        await stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    if (isRecording) return;
    const canvas = state.canvasWebGL;
    if (!canvas) {
        const msg = 'Canvas not ready';
        setRecordingText(msg);
        setDevStatus(msg);
        return;
    }
    const config = METHOD_CONFIG[currentMethod];
    if (!config?.supported || !config.createRecorder) {
        const msg = 'Recorder not available';
        setRecordingText(msg);
        setDevStatus(msg);
        return;
    }

    let profile = null;
    if (currentMethod === 'muxer') {
        profile = getSelectedMuxerProfile();
        const validation = validateMuxerResolution(profile, canvas);
        if (!validation.ok) {
            setRecordingText(validation.message);
            setDevStatus(validation.message);
            return;
        }
    }
    const fps = profile?.fps ?? RECORDING_FPS;

    try {
        const methodLabel = getCurrentMethodLabel(config, profile);
        setRecordingText(`Starting ${methodLabel}…`);
        setDevStatus('');
        recordingButton.disabled = true;
        activeRecorder = config.createRecorder(canvas, {
            fps,
            bitrate: profile?.bitrate ?? RECORDING_BITRATE,
            codec: profile?.codec
        });
        await activeRecorder.start();
        prepareRecordingTimeOverride(fps);
        isRecording = true;
        framesCaptured = 0;
        state.isRecording = true;
        recordingButton.disabled = false;
        recordingButton.textContent = 'Stop Recording';
        const startMessage = 'Recording… 0 frames';
        setRecordingText(startMessage);
    } catch (err) {
        console.error('Failed to start recording', err);
        const msg = err?.name === 'NotSupportedError'
            ? 'Codec not supported'
            : err.message || 'Failed to start recording';
        setRecordingText(msg);
        setDevStatus(msg);
        recordingButton.disabled = false;
        activeRecorder = null;
    }
}

async function stopRecording() {
    if (!isRecording || !activeRecorder) return;

    const totalFrames = framesCaptured;
    const wasRecording = state.isRecording;
    isRecording = false;
    state.isRecording = false;
    setRecordingText('Processing…');
    setDevStatus('');
    recordingButton.disabled = true;

    try {
        const blob = await activeRecorder.stop();
        const filename = `shader-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
        if (blob) {
            downloadBlob(blob, filename);
            setRecordingText(`Saved recording (${totalFrames} frame${totalFrames === 1 ? '' : 's'})`);
            setDevStatus(`Saved ${totalFrames} frame${totalFrames === 1 ? '' : 's'} to ${filename}`);
        } else {
            const noData = 'Recording stopped (no data)';
            setRecordingText(noData);
            setDevStatus(noData);
        }
    } catch (err) {
        console.error('Failed to finalize recording', err);
        const failMsg = err.message || 'Failed to finalize recording';
        setRecordingText(failMsg);
        setDevStatus(failMsg);
    } finally {
        stopRecordingInternal({ finalizeTime: wasRecording });
        recordingButton.disabled = false;
        recordingButton.textContent = 'Start Recording';
    }
}

function stopRecordingInternal({ finalizeTime = false } = {}) {
    framesCaptured = 0;
    if (finalizeTime) {
        finalizeRecordingTimeOverride();
    } else {
        resetRecordingTimeState();
    }
    if (activeRecorder?.dispose) {
        activeRecorder.dispose();
    }
    activeRecorder = null;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function captureFrame(canvas) {
    if (!isRecording || !activeRecorder) return;
    try {
        activeRecorder.captureFrame(canvas);
        framesCaptured++;
        const message = `Recording… ${framesCaptured} frame${framesCaptured === 1 ? '' : 's'}`;
        setRecordingText(message);
    } catch (err) {
        console.error('Failed to capture frame', err);
        const msg = err.message || 'Failed capturing frame';
        setRecordingText(msg);
        setDevStatus(msg);
        const wasRecording = isRecording;
        isRecording = false;
        state.isRecording = false;
        stopRecordingInternal({ finalizeTime: wasRecording });
    }
}

class Mp4MuxerRecorder {
    constructor(canvas, { fps, bitrate, codec }) {
        this.canvas = canvas;
        this.width = canvas.width;
        this.height = canvas.height;
        this.fps = fps;
        this.bitrate = bitrate;
        this.codec = codec || 'avc1.42E01E';
        this.frameIndex = 0;
        this.encoder = null;
        this.muxer = null;
        this.target = null;
    }

    async start() {
        if (typeof VideoEncoder === 'undefined') {
            throw new Error('WebCodecs VideoEncoder is not supported in this browser.');
        }
        const module = await Mp4MuxerRecorder.loadModule();
        const { Muxer, ArrayBufferTarget } = module;
        this.target = new ArrayBufferTarget();
        this.muxer = new Muxer({
            target: this.target,
            video: {
                codec: 'avc',
                width: this.width,
                height: this.height
            },
            fastStart: 'in-memory'
        });
        this.encoder = new VideoEncoder({
            output: (chunk, meta) => {
                this.muxer.addVideoChunk(chunk, meta);
            },
            error: (e) => console.error('VideoEncoder error', e)
        });
        this.encoder.configure({
            codec: this.codec,
            width: this.width,
            height: this.height,
            bitrate: this.bitrate,
            framerate: this.fps
        });
    }

    captureFrame(canvas) {
        if (!this.encoder) return;
        const timestamp = Math.round((this.frameIndex / this.fps) * 1_000_000);
        const frame = new VideoFrame(canvas, { timestamp });
        this.encoder.encode(frame);
        frame.close();
        this.frameIndex++;
    }

    async stop() {
        if (!this.encoder) return null;
        await this.encoder.flush();
        this.encoder.close();
        this.encoder = null;
        this.muxer.finalize();
        const buffer = this.target.buffer;
        return new Blob([buffer], { type: 'video/mp4' });
    }

    dispose() {
        if (this.encoder) {
            this.encoder.close();
            this.encoder = null;
        }
        this.muxer = null;
        this.target = null;
    }

    static async loadModule() {
        if (!Mp4MuxerRecorder.modulePromise) {
            Mp4MuxerRecorder.modulePromise = import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.0.0/+esm');
        }
        return Mp4MuxerRecorder.modulePromise;
    }
}

Mp4MuxerRecorder.modulePromise = null;

