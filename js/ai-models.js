// ============================================================================
// Shared AI model catalog used by AI Assist UI + runtime
// ============================================================================

export const AI_MODEL_PROVIDERS = [
    {
        id: 'groq',
        name: 'Groq',
        description: 'Ultra-low latency inference powered by Groq LPU hardware.',
        docsUrl: 'https://console.groq.com/docs',
        apiKeyUrl: 'https://console.groq.com/keys',
        hasFreeTier: true,
        models: [
            {
                key: 'groq',
                displayName: 'Llama 3.3 70B (Recommended)',
                modelId: 'llama-3.3-70b-versatile',
                dbModelId: 'groq:llama-3.3-70b',
                requiresKey: true,
                recommended: true,
                tags: ['general', 'coding']
            },
            {
                key: 'groqf',
                displayName: 'Llama 3.1 8B (Fast)',
                modelId: 'llama-3.1-8b-instant',
                dbModelId: 'groq:llama-3.1-8b',
                requiresKey: true,
                tags: ['fast', 'general']
            }
        ]
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Google’s flagship multimodal models.',
        docsUrl: 'https://ai.google.dev/',
        apiKeyUrl: 'https://aistudio.google.com/app/apikey',
        hasFreeTier: true,
        models: [
            {
                key: 'gemini',
                displayName: 'Gemini 2.0 Flash',
                modelId: 'gemini-2.0-flash-exp',
                dbModelId: 'gemini:2.0-flash',
                requiresKey: true,
                recommended: true,
                tags: ['general', 'vision']
            }
        ]
    },
    {
        id: 'cohere',
        name: 'Cohere',
        description: 'Command family tuned for enterprise tasks.',
        docsUrl: 'https://docs.cohere.com/',
        apiKeyUrl: 'https://dashboard.cohere.com/api-keys',
        hasFreeTier: true,
        models: [
            {
                key: 'cohere',
                displayName: 'Command R+ 08-2024',
                modelId: 'command-r-plus-08-2024',
                dbModelId: 'cohere:command-r-plus-08-2024',
                requiresKey: true,
                recommended: true,
                tags: ['general', 'reasoning']
            },
            {
                key: 'coheref',
                displayName: 'Command R 08-2024',
                modelId: 'command-r-08-2024',
                dbModelId: 'cohere:command-r-08-2024',
                requiresKey: true,
                tags: ['fast', 'general']
            },
            {
                key: 'coheresm',
                displayName: 'Command R7B 12-2024 (Small)',
                modelId: 'command-r7b-12-2024',
                dbModelId: 'cohere:command-r7b-12-2024',
                requiresKey: true,
                tags: ['lightweight']
            },
            {
                key: 'coherea',
                displayName: 'Command A 03-2025 (Flagship)',
                modelId: 'command-a-03-2025',
                dbModelId: 'cohere:command-a-03-2025',
                requiresKey: true,
                tags: ['advanced', 'reasoning']
            }
        ]
    },
    {
        id: 'openrouter_free',
        name: 'OpenRouter Free Tier',
        description: 'Curated list of OpenRouter models that expose a free SKU. Users supply their own OpenRouter key, and only these models will be called.',
        docsUrl: 'https://openrouter.ai/docs',
        apiKeyUrl: 'https://openrouter.ai/keys',
        hasFreeTier: true,
        models: [
            {
                key: 'or_free_kat',
                displayName: 'KAT-Coder-Pro V1 (Free)',
                modelId: 'kwaipilot/kat-coder-pro:free',
                dbModelId: 'openrouter_free:kwaipilot/kat-coder-pro:free',
                requiresKey: true,
                tags: ['coding', 'fast']
            },
            {
                key: 'or_free_qwen480',
                displayName: 'Qwen3 Coder 480B A35B (Free)',
                modelId: 'qwen/qwen3-coder:free',
                dbModelId: 'openrouter_free:qwen/qwen3-coder:free',
                requiresKey: true,
                tags: ['coding', 'heavy']
            },
            {
                key: 'or_free_qwen32',
                displayName: 'Qwen2.5 Coder 32B (Free)',
                modelId: 'qwen/qwen-2.5-coder-32b-instruct:free',
                dbModelId: 'openrouter_free:qwen/qwen-2.5-coder-32b-instruct:free',
                requiresKey: true,
                tags: ['coding']
            },
            {
                key: 'or_free_llama33',
                displayName: 'Llama 3.3 70B Instruct (Free)',
                modelId: 'meta-llama/llama-3.3-70b-instruct:free',
                dbModelId: 'openrouter_free:meta-llama/llama-3.3-70b-instruct:free',
                requiresKey: true,
                tags: ['general', 'coding']
            },
            {
                key: 'or_free_mistral_small',
                displayName: 'Mistral Small 3.2 24B (Free)',
                modelId: 'mistralai/mistral-small-3.2-24b-instruct:free',
                dbModelId: 'openrouter_free:mistralai/mistral-small-3.2-24b-instruct:free',
                requiresKey: true,
                tags: ['general']
            },
            {
                key: 'or_free_deepseek_v3',
                displayName: 'DeepSeek V3 0324 (Free)',
                modelId: 'deepseek/deepseek-chat-v3-0324:free',
                dbModelId: 'openrouter_free:deepseek/deepseek-chat-v3-0324:free',
                requiresKey: true,
                tags: ['general', 'coding']
            },
            {
                key: 'or_free_gptoss',
                displayName: 'GPT-OSS 20B (Free)',
                modelId: 'openai/gpt-oss-20b:free',
                dbModelId: 'openrouter_free:openai/gpt-oss-20b:free',
                requiresKey: true,
                recommended: true,
                tags: ['coding', 'general']
            },
            {
                key: 'or_free_gemini_flash',
                displayName: 'Gemini 2.0 Flash Experimental (Free)',
                modelId: 'google/gemini-2.0-flash-exp:free',
                dbModelId: 'openrouter_free:google/gemini-2.0-flash-exp:free',
                requiresKey: true,
                tags: ['general', 'vision', 'coding']
            }
        ]
    },
    {
        id: 'openrouter',
        name: 'OpenRouter Full',
        description: 'Full OpenRouter catalog for coding/general tasks. Supply your paid or upgraded OpenRouter key to unlock everything.',
        docsUrl: 'https://openrouter.ai/docs',
        apiKeyUrl: 'https://openrouter.ai/keys',
        hasFreeTier: false,
        models: [
            // include the free-tier models as part of the full catalog for convenience
            {
                key: 'or_paid_kat',
                displayName: 'KAT-Coder-Pro V1 (Free Tier)',
                modelId: 'kwaipilot/kat-coder-pro:free',
                dbModelId: 'openrouter:kwaipilot/kat-coder-pro:free',
                requiresKey: true,
                tags: ['coding', 'fast']
            },
            {
                key: 'or_paid_qwen480',
                displayName: 'Qwen3 Coder 480B A35B (Free Tier)',
                modelId: 'qwen/qwen3-coder:free',
                dbModelId: 'openrouter:qwen/qwen3-coder:free',
                requiresKey: true,
                tags: ['coding', 'heavy']
            },
            {
                key: 'or_paid_qwen32',
                displayName: 'Qwen2.5 Coder 32B (Free Tier)',
                modelId: 'qwen/qwen-2.5-coder-32b-instruct:free',
                dbModelId: 'openrouter:qwen/qwen-2.5-coder-32b-instruct:free',
                requiresKey: true,
                tags: ['coding']
            },
            {
                key: 'or_paid_llama33',
                displayName: 'Llama 3.3 70B Instruct (Free Tier)',
                modelId: 'meta-llama/llama-3.3-70b-instruct:free',
                dbModelId: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
                requiresKey: true,
                tags: ['general', 'coding']
            },
            {
                key: 'or_paid_mistral_small',
                displayName: 'Mistral Small 3.2 24B (Free Tier)',
                modelId: 'mistralai/mistral-small-3.2-24b-instruct:free',
                dbModelId: 'openrouter:mistralai/mistral-small-3.2-24b-instruct:free',
                requiresKey: true,
                tags: ['general']
            },
            {
                key: 'or_paid_deepseek_v3_free',
                displayName: 'DeepSeek V3 0324 (Free Tier)',
                modelId: 'deepseek/deepseek-chat-v3-0324:free',
                dbModelId: 'openrouter:deepseek/deepseek-chat-v3-0324:free',
                requiresKey: true,
                tags: ['general', 'coding']
            },
            {
                key: 'or_paid_gptoss',
                displayName: 'GPT-OSS 20B (Free Tier)',
                modelId: 'openai/gpt-oss-20b:free',
                dbModelId: 'openrouter:openai/gpt-oss-20b:free',
                requiresKey: true,
                tags: ['coding', 'general']
            },
            {
                key: 'or_paid_gemini_flash',
                displayName: 'Gemini 2.0 Flash Experimental (Free Tier)',
                modelId: 'google/gemini-2.0-flash-exp:free',
                dbModelId: 'openrouter:google/gemini-2.0-flash-exp:free',
                requiresKey: true,
                tags: ['general', 'vision', 'coding']
            },
            // premium models
            {
                key: 'or_paid_claude',
                displayName: 'Claude 3.5 Sonnet',
                modelId: 'anthropic/claude-3.5-sonnet',
                dbModelId: 'openrouter:anthropic/claude-3.5-sonnet',
                requiresKey: true,
                tags: ['premium', 'reasoning', 'coding']
            },
            {
                key: 'or_paid_claude45',
                displayName: 'Claude Sonnet 4.5',
                modelId: 'anthropic/claude-sonnet-4.5',
                dbModelId: 'openrouter:anthropic/claude-sonnet-4.5',
                requiresKey: true,
                recommended: true,
                tags: ['premium', 'reasoning', 'coding']
            },
            {
                key: 'or_paid_gpt4o_mini',
                displayName: 'GPT-4o mini',
                modelId: 'openai/gpt-4o-mini',
                dbModelId: 'openrouter:openai/gpt-4o-mini',
                requiresKey: true,
                tags: ['premium', 'general']
            },
            {
                key: 'or_paid_gpt4o',
                displayName: 'GPT-4o',
                modelId: 'openai/gpt-4o',
                dbModelId: 'openrouter:openai/gpt-4o',
                requiresKey: true,
                tags: ['premium', 'general']
            },
            {
                key: 'or_paid_gpt51',
                displayName: 'GPT-5.1 Codex',
                modelId: 'openai/gpt-5.1-codex',
                dbModelId: 'openrouter:openai/gpt-5.1-codex',
                requiresKey: true,
                tags: ['premium', 'coding']
            },
            {
                key: 'or_paid_gptoss120',
                displayName: 'GPT-OSS 120B',
                modelId: 'openai/gpt-oss-120b',
                dbModelId: 'openrouter:openai/gpt-oss-120b',
                requiresKey: true,
                tags: ['premium', 'coding', 'general']
            },
            {
                key: 'or_paid_deepseek_coder',
                displayName: 'DeepSeek Coder V2',
                modelId: 'deepseek/deepseek-coder-v2',
                dbModelId: 'openrouter:deepseek/deepseek-coder-v2',
                requiresKey: true,
                recommended: true,
                tags: ['coding']
            },
            {
                key: 'or_paid_deepseek_v3',
                displayName: 'DeepSeek V3 (Full)',
                modelId: 'deepseek/deepseek-chat',
                dbModelId: 'openrouter:deepseek/deepseek-chat',
                requiresKey: true,
                tags: ['reasoning', 'general']
            },
            {
                key: 'or_paid_mistral_large',
                displayName: 'Mistral Large 24.11',
                modelId: 'mistralai/mistral-large-2411',
                dbModelId: 'openrouter:mistralai/mistral-large-2411',
                requiresKey: true,
                tags: ['general', 'coding']
            },
            {
                key: 'or_paid_grokfast',
                displayName: 'Grok Code Fast 1',
                modelId: 'x-ai/grok-code-fast-1',
                dbModelId: 'openrouter:x-ai/grok-code-fast-1',
                requiresKey: true,
                tags: ['coding', 'fast']
            }
        ]
    }
];

export const MODEL_MAP = {};

AI_MODEL_PROVIDERS.forEach((provider) => {
    provider.models.forEach((model) => {
        MODEL_MAP[model.key] = {
            name: model.displayName,
            provider: provider.id,
            providerName: provider.name,
            modelId: model.modelId,
            dbModelId: model.dbModelId,
            requiresKey: model.requiresKey !== false,
            access: model.access || 'user-key',
            tags: model.tags || [],
            recommended: !!model.recommended
        };
    });
});

export function getModelKeyByDbId(dbModelId) {
    if (!dbModelId) return null;
    return Object.keys(MODEL_MAP).find((key) => MODEL_MAP[key].dbModelId === dbModelId) || null;
}

