/**
 * Cache wrapper for controller methods without decorators
 */

import { CacheService } from './CacheService';
import type { RouteContext } from '../../api/types/route-context';
import type { BaseController } from '../../api/controllers/baseController';

interface CacheOptions {
	ttlSeconds: number;
	tags?: string[];
}

type ControllerMethod<T extends BaseController> = (
	this: T,
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	context: RouteContext
) => Promise<Response>;

/**
 * Wraps a controller method with caching functionality
 * Works without experimental decorators - pure higher-order function
 */
export function withCache<T extends BaseController>(
	method: ControllerMethod<T>,
	options: CacheOptions
): ControllerMethod<T> {
	const cacheService = new CacheService();

	return async function (
		this: T,
		request: Request,
		env: Env,
		ctx: ExecutionContext,
		context: RouteContext
	): Promise<Response> {
		// Try to get user for cache key differentiation
		let userId = context?.user?.id;

		// For public endpoints, try to get optional user if not already available
		if (!userId && 'getOptionalUser' in this && typeof this.getOptionalUser === 'function') {
			try {
				const user = await this.getOptionalUser(request, env);
				userId = user?.id;
			} catch {
				// Ignore auth errors for public endpoints
			}
		}

		// Use request directly as cache key (Cloudflare Workers way)
		const cacheKeyOrRequest = request;

		// Use cache wrapper
		return cacheService.withCache(
			cacheKeyOrRequest,
			() => method.call(this, request, env, ctx, context),
			{ ttlSeconds: options.ttlSeconds, tags: options.tags }
		);
	};
}
