/**
 * Vault Controller - API endpoints for the user secrets vault
 */

import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import type {
	VaultStatusResponse,
	VaultConfigResponse,
	SetupVaultRequest,
} from '../../../services/secrets/vault-types';

type VaultStatusData = VaultStatusResponse;
type VaultConfigData = { config: VaultConfigResponse };
type VaultSetupData = { success: boolean };

/** Interface for the JSON body received from frontend (base64 strings) */
interface SetupVaultBody {
	kdfAlgorithm: 'argon2id' | 'webauthn-prf';
	kdfSalt: string;
	kdfParams?: { time: number; mem: number; parallelism: number };
	prfCredentialId?: string;
	prfSalt?: string;
	encryptedRecoveryCodes?: string;
	recoveryCodesNonce?: string;
	verificationBlob: string;
	verificationNonce: string;
}

export class UserSecretsController extends BaseController {
	static logger = createLogger('UserSecretsController');

	private static getVaultStub(env: Env, userId: string) {
		const id = env.UserSecretsStore.idFromName(userId);
		return env.UserSecretsStore.get(id);
	}

	/** Convert Uint8Array to base64 string for JSON response */
	private static uint8ArrayToBase64(arr: Uint8Array): string {
		let binary = '';
		for (let i = 0; i < arr.length; i++) {
			binary += String.fromCharCode(arr[i]);
		}
		return btoa(binary);
	}

