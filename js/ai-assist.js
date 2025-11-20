// ============================================================================
// AI Assist Module - Edge Function Integration
// ============================================================================

import { state } from './core.js';
import * as backend from './backend.js';
import { MODEL_MAP as MODEL_REGISTRY, getModelKeyByDbId } from './ai-models.js';

// Edge Function URL - update this after deployment!
const EDGE_FUNCTION_URL = 'https://vnsdnskppjwktvksxxvp.supabase.co/functions/v1/ai-assist';

const MODELS = MODEL_REGISTRY;

/**
 * Check if code contains an AI prompt
 * @param {string} code - Shader code to check
 * @returns {object|null} - { model, prompt, lineNumber, shortcut } or null
 */
export function detectAIPrompt(code) {
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for #slai with optional shortcut (e.g., #slai, #slai0, #slaia)
        if (line.startsWith('#slai')) {
            const restOfLine = line.substring(5); // Remove '#slai'
            let shortcut = null;
            let prompt = restOfLine.trim();
            
            // Check if first character is a shortcut (0-9 or a-z)
            if (restOfLine.length > 0 && /^[0-9a-z]/.test(restOfLine[0])) {
                shortcut = restOfLine[0];
                prompt = restOfLine.substring(1).trim();
            }
            
            return {
                model: null, // Will be resolved from shortcut or default
                prompt,
                lineNumber: i,
                shortcut
            };
        }
        
        // Check for legacy model-specific prefixes (backwards compatibility)
        for (const modelKey in MODELS) {
            const prefix = `#${modelKey}`;
            if (line.startsWith(prefix)) {
                const prompt = line.substring(prefix.length).trim();
                return {
                    model: modelKey,
                    prompt,
                    lineNumber: i,
                    shortcut: null
                };
            }
        }
    }
    
    return null;
}

/**
 * Build the prompt for AI API
 * @param {string} code - Original shader code
 * @param {string} userRequest - User's request
 * @param {string} currentTab - Current tab/mode (e.g., 'glsl_stoy', 'glsl_regular')
 * @returns {string} - Formatted prompt
 */
function buildPrompt(code, userRequest, currentTab) {
    // Build context based on GLSL mode
    let context = '';
    
    if (currentTab === 'glsl_fragment') {
        // Raw GLSL mode - full control
        context = `You are helping with a raw WebGL 2.0 (GLSL ES 3.00) fragment shader.

The shader has access to these uniforms:
- uniform float u_time; // Time in seconds
- uniform vec2 u_resolution; // Canvas size in pixels
- uniform vec2 u_mouse; // Mouse position (normalized 0-1)
- uniform int u_frame; // Frame counter
- uniform float u_customFloat0-14; // Custom float uniforms (default 0.5, range 0-1)
- uniform int u_customInt0-2; // Custom int uniforms
- uniform int u_customBool0-1; // Custom bool uniforms (0 or 1)

The user writes the complete shader including:
- #version 300 es
- precision declarations
- uniform declarations
- in/out variables
- void main() { ... }

Output must be written to the out variable (usually fragColor).`;
        
    } else if (currentTab === 'glsl_regular') {
        // Regular mode - boilerplate provided
        context = `You are helping with a Regular GLSL fragment shader (boilerplated).

The shader has access to these uniforms:
- uniform float u_time;
- uniform vec2 u_resolution;
- uniform vec2 u_mouse; // Normalized 0-1
- uniform int u_frame;
- uniform float u_customFloat0-14;
- uniform int u_customInt0-2;
- uniform int u_customBool0-1;

Boilerplate is provided automatically (#version, precision, uniforms, out fragColor).
The user only writes:
void main() {
    // shader code here
    fragColor = vec4(...);
}`;
        
    } else if (currentTab === 'glsl_stoy') {
        // Shadertoy compatibility mode
        context = `You are helping with a Shadertoy-compatible GLSL fragment shader.

The shader uses Shadertoy uniform names:
- uniform float iTime; // Time in seconds
- uniform vec2 iResolution; // Canvas size in pixels
- uniform vec4 iMouse; // Mouse position (pixels: xy=current, zw=click)
- uniform int iFrame; // Frame counter

Boilerplate is provided automatically.
The user only writes:
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    // shader code here
    fragColor = vec4(...);
}`;
        
    } else if (currentTab === 'glsl_golf') {
        // Code golf mode - ultra compact
        context = `You are helping with a code-golfed GLSL fragment shader.

Available macros:
- M = void main()
- T = u_time
- R = u_resolution
- U = gl_FragCoord
- F = float, I = int
- V2 = vec2, V3 = vec3, V4 = vec4
- O = fragColor (output)

Boilerplate is provided. User writes compact code like:
M{V2 u=U.xy/R;O=V4(u,sin(T),1.);}

Keep responses short and use the macros!`;
        
    } else {
        // Fallback
        context = `You are helping with a GLSL fragment shader.`;
    }

    return `${context}

Current shader code:
\`\`\`glsl
${code}
\`\`\`

User request: ${userRequest}

Please provide an updated shader that addresses the user's request. Format your response as follows:
1. Put any explanatory text as GLSL comments (using // or /* */)
2. Provide the complete updated shader code
3. Keep the same function structure and style as the original
4. Make sure the code is valid GLSL that will compile

Respond with the complete shader code including any explanatory comments.`;
}

