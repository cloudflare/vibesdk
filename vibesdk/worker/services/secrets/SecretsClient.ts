/**
 * SecretsClient - Abstraction layer for Agent DO to access vault secrets
 *
 * Handles:
 * - RPC calls to UserSecretsStore
 * - Automatic vault unlock prompting
 * - Blocking until unlock completes or times out
 */

import type { DurableObjectStub } from '@cloudflare/workers-types';

export type SecretRequestQuery = {
	provider?: string;
	envVarName?: string;
	secretId?: string;
};

export type SecretRequestResult = {
	success: boolean;
	value?: string;
	error?: 'vault_locked' | 'session_expired' | 'secret_not_found' | 'decryption_failed' | 'invalid_request' | string;
};

export interface UserSecretsStoreStub extends DurableObjectStub {
	requestSecret(query: SecretRequestQuery): Promise<SecretRequestResult>;
	isVaultUnlocked(): Promise<boolean>;
}

const UNLOCK_TIMEOUT_MS = 120_000;

export class SecretsClient {
	private vaultStub: UserSecretsStoreStub;
	private broadcaster: (type: string, data: Record<string, unknown>) => void;
	private unlockPromise: Promise<void> | null = null;
	private resolveUnlock: (() => void) | null = null;
	private rejectUnlock: ((err: Error) => void) | null = null;

	constructor(
		vaultStub: UserSecretsStoreStub,
		broadcaster: (type: string, data: Record<string, unknown>) => void
	) {
		this.vaultStub = vaultStub;
		this.broadcaster = broadcaster;
	}

	async get(query: SecretRequestQuery): Promise<string | null> {
		const result = await this.vaultStub.requestSecret(query);

		if (result.error === 'vault_locked') {
			await this.requestUnlock(query);
			const retry = await this.vaultStub.requestSecret(query);
			return retry.value ?? null;
		}

		if (!result.success) {
			return null;
		}

		return result.value ?? null;
	}

	async getMany(requests: SecretRequestQuery[]): Promise<Map<string, string | null>> {
		const results = new Map<string, string | null>();
		for (const req of requests) {
			const key = req.secretId ?? `${req.provider ?? 'unknown'}:${req.envVarName ?? 'unknown'}`;
			results.set(key, await this.get(req));
		}
		return results;
	}

	async getByProvider(provider: string, envVarName?: string): Promise<string | null> {
		return this.get({ provider, envVarName });
	}

	async isUnlocked(): Promise<boolean> {
		return this.vaultStub.isVaultUnlocked();
	}

	notifyUnlocked(): void {
		if (this.resolveUnlock) {
			this.resolveUnlock();
			this.resolveUnlock = null;
			this.rejectUnlock = null;
			this.unlockPromise = null;
		}
	}

	notifyUnlockFailed(reason?: string): void {
		if (this.rejectUnlock) {
			this.rejectUnlock(new Error(reason ?? 'Vault unlock cancelled'));
			this.resolveUnlock = null;
			this.rejectUnlock = null;
			this.unlockPromise = null;
		}
	}

	private async requestUnlock(query: SecretRequestQuery): Promise<void> {
		if (!this.unlockPromise) {
			this.unlockPromise = new Promise((resolve, reject) => {
				this.resolveUnlock = resolve;
				this.rejectUnlock = reject;

				const timeout = setTimeout(() => {
					if (this.rejectUnlock) {
						this.rejectUnlock(new Error('Vault unlock timeout'));
						this.resolveUnlock = null;
						this.rejectUnlock = null;
						this.unlockPromise = null;
					}
				}, UNLOCK_TIMEOUT_MS);

				const originalResolve = this.resolveUnlock;
				this.resolveUnlock = () => {
					clearTimeout(timeout);
					originalResolve();
				};

				const originalReject = this.rejectUnlock;
				this.rejectUnlock = (err: Error) => {
					clearTimeout(timeout);
					originalReject(err);
				};
			});

			const reason = query.provider ? `Secret needed for ${query.provider}` : 'Secret needed';
			this.broadcaster('vault_required', {
				reason,
				...query,
			});
		}

		await this.unlockPromise;
	}
}
