-- ============================================================================
-- OpenRouter model catalog (free + paid tiers)
-- ============================================================================
INSERT INTO ai_models (id, provider_id, model_id, display_name, description, is_recommended, sort_order)
VALUES
    -- Free tier (SLEditor managed key)
    ('openrouter:kwaipilot/kat-coder-pro:free', 'openrouter', 'kwaipilot/kat-coder-pro:free', 'KAT-Coder-Pro V1 (Free)', 'Specialist coding assistant tuned for IDE-style completions.', true, 10),
    ('openrouter:qwen/qwen3-coder:free', 'openrouter', 'qwen/qwen3-coder:free', 'Qwen3 Coder 480B A35B (Free)', 'Massive code-focused model with Shap-E reasoning.', false, 11),
    ('openrouter:qwen/qwen-2.5-coder-32b-instruct:free', 'openrouter', 'qwen/qwen-2.5-coder-32b-instruct:free', 'Qwen2.5 Coder 32B (Free)', 'Balanced 32B coder for shaders and math.', false, 12),
    ('openrouter:meta-llama/llama-3.3-70b-instruct:free', 'openrouter', 'meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B Instruct (Free)', 'General purpose model with strong coding output.', false, 13),
    ('openrouter:mistralai/mistral-small-3.2-24b-instruct:free', 'openrouter', 'mistralai/mistral-small-3.2-24b-instruct:free', 'Mistral Small 3.2 24B (Free)', 'Compact instruction tuned model suited for quick edits.', false, 14),
    ('openrouter:deepseek/deepseek-chat-v3-0324:free', 'openrouter', 'deepseek/deepseek-chat-v3-0324:free', 'DeepSeek V3 0324 (Free)', 'Reasoning-forward DeepSeek variant with coding skills.', false, 15),

    -- Paid tier (user key required)
    ('openrouter:anthropic/claude-3.5-sonnet', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', 'Premium Claude model for long-form reasoning + code.', true, 20),
    ('openrouter:openai/gpt-4o-mini', 'openrouter', 'openai/gpt-4o-mini', 'GPT-4o mini', 'OpenAI GPT-4o mini via OpenRouter.', false, 21),
    ('openrouter:openai/gpt-4o', 'openrouter', 'openai/gpt-4o', 'GPT-4o', 'Full GPT-4o capability for high fidelity answers.', false, 22),
    ('openrouter:deepseek/deepseek-coder-v2', 'openrouter', 'deepseek/deepseek-coder-v2', 'DeepSeek Coder V2', 'Second generation DeepSeek coder tuned for tooling.', true, 23),
    ('openrouter:deepseek/deepseek-chat', 'openrouter', 'deepseek/deepseek-chat', 'DeepSeek V3 (Full)', 'Latest DeepSeek V3 flagship chat model.', false, 24),
    ('openrouter:mistralai/mistral-large-2411', 'openrouter', 'mistralai/mistral-large-2411', 'Mistral Large 24.11', 'Mistral’s top-tier large model for creative/code.', false, 25)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_recommended = EXCLUDED.is_recommended,
    updated_at = NOW();
-- ============================================================================

