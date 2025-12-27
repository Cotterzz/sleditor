// ============================================================================
// Shadertoy Browser - Overlay Module
// ============================================================================

import * as shadertoyImport from '../shadertoy-import.js';

let isOpen = false;
let onImportCallback = null;
let allShaders = [];
let filteredShaders = [];
let currentPage = 1;
let perPage = 100;
let selectedShader = null;
let currentSort = { field: 'date', dir: 'desc' };

const STORAGE_KEY = 'shadertoy-browser-data';

// DOM references (set after mount)
let overlay = null;
let dropZone = null;
let shaderContainer = null;
let shaderList = null;
let pagination = null;
let searchInput = null;
let sortSelect = null;
let filterSelect = null;
let perPageSelect = null;
let statsBar = null;
let detailPanel = null;

// ============================================================================
// Public API
// ============================================================================

export function init() {
    createOverlay();
    setupEventListeners();
    console.log('Shadertoy Browser initialized');
}

export function open() {
    if (!overlay) createOverlay();
    overlay.style.display = 'block';
    isOpen = true;
    
    // Check for saved data (only load if not already loaded)
    if (allShaders.length === 0) {
        const savedData = loadFromStorage();
        if (savedData) {
            initializeData(savedData, false);
        }
    }
}

export function close() {
    if (overlay) {
        overlay.style.display = 'none';
    }
    isOpen = false;
}

export function isVisible() {
    return isOpen;
}

export function getSelectedShader() {
    return selectedShader;
}

export function setImportCallback(callback) {
    onImportCallback = callback;
}

// ============================================================================
// Overlay Creation
// ============================================================================

function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'shadertoyBrowserOverlay';
    overlay.innerHTML = getOverlayHTML();
    document.body.appendChild(overlay);
    
    // Apply styles
    const style = document.createElement('style');
    style.textContent = getOverlayCSS();
    document.head.appendChild(style);
    
    // Get DOM references
    dropZone = overlay.querySelector('#stDropZone');
    shaderContainer = overlay.querySelector('#stShaderContainer');
    shaderList = overlay.querySelector('#stShaderList');
    pagination = overlay.querySelector('#stPagination');
    searchInput = overlay.querySelector('#stSearchInput');
    sortSelect = overlay.querySelector('#stSortSelect');
    filterSelect = overlay.querySelector('#stFilterSelect');
    perPageSelect = overlay.querySelector('#stPerPageSelect');
    statsBar = overlay.querySelector('#stStatsBar');
    detailPanel = overlay.querySelector('#stDetailPanel');
}

function getOverlayHTML() {
    return `
    <div class="st-overlay-content">
        <header class="st-header">
            <div class="st-header-content">
                <div class="st-logo">
                    <img src="favicon/st.png" alt="ST" style="height: 20px; margin-right: 8px;">
                    Shadertoy Browser
                </div>
                
                <label class="st-case-toggle" title="Case sensitive search">
                    <input type="checkbox" id="stCaseSensitive"> Aa
                </label>
                
                <div class="st-search-box" id="stSearchBox">
                    <input type="text" id="stSearchInput" placeholder="Search (comma for multiple, &quot;exact&quot;)..." disabled>
                    <button class="st-search-clear" id="stSearchClear" title="Clear search">×</button>
                </div>
                
                <div class="st-controls">
                    <button id="stBackBtn" class="st-back-btn" title="Back to Sleditor">
                        ⏎ Sleditor
                    </button>
                    <select id="stSortSelect" disabled>
                        <option value="date-desc">Newest First</option>
                        <option value="date-asc">Oldest First</option>
                        <option value="name-asc">Name A-Z</option>
                        <option value="name-desc">Name Z-A</option>
                        <option value="views-desc">Most Viewed</option>
                        <option value="views-asc">Least Viewed</option>
                        <option value="likes-desc">Most Liked</option>
                        <option value="likes-asc">Least Liked</option>
                    </select>
                    
                    <select id="stFilterSelect" disabled>
                        <option value="all">All Shaders</option>
                        <option value="public-api">Public + API</option>
                        <option value="public">Public Only</option>
                        <option value="unlisted">Unlisted Only</option>
                        <option value="private">Private Only</option>
                        <option value="multipass">Multi-pass</option>
                    </select>
                    
                    <select id="stPerPageSelect" disabled>
                        <option value="50">50 per page</option>
                        <option value="100" selected>100 per page</option>
                        <option value="200">200 per page</option>
                        <option value="500">500 per page</option>
                        <option value="1000">1k per page</option>
                        <option value="99999">All</option>
                    </select>
                    
                    <button id="stLoadNewBtn" title="Load different JSON file" style="display:none;">📁 Load JSON</button>
                </div>
            </div>
        </header>

        <div class="st-stats-bar" id="stStatsBar" style="display: none;">
            <div class="st-stats-bar-content">
                <div class="st-user-info">
                    <span>Library: <span class="st-user-name" id="stUserName">-</span></span>
                    <span id="stShaderCount">0 shaders</span>
                    <span id="stFilteredCount"></span>
                </div>
                <div>
                    <span id="stTotalViews">0 total views</span> · 
                    <span id="stTotalLikes">0 total likes</span>
                </div>
            </div>
        </div>

        <div class="st-main-container">
            <div class="st-list-area" id="stListArea">
                <div class="st-drop-zone" id="stDropZone">
                    <h2>📁 Load Your Shadertoy Library</h2>
                    <p>Drag and drop your shaders.json file here, or click to browse</p>
                    <button class="st-primary" id="stChooseFileBtn">Choose File</button>
                    <input type="file" id="stFileInput" accept=".json" style="display:none;">
                </div>
                
                <div id="stShaderContainer" style="display: none; flex-direction: column; flex: 1; min-height: 0;">
                    <div class="st-list-header" id="stListHeader">
                        <span class="st-shader-title" data-sort="name">Name ↕</span>
                        <span class="st-shader-date" data-sort="date">Date ↕</span>
                        <span class="st-shader-status">Status</span>
                        <span class="st-shader-views" data-sort="views">Views ↕</span>
                        <span class="st-shader-likes" data-sort="likes">Likes ↕</span>
                        <span class="st-shader-passes">Passes</span>
                        <span class="st-shader-id">ID</span>
                    </div>
                    <div class="st-shader-list-scroll" id="stShaderListScroll">
                        <div class="st-shader-list" id="stShaderList"></div>
                    </div>
                    <div class="st-pagination" id="stPagination"></div>
                </div>
            </div>
            
            <div class="st-detail-panel" id="stDetailPanel">
                <button class="st-close-btn" id="stCloseDetailBtn">×</button>
                <div class="st-detail-header">
                    <h2 class="st-detail-title" id="stDetailTitle">-</h2>
                    <div class="st-detail-id" id="stDetailId">-</div>
                    <div class="st-detail-actions-top">
                        <button id="stImportBtn" class="st-import-btn" title="Import this shader to Sleditor">🚀 Import to Sleditor</button>
                    </div>
                    <div class="st-detail-actions-secondary">
                        <button id="stOpenInShadertoy">Open in Shadertoy ↗</button>
                        <button id="stCopyCode">Copy Code</button>
                    </div>
                    <div class="st-import-status" id="stImportStatus"></div>
                </div>
                
                <div class="st-detail-section">
                    <div class="st-detail-stats">
                        <div class="st-stat-item">
                            <div class="st-stat-value" id="stDetailViews">0</div>
                            <div class="st-stat-label">Views</div>
                        </div>
                        <div class="st-stat-item">
                            <div class="st-stat-value" id="stDetailLikes">0</div>
                            <div class="st-stat-label">Likes</div>
                        </div>
                        <div class="st-stat-item">
                            <div class="st-stat-value" id="stDetailPasses">1</div>
                            <div class="st-stat-label">Passes</div>
                        </div>
                    </div>
                </div>
                
                <div class="st-detail-section">
                    <h4>Status</h4>
                    <div id="stDetailStatus">-</div>
                </div>
                
                <div class="st-detail-section">
                    <h4>Published</h4>
                    <div id="stDetailDate">-</div>
                </div>
                
                <div class="st-detail-section">
                    <h4>Description</h4>
                    <div class="st-detail-description" id="stDetailDescription">-</div>
                </div>
                
                <div class="st-detail-section">
                    <h4>Tags</h4>
                    <div class="st-detail-tags" id="stDetailTags"></div>
                </div>
                
                <div class="st-detail-section">
                    <h4>Render Passes</h4>
                    <div class="st-detail-buffers" id="stDetailBuffers"></div>
                </div>
            </div>
        </div>
    </div>
    `;
}

