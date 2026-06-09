/**
 * Model Configuration Service
 * Handles CRUD operations for user model configurations with constraint enforcement
 */

import { BaseService } from './BaseService';
import { UserModelConfig, NewUserModelConfig, userModelConfigs } from '../schema';
import { eq, and } from 'drizzle-orm';
import { AgentActionKey, ModelConfig } from '../../agents/inferutils/config.types';
import { AGENT_CONFIG, AGENT_CONSTRAINTS } from '../../agents/inferutils/config';
import type { ReasoningEffort } from '../../agents/inferutils/config.types';
import { generateId } from '../../utils/idGenerator';
import type { UserModelConfigWithMetadata } from '../types';
import { validateAgentConstraints } from 'worker/api/controllers/modelConfig/constraintHelper';
import { toAIModel } from '../../agents/inferutils/config.types';

type ConstraintStrategy = 'throw' | 'fallback';

export class ModelConfigService extends BaseService {
	private castToReasoningEffort(value: string | null): ReasoningEffort | undefined {
		if (!value) return undefined;
		return value as ReasoningEffort;
	}

	private validateModel(
		agentActionName: AgentActionKey,
		modelName: string | undefined,
		modelType: 'primary' | 'fallback',
		strategy: ConstraintStrategy
	): boolean {
		if (!modelName) return true;

		const constraintCheck = validateAgentConstraints(agentActionName, modelName);

		if (constraintCheck.constraintEnabled && !constraintCheck.valid) {
			const errorMsg = `${modelType === 'fallback' ? 'Fallback model' : 'Model'} '${modelName}' is not allowed for '${agentActionName}'. ` +
				`Allowed models: ${constraintCheck.allowedModels?.join(', ')}`;

			if (strategy === 'throw') {
				throw new Error(errorMsg);
			} else {
				this.logger.warn(`${errorMsg} - falling back to default`);
				return false;
			}
		}

		return true;
	}

	/**
	 * Core merging logic: converts DB record to merged config.
	 * Single source of truth for merge semantics.
	 */
	private mergeWithDefaults(
		userConfig: UserModelConfig | null,
		agentActionName: AgentActionKey
	): UserModelConfigWithMetadata {
		const defaultConfig = AGENT_CONFIG[agentActionName];

		if (!userConfig) {
			return {
				...defaultConfig,
				isUserOverride: false
			};
		}

		// Merge user config with defaults (user takes precedence, null values use defaults)
		// Validate database values before using them
		return {
			name: toAIModel(userConfig.modelName) ?? defaultConfig.name,
			max_tokens: userConfig.maxTokens ?? defaultConfig.max_tokens,
			temperature: userConfig.temperature !== null ? userConfig.temperature : defaultConfig.temperature,
			reasoning_effort: this.castToReasoningEffort(userConfig.reasoningEffort) ?? defaultConfig.reasoning_effort,
			fallbackModel: toAIModel(userConfig.fallbackModel) ?? defaultConfig.fallbackModel,
			isUserOverride: true,
			userConfigId: userConfig.id
		};
	}

	/**
	 * Applies constraint validation to merged config.
	 * Returns fallback config if constraints violated
	 */
	private applyConstraintsWithFallback(
		mergedConfig: UserModelConfigWithMetadata,
		agentActionName: AgentActionKey
	): UserModelConfigWithMetadata {
		const defaultConfig = AGENT_CONFIG[agentActionName];

		// Already a default config - no validation needed
		if (!mergedConfig.isUserOverride) {
			return mergedConfig;
		}

		// Validate primary model - fall back to full default if invalid
		if (!this.validateModel(agentActionName, mergedConfig.name, 'primary', 'fallback')) {
			return {
				...defaultConfig,
				isUserOverride: false
			};
		}

		// Validate fallback model - use default fallback only if invalid
		if (!this.validateModel(agentActionName, mergedConfig.fallbackModel, 'fallback', 'fallback')) {
			return {
				...mergedConfig,
				fallbackModel: defaultConfig.fallbackModel
			};
		}

		return mergedConfig;
	}

	/**
	 * Get all model configurations for a user (merged with defaults, constraint-enforced)
	 */
	async getUserModelConfigs(userId: string): Promise<Record<AgentActionKey, UserModelConfigWithMetadata>> {
		const userConfigs = await this.database
			.select()
			.from(userModelConfigs)
			.where(and(
				eq(userModelConfigs.userId, userId),
				eq(userModelConfigs.isActive, true)
			));

		const result: Record<string, UserModelConfigWithMetadata> = {};

		// Process all agent actions
		for (const actionKey of Object.keys(AGENT_CONFIG)) {
			const userConfig = userConfigs.find((uc: UserModelConfig) => uc.agentActionName === actionKey) ?? null;
			const mergedConfig = this.mergeWithDefaults(userConfig, actionKey as AgentActionKey);
			result[actionKey] = this.applyConstraintsWithFallback(mergedConfig, actionKey as AgentActionKey);
		}

		return result as Record<AgentActionKey, UserModelConfigWithMetadata>;
	}

	/**
	 * Get a specific model configuration for a user (merged with defaults, constraint-enforced)
	 */
	async getUserModelConfig(userId: string, agentActionName: AgentActionKey): Promise<UserModelConfigWithMetadata> {
		const userConfig = await this.database
			.select()
			.from(userModelConfigs)
			.where(and(
				eq(userModelConfigs.userId, userId),
				eq(userModelConfigs.agentActionName, agentActionName),
				eq(userModelConfigs.isActive, true)
			))
			.limit(1);

		const mergedConfig = this.mergeWithDefaults(userConfig[0] ?? null, agentActionName);
		return this.applyConstraintsWithFallback(mergedConfig, agentActionName);
	}

	/**
	 * Get raw user model configuration without merging with defaults.
	 * Returns null if user has no custom config OR if config violates constraints.
	 */
	async getRawUserModelConfig(userId: string, agentActionName: AgentActionKey): Promise<ModelConfig | null> {
		const userConfig = await this.database
			.select()
			.from(userModelConfigs)
			.where(and(
				eq(userModelConfigs.userId, userId),
				eq(userModelConfigs.agentActionName, agentActionName),
				eq(userModelConfigs.isActive, true)
			))
			.limit(1);

		if (userConfig.length === 0) {
			return null;
		}

		const config = userConfig[0];

		// Check if user has actual overrides (any non-null value)
		const hasOverrides = config.modelName || config.maxTokens ||
			config.temperature !== null || config.reasoningEffort ||
			config.fallbackModel;

		if (!hasOverrides) {
			return null;
		}

		// Merge with defaults
		const mergedConfig = this.mergeWithDefaults(config, agentActionName);

		// Validate primary model - return null if violated (triggers AGENT_CONFIG fallback)
		if (!this.validateModel(agentActionName, mergedConfig.name, 'primary', 'fallback')) {
			return null;
		}

		// Validate fallback model - use default fallback if invalid
		const defaultConfig = AGENT_CONFIG[agentActionName];
		const validFallback = this.validateModel(agentActionName, mergedConfig.fallbackModel, 'fallback', 'fallback')
			? mergedConfig.fallbackModel
			: defaultConfig.fallbackModel;

		return {
			name: mergedConfig.name,
			max_tokens: mergedConfig.max_tokens,
			temperature: mergedConfig.temperature,
			reasoning_effort: mergedConfig.reasoning_effort,
			fallbackModel: validFallback
		};
	}

    /**
     * Get current model configurations (defaults + user overrides)
     * Used by WebSocket to provide configuration info to frontend
     */
    async getModelConfigsInfo(userId: string) {
        if (!userId) {
            throw new Error('No user session available for model configurations');
        }

        try {
            // Get all user configs
            const userConfigsRecord = await this.getUserModelConfigs(userId);
            
            // Transform to match frontend interface with constraint info
            const agents = Object.entries(AGENT_CONFIG).map(([key, config]) => {
                const constraint = AGENT_CONSTRAINTS.get(key as AgentActionKey);
                return {
                    key,
                    name: config.name,
                    description: config.description,
                    constraint: constraint ? {
                        enabled: constraint.enabled,
                        allowedModels: Array.from(constraint.allowedModels)
                    } : undefined
                };
            });

            const userModelConfigs: Record<string, ModelConfig> = {}
            const defaultConfigs: Record<string, ModelConfig> = {};
            for (const [actionKey, mergedConfig] of Object.entries(userConfigsRecord)) {
                if (mergedConfig.isUserOverride) {
                    const { isUserOverride, userConfigId, ...modelConfig } = mergedConfig;
                    userModelConfigs[actionKey] = modelConfig;
                }
                const defaultConfig = AGENT_CONFIG[actionKey as AgentActionKey];
                if (defaultConfig) {
                    defaultConfigs[actionKey] = defaultConfig;
                }
            }

            return {
                agents,
                userConfigs: userModelConfigs,
                defaultConfigs
            };
        } catch (error) {
            console.error('Error fetching model configs info:', error);
            throw error;
        }
    }

	/**
	 * Update or create a user model configuration.
	 * Validates constraints - throws on violation.
	 */
	async upsertUserModelConfig(
		userId: string,
		agentActionName: AgentActionKey,
		config: Partial<ModelConfig>
	): Promise<UserModelConfig> {
		// Validate constraints (throws if invalid)
		this.validateModel(agentActionName, config.name, 'primary', 'throw');
		this.validateModel(agentActionName, config.fallbackModel, 'fallback', 'throw');

		const existingConfig = await this.database
			.select()
			.from(userModelConfigs)
			.where(and(
				eq(userModelConfigs.userId, userId),
				eq(userModelConfigs.agentActionName, agentActionName)
			))
			.limit(1);

		const configData: Partial<NewUserModelConfig> = {
			userId,
			agentActionName,
			modelName: config.name ?? null,
			maxTokens: config.max_tokens ?? null,
			temperature: config.temperature !== undefined ? config.temperature : null,
			reasoningEffort: (config.reasoning_effort && config.reasoning_effort !== 'minimal') ? config.reasoning_effort : null,
			fallbackModel: config.fallbackModel ?? null,
			isActive: true,
			updatedAt: new Date()
		};

		if (existingConfig.length > 0) {
			// Update existing config
			const updated = await this.database
				.update(userModelConfigs)
				.set(configData)
				.where(eq(userModelConfigs.id, existingConfig[0].id))
				.returning();

			return updated[0];
		} else {
			// Create new config
			const newConfig: NewUserModelConfig = {
				id: generateId(),
				...configData,
				createdAt: new Date()
			} as NewUserModelConfig;

			const created = await this.database
				.insert(userModelConfigs)
				.values(newConfig)
				.returning();

			return created[0];
		}
	}

	/**
	 * Delete/reset a user model configuration (revert to default)
	 */
	async deleteUserModelConfig(userId: string, agentActionName: AgentActionKey): Promise<boolean> {
		const result = await this.database
			.delete(userModelConfigs)
			.where(and(
				eq(userModelConfigs.userId, userId),
				eq(userModelConfigs.agentActionName, agentActionName)
			));

		return (result.meta?.changes || 0) > 0;
	}

	/**
	 * Get default configurations (from AGENT_CONFIG)
	 */
	getDefaultConfigs(): Record<AgentActionKey, ModelConfig> {
		return AGENT_CONFIG;
	}

	/**
	 * Reset all user configurations to defaults
	 */
	async resetAllUserConfigs(userId: string): Promise<number> {
		const result = await this.database
			.delete(userModelConfigs)
			.where(eq(userModelConfigs.userId, userId));

		return result.meta?.changes || 0;
	}
}
