/**
 * Media Panel - Dynamic Media Channel Tabs
 * 
 * Works like the Editor panel - each tab is a media channel instance.
 * User adds tabs via "Add Tab" dropdown (Texture, Audio, Video, Cubemap, Volume).
 * Each tab shows selection UI for that media type.
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state } from '../../core/state.js';

// SLUI reference (set during registration)
let SLUI = null;

// Media catalog cache
let mediaCatalog = null;

// Active media tabs (array of { id, type, label, icon })
let mediaTabs = [];
let nextChannelNumber = 1; // For unique tab IDs

// Track media window instances (for multiple windows if dragged out)
const mediaWindows = new Map(); // Map<windowId, { container, tabPane }>

// Media type definitions
const MEDIA_TYPES = [
    { type: 'texture', label: 'Texture', icon: '🖼️' },
    { type: 'audio', label: 'Audio', icon: '🎵' },
    { type: 'video', label: 'Video', icon: '🎬' },
    { type: 'cubemap', label: 'Cubemap', icon: '🌐' },
    { type: 'volume', label: 'Volume', icon: '📦' }
];

/**
 * Load the media catalog (lazy load)
 */
async function loadCatalog() {
    if (mediaCatalog) return mediaCatalog;
    
    try {
        const response = await fetch('../media/catalog.json'); // Go up one level from V2/
        mediaCatalog = await response.json();
        logger.info('Media', 'Catalog', `Loaded: ${mediaCatalog.images?.length || 0} textures, ${mediaCatalog.audio?.length || 0} audio, ${mediaCatalog.videos?.length || 0} videos`);
        return mediaCatalog;
    } catch (e) {
        logger.error('Media', 'Catalog', 'Failed to load catalog: ' + e.message);
        return { images: [], audio: [], videos: [], cubemaps: [], volumes: [] };
    }
}

/**
 * Get current tabs list
 */
function getCurrentTabs() {
    if (mediaTabs.length === 0) {
        // No tabs yet - return empty array
        return [];
    }
    return mediaTabs;
}

/**
 * Create "Add Tab" button with dropdown
 */
