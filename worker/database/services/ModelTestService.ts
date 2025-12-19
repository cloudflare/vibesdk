/**
 * Model Test Service
 * Handles testing of model configurations with user API keys
 */

import { BaseService } from './BaseService';
import { AIModels } from '../../agents/inferutils/config.types';
import { infer, InferError } from '../../agents/inferutils/core';
import { createUserMessage } from '../../agents/inferutils/common';
import type { TestResult, ModelTestRequest, ModelTestResult } from '../types';
import { isErrorWithMessage } from '../types';

export class ModelTestService extends BaseService {
    /**
     * Test a model configuration by making a simple chat request using core inference
     */
    async testModelConfig({
        modelConfig,
        userApiKeys,
        testPrompt = "Hello! Please respond with 'Test successful' to confirm the connection is working."
    }: ModelTestRequest): Promise<ModelTestResult> {
        const startTime = Date.now();
        const modelName: string = modelConfig.name;
        const cleanModelName = modelName.replace(/\[.*?\]/, ''); // Remove provider prefix for display

        try {
            const testMessage = createUserMessage(testPrompt);

            // Use core inference system to test the model configuration
            const response = await infer({
                env: this.env,
                metadata: { agentId: `test-${Date.now()}`, userId: 'system' }, // Generate unique test ID
                messages: [testMessage],
                modelName: modelName,
                maxTokens: Math.min(modelConfig.max_tokens || 100, 100), // Limit to 100 tokens for test
                temperature: modelConfig.temperature || 0.1,
                reasoning_effort: modelConfig.reasoning_effort,
                actionKey: 'testModelConfig',
                runtimeOverrides: {
                    userApiKeys
                }
            });

            const endTime = Date.now();
            const latencyMs = endTime - startTime;

            const content = response.string || '';
            
            return {
                success: true,
                responsePreview: content.length > 100 ? content.substring(0, 100) + '...' : content,
                latencyMs,
                modelUsed: cleanModelName,
            };

        } catch (error: unknown) {
            const endTime = Date.now();
            const latencyMs = endTime - startTime;

            // Handle InferError and other errors from core system
            let rawError = 'Unknown error occurred';
            
            if (error instanceof InferError) {
                rawError = error.message;
            } else if (error instanceof Error) {
                rawError = error.message;
            } else if (isErrorWithMessage(error)) {
                // Handle error objects from the core system
                if (error.message) {
                    rawError = error.message;
                } else if (error.error?.message) {
                    rawError = error.error.message;
                } else {
                    rawError = JSON.stringify(error);
                }
            } else {
                rawError = String(error);
            }

            return {
                success: false,
                error: rawError,
                latencyMs,
                modelUsed: cleanModelName
            };
        }
    }

    /**
     * Test a specific provider's API key using core inference
     */
    async testProviderKey(provider: string, apiKey: string): Promise<TestResult> {
        const startTime = Date.now();

        try {
            // Get a simple model for this provider to test with
            const testModel = this.getTestModelForProvider(provider);
            if (!testModel) {
                return {
                    success: false,
                    error: `No test model available for provider: ${provider}`
                };
            }

            // Create a userApiKeys map with the test key
            const testApiKeys = new Map<string, string>();
            testApiKeys.set(provider, apiKey);
            
            // Create test message using core abstractions
            const testMessage = createUserMessage('Test connection. Please respond with "OK".');

            // Use core inference system to test the provider key
            const response = await infer({
                env: this.env,
                metadata: { agentId: `provider-test-${Date.now()}`, userId: 'system' }, // Generate unique test ID
                messages: [testMessage],
                modelName: testModel,
                maxTokens: 10,
                temperature: 0,
                actionKey: 'testModelConfig',
                runtimeOverrides: {
                    userApiKeys: Object.fromEntries(testApiKeys)
                }
            });

            const endTime = Date.now();
            const cleanModelName = testModel.replace(/\[.*?\]/, '');

            if (response.string && response.string.trim()) {
                return {
                    success: true,
                    model: cleanModelName,
                    latencyMs: endTime - startTime
                };
            } else {
                return {
                    success: false,
                    error: 'No response received from model'
                };
            }

        } catch (error: unknown) {
            const endTime = Date.now();
            const latencyMs = endTime - startTime;

            // Handle InferError and other errors from core system
            let rawError = 'Connection test failed';
            
            if (error instanceof InferError) {
                rawError = error.message;
            } else if (error instanceof Error) {
                rawError = error.message;
            } else if (isErrorWithMessage(error)) {
                // Handle error objects from the core system
                if (error.message) {
                    rawError = error.message;
                } else if (error.error?.message) {
                    rawError = error.error.message;
                } else {
                    rawError = JSON.stringify(error);
                }
            } else {
                rawError = String(error);
            }

            return {
                success: false,
                error: rawError,
                latencyMs
            };
        }
    }

    /**
     * Get a simple test model for a given provider
     */
    private getTestModelForProvider(provider: string): string | null {
        const testModels: Record<string, string> = {
            'openai': AIModels.OPENAI_5_MINI,
            'anthropic': AIModels.CLAUDE_4_SONNET,
            'google-ai-studio': AIModels.GEMINI_2_5_FLASH,
            'gemini': AIModels.GEMINI_2_5_FLASH,
            // 'openrouter': AIModels.OPENROUTER_QWEN_3_CODER, // Removed - not available
            // 'cerebras': AIModels.CEREBRAS_GPT_OSS
        };

        return testModels[provider] || null;
    }
}