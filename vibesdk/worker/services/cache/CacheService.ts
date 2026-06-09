/**
 * Simple Cache Service using Cloudflare Cache API
 */

export interface CacheOptions {
	ttlSeconds: number;
	tags?: string[];
}

export class CacheService {
	/**
	 * Get cached response
	 */
	async get(keyOrRequest: string | Request): Promise<Response | undefined> {
		// Use caches.default for Cloudflare Workers
		const cache = caches.default;
		return await cache.match(keyOrRequest);
	}

	/**
	 * Store response in cache
	 */
	async put(
		keyOrRequest: string | Request,
		response: Response,
		options: CacheOptions,
	): Promise<void> {

		// Convert Headers to a plain object
		const headersObj: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headersObj[key] = value;
		});

		const responseToCache = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				...headersObj,
				'Cache-Control': `public, max-age=${options.ttlSeconds}`,
				...(options.tags
					? { 'Cache-Tag': options.tags.join(',') }
					: {}),
			},
		});

		// Use caches.default for Cloudflare Workers
		const cache = caches.default;
		await cache.put(keyOrRequest, responseToCache);
	}

	/**
	 * Generate cache key from request
	 */
	generateKey(request: Request, userId?: string): string {
		const url = new URL(request.url);
		const baseKey = `${url.pathname}${url.search}`;
		return userId ? `${baseKey}:user:${userId}` : baseKey;
	}

	/**
	 * Simple wrapper for caching controller responses
	 */
	async withCache(
		cacheKeyOrRequest: string | Request,
		operation: () => Promise<Response>,
		options: CacheOptions,
	): Promise<Response> {
		// Try to get from cache first
		const cached = await this.get(cacheKeyOrRequest);
		if (cached) {
			return cached;
		}

		// Execute operation and cache result
		const response = await operation();
		if (response.ok) {
			await this.put(cacheKeyOrRequest, response.clone(), options);
		}

		return response;
	}
}
