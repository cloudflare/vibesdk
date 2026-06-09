export interface KVCacheOptions {
    ttl?: number; // seconds
    prefix?: string;
}

export class KVCache {
    constructor(private kv: KVNamespace) {}

    private generateKey(prefix: string, key: string): string {
        return `cache-${prefix}:${key}`;
    }

    async get<T>(prefix: string, key: string): Promise<T | null> {
        const fullKey = this.generateKey(prefix, key);
        const value = await this.kv.get(fullKey, 'json');
        return value as T | null;
    }

    async set<T>(prefix: string, key: string, value: T, ttl?: number): Promise<void> {
        const fullKey = this.generateKey(prefix, key);
        const options: KVNamespacePutOptions = {};
        if (ttl) {
            options.expirationTtl = ttl;
        }
        await this.kv.put(fullKey, JSON.stringify(value), options);
    }

    async delete(prefix: string, key: string): Promise<void> {
        const fullKey = this.generateKey(prefix, key);
        await this.kv.delete(fullKey);
    }

    async deleteByPrefix(prefix: string): Promise<void> {
        let cursor: string | undefined = undefined;
        do {
            const list: KVNamespaceListResult<unknown> = await this.kv.list({ prefix: `cache-${prefix}:`, cursor });
            await Promise.all(list.keys.map((key: KVNamespaceListKey<unknown>) => this.kv.delete(key.name)));
            cursor = list.list_complete ? undefined : list.cursor;
        } while (cursor);
    }

    async invalidate(patterns: string[]): Promise<void> {
        await Promise.all(patterns.map(pattern => this.deleteByPrefix(pattern)));
    }
}

export function createKVCache(env: Env): KVCache {
    const kv = env.VibecoderStore;
    return new KVCache(kv);
}
