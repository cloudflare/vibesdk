import { AIModels } from '../../../agents/inferutils/config.types';
import type { UserProviderStatus, ModelsByProvider } from './types';
import { getBYOKTemplates } from '../../../types/secretsTemplates';

export async function getUserProviderStatus(
	_userId: string,
	_env: Env,
): Promise<UserProviderStatus[]> {
	try {
		const byokTemplates = getBYOKTemplates();

		return byokTemplates.map((template) => ({
			provider: template.provider,
			hasValidKey: false,
		}));
	} catch (error) {
		console.error('Error getting user provider status:', error);
		return [];
	}
}

export function getByokModels(
	providerStatuses: UserProviderStatus[],
): ModelsByProvider {
	const modelsByProvider: ModelsByProvider = {};

	providerStatuses
		.filter((status) => status.hasValidKey)
		.forEach((status) => {
			const providerModels = Object.values(AIModels).filter((model) =>
				model.startsWith(`${status.provider}/`),
			);

			if (providerModels.length > 0) {
				modelsByProvider[status.provider] = providerModels;
			}
		});

	return modelsByProvider;
}

export function getPlatformEnabledProviders(env: Env): string[] {
    const platformModelProviders = env.PLATFORM_MODEL_PROVIDERS;
    if (platformModelProviders) {
        const providers = platformModelProviders.split(',').map(p => p.trim());
        return providers;
    }
	const enabledProviders: string[] = [];

    // Workers AI is always available (uses native binding, no key needed)
    enabledProviders.push('workers-ai');

    // Custom BYOK is always available (user provides endpoint)
    enabledProviders.push('custom');

	const providerList = [
		'anthropic',
		'openai',
		'google-ai-studio',
		'cerebras',
		'groq',
        'cloudflare', // Cloudflare hosted models (universal key)
	];

	for (const provider of providerList) {
		const providerKeyString = provider.toUpperCase().replaceAll('-', '_');
		const envKey = `${providerKeyString}_API_KEY` as keyof Env;
		const apiKey = env[envKey] as string;

		if (
			apiKey &&
			apiKey.trim() !== '' &&
			apiKey.trim().toLowerCase() !== 'default' &&
			apiKey.trim().toLowerCase() !== 'none' &&
			apiKey.trim().length >= 10
		) {
			enabledProviders.push(provider);
		}
	}

	return enabledProviders;
}

export function getPlatformAvailableModels(env: Env): AIModels[] {
	const platformEnabledProviders = getPlatformEnabledProviders(env);

	return Object.values(AIModels).filter((model) => {
		const provider = getProviderFromModel(model);
		return platformEnabledProviders.includes(provider);
	});
}

export function validateModelAccessForEnvironment(
	model: AIModels | string,
	env: Env,
	userProviderStatus: UserProviderStatus[],
): boolean {
	const provider = getProviderFromModel(model);

	const hasPlatformKey = getPlatformEnabledProviders(env).includes(provider);
	const hasUserKey = userProviderStatus.some(
		(status) => status.provider === provider && status.hasValidKey,
	);

	return hasPlatformKey || hasUserKey;
}

export function getProviderFromModel(model: AIModels | string): string {
	if (typeof model === 'string' && model.includes('/')) {
        // Handle Workers AI format: "@cf/meta/llama-3.1-8b-instruct"
        if (model.startsWith('@cf/')) {
            return 'workers-ai';
        }
        // Handle OpenAI format: "openai/gpt-4"
		return model.split('/')[0];
	}
    // Check for Cloudflare hosted models (no prefix, like "llama-3.1-70b-instruct")
    if (typeof model === 'string' && 
        (model.includes('llama-3.1') || model.includes('llama-3') || model.includes('mistral'))) {
        return 'workers-ai'; // Routes via AI Gateway
    }
	return 'cloudflare';
}