/**
 * Call AI via Edge Function
 * @param {string} provider - Provider ID ('groq', 'gemini', etc.)
 * @param {string} modelId - Model identifier
 * @param {string} prompt - The formatted prompt
 * @returns {Promise<string>} - The AI's response text
 */
async function callAIEdgeFunction(provider, modelId, prompt) {
    // Get user's session token from backend
    const supabase = backend.getSupabaseClient();
    if (!supabase) {
        throw new Error('Supabase client not initialized');
    }
    
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
        throw new Error('Not logged in');
    }
    
    console.log('🔐 Calling Edge Function with auth token:', session.data.session.access_token.substring(0, 20) + '...');

    const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            provider,
            model: modelId,
            prompt
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Edge Function error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Unknown error from Edge Function');
    }

    // Extract text from response based on provider format
    if (provider === 'gemini') {
        if (data.data.candidates && data.data.candidates.length > 0) {
            return data.data.candidates[0].content.parts[0].text;
        }
    } else if (provider === 'groq' || provider === 'openrouter' || provider === 'openrouter_free') {
        if (data.data.choices && data.data.choices.length > 0) {
            return data.data.choices[0].message.content;
        }
    } else if (provider === 'cohere') {
        // Cohere v1 response format
        if (data.data.text) {
            return data.data.text;
        }
        // Fallback for other possible formats
        if (data.data.message && data.data.message.content) {
            return data.data.message.content[0]?.text || data.data.message.content;
        }
    }
    
    throw new Error('Unexpected response format from AI provider');
}

/**
 * Format the AI response for insertion into editor
 * @param {string} response - Raw API response
 * @param {string} userRequest - User's request
 * @returns {string} - Formatted code
 */
function formatResponse(response, userRequest) {
    // Extract code from markdown code blocks if present
    let extractedCode = response;
    const codeBlockRegex = /```(?:glsl)?\n([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
        // Use the last code block (usually the complete version)
        extractedCode = matches[matches.length - 1][1].trim();
        
        // Extract any explanatory text before the code block
        const beforeCode = response.substring(0, matches[0].index).trim();
        if (beforeCode) {
            // Add explanatory text as comments at the top
            const commentedExplanation = beforeCode
                .split('\n')
                .map(line => '// ' + line)
                .join('\n');
            
            return `// AI request: ${userRequest}
${commentedExplanation}

${extractedCode}`;
        }
    }
    
    // If no code blocks, check if response looks like code or text
    const looksLikeCode = extractedCode.includes('void mainImage') || 
                          extractedCode.includes('void main') ||
                          extractedCode.includes('fragColor') ||
                          extractedCode.includes('vec') ||
                          extractedCode.includes('gl_FragCoord') ||
                          extractedCode.match(/[MO]\s*[={]/); // Golf mode patterns (M{ or O=)
    
    if (looksLikeCode) {
        return `// AI request: ${userRequest}
// Response:

${extractedCode}`;
    } else {
        // Response is mainly text, add as comments
        const commentedResponse = extractedCode
            .split('\n')
            .map(line => '// ' + line)
            .join('\n');
        
        return `// AI request: ${userRequest}

${commentedResponse}`;
    }
}

/**
 * Show AI request modal
 * @param {string} message - Message to display
 * @param {boolean} isError - Whether this is an error message
 */
function showAIModal(message, isError = false) {
    let modal = document.getElementById('aiRequestModal');
    
    if (!modal) {
        // Create modal if it doesn't exist
        modal = document.createElement('div');
        modal.id = 'aiRequestModal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-primary);
            border: 2px solid var(--border-color);
            border-radius: 8px;
            padding: 30px;
            min-width: 400px;
            max-width: 600px;
            z-index: 10001;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;
        
        modal.innerHTML = `
            <div id="aiModalContent" style="text-align: center; color: var(--text-primary);">
                <div id="aiModalMessage" style="font-size: 16px; margin-bottom: 20px;"></div>
                <div id="aiModalSpinner" style="font-size: 32px; margin: 20px 0;">⏳</div>
                <button id="aiModalClose" style="display: none; padding: 8px 20px; font-size: 14px; cursor: pointer; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    Close
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close button handler
        document.getElementById('aiModalClose').addEventListener('click', hideAIModal);
    }
    
    const messageEl = document.getElementById('aiModalMessage');
    const spinnerEl = document.getElementById('aiModalSpinner');
    const closeBtn = document.getElementById('aiModalClose');
    
    messageEl.innerHTML = message;
    messageEl.style.color = isError ? '#ff4444' : 'var(--text-primary)';
    
    if (isError) {
        spinnerEl.style.display = 'none';
        closeBtn.style.display = 'inline-block';
    } else {
        spinnerEl.style.display = 'block';
        closeBtn.style.display = 'none';
    }
    
    modal.style.display = 'block';
}

/**
 * Hide AI request modal
 */