function createAddTabButton() {
    const addTabBtn = document.createElement('button');
    addTabBtn.textContent = '+ Add Channel';
    addTabBtn.className = 'sl-button';
    addTabBtn.style.cssText = `
        padding: 4px 12px;
        border: 1px solid var(--border, rgba(255,255,255,0.2));
        border-radius: 4px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        position: relative;
        margin-left: auto;
    `;
    
    const dropdown = document.createElement('div');
    dropdown.className = 'sl-dropdown-menu';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        right: 0;
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 4px;
        z-index: 1000;
        display: none;
        flex-direction: column;
        min-width: 150px;
        margin-top: 4px;
    `;
    addTabBtn.appendChild(dropdown);
    
    // Add media type options
    MEDIA_TYPES.forEach(mediaType => {
        const item = document.createElement('button');
        item.className = 'sl-dropdown-item';
        item.setAttribute('role', 'menuitem');
        item.innerHTML = `${mediaType.icon} ${mediaType.label}`;
        item.style.cssText = `
            padding: 8px 12px;
            text-align: left;
            background: none;
            border: none;
            color: var(--text-primary);
            cursor: pointer;
            width: 100%;
        `;
        item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--bg-tertiary, #21262d)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'none';
        });
        item.addEventListener('click', () => {
            addMediaTab(mediaType.type);
            dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
    });
    
    // Toggle dropdown
    addTabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
    });
    
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });
    
    return addTabBtn;
}

/**
 * Add a new media tab
 */
function addMediaTab(mediaType) {
    const tabId = `${mediaType}_${nextChannelNumber}`;
    nextChannelNumber++;
    
    const typeConfig = MEDIA_TYPES.find(t => t.type === mediaType);
    
    const newTab = {
        id: tabId,
        type: mediaType,
        label: `${typeConfig.label} ${nextChannelNumber - 1}`,
        icon: typeConfig.icon,
        closable: true
    };
    
    mediaTabs.push(newTab);
    
    logger.info('Media', 'AddTab', `Added ${mediaType} channel: ${tabId}`);
    
    // Emit event
    events.emit(EVENTS.MEDIA_TAB_ADDED, newTab);
    
    // Add tab to the actual window
    addTabToMediaWindow(tabId, newTab.label, newTab.icon);
}

/**
 * Add a tab to all media window instances
 */
function addTabToMediaWindow(tabId, label, icon) {
    // Try to find any media window (there might be multiple if dragged out)
    // Use .sl-window-container to avoid matching other elements
    const containers = document.querySelectorAll('.sl-window-container[data-window-id*="media"]');
    
    if (containers.length === 0) {
        logger.warn('Media', 'AddTab', 'No media windows found');
        return;
    }
    
    // Add to all media windows
    containers.forEach(container => {
        const tabPane = container.getTabPane?.();
        if (!tabPane) {
            // Skip silently - container might not have TabPane attached yet
            return;
        }
        
        // Check if tab already exists
        const existing = tabPane.getTab?.(tabId);
        if (existing) {
            tabPane.setActiveTab(tabId);
            return;
        }
        
        // Add the tab
        tabPane.addTab({
            id: tabId,
            label: label,
            icon: icon,
            closable: true,
            content: () => createTabContent(tabId)
        }, true); // true = activate immediately
        
        logger.debug('Media', 'AddTab', `Tab ${tabId} added to window ${container.id}`);
    });
}

/**
 * Remove a media tab
 */
function removeMediaTab(tabId) {
    const index = mediaTabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    
    mediaTabs.splice(index, 1);
    logger.info('Media', 'RemoveTab', `Removed channel: ${tabId}`);
    
    events.emit(EVENTS.MEDIA_TAB_REMOVED, { tabId });
}

/**
 * Create placeholder content (no media selected)
 */
function createEmptyPlaceholder(mediaType) {
    const typeConfig = MEDIA_TYPES.find(t => t.type === mediaType);
    
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted, #6e7681);
        text-align: center;
        padding: 40px;
    `;
    
    placeholder.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.3;">${typeConfig.icon}</div>
        <div style="font-size: 14px; color: var(--text-secondary, #8b949e); margin-bottom: 8px;">
            No ${typeConfig.label} Selected
        </div>
        <div style="font-size: 12px; opacity: 0.7;">
            Media selection UI coming soon
        </div>
    `;
    
    return placeholder;
}

/**
 * Create texture selector content
 */
function createTextureSelector(tabId) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    `;
    
    // Preview section with thumbnail and filter options side-by-side
    const previewSection = document.createElement('div');
    previewSection.style.cssText = `
        padding: 12px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
        background: var(--bg-secondary, #161b22);
        flex-shrink: 0;
        display: flex;
        gap: 16px;
        min-height: 0;
    `;
    
    // Left: Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.style.cssText = `
        width: 120px;
        height: 120px;
        background: var(--bg-tertiary, #21262d);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        font-size: 32px;
        flex-shrink: 0;
    `;
    thumbnail.textContent = '🖼️';
    previewSection.appendChild(thumbnail);
    
    // Right: Info and filter options
    const infoColumn = document.createElement('div');
    infoColumn.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    // Texture name
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size: 12px; color: var(--text-muted, #6e7681);';
    nameDiv.textContent = 'No texture selected';
    infoColumn.appendChild(nameDiv);
    
    // Filter settings header
    const filterHeader = document.createElement('div');
    filterHeader.style.cssText = `
        font-size: 10px;
        font-weight: 600;
        color: var(--text-muted, #6e7681);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    filterHeader.innerHTML = `
        <span>Default Filter Settings</span>
        <button disabled style="padding: 2px 6px; font-size: 9px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 3px; cursor: not-allowed; opacity: 0.3;">
            Advanced
        </button>
    `;
    infoColumn.appendChild(filterHeader);
    
    // Filter options (vertical list, greyed out for now)
    const optionsDiv = document.createElement('div');
    optionsDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 11px;
        opacity: 0.5;
        pointer-events: none;
    `;
    optionsDiv.innerHTML = `
        <div style="display: flex; gap: 12px;">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" disabled style="width: 14px; height: 14px;"> V-Flip
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" disabled style="width: 14px; height: 14px;"> Anisotropic
            </label>
        </div>
        <label style="display: flex; align-items: center; gap: 6px;">
            <span style="min-width: 50px;">Wrap:</span>
            <select disabled class="sl-select sl-select-compact" style="flex: 1;"><option>Repeat</option></select>
        </label>
        <label style="display: flex; align-items: center; gap: 6px;">
            <span style="min-width: 50px;">Filter:</span>
            <select disabled class="sl-select sl-select-compact" style="flex: 1;"><option>Mipmap</option></select>
        </label>
    `;
    infoColumn.appendChild(optionsDiv);
    
    previewSection.appendChild(infoColumn);
    container.appendChild(previewSection);
    
    // Create tabs for Catalog and Custom Import
    const tabsContainer = SLUI && SLUI.Tabs ? SLUI.Tabs({
        tabs: [
            {
                id: 'catalog',
                label: 'Catalog',
                content: () => {
                    const catalogContent = document.createElement('div');
                    catalogContent.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                        min-height: 0;
                        overflow: hidden;
                    `;
                    
                    // Gallery section (loads catalog and displays thumbnails)
                    const gallerySection = document.createElement('div');
                    gallerySection.style.cssText = `
                        flex: 1;
                        overflow-y: auto;
                        padding: 12px;
                    `;
                    gallerySection.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: var(--text-muted, #6e7681);">
                            Loading texture catalog...
                        </div>
                    `;
                    catalogContent.appendChild(gallerySection);
                    
                    // Load catalog and render gallery
                    loadCatalog().then(catalog => {
                        const textures = catalog.images || [];
                        gallerySection.innerHTML = '';
                        
                        if (textures.length === 0) {
                            gallerySection.innerHTML = `
                                <div style="text-align: center; padding: 40px; color: var(--text-muted, #6e7681);">
                                    <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
                                    <div>No textures found</div>
                                </div>
                            `;
                            return;
                        }
                        
                        // Create gallery grid
                        const grid = document.createElement('div');
                        grid.style.cssText = `
                            display: grid;
                            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                            gap: 8px;
                        `;
                        
                        textures.forEach(texture => {
                            const card = createTextureCard(texture, tabId);
                            grid.appendChild(card);
                        });
                        
                        gallerySection.appendChild(grid);
                    }).catch(err => {
                        gallerySection.innerHTML = `
                            <div style="text-align: center; padding: 40px; color: var(--console-error, #f85149);">
                                <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
                                <div>Failed to load catalog</div>
                                <div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">${err.message}</div>
                            </div>
                        `;
                    });
                    
                    return catalogContent;
                }
            },
            {
                id: 'custom',
                label: 'Custom Import',
                content: () => {
                    const customContent = document.createElement('div');
                    customContent.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                        min-height: 0;
                        padding: 12px;
                        gap: 12px;
                    `;
                    
                    // URL Import section (compact 2-row layout)
                    const urlSection = document.createElement('div');
                    urlSection.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    `;
                    
                    // Row 1: Header, dropdown, load button
                    const urlRow1 = document.createElement('div');
                    urlRow1.style.cssText = 'display: flex; gap: 8px; align-items: center;';
                    
                    const urlHeader = document.createElement('div');
                    urlHeader.style.cssText = 'font-size: 10px; font-weight: 600; color: var(--text-muted, #6e7681); text-transform: uppercase; letter-spacing: 0.5px;';
                    urlHeader.textContent = 'Import from URL';
                    urlRow1.appendChild(urlHeader);
                    
                    // Spacer
                    const spacer1 = document.createElement('div');
                    spacer1.style.flex = '1';
                    urlRow1.appendChild(spacer1);
                    
                    // Source dropdown
                    let sourceSelect;
                    if (SLUI && SLUI.Select) {
                        sourceSelect = SLUI.Select({
                            items: [
                                { value: 'github', label: 'GitHub' },
                                { value: 'polyhaven', label: 'Poly Haven' },
                                { value: 'imgbb', label: 'ImgBB' },
                                { value: 'cloudinary', label: 'Cloudinary' }
                            ],
                            value: 'github',
                            variant: 'compact'
                        });
                    } else {
                        sourceSelect = document.createElement('select');
                        sourceSelect.className = 'sl-select sl-select-compact';
                        sourceSelect.innerHTML = `
                            <option value="github">GitHub</option>
                            <option value="polyhaven">Poly Haven</option>
                            <option value="imgbb">ImgBB</option>
                            <option value="cloudinary">Cloudinary</option>
                        `;
                    }
                    urlRow1.appendChild(sourceSelect);
                    
                    // Load button
                    const loadBtn = document.createElement('button');
                    loadBtn.textContent = 'Load';
                    loadBtn.style.cssText = `
                        background: var(--bg-secondary, #161b22);
                        color: var(--text-primary, #c9d1d9);
                        border: 1px solid var(--border, rgba(255,255,255,0.1));
                        border-radius: 4px;
                        padding: 4px 12px;
                        font-size: 11px;
                        cursor: pointer;
                    `;
                    urlRow1.appendChild(loadBtn);
                    
                    urlSection.appendChild(urlRow1);
                    
                    // Row 2: Prefix + URL input
                    const urlRow2 = document.createElement('div');
                    urlRow2.style.cssText = 'display: flex; gap: 4px; align-items: center;';
                    
                    // URL prefix
                    const urlPrefix = document.createElement('span');
                    urlPrefix.style.cssText = `
                        font-size: 10px;
                        color: var(--text-muted, #6e7681);
                        font-family: var(--font-code, 'JetBrains Mono', monospace);
                        white-space: nowrap;
                    `;
                    urlPrefix.textContent = 'https://raw.githubusercontent.com/';
                    urlRow2.appendChild(urlPrefix);
                    
                    // URL input
                    const urlInput = document.createElement('input');
                    urlInput.type = 'text';
                    urlInput.placeholder = 'user/repo/branch/path/image.png';
                    urlInput.style.cssText = `
                        flex: 1;
                        background: var(--bg-secondary, #161b22);
                        color: var(--text-primary, #c9d1d9);
                        border: 1px solid var(--border, rgba(255,255,255,0.1));
                        border-radius: 4px;
                        padding: 4px 8px;
                        font-size: 11px;
                        font-family: var(--font-code, 'JetBrains Mono', monospace);
                    `;
                    urlRow2.appendChild(urlInput);
                    
                    urlSection.appendChild(urlRow2);
                    
                    // Update prefix and placeholder when source changes
                    sourceSelect.addEventListener('change', (e) => {
                        const source = e.target ? e.target.value : sourceSelect.value;
                        switch (source) {
                            case 'polyhaven':
                                urlPrefix.textContent = 'https://dl.polyhaven.org/file/ph-assets/';
                                urlInput.placeholder = 'HDRIs/hdri_name/hdri_file.png';
                                break;
                            case 'imgbb':
                                urlPrefix.textContent = 'https://i.ibb.co/';
                                urlInput.placeholder = 'XXXXXXXX/image.png';
                                break;
                            case 'cloudinary':
                                urlPrefix.textContent = 'https://res.cloudinary.com/';
                                urlInput.placeholder = 'cloud_name/image/upload/path/image.png';
                                break;
                            default: // github
                                urlPrefix.textContent = 'https://raw.githubusercontent.com/';
                                urlInput.placeholder = 'user/repo/branch/path/image.png';
                        }
                    });
                    
                    // Load button click handler
                    loadBtn.addEventListener('click', () => {
                        const url = urlInput.value.trim();
                        if (url) {
                            const fullUrl = urlPrefix.textContent + url;
                            logger.info('Media', 'URL', `Loading texture from ${sourceSelect.value}: ${fullUrl}`);
                            events.emit(EVENTS.MEDIA_URL_IMPORT, { tabId, url: fullUrl, source: sourceSelect.value });
                        }
                    });
                    
                    customContent.appendChild(urlSection);
                    return customContent;
                }
            }
        ],
        variant: 'underline',
        activeTab: 'catalog'
    }) : document.createElement('div'); // Fallback if SLUI.Tabs not available
    
    tabsContainer.className += ' v2-media-tabs-container';
    tabsContainer.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
    `;
    
    container.appendChild(tabsContainer);
    
    return container;
}

/**
 * Create a texture card for the gallery
 */
function createTextureCard(texture, tabId) {
    const card = document.createElement('div');
    card.style.cssText = `
        aspect-ratio: 1;
        border-radius: 4px;
        overflow: hidden;
        background: var(--bg-tertiary, #21262d);
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        cursor: pointer;
        transition: border-color 0.15s, transform 0.1s;
        position: relative;
    `;
    
    // Thumbnail
    const img = document.createElement('img');
    // Fix path to be relative to V2 directory
    const imgPath = texture.thumb || texture.path;
    img.src = imgPath.startsWith('/') ? '..' + imgPath : '../' + imgPath;
    img.alt = texture.name;
    img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
    `;
    img.onerror = () => {
        card.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 24px; opacity: 0.3;">🖼️</div>';
    };
    card.appendChild(img);
    
    // Name overlay (on hover)
    const nameOverlay = document.createElement('div');
    nameOverlay.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
        padding: 4px 6px;
        font-size: 9px;
        color: #fff;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    nameOverlay.textContent = texture.name;
    card.appendChild(nameOverlay);
    
    // Hover effects
    card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--accent, #58a6ff)';
        card.style.transform = 'scale(1.05)';
        nameOverlay.style.opacity = '1';
    });
    card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--border, rgba(255,255,255,0.1))';
        card.style.transform = 'scale(1)';
        nameOverlay.style.opacity = '0';
    });
    
    // Click handler
    card.addEventListener('click', () => {
        logger.info('Media', 'Select', `Selected texture: ${texture.name} for ${tabId}`);
        // TODO: Apply texture to this channel
        events.emit(EVENTS.MEDIA_SELECTED, { tabId, texture, type: 'texture' });
    });
    
    return card;
}