function getOverlayCSS() {
    return `
    #shadertoyBrowserOverlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #0a0a0f;
        z-index: 10000;
        display: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e2e8f0;
    }
    
    .st-overlay-content {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    
    /* Header */
    .st-header {
        background: #0d0d14;
        border-bottom: 1px solid #1e293b;
        padding: 0.75rem 1.5rem;
        flex-shrink: 0;
    }
    
    .st-header-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: nowrap;
    }
    
    .st-logo {
        font-size: 1.25rem;
        font-weight: 700;
        color: #6366f1;
        display: flex;
        align-items: center;
    }
    
    .st-back-btn {
        padding: 0.5rem 1rem;
        background: #2563eb;
        border: none;
        border-radius: 6px;
        color: white;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        white-space: nowrap;
    }
    
    .st-back-btn:hover {
        background: #60a5fa;
    }
    
    .st-case-toggle {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: #64748b;
    }
    
    .st-search-box {
        flex: 1;
        min-width: 200px;
        max-width: 400px;
        position: relative;
    }
    
    .st-search-box input {
        width: 100%;
        padding: 0.5rem 2rem 0.5rem 2.5rem;
        background: #0a0a0f;
        border: 1px solid #1e293b;
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 0.875rem;
        outline: none;
    }
    
    .st-search-box input:focus {
        border-color: #6366f1;
    }
    
    .st-search-box::before {
        content: "🔍";
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.875rem;
        z-index: 1;
    }
    
    .st-search-clear {
        position: absolute;
        right: 0.5rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 1rem;
        display: none;
    }
    
    .st-search-box.has-value .st-search-clear {
        display: block;
    }
    
    .st-controls {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: nowrap;
        margin-left: auto;
    }
    
    .st-controls select, .st-controls button:not(.st-back-btn) {
        padding: 0.5rem 1rem;
        background: #0a0a0f;
        border: 1px solid #1e293b;
        border-radius: 6px;
        color: #e2e8f0;
        font-size: 0.875rem;
        cursor: pointer;
    }
    
    .st-controls select:hover, .st-controls button:not(.st-back-btn):hover {
        border-color: #6366f1;
    }
    
    /* Stats bar */
    .st-stats-bar {
        background: #12121a;
        padding: 0.75rem 1.5rem;
        border-bottom: 1px solid #1e293b;
        font-size: 0.875rem;
        color: #94a3b8;
        flex-shrink: 0;
    }
    
    .st-stats-bar-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
    }
    
    .st-user-info {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .st-user-name {
        font-weight: 600;
        color: #e2e8f0;
    }
    
    /* Main layout */
    .st-main-container {
        display: flex;
        flex: 1;
        min-height: 0;
    }
    
    .st-list-area {
        flex: 1;
        padding: 1rem 1.5rem;
        overflow-y: hidden;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    
    .st-shader-list-scroll {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }
    
    .st-shader-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    
    .st-shader-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 1rem;
        background: #12121a;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
        font-size: 0.875rem;
    }
    
    .st-shader-row:hover {
        border-color: #6366f1;
        background: #1a1a25;
    }
    
    .st-shader-row.selected {
        border-color: #6366f1;
        background: #1a1a25;
    }
    
    .st-shader-title { flex: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 200px; }
    .st-shader-date { width: 100px; color: #64748b; text-align: center; }
    .st-shader-date.estimated { font-style: italic; opacity: 0.7; }
    .st-shader-status { width: 85px; text-align: center; }
    .st-shader-status.public-api { color: #22c55e; }
    .st-shader-status.public { color: #4ade80; }
    .st-shader-status.unlisted { color: #60a5fa; }
    .st-shader-status.private { color: #f59e0b; }
    .st-shader-views, .st-shader-likes { width: 80px; color: #94a3b8; text-align: right; }
    .st-shader-passes { width: 60px; color: #64748b; text-align: center; }
    .st-shader-id { width: 70px; font-family: monospace; font-size: 0.75rem; color: #64748b; }
    
    /* List header */
    .st-list-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid #1e293b;
        margin-bottom: 0.5rem;
        flex-shrink: 0;
    }
    
    .st-list-header > span[data-sort] {
        cursor: pointer;
        user-select: none;
    }
    
    .st-list-header > span[data-sort]:hover {
        color: #e2e8f0;
    }
    
    .st-list-header > span[data-sort].sort-asc::after { content: " ▲"; }
    .st-list-header > span[data-sort].sort-desc::after { content: " ▼"; }
    
    /* Detail panel */
    .st-detail-panel {
        width: 400px;
        background: #0d0d14;
        border-left: 1px solid #1e293b;
        overflow-y: auto;
        display: none;
        position: relative;
    }
    
    .st-detail-panel.open {
        display: block;
    }
    
    .st-close-btn {
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #0a0a0f;
        border: 1px solid #1e293b;
        color: #e2e8f0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        z-index: 10;
    }
    
    .st-close-btn:hover {
        background: #1a1a25;
    }
    
    .st-detail-header {
        padding: 1.5rem;
        border-bottom: 1px solid #1e293b;
    }
    
    .st-detail-title {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
    }
    
    .st-detail-id {
        font-size: 0.75rem;
        color: #64748b;
        font-family: monospace;
        margin-bottom: 0.75rem;
    }
    
    .st-detail-actions-top {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    
    .st-detail-actions-secondary {
        display: flex;
        gap: 0.5rem;
    }
    
    .st-detail-actions-secondary button {
        flex: 1;
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
        background: #0a0a0f;
        border: 1px solid #1e293b;
        border-radius: 6px;
        color: #e2e8f0;
        cursor: pointer;
    }
    
    .st-detail-actions-secondary button:hover {
        border-color: #6366f1;
    }
    
    .st-import-btn {
        width: 100%;
        padding: 0.75rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        background: #22c55e;
        border: none;
        border-radius: 6px;
        color: white;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .st-import-btn:hover:not(:disabled) {
        background: #16a34a;
    }
    
    .st-import-btn:disabled {
        background: #374151;
        color: #9ca3af;
        cursor: not-allowed;
    }
    
    .st-import-status {
        margin-top: 0.75rem;
        padding: 0.5rem;
        border-radius: 6px;
        font-size: 0.75rem;
        display: none;
    }
    
    .st-import-status.error {
        display: block;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid #ef4444;
        color: #ef4444;
    }
    
    .st-import-status.warning {
        display: block;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid #f59e0b;
        color: #f59e0b;
    }
    
    .st-import-status.success {
        display: block;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid #22c55e;
        color: #22c55e;
    }
    
    .st-detail-section {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #1e293b;
    }
    
    .st-detail-section h4 {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.5rem;
    }
    
    .st-detail-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
    }
    
    .st-stat-item { text-align: center; }
    .st-stat-value { font-size: 1.5rem; font-weight: 700; color: #6366f1; }
    .st-stat-label { font-size: 0.75rem; color: #64748b; }
    
    .st-detail-description {
        font-size: 0.875rem;
        color: #94a3b8;
        line-height: 1.6;
        white-space: pre-wrap;
    }
    
    .st-detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .st-tag {
        padding: 0.25rem 0.75rem;
        background: #0a0a0f;
        border-radius: 9999px;
        font-size: 0.75rem;
        color: #94a3b8;
    }
    
    .st-detail-buffers {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .st-buffer-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        background: #0a0a0f;
        border-radius: 6px;
        font-size: 0.8125rem;
    }
    
    .st-buffer-type { font-weight: 500; }
    .st-buffer-inputs { color: #64748b; font-size: 0.75rem; }
    
    /* Pagination */
    .st-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1rem;
        flex-shrink: 0;
    }
    
    .st-pagination button {
        min-width: 40px;
        padding: 0.5rem;
        background: #0a0a0f;
        border: 1px solid #1e293b;
        border-radius: 6px;
        color: #e2e8f0;
        cursor: pointer;
    }
    
    .st-pagination button:hover {
        border-color: #6366f1;
    }
    
    .st-pagination button.active {
        background: #6366f1;
        border-color: #6366f1;
    }
    
    .st-pagination button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .st-page-info {
        padding: 0 0.5rem;
        color: #64748b;
    }
    
    /* Drop zone */
    .st-drop-zone {
        border: 2px dashed #1e293b;
        border-radius: 16px;
        padding: 4rem 2rem;
        text-align: center;
        margin: 2rem;
        transition: all 0.2s;
    }
    
    .st-drop-zone.dragover {
        border-color: #6366f1;
        background: rgba(99, 102, 241, 0.1);
    }
    
    .st-drop-zone h2 {
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
    }
    
    .st-drop-zone p {
        color: #64748b;
        margin-bottom: 1.5rem;
    }
    
    .st-primary {
        padding: 0.75rem 1.5rem;
        background: #6366f1;
        border: none;
        border-radius: 6px;
        color: white;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
    }
    
    .st-primary:hover {
        background: #818cf8;
    }
    
    /* Loading */
    .st-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4rem;
        color: #64748b;
    }
    
    .st-loading::after {
        content: "";
        width: 24px;
        height: 24px;
        border: 2px solid #1e293b;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: st-spin 0.8s linear infinite;
        margin-left: 0.75rem;
    }
    
    @keyframes st-spin {
        to { transform: rotate(360deg); }
    }
    `;
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
    // Wait for overlay to be created
    if (!overlay) return;
    
    // Back button
    overlay.querySelector('#stBackBtn').addEventListener('click', close);
    
    // File handling
    const fileInput = overlay.querySelector('#stFileInput');
    const chooseFileBtn = overlay.querySelector('#stChooseFileBtn');
    
    chooseFileBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadFile(file);
    });
    
    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    });
    
    // Search
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 300);
    });
    
    overlay.querySelector('#stSearchClear').addEventListener('click', () => {
        searchInput.value = '';
        overlay.querySelector('#stSearchBox').classList.remove('has-value');
        applyFilters();
    });
    
    // Controls
    sortSelect.addEventListener('change', applyFilters);
    filterSelect.addEventListener('change', applyFilters);
    
    perPageSelect.addEventListener('change', (e) => {
        perPage = parseInt(e.target.value);
        currentPage = 1;
        renderShaders();
    });
    
    overlay.querySelector('#stCaseSensitive').addEventListener('change', applyFilters);
    
    // Column header sorting
    overlay.querySelector('#stListHeader').addEventListener('click', (e) => {
        const sortField = e.target.dataset.sort;
        if (!sortField) return;
        
        if (currentSort.field === sortField) {
            currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = sortField;
            currentSort.dir = 'desc';
        }
        
        sortSelect.value = `${currentSort.field}-${currentSort.dir}`;
        
        overlay.querySelectorAll('.st-list-header [data-sort]').forEach(el => {
            el.classList.remove('sort-asc', 'sort-desc');
            el.textContent = el.textContent.replace(/ [▲▼↕]$/, '') + ' ↕';
        });
        e.target.classList.add(`sort-${currentSort.dir}`);
        e.target.textContent = e.target.textContent.replace(/ [▲▼↕]$/, '');
        
        applyFilters();
    });
    
    // Load new JSON button
    overlay.querySelector('#stLoadNewBtn').addEventListener('click', () => {
        if (confirm('Load a different JSON file? This will replace the current data.')) {
            localStorage.removeItem(STORAGE_KEY);
            showDropZone();
        }
    });
    
    // Detail panel
    overlay.querySelector('#stCloseDetailBtn').addEventListener('click', closeDetail);
    overlay.querySelector('#stOpenInShadertoy').addEventListener('click', openInShadertoy);
    overlay.querySelector('#stCopyCode').addEventListener('click', copyCode);
    overlay.querySelector('#stImportBtn').addEventListener('click', handleImport);
    
    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            if (detailPanel.classList.contains('open')) {
                closeDetail();
            } else {
                close();
            }
        }
    });
}

