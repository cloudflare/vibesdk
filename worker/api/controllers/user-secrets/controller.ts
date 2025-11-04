/**
 * User Secrets Controller - RPC wrapper for UserSecretsStore DO
 */

import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import type { SecretMetadata, StoreSecretRequest, UpdateSecretRequest } from '../../../services/secrets/types';

type UserSecretsListData = { secrets: SecretMetadata[] };
type UserSecretStoreData = { secret: SecretMetadata; message: string };
type UserSecretValueData = { value: string; metadata: SecretMetadata };
type UserSecretUpdateData = { secret: SecretMetadata; message: string };
type UserSecretDeleteData = { message: string };

export class UserSecretsController extends BaseController {
    static logger = createLogger('UserSecretsController');

    /**
     * Get Durable Object stub for user
     */
    private static getUserSecretsStub(env: Env, userId: string) {
        const id = env.UserSecretsStore.idFromName(userId);
        return env.UserSecretsStore.get(id);
    }

    /**
     * List all secrets (metadata only)
     * GET /api/user-secrets
     */
    static async listSecrets(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<UserSecretsListData>>> {
        try {
            const user = context.user!;
            const stub = this.getUserSecretsStub(env, user.id);

            const secrets = await stub.listSecrets();

            return UserSecretsController.createSuccessResponse({ secrets });
        } catch (error) {
            this.logger.error('Error listing secrets:', error);
            return UserSecretsController.createErrorResponse<UserSecretsListData>(
                'Failed to list secrets',
                500
            );
        }
    }

    /**
     * Store a new secret
     * POST /api/user-secrets
     */
    static async storeSecret(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<UserSecretStoreData>>> {
        try {
            const user = context.user!;
            const stub = this.getUserSecretsStub(env, user.id);

            const bodyResult = await UserSecretsController.parseJsonBody<StoreSecretRequest>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<UserSecretStoreData>>;
            }

            const secret = await stub.storeSecret(bodyResult.data!);

            if (!secret) {
                return UserSecretsController.createErrorResponse<UserSecretStoreData>(
                    'Validation failed: Invalid secret data',
                    400
                );
            }

            return UserSecretsController.createSuccessResponse({
                secret,
                message: 'Secret stored successfully'
            });
        } catch (error) {
            this.logger.error('Error storing secret:', error);
            return UserSecretsController.createErrorResponse<UserSecretStoreData>(
                error instanceof Error ? error.message : 'Failed to store secret',
                500
            );
        }
    }

    /**
     * Get decrypted secret value
     * GET /api/user-secrets/:secretId/value
     */
    static async getSecretValue(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<UserSecretValueData>>> {
        try {
            const user = context.user!;
            const secretId = context.pathParams.secretId;

            if (!secretId) {
                return UserSecretsController.createErrorResponse<UserSecretValueData>(
                    'Secret ID is required',
                    400
                );
            }

            const stub = this.getUserSecretsStub(env, user.id);

            const result = await stub.getSecretValue(secretId);

            if (!result) {
                return UserSecretsController.createErrorResponse<UserSecretValueData>(
                    'Secret not found or has expired',
                    404
                );
            }

            return UserSecretsController.createSuccessResponse(result);
        } catch (error) {
            this.logger.error('Error getting secret value:', error);
            return UserSecretsController.createErrorResponse<UserSecretValueData>(
                'Failed to get secret value',
                500
            );
        }
    }

    /**
     * Update secret
     * PATCH /api/user-secrets/:secretId
     */
    static async updateSecret(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<UserSecretUpdateData>>> {
        try {
            const user = context.user!;
            const secretId = context.pathParams.secretId;

            if (!secretId) {
                return UserSecretsController.createErrorResponse<UserSecretUpdateData>(
                    'Secret ID is required',
                    400
                );
            }

            const bodyResult = await UserSecretsController.parseJsonBody<UpdateSecretRequest>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<UserSecretUpdateData>>;
            }

            const stub = this.getUserSecretsStub(env, user.id);

            const secret = await stub.updateSecret(secretId, bodyResult.data!);

            if (!secret) {
                return UserSecretsController.createErrorResponse<UserSecretUpdateData>(
                    'Secret not found or validation failed',
                    404
                );
            }

            return UserSecretsController.createSuccessResponse({
                secret,
                message: 'Secret updated successfully'
            });
        } catch (error) {
            this.logger.error('Error updating secret:', error);
            return UserSecretsController.createErrorResponse<UserSecretUpdateData>(
                'Failed to update secret',
                500
            );
        }
    }

    /**
     * Delete a secret (soft delete)
     * DELETE /api/user-secrets/:secretId
     */
    static async deleteSecret(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<UserSecretDeleteData>>> {
        try {
            const user = context.user!;
            const secretId = context.pathParams.secretId;

            if (!secretId) {
                return UserSecretsController.createErrorResponse<UserSecretDeleteData>(
                    'Secret ID is required',
                    400
                );
            }

            const stub = this.getUserSecretsStub(env, user.id);

            const deleted = await stub.deleteSecret(secretId);

            if (!deleted) {
                return UserSecretsController.createErrorResponse<UserSecretDeleteData>(
                    'Secret not found',
                    404
                );
            }

            return UserSecretsController.createSuccessResponse({
                message: 'Secret deleted successfully'
            });
        } catch (error) {
            this.logger.error('Error deleting secret:', error);
            return UserSecretsController.createErrorResponse<UserSecretDeleteData>(
                'Failed to delete secret',
                500
            );
        }
    }
}
