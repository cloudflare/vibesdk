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
    // --- Google Models ---
    GEMINI_2_5_PRO: {
        id: 'google-ai-studio/gemini-2.5-pro',
        config: {
            name: 'Gemini 2.5 Pro',
            size: ModelSize.LARGE,
            provider: 'google-ai-studio',
            creditCost: 5,   // $1.25
            contextSize: 1048576, // 1M Context
        }
    },
    GEMINI_2_5_FLASH: {
        id: 'google-ai-studio/gemini-2.5-flash',
        config: {
            name: 'Gemini 2.5 Flash',
            size: ModelSize.REGULAR,
            provider: 'google-ai-studio',
            creditCost: 1.2, // $0.30
            contextSize: 1048576, // 1M Context
        }
    },
    GEMINI_2_5_FLASH_LITE: {
        id: 'google-ai-studio/gemini-2.5-flash-lite',
        config: {
            name: 'Gemini 2.5 Flash-Lite',
            size: ModelSize.LITE,
            provider: 'google-ai-studio',
            creditCost: 0.4, // $0.10
            contextSize: 1048576, // 1M Context
        }
    },
    GEMINI_2_5_FLASH_LATEST: {
        id: 'google-ai-studio/gemini-2.5-flash-latest',
        config: {
            name: 'Gemini 2.5 Flash (Latest)',
            size: ModelSize.REGULAR,
            provider: 'google-ai-studio',
            creditCost: 1.2, // $0.30
            contextSize: 1048576,
        }
    },
    GEMINI_2_5_FLASH_LITE_LATEST: {
        id: 'google-ai-studio/gemini-2.5-flash-lite-latest',
        config: {
            name: 'Gemini 2.5 Flash-Lite (Latest)',
            size: ModelSize.LITE,
            provider: 'google-ai-studio',
            creditCost: 0.4, // $0.10
            contextSize: 1048576,
        }
    },
    GEMINI_2_5_PRO_LATEST: {
        id: 'google-ai-studio/gemini-2.5-pro-latest',
        config: {
            name: 'Gemini 2.5 Pro (Latest)',
            size: ModelSize.LARGE,
            provider: 'google-ai-studio',
            creditCost: 5, // $1.25
            contextSize: 1048576,
        }
    },
    GEMINI_3_PRO_PREVIEW: {
        id: 'google-ai-studio/gemini-3-pro-preview',
        config: {
            name: 'Gemini 3.0 Pro Preview',
            size: ModelSize.LARGE,
            provider: 'google-ai-studio',
            creditCost: 8, // $2.00 (Preview Pricing)
            contextSize: 1048576,
        }
    },
    GEMINI_3_FLASH_PREVIEW: {
        id: 'google-ai-studio/gemini-3-flash-preview',
        config: {
            name: 'Gemini 3.0 Flash Preview',
            size: ModelSize.REGULAR,
            provider: 'google-ai-studio',
            creditCost: 2, // $0.5
            contextSize: 1048576, // 1M Context
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
 * Usage: AI_MODEL_CONFIG[AIModels.GEMINI_2_5_PRO]
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