// ============================================================================
// Data Loading
// ============================================================================

function loadFile(file) {
    dropZone.innerHTML = '<div class="st-loading">Loading shaders</div>';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            initializeData(data, true);
        } catch (err) {
            dropZone.innerHTML = `
                <h2>❌ Error Loading File</h2>
                <p>${err.message}</p>
                <button class="st-primary" onclick="location.reload()">Try Again</button>
            `;
        }
    };
    reader.readAsText(file);
}

function initializeData(data, saveToLocalStorage = false) {
    if (Array.isArray(data)) {
        allShaders = data;
    } else {
        allShaders = data.shaders || [];
    }
    
    if (allShaders.length === 0) return;
    
    if (saveToLocalStorage) {
        saveToStorage(data);
    }
    
    estimateMissingDates();
    
    const userName = data.userName || allShaders[0]?.info?.username || 'Unknown';
    
    overlay.querySelector('#stUserName').textContent = userName;
    overlay.querySelector('#stShaderCount').textContent = `${allShaders.length} shaders`;
    
    const totalViews = allShaders.reduce((sum, s) => sum + (s.info?.viewed || 0), 0);
    const totalLikes = allShaders.reduce((sum, s) => sum + (s.info?.likes || 0), 0);
    overlay.querySelector('#stTotalViews').textContent = `${totalViews.toLocaleString()} total views`;
    overlay.querySelector('#stTotalLikes').textContent = `${totalLikes.toLocaleString()} total likes`;
    
    searchInput.disabled = false;
    sortSelect.disabled = false;
    filterSelect.disabled = false;
    perPageSelect.disabled = false;
    
    dropZone.style.display = 'none';
    shaderContainer.style.display = 'flex';
    statsBar.style.display = 'block';
    overlay.querySelector('#stLoadNewBtn').style.display = 'inline-block';
    
    applyFilters();
}

function saveToStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
        console.warn('Failed to save to localStorage:', err.message);
    }
}

function loadFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (err) {
        console.warn('Failed to load from localStorage:', err.message);
    }
    return null;
}

function showDropZone() {
    allShaders = [];
    filteredShaders = [];
    selectedShader = null;
    currentPage = 1;
    
    dropZone.style.display = 'block';
    dropZone.innerHTML = `
        <h2>📁 Load Your Shadertoy Library</h2>
        <p>Drag and drop your shaders.json file here, or click to browse</p>
        <button class="st-primary" id="stChooseFileBtn">Choose File</button>
        <input type="file" id="stFileInput" accept=".json" style="display:none;">
    `;
    
    const fileInput = overlay.querySelector('#stFileInput');
    overlay.querySelector('#stChooseFileBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadFile(file);
    });
    
    shaderContainer.style.display = 'none';
    statsBar.style.display = 'none';
    detailPanel.classList.remove('open');
    overlay.querySelector('#stLoadNewBtn').style.display = 'none';
    
    searchInput.disabled = true;
    sortSelect.disabled = true;
    filterSelect.disabled = true;
    perPageSelect.disabled = true;
}

// ============================================================================
// Filtering and Sorting
// ============================================================================

function applyFilters() {
    const searchValue = searchInput.value.trim();
    const caseSensitive = overlay.querySelector('#stCaseSensitive')?.checked || false;
    const searchTerms = searchValue ? searchValue.split(',').map(t => t.trim()).filter(t => t) : [];
    const filter = filterSelect.value;
    const sort = sortSelect.value;
    
    overlay.querySelector('#stSearchBox').classList.toggle('has-value', searchValue.length > 0);
    
    filteredShaders = allShaders.filter(shader => {
        const info = shader.info || {};
        
        if (searchTerms.length > 0) {
            let searchFields = [
                info.name || '',
                info.description || '',
                (info.tags || []).join(' '),
                (shader.renderpass || []).map(p => p.code || '').join(' ')
            ].join(' ');
            
            if (!caseSensitive) searchFields = searchFields.toLowerCase();
            
            for (let term of searchTerms) {
                if (!caseSensitive) term = term.toLowerCase();
                
                const exactMatch = term.match(/^"(.+)"$/);
                if (exactMatch) {
                    const word = exactMatch[1];
                    const regex = new RegExp(`\\b${word}\\b`, caseSensitive ? '' : 'i');
                    if (!regex.test(searchFields)) return false;
                } else {
                    if (!searchFields.includes(term)) return false;
                }
            }
        }
        
        const status = getStatus(info.published);
        if (filter === 'public-api' && status !== 'public-api') return false;
        if (filter === 'public' && status !== 'public') return false;
        if (filter === 'unlisted' && status !== 'unlisted') return false;
        if (filter === 'private' && status !== 'private') return false;
        if (filter === 'multipass' && (shader.renderpass || []).length < 2) return false;
        
        return true;
    });
    
    const [sortField, sortDir] = sort.split('-');
    filteredShaders.sort((a, b) => {
        let aVal, bVal;
        
        switch (sortField) {
            case 'name':
                aVal = (a.info?.name || '').toLowerCase();
                bVal = (b.info?.name || '').toLowerCase();
                break;
            case 'date':
                aVal = parseInt(a.info?.date || 0);
                bVal = parseInt(b.info?.date || 0);
                break;
            case 'views':
                aVal = a.info?.viewed || 0;
                bVal = b.info?.viewed || 0;
                break;
            case 'likes':
                aVal = a.info?.likes || 0;
                bVal = b.info?.likes || 0;
                break;
        }
        
        if (sortDir === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
    
    overlay.querySelector('#stFilteredCount').textContent = 
        filteredShaders.length !== allShaders.length 
            ? `(${filteredShaders.length} shown)` 
            : '';
    
    currentPage = 1;
    renderShaders();
}

function getStatus(published) {
    if (published === undefined || published === null) return 'private';
    
    if (typeof published === 'number' || !isNaN(parseInt(published))) {
        const num = parseInt(published);
        if (num === 0) return 'private';
        if (num === 1) return 'public';
        if (num === 2) return 'unlisted';
        if (num === 3) return 'public-api';
    }
    
    const p = String(published).toLowerCase();
    if (p.includes('api')) return 'public-api';
    if (p === 'public') return 'public';
    if (p.includes('unlisted')) return 'unlisted';
    if (p.includes('private')) return 'private';
    return 'private';
}

function getStatusLabel(published) {
    const status = getStatus(published);
    switch (status) {
        case 'public-api': return 'Public+API';
        case 'public': return 'Public';
        case 'unlisted': return 'Unlisted';
        case 'private': return 'Private';
        default: return 'Private';
    }
}

function hasValidDate(shader) {
    const date = shader?.info?.date;
    return date && date !== "0" && parseInt(date) > 0;
}

function estimateMissingDates() {
    for (let i = 0; i < allShaders.length; i++) {
        const shader = allShaders[i];
        
        if (hasValidDate(shader)) continue;
        
        let prevDate = null;
        for (let j = i - 1; j >= 0; j--) {
            if (hasValidDate(allShaders[j])) {
                prevDate = parseInt(allShaders[j].info.date);
                break;
            }
        }
        
        let nextDate = null;
        for (let j = i + 1; j < allShaders.length; j++) {
            if (hasValidDate(allShaders[j])) {
                nextDate = parseInt(allShaders[j].info.date);
                break;
            }
        }
        
        let estimatedDate = null;
        if (prevDate && nextDate) {
            estimatedDate = Math.round((prevDate + nextDate) / 2);
        } else if (prevDate) {
            estimatedDate = prevDate;
        } else if (nextDate) {
            estimatedDate = nextDate;
        }
        
        if (estimatedDate) {
            if (!shader.info) shader.info = {};
            shader.info.date = String(estimatedDate);
            shader.info.dateEstimated = true;
        }
    }
}

// ============================================================================
// Rendering
// ============================================================================

function renderShaders() {
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const pageShaders = filteredShaders.slice(start, end);
    
    shaderList.innerHTML = pageShaders.map(shader => renderRow(shader)).join('');
    
    // Attach click handlers
    shaderList.querySelectorAll('.st-shader-row').forEach(row => {
        row.addEventListener('click', () => {
            selectShader(row.dataset.id);
        });
    });
    
    renderPagination();
}

function renderRow(shader) {
    const info = shader.info || {};
    const id = info.id || '';
    const hasDate = info.date && info.date !== "0" && parseInt(info.date) > 0;
    const dateStr = hasDate ? new Date(parseInt(info.date) * 1000).toLocaleDateString() : '-';
    const dateDisplay = info.dateEstimated ? `c.${dateStr}` : dateStr;
    const passes = (shader.renderpass || []).length;
    const isSelected = selectedShader?.info?.id === id;
    const status = getStatus(info.published);
    const statusLabel = getStatusLabel(info.published);
    
    return `
        <div class="st-shader-row ${isSelected ? 'selected' : ''}" data-id="${id}">
            <span class="st-shader-title">${escapeHtml(info.name || 'Untitled')}</span>
            <span class="st-shader-date ${info.dateEstimated ? 'estimated' : ''}" title="${info.dateEstimated ? 'Estimated from surrounding shaders' : ''}">${dateDisplay}</span>
            <span class="st-shader-status ${status}">${statusLabel}</span>
            <span class="st-shader-views">👁 ${(info.viewed || 0).toLocaleString()}</span>
            <span class="st-shader-likes">❤️ ${info.likes || 0}</span>
            <span class="st-shader-passes">${passes}</span>
            <span class="st-shader-id">${id}</span>
        </div>
    `;
}

function renderPagination() {
    const totalPages = Math.ceil(filteredShaders.length / perPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
    
    const range = 2;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - range && i <= currentPage + range)) {
            html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
            html += `<span class="st-page-info">...</span>`;
        }
    }
    
    html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
    
    pagination.innerHTML = html;
    
    pagination.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page);
            renderShaders();
            overlay.querySelector('#stShaderListScroll').scrollTop = 0;
        });
    });
}

