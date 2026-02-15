/**
 * Media Selectors - Texture, Video, Audio selection for unified editor
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { getSLUI } from '../index.js';

// Media catalog cache
let mediaCatalog = null;

// Refresh callback (set by unified-editor)
let refreshCallback = null;

export function setRefreshCallback(callback) {
    refreshCallback = callback;
}

function refreshTabs() {
    if (refreshCallback) refreshCallback();
}

/**
 * Load the media catalog (lazy load)
 */
export async function loadCatalog() {
    if (mediaCatalog) return mediaCatalog;
    
    try {
        const response = await fetch('media/catalog.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        mediaCatalog = await response.json();
        return mediaCatalog;
    } catch (err) {
        logger.warn('Media', 'Catalog', 'Failed to load: ' + err.message);
        return { images: [], audio: [], videos: [] };
    }
}

// ============================================================================
// MEDIA CONTENT ROUTER
// ============================================================================

/**
 * Create content for a media tab
 */
export function createMediaContent(element) {
    switch (element.type) {
        case 'texture':
            return createTextureSelector(element);
        case 'video':
            return createVideoSelector(element);
        case 'audio':
            return createAudioSelector(element);
        case 'cubemap':
        case 'volume':
            return createMediaPlaceholder(element);
        default:
            return createMediaPlaceholder(element);
    }
}

/**
 * Create placeholder for media types not yet implemented
 */
function createMediaPlaceholder(element) {
    const container = document.createElement('div');
    container.className = 'v2-media-content';
    container.dataset.elementId = element.id;
    
    const header = document.createElement('div');
    header.className = 'v2-media-header';
    header.innerHTML = `
        <span class="v2-media-icon">${element.icon}</span>
        <span class="v2-media-label">${element.label}</span>
        <span class="v2-media-channel">iChannel${element.channel}</span>
    `;
    container.appendChild(header);
    
    const placeholder = document.createElement('div');
    placeholder.className = 'v2-media-selector';
    placeholder.innerHTML = `
        <div class="v2-selector-placeholder">
            <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.3;">${element.icon}</div>
            <div style="font-size: 14px; margin-bottom: 8px;">No ${element.type} Selected</div>
            <div style="font-size: 12px; opacity: 0.7;">${element.type} selection coming soon</div>
        </div>
    `;
    container.appendChild(placeholder);
    
    return container;
}

// ============================================================================
// TEXTURE SELECTOR
// ============================================================================

function emitTextureOptionsChanged(element) {
    if (!element.selectedTexture && !element.source) {
        logger.debug('Media', 'Options', 'No texture selected, options saved for next load');
        return;
    }
    
    logger.debug('Media', 'Options', `Options changed for ${element.id}: ${JSON.stringify(element.textureOptions)}`);
    events.emit(EVENTS.MEDIA_OPTIONS_CHANGED, {
        elementId: element.id,
        channel: element.channel,
        options: element.textureOptions
    });
}

function createTextureSelector(element) {
    const SLUI = getSLUI();
    
    const container = document.createElement('div');
    container.className = 'v2-media-content v2-texture-selector';
    container.dataset.elementId = element.id;
    
    // Preview section
    const previewSection = document.createElement('div');
    previewSection.className = 'v2-texture-preview-section';
    
    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'v2-texture-thumbnail';
    if (element.source) {
        thumbnail.innerHTML = `<img src="${element.source}" alt="${element.label}">`;
    } else {
        thumbnail.textContent = '🖼️';
    }
    previewSection.appendChild(thumbnail);
    
    // Info column
    const infoColumn = document.createElement('div');
    infoColumn.className = 'v2-texture-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'v2-texture-name';
    nameDiv.innerHTML = `
        <span>${element.source ? element.label : 'No texture selected'}</span>
        <span class="v2-texture-channel-badge">iChannel${element.channel}</span>
    `;
    infoColumn.appendChild(nameDiv);
    
    // Filter settings header
    const filterHeader = document.createElement('div');
    filterHeader.className = 'v2-filter-header';
    filterHeader.innerHTML = `<span>Default Settings</span>`;
    infoColumn.appendChild(filterHeader);
    
    // Initialize texture options
    if (!element.textureOptions) {
        element.textureOptions = { vflip: true, anisotropic: false, wrap: 'repeat', filter: 'mipmap' };
    }
    
    // Filter options
    const filterOptions = document.createElement('div');
    filterOptions.className = 'v2-filter-options';
    
    // V-Flip & Anisotropic row
    const checkRow = document.createElement('div');
    checkRow.className = 'v2-filter-row';
    
    const vflipLabel = document.createElement('label');
    vflipLabel.className = 'v2-checkbox-label';
    const vflipCheck = document.createElement('input');
    vflipCheck.type = 'checkbox';
    vflipCheck.checked = element.textureOptions.vflip;
    vflipCheck.addEventListener('change', () => {
        element.textureOptions.vflip = vflipCheck.checked;
        emitTextureOptionsChanged(element);
    });
    vflipLabel.appendChild(vflipCheck);
    vflipLabel.appendChild(document.createTextNode(' V-Flip'));
    checkRow.appendChild(vflipLabel);
    
    const anisoLabel = document.createElement('label');
    anisoLabel.className = 'v2-checkbox-label';
    const anisoCheck = document.createElement('input');
    anisoCheck.type = 'checkbox';
    anisoCheck.checked = element.textureOptions.anisotropic;
    anisoCheck.addEventListener('change', () => {
        element.textureOptions.anisotropic = anisoCheck.checked;
        emitTextureOptionsChanged(element);
    });
    anisoLabel.appendChild(anisoCheck);
    anisoLabel.appendChild(document.createTextNode(' Anisotropic'));
    checkRow.appendChild(anisoLabel);
    
    filterOptions.appendChild(checkRow);
    
    // Wrap & Filter row
    const selectRow = document.createElement('div');
    selectRow.className = 'v2-filter-row';
    
    const wrapLabel = document.createElement('label');
    wrapLabel.textContent = 'Wrap:';
    const wrapSelect = document.createElement('select');
    wrapSelect.className = 'sl-select sl-select-compact';
    wrapSelect.innerHTML = `
        <option value="repeat">Repeat</option>
        <option value="clamp">Clamp</option>
        <option value="mirror">Mirror</option>
    `;
    wrapSelect.value = element.textureOptions.wrap;
    wrapSelect.addEventListener('change', () => {
        element.textureOptions.wrap = wrapSelect.value;
        emitTextureOptionsChanged(element);
    });
    selectRow.appendChild(wrapLabel);
    selectRow.appendChild(wrapSelect);
    
    const filterLabel = document.createElement('label');
    filterLabel.textContent = 'Filter:';
    const filterSelect = document.createElement('select');
    filterSelect.className = 'sl-select sl-select-compact';
    filterSelect.innerHTML = `
        <option value="nearest">Nearest</option>
        <option value="linear">Linear</option>
        <option value="mipmap">Mipmap</option>
    `;
    filterSelect.value = element.textureOptions.filter;
    filterSelect.addEventListener('change', () => {
        element.textureOptions.filter = filterSelect.value;
        emitTextureOptionsChanged(element);
    });
    selectRow.appendChild(filterLabel);
    selectRow.appendChild(filterSelect);
    
    filterOptions.appendChild(selectRow);
    infoColumn.appendChild(filterOptions);
    previewSection.appendChild(infoColumn);
    container.appendChild(previewSection);
    
    // Tabs for Catalog and Custom Import
    const tabsContainer = SLUI && SLUI.Tabs ? SLUI.Tabs({
        tabs: [
            { id: 'catalog', label: 'Gallery', content: () => createTextureCatalogTab(element) },
            { id: 'custom', label: 'Custom Import', content: () => createTextureImportTab(element) }
        ],
        variant: 'underline',
        activeTab: 'catalog'
    }) : createTextureCatalogTab(element);
    
    tabsContainer.className = 'v2-media-tabs-container';
    container.appendChild(tabsContainer);
    
    return container;
}

function createTextureCatalogTab(element) {
    const catalogContent = document.createElement('div');
    catalogContent.className = 'v2-catalog-content';
    
    const gallerySection = document.createElement('div');
    gallerySection.className = 'v2-texture-gallery';
    gallerySection.innerHTML = '<div class="v2-gallery-loading">Loading textures...</div>';
    catalogContent.appendChild(gallerySection);
    
    loadCatalog().then(catalog => {
        const images = catalog.images || [];
        gallerySection.innerHTML = '';
        
        if (images.length === 0) {
            gallerySection.innerHTML = '<div class="v2-gallery-empty"><div style="font-size:32px;margin-bottom:8px;">🖼️</div><div>No textures found</div></div>';
            return;
        }
        
        const grid = document.createElement('div');
        grid.className = 'v2-texture-grid';
        
        images.forEach(img => {
            const card = createTextureCard(img, element);
            grid.appendChild(card);
        });
        
        gallerySection.appendChild(grid);
    });
    
    return catalogContent;
}

function createTextureCard(texture, element) {
    const card = document.createElement('div');
    card.className = 'v2-texture-card';
    
    const imgPath = texture.thumb || texture.path;
    const fullPath = imgPath.startsWith('/') ? '..' + imgPath : '../' + imgPath;
    card.innerHTML = `<img src="${fullPath}" alt="${texture.name}"><div class="v2-texture-card-name">${texture.name}</div>`;
    
    card.addEventListener('click', () => {
        const texturePath = texture.path.startsWith('/') ? '..' + texture.path : '../' + texture.path;
        
        element.source = texturePath;
        element.selectedTexture = texture;
        // Don't overwrite element.label - keep it as "Tex A", etc. for consistency
        // The texture name is stored in element.selectedTexture.name if needed
        
        if (!element.textureOptions) {
            element.textureOptions = { vflip: true, anisotropic: false, wrap: 'repeat', filter: 'mipmap' };
        }
        
        events.emit(EVENTS.MEDIA_SELECTED, {
            elementId: element.id,
            texture,
            type: 'texture',
            channel: element.channel,
            options: element.textureOptions
        });
        
        refreshTabs();
    });
    
    return card;
}

function createTextureImportTab(element) {
    const SLUI = getSLUI();
    const customContent = document.createElement('div');
    customContent.className = 'v2-import-content';
    
    const urlSection = document.createElement('div');
    urlSection.className = 'v2-url-import-section';
    
    const urlRow1 = document.createElement('div');
    urlRow1.className = 'v2-url-row';
    
    const urlHeader = document.createElement('div');
    urlHeader.className = 'v2-url-header';
    urlHeader.textContent = 'Import from URL';
    urlRow1.appendChild(urlHeader);
    
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    urlRow1.appendChild(spacer);
    
    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'sl-select sl-select-compact';
    sourceSelect.innerHTML = '<option value="any">Any URL</option><option value="github">GitHub</option><option value="cloudinary">Cloudinary</option>';
    urlRow1.appendChild(sourceSelect);
    
    const loadBtn = SLUI && SLUI.Button ? SLUI.Button({ label: 'Load', variant: 'default', size: 'small' }) : document.createElement('button');
    if (!SLUI) { loadBtn.textContent = 'Load'; loadBtn.className = 'sl-button'; }
    urlRow1.appendChild(loadBtn);
    
    urlSection.appendChild(urlRow1);
    
    const urlRow2 = document.createElement('div');
    urlRow2.className = 'v2-url-input-row';
    
    const urlPrefix = document.createElement('span');
    urlPrefix.className = 'v2-url-prefix';
    urlPrefix.textContent = '';
    urlRow2.appendChild(urlPrefix);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'v2-url-input';
    urlInput.placeholder = 'https://example.com/image.jpg';
    urlRow2.appendChild(urlInput);
    
    urlSection.appendChild(urlRow2);
    
    sourceSelect.addEventListener('change', () => {
        switch (sourceSelect.value) {
            case 'github': urlPrefix.textContent = 'https://raw.githubusercontent.com/'; urlInput.placeholder = 'user/repo/main/path.jpg'; break;
            case 'cloudinary': urlPrefix.textContent = 'https://res.cloudinary.com/'; urlInput.placeholder = 'cloud/image/upload/path.jpg'; break;
            default: urlPrefix.textContent = ''; urlInput.placeholder = 'https://example.com/image.jpg';
        }
    });
    
    loadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        
        const fullUrl = urlPrefix.textContent + url;
        element.source = fullUrl;
        
        if (!element.textureOptions) {
            element.textureOptions = { vflip: true, anisotropic: false, wrap: 'repeat', filter: 'mipmap' };
        }
        
        events.emit(EVENTS.MEDIA_URL_IMPORT, { elementId: element.id, url: fullUrl, channel: element.channel, options: element.textureOptions });
        refreshTabs();
    });
    
    customContent.appendChild(urlSection);
    return customContent;
}

