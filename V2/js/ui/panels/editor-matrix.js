/**
 * Channel Matrix Component - Per-receiver texture filter settings
 */

import { logger } from '../../core/logger.js';
import { events, EVENTS } from '../../core/events.js';
import { state } from '../../core/state.js';
import { actions } from '../../core/actions.js';

// Special tab ID for channel matrix
export const MATRIX_TAB_ID = '__channel_matrix__';

// Refresh callback (set by unified-editor)
let refreshCallback = null;

export function setRefreshCallback(callback) {
    refreshCallback = callback;
}

function refreshTabs() {
    if (refreshCallback) refreshCallback();
}

/**
 * Open the channel matrix tab
 */
export function openChannelMatrixTab() {
    // Check if already open
    if (state.ui.openTabs.includes(MATRIX_TAB_ID)) {
        actions.setActiveTab(MATRIX_TAB_ID);
        refreshTabs();
        return;
    }
    
    // Add to open tabs via actions
    actions.openTab(MATRIX_TAB_ID);
    refreshTabs();
    
    logger.info('ChannelMatrix', 'Tab', 'Opened channel matrix view');
}

/**
 * Get all sources (things that can be read from)
 * Returns: Main, Buffers, Textures, Inputs
 */
export function getChannelSources() {
    const sources = [];
    
    // Get all code elements that have channels (Main and Buffers)
    state.project.code.forEach(codeEl => {
        if (codeEl.channel !== undefined) {
            sources.push({ 
                id: codeEl.id, 
                label: codeEl.label, 
                channel: codeEl.channel, 
                type: codeEl.type 
            });
        }
    });
    
    // Media (textures, videos, audio)
    state.project.media.forEach(m => {
        if (m.channel !== undefined) {
            sources.push({ 
                id: m.id, 
                label: m.label, 
                channel: m.channel, 
                type: m.type 
            });
        }
    });
    
    // Inputs (keyboard, webcam, mic)
    state.project.inputs.forEach(inp => {
        if (inp.channel !== undefined) {
            sources.push({ 
                id: inp.id, 
                label: inp.label, 
                channel: inp.channel, 
                type: inp.type 
            });
        }
    });
    
    return sources;
}

/**
 * Get all receivers (passes that can read channels)
 * Returns: Main, Buffers (code elements with channels, excluding Common)
 */
export function getChannelReceivers() {
    const receivers = [];
    
    // Get all code elements that have channels (Main and Buffers can receive)
    // Common doesn't receive - it's just shared code
    state.project.code.forEach(codeEl => {
        if (codeEl.channel !== undefined) {
            receivers.push({ id: codeEl.id, label: codeEl.label });
        }
    });
    
    return receivers;
}

/**
 * Get channel settings for a specific receiver+source pair
 */
export function getChannelSettings(receiverId, sourceId) {
    if (!state.shader.channelMatrix) {
        actions.clearChannelMatrix();
    }
    const key = `${receiverId}:${sourceId}`;
    return state.shader.channelMatrix[key] || { useDefault: true };
}

/**
 * Set channel settings for a specific receiver+source pair
 */
export function setChannelSettings(receiverId, sourceId, settings) {
    const key = `${receiverId}:${sourceId}`;
    actions.setChannelMatrixSettings(key, settings);
    logger.debug('ChannelMatrix', 'Settings', `${receiverId} <- ${sourceId}: ${JSON.stringify(settings)}`);
    
    // Notify renderer to refresh sampler settings
    events.emit(EVENTS.RENDER_CHANNEL_CHANGED, { receiverId, sourceId, settings });
}

/**
 * Create the channel matrix content
 */
export function createChannelMatrixContent() {
    const container = document.createElement('div');
    container.className = 'v2-channel-matrix-content';
    
    // Header
    const header = document.createElement('div');
    header.className = 'v2-matrix-header';
    header.innerHTML = `
        <div class="v2-matrix-title">
            <span class="v2-matrix-icon">🔗</span>
            <span>Channel Matrix</span>
        </div>
        <div class="v2-matrix-subtitle">Configure per-pass input settings. Each cell defines how a receiver reads from a source.</div>
    `;
    container.appendChild(header);
    
    // Get sources and receivers
    const sources = getChannelSources();
    const receivers = getChannelReceivers();
    
    if (sources.length === 0 || receivers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'v2-matrix-empty';
        empty.textContent = 'No channels to configure. Add buffers or media to see the matrix.';
        container.appendChild(empty);
        return container;
    }
    
    // Create matrix grid
    const matrix = document.createElement('div');
    matrix.className = 'v2-matrix-grid';
    
    // Set grid columns: source label + one column per receiver
    matrix.style.gridTemplateColumns = `140px repeat(${receivers.length}, 1fr)`;
    
    // Header row: empty cell + receiver labels
    const cornerCell = document.createElement('div');
    cornerCell.className = 'v2-matrix-cell v2-matrix-corner';
    cornerCell.innerHTML = `<span class="v2-matrix-arrow">Sources ↓ / Receivers →</span>`;
    matrix.appendChild(cornerCell);
    
    receivers.forEach(receiver => {
        const headerCell = document.createElement('div');
        headerCell.className = 'v2-matrix-cell v2-matrix-header-cell';
        headerCell.innerHTML = `<span class="v2-matrix-receiver-label">${receiver.label}</span>`;
        matrix.appendChild(headerCell);
    });
    
    // Data rows: source label + cells for each receiver
    sources.forEach(source => {
        // Source label cell
        const sourceCell = document.createElement('div');
        sourceCell.className = 'v2-matrix-cell v2-matrix-source-cell';
        sourceCell.innerHTML = `
            <span class="v2-matrix-source-channel">iCh${source.channel}</span>
            <span class="v2-matrix-source-label">${source.label}</span>
        `;
        matrix.appendChild(sourceCell);
        
        // Cells for each receiver
        receivers.forEach(receiver => {
            const cell = createMatrixCell(receiver, source);
            matrix.appendChild(cell);
        });
    });
    
    container.appendChild(matrix);
    
    // Legend
    const legend = document.createElement('div');
    legend.className = 'v2-matrix-legend';
    legend.innerHTML = `
        <div class="v2-matrix-legend-title">Per-Receiver Settings (via WebGL2 Samplers)</div>
        <div class="v2-matrix-legend-item"><strong>Default:</strong> Use source's default settings</div>
        <div class="v2-matrix-legend-item"><strong>Filter:</strong> Mipmap (trilinear), Linear (bilinear), Nearest (pixelated)</div>
        <div class="v2-matrix-legend-item"><strong>Wrap:</strong> Repeat (tile), Clamp (edge pixels), Mirror (flip at edges)</div>
        <div class="v2-matrix-legend-note">Note: V-Flip and Anisotropic are source-only settings (not per-receiver)</div>
    `;
    container.appendChild(legend);
    
    return container;
}