// ============================================================================
// Detail Panel
// ============================================================================

function selectShader(id) {
    selectedShader = allShaders.find(s => s.info?.id === id);
    if (!selectedShader) return;
    
    const info = selectedShader.info || {};
    const passes = selectedShader.renderpass || [];
    
    overlay.querySelector('#stDetailTitle').textContent = info.name || 'Untitled';
    overlay.querySelector('#stDetailId').textContent = `ID: ${info.id}`;
    overlay.querySelector('#stDetailViews').textContent = (info.viewed || 0).toLocaleString();
    overlay.querySelector('#stDetailLikes').textContent = info.likes || 0;
    overlay.querySelector('#stDetailPasses').textContent = passes.length;
    overlay.querySelector('#stDetailStatus').textContent = getStatusLabel(info.published);
    
    const hasDate = info.date && info.date !== "0" && parseInt(info.date) > 0;
    const dateStr = hasDate ? new Date(parseInt(info.date) * 1000).toLocaleString() : '-';
    overlay.querySelector('#stDetailDate').textContent = info.dateEstimated ? `circa ${dateStr}` : dateStr;
    overlay.querySelector('#stDetailDescription').innerHTML = parseDescription(info.description || 'No description');
    
    const tagsHtml = (info.tags || []).map(tag => `<span class="st-tag">${escapeHtml(tag)}</span>`).join('');
    overlay.querySelector('#stDetailTags').innerHTML = tagsHtml || '<span class="st-tag">No tags</span>';
    
    const buffersHtml = passes.map(pass => {
        const inputCount = (pass.inputs || []).length;
        const inputTypes = (pass.inputs || []).map(i => i.type).join(', ');
        return `
            <div class="st-buffer-item">
                <span class="st-buffer-type">${pass.name || pass.type}</span>
                <span class="st-buffer-inputs">${inputCount ? `${inputCount} inputs (${inputTypes})` : 'No inputs'}</span>
            </div>
        `;
    }).join('');
    overlay.querySelector('#stDetailBuffers').innerHTML = buffersHtml;
    
    detailPanel.classList.add('open');
    updateImportButton();
    renderShaders();
}

