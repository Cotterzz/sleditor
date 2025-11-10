// ============================================================================
// AI Assist Settings UI
// ============================================================================

import { state } from './core.js';
import * as backend from './backend.js';

// Available providers and models (hardcoded for now, will be dynamic later)
const PROVIDERS = {
    'groq': {
        name: 'Groq',
        description: 'Fast AI inference (Free tier available)',
        hasFree: true,
        models: [
            { id: 'groq:llama-3.3-70b', name: 'Llama 3.3 70B', modelId: 'llama-3.3-70b-versatile', recommended: true },
            { id: 'groq:llama-3.1-8b', name: 'Llama 3.1 8B (Fast)', modelId: 'llama-3.1-8b-instant' },
            { id: 'groq:mixtral-8x7b', name: 'Mixtral 8x7B', modelId: 'mixtral-8x7b-32768' },
            { id: 'groq:llama3-70b', name: 'Llama 3 70B', modelId: 'llama3-70b-8192' }
        ]
    },
    'gemini': {
        name: 'Google Gemini',
        description: 'Google\'s AI (Free tier available)',
        hasFree: true,
        models: [
            { id: 'gemini:2.0-flash', name: 'Gemini 2.0 Flash', modelId: 'gemini-2.0-flash-exp', recommended: true }
        ]
    },
    'cohere': {
        name: 'Cohere',
        description: 'Command models (Free tier available)',
        hasFree: true,
        models: [
            { id: 'cohere:command-r-plus-08-2024', name: 'Command R+ 08-2024', modelId: 'command-r-plus-08-2024', recommended: true },
            { id: 'cohere:command-r-08-2024', name: 'Command R 08-2024', modelId: 'command-r-08-2024' },
            { id: 'cohere:command-r7b-12-2024', name: 'Command R7B 12-2024 (Small)', modelId: 'command-r7b-12-2024' },
            { id: 'cohere:command-a-03-2025', name: 'Command A 03-2025 (Flagship)', modelId: 'command-a-03-2025' }
        ]
    }
};

let modal = null;
let userKeys = {}; // Stores which providers user has keys for
let shortcuts = {}; // Stores shortcut mappings
let defaultModel = null;

/**
 * Initialize AI Assist Settings
 */
export async function init() {
    createModal();
    
    // Bind button
    const aiBtn = document.getElementById('aiAssistBtn');
    if (aiBtn) {
        aiBtn.addEventListener('click', showSettings);
    }
    
    // Load user's current keys and preferences
    await loadUserSettings();
}

/**
 * Create the settings modal
 */
function createModal() {
    modal = document.createElement('div');
    modal.id = 'aiAssistModal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        align-items: center;
        justify-content: center;
    `;
    
    modal.innerHTML = `
        <div id="aiAssistContent" style="
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 30px;
            max-width: 700px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        ">
            <h2 style="margin: 0 0 20px 0; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                AI Assist Settings
                <button id="aiAssistClose" class="uiBtn" style="padding: 4px 12px;">✕</button>
            </h2>
            
            <div id="aiAssistBody"></div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button
    document.getElementById('aiAssistClose').addEventListener('click', hideSettings);
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideSettings();
        }
    });
}

/**
 * Show settings modal
 */
export async function showSettings() {
    if (!state.currentUser) {
        alert('Please log in to configure AI assist');
        return;
    }
    
    await loadUserSettings();
    renderSettings();
    modal.style.display = 'flex';
}

/**
 * Hide settings modal
 */
function hideSettings() {
    modal.style.display = 'none';
}

/**
 * Load user's API keys and preferences from DB
 */
async function loadUserSettings() {
    const supabase = backend.getSupabaseClient();
    if (!supabase || !state.currentUser) return;
    
    try {
        // Load API keys
        const { data: keys, error: keyError } = await supabase
            .from('user_api_keys')
            .select('provider_id, is_enabled')
            .eq('user_id', state.currentUser.id);
        
        if (!keyError && keys) {
            userKeys = {};
            keys.forEach(key => {
                userKeys[key.provider_id] = key.is_enabled;
            });
        }
        
        // Load preferences
        const { data: prefs, error: prefError } = await supabase
            .from('user_ai_preferences')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .single();
        
        if (!prefError && prefs) {
            defaultModel = prefs.default_model;
            shortcuts = prefs.model_shortcuts || {};
        }
        
    } catch (error) {
        console.error('Failed to load AI settings:', error);
    }
}

/**
 * Render settings UI
 */
