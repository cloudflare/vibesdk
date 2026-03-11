/**
 * Model Discovery Service
 * Fetches available models from Cloudflare Workers AI API
 * Compares with known models to detect new/deprecated models
 */

import { AIModels, AI_MODEL_CONFIG, AIModelConfig, ModelSize } from '../../agents/inferutils/config.types';

export interface DiscoveredModel {
    id: string;
    name: string;
    provider: string;
    status: 'new' | 'deprecated' | 'active' | 'unknown';
}

export interface ModelDiscoveryResult {
    newModels: DiscoveredModel[];
    deprecatedModels: DiscoveredModel[];
    knownModels: string[];
    lastChecked: Date;
}

/**
 * Fetch available models from Cloudflare Workers AI
 */
export async function fetchCloudflareModels(env: Env): Promise<string[]> {
    const models: string[] = [];
    
    try {
        // Try using the AI Gateway API to get available models
        const accountId = env.CLOUDFLARE_ACCOUNT_ID;
        const apiToken = env.CLOUDFLARE_API_TOKEN;
        
        if (accountId && apiToken) {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models?limit=100`,
                {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            
            if (response.ok) {
                const data = await response.json() as { result?: Array<{ id: string }> };
                if (data.result) {
                    models.push(...data.result.map((m) => m.id));
                }
            }
        }
        
        // Fallback: try the public AI Gateway
        const fallbackResponse = await fetch(
            'https://api.cloudflare.com/client/v4/ai/models',
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        
        if (fallbackResponse.ok && models.length === 0) {
            const data = await fallbackResponse.json() as { result?: Array<{ id: string }> };
            if (data.result) {
                models.push(...data.result.map((m) => m.id));
            }
        }
    } catch (error) {
        console.error('Failed to fetch Cloudflare models:', error);
    }
    
    return models;
}

/**
 * Known model ID prefixes for Workers AI
 */
const WORKERS_AI_PREFIXES = [
    '@cf/',
    'llama-',
    'gemma-',
    'mistral-',
    'phi-',
    'qwen-',
    'deepseek-',
    'flux.',
    'whisper-',
    'bge-',
    'glm-',
];

/**
 * Check if a model ID is a Workers AI model
 */
export function isWorkersAIModel(modelId: string): boolean {
    return WORKERS_AI_PREFIXES.some(prefix => modelId.startsWith(prefix));
}

/**
 * Discover new and deprecated models by comparing with known list
 */
export function discoverModelChanges(availableModels: string[]): ModelDiscoveryResult {
    const knownModelIds = new Set(Object.values(AIModels) as string[]);
    
    // Find new models (in available but not in known)
    const newModels: DiscoveredModel[] = [];
    for (const modelId of availableModels) {
        if (isWorkersAIModel(modelId) && !(knownModelIds as Set<string>).has(modelId)) {
            // Try to infer model info from ID
            const name = modelId
                .replace('@cf/', '')
                .replace(/-/g, ' ')
                .replace(/\//g, ' • ')
                .replace(/(\d+\.?\d*)/g, '$1 ')
                .trim();
            
            newModels.push({
                id: modelId,
                name: name.charAt(0).toUpperCase() + name.slice(1),
                provider: inferProvider(modelId),
                status: 'new',
            });
        }
    }
    
    // Find deprecated models (in known but not in available)
    const deprecatedModels: DiscoveredModel[] = [];
    for (const modelId of knownModelIds) {
        const config = AI_MODEL_CONFIG[modelId as AIModels] as AIModelConfig | undefined;
        if (config && config.provider === 'workers-ai' && !availableModels.includes(modelId as string)) {
            deprecatedModels.push({
                id: modelId as string,
                name: config.name,
                provider: config.provider,
                status: 'deprecated',
            });
        }
    }
    
    return {
        newModels,
        deprecatedModels,
        knownModels: Array.from(knownModelIds as unknown as string[]),
        lastChecked: new Date(),
    };
}

/**
 * Infer provider from model ID
 */
function inferProvider(modelId: string): string {
    if (modelId.includes('meta')) return 'Meta';
    if (modelId.includes('google') || modelId.includes('gemma')) return 'Google';
    if (modelId.includes('mistral')) return 'MistralAI';
    if (modelId.includes('qwen')) return 'Qwen';
    if (modelId.includes('deepseek')) return 'DeepSeek';
    if (modelId.includes('microsoft')) return 'Microsoft';
    if (modelId.includes('ibm')) return 'IBM';
    if (modelId.includes('zhipuai')) return 'ZhipuAI';
    if (modelId.includes('bytedance')) return 'ByteDance';
    if (modelId.includes('aisingapore')) return 'AI Singapore';
    return 'Workers AI';
}

/**
 * Auto-update model config with new models (for admin use)
 * Returns the updated config
 */
export function getUpdatedModelConfig(discovered: ModelDiscoveryResult): Record<string, AIModelConfig> {
    const updatedConfig: Record<string, AIModelConfig> = { ...AI_MODEL_CONFIG };
    
    // Add new models with default config
    for (const model of discovered.newModels) {
        if (!updatedConfig[model.id]) {
            updatedConfig[model.id] = {
                name: model.name,
                size: inferModelSize(model.id),
                provider: 'workers-ai',
                creditCost: 0,
                contextSize: 128000, // Default
            };
        }
    }
    
    return updatedConfig;
}

/**
 * Infer model size from model ID
 */
function inferModelSize(modelId: string): ModelSize {
    const id = modelId.toLowerCase();
    if (id.includes('70b') || id.includes('65b') || id.includes('405b') || id.includes('30b') || id.includes('27b')) {
        return ModelSize.LARGE;
    }
    if (id.includes('7b') || id.includes('8b') || id.includes('12b')) {
        return ModelSize.REGULAR;
    }
    return ModelSize.LITE;
}

/**
 * Get summary of model discovery for logging
 */
export function getModelDiscoverySummary(discovered: ModelDiscoveryResult): string {
    const lines = [
        `Model Discovery Report (${discovered.lastChecked.toISOString()})`,
        `Known models: ${discovered.knownModels.length}`,
        `New models found: ${discovered.newModels.length}`,
        `Deprecated models: ${discovered.deprecatedModels.length}`,
    ];
    
    if (discovered.newModels.length > 0) {
        lines.push(`  New: ${discovered.newModels.map(m => m.id).join(', ')}`);
    }
    
    if (discovered.deprecatedModels.length > 0) {
        lines.push(`  Deprecated: ${discovered.deprecatedModels.map(m => m.id).join(', ')}`);
    }
    
    return lines.join('\n');
}
