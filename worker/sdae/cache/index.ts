/**
 * SDAE Multi-Level Cache
 *
 * Two-tier caching strategy for DAG node results:
 *   L1 — Cloudflare KV (fast, eventually-consistent, TTL-aware)
 *   L2 — D1 SQLite (persistent, strongly-consistent, queryable)
 *
 * Cache keys are scoped by contentHash + tenantId. This means:
 * - Identical operations across tenants never share cache (security).
 * - Renaming a nodeId doesn't bust the cache (contentHash is content-based).
 * - Changing params, dependencies, or environment does bust the cache.
 *
 * The cache is write-through: a set() writes to both L1 and L2.
 * A get() checks L1 first; on miss, checks L2 and backfills L1.
 */

import type { CachedResult } from '../ir';

// ---------------------------------------------------------------------------
// Key helpers — tenant-scoped, deterministic
// ---------------------------------------------------------------------------

function cacheKey(contentHash: string, tenantId: string): string {
	return `sdae:cache:${tenantId}:${contentHash}`;
}

function projectCachePrefix(projectId: string, tenantId: string): string {
	return `sdae:cache:${tenantId}:proj:${projectId}`;
}

// ---------------------------------------------------------------------------
// SDAECache
// ---------------------------------------------------------------------------

export class SDAECache {
	constructor(
		private kv: KVNamespace,
		private d1?: D1Database,
	) {}

	/**
	 * Look up a cached result by contentHash, scoped to tenant.
	 * Checks L1 (KV) first, then L2 (D1). Backfills L1 on L2 hit.
	 */
	async get(
		contentHash: string,
		tenantId: string,
	): Promise<CachedResult | null> {
		const key = cacheKey(contentHash, tenantId);

		// L1: KV lookup
		const kvHit = await this.kv.get(key, 'text');
		if (kvHit) {
			try {
				return JSON.parse(kvHit) as CachedResult;
			} catch {
				// Corrupt KV entry — delete and fall through to L2
				await this.kv.delete(key);
			}
		}

		// L2: D1 lookup (if available)
		if (!this.d1) return null;

		try {
			const row = await this.d1
				.prepare(
					'SELECT data FROM sdae_cache WHERE content_hash = ? AND tenant_id = ? LIMIT 1',
				)
				.bind(contentHash, tenantId)
				.first<{ data: string }>();

			if (!row) return null;

			const result = JSON.parse(row.data) as CachedResult;

			// Backfill L1 from L2 hit (60 min TTL for backfill)
			await this.kv.put(key, row.data, {
				expirationTtl: result.ttlSeconds ?? 3600,
			});

			return result;
		} catch {
			// D1 query failure is non-fatal — cache miss
			return null;
		}
	}

	/**
	 * Write-through: stores the result in both L1 (KV) and L2 (D1).
	 */
	async set(
		contentHash: string,
		tenantId: string,
		result: unknown,
		ttlSeconds?: number,
	): Promise<void> {
		const key = cacheKey(contentHash, tenantId);
		const entry: CachedResult = {
			contentHash,
			tenantId,
			output: result,
			createdAt: new Date().toISOString(),
			ttlSeconds,
		};
		const serialized = JSON.stringify(entry);

		// L1: KV write
		const kvOptions: KVNamespacePutOptions = {};
		if (ttlSeconds) {
			kvOptions.expirationTtl = ttlSeconds;
		}
		await this.kv.put(key, serialized, kvOptions);

		// L2: D1 write (if available)
		if (this.d1) {
			try {
				await this.d1
					.prepare(
						`INSERT OR REPLACE INTO sdae_cache
						 (content_hash, tenant_id, data, created_at, ttl_seconds)
						 VALUES (?, ?, ?, ?, ?)`,
					)
					.bind(
						contentHash,
						tenantId,
						serialized,
						entry.createdAt,
						ttlSeconds ?? null,
					)
					.run();
			} catch {
				// D1 write failure is non-fatal — L1 still has the entry
			}
		}
	}

	/**
	 * Invalidate a single cached result by contentHash + tenant.
	 */
	async invalidate(
		contentHash: string,
		tenantId: string,
	): Promise<void> {
		const key = cacheKey(contentHash, tenantId);

		await this.kv.delete(key);

		if (this.d1) {
			try {
				await this.d1
					.prepare(
						'DELETE FROM sdae_cache WHERE content_hash = ? AND tenant_id = ?',
					)
					.bind(contentHash, tenantId)
					.run();
			} catch {
				// Non-fatal
			}
		}
	}

	/**
	 * Invalidate all cache entries for a project within a tenant.
	 * This is a bulk operation — useful when project configuration changes
	 * (e.g. envFingerprint update) and all nodes need re-execution.
	 *
	 * Note: KV doesn't support prefix deletion natively, so we rely on D1
	 * to enumerate keys. If D1 is unavailable, only the project prefix
	 * marker in KV is cleared.
	 */
	async invalidateByProject(
		projectId: string,
		tenantId: string,
	): Promise<void> {
		// Clear the project marker in KV
		const prefix = projectCachePrefix(projectId, tenantId);
		await this.kv.delete(prefix);

		if (!this.d1) return;

		try {
			// Fetch all content hashes for this project+tenant from D1
			const rows = await this.d1
				.prepare(
					'SELECT content_hash FROM sdae_cache WHERE tenant_id = ? AND data LIKE ?',
				)
				.bind(tenantId, `%"projectId":"${projectId}"%`)
				.all<{ content_hash: string }>();

			if (!rows.results || rows.results.length === 0) return;

			// Delete from KV and D1
			const deletePromises: Promise<void>[] = [];
			for (const row of rows.results) {
				const key = cacheKey(row.content_hash, tenantId);
				deletePromises.push(this.kv.delete(key));
			}
			await Promise.all(deletePromises);

			// Bulk delete from D1
			await this.d1
				.prepare(
					'DELETE FROM sdae_cache WHERE tenant_id = ? AND data LIKE ?',
				)
				.bind(tenantId, `%"projectId":"${projectId}"%`)
				.run();
		} catch {
			// Non-fatal — best-effort invalidation
		}
	}
}
