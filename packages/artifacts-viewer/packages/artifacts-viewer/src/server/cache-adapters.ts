/**
 * Cache backends for {@link ArtifactsCacheAdapter}.
 *
 * Kept behind the `artifacts-viewer/server/cache` entry point so that the
 * Workers-only globals they describe can never be pulled into a browser
 * bundle.
 *
 * Both adapters store only content-addressed responses, so a stored entry can
 * never be wrong -- only absent.
 */

import { immutableCacheControl, immutableCacheTtlSeconds } from "./cache.ts";
import type { ArtifactsCacheAdapter } from "./cache.ts";

export type CacheApiOptions = {
  readonly cache: Cache;
  /**
   * The Workers Cache API is keyed by URL and scoped to the zone serving the
   * request, so this must be an origin the Worker actually serves. Pass
   * `new URL(request.url).origin` rather than inventing a hostname.
   */
  readonly baseUrl: string;
};

/**
 * Adapter over the Workers Cache API.
 *
 * The recommended production backend: it streams, so a large blob is never
 * held in memory, and it is shared across requests within a colo.
 */
export function createCacheApiAdapter({ cache, baseUrl }: CacheApiOptions): ArtifactsCacheAdapter {
  const keyFor = (key: string): Request =>
    new Request(new URL(`/__artifacts-viewer/${encodeURIComponent(key)}`, baseUrl), {
      method: "GET",
    });

  return {
    async get(key) {
      const hit = await cache.match(keyFor(key));
      return hit ?? undefined;
    },

    async set(key, response) {
      // The Cache API refuses partial responses, and storing one would produce
      // a truncated hit later.
      if (response.status === 206) {
        return;
      }

      const headers = new Headers(response.headers);
      headers.set("Cache-Control", immutableCacheControl);

      await cache.put(
        keyFor(key),
        new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        }),
      );
    },
  };
}

/**
 * The subset of a Workers KV binding this adapter uses.
 *
 * Declared structurally rather than as `KVNamespace` so the published types
 * stay usable without `@cloudflare/workers-types` installed. A real binding
 * satisfies it.
 */
export type ArtifactsKvNamespace = {
  getWithMetadata(
    key: string,
    options: { type: "stream"; cacheTtl?: number },
  ): Promise<{ value: ReadableStream | null; metadata: unknown }>;
  put(
    key: string,
    value: ReadableStream,
    options?: { metadata?: unknown; expirationTtl?: number },
  ): Promise<void>;
};

export type KvCacheOptions = {
  readonly kv: ArtifactsKvNamespace;
};

/**
 * Adapter over a Workers KV namespace.
 *
 * KV is eventually consistent and rate-limits writes to one per second per
 * key. Neither matters here because every cached entry is content-addressed
 * and therefore written at most once with a value that can never differ.
 */
export function createKvCacheAdapter({ kv }: KvCacheOptions): ArtifactsCacheAdapter {
  return {
    async get(key) {
      const hit = await kv.getWithMetadata(key, {
        type: "stream",
        cacheTtl: immutableCacheTtlSeconds,
      });
      if (hit.value === null) {
        return undefined;
      }

      const headers = new Headers({ "Cache-Control": immutableCacheControl });
      const contentType = readContentType(hit.metadata);
      if (contentType !== null) {
        headers.set("Content-Type", contentType);
      }

      return new Response(hit.value, { status: 200, headers });
    },

    async set(key, response) {
      const body = response.body;
      if (body === null) {
        return;
      }

      await kv.put(key, body, {
        metadata: { contentType: response.headers.get("Content-Type") },
        expirationTtl: immutableCacheTtlSeconds,
      });
    },
  };
}

function readContentType(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || !("contentType" in metadata)) {
    return null;
  }

  const { contentType } = metadata;
  return typeof contentType === "string" ? contentType : null;
}