function closeDetail() {
    detailPanel.classList.remove('open');
    selectedShader = null;
    updateImportButton();
    renderShaders();
}

function openInShadertoy() {
    if (selectedShader?.info?.id) {
        window.open(`https://www.shadertoy.com/view/${selectedShader.info.id}`, '_blank');
    }
}

function copyCode() {
    if (!selectedShader) return;
    
    const code = (selectedShader.renderpass || [])
        .map(p => `// === ${p.name || p.type} ===\n${p.code || ''}`)
        .join('\n\n');
    
    navigator.clipboard.writeText(code).then(() => {
        const btn = overlay.querySelector('#stCopyCode');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Code', 1500);
    });
}

// ============================================================================
// Import
// ============================================================================

function updateImportButton() {
    const btn = overlay.querySelector('#stImportBtn');
    const status = overlay.querySelector('#stImportStatus');
    
    if (!selectedShader) {
        btn.disabled = true;
        btn.textContent = '🚀 Import to Sleditor';
        status.className = 'st-import-status';
        status.textContent = '';
        return;
    }
    
    const validation = shadertoyImport.validateShader(selectedShader);
    
    if (validation.canImport) {
        btn.disabled = false;
        btn.textContent = '🚀 Import to Sleditor';
        
        if (validation.warnings.length > 0) {
            status.className = 'st-import-status warning';
            status.textContent = '⚠️ ' + validation.warnings.join(' • ');
        } else {
            status.className = 'st-import-status';
            status.textContent = '';
        }
    } else {
        btn.disabled = true;
        btn.textContent = '⛔ Cannot Import';
        status.className = 'st-import-status error';
        status.textContent = '❌ ' + validation.reason;
    }
}

