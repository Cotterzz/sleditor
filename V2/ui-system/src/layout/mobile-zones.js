/**
 * SLUI Mobile Zones
 * Split-view mobile layout management
 */

import { state, panels } from '../core/state.js';
import { t } from '../core/i18n.js';
import { emit, EVENTS } from '../core/events.js';
import { updateToolbarItem, updateAllToolbarItems } from './toolbar.js';

/**
 * Build mobile zones container
 * @returns {HTMLElement}
 */
export function buildMobileZones() {
    const container = document.createElement('div');
    container.className = 'sl-mobile-zones';
    container.id = 'sl-mobile-zones';
    
    const isLandscape = state.mobileOrientation === 'landscape';
    const emptyText = t('mobile.tapToLoad');
    
    // Zone 1 (top or left)
    const zone1 = document.createElement('div');
    zone1.className = `sl-mobile-zone sl-zone-${isLandscape ? 'left' : 'top'}`;
    zone1.dataset.zone = isLandscape ? 'left' : 'top';
    zone1.innerHTML = `<div class="sl-zone-content" id="sl-zone-1-content" data-empty-text="${emptyText}"></div>`;
    zone1.addEventListener('click', () => focusZone(isLandscape ? 'left' : 'top'));
    container.appendChild(zone1);
    
    // Divider
    const divider = document.createElement('div');
    divider.className = 'sl-zone-divider';
    divider.addEventListener('dblclick', toggleSingleZone);
    setupDividerDrag(divider);
    container.appendChild(divider);
    
    // Zone 2 (bottom or right)
    const zone2 = document.createElement('div');
    zone2.className = `sl-mobile-zone sl-zone-${isLandscape ? 'right' : 'bottom'}`;
    zone2.dataset.zone = isLandscape ? 'right' : 'bottom';
    zone2.innerHTML = `<div class="sl-zone-content" id="sl-zone-2-content" data-empty-text="${emptyText}"></div>`;
    zone2.addEventListener('click', () => focusZone(isLandscape ? 'right' : 'bottom'));
    container.appendChild(zone2);
    
    return container;
}

/**
 * Render mobile zones (update orientation)
 */
export function renderMobileZones() {
    const container = document.getElementById('sl-mobile-zones');
    if (!container) return;
    
    container.dataset.orientation = state.mobileOrientation;
}

/**
 * Render zone contents from state
 */
export function renderMobileZoneContentsFromState() {
    const isLandscape = state.mobileOrientation === 'landscape';
    const zone1Key = isLandscape ? 'left' : 'top';
    const zone2Key = isLandscape ? 'right' : 'bottom';
    const zones = [
        { key: zone1Key, num: 1 },
        { key: zone2Key, num: 2 }
    ];
    
    zones.forEach(({ key, num }) => {
        const panelId = state.mobileZones[key];
        const contentEl = document.getElementById(`sl-zone-${num}-content`);
        if (!contentEl) return;
        
        contentEl.innerHTML = '';
        
        if (panelId) {
            const panel = panels.get(panelId);
            if (panel && panel.createContent) {
                const header = document.createElement('div');
                header.className = 'sl-zone-header';
                header.innerHTML = `
                    <span class="sl-zone-icon">${panel.icon}</span>
                    <span class="sl-zone-title">${t(`panels.${panelId}.title`) || panel.title}</span>
                    <button class="sl-zone-close" data-panel="${panelId}">×</button>
                `;
                contentEl.appendChild(header);
                
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'sl-zone-body';
                contentWrapper.appendChild(panel.createContent());
                contentEl.appendChild(contentWrapper);
                
                header.querySelector('.sl-zone-close').addEventListener('click', () => {
                    closePanelInZone(panelId);
                });
            }
        }
    });
}

/**
 * Focus a zone
 * @param {string} zone - Zone key
 */
export function focusZone(zone) {
    state.mobileZones.focused = zone;
    
    document.querySelectorAll('.sl-mobile-zone').forEach(el => {
        el.classList.toggle('focused', el.dataset.zone === zone);
    });
}

/**
 * Open a panel in a zone
 * @param {string} panelId - Panel ID
 * @param {string} zone - Optional target zone
 */
