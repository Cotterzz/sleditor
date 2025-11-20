// ============================================================================
// AI Assist Edge Function - Secure API Proxy
// ============================================================================
// This function:
// 1. Authenticates the user
// 2. Retrieves their API key from the database
// 3. Forwards the request to the appropriate AI provider
// 4. Returns the raw response
//
// Client handles all prompt building and response parsing.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openRouterFreeModels = [
  'kwaipilot/kat-coder-pro:free',
  'qwen/qwen3-coder:free',
  'qwen/qwen-2.5-coder-32b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'openai/gpt-oss-20b:free',
  'google/gemini-2.0-flash-exp:free'
];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ========================================================================
    // 1. Initialize Supabase Client
    // ========================================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    const encryptionKey = Deno.env.get('API_KEY_ENCRYPTION_SECRET') || 'test_encryption_key_123';
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // ========================================================================
    // 2. Authenticate User
    // ========================================================================
    // Extract JWT token from Authorization header
    const token = authHeader.replace('Bearer ', '');
    
    // Use getUser with the JWT token directly
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - please log in' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Authenticated user:', user.email);

    // ========================================================================
    // 3. Parse Request Body
    // ========================================================================
    const requestBody = await req.json();
    const { provider, model, prompt } = requestBody;

    if (!provider || !prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: provider, prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📥 Request:', { provider, model: model || 'default', promptLength: prompt.length });

    // ========================================================================
    // 4. Get Provider Configuration
    // ========================================================================
    const { data: providerConfig, error: providerError } = await supabase
      .from('api_providers')
      .select('*')
      .eq('id', provider)
      .eq('is_active', true)
      .single();

    if (providerError || !providerConfig) {
      console.error('Provider error:', providerError);
      return new Response(
        JSON.stringify({ error: `Provider not found or inactive: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Provider config:', providerConfig.name);

    // ========================================================================
    // 5. Validate model constraints (OpenRouter Free Tier)
    // ========================================================================
    if (provider === 'openrouter_free') {
      if (!model) {
        return new Response(
          JSON.stringify({ error: 'Model is required when using OpenRouter Free Tier' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!openRouterFreeModels.includes(model)) {
        return new Response(
          JSON.stringify({ error: `Model ${model} is not part of the OpenRouter Free Tier list` }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========================================================================
    // 6. Get User's API Key
    // ========================================================================
    const { data: keyData, error: keyError } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', user.id)
      .eq('provider_id', provider)
      .eq('is_enabled', true)
      .single();

    if (keyError || !keyData) {
      console.error('API key error:', keyError);
      return new Response(
        JSON.stringify({ 
          error: `No API key configured for ${providerConfig.name}`,
          provider: provider,
          hint: 'Please add your API key in Settings > AI Assist'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: decryptedKey, error: decryptError } = await supabase
      .rpc('decrypt_api_key', { 
        encrypted_key: keyData.api_key_encrypted,
        encryption_key: encryptionKey
      });

    if (decryptError || !decryptedKey) {
      console.error('Decryption error:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ API key retrieved and decrypted');

    // ========================================================================
    // 6. Call AI Provider API
    // ========================================================================
    let apiResponse;
    
    if (provider === 'gemini') {
      // Gemini uses query param for auth
      const apiUrl = `${providerConfig.api_url}/${model || 'gemini-2.0-flash-exp'}:generateContent?key=${decryptedKey}`;
      
      apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });
      
    } else if (provider === 'groq' || provider === 'openrouter' || provider === 'openrouter_free') {
      const isOpenRouterProvider = provider === 'openrouter' || provider === 'openrouter_free';
      // OpenAI-compatible providers use Bearer auth
      apiResponse = await fetch(providerConfig.api_url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${decryptedKey}`,
          'Content-Type': 'application/json',
          // OpenRouter specific headers
          ...(isOpenRouterProvider && {
            'HTTP-Referer': 'https://sleditor.com',
            'X-Title': 'SLEditor AI Assist'
          })
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      
    } else if (provider === 'cohere') {
      // Cohere v1 Chat API format
      apiResponse = await fetch(providerConfig.api_url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${decryptedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'command-r-plus-08-2024', // Default to flagship model
          message: prompt, // Cohere uses 'message' string, not 'messages' array
          chat_history: [] // Required empty array for chat context
        })
      });
      
    } else {
      return new Response(
        JSON.stringify({ error: `Provider ${provider} not yet implemented` }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 7. Handle API Response
    // ========================================================================
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('API error:', apiResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `${providerConfig.name} API error: ${apiResponse.status}`,
          details: errorText
        }),
        { status: apiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await apiResponse.json();
    console.log('✅ AI response received');

    // ========================================================================
    // 8. Update Last Used Timestamp
    // ========================================================================
    await supabase
      .from('user_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('provider_id', provider);

    // ========================================================================
    // 9. Return Raw Response to Client
    // ========================================================================
    return new Response(
      JSON.stringify({
        success: true,
        provider: providerConfig.name,
        model: model || 'default',
        data: apiData
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