	private static base64ToUint8Array(str: string): Uint8Array {
		const binary = atob(str);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	private static base64ToArrayBuffer(str: string): ArrayBuffer {
		const bytes = this.base64ToUint8Array(str);
		const buffer = new ArrayBuffer(bytes.length);
		new Uint8Array(buffer).set(bytes);
		return buffer;
	}

	// ========== WEBSOCKET CONNECTION ==========

	/**
	 * GET /api/vault/ws
	 * WebSocket connection to the user's vault Durable Object
	 */
	static async handleWebSocketConnection(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext
	): Promise<Response> {
		const userId = context.user!.id;
		this.logger.info('Vault WebSocket connection request', { userId });

		try {
			const stub = this.getVaultStub(env, userId);
			return stub.fetch(request);
		} catch (error) {
			this.logger.error('Failed to establish vault WebSocket connection:', error);
			const { 0: client, 1: server } = new WebSocketPair();
			server.accept();
			server.send(JSON.stringify({ type: 'error', message: 'Failed to connect to vault' }));
			server.close(1011, 'Internal error');
			return new Response(null, { status: 101, webSocket: client });
		}
	}

	// ========== VAULT LIFECYCLE ==========

	/**
	 * GET /api/vault/status
	 */
	static async getVaultStatus(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext
	): Promise<ControllerResponse<ApiResponse<VaultStatusData>>> {
		try {
			const stub = this.getVaultStub(env, context.user!.id);
			const status = await stub.getVaultStatus();
			return this.createSuccessResponse(status);
		} catch (error) {
			this.logger.error('Error getting vault status:', error);
			return this.createErrorResponse<VaultStatusData>('Failed to get vault status', 500);
		}
	}

	/**
	 * GET /api/vault/config
	 */
	static async getVaultConfig(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext
	): Promise<ControllerResponse<ApiResponse<VaultConfigData>>> {
		try {
			const stub = this.getVaultStub(env, context.user!.id);
			const config = await stub.getVaultConfig();

			if (!config) {
				return this.createErrorResponse<VaultConfigData>('Vault not set up', 404);
			}

			const isInvalidConfig =
				config.kdfSalt.length !== 32 ||
				config.verificationBlob.length === 0 ||
				config.verificationNonce.length === 0 ||
				(config.kdfAlgorithm === 'webauthn-prf' && (!config.prfCredentialId || !config.prfSalt || config.prfSalt.length !== 32));

			if (isInvalidConfig) {
				return this.createErrorResponse<VaultConfigData>(
					'Vault configuration invalid. Reset your vault and set it up again.',
					500
				);
			}

			// Convert Uint8Array fields to base64 strings for JSON response
			const configResponse: VaultConfigResponse = {
				kdfAlgorithm: config.kdfAlgorithm,
				kdfSalt: this.uint8ArrayToBase64(config.kdfSalt),
				kdfParams: config.kdfParams,
				prfCredentialId: config.prfCredentialId,
				prfSalt: config.prfSalt ? this.uint8ArrayToBase64(config.prfSalt) : undefined,
				verificationBlob: this.uint8ArrayToBase64(config.verificationBlob),
				verificationNonce: this.uint8ArrayToBase64(config.verificationNonce),
				hasRecoveryCodes: config.hasRecoveryCodes,
			};

			return this.createSuccessResponse({ config: configResponse });
		} catch (error) {
			this.logger.error('Error getting vault config:', error);
			return this.createErrorResponse<VaultConfigData>('Failed to get vault config', 500);
		}
	}

	/**
	 * POST /api/vault/setup
	 */
	static async setupVault(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext
	): Promise<ControllerResponse<ApiResponse<VaultSetupData>>> {
		try {
			const bodyResult = await this.parseJsonBody<SetupVaultBody>(request);
			if (!bodyResult.success) {
				return bodyResult.response as ControllerResponse<ApiResponse<VaultSetupData>>;
			}

			const body = bodyResult.data!;

			const trimmedKdfSalt = body.kdfSalt?.trim();
			const trimmedVerificationBlob = body.verificationBlob?.trim();
			const trimmedVerificationNonce = body.verificationNonce?.trim();

			if (!trimmedKdfSalt || !trimmedVerificationBlob || !trimmedVerificationNonce) {
				return this.createErrorResponse<VaultSetupData>('Invalid vault setup payload', 400);
			}

			let kdfSalt: ArrayBuffer;
			let verificationBlob: ArrayBuffer;
			let verificationNonce: ArrayBuffer;
			let prfSalt: ArrayBuffer | undefined;
			let encryptedRecoveryCodes: ArrayBuffer | undefined;
			let recoveryCodesNonce: ArrayBuffer | undefined;

			try {
				kdfSalt = this.base64ToArrayBuffer(trimmedKdfSalt);
				verificationBlob = this.base64ToArrayBuffer(trimmedVerificationBlob);
				verificationNonce = this.base64ToArrayBuffer(trimmedVerificationNonce);

				if (kdfSalt.byteLength !== 32 || verificationBlob.byteLength === 0 || verificationNonce.byteLength === 0) {
					return this.createErrorResponse<VaultSetupData>('Invalid vault setup payload', 400);
				}

				if (body.kdfAlgorithm === 'webauthn-prf') {
					const trimmedPrfSalt = body.prfSalt?.trim();
					const trimmedCredentialId = body.prfCredentialId?.trim();
					if (!trimmedCredentialId || !trimmedPrfSalt) {
						return this.createErrorResponse<VaultSetupData>('Passkey vault requires PRF configuration', 400);
					}
					prfSalt = this.base64ToArrayBuffer(trimmedPrfSalt);
					if (prfSalt.byteLength !== 32) {
						return this.createErrorResponse<VaultSetupData>('Invalid PRF salt', 400);
					}
				}

				if (body.encryptedRecoveryCodes || body.recoveryCodesNonce) {
					const trimmedEncryptedRecoveryCodes = body.encryptedRecoveryCodes?.trim();
					const trimmedRecoveryCodesNonce = body.recoveryCodesNonce?.trim();
					if (!trimmedEncryptedRecoveryCodes || !trimmedRecoveryCodesNonce) {
						return this.createErrorResponse<VaultSetupData>('Invalid recovery codes payload', 400);
					}
					encryptedRecoveryCodes = this.base64ToArrayBuffer(trimmedEncryptedRecoveryCodes);
					recoveryCodesNonce = this.base64ToArrayBuffer(trimmedRecoveryCodesNonce);
					if (encryptedRecoveryCodes.byteLength === 0 || recoveryCodesNonce.byteLength === 0) {
						return this.createErrorResponse<VaultSetupData>('Invalid recovery codes payload', 400);
					}
				}
			} catch {
				return this.createErrorResponse<VaultSetupData>('Invalid vault setup payload', 400);
			}

			const setupRequest: SetupVaultRequest = {
				kdfAlgorithm: body.kdfAlgorithm,
				kdfSalt,
				kdfParams: body.kdfParams,
				prfCredentialId: body.prfCredentialId?.trim() || undefined,
				prfSalt,
				encryptedRecoveryCodes,
				recoveryCodesNonce,
				verificationBlob,
				verificationNonce,
			};

			const stub = this.getVaultStub(env, context.user!.id);
			const success = await stub.setupVault(setupRequest);

			if (!success) {
				return this.createErrorResponse<VaultSetupData>('Vault already exists', 409);
			}

			return this.createSuccessResponse({ success: true });
		} catch (error) {
			this.logger.error('Error setting up vault:', error);
			return this.createErrorResponse<VaultSetupData>('Failed to setup vault', 500);
		}
	}

	/**
	 * POST /api/vault/reset
	 */
	static async resetVault(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext
	): Promise<ControllerResponse<ApiResponse<{ success: boolean }>>> {
		try {
			const stub = this.getVaultStub(env, context.user!.id);
			await stub.resetVault();
			return this.createSuccessResponse({ success: true });
		} catch (error) {
			this.logger.error('Error resetting vault:', error);
			return this.createErrorResponse<{ success: boolean }>('Failed to reset vault', 500);
		}
	}
}