// ============================================================================
// VIDEO SELECTOR
// ============================================================================

function createVideoSelector(element) {
    const SLUI = getSLUI();
    
    const container = document.createElement('div');
    container.className = 'v2-media-content v2-video-selector';
    container.dataset.elementId = element.id;
    
    // Preview section
    const previewSection = document.createElement('div');
    previewSection.className = 'v2-video-preview-section';
    
    const previewContainer = document.createElement('div');
    previewContainer.className = 'v2-video-preview';
    if (element.source) {
        const video = document.createElement('video');
        video.src = element.source;
        video.muted = true;
        video.loop = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
        previewContainer.appendChild(video);
        previewContainer.addEventListener('mouseenter', () => video.play());
        previewContainer.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    } else {
        previewContainer.innerHTML = '<div class="v2-video-empty">🎬</div>';
    }
    previewSection.appendChild(previewContainer);
    
    const infoColumn = document.createElement('div');
    infoColumn.className = 'v2-video-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'v2-video-name';
    nameDiv.innerHTML = `<span>${element.selectedVideo?.name || 'No video selected'}</span><span class="v2-video-channel-badge">iChannel${element.channel}</span>`;
    infoColumn.appendChild(nameDiv);
    
    const settingsHeader = document.createElement('div');
    settingsHeader.className = 'v2-filter-header';
    settingsHeader.innerHTML = '<span>Video Settings</span>';
    infoColumn.appendChild(settingsHeader);
    
    if (!element.videoOptions) {
        element.videoOptions = { loop: true, vflip: true };
    }
    
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'v2-filter-options';
    
    const loopRow = document.createElement('div');
    loopRow.className = 'v2-filter-row';
    
    const loopLabel = document.createElement('label');
    loopLabel.className = 'v2-checkbox-label';
    const loopCheck = document.createElement('input');
    loopCheck.type = 'checkbox';
    loopCheck.checked = element.videoOptions.loop;
    loopCheck.addEventListener('change', () => {
        element.videoOptions.loop = loopCheck.checked;
        events.emit(EVENTS.VIDEO_LOOP_CHANGED, { elementId: element.id, channel: element.channel, loop: loopCheck.checked });
    });
    loopLabel.appendChild(loopCheck);
    loopLabel.appendChild(document.createTextNode(' Loop'));
    loopRow.appendChild(loopLabel);
    
    const vflipLabel = document.createElement('label');
    vflipLabel.className = 'v2-checkbox-label';
    const vflipCheck = document.createElement('input');
    vflipCheck.type = 'checkbox';
    vflipCheck.checked = element.videoOptions.vflip;
    vflipCheck.addEventListener('change', () => {
        element.videoOptions.vflip = vflipCheck.checked;
        if (element.source) {
            events.emit(EVENTS.VIDEO_SELECTED, { elementId: element.id, video: element.selectedVideo, url: element.source, channel: element.channel, options: element.videoOptions });
        }
    });
    vflipLabel.appendChild(vflipCheck);
    vflipLabel.appendChild(document.createTextNode(' V-Flip'));
    loopRow.appendChild(vflipLabel);
    
    settingsDiv.appendChild(loopRow);
    infoColumn.appendChild(settingsDiv);
    previewSection.appendChild(infoColumn);
    container.appendChild(previewSection);
    
    const tabsContainer = SLUI && SLUI.Tabs ? SLUI.Tabs({
        tabs: [
            { id: 'catalog', label: 'Catalog', content: () => createVideoCatalogTab(element) },
            { id: 'custom', label: 'Custom Import', content: () => createVideoImportTab(element) }
        ],
        variant: 'underline',
        activeTab: 'catalog'
    }) : createVideoCatalogTab(element);
    
    tabsContainer.className = 'v2-media-tabs-container';
    container.appendChild(tabsContainer);
    
    return container;
}

