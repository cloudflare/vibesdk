import { DurableObject } from 'cloudflare:workers';

export interface RateLimitBucket {
    count: number;
    timestamp: number;
}

export interface RateLimitState {
    buckets: Map<string, RateLimitBucket>;
    lastCleanup: number;
}

export interface RateLimitConfig {
    limit: number;
    period: number; // in seconds
    burst?: number;
    burstWindow?: number; // in seconds
    bucketSize?: number; // in seconds
    dailyLimit?: number; // max requests in a rolling 24h window
}

export interface RateLimitResult {
    success: boolean;
    remainingLimit?: number;
}

/**
 * DORateLimitStore - Durable Object-based rate limiting store
 * 
 * Provides distributed rate limiting using bucketed sliding window algorithm
 * similar to the KV implementation but with better scalability, consistency and cost-effectiveness
 */
export class DORateLimitStore extends DurableObject<Env> {
    private state: RateLimitState = {
        buckets: new Map(),
        lastCleanup: Date.now()
    };
    private initialized = false;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async increment(key: string, config: RateLimitConfig, incrementBy: number = 1): Promise<RateLimitResult> {
        await this.ensureInitialized();
        
        const now = Date.now();
        const bucketSize = (config.bucketSize || 10) * 1000; // Convert to milliseconds
        const burstWindow = (config.burstWindow || 60) * 1000; // Convert to milliseconds
        const mainWindow = config.period * 1000; // Convert to milliseconds
        const dailyWindow = config.dailyLimit ? 24 * 60 * 60 * 1000 : 0; // 24 hours in ms if enabled

        const currentBucket = Math.floor(now / bucketSize) * bucketSize;
        const bucketKey = `${key}:${currentBucket}`;

        // Periodic cleanup every 5 minutes
        if (now - this.state.lastCleanup > 5 * 60 * 1000) {
            await this.cleanup(now, Math.max(mainWindow, burstWindow, dailyWindow));
        }

        // Calculate current counts
        const mainBuckets = this.getBucketsInWindow(key, now, mainWindow, bucketSize);
        const burstBuckets = config.burst ? this.getBucketsInWindow(key, now, burstWindow, bucketSize) : [];
        const dailyBuckets = config.dailyLimit ? this.getBucketsInWindow(key, now, dailyWindow, bucketSize) : [];

        const mainCount = mainBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
        const burstCount = burstBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
        const dailyCount = dailyBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

        // Check limits
        if (mainCount >= config.limit) {
            return { success: false, remainingLimit: 0 };
        }

        if (config.burst && burstCount >= config.burst) {
            return { success: false, remainingLimit: 0 };
        }

        if (config.dailyLimit && dailyCount >= config.dailyLimit) {
            return { success: false, remainingLimit: 0 };
        }

        // Increment current bucket
        const existing = this.state.buckets.get(bucketKey);
        const newCount = (existing?.count || 0) + incrementBy;
        
        this.state.buckets.set(bucketKey, {
            count: newCount,
            timestamp: now
        });

        await this.persistState();

        // Compute remaining across applicable windows
        const mainRemaining = config.limit - mainCount - incrementBy;
        const dailyRemaining = config.dailyLimit != null ? (config.dailyLimit - dailyCount - incrementBy) : undefined;
        const remaining = dailyRemaining != null ? Math.min(mainRemaining, dailyRemaining) : mainRemaining;

        return { 
            success: true, 
            remainingLimit: Math.max(0, remaining) 
        };
    }

    async getRemainingLimit(key: string, config: RateLimitConfig): Promise<number> {
        await this.ensureInitialized();
        
        const now = Date.now();
        const bucketSize = (config.bucketSize || 10) * 1000;
        const mainWindow = config.period * 1000;
        const dailyWindow = config.dailyLimit ? 24 * 60 * 60 * 1000 : 0;

        const mainBuckets = this.getBucketsInWindow(key, now, mainWindow, bucketSize);
        const mainCount = mainBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

        const mainRemaining = config.limit - mainCount;

        if (config.dailyLimit) {
            const dailyBuckets = this.getBucketsInWindow(key, now, dailyWindow, bucketSize);
            const dailyCount = dailyBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
            const dailyRemaining = config.dailyLimit - dailyCount;
            return Math.max(0, Math.min(mainRemaining, dailyRemaining));
        }

        return Math.max(0, mainRemaining);
    }

    async resetLimit(key?: string): Promise<void> {
        await this.ensureInitialized();
        
        if (key) {
            // Reset specific key buckets
            const keysToDelete = Array.from(this.state.buckets.keys())
                .filter(bucketKey => bucketKey.startsWith(`${key}:`));
            
            for (const bucketKey of keysToDelete) {
                this.state.buckets.delete(bucketKey);
            }
        } else {
            // Reset all buckets
            this.state.buckets.clear();
        }

        await this.persistState();
    }

    private getBucketsInWindow(key: string, now: number, windowMs: number, bucketSizeMs: number): RateLimitBucket[] {
        const buckets: RateLimitBucket[] = [];
        const windowStart = now - windowMs;
        
        for (let time = Math.floor(windowStart / bucketSizeMs) * bucketSizeMs; time <= now; time += bucketSizeMs) {
            const bucketKey = `${key}:${time}`;
            const bucket = this.state.buckets.get(bucketKey);
            if (bucket) {
                buckets.push(bucket);
            }
        }
        
        return buckets;
    }

    private async cleanup(now: number, maxWindow: number): Promise<void> {
        const cutoff = now - maxWindow;
        let needsUpdate = false;

        for (const [bucketKey, bucket] of this.state.buckets) {
            if (bucket.timestamp < cutoff) {
                this.state.buckets.delete(bucketKey);
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.state.lastCleanup = now;
            await this.persistState();
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            const stored = await this.ctx.storage.get<{
                buckets: [string, RateLimitBucket][];
                lastCleanup: number;
            }>('state');
            
            if (stored) {
                this.state = {
                    buckets: new Map(stored.buckets),
                    lastCleanup: stored.lastCleanup
                };
            }
            
            this.initialized = true;
        }
    }

    private async persistState(): Promise<void> {
        await this.ctx.storage.put('state', {
            buckets: Array.from(this.state.buckets.entries()),
            lastCleanup: this.state.lastCleanup
        });
    }
}