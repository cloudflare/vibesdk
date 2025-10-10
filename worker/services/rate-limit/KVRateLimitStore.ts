import { createObjectLogger } from '../../logger';
import { KVRateLimitConfig } from './config';
import type { RateLimitResult } from './DORateLimitStore';

export class KVRateLimitStore {
	static logger = createObjectLogger(this, 'KVRateLimitStore');

	static async increment(
		kv: KVNamespace,
		key: string,
		config: KVRateLimitConfig,
		incrementBy: number = 1
	): Promise<RateLimitResult> {
		const now = Date.now();

		const bucketSize = (config.bucketSize ?? 10) * 1000; // ms
		const burstWindow = (config.burstWindow ?? 60) * 1000; // ms
		const mainWindow = config.period * 1000; // ms

		const currentBucket = Math.floor(now / bucketSize) * bucketSize;

		try {
			const mainBuckets = this.generateBucketKeys(key, now, mainWindow, bucketSize);
			const burstBuckets = config.burst
				? this.generateBucketKeys(key, now, burstWindow, bucketSize)
				: [];

			const allBucketKeys = [...new Set([...mainBuckets, ...burstBuckets])];
			const bucketResults = await Promise.all(
				allBucketKeys.map(async (bucketKey) => {
					const value = await kv.get(bucketKey);
					return { key: bucketKey, count: value ? parseInt(value, 10) || 0 : 0 };
				})
			);

			const bucketMap = new Map(bucketResults.map((r) => [r.key, r.count]));

			const mainCount = mainBuckets.reduce((sum, bucketKey) => sum + (bucketMap.get(bucketKey) || 0), 0);
			const burstCount = burstBuckets.reduce((sum, bucketKey) => sum + (bucketMap.get(bucketKey) || 0), 0);

			if (mainCount >= config.limit) {
				return { success: false, remainingLimit: 0 };
			}

			if (config.burst && burstCount >= config.burst) {
				return { success: false, remainingLimit: 0 };
			}

			const currentBucketKey = `ratelimit:${key}:${currentBucket}`;
			const maxTtlSeconds = Math.max(config.period, config.burstWindow ?? 60) + (config.bucketSize ?? 10);

			await this.incrementBucketWithRetry(kv, currentBucketKey, maxTtlSeconds, incrementBy);

			return { success: true, remainingLimit: Math.max(0, config.limit - mainCount - incrementBy) };
		} catch (error) {
			this.logger.error('Failed to enforce KV rate limit', {
				key,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			// Fail open
			return { success: true };
		}
	}

	static async getRemainingLimit(
		kv: KVNamespace,
		key: string,
		config: KVRateLimitConfig
	): Promise<number> {
		const now = Date.now();
		const bucketSize = (config.bucketSize ?? 10) * 1000; // ms
		const mainWindow = config.period * 1000; // ms

		const mainBuckets = this.generateBucketKeys(key, now, mainWindow, bucketSize);
		const counts = await Promise.all(
			mainBuckets.map(async (bucketKey) => {
				const value = await kv.get(bucketKey);
				return value ? parseInt(value, 10) || 0 : 0;
			})
		);
		const mainCount = counts.reduce((sum, c) => sum + c, 0);
		return Math.max(0, config.limit - mainCount);
	}

	private static generateBucketKeys(key: string, now: number, windowMs: number, bucketSizeMs: number): string[] {
		const buckets: string[] = [];
		const windowStart = now - windowMs;

		for (let time = Math.floor(windowStart / bucketSizeMs) * bucketSizeMs; time <= now; time += bucketSizeMs) {
			buckets.push(`ratelimit:${key}:${time}`);
		}

		return buckets;
	}

	private static async incrementBucketWithRetry(
		kv: KVNamespace,
		bucketKey: string,
		ttlSeconds: number,
		maxRetries: number = 3,
        incrementBy: number = 1
	): Promise<void> {
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				const current = await kv.get(bucketKey);
				const newCount = (current ? parseInt(current, 10) : 0) + incrementBy;
				await kv.put(bucketKey, newCount.toString(), { expirationTtl: ttlSeconds });
				return;
			} catch (error) {
				if (error instanceof Error && error.message.includes('429') && attempt < maxRetries - 1) {
					await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
					continue;
				}
				throw error;
			}
		}
	}
}
