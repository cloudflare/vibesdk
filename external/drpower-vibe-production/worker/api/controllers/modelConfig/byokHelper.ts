/**
 * BYOK (Bring Your Own Key) Helper Functions
 * Handles provider discovery and model filtering for users with custom API keys
 * Completely dynamic - no hardcoded provider lists
 */

import { AIModels } from '../../../agents/inferutils/config.types';
import type { UserProviderStatus, ModelsByProvider } from './types';
import { SecretsService } from '../../../database/services/SecretsService';
import { getBYOKTemplates } from '../../../types/secretsTemplates';

/**
 * Get user's provider status for BYOK functionality
 */
export async function getUserProviderStatus(
	userId: string,
	env: Env,
): Promise<UserProviderStatus[]> {
	try {
		const secretsService = new SecretsService(env);

		// Get BYOK templates dynamically
		const byokTemplates = await getBYOKTemplates();

		// Get all user secrets
		const userSecrets = await secretsService.getUserSecrets(userId);

		const providerStatuses: UserProviderStatus[] = [];

		for (const template of byokTemplates) {
			// Find secret for this BYOK template
			const providerSecret = userSecrets.find(
				(secret) =>
					secret.secretType === template.envVarName &&
					secret.isActive,
			);

			providerStatuses.push({
				provider: template.provider,
				hasValidKey: !!providerSecret,
				keyPreview: providerSecret?.keyPreview,
			});
		}

		return providerStatuses;
	} catch (error) {
		console.error('Error getting user provider status:', error);

		// Fallback - try to get templates again for error recovery
		try {
			const byokTemplates = await getBYOKTemplates();
			return byokTemplates.map((template) => ({
				provider: template.provider,
				hasValidKey: false,
			}));
		} catch {
			return []; // Complete fallback
		}
	}
}

/**
 * Get models available for BYOK providers that user has keys for
 */
export function getByokModels(
	providerStatuses: UserProviderStatus[],
): ModelsByProvider {
	const modelsByProvider: ModelsByProvider = {};

	providerStatuses
		.filter((status) => status.hasValidKey)
		.forEach((status) => {
			// Get models for this provider dynamically from AIModels enum
			const providerModels = Object.values(AIModels).filter((model) =>
				model.startsWith(`${status.provider}/`),
			);

			if (providerModels.length > 0) {
				modelsByProvider[status.provider] = providerModels;
			}
		});

	return modelsByProvider;
}

/**
 * Get providers that have platform API keys configured in environment
 */
export function getPlatformEnabledProviders(env: Env): string[] {
	const enabledProviders: string[] = [];

	// Check for provider API keys in environment variables
	// Using the same pattern as core.ts getApiKey function
	const providerList = [
		'anthropic',
		'openai',
		'google-ai-studio',
		'cerebras',
		'groq',
	];

	for (const provider of providerList) {
		// Convert provider name to env var format (same as core.ts)
		const providerKeyString = provider.toUpperCase().replaceAll('-', '_');
		const envKey = `${providerKeyString}_API_KEY` as keyof Env;
		const apiKey = env[envKey] as string;

		// Use the same validation logic as core.ts isValidApiKey function
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

/**
 * Get models available on platform based on environment configuration
 */
export function getPlatformAvailableModels(env: Env): AIModels[] {
	const platformEnabledProviders = getPlatformEnabledProviders(env);
    console.log("Platform enabled providers: ", platformEnabledProviders);

	// Filter models to only include those from providers with platform API keys
	return Object.values(AIModels).filter((model) => {
		const provider = getProviderFromModel(model);
		return platformEnabledProviders.includes(provider);
	});
}

/**
 * Validate if a model can be accessed based on environment config and user BYOK status
 */
export function validateModelAccessForEnvironment(
	model: AIModels | string,
	env: Env,
	userProviderStatus: UserProviderStatus[],
): boolean {
	const provider = getProviderFromModel(model);

	// Allow access if either:
	// 1. Provider has platform API key configured, OR
	// 2. User has valid BYOK key for this provider
	const hasPlatformKey = getPlatformEnabledProviders(env).includes(provider);
	const hasUserKey = userProviderStatus.some(
		(status) => status.provider === provider && status.hasValidKey,
	);

	return hasPlatformKey || hasUserKey;
}

/**
 * Get provider name from model string
 */
export function getProviderFromModel(model: AIModels | string): string {
	if (typeof model === 'string' && model.includes('/')) {
		return model.split('/')[0];
	}
	return 'cloudflare';
}
