// ============================================================================
// Shadertoy Import - Converts Shadertoy shaders to Sleditor format
// ============================================================================

import * as mediaLoader from './media-loader.js';

// ============================================================================
// Constants
// ============================================================================

// Map Shadertoy buffer outputs to names
const BUFFER_OUTPUT_MAP = {
    257: 'A', // Buffer A
    258: 'B', // Buffer B
    259: 'C', // Buffer C
    260: 'D'  // Buffer D
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a Shadertoy shader can be imported
 * Returns { canImport: boolean, reason: string, warnings: string[] }
 */
export function validateShader(shader) {
    const warnings = [];
    const errors = [];
    
    if (!shader || !shader.renderpass) {
        return { canImport: false, reason: 'Invalid shader structure', warnings: [] };
    }
    
    const passes = shader.renderpass || [];
    
    // Check for unsupported features
    for (const pass of passes) {
        const type = pass.type?.toLowerCase() || '';
        
        // CubeA buffer - not supported
        if (type === 'cubemap') {
            errors.push('CubeA buffer not supported');
        }
        
        // Check inputs for unsupported types
        for (const input of (pass.inputs || [])) {
            const inputType = input.type?.toLowerCase() || '';
            
            // Music stream (SoundCloud) - deprecated, use fallback audio
            if (inputType === 'musicstream') {
                warnings.push('MusicStream (SoundCloud) deprecated - will use fallback audio');
            }
            
            // Check if texture/video/audio/cubemap is mapped
            if (inputType === 'texture' || inputType === 'video' || inputType === 'cubemap' || inputType === 'music') {
                const mapping = findAssetMapping(input);
                if (!mapping) {
                    const assetPath = input.filepath || input.src || 'unknown';
                    errors.push(`Unmapped asset: ${assetPath}`);
                }
            }
        }
    }
    
    // Count channels needed
    const channelCount = countRequiredChannels(shader);
    if (channelCount > 16) {
        errors.push(`Too many channels required: ${channelCount} (max 16)`);
    } else if (channelCount > 8) {
        warnings.push(`High channel count: ${channelCount} channels (UI may be crowded)`);
    }
    
    // Add info about multi-buffer
    const bufferPasses = passes.filter(p => p.type?.toLowerCase() === 'buffer');
    if (bufferPasses.length > 0) {
        warnings.push(`Multi-buffer shader: ${bufferPasses.length} buffer pass(es)`);
    }
    
    // Add info about sound pass
    const soundPass = passes.find(p => p.type?.toLowerCase() === 'sound');
    if (soundPass) {
        warnings.push('Sound pass will be imported as GLSL audio');
    }
    
    // Deduplicate errors
    const uniqueErrors = [...new Set(errors)];
    const uniqueWarnings = [...new Set(warnings)];
    
    if (uniqueErrors.length > 0) {
        return { 
            canImport: false, 
            reason: uniqueErrors[0],
            allErrors: uniqueErrors,
            warnings: uniqueWarnings 
        };
    }
    
    return { canImport: true, reason: null, warnings: uniqueWarnings };
}

/**
 * Find the Sleditor asset mapping for a Shadertoy input
 */
function findAssetMapping(input) {
    const catalog = mediaLoader.getCatalog();
    if (!catalog || !catalog.shadertoy_mapping) return null;
    
    const filepath = input.filepath || input.src || '';
    const inputId = String(input.id || '');
    
    // Try to match by Shadertoy ID first (most reliable)
    if (inputId) {
        for (const mapping of catalog.shadertoy_mapping) {
            if (mapping.id === inputId) {
                return mapping;
            }
        }
    }
    
    // Try to match by exact filepath
    for (const mapping of catalog.shadertoy_mapping) {
        if (mapping.filepath === filepath) {
            return mapping;
        }
    }
    
    // Try to match by filename hash (the long hex part of Shadertoy paths)
    if (filepath) {
        const filenameMatch = filepath.match(/([a-f0-9]{64})\.(jpg|png|bin|ogv|webm)/i);
        if (filenameMatch) {
            const hash = filenameMatch[1];
            for (const mapping of catalog.shadertoy_mapping) {
                if (mapping.filepath?.includes(hash)) {
                    return mapping;
                }
            }
        }
    }
    
    return null;
}

/**
 * Count how many channels the shader needs
 */
function countRequiredChannels(shader) {
    const channelSignatures = new Set();
    
    for (const pass of (shader.renderpass || [])) {
        for (const input of (pass.inputs || [])) {
            // Create a signature for deduplication
            const sig = createChannelSignature(input);
            if (sig) {
                channelSignatures.add(sig);
            }
        }
    }
    
    // Add buffer passes as they need channels too
    const bufferPasses = (shader.renderpass || []).filter(p => p.type?.toLowerCase() === 'buffer');
    
    return channelSignatures.size + bufferPasses.length;
}

/**
 * Create a signature for channel deduplication
 */
function createChannelSignature(input) {
    const type = input.type?.toLowerCase() || '';
    if (!type || type === 'buffer' || type === 'keyboard') return null;
    
    const sampler = input.sampler || {};
    return JSON.stringify({
        type: type,
        src: input.filepath || input.src || input.id,
        filter: sampler.filter || 'linear',
        wrap: sampler.wrap || 'repeat',
        vflip: sampler.vflip || false
    });
}

// ============================================================================
// Import Conversion
// ============================================================================

/**
 * Convert a Shadertoy shader to Sleditor format
 * Returns a shader object compatible with loadDatabaseShader()
 */
export function convertShader(stShader) {
    const info = stShader.info || {};
    const passes = stShader.renderpass || [];
    
    // Find the Image pass
    const imagePass = passes.find(p => p.type?.toLowerCase() === 'image');
    if (!imagePass) {
        throw new Error('No Image pass found in shader');
    }
    
    // Find Common pass if present
    const commonPass = passes.find(p => p.type?.toLowerCase() === 'common');
    
    // Find Buffer passes
    const bufferPasses = passes.filter(p => p.type?.toLowerCase() === 'buffer');
    
    // Find Sound pass if present
    const soundPass = passes.find(p => p.type?.toLowerCase() === 'sound');
    
    // Build channel assignment map
    // This maps Shadertoy input references to Sleditor channel numbers
    const channelAssignment = buildChannelAssignment(stShader);
    
    // Build the shader code
    const code = {};
    
    // Main graphics code (Image pass) - use glsl_stoy format
    // Transform iChannel references
    code.glsl_stoy = transformPassCode(imagePass, channelAssignment);
    
    // Common code if present
    // Note: Common code is shared, so we can't transform iChannel references reliably
    // Most Common code doesn't have iChannel references anyway
    if (commonPass && commonPass.code) {
        code.common = commonPass.code;
        // Warn if Common has iChannel references (they won't be transformed)
        if (/iChannel\d/.test(commonPass.code)) {
            console.warn('[Shadertoy Import] Common code contains iChannel references - these may need manual adjustment');
        }
    }
    
    // Buffer pass code - stored with their channel tabName as key
    for (const bufferPass of bufferPasses) {
        const bufferLetter = getBufferLetter(bufferPass);
        const bufferChannelNum = channelAssignment.buffers[bufferLetter];
        if (bufferChannelNum !== undefined) {
            const tabName = `buffer_ch${bufferChannelNum}`;
            code[tabName] = transformPassCode(bufferPass, channelAssignment);
        }
    }
    
    // Sound pass code - convert to audio_glsl (also needs channel transformation)
    if (soundPass && soundPass.code) {
        code.audio_glsl = transformPassCode(soundPass, channelAssignment);
    }
    
    // Build channel configuration
    const channelConfig = buildChannelConfig(stShader, channelAssignment);
    if (channelConfig.channels.length > 0) {
        code['_channel_meta'] = JSON.stringify(channelConfig);
    }
    
    // Build code_types array
    const code_types = ['glsl_stoy'];
    if (commonPass) {
        code_types.push('common');
    }
    // Add buffer tabs
    for (const bufferPass of bufferPasses) {
        const bufferLetter = getBufferLetter(bufferPass);
        const bufferChannelNum = channelAssignment.buffers[bufferLetter];
        if (bufferChannelNum !== undefined) {
            code_types.push(`buffer_ch${bufferChannelNum}`);
        }
    }
    // Add audio_glsl if sound pass present
    if (soundPass) {
        code_types.push('audio_glsl');
    }
    
    // Build the Sleditor shader object
    const sleditorShader = {
        // Metadata
        title: info.name || 'Imported Shader',
        description: buildDescription(info),
        tags: info.tags || [],
        
        // Code
        code: code,
        code_types: code_types,
        
        // Settings
        license: 'default',
        visibility: 'private', // Default to private for imports
        
        // Mark as imported (for reference)
        imported_from: 'shadertoy',
        shadertoy_id: info.id || null
    };
    
    return sleditorShader;
}

/**
 * Get buffer letter (A, B, C, D) from pass
 */
function getBufferLetter(pass) {
    // Check outputs array for buffer ID
    if (pass.outputs && pass.outputs.length > 0) {
        const outputId = pass.outputs[0].id;
        if (BUFFER_OUTPUT_MAP[outputId]) {
            return BUFFER_OUTPUT_MAP[outputId];
        }
    }
    // Fallback to name parsing
    const name = (pass.name || '').toLowerCase();
    if (name.includes('buf a') || name === 'buffer a') return 'A';
    if (name.includes('buf b') || name === 'buffer b') return 'B';
    if (name.includes('buf c') || name === 'buffer c') return 'C';
    if (name.includes('buf d') || name === 'buffer d') return 'D';
    return 'A'; // Default
}

/**
 * Get a unique key for a pass (used for channel mapping)
 */
function getPassKey(pass) {
    const passType = pass.type?.toLowerCase() || '';
    // For buffer passes, use the output ID to distinguish A, B, C, D
    if (passType === 'buffer' && pass.outputs?.[0]?.id) {
        return `buffer_${pass.outputs[0].id}`;
    }
    // For other passes, use the type
    return passType;
}

/**
 * Build channel assignment map for the entire shader
 * Returns { buffers: { A: 1, B: 2, ... }, inputs: { sig: channelNum, ... }, passChannels: { passKey: { stChannel: sleditorChannel } } }
 */
function buildChannelAssignment(stShader) {
    const passes = stShader.renderpass || [];
    const bufferPasses = passes.filter(p => p.type?.toLowerCase() === 'buffer');
    
    let nextChannel = 1; // Channel 0 is main buffer (reserved)
    
    // Assign channels to buffers first
    const buffers = {};
    for (const bufferPass of bufferPasses) {
        const letter = getBufferLetter(bufferPass);
        if (!buffers[letter]) {
            buffers[letter] = nextChannel++;
        }
    }
    
    // Also map buffer output IDs to channel numbers for easy lookup
    const bufferIdToChannel = {};
    for (const bufferPass of bufferPasses) {
        const letter = getBufferLetter(bufferPass);
        const outputId = bufferPass.outputs?.[0]?.id;
        if (outputId && buffers[letter] !== undefined) {
            bufferIdToChannel[outputId] = buffers[letter];
        }
    }
    
    // Track unique inputs across all passes
    const inputs = {}; // signature -> channelNumber
    const passChannels = {}; // passKey -> { stChannel: sleditorChannel }
    
    for (const pass of passes) {
        const passKey = getPassKey(pass);
        passChannels[passKey] = {};
        
        for (const input of (pass.inputs || [])) {
            const stChannel = input.channel; // 0-3 (Shadertoy's local channel)
            const inputType = input.type?.toLowerCase() || '';
            
            if (inputType === 'buffer') {
                // Buffer reference - map to the assigned buffer channel using input.id
                const bufferId = input.id;
                if (bufferIdToChannel[bufferId] !== undefined) {
                    passChannels[passKey][stChannel] = bufferIdToChannel[bufferId];
                }
            } else if (inputType === 'keyboard') {
                const sig = 'keyboard';
                if (!inputs[sig]) {
                    inputs[sig] = nextChannel++;
                }
                passChannels[passKey][stChannel] = inputs[sig];
            } else if (inputType === 'webcam') {
                const sig = 'webcam';
                if (!inputs[sig]) {
                    inputs[sig] = nextChannel++;
                }
                passChannels[passKey][stChannel] = inputs[sig];
            } else if (inputType === 'mic' || inputType === 'microphone') {
                const sig = 'mic';
                if (!inputs[sig]) {
                    inputs[sig] = nextChannel++;
                }
                passChannels[passKey][stChannel] = inputs[sig];
            } else {
                // Media input - deduplicate by signature
                const sig = createChannelSignature(input);
                if (sig) {
                    if (!inputs[sig]) {
                        inputs[sig] = nextChannel++;
                    }
                    passChannels[passKey][stChannel] = inputs[sig];
                }
            }
        }
    }
    
    console.log('[Shadertoy Import] Channel assignment:', { buffers, bufferIdToChannel, passChannels });
    
    return { buffers, bufferIdToChannel, inputs, passChannels, nextChannel };
}

/**
 * Transform pass code with correct channel references
 */
function transformPassCode(pass, channelAssignment) {
    let code = pass.code || '';
    const passKey = getPassKey(pass);
    
    const channelMap = channelAssignment.passChannels[passKey] || {};
    
    console.log(`[Shadertoy Import] Transforming pass "${passKey}":`, channelMap);
    
    // If no mappings, return original code
    if (Object.keys(channelMap).length === 0) {
        return code;
    }
    
    // Replace iChannel references
    // Sort descending to avoid iChannel1 -> iChannel11 issues when replacing
    const entries = Object.entries(channelMap).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
    
    for (const [stChannel, sleditorChannel] of entries) {
        // Use a placeholder first to avoid double-replacement issues
        const placeholder = `__CHANNEL_${sleditorChannel}__`;
        const regex = new RegExp(`iChannel${stChannel}\\b`, 'g');
        code = code.replace(regex, placeholder);
    }
    
    // Now replace placeholders with actual channel numbers
    for (const [stChannel, sleditorChannel] of entries) {
        const placeholder = `__CHANNEL_${sleditorChannel}__`;
        code = code.replace(new RegExp(placeholder, 'g'), `iChannel${sleditorChannel}`);
    }
    
    return code;
}

/**
 * Build channel configuration from all passes
 */
function buildChannelConfig(stShader, channelAssignment) {
    const config = {
        selectedOutputChannel: 0,
        nextChannelNumber: channelAssignment.nextChannel,
        channels: []
    };
    
    const passes = stShader.renderpass || [];
    const processedSignatures = new Set();
    
    // Add buffer channels
    for (const [letter, channelNum] of Object.entries(channelAssignment.buffers)) {
        config.channels.push({
            number: channelNum,
            type: 'buffer',
            name: `Buffer ${letter} (ch${channelNum})`,
            tabName: `buffer_ch${channelNum}`,
            resolution: null // Will use canvas size
        });
    }
    
    // Add input channels from all passes
    for (const pass of passes) {
        for (const input of (pass.inputs || [])) {
            const inputType = input.type?.toLowerCase() || '';
            const sig = createChannelSignature(input);
            
            // Skip buffers (handled above) and already processed inputs
            if (inputType === 'buffer') continue;
            if (sig && processedSignatures.has(sig)) continue;
            if (sig) processedSignatures.add(sig);
            
            // Find the channel number from assignment
            const passKey = getPassKey(pass);
            const stChannel = input.channel;
            const channelNum = channelAssignment.passChannels[passKey]?.[stChannel];
            
            if (channelNum === undefined) continue;
            
            const sampler = input.sampler || {};
            const mapping = findAssetMapping(input);
            
            let channelData = {
                number: channelNum
            };
            
            if (inputType === 'texture') {
                channelData.type = 'image';
                channelData.tabName = `image_ch${channelNum}`;
                channelData.mediaId = mapping?.sleditorID || null;
                channelData.vflip = sampler.vflip === 'true' || sampler.vflip === true;
                channelData.wrap = sampler.wrap === 'clamp' ? 'clamp' : 'repeat';
                channelData.filter = sampler.filter === 'nearest' ? 'nearest' : 'linear';
            } else if (inputType === 'video') {
                channelData.type = 'video';
                channelData.tabName = `video_ch${channelNum}`;
                channelData.mediaId = mapping?.sleditorID || null;
                channelData.loop = true;
            } else if (inputType === 'music') {
                channelData.type = 'audio';
                channelData.tabName = `audio_ch${channelNum}`;
                channelData.mediaId = mapping?.sleditorID || 'audio5';
                channelData.audioMode = 'shadertoy';
            } else if (inputType === 'musicstream') {
                channelData.type = 'audio';
                channelData.tabName = `audio_ch${channelNum}`;
                channelData.mediaId = 'audio5'; // Fallback
                channelData.audioMode = 'shadertoy';
            } else if (inputType === 'cubemap') {
                channelData.type = 'cubemap';
                channelData.tabName = `cubemap_ch${channelNum}`;
                channelData.mediaId = mapping?.sleditorID || 'venice';
            } else if (inputType === 'keyboard') {
                channelData.type = 'keyboard';
                channelData.tabName = `keyboard_ch${channelNum}`;
            } else if (inputType === 'webcam') {
                channelData.type = 'webcam';
                channelData.tabName = `webcam_ch${channelNum}`;
            } else if (inputType === 'mic' || inputType === 'microphone') {
                channelData.type = 'mic';
                channelData.tabName = `mic_ch${channelNum}`;
                channelData.audioMode = 'shadertoy';
            } else {
                continue; // Unknown type
            }
            
            config.channels.push(channelData);
        }
    }
    
    return config;
}

/**
 * Build description from Shadertoy info
 */
function buildDescription(info) {
    let desc = info.description || '';
    
    // Add attribution
    if (info.username) {
        desc += `\n\n---\nImported from Shadertoy\nOriginal by: ${info.username}`;
    }
    if (info.id) {
        desc += `\nhttps://shadertoy.com/view/${info.id}`;
    }
    
    return desc.trim();
}

// ============================================================================
// Import Summary
// ============================================================================

/**
 * Generate import summary for display
 */
export function generateImportSummary(stShader, validation, sleditorShader = null) {
    const info = stShader.info || {};
    const summary = {
        title: info.name || 'Unknown',
        shadertoyId: info.id || 'N/A',
        author: info.username || 'Unknown',
        success: validation.canImport,
        errors: validation.allErrors || (validation.reason ? [validation.reason] : []),
        warnings: validation.warnings || [],
        details: []
    };
    
    // Add pass information
    const passes = stShader.renderpass || [];
    summary.details.push(`Render passes: ${passes.length}`);
    
    for (const pass of passes) {
        const type = pass.type || 'unknown';
        const inputCount = (pass.inputs || []).length;
        summary.details.push(`  - ${type}: ${inputCount} inputs`);
    }
    
    // Add channel count
    const channelCount = countRequiredChannels(stShader);
    summary.details.push(`Channels required: ${channelCount}`);
    
    if (sleditorShader) {
        summary.details.push(`Code types: ${sleditorShader.code_types.join(', ')}`);
    }
    
    return summary;
}

/**
 * Format summary for display in popup
 */
export function formatSummaryHTML(summary) {
    let html = `<div style="font-family: monospace; font-size: 13px;">`;
    
    // Header
    html += `<div style="margin-bottom: 12px;">`;
    html += `<strong style="font-size: 16px;">${escapeHtml(summary.title)}</strong><br>`;
    html += `<span style="color: #888;">by ${escapeHtml(summary.author)} • ${summary.shadertoyId}</span>`;
    html += `</div>`;
    
    // Status
    if (summary.success) {
        html += `<div style="color: #4ade80; margin-bottom: 12px;">✓ Import successful</div>`;
    } else {
        html += `<div style="color: #ef4444; margin-bottom: 12px;">✗ Import failed</div>`;
    }
    
    // Errors
    if (summary.errors.length > 0) {
        html += `<div style="margin-bottom: 12px;">`;
        html += `<strong style="color: #ef4444;">Errors:</strong><br>`;
        for (const err of summary.errors) {
            html += `<span style="color: #ef4444;">• ${escapeHtml(err)}</span><br>`;
        }
        html += `</div>`;
    }
    
    // Warnings
    if (summary.warnings.length > 0) {
        html += `<div style="margin-bottom: 12px;">`;
        html += `<strong style="color: #f59e0b;">Warnings:</strong><br>`;
        for (const warn of summary.warnings) {
            html += `<span style="color: #f59e0b;">• ${escapeHtml(warn)}</span><br>`;
        }
        html += `</div>`;
    }
    
    // Details
    if (summary.details.length > 0) {
        html += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;">`;
        html += `<strong>Details:</strong><br>`;
        for (const detail of summary.details) {
            html += `<span style="color: #888;">${escapeHtml(detail)}</span><br>`;
        }
        html += `</div>`;
    }
    
    html += `</div>`;
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Full Import Process
// ============================================================================

/**
 * Perform full import of a Shadertoy shader
 * Returns { success: boolean, shader: object, summary: object }
 */
export function importShader(stShader) {
    // Validate
    const validation = validateShader(stShader);
    
    if (!validation.canImport) {
        const summary = generateImportSummary(stShader, validation);
        return { success: false, shader: null, summary };
    }
    
    try {
        // Convert
        const sleditorShader = convertShader(stShader);
        
        const summary = generateImportSummary(stShader, validation, sleditorShader);
        return { success: true, shader: sleditorShader, summary };
        
    } catch (error) {
        const failedValidation = { 
            canImport: false, 
            reason: error.message, 
            warnings: validation.warnings 
        };
        const summary = generateImportSummary(stShader, failedValidation);
        return { success: false, shader: null, summary };
    }
}