/**
 * Create a single matrix cell (receiver × source intersection)
 */
function createMatrixCell(receiver, source) {
    const cell = document.createElement('div');
    cell.className = 'v2-matrix-cell v2-matrix-data-cell';
    cell.dataset.receiver = receiver.id;
    cell.dataset.source = source.id;
    
    // Get current settings
    const settings = getChannelSettings(receiver.id, source.id);
    
    // Default checkbox
    const defaultRow = document.createElement('div');
    defaultRow.className = 'v2-matrix-default-row';
    
    const defaultLabel = document.createElement('label');
    defaultLabel.className = 'v2-matrix-default-label';
    
    const defaultCheck = document.createElement('input');
    defaultCheck.type = 'checkbox';
    defaultCheck.checked = settings.useDefault !== false;
    defaultCheck.addEventListener('change', () => {
        const newSettings = { ...getChannelSettings(receiver.id, source.id), useDefault: defaultCheck.checked };
        setChannelSettings(receiver.id, source.id, newSettings);
        updateCellOptionsVisibility(cell, defaultCheck.checked);
    });
    defaultLabel.appendChild(defaultCheck);
    defaultLabel.appendChild(document.createTextNode(' Default'));
    defaultRow.appendChild(defaultLabel);
    cell.appendChild(defaultRow);
    
    // Options container (hidden when default is checked)
    const options = document.createElement('div');
    options.className = 'v2-matrix-options';
    options.style.display = settings.useDefault !== false ? 'none' : 'block';
    
    // Filter select
    const filterRow = document.createElement('div');
    filterRow.className = 'v2-matrix-option-row';
    filterRow.innerHTML = `<span>Filter:</span>`;
    const filterSelect = document.createElement('select');
    filterSelect.className = 'v2-matrix-select';
    filterSelect.innerHTML = `
        <option value="mipmap" ${settings.filter === 'mipmap' || !settings.filter ? 'selected' : ''}>Mipmap</option>
        <option value="linear" ${settings.filter === 'linear' ? 'selected' : ''}>Linear</option>
        <option value="nearest" ${settings.filter === 'nearest' ? 'selected' : ''}>Nearest</option>
    `;
    filterSelect.addEventListener('change', () => {
        const newSettings = { ...getChannelSettings(receiver.id, source.id), filter: filterSelect.value };
        setChannelSettings(receiver.id, source.id, newSettings);
    });
    filterRow.appendChild(filterSelect);
    options.appendChild(filterRow);
    
    // Wrap select
    const wrapRow = document.createElement('div');
    wrapRow.className = 'v2-matrix-option-row';
    wrapRow.innerHTML = `<span>Wrap:</span>`;
    const wrapSelect = document.createElement('select');
    wrapSelect.className = 'v2-matrix-select';
    wrapSelect.innerHTML = `
        <option value="repeat" ${settings.wrap === 'repeat' || !settings.wrap ? 'selected' : ''}>Repeat</option>
        <option value="clamp" ${settings.wrap === 'clamp' ? 'selected' : ''}>Clamp</option>
        <option value="mirror" ${settings.wrap === 'mirror' ? 'selected' : ''}>Mirror</option>
    `;
    wrapSelect.addEventListener('change', () => {
        const newSettings = { ...getChannelSettings(receiver.id, source.id), wrap: wrapSelect.value };
        setChannelSettings(receiver.id, source.id, newSettings);
    });
    wrapRow.appendChild(wrapSelect);
    options.appendChild(wrapRow);
    
    cell.appendChild(options);
    
    return cell;
}

/**
 * Update visibility of options in a matrix cell
 */
function updateCellOptionsVisibility(cell, useDefault) {
    const options = cell.querySelector('.v2-matrix-options');
    if (options) {
        options.style.display = useDefault ? 'none' : 'block';
    }
}