function createVideoCatalogTab(element) {
    const catalogContent = document.createElement('div');
    catalogContent.className = 'v2-catalog-content';
    
    const gallerySection = document.createElement('div');
    gallerySection.className = 'v2-video-gallery';
    gallerySection.innerHTML = '<div class="v2-gallery-loading">Loading videos...</div>';
    catalogContent.appendChild(gallerySection);
    
    loadCatalog().then(catalog => {
        const videos = catalog.videos || [];
        gallerySection.innerHTML = '';
        
        if (videos.length === 0) {
            gallerySection.innerHTML = '<div class="v2-gallery-empty"><div style="font-size:32px;margin-bottom:8px;">🎬</div><div>No videos found</div></div>';
            return;
        }
        
        const grid = document.createElement('div');
        grid.className = 'v2-video-grid';
        
        videos.forEach(video => grid.appendChild(createVideoCard(video, element)));
        gallerySection.appendChild(grid);
    });
    
    return catalogContent;
}

function createVideoCard(video, element) {
    const card = document.createElement('div');
    card.className = 'v2-video-card';
    
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'v2-video-thumb';
    const imgPath = video.thumb || video.path;
    const img = document.createElement('img');
    img.src = imgPath.startsWith('/') ? '..' + imgPath : '../' + imgPath;
    img.alt = video.name;
    img.onerror = () => { thumbContainer.innerHTML = '<div class="v2-video-card-fallback">🎬</div>'; };
    thumbContainer.appendChild(img);
    
    if (video.duration) {
        const duration = document.createElement('span');
        duration.className = 'v2-video-duration';
        const mins = Math.floor(video.duration / 60);
        const secs = Math.floor(video.duration % 60);
        duration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        thumbContainer.appendChild(duration);
    }
    card.appendChild(thumbContainer);
    
    const name = document.createElement('div');
    name.className = 'v2-video-card-name';
    name.textContent = video.name;
    card.appendChild(name);
    
    card.addEventListener('click', () => {
        const videoPath = video.path.startsWith('/') ? '..' + video.path : '../' + video.path;
        element.source = videoPath;
        element.selectedVideo = video;
        if (!element.videoOptions) element.videoOptions = { loop: true, vflip: true };
        
        events.emit(EVENTS.VIDEO_SELECTED, { elementId: element.id, video, url: videoPath, channel: element.channel, options: element.videoOptions });
        refreshTabs();
    });
    
    return card;
}

