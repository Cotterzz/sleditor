/**
 * SLUI Device Detection
 * Handles mobile/desktop detection and orientation
 */

import { state, resetLayoutState } from './state.js';
import { emit, EVENTS } from './events.js';

/**
 * Check if device is mobile
 * @returns {boolean}
 */
export function isMobileDevice() {
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const touchNarrow = (navigator.maxTouchPoints || 0) > 0 && window.innerWidth < 900;
    return uaMobile || touchNarrow;
}

/**
 * Detect current orientation
 * @returns {'portrait' | 'landscape'}
 */
export function detectOrientation() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

/**
 * Update device mode based on detection or force mode
 * @param {Function} renderMobileZones - Callback to render mobile zones
 * @param {Function} renderMobileZoneContentsFromState - Callback to render zone contents
 * @param {Function} updateAllToolbarItems - Callback to update toolbar
 */
export function updateDeviceMode(renderMobileZones, renderMobileZoneContentsFromState, updateAllToolbarItems) {
    const prevMode = state.deviceMode;
    const prevOrientation = state.mobileOrientation;
    
    // Check for manual override
    if (state.forceMode) {
        state.deviceMode = state.forceMode;
    } else {
        state.deviceMode = isMobileDevice() ? 'mobile' : 'desktop';
    }
    
    state.mobileOrientation = detectOrientation();
    
    const app = document.querySelector('.sl-app');
    if (app) {
        app.dataset.mode = state.deviceMode;
        app.dataset.orientation = state.mobileOrientation;
        
        // Update toolbar position for mobile
        if (state.deviceMode === 'mobile') {
            app.dataset.toolbarPosition = state.mobileOrientation === 'portrait' ? 'top' : 'left';
        }
    }
    
    // Rebuild mobile zones if needed
    if (state.deviceMode === 'mobile') {
        // If orientation changed, remap existing zone assignments
        if (prevMode === 'mobile' && prevOrientation && prevOrientation !== state.mobileOrientation) {
            remapMobileZones(prevOrientation, state.mobileOrientation);
        }
        if (renderMobileZones) renderMobileZones();
        if (renderMobileZoneContentsFromState) renderMobileZoneContentsFromState();
        if (updateAllToolbarItems) updateAllToolbarItems();
    }
    
    if (prevMode !== state.deviceMode) {
        emit(EVENTS.DEVICE_MODE_CHANGE, { 
            mode: state.deviceMode, 
            orientation: state.mobileOrientation 
        });
    }
}

/**
 * Force a specific device mode
 * @param {'desktop' | 'mobile' | null} mode - Mode to force, null for auto
 * @param {Function} buildApp - Callback to rebuild app
 * @param {Function} reRegisterPanels - Callback to re-register panels
 */
export function setForceMode(mode, buildApp, reRegisterPanels) {
    state.forceMode = mode;
    localStorage.setItem('sl-force-mode', mode || '');
    
    resetLayoutState();
    
    updateDeviceMode();
    
    if (buildApp) buildApp();
    if (reRegisterPanels) reRegisterPanels();
}

/**
 * Remap mobile zones when orientation changes
 */
function remapMobileZones(prevOrientation, newOrientation) {
    const oldZones = { ...state.mobileZones };
    const portraitKeys = { primary: 'top', secondary: 'bottom' };
    const landscapeKeys = { primary: 'left', secondary: 'right' };
    
    const from = prevOrientation === 'portrait' ? portraitKeys : landscapeKeys;
    const to = newOrientation === 'portrait' ? portraitKeys : landscapeKeys;
    
    const primaryPanel = oldZones[from.primary];
    const secondaryPanel = oldZones[from.secondary];
    
    state.mobileZones[to.primary] = primaryPanel || null;
    state.mobileZones[to.secondary] = secondaryPanel || null;
    state.mobileZones.focused = to.primary;
}

/**
 * Setup resize/orientation listeners
 * @param {Function} updateCallback - Callback when device mode changes
 */
export function setupDeviceListeners(updateCallback) {
    window.addEventListener('resize', updateCallback);
    window.addEventListener('orientationchange', updateCallback);
}
