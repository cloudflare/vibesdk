import { isImmutableReadOperation } from "../shared/official-types.ts";
import type { ImmutableArtifactReadOperation } from "../shared/official-types.ts";
import type { ArtifactReadRequest } from "./routes.ts";

/**
 * Pluggable storage for cached responses.
 *
 * Implementations may throw; the router treats a failing cache as an absent
 * one, because a cache is an optimization and must never turn a slow request
 * into a failed one.
 */
export type ArtifactsCacheAdapter = {
  get(key: string): Promise<Response | undefined>;
  set(key: string, response: Response): Promise<void>;
};

/**
 * The reads that are safe to cache.
 *
 * Only content-addressed operations qualify: a response to `tree/{hash}` can
 * never change. Ref-addressed reads (`repository`, `log`, `file`, `raw`) are
 * deliberately never cached, so there is no TTL anywhere in this module and no
 * staleness window to reason about.
 */
export type CacheableArtifactRead = Extract<
  ArtifactReadRequest,
  { operation: ImmutableArtifactReadOperation }
>;

export type ArtifactsCacheScope = {
  readonly namespace: string;
};

export const immutableCacheControl = "public, max-age=31536000, immutable";

export const immutableCacheTtlSeconds = 31_536_000;

const cacheKeyVersion = "v1";

export function isCacheableRead(request: ArtifactReadRequest): request is CacheableArtifactRead {
  return isImmutableReadOperation(request.operation);
}

// Variable components are percent-encoded so a value containing the separator
// cannot forge a different key.
export function cacheKeyFor(scope: ArtifactsCacheScope, request: CacheableArtifactRead): string {
  return [
    "artifacts-viewer",
    cacheKeyVersion,
    encodeURIComponent(scope.namespace),
    encodeURIComponent(request.repoName),
    request.operation,
    request.hash,
  ].join(":");
}

export async function safeCacheGet(
  adapter: ArtifactsCacheAdapter,
  key: string,
  onError: ((error: unknown) => void) | undefined,
): Promise<Response | undefined> {
  try {
    return await adapter.get(key);
  } catch (error) {
    onError?.(error);
    return undefined;
  }
}

export async function safeCacheSet(
  adapter: ArtifactsCacheAdapter,
  key: string,
  response: Response,
  onError: ((error: unknown) => void) | undefined,
): Promise<void> {
  try {
    await adapter.set(key, response);
  } catch (error) {
    onError?.(error);
  }
}
