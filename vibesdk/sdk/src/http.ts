import type { VibeClientOptions } from './types';
import { normalizeRetryConfig, computeBackoffMs, sleep, type NormalizedRetryConfig } from './retry';

type ExchangeApiKeyData = {
	accessToken: string;
	expiresIn: number;
	expiresAt: string;
	apiKeyId: string;
	user: unknown;
};

type ApiResponse<T> =
	| { success: true; data: T; message?: string }
	| { success: false; error: { message: string }; message?: string };

const HTTP_RETRY_DEFAULTS: NormalizedRetryConfig = {
	enabled: true,
	initialDelayMs: 1_000,
	maxDelayMs: 10_000,
	maxRetries: 3,
};

function isRetryableStatus(status: number): boolean {
	return status >= 500 && status < 600;
}

export class HttpClient {
	private cachedAccessToken: { token: string; expiresAtMs: number } | null = null;
	private retryCfg: NormalizedRetryConfig;

	constructor(private opts: VibeClientOptions) {
		this.retryCfg = normalizeRetryConfig(opts.retry, HTTP_RETRY_DEFAULTS);
	}

	get baseUrl(): string {
		return this.opts.baseUrl.replace(/\/$/, '');
	}

	private get fetchFn(): typeof fetch {
		// Wrap global fetch to preserve context in Workers runtime
		// See: https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors
		return this.opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
	}

	getToken(): string | undefined {
		return this.opts.token ?? this.cachedAccessToken?.token;
	}

	private async ensureAccessToken(): Promise<string | undefined> {
		if (this.opts.token) return this.opts.token;
		if (!this.opts.apiKey) return undefined;

		const now = Date.now();
		const skewMs = 30_000;
		if (this.cachedAccessToken && this.cachedAccessToken.expiresAtMs - skewMs > now) {
			return this.cachedAccessToken.token;
		}

		const url = `${this.baseUrl}/api/auth/exchange-api-key`;
		const resp = await this.fetchFn(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.opts.apiKey}`,
			},
		});

		if (!resp.ok) {
			const text = (await resp.text().catch(() => '')).slice(0, 1000);
			if (resp.status === 401) {
				throw new Error(
					`HTTP 401 for /api/auth/exchange-api-key: invalid API key (regenerate in Settings → API Keys). ${text || ''}`.trim(),
				);
			}
			throw new Error(`HTTP ${resp.status} for /api/auth/exchange-api-key: ${text || resp.statusText}`);
		}

		const parsed = (await resp.json()) as ApiResponse<ExchangeApiKeyData>;
		if (!parsed.success) {
			throw new Error(parsed.error.message);
		}

		const expiresAtMs = Date.parse(parsed.data.expiresAt);
		this.cachedAccessToken = { token: parsed.data.accessToken, expiresAtMs };
		return parsed.data.accessToken;
	}

	async headers(extra?: Record<string, string>): Promise<Headers> {
		const headers = new Headers({
			...this.opts.defaultHeaders,
			...extra,
		});

		const token = await this.ensureAccessToken();
		if (token) headers.set('Authorization', `Bearer ${token}`);

		return headers;
	}

	async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this.retryCfg.maxRetries; attempt++) {
			try {
				const resp = await this.fetchFn(url, init);
				if (!resp.ok) {
					const text = (await resp.text().catch(() => '')).slice(0, 1000);
					const error = new Error(`HTTP ${resp.status} for ${path}: ${text || resp.statusText}`);

					if (this.retryCfg.enabled && isRetryableStatus(resp.status) && attempt < this.retryCfg.maxRetries) {
						lastError = error;
						await sleep(computeBackoffMs(attempt, this.retryCfg));
						continue;
					}
					throw error;
				}
				return (await resp.json()) as T;
			} catch (error) {
				if (error instanceof TypeError && this.retryCfg.enabled && attempt < this.retryCfg.maxRetries) {
					lastError = error;
					await sleep(computeBackoffMs(attempt, this.retryCfg));
					continue;
				}
				throw error;
			}
		}

		throw lastError ?? new Error(`Failed after ${this.retryCfg.maxRetries} retries`);
	}

	async fetchRaw(path: string, init?: RequestInit): Promise<Response> {
		const url = `${this.baseUrl}${path}`;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this.retryCfg.maxRetries; attempt++) {
			try {
				const resp = await this.fetchFn(url, init);
				if (!resp.ok) {
					const text = (await resp.text().catch(() => '')).slice(0, 1000);
					const error = new Error(`HTTP ${resp.status} for ${path}: ${text || resp.statusText}`);

					if (this.retryCfg.enabled && isRetryableStatus(resp.status) && attempt < this.retryCfg.maxRetries) {
						lastError = error;
						await sleep(computeBackoffMs(attempt, this.retryCfg));
						continue;
					}
					throw error;
				}
				return resp;
			} catch (error) {
				if (error instanceof TypeError && this.retryCfg.enabled && attempt < this.retryCfg.maxRetries) {
					lastError = error;
					await sleep(computeBackoffMs(attempt, this.retryCfg));
					continue;
				}
				throw error;
			}
		}

		throw lastError ?? new Error(`Failed after ${this.retryCfg.maxRetries} retries`);
	}

	/**
	 * Request a WebSocket ticket for secure agent connection.
	 * Tickets are single-use and short-lived (15 seconds).
	 */
	async getWsTicket(agentId: string): Promise<{ ticket: string; expiresIn: number; expiresAt: string }> {
		const resp = await this.fetchJson<ApiResponse<{ ticket: string; expiresIn: number; expiresAt: string }>>(
			'/api/ws-ticket',
			{
				method: 'POST',
				headers: await this.headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify({ resourceType: 'agent', resourceId: agentId }),
			},
		);

		if (!resp.success) {
			throw new Error(resp.error.message || 'Failed to get WebSocket ticket');
		}

		return resp.data;
	}
}