/**
 * Create tab content for a media channel
 */
function createTabContent(tabId) {
    const tab = mediaTabs.find(t => t.id === tabId);
    if (!tab) {
        logger.warn('Media', 'Content', `Tab ${tabId} not found in mediaTabs`);
        return createEmptyPlaceholder('texture');
    }
    
    // Create type-specific UI
    switch (tab.type) {
        case 'texture':
            return createTextureSelector(tabId);
        case 'audio':
        case 'video':
        case 'cubemap':
        case 'volume':
            // Placeholder for other types
            return createEmptyPlaceholder(tab.type);
        default:
            return createEmptyPlaceholder(tab.type);
    }
}

/**
 * Register the Media panel
 */
export function register(SLUIInstance) {
    SLUI = SLUIInstance; // Store reference
    
    SLUI.registerPanel({
        id: 'media',
        title: 'Media',
        icon: '🎞️',
        tabbed: true,
        tabGroup: 'media',
        tabs: () => getCurrentTabs().map(tab => ({
            id: tab.id,
            label: tab.label,
            icon: tab.icon,
            closable: tab.closable,
            content: () => createTabContent(tab.id)
        })),
        tabBarAddon: () => createAddTabButton(),
        onTabClose: (tabId) => {
            removeMediaTab(tabId);
        },
        onWindowCreated: (windowId) => {
            logger.debug('Media', 'Window', `Created: ${windowId}`);
        }
    });
    
    logger.info('Media', 'Init', 'Media panel registered (dynamic tabs)');
}