async function handleImport() {
    if (!selectedShader) return;
    
    const result = shadertoyImport.importShader(selectedShader);
    
    // Show summary popup
    showImportSummary(result.summary);
    
    if (result.success && result.shader) {
        // Close the browser first
        close();
        
        // Call the import callback to load the shader (await if async)
        if (onImportCallback) {
            await onImportCallback(result.shader);
        }
    }
}

function showImportSummary(summary) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'st-import-modal-overlay';
    modal.innerHTML = `
        <div class="st-import-modal">
            <div class="st-import-modal-header">
                <h3>${summary.success ? '✓ Import Successful' : '✗ Import Failed'}</h3>
                <button class="st-import-modal-close">×</button>
            </div>
            <div class="st-import-modal-content">
                ${shadertoyImport.formatSummaryHTML(summary)}
            </div>
            <div class="st-import-modal-footer">
                <button class="st-import-modal-ok">OK</button>
            </div>
        </div>
    `;
    
    // Add modal styles if not already present
    if (!document.querySelector('#stImportModalStyles')) {
        const style = document.createElement('style');
        style.id = 'stImportModalStyles';
        style.textContent = `
            .st-import-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 20000;
            }
            
            .st-import-modal {
                background: #0d0d14;
                border: 1px solid #1e293b;
                border-radius: 12px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
            }
            
            .st-import-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem 1.5rem;
                border-bottom: 1px solid #1e293b;
            }
            
            .st-import-modal-header h3 {
                margin: 0;
                font-size: 1.125rem;
            }
            
            .st-import-modal-close {
                background: none;
                border: none;
                color: #e2e8f0;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0;
                line-height: 1;
            }
            
            .st-import-modal-content {
                padding: 1.5rem;
                overflow-y: auto;
                flex: 1;
            }
            
            .st-import-modal-footer {
                padding: 1rem 1.5rem;
                border-top: 1px solid #1e293b;
                display: flex;
                justify-content: flex-end;
            }
            
            .st-import-modal-ok {
                padding: 0.5rem 1.5rem;
                background: #6366f1;
                border: none;
                border-radius: 6px;
                color: white;
                font-weight: 600;
                cursor: pointer;
            }
            
            .st-import-modal-ok:hover {
                background: #818cf8;
            }
        `;
        document.head.appendChild(style);
    }
    
    overlay.appendChild(modal);
    
    // Event handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.st-import-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.st-import-modal-ok').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// ============================================================================
// Utilities
// ============================================================================

function parseDescription(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/\[url\](https?:\/\/[^\[]+)\[\/url\]/gi, '<a href="$1" target="_blank" style="color:#6366f1">$1</a>');
    html = html.replace(/\[url=(https?:\/\/[^\]]+)\]([^\[]+)\[\/url\]/gi, '<a href="$1" target="_blank" style="color:#6366f1">$2</a>');
    html = html.replace(/\[img\](https?:\/\/[^\[]+)\[\/img\]/gi, '<img src="$1" style="max-width:100%;max-height:100px;margin:0.5rem 0;border-radius:4px;" onerror="this.style.display=\'none\'">');
    html = html.replace(/\n/g, '<br>');
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

