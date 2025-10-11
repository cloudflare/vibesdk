/**
 * Secrets Controller
 * Handles API endpoints for user secrets and API keys management
 */

import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { SecretsService } from '../../../database/services/SecretsService';
import {
    SecretsData,
    SecretStoreData,
    SecretDeleteData,
    SecretTemplatesData,
} from './types';
import { getTemplatesData } from '../../../types/secretsTemplates';

export class SecretsController extends BaseController {

    /**
     * Get all user secrets including inactive ones
     * GET /api/secrets
     */
    static async getAllSecrets(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SecretsData>>> {
        try {
            const user = context.user!;

            const secretsService = new SecretsService(env);
            const secrets = await secretsService.getAllUserSecrets(user.id);

            const responseData: SecretsData = { secrets };
            return SecretsController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting all user secrets:', error);
            return SecretsController.createErrorResponse<SecretsData>('Failed to get all user secrets', 500);
        }
    }

    /**
     * Store a new secret
     * POST /api/secrets
     */
    static async storeSecret(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SecretStoreData>>> {
        try {
            const user = context.user!;

            const bodyResult = await SecretsController.parseJsonBody<{
                templateId?: string;  // For predefined templates
                name?: string;        // For custom secrets
                envVarName?: string;  // For custom secrets
                value: string;
                description?: string;
            }>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<SecretStoreData>>;
            }

            const { templateId, name, envVarName, value, description } = bodyResult.data!;

            // Validate required fields
            if (!value) {
                return SecretsController.createErrorResponse<SecretStoreData>('Missing required field: value', 400);
            }

            let secretData;

            if (templateId) {
                // Using predefined template
                const templates = getTemplatesData();
                const template = templates.find(t => t.id === templateId);
                
                if (!template) {
                    return SecretsController.createErrorResponse<SecretStoreData>('Invalid template ID', 400);
                }

                // Validate against template validation if provided
                if (template.validation && !new RegExp(template.validation).test(value)) {
                    return SecretsController.createErrorResponse<SecretStoreData>(`Invalid format for ${template.displayName}. Expected format: ${template.placeholder}`, 400);
                }

                secretData = {
                    name: template.displayName,
                    provider: template.provider,
                    secretType: template.envVarName,
                    value: value.trim(),
                    description: template.description,
                    expiresAt: null
                };
            } else {
                // Custom secret
                if (!name || !envVarName) {
                    return SecretsController.createErrorResponse<SecretStoreData>('Missing required fields for custom secret: name, envVarName', 400);
                }

                // Validate environment variable name format
                if (!/^[A-Z][A-Z0-9_]*$/.test(envVarName)) {
                    return SecretsController.createErrorResponse<SecretStoreData>('Environment variable name must be uppercase and contain only letters, numbers, and underscores', 400);
                }

                secretData = {
                    name: name.trim(),
                    provider: 'custom',
                    secretType: envVarName.trim().toUpperCase(),
                    value: value.trim(),
                    description: description?.trim() || null,
                    expiresAt: null
                };
            }

            const secretsService = new SecretsService(env);
            const storedSecret = await secretsService.storeSecret(user.id, secretData);

            const responseData: SecretStoreData = {
                secret: storedSecret,
                message: 'Secret stored successfully'
            };

            return SecretsController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error storing secret:', error);
            return SecretsController.createErrorResponse<SecretStoreData>('Failed to store secret', 500);
        }
    }

    /**
     * Delete a secret
     * DELETE /api/secrets/:secretId
     */
    static async deleteSecret(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SecretDeleteData>>> {
        try {
            const user = context.user!;

            const secretId = context.pathParams.secretId;

            if (!secretId) {
                return SecretsController.createErrorResponse<SecretDeleteData>('Secret ID is required', 400);
            }

            const secretsService = new SecretsService(env);
            await secretsService.deleteSecret(user.id, secretId);

            const responseData: SecretDeleteData = {
                message: 'Secret deleted successfully'
            };

            return SecretsController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error deleting secret:', error);
            return SecretsController.createErrorResponse<SecretDeleteData>('Failed to delete secret', 500);
        }
    }

    /**
     * Toggle secret active status
     * PATCH /api/secrets/:secretId/toggle
     */
    static async toggleSecret(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SecretStoreData>>> {
        try {
            const user = context.user!;

            const secretId = context.pathParams.secretId;

            if (!secretId) {
                return SecretsController.createErrorResponse<SecretStoreData>('Secret ID is required', 400);
            }

            const secretsService = new SecretsService(env);
            const toggledSecret = await secretsService.toggleSecretActiveStatus(user.id, secretId);

            const responseData: SecretStoreData = {
                secret: toggledSecret,
                message: `Secret ${toggledSecret.isActive ? 'activated' : 'deactivated'} successfully`
            };

            return SecretsController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error toggling secret status:', error);
            return SecretsController.createErrorResponse<SecretStoreData>('Failed to toggle secret status', 500);
        }
    }

    /**
     * Get predefined secret templates for common providers
     * GET /api/secrets/templates
     */
    static async getTemplates(request: Request, _env: Env, _ctx: ExecutionContext): Promise<ControllerResponse<ApiResponse<SecretTemplatesData>>> {
        try {
            const url = new URL(request.url);
            const category = url.searchParams.get('category');
            
            let templates = getTemplatesData();
            
            if (category) {
                templates = templates.filter(template => template.category === category);
            }
            
            const responseData: SecretTemplatesData = { templates };
            return SecretsController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting secret templates:', error);
            return SecretsController.createErrorResponse<SecretTemplatesData>('Failed to get secret templates', 500);
        }
    }
}