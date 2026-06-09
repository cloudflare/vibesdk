export type RetryConfig = {
	enabled?: boolean;
	initialDelayMs?: number;
	maxDelayMs?: number;
	maxRetries?: number;
};

export type NormalizedRetryConfig = Required<RetryConfig>;

export function normalizeRetryConfig(
	retry: RetryConfig | undefined,
	defaults: NormalizedRetryConfig,
): NormalizedRetryConfig {
	return {
		enabled: retry?.enabled ?? defaults.enabled,
		initialDelayMs: retry?.initialDelayMs ?? defaults.initialDelayMs,
		maxDelayMs: retry?.maxDelayMs ?? defaults.maxDelayMs,
		maxRetries: retry?.maxRetries ?? defaults.maxRetries,
	};
}

export function computeBackoffMs(attempt: number, cfg: NormalizedRetryConfig): number {
	const base = Math.min(cfg.maxDelayMs, cfg.initialDelayMs * Math.pow(2, Math.max(0, attempt)));
	// +/-20% jitter to avoid thundering herds.
	const jitter = base * 0.2;
	return Math.max(0, Math.floor(base - jitter + Math.random() * jitter * 2));
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