export function openPanelInZone(panelId, zone) {
    const isLandscape = state.mobileOrientation === 'landscape';
    const zone1Key = isLandscape ? 'left' : 'top';
    const zone2Key = isLandscape ? 'right' : 'bottom';
    
    const currentZone = state.mobileZones[zone1Key] === panelId ? zone1Key :
                       state.mobileZones[zone2Key] === panelId ? zone2Key : null;
    
    let targetZone = zone;
    
    if (!targetZone) {
        if (!state.mobileZones[zone1Key] && state.mobileZones[zone2Key]) {
            targetZone = zone1Key;
        } else if (!state.mobileZones[zone2Key] && state.mobileZones[zone1Key]) {
            targetZone = zone2Key;
        } else {
            targetZone = state.mobileZones.focused || zone1Key;
        }
    }
    
    // Toggle behavior
    if (currentZone === targetZone) {
        closePanelInZone(panelId);
        return;
    }
    
    // Remove from old zone
    if (currentZone) {
        state.mobileZones[currentZone] = null;
        const oldZoneNum = currentZone === zone1Key ? 1 : 2;
        const oldContentEl = document.getElementById(`sl-zone-${oldZoneNum}-content`);
        if (oldContentEl) oldContentEl.innerHTML = '';
    }
    
    // Open in target zone
    state.mobileZones[targetZone] = panelId;
    
    const zoneNum = targetZone === zone1Key ? 1 : 2;
    const contentEl = document.getElementById(`sl-zone-${zoneNum}-content`);
    
    if (contentEl) {
        const panel = panels.get(panelId);
        if (panel && panel.createContent) {
            contentEl.innerHTML = '';
            const header = document.createElement('div');
            header.className = 'sl-zone-header';
            header.innerHTML = `
                <span class="sl-zone-icon">${panel.icon}</span>
                <span class="sl-zone-title">${t(`panels.${panelId}.title`) || panel.title}</span>
                <button class="sl-zone-close" data-panel="${panelId}">×</button>
            `;
            contentEl.appendChild(header);
            
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'sl-zone-body';
            contentWrapper.appendChild(panel.createContent());
            contentEl.appendChild(contentWrapper);
            
            header.querySelector('.sl-zone-close').addEventListener('click', () => {
                closePanelInZone(panelId);
            });
        }
    }
    
    updateAllToolbarItems();
    updateToolbarItem(panelId, true, true, false);
    focusZone(targetZone);
    
    // Auto-focus empty zone for next addition
    const otherZone = targetZone === zone1Key ? zone2Key : zone1Key;
    if (!state.mobileZones[otherZone]) {
        state.mobileZones.focused = otherZone;
    }
    
    emit(EVENTS.PANEL_OPEN, { id: panelId, zone: targetZone });
}

/**
 * Close a panel in a zone
 * @param {string} panelId - Panel ID
 */
export function closePanelInZone(panelId) {
    const isLandscape = state.mobileOrientation === 'landscape';
    const zone1Key = isLandscape ? 'left' : 'top';
    const zone2Key = isLandscape ? 'right' : 'bottom';
    
    let zoneNum = null;
    let closedZone = null;
    
    if (state.mobileZones[zone1Key] === panelId) {
        state.mobileZones[zone1Key] = null;
        zoneNum = 1;
        closedZone = zone1Key;
    }
    if (state.mobileZones[zone2Key] === panelId) {
        state.mobileZones[zone2Key] = null;
        zoneNum = 2;
        closedZone = zone2Key;
    }
    
    if (zoneNum) {
        const contentEl = document.getElementById(`sl-zone-${zoneNum}-content`);
        if (contentEl) contentEl.innerHTML = '';
        
        state.mobileZones.focused = closedZone;
    }
    
    updateAllToolbarItems();
    emit(EVENTS.PANEL_CLOSE, { id: panelId });
}

/**
 * Toggle single zone mode
 */
function toggleSingleZone() {
    const container = document.getElementById('sl-mobile-zones');
    if (container) {
        container.classList.toggle('single-zone');
    }
}

/**
 * Setup divider drag
 */
function setupDividerDrag(divider) {
    let isDragging = false;
    let startPos, startSizes;
    
    const beginDrag = (pos) => {
        isDragging = true;
        const isLandscape = state.mobileOrientation === 'landscape';
        startPos = isLandscape ? pos.x : pos.y;
        const zones = document.querySelectorAll('.sl-mobile-zone');
        startSizes = Array.from(zones).map(z => isLandscape ? z.offsetWidth : z.offsetHeight);
    };
    
    const moveDrag = (pos) => {
        if (!isDragging) return;
        const isLandscape = state.mobileOrientation === 'landscape';
        const currentPos = isLandscape ? pos.x : pos.y;
        const delta = currentPos - startPos;
        
        const zones = document.querySelectorAll('.sl-mobile-zone');
        if (zones.length < 2) return;
        
        const total = startSizes[0] + startSizes[1];
        const newSize1 = Math.max(100, Math.min(total - 100, startSizes[0] + delta));
        const newSize2 = total - newSize1;
        
        zones[0].style.flex = `0 0 ${newSize1}px`;
        zones[1].style.flex = `0 0 ${newSize2}px`;
    };
    
    const endDrag = () => {
        isDragging = false;
    };
    
    divider.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        beginDrag({ x: touch.clientX, y: touch.clientY });
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        moveDrag({ x: touch.clientX, y: touch.clientY });
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        endDrag();
    });
    
    divider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        beginDrag({ x: e.clientX, y: e.clientY });
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        moveDrag({ x: e.clientX, y: e.clientY });
    });
    
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        endDrag();
    });
}
