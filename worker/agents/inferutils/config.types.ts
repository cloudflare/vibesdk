/**
 * Config Types - Pure type definitions only
 */

export type ReasoningEffortType = 'minimal' | 'low' | 'medium' | 'high';
export type ReasoningEffort = ReasoningEffortType;

export enum ModelSize {
    LITE = 'lite',
    REGULAR = 'regular',
    LARGE = 'large',
}

export interface AIModelConfig {
    name: string;
    size: ModelSize;
    provider: string;
    creditCost: number;
    contextSize: number;
    nonReasoning?: boolean;
    directOverride?: boolean;
    deprecated?: boolean;
    deprecatedReason?: string;
}

// Pricing Baseline: GPT-5 Mini ($0.25/1M Input) = 1.0 Credit
const MODELS_MASTER = {
    DISABLED: {
        id: 'disabled',
        config: {
            name: 'Disabled',
            size: ModelSize.LITE,
            provider: 'None',
            creditCost: 0,
            contextSize: 0,
        }
    },
    // --- Cloudflare Workers AI Models (Default) ---
    WORKERS_AI_LLAMA_3_1_8B: {
        id: '@cf/meta/llama-3.1-8b-instruct',
        config: {
            name: 'Llama 3.1 8B (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_LLAMA_3_1_70B: {
        id: '@cf/meta/llama-3.1-70b-instruct',
        config: {
            name: 'Llama 3.1 70B (Workers AI)',
            size: ModelSize.LARGE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_LLAMA_3_2_1B: {
        id: '@cf/meta/llama-3.2-1b-instruct',
        config: {
            name: 'Llama 3.2 1B (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_LLAMA_3_2_11B: {
        id: '@cf/meta/llama-3.2-11b-vision-instruct',
        config: {
            name: 'Llama 3.2 11B Vision (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_MISTRAL_7B: {
        id: '@cf/meta/mistral-7b-instruct',
        config: {
            name: 'Mistral 7B (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_PHI_2: {
        id: '@cf/microsoft/phi-2',
        config: {
            name: 'Phi 2 (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 4096,
        }
    },
    WORKERS_AI_LLAMA_3_2_3B: {
        id: '@cf/meta/llama-3.2-3b-instruct',
        config: {
            name: 'Llama 3.2 3B (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_QWEN_2_5_CODER: {
        id: '@cf/qwen/qwen2.5-coder-32b-instruct',
        config: {
            name: 'Qwen 2.5 Coder 32B (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 131072,
        }
    },
    WORKERS_AI_DEEPSEEK_CHAT: {
        id: '@cf/deepseek-ai/deepseek-chat',
        config: {
            name: 'DeepSeek Chat (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 131072,
        }
    },
    WORKERS_AI_DEEPSEEK_CODER: {
        id: '@cf/deepseek-ai/deepseek-coder-6.7b-base-awq',
        config: {
            name: 'DeepSeek Coder 6.7B (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_BIGTHINK_STRALIGHT: {
        id: '@cf/bytedance/bigthink-stralight-deployed',
        config: {
            name: 'BigThink StratLight (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 32768,
        }
    },
    // --- New 2025 Models ---
    WORKERS_AI_LLAMA_4_SCOUT: {
        id: '@cf/meta/llama-4-scout-17b-16e-instruct',
        config: {
            name: 'Llama 4 Scout 17B (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_LLAMA_3_3_70B: {
        id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        config: {
            name: 'Llama 3.3 70B Fast (Workers AI)',
            size: ModelSize.LARGE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_QWEN3_30B: {
        id: '@cf/qwen/qwen3-30b-a3b-fp8',
        config: {
            name: 'Qwen3 30B MoE (Workers AI)',
            size: ModelSize.LARGE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 131072,
        }
    },
    WORKERS_AI_DEEPSEEK_R1: {
        id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
        config: {
            name: 'DeepSeek R1 (Workers AI)',
            size: ModelSize.LARGE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 131072,
        }
    },
    WORKERS_AI_GEMMA_3: {
        id: '@cf/google/gemma-3-12b-it',
        config: {
            name: 'Gemma 3 12B (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_MISTRAL_SMALL: {
        id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
        config: {
            name: 'Mistral Small 3.1 24B (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    WORKERS_AI_QWQ_32B: {
        id: '@cf/qwen/qwq-32b',
        config: {
            name: 'QwQ 32B Reasoning (Workers AI)',
            size: ModelSize.LARGE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 131072,
        }
    },
    // --- Deprecated Models (available but may be removed) ---
    // Add deprecated: true and deprecatedReason when model is sunset
    WORKERS_AI_GLM_4_7: {
        id: '@cf/zhipuai/glm-4.7-flash',
        config: {
            name: 'GLM-4.7 Flash (Workers AI)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 131072,
        }
    },
    WORKERS_AI_QWEN3_EMBEDDING: {
        id: '@cf/qwen/qwen3-embedding-0.6b',
        config: {
            name: 'Qwen3 Embedding 0.6B (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 8192,
        }
    },
    WORKERS_AI_GEMMA_SEA: {
        id: '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
        config: {
            name: 'SEA-LION 27B (Workers AI)',
            size: ModelSize.LARGE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 32768,
        }
    },
    WORKERS_AI_GRANITE_4: {
        id: '@cf/ibm/granite-4.0-h-micro',
        config: {
            name: 'Granite 4.0 Micro (Workers AI)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 128000,
        }
    },
    // --- Deprecated Models (scheduled for removal) ---
    // To deprecate: set deprecated: true and add deprecatedReason
    DEPRECATED_LLAMA_2_7B: {
        id: '@cf/meta/llama-2-7b-chat-hf',
        config: {
            name: 'Llama 2 7B Chat (Deprecated)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 4096,
            deprecated: true,
            deprecatedReason: 'Use Llama 3.x instead',
        }
    },
    DEPRECATED_PHI_2: {
        id: '@cf/microsoft/phi-2',
        config: {
            name: 'Phi-2 (Deprecated)',
            size: ModelSize.LITE,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 4096,
            deprecated: true,
            deprecatedReason: 'Use Gemma 3 or Phi-4 instead',
        }
    },
    DEPRECATED_MISTRAL_7B_V0_1: {
        id: '@cf/mistralai/mistral-7b-instruct-v0.1',
        config: {
            name: 'Mistral 7B v0.1 (Deprecated)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 32768,
            deprecated: true,
            deprecatedReason: 'Use Mistral Small 3.1 instead',
        }
    },
    DEPRECATED_FALCON_7B: {
        id: '@cf/tiiuae/falcon-7b-instruct',
        config: {
            name: 'Falcon 7B (Deprecated)',
            size: ModelSize.REGULAR,
            provider: 'workers-ai',
            creditCost: 0,
            contextSize: 8192,
            deprecated: true,
            deprecatedReason: 'Model discontinued by TII',
        }
    },
    // --- Cloudflare Hosted Models (with universal key - requires REST API) ---
    CLOUDFLARE_AI_LLAMA_3_1_405B: {
        id: 'llama-3.1-405b-instruct-fp8',
        config: {
            name: 'Llama 3.1 405B (CF Hosted)',
            size: ModelSize.LARGE,
            provider: 'workers-ai', // Uses REST API when CF key provided
            creditCost: 0,
            contextSize: 128000,
        }
    },
    CLOUDFLARE_AI_LLAMA_3_1_70B: {
        id: 'llama-3.1-70b-instruct',
        config: {
            name: 'Llama 3.1 70B (CF Hosted)',
            size: ModelSize.LARGE,
            provider: 'workers-ai', // Uses REST API when CF key provided
            creditCost: 0,
            contextSize: 128000,
        }
    },
    // --- Custom BYOK Models (OpenAI-compatible endpoints) ---
    CUSTOM_BYOK: {
        id: 'custom/byok',
        config: {
            name: 'Custom BYOK Model',
            size: ModelSize.REGULAR,
            provider: 'custom',
            creditCost: 0,
            contextSize: 128000,
        }
    },

    // --- Anthropic Models ---
    CLAUDE_3_7_SONNET_20250219: {
        id: 'anthropic/claude-3-7-sonnet-20250219',
        config: {
            name: 'Claude 3.7 Sonnet',
            size: ModelSize.LARGE,
            provider: 'anthropic',
            creditCost: 12, // $3.00
            contextSize: 200000, // 200K Context
        }
    },
    CLAUDE_4_SONNET: {
        id: 'anthropic/claude-sonnet-4-20250514',
        config: {
            name: 'Claude 4 Sonnet',
            size: ModelSize.LARGE,
            provider: 'anthropic',
            creditCost: 12, // $3.00
            contextSize: 200000, // 200K Context
        }
    },
    CLAUDE_4_5_SONNET: {
        id: 'anthropic/claude-sonnet-4-5',
        config: {
            name: 'Claude 4.5 Sonnet',
            size: ModelSize.LARGE,
            provider: 'anthropic',
            creditCost: 12, // $3.00
            contextSize: 200000, // 200K Context
        }
    },
    CLAUDE_4_5_OPUS: {
        id: 'anthropic/claude-opus-4-5',
        config: {
            name: 'Claude 4.5 Opus',
            size: ModelSize.LARGE,
            provider: 'anthropic',
            creditCost: 20, // $5.00
            contextSize: 200000, // 200K Context
        }
    },
    CLAUDE_4_5_HAIKU: {
        id: 'anthropic/claude-haiku-4-5',
        config: {
            name: 'Claude 4.5 Haiku',
            size: ModelSize.REGULAR,
            provider: 'anthropic',
            creditCost: 4, // ~$1
            contextSize: 200000, // 200K Context
        }
    },

    // --- OpenAI Models ---
    OPENAI_5: {
        id: 'openai/gpt-5',
        config: {
            name: 'GPT-5',
            size: ModelSize.LARGE,
            provider: 'openai',
            creditCost: 5, // $1.25
            contextSize: 400000, // 400K Context
        }
    },
    OPENAI_5_1: {
        id: 'openai/gpt-5.1',
        config: {
            name: 'GPT-5.1',
            size: ModelSize.LARGE,
            provider: 'openai',
            creditCost: 5, // $1.25
            contextSize: 400000, // 400K Context
        }
    },
    OPENAI_5_2: {
        id: 'openai/gpt-5.2',
        config: {
            name: 'GPT-5.2',
            size: ModelSize.LARGE,
            provider: 'openai',
            creditCost: 7, // $1.75
            contextSize: 400000, // 400K Context
        }
    },
    OPENAI_5_MINI: {
        id: 'openai/gpt-5-mini',
        config: {
            name: 'GPT-5 Mini',
            size: ModelSize.LITE,
            provider: 'openai',
            creditCost: 1, // $0.25 (BASELINE)
            contextSize: 400000, // 400K Context
        }
    },
    // Below configs are commented for now, may be supported in the future
    // OPENAI_OSS: {
    //     id: 'openai/gpt-oss-120b',
    //     config: {
    //         name: 'GPT-OSS 120b',
    //         size: ModelSize.LITE,
    //         provider: 'openai',
    //         creditCost: 0.4,
    //         contextSize: 131072, // 128K Context
    //     }
    // },
    // OPENAI_5_1_CODEX_MINI: {
    //     id: 'openai/gpt-5.1-codex-mini',
    //     config: {
    //         name: 'GPT-5.1 Codex Mini',
    //         size: ModelSize.LITE,
    //         provider: 'openai',
    //         creditCost: 1, // ~$0.25
    //         contextSize: 400000, // 400K Context
    //     }
    // },
    // OPENAI_5_1_CODEX: {
    //     id: 'openai/gpt-5.1-codex',
    //     config: {
    //         name: 'GPT-5.1 Codex',
    //         size: ModelSize.LARGE,
    //         provider: 'openai',
    //         creditCost: 5, // ~$1.25
    //         contextSize: 400000, // 400K Context
    //     }
    // },

    // // --- Cerebras Models ---
    // CEREBRAS_GPT_OSS: {
    //     id: 'cerebras/gpt-oss-120b',
    //     config: {
    //         name: 'Cerebras GPT-OSS',
    //         size: ModelSize.LITE,
    //         provider: 'Cerebras',
    //         creditCost: 0.4, // $0.25
    //         contextSize: 131072, // 128K Context
    //     }
    // },
    // CEREBRAS_QWEN_3_CODER: {
    //     id: 'cerebras/qwen-3-coder-480b',
    //     config: {
    //         name: 'Qwen 3 Coder',
    //         size: ModelSize.REGULAR,
    //         provider: 'cerebras',
    //         creditCost: 4, // Est ~$1.00 for 480B param
    //         contextSize: 32768,
    //     }
    // },

    // --- Grok Models ---
    GROK_CODE_FAST_1: {
        id: 'grok/grok-code-fast-1',
        config: {
            name: 'Grok Code Fast 1',
            size: ModelSize.LITE,
            provider: 'grok',
            creditCost: 0.8, // $0.20
            contextSize: 256000, // 256K Context
            nonReasoning: true,
        }
    },
    GROK_4_FAST: {
        id: 'grok/grok-4-fast',
        config: {
            name: 'Grok 4 Fast',
            size: ModelSize.LITE,
            provider: 'grok',
            creditCost: 0.8, // $0.20
            contextSize: 2_000_000, // 2M Context
            nonReasoning: true,
        }
    },
    GROK_4_1_FAST: {
        id: 'grok/grok-4-1-fast-reasoning',
        config: {
            name: 'Grok 4.1 Fast',
            size: ModelSize.LITE,
            provider: 'grok',
            creditCost: 0.8, // $0.20
            contextSize: 2_000_000, // 2M Context
            nonReasoning: true,
        }
    },
    GROK_4_1_FAST_NON_REASONING: {
        id: 'grok/grok-4-1-fast-non-reasoning',
        config: {
            name: 'Grok 4.1 Fast Non reasoning',
            size: ModelSize.LITE,
            provider: 'grok',
            creditCost: 0.8, // $0.20
            contextSize: 2_000_000, // 2M Context
            nonReasoning: true,
        }
    },
    // --- Vertex Models ---
    VERTEX_GPT_OSS_120: {
        id: 'google-vertex-ai/openai/gpt-oss-120b-maas',
        config: {
            name: 'Google Vertex GPT OSS 120B',
            size: ModelSize.LITE,
            provider: 'google-vertex-ai',
            creditCost: 0.36, // $0.09
            contextSize: 131072, // 128K Context
        }
    },
    VERTEX_KIMI_THINKING: {
        id: 'google-vertex-ai/moonshotai/kimi-k2-thinking-maas',
        config: {
            name: 'Google Vertex Kimi K2 Thinking',
            size: ModelSize.LITE,
            provider: 'google-vertex-ai',
            creditCost: 2, // $0.50
            contextSize: 262144, // 256K Context
        }
    },
    QWEN_3_CODER_480B: {
        id: 'google-vertex-ai/qwen/qwen3-coder-480b-a35b-instruct-maas',
        config: {
            name: 'Qwen 3 Coder 480B',
            size: ModelSize.LITE,
            provider: 'google-vertex-ai',
            creditCost: 8, // $0.22
            contextSize: 262144, // 256K Context
        },
    }
} as const;

/**
 * Generated AIModels object
 */
export const AIModels = Object.fromEntries(
    Object.entries(MODELS_MASTER).map(([key, value]) => [key, value.id])
) as { [K in keyof typeof MODELS_MASTER]: typeof MODELS_MASTER[K]['id'] };

/**
 * Type definition for AIModels values.
 */
export type AIModels = typeof AIModels[keyof typeof AIModels];

/**
 * Configuration map for all AI Models.
 * Usage: AI_MODEL_CONFIG[AIModels.CLAUDE_3_7_SONNET_20250219]
 */
export const AI_MODEL_CONFIG: Record<AIModels, AIModelConfig> = Object.fromEntries(
    Object.values(MODELS_MASTER).map((entry) => [entry.id, entry.config])
) as Record<AIModels, AIModelConfig>;

/**
 * Dynamically generated list of Lite models based on ModelSize.LITE
 */
export const LiteModels: AIModels[] = Object.values(MODELS_MASTER)
    .filter((entry) => entry.config.size === ModelSize.LITE)
    .map((entry) => entry.id);

export const RegularModels: AIModels[] = Object.values(MODELS_MASTER)
    .filter((entry) => entry.config.size === ModelSize.REGULAR || entry.config.size === ModelSize.LITE)
    .map((entry) => entry.id);

export const AllModels: AIModels[] = Object.values(MODELS_MASTER)
    .map((entry) => entry.id);

/**
 * Filter out deprecated models for UI display
 */
export const ActiveModels: AIModels[] = Object.values(MODELS_MASTER)
    .filter((entry) => !('deprecated' in entry.config) || !entry.config.deprecated)
    .map((entry) => entry.id);

/**
 * Get deprecated models (for admin/cleanup purposes)
 */
export const DeprecatedModels: AIModels[] = Object.values(MODELS_MASTER)
    .filter((entry) => 'deprecated' in entry.config && entry.config.deprecated)
    .map((entry) => entry.id);

/**
 * Check if a model is deprecated
 */
export function isModelDeprecated(model: AIModels): boolean {
    return AI_MODEL_CONFIG[model]?.deprecated ?? false;
}

/**
 * Get deprecation reason for a model
 */
export function getDeprecationReason(model: AIModels): string | undefined {
    return AI_MODEL_CONFIG[model]?.deprecatedReason;
}

export interface AgentConstraintConfig {
    allowedModels: Set<AIModels>;
    enabled: boolean;
}

export interface AgentConstraintConfig {
    allowedModels: Set<AIModels>;
    enabled: boolean;
}

export interface ModelConfig {
    name: AIModels | string;
    reasoning_effort?: ReasoningEffort;
    max_tokens?: number;
    temperature?: number;
    frequency_penalty?: number;
    fallbackModel?: AIModels | string;
}

export interface AgentConfig {
    templateSelection: ModelConfig;
    blueprint: ModelConfig;
    projectSetup: ModelConfig;
    phaseGeneration: ModelConfig;
    phaseImplementation: ModelConfig;
    firstPhaseImplementation: ModelConfig;
    fileRegeneration: ModelConfig;
    screenshotAnalysis: ModelConfig;
    realtimeCodeFixer: ModelConfig;
    fastCodeFixer: ModelConfig;
    conversationalResponse: ModelConfig;
    deepDebugger: ModelConfig;
    agenticProjectBuilder: ModelConfig;
}

// Provider and reasoning effort types for validation
export type ProviderOverrideType = 'cloudflare' | 'direct';

export type AgentActionKey = keyof AgentConfig;

/**
 * Metadata used in agent for inference and other tasks
 */
export type InferenceMetadata = {
    agentId: string;
    userId: string;
    // llmRateLimits: LLMCallsRateLimitConfig;
}

export type InferenceRuntimeOverrides = {
	/** Provider API keys (BYOK) keyed by provider id, e.g. "openai" -> key. */
	userApiKeys?: Record<string, string>;
	/** Optional AI gateway override (baseUrl + token). */
	aiGatewayOverride?: { baseUrl: string; token: string };
};

/**
 * Runtime-only overrides used for inference.
 * This is never persisted in Durable Object state.
 */
export interface InferenceContext {
    metadata: InferenceMetadata;
    enableRealtimeCodeFix: boolean;
    enableFastSmartCodeFix: boolean;
    abortSignal?: AbortSignal;
    userModelConfigs?: Record<AgentActionKey, ModelConfig>;
    runtimeOverrides?: InferenceRuntimeOverrides;
}

/**
 * SDK-facing credential payload
 */
export type CredentialsPayload = {
	providers?: Record<string, { apiKey: string }>;
	aiGateway?: { baseUrl: string; token: string };
};

export function credentialsToRuntimeOverrides(
	credentials: CredentialsPayload | undefined,
): InferenceRuntimeOverrides | undefined {
	if (!credentials) return undefined;

	const userApiKeys: Record<string, string> = {};
	for (const [provider, v] of Object.entries(credentials.providers ?? {})) {
		if (v.apiKey) userApiKeys[provider] = v.apiKey;
	}

	const hasKeys = Object.keys(userApiKeys).length > 0;
	return {
		...(hasKeys ? { userApiKeys } : {}),
		...(credentials.aiGateway ? { aiGatewayOverride: credentials.aiGateway } : {}),
	};
}

export function isValidAIModel(value: string): value is AIModels {
  return Object.values(AIModels).includes(value as AIModels);
}

export function toAIModel(value: string | null | undefined): AIModels | undefined {
  if (!value) return undefined;
  return isValidAIModel(value) ? value : undefined;
}