function createVideoImportTab(element) {
    const SLUI = getSLUI();
    const customContent = document.createElement('div');
    customContent.className = 'v2-import-content';
    
    const urlSection = document.createElement('div');
    urlSection.className = 'v2-url-import-section';
    
    const urlRow1 = document.createElement('div');
    urlRow1.className = 'v2-url-row';
    urlRow1.innerHTML = '<div class="v2-url-header">Import from URL</div><div style="flex:1"></div>';
    
    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'sl-select sl-select-compact';
    sourceSelect.innerHTML = '<option value="github">GitHub</option><option value="cloudinary">Cloudinary</option>';
    urlRow1.appendChild(sourceSelect);
    
    const loadBtn = SLUI && SLUI.Button ? SLUI.Button({ label: 'Load', variant: 'default', size: 'small' }) : document.createElement('button');
    if (!SLUI) { loadBtn.textContent = 'Load'; }
    urlRow1.appendChild(loadBtn);
    urlSection.appendChild(urlRow1);
    
    const urlRow2 = document.createElement('div');
    urlRow2.className = 'v2-url-input-row';
    
    const urlPrefix = document.createElement('span');
    urlPrefix.className = 'v2-url-prefix';
    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
    urlRow2.appendChild(urlPrefix);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'v2-url-input';
    urlInput.placeholder = 'user/repo/main/path/to/video.mp4';
    urlRow2.appendChild(urlInput);
    urlSection.appendChild(urlRow2);
    
    sourceSelect.addEventListener('change', () => {
        urlPrefix.textContent = sourceSelect.value === 'cloudinary' ? 'https://res.cloudinary.com/' : 'https://raw.githubusercontent.com/';
        urlInput.placeholder = sourceSelect.value === 'cloudinary' ? 'cloud/video/upload/path.mp4' : 'user/repo/main/path.mp4';
    });
    
    loadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        const fullUrl = urlPrefix.textContent + url;
        element.source = fullUrl;
        if (!element.videoOptions) element.videoOptions = { loop: true, vflip: true };
        events.emit(EVENTS.VIDEO_URL_IMPORT, { elementId: element.id, url: fullUrl, channel: element.channel, options: element.videoOptions });
        refreshTabs();
    });
    
    customContent.appendChild(urlSection);
    return customContent;
}

