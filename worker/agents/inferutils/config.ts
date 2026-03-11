import { 
    AgentActionKey, 
    AgentConfig, 
    AgentConstraintConfig, 
    AIModels,
    AllModels,
    LiteModels,
    RegularModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

// Default to Workers AI if platform credentials available, otherwise require user config
const DEFAULT_MODEL = (env.CLOUDFLARE_API_KEY && env.CLOUDFLARE_ACCOUNT_ID) 
    ? AIModels.WORKERS_AI_LLAMA_3_1_8B 
    : AIModels.DISABLED;

// Common configs - defaults to Workers AI if CF credentials available
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'medium' as const,
        max_tokens: 8000,
        temperature: 1,
    },
    realtimeCodeFixer: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'low' as const,
        max_tokens: 32000,
        temperature: 0.2,
    },
    fastCodeFixer: {
        name: DEFAULT_MODEL,
        reasoning_effort: undefined,
        max_tokens: 64000,
        temperature: 0.0,
    },
    templateSelection: {
        name: DEFAULT_MODEL,
        max_tokens: 2000,
        temperature: 1,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    reasoning_effort: 'low' as const,
    max_tokens: 48000,
    temperature: 1,
};

//======================================================================================
/* 
Platform config: Uses Workers AI by default if CF credentials available.
Users can override with their own API keys via BYOK modal.
*/
const PLATFORM_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: DEFAULT_MODEL,
        max_tokens: 2000,
        temperature: 1,
    },
    blueprint: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 20000,
        temperature: 1.0,
    },
    projectSetup: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
    },
    phaseGeneration: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
    },
    firstPhaseImplementation: {
        name: DEFAULT_MODEL,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: DEFAULT_MODEL,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 1,
    },
    deepDebugger: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
    },
    fileRegeneration: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'low',
        max_tokens: 16000,
        temperature: 0.0,
    },
    agenticProjectBuilder: {
        name: DEFAULT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
    },
};

//======================================================================================
// Default config - Uses Cloudflare Workers AI (free, no API key needed)
// Users can swap to Custom BYOK or other providers in settings
//======================================================================================
/* Default out-of-the-box config using Workers AI */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        max_tokens: 2000,
        temperature: 0.6,
    },
    blueprint: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_70B,
        reasoning_effort: 'high',
        max_tokens: 64000,
        temperature: 1,
    },
    projectSetup: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseGeneration: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    firstPhaseImplementation: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0,
    },
    deepDebugger: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_70B,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
    },
    fileRegeneration: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 1,
    },
    agenticProjectBuilder: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_70B,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
    },
};

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['fastCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['realtimeCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['fileRegeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['phaseGeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['projectSetup', {
		allowedModels: new Set(RegularModels),
		enabled: true,
	}],
	['conversationalResponse', {
		allowedModels: new Set(RegularModels),
		enabled: true,
	}],
	['templateSelection', {
		allowedModels: new Set(LiteModels),
		enabled: true,
	}],
]);