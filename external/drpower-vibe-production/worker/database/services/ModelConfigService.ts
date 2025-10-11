/**
 * Model Configuration Service
 * Handles CRUD operations for user model configurations
 */

import { BaseService } from './BaseService';
import { UserModelConfig, NewUserModelConfig, userModelConfigs } from '../schema';
import { eq, and } from 'drizzle-orm';
import { AgentActionKey, ModelConfig, AIModels } from '../../agents/inferutils/config.types';
import { AGENT_CONFIG } from '../../agents/inferutils/config';
import type { ReasoningEffort } from 'openai/resources.mjs';
import { generateId } from '../../utils/idGenerator';
import type { UserModelConfigWithMetadata } from '../types';

export class ModelConfigService extends BaseService {
    /**
     * Safely cast database string to ReasoningEffort type
     */
    private castToReasoningEffort(value: string | null): ReasoningEffort | undefined {
        if (!value) return undefined;
        return value as ReasoningEffort;
    }

    /**
     * Get all model configurations for a user (merged with defaults)
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

        // Start with all default configurations
        for (const [actionKey, defaultConfig] of Object.entries(AGENT_CONFIG)) {
            const userConfig = userConfigs.find((uc: UserModelConfig) => uc.agentActionName === actionKey);
            
            if (userConfig) {
                // Merge user config with defaults (user config takes precedence, null values use defaults)
                result[actionKey] = {
                    name: (userConfig.modelName as AIModels) ?? defaultConfig.name,
                    max_tokens: userConfig.maxTokens ?? defaultConfig.max_tokens,
                    temperature: userConfig.temperature !== null ? userConfig.temperature : defaultConfig.temperature,
                    reasoning_effort: this.castToReasoningEffort(userConfig.reasoningEffort) ?? defaultConfig.reasoning_effort,
                    fallbackModel: (userConfig.fallbackModel as AIModels) ?? defaultConfig.fallbackModel,
                    isUserOverride: true,
                    userConfigId: userConfig.id
                };
            } else {
                // Use default config
                result[actionKey] = {
                    ...defaultConfig,
                    isUserOverride: false
                };
            }
        }

        return result as Record<AgentActionKey, UserModelConfigWithMetadata>;
    }

    /**
     * Get a specific model configuration for a user (merged with defaults for UI display)
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

        const defaultConfig = AGENT_CONFIG[agentActionName];
        
        if (userConfig.length > 0) {
            const config = userConfig[0];
            return {
                name: (config.modelName as AIModels) ?? defaultConfig.name,
                max_tokens: config.maxTokens ?? defaultConfig.max_tokens,
                temperature: config.temperature !== null ? config.temperature : defaultConfig.temperature,
                reasoning_effort: this.castToReasoningEffort(config.reasoningEffort) ?? defaultConfig.reasoning_effort,
                fallbackModel: (config.fallbackModel as AIModels) ?? defaultConfig.fallbackModel,
                isUserOverride: true,
                userConfigId: config.id
            };
        }

        return {
            ...defaultConfig,
            isUserOverride: false
        };
    }

    /**
     * Get raw user model configuration without merging with defaults
     * Returns null if user has no custom config (for executeInference usage)
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

        if (userConfig.length > 0) {
            const config = userConfig[0];
            
            // Only create ModelConfig if user has actual overrides
            const hasOverrides = config.modelName || config.maxTokens || 
                                config.temperature !== null || config.reasoningEffort || 
                                config.fallbackModel;
            
            if (hasOverrides) {
                const defaultConfig = AGENT_CONFIG[agentActionName];
                const modelConfig: ModelConfig = {
                    name: (config.modelName as AIModels) || defaultConfig.name,
                    max_tokens: config.maxTokens || defaultConfig.max_tokens,
                    temperature: config.temperature !== null ? config.temperature : defaultConfig.temperature,
                    reasoning_effort: this.castToReasoningEffort(config.reasoningEffort) ?? defaultConfig.reasoning_effort,
                    fallbackModel: (config.fallbackModel as AIModels) || defaultConfig.fallbackModel,
                };
                return modelConfig;
            }
        }

        // Return null if user has no custom config - let AGENT_CONFIG defaults rule
        return null;
    }

    /**
     * Update or create a user model configuration
     */
    async upsertUserModelConfig(
        userId: string,
        agentActionName: AgentActionKey,
        config: Partial<ModelConfig>
    ): Promise<UserModelConfig> {
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
            modelName: config.name || null,
            maxTokens: config.max_tokens || null,
            temperature: config.temperature !== undefined ? config.temperature : null,
            reasoningEffort: (config.reasoning_effort && config.reasoning_effort !== 'minimal') ? config.reasoning_effort : null,
            fallbackModel: config.fallbackModel || null,
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