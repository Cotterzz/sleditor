-- ============================================================================
-- Additional OpenRouter provider entry for free-tier model routing
-- ============================================================================
INSERT INTO api_providers (id, name, api_url, auth_type, has_free_tier, docs_url)
VALUES (
    'openrouter_free',
    'OpenRouter (Free Tier)',
    'https://openrouter.ai/api/v1/chat/completions',
    'bearer',
    true,
    'https://openrouter.ai/docs'
)
ON CONFLICT (id) DO NOTHING;
-- Optional: clarify existing row name
UPDATE api_providers
SET name = 'OpenRouter (Full Catalog)'
WHERE id = 'openrouter';
-- ============================================================================

