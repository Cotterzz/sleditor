-- ============================================================================
-- OpenRouter catalog updates (free-tier + premium additions)
-- ============================================================================

-- Ensure all OpenRouter Free Tier models exist (new provider)
INSERT INTO ai_models (id, provider_id, model_id, display_name, description, is_recommended, sort_order)
VALUES
    ('openrouter_free:kwaipilot/kat-coder-pro:free', 'openrouter_free', 'kwaipilot/kat-coder-pro:free', 'KAT-Coder-Pro V1 (Free)', 'Fast iterative coding assistant tuned for IDE-style workflows.', FALSE, 10),
    ('openrouter_free:qwen/qwen3-coder:free', 'openrouter_free', 'qwen/qwen3-coder:free', 'Qwen3 Coder 480B A35B (Free)', 'Large 480B parameter coder with strong reasoning and analysis.', FALSE, 11),
    ('openrouter_free:qwen/qwen-2.5-coder-32b-instruct:free', 'openrouter_free', 'qwen/qwen-2.5-coder-32b-instruct:free', 'Qwen2.5 Coder 32B (Free)', 'Well-balanced open-source code model with 32B parameters.', FALSE, 12),
    ('openrouter_free:meta-llama/llama-3.3-70b-instruct:free', 'openrouter_free', 'meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B Instruct (Free)', 'General purpose assistant with strong coding capability.', FALSE, 13),
    ('openrouter_free:mistralai/mistral-small-3.2-24b-instruct:free', 'openrouter_free', 'mistralai/mistral-small-3.2-24b-instruct:free', 'Mistral Small 3.2 24B (Free)', 'Lightweight 24B model for quick iteration.', FALSE, 14),
    ('openrouter_free:deepseek/deepseek-chat-v3-0324:free', 'openrouter_free', 'deepseek/deepseek-chat-v3-0324:free', 'DeepSeek V3 0324 (Free)', 'Open DeepSeek variant tuned for reasoning-heavy coding tasks.', FALSE, 15),
    ('openrouter_free:openai/gpt-oss-20b:free', 'openrouter_free', 'openai/gpt-oss-20b:free', 'GPT-OSS 20B (Free)', 'Open-source GPT-style model ideal for code and analysis.', TRUE, 16),
    ('openrouter_free:google/gemma-3n-e4b-it:free', 'openrouter_free', 'google/gemma-3n-e4b-it:free', 'Gemma 3n 4B Instruct (Free)', 'Compact multilingual assistant from Google Gemma.', FALSE, 17),
    ('openrouter_free:google/gemini-2.0-flash-exp:free', 'openrouter_free', 'google/gemini-2.0-flash-exp', 'Gemini 2.0 Flash Experimental (Free)', 'Multimodal-capable Gemini variant accessible via OpenRouter.', FALSE, 18)
ON CONFLICT (id) DO UPDATE
SET display_name     = EXCLUDED.display_name,
    description      = EXCLUDED.description,
    sort_order       = EXCLUDED.sort_order,
    is_recommended   = EXCLUDED.is_recommended,
    updated_at       = NOW();

-- Insert premium OpenRouter models (new slugs)
INSERT INTO ai_models (id, provider_id, model_id, display_name, description, is_recommended, sort_order)
VALUES
    ('openrouter:anthropic/claude-sonnet-4.5', 'openrouter', 'anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', 'Latest Anthropic flagship coder with state-of-the-art reasoning.', TRUE, 30),
    ('openrouter:openai/gpt-5.1-codex', 'openrouter', 'openai/gpt-5.1-codex', 'GPT-5.1 Codex', 'Next-gen OpenAI Codex optimized for complex software generation.', FALSE, 31),
    ('openrouter:openai/gpt-oss-120b', 'openrouter', 'openai/gpt-oss-120b', 'GPT-OSS 120B', '120B parameter open-source aligned model with broad coding skills.', FALSE, 32),
    ('openrouter:x-ai/grok-code-fast-1', 'openrouter', 'x-ai/grok-code-fast-1', 'Grok Code Fast 1', 'High-speed X.AI coder focused on rapid iteration.', FALSE, 33),
    ('openrouter:openai/gpt-oss-20b:free', 'openrouter', 'openai/gpt-oss-20b:free', 'GPT-OSS 20B (Free)', 'Open-source GPT-style coder accessible via OpenRouter.', TRUE, 26),
    ('openrouter:google/gemini-2.0-flash-exp', 'openrouter', 'google/gemini-2.0-flash-exp', 'Gemini 2.0 Flash Experimental', 'Multimodal assistant API-compatible with OpenAI style requests.', FALSE, 27)
ON CONFLICT (id) DO UPDATE
SET display_name     = EXCLUDED.display_name,
    description      = EXCLUDED.description,
    sort_order       = EXCLUDED.sort_order,
    is_recommended   = EXCLUDED.is_recommended,
    updated_at       = NOW();

-- Adjust recommendation flags
UPDATE ai_models
SET is_recommended = FALSE
WHERE id IN (
    'openrouter:anthropic/claude-3.5-sonnet',
    'openrouter:kwaipilot/kat-coder-pro:free',
    'openrouter:qwen/qwen3-coder:free',
    'openrouter:qwen/qwen-2.5-coder-32b-instruct:free',
    'openrouter:meta-llama/llama-3.3-70b-instruct:free',
    'openrouter:mistralai/mistral-small-3.2-24b-instruct:free',
    'openrouter:deepseek/deepseek-chat-v3-0324:free',
    'openrouter_free:kwaipilot/kat-coder-pro:free',
    'openrouter_free:qwen/qwen3-coder:free',
    'openrouter_free:qwen/qwen-2.5-coder-32b-instruct:free',
    'openrouter_free:meta-llama/llama-3.3-70b-instruct:free',
    'openrouter_free:mistralai/mistral-small-3.2-24b-instruct:free',
    'openrouter_free:deepseek/deepseek-chat-v3-0324:free',
    'openrouter_free:google/gemma-3n-e4b-it:free',
    'openrouter_free:google/gemini-2.0-flash-exp:free'
);

UPDATE ai_models
SET is_recommended = TRUE
WHERE id IN (
    'openrouter_free:openai/gpt-oss-20b:free',
    'openrouter:anthropic/claude-sonnet-4.5'
);

-- Keep metadata fresh
UPDATE ai_models
SET updated_at = NOW()
WHERE id IN (
    'openrouter:anthropic/claude-3.5-sonnet',
    'openrouter:anthropic/claude-sonnet-4.5',
    'openrouter:openai/gpt-5.1-codex',
    'openrouter:openai/gpt-oss-120b',
    'openrouter:x-ai/grok-code-fast-1'
);