// ============================================================================
// AUDIO SELECTOR
// ============================================================================

const AUDIO_MODES = {
    shadertoy: { name: 'Shadertoy (512)', desc: 'Standard compatibility' },
    standard: { name: 'Standard (1024)', desc: 'Full FFT resolution' },
    high: { name: 'High (2048)', desc: 'Higher resolution' },
    ultra: { name: 'Ultra (4096)', desc: 'Maximum detail' },
    chromagram: { name: 'Chromagram (12×12)', desc: 'Musical note detection' },
    chromagram_hq: { name: 'Chromagram HQ', desc: 'High-res notes' }
};

function createAudioSelector(element) {
    const SLUI = getSLUI();
    
    const container = document.createElement('div');
    container.className = 'v2-media-content v2-audio-selector';
    container.dataset.elementId = element.id;
    
    // Preview section
    const previewSection = document.createElement('div');
    previewSection.className = 'v2-audio-preview-section';
    
    const visualContainer = document.createElement('div');
    visualContainer.className = 'v2-audio-preview';
    visualContainer.innerHTML = element.source ? '<canvas class="v2-audio-visualizer" width="150" height="80"></canvas>' : '<div class="v2-audio-empty">🎵</div>';
    previewSection.appendChild(visualContainer);
    
    const infoColumn = document.createElement('div');
    infoColumn.className = 'v2-audio-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'v2-audio-name';
    nameDiv.innerHTML = `<span>${element.selectedAudio?.name || 'No audio selected'}</span><span class="v2-audio-channel-badge">iChannel${element.channel}</span>`;
    infoColumn.appendChild(nameDiv);
    
    if (!element.audioOptions) element.audioOptions = { mode: 'shadertoy', loop: true };
    
    const settingsHeader = document.createElement('div');
    settingsHeader.className = 'v2-filter-header';
    settingsHeader.innerHTML = '<span>Audio Settings</span>';
    infoColumn.appendChild(settingsHeader);
    
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'v2-filter-options';
    
    // Mode row
    const modeRow = document.createElement('div');
    modeRow.className = 'v2-filter-row';
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Quality:';
    modeLabel.style.marginRight = '8px';
    const modeSelect = document.createElement('select');
    modeSelect.className = 'sl-select sl-select-compact';
    Object.entries(AUDIO_MODES).forEach(([key, mode]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = mode.name;
        opt.title = mode.desc;
        opt.selected = element.audioOptions.mode === key;
        modeSelect.appendChild(opt);
    });
    modeSelect.addEventListener('change', () => {
        element.audioOptions.mode = modeSelect.value;
        if (element.source) events.emit(EVENTS.AUDIO_MODE_CHANGED, { elementId: element.id, channel: element.channel, mode: modeSelect.value });
    });
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSelect);
    settingsDiv.appendChild(modeRow);
    
    // Loop row
    const loopRow = document.createElement('div');
    loopRow.className = 'v2-filter-row';
    const loopLabel = document.createElement('label');
    loopLabel.className = 'v2-checkbox-label';
    const loopCheck = document.createElement('input');
    loopCheck.type = 'checkbox';
    loopCheck.checked = element.audioOptions.loop;
    loopCheck.addEventListener('change', () => {
        element.audioOptions.loop = loopCheck.checked;
        events.emit(EVENTS.AUDIO_LOOP_CHANGED, { elementId: element.id, channel: element.channel, loop: loopCheck.checked });
    });
    loopLabel.appendChild(loopCheck);
    loopLabel.appendChild(document.createTextNode(' Loop'));
    loopRow.appendChild(loopLabel);
    settingsDiv.appendChild(loopRow);
    
    infoColumn.appendChild(settingsDiv);
    previewSection.appendChild(infoColumn);
    container.appendChild(previewSection);
    
    const tabsContainer = SLUI && SLUI.Tabs ? SLUI.Tabs({
        tabs: [
            { id: 'catalog', label: 'Catalog', content: () => createAudioCatalogTab(element) },
            { id: 'custom', label: 'Custom Import', content: () => createAudioImportTab(element) }
        ],
        variant: 'underline',
        activeTab: 'catalog'
    }) : createAudioCatalogTab(element);
    
    tabsContainer.className = 'v2-media-tabs-container';
    container.appendChild(tabsContainer);
    
    return container;
}