function renderSettings() {
    const body = document.getElementById('aiAssistBody');
    if (!body) return;
    
    // Build shortcuts list (auto-assign numbers 0-9, then letters a-z)
    const allModels = [];
    Object.keys(PROVIDERS).forEach(providerId => {
        const provider = PROVIDERS[providerId];
        provider.models.forEach(model => {
            allModels.push({
                ...model,
                provider: providerId,
                providerName: provider.name,
                enabled: userKeys[providerId] === true
            });
        });
    });
    
    // Auto-assign shortcuts
    const shortcutChars = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
    allModels.forEach((model, index) => {
        if (index < shortcutChars.length) {
            model.shortcut = shortcutChars[index];
        }
    });
    
    let html = `
        <!-- Default Model -->
        <div style="margin-bottom: 30px; padding: 20px; background: var(--bg-secondary); border-radius: 6px;">
            <h3 style="margin: 0 0 15px 0; color: var(--text-primary); font-size: 16px;">Default Model</h3>
            <p style="margin: 0 0 15px 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">
                <strong>To use, enter <code>#slai</code> and your prompt in the code and hit recompile/F5</strong><br>
                Eg: <code>#slai draw a yellow circle</code><br><br>
                You do not need to explain the code context or tab mode.<br><br>
                <strong>Select your default API & model here:</strong>
            </p>
            <select id="defaultModelSelect" class="uiInput" style="width: 100%; padding: 8px;">
                <option value="">-- Select Default --</option>
    `;
    
    allModels.forEach(model => {
        const selected = defaultModel === model.id ? 'selected' : '';
        const disabled = !model.enabled ? 'disabled' : '';
        html += `<option value="${model.id}" ${selected} ${disabled}>${model.shortcut}: ${model.providerName} - ${model.name}${!model.enabled ? ' (No API key)' : ''}</option>`;
    });
    
    html += `
            </select>
            <button id="saveDefaultBtn" class="uiBtn" style="margin-top: 10px;">Save Default</button>
        </div>
        
        <!-- Available Models & Shortcuts -->
        <div style="margin-bottom: 30px;">
            <h3 style="margin: 0 0 15px 0; color: var(--text-primary); font-size: 16px;">Available Models & Shortcuts</h3>
            <p style="margin: 0 0 15px 0; color: var(--text-secondary); font-size: 13px;">
                Use <code>#slai</code> + shortcut (e.g., <code>#slai0</code>, <code>#slaia</code>) to call specific models
            </p>
            <div style="font-family: monospace; font-size: 13px;">
    `;
    
    allModels.forEach(model => {
        const statusColor = model.enabled ? 'var(--success-color)' : 'var(--text-secondary)';
        const statusText = model.enabled ? 'enabled' : 'no key';
        const recommendedBadge = model.recommended ? ' <strong style="color: var(--accent-color);">recommended</strong>' : '';
        
        html += `
            <div style="padding: 8px 15px; margin-bottom: 4px; background: var(--bg-secondary); border-radius: 4px; display: flex; align-items: center; gap: 15px;">
                <span style="color: var(--text-primary); font-weight: bold; min-width: 60px;">#slai${model.shortcut}</span>
                <span style="color: var(--text-secondary); min-width: 100px;">${model.providerName}</span>
                <span style="color: var(--text-primary); flex: 1;">${model.name}</span>
                <span style="color: ${statusColor}; min-width: 60px;">${statusText}</span>
                ${recommendedBadge ? `<span style="min-width: 110px;">${recommendedBadge}</span>` : '<span style="min-width: 110px;"></span>'}
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
        
        <!-- API Key Management -->
        <div>
            <h3 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 16px;">API Key Management</h3>
            <p style="margin: 0 0 15px 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">
                <strong>To obtain API keys, visit:</strong><br>
                Groq: <a href="https://console.groq.com/keys" target="_blank" rel="noopener" style="color: var(--accent-color);">https://console.groq.com/keys</a><br>
                Gemini: <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener" style="color: var(--accent-color);">https://aistudio.google.com/api-keys</a><br>
                Cohere: <a href="https://dashboard.cohere.com/api-keys" target="_blank" rel="noopener" style="color: var(--accent-color);">https://dashboard.cohere.com/api-keys</a>
            </p>
    `;
    
    Object.keys(PROVIDERS).forEach(providerId => {
        const provider = PROVIDERS[providerId];
        const hasKey = userKeys[providerId] === true;
        const statusColor = hasKey ? 'var(--success-color)' : 'var(--text-secondary)';
        const statusText = hasKey ? '✓ API Key Configured' : 'No API Key';
        const buttonText = hasKey ? 'Update Key' : 'Add Key';
        
        html += `
            <div style="padding: 20px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 15px; border: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${provider.name}</h4>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">${provider.description}</p>
                    </div>
                    <span style="color: ${statusColor}; font-size: 13px; font-weight: 600;">${statusText}</span>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <input type="password" 
                           id="apiKey_${providerId}" 
                           class="uiInput" 
                           placeholder="Enter API key"
                           style="flex: 1; padding: 8px;">
                    <button class="uiBtn addKeyBtn" data-provider="${providerId}">${buttonText}</button>
                    ${hasKey ? `<button class="uiBtn deleteKeyBtn" data-provider="${providerId}" style="background: var(--error-color);">Remove</button>` : ''}
                </div>
                <div id="keyStatus_${providerId}" style="margin-top: 10px; font-size: 13px;"></div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    body.innerHTML = html;
    
    // Bind events
    document.getElementById('saveDefaultBtn')?.addEventListener('click', saveDefaultModel);
    
    document.querySelectorAll('.addKeyBtn').forEach(btn => {
        btn.addEventListener('click', () => addOrUpdateKey(btn.dataset.provider));
    });
    
    document.querySelectorAll('.deleteKeyBtn').forEach(btn => {
        btn.addEventListener('click', () => deleteKey(btn.dataset.provider));
    });
}

/**
 * Save default model preference
 */
async function saveDefaultModel() {
    const select = document.getElementById('defaultModelSelect');
    const modelId = select.value;
    
    if (!modelId) {
        alert('Please select a default model');
        return;
    }
    
    const supabase = backend.getSupabaseClient();
    if (!supabase || !state.currentUser) return;
    
    try {
        const { error } = await supabase
            .from('user_ai_preferences')
            .upsert({
                user_id: state.currentUser.id,
                default_model: modelId,
                updated_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        defaultModel = modelId;
        alert('✓ Default model saved!');
        
    } catch (error) {
        console.error('Failed to save default model:', error);
        alert('Failed to save default model: ' + error.message);
    }
}

/**
 * Add or update API key
 */
async function addOrUpdateKey(providerId) {
    const input = document.getElementById(`apiKey_${providerId}`);
    const statusEl = document.getElementById(`keyStatus_${providerId}`);
    const apiKey = input.value.trim();
    
    if (!apiKey) {
        statusEl.textContent = '❌ Please enter an API key';
        statusEl.style.color = 'var(--error-color)';
        return;
    }
    
    const supabase = backend.getSupabaseClient();
    if (!supabase || !state.currentUser) return;
    
    statusEl.textContent = '⏳ Saving...';
    statusEl.style.color = 'var(--text-secondary)';
    
    try {
        // Encrypt the key
        const { data: encryptedKey, error: encryptError } = await supabase
            .rpc('encrypt_api_key', { 
                api_key: apiKey,
                encryption_key: 'test_encryption_key_123'
            });
        
        if (encryptError) throw encryptError;
        
        // Save to database
        const { error: saveError } = await supabase
            .from('user_api_keys')
            .upsert({
                user_id: state.currentUser.id,
                provider_id: providerId,
                api_key_encrypted: encryptedKey,
                is_enabled: true,
                created_at: new Date().toISOString()
            });
        
        if (saveError) throw saveError;
        
        statusEl.textContent = '✓ API key saved successfully!';
        statusEl.style.color = 'var(--success-color)';
        input.value = '';
        
        // Reload settings
        setTimeout(async () => {
            await loadUserSettings();
            renderSettings();
        }, 1000);
        
    } catch (error) {
        console.error('Failed to save API key:', error);
        statusEl.textContent = '❌ Failed to save: ' + error.message;
        statusEl.style.color = 'var(--error-color)';
    }
}

/**
 * Delete API key
 */
async function deleteKey(providerId) {
    if (!confirm(`Remove API key for ${PROVIDERS[providerId].name}?`)) {
        return;
    }
    
    const supabase = backend.getSupabaseClient();
    if (!supabase || !state.currentUser) return;
    
    const statusEl = document.getElementById(`keyStatus_${providerId}`);
    statusEl.textContent = '⏳ Removing...';
    statusEl.style.color = 'var(--text-secondary)';
    
    try {
        const { error } = await supabase
            .from('user_api_keys')
            .delete()
            .eq('user_id', state.currentUser.id)
            .eq('provider_id', providerId);
        
        if (error) throw error;
        
        statusEl.textContent = '✓ API key removed';
        statusEl.style.color = 'var(--success-color)';
        
        // Reload settings
        setTimeout(async () => {
            await loadUserSettings();
            renderSettings();
        }, 1000);
        
    } catch (error) {
        console.error('Failed to delete API key:', error);
        statusEl.textContent = '❌ Failed to remove: ' + error.message;
        statusEl.style.color = 'var(--error-color)';
    }
}

// Export for external access
window.aiAssistSettings = {
    showSettings,
    loadUserSettings
};

