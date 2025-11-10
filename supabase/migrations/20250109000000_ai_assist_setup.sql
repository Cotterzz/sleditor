-- ============================================================================
-- AI Assist System - Database Schema
-- ============================================================================
-- This migration adds:
-- 1. User API keys storage (encrypted)
-- 2. User AI preferences
-- 3. API provider registry
-- 4. AI model registry
-- 5. Usage tracking (optional, for future analytics)
-- ============================================================================

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. API Providers Registry
-- ============================================================================
-- Central registry of supported AI providers
-- Can be updated without code deploy
CREATE TABLE IF NOT EXISTS api_providers (
    id TEXT PRIMARY KEY, -- 'groq', 'gemini', 'openrouter', etc.
    name TEXT NOT NULL,
    api_url TEXT NOT NULL,
    auth_type TEXT NOT NULL CHECK (auth_type IN ('bearer', 'query', 'header')),
    is_active BOOLEAN DEFAULT TRUE,
    has_free_tier BOOLEAN DEFAULT FALSE,
    docs_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial providers
INSERT INTO api_providers (id, name, api_url, auth_type, has_free_tier, docs_url) VALUES
    ('groq', 'Groq', 'https://api.groq.com/openai/v1/chat/completions', 'bearer', true, 'https://console.groq.com/docs'),
    ('gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/models', 'query', true, 'https://ai.google.dev/'),
    ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', 'bearer', true, 'https://openrouter.ai/docs'),
    ('cohere', 'Cohere', 'https://api.cohere.ai/v1/chat', 'bearer', true, 'https://docs.cohere.com/'),
    ('huggingface', 'HuggingFace', 'https://api-inference.huggingface.co/models', 'bearer', true, 'https://huggingface.co/docs')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. AI Models Registry
-- ============================================================================
-- Available models per provider
CREATE TABLE IF NOT EXISTS ai_models (
    id TEXT PRIMARY KEY, -- 'groq:llama-3.3-70b', 'gemini:gemini-2.0-flash'
    provider_id TEXT NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL, -- The actual model ID used in API calls
    display_name TEXT NOT NULL,
    description TEXT,
    context_window INT,
    max_tokens INT,
    is_recommended BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial models
INSERT INTO ai_models (id, provider_id, model_id, display_name, description, is_recommended, sort_order) VALUES
    -- Groq models
    ('groq:llama-3.3-70b', 'groq', 'llama-3.3-70b-versatile', 'Llama 3.3 70B', 'Recommended - Fast and smart', true, 1),
    ('groq:llama-3.1-8b', 'groq', 'llama-3.1-8b-instant', 'Llama 3.1 8B', 'Fastest response time', false, 2),
    ('groq:mixtral-8x7b', 'groq', 'mixtral-8x7b-32768', 'Mixtral 8x7B', 'Good for code generation', false, 3),
    ('groq:llama3-70b', 'groq', 'llama3-70b-8192', 'Llama 3 70B', 'Older but reliable', false, 4),
    
    -- Gemini models
    ('gemini:2.0-flash', 'gemini', 'gemini-2.0-flash-exp', 'Gemini 2.0 Flash', 'Latest Gemini model', true, 1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. User API Keys (Encrypted Storage)
-- ============================================================================
-- Stores user-provided API keys securely
CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
    
    -- Encrypted API key (using pgcrypto)
    -- Format: PGP encrypted with a master key stored in env vars
    api_key_encrypted TEXT NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_enabled BOOLEAN DEFAULT TRUE,
    
    -- Prevent duplicate keys per user/provider
    UNIQUE(user_id, provider_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider_id);

-- ============================================================================
-- 4. User AI Preferences
-- ============================================================================
-- User's default settings and shortcuts
CREATE TABLE IF NOT EXISTS user_ai_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Default model selection
    default_provider TEXT REFERENCES api_providers(id),
    default_model TEXT REFERENCES ai_models(id),
    
    -- Model shortcuts (#slai:1, #slai:2, etc.)
    -- Format: { "1": "groq:llama-3.3-70b", "2": "groq:llama-3.1-8b", "3": "gemini:2.0-flash" }
    model_shortcuts JSONB DEFAULT '{}'::jsonb,
    
    -- Other preferences
    auto_compile BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. User Profiles (Custom User Data)
-- ============================================================================
-- Extended user data beyond auth.users
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Display info
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    website TEXT,
    
    -- Settings
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    vim_mode BOOLEAN DEFAULT FALSE,
    
    -- Stats (for future use)
    total_shaders INT DEFAULT 0,
    total_views INT DEFAULT 0,
    total_likes INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_profile();

-- ============================================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- API Keys: Users can only access their own keys
CREATE POLICY "Users can view own API keys"
    ON user_api_keys FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
    ON user_api_keys FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
    ON user_api_keys FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
    ON user_api_keys FOR DELETE
    USING (auth.uid() = user_id);

-- AI Preferences: Users can only access their own preferences
CREATE POLICY "Users can view own preferences"
    ON user_ai_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
    ON user_ai_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON user_ai_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- User Profiles: Read-only for all, write-only for owner
CREATE POLICY "Profiles are viewable by everyone"
    ON user_profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- Providers and Models: Read-only for all authenticated users
ALTER TABLE api_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers are viewable by authenticated users"
    ON api_providers FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Models are viewable by authenticated users"
    ON ai_models FOR SELECT
    USING (auth.role() = 'authenticated');

-- ============================================================================
-- 7. Helper Functions
-- ============================================================================

-- Function to encrypt API key (called from client)
CREATE OR REPLACE FUNCTION encrypt_api_key(api_key TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(
        pgp_sym_encrypt(api_key, encryption_key),
        'base64'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt API key (used in Edge Function)
CREATE OR REPLACE FUNCTION decrypt_api_key(encrypted_key TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(
        decode(encrypted_key, 'base64'),
        encryption_key
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_models_recommended ON ai_models(is_recommended) WHERE is_recommended = true;
CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name ON user_profiles(display_name);

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMENT ON TABLE api_providers IS 'Registry of supported AI API providers';
COMMENT ON TABLE ai_models IS 'Available AI models per provider';
COMMENT ON TABLE user_api_keys IS 'User-provided API keys (encrypted)';
COMMENT ON TABLE user_ai_preferences IS 'User AI assist preferences and shortcuts';
COMMENT ON TABLE user_profiles IS 'Extended user profile data';