function createAudioCatalogTab(element) {
    const catalogContent = document.createElement('div');
    catalogContent.className = 'v2-catalog-content';
    
    const gallerySection = document.createElement('div');
    gallerySection.className = 'v2-audio-gallery';
    gallerySection.innerHTML = '<div class="v2-gallery-loading">Loading audio...</div>';
    catalogContent.appendChild(gallerySection);
    
    loadCatalog().then(catalog => {
        const audios = catalog.audio || [];
        gallerySection.innerHTML = '';
        
        if (audios.length === 0) {
            gallerySection.innerHTML = '<div class="v2-gallery-empty"><div style="font-size:32px;margin-bottom:8px;">🎵</div><div>No audio files found</div></div>';
            return;
        }
        
        const grid = document.createElement('div');
        grid.className = 'v2-audio-grid';
        audios.forEach(audio => grid.appendChild(createAudioCard(audio, element)));
        gallerySection.appendChild(grid);
    });
    
    return catalogContent;
}

function createAudioCard(audio, element) {
    const card = document.createElement('div');
    card.className = 'v2-audio-card';
    
    card.innerHTML = `<div class="v2-audio-icon">🎵</div><div class="v2-audio-card-name">${audio.name}</div>`;
    
    if (audio.duration) {
        const duration = document.createElement('div');
        duration.className = 'v2-audio-duration';
        const mins = Math.floor(audio.duration / 60);
        const secs = Math.floor(audio.duration % 60);
        duration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        card.appendChild(duration);
    }
    
    card.addEventListener('click', () => {
        const audioPath = audio.path.startsWith('/') ? '..' + audio.path : '../' + audio.path;
        element.source = audioPath;
        element.selectedAudio = audio;
        if (!element.audioOptions) element.audioOptions = { mode: 'shadertoy', loop: true };
        
        events.emit(EVENTS.AUDIO_SELECTED, { elementId: element.id, audio, url: audioPath, channel: element.channel, options: element.audioOptions });
        refreshTabs();
    });
    
    return card;
}