function hideAIModal() {
    const modal = document.getElementById('aiRequestModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Resolve shortcut to model key
 * @param {string} shortcut - Single character shortcut (0-9, a-z)
 * @returns {Promise<string|null>} - Model key or null
 */
async function resolveShortcutToModel(shortcut) {
    // Build shortcut map (same logic as settings UI)
    const shortcutChars = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
    const allModels = [];
    
    // Collect all models
    Object.keys(MODELS).forEach(modelKey => {
        allModels.push(modelKey);
    });
    
    // Find index of shortcut
    const index = shortcutChars.indexOf(shortcut);
    if (index >= 0 && index < allModels.length) {
        return allModels[index];
    }
    
    return null;
}

/**
 * Get default model from user preferences
 * @returns {Promise<string|null>} - Model key or null
 */
async function getDefaultModel() {
    const supabase = backend.getSupabaseClient();
    if (!supabase || !state.currentUser) return null;
    
    try {
        const { data, error } = await supabase
            .from('user_ai_preferences')
            .select('default_model')
            .eq('user_id', state.currentUser.id)
            .single();
        
        if (error || !data) return null;
        
        const dbModelId = data.default_model;
        if (!dbModelId) return null;
        
        return getModelKeyByDbId(dbModelId);
    } catch (error) {
        console.error('Failed to get default model:', error);
        return null;
    }
}

/**
 * Process AI request
 * @param {string} code - Current shader code
 * @param {string} editorId - Which editor to update (e.g., 'glsl_stoy')
 * @returns {Promise<boolean>} - Success status
 */
export async function processAIRequest(code, editorId) {
    // Detect AI prompt
    const aiPrompt = detectAIPrompt(code);
    
    if (!aiPrompt) {
        return false; // No AI prompt found, continue normal compilation
    }
    
    // Check if user is logged in
    if (!state.currentUser) {
        showAIModal('You must be logged in to use AI assist.', true);
        return true; // Prevent compilation
    }
    
    // Resolve model from shortcut or use specified model
    let modelKey = aiPrompt.model;
    
    if (!modelKey && aiPrompt.shortcut) {
        // Resolve shortcut to model
        modelKey = await resolveShortcutToModel(aiPrompt.shortcut);
        if (!modelKey) {
            showAIModal(`Unknown shortcut: #slai${aiPrompt.shortcut}`, true);
            return true;
        }
    } else if (!modelKey) {
        // No shortcut and no model - use default
        modelKey = await getDefaultModel();
        if (!modelKey) {
            // No default set or default is invalid - fallback to first model (slai0)
            const firstModelKey = Object.keys(MODELS)[0];
            if (firstModelKey) {
                console.warn('No default model set, falling back to:', firstModelKey);
                modelKey = firstModelKey;
            } else {
                showAIModal('No models available. Please configure in AI settings (⚡ button).', true);
                return true;
            }
        }
    }
    
    // Get model configuration
    const modelConfig = MODELS[modelKey];
    if (!modelConfig) {
        showAIModal(`Unknown model: ${modelKey}`, true);
        return true;
    }
    
    // Store original code for restoration on failure
    const originalCode = code;
    
    try {
        // Show loading modal with provider and model name
        const providerName = modelConfig.provider.charAt(0).toUpperCase() + modelConfig.provider.slice(1);
        showAIModal(`Asking ${providerName}...<br><small style="font-size: 0.8em; opacity: 0.8;">${modelConfig.name}</small>`);
        
        // Build prompt with mode-specific context
        const prompt = buildPrompt(code, aiPrompt.prompt, editorId);
        
        // Call Edge Function (handles all providers)
        const response = await callAIEdgeFunction(
            modelConfig.provider,
            modelConfig.modelId,
            prompt
        );
        
        // Format response (without commented original code)
        const formattedCode = formatResponse(response, aiPrompt.prompt);
        
        // Update editor using executeEdits to preserve undo history
        const editor = state.graphicsEditor;
        if (editor) {
            editor.executeEdits('ai-assist', [{
                range: editor.getModel().getFullModelRange(),
                text: formattedCode
            }]);
        }
        
        // Hide modal and show success
        hideAIModal();
        
        console.log(`✅ ${modelConfig.name} response received and inserted`);
        console.log('💡 Use Ctrl+Z to undo');
        
        // Auto-compile the new code after a short delay
        setTimeout(() => {
            console.log('🔄 Auto-compiling AI response...');
            if (window.reloadShader) {
                window.reloadShader();
            }
        }, 100);
        
        return true; // Return true to prevent the original compilation
        
    } catch (error) {
        console.error('❌ AI API error:', error);
        
        // Show error modal
        showAIModal(`Error: ${error.message}\n\nYour original code has been preserved.`, true);
        
        // Restore original code using executeEdits to preserve undo
        const editor = state.graphicsEditor;
        if (editor) {
            editor.executeEdits('ai-assist-error', [{
                range: editor.getModel().getFullModelRange(),
                text: originalCode
            }]);
        }
        
        return true; // Still return true to prevent compilation
    }
}

// Export for debugging
window.aiAssist = {
    detectAIPrompt,
    processAIRequest,
    showAIModal,
    hideAIModal
};