function createAudioImportTab(element) {
    const SLUI = getSLUI();
    const customContent = document.createElement('div');
    customContent.className = 'v2-import-content';
    
    const urlSection = document.createElement('div');
    urlSection.className = 'v2-url-import-section';
    
    const urlRow1 = document.createElement('div');
    urlRow1.className = 'v2-url-row';
    urlRow1.innerHTML = '<div class="v2-url-header">Import from URL</div><div style="flex:1"></div>';
    
    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'sl-select sl-select-compact';
    sourceSelect.innerHTML = '<option value="github">GitHub</option><option value="cloudinary">Cloudinary</option>';
    urlRow1.appendChild(sourceSelect);
    
    const loadBtn = SLUI && SLUI.Button ? SLUI.Button({ label: 'Load', variant: 'default', size: 'small' }) : document.createElement('button');
    if (!SLUI) loadBtn.textContent = 'Load';
    urlRow1.appendChild(loadBtn);
    urlSection.appendChild(urlRow1);
    
    const urlRow2 = document.createElement('div');
    urlRow2.className = 'v2-url-input-row';
    
    const urlPrefix = document.createElement('span');
    urlPrefix.className = 'v2-url-prefix';
    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
    urlRow2.appendChild(urlPrefix);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'v2-url-input';
    urlInput.placeholder = 'user/repo/main/path/audio.mp3';
    urlRow2.appendChild(urlInput);
    urlSection.appendChild(urlRow2);
    
    sourceSelect.addEventListener('change', () => {
        urlPrefix.textContent = sourceSelect.value === 'cloudinary' ? 'https://res.cloudinary.com/' : 'https://raw.githubusercontent.com/';
    });
    
    loadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        const fullUrl = urlPrefix.textContent + url;
        element.source = fullUrl;
        if (!element.audioOptions) element.audioOptions = { mode: 'shadertoy', loop: true };
        events.emit(EVENTS.AUDIO_URL_IMPORT, { elementId: element.id, url: fullUrl, channel: element.channel, options: element.audioOptions });
        refreshTabs();
    });
    
    customContent.appendChild(urlSection);
    return customContent;
}
