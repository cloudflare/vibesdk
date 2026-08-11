import { defaultApiPath } from "../shared/api-path.ts";
import type { ArtifactReadOperation } from "../shared/official-types.ts";
import {
  cacheKeyFor,
  immutableCacheControl,
  isCacheableRead,
  safeCacheGet,
  safeCacheSet,
} from "./cache.ts";
import type { ArtifactsCacheAdapter } from "./cache.ts";
import { errorEnvelopeResponse, methodNotAllowedResponse } from "./responses.ts";
import { matchApiPath, matchRoute } from "./routes.ts";
import type { ArtifactReadRequest } from "./routes.ts";
import { dispatchRest, normalizeUpstreamResponse } from "./upstream.ts";

export type ArtifactRouteContext = {
  /** The original inbound request. Never forwarded upstream. */
  readonly request: Request;
  /** Parsed and fully validated. Safe to use for authorization decisions. */
  readonly read: ArtifactReadRequest;
  readonly operation: ArtifactReadOperation;
};

/**
 * Runs before any upstream or cache access.
 *
 * Return a `Response` to short-circuit — this is where authorization belongs.
 * Return nothing to continue.
 */
export type ArtifactBeforeRequestHook = (
  context: ArtifactRouteContext,
) => Promise<Response | void> | Response | void;

export type ArtifactRouterOptions = {
  /** Mount point. Default `/artifacts`. Matched on a segment boundary. */
  readonly apiPath?: string;
  readonly accountId: string;
  readonly namespace: string;
  readonly apiToken: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly beforeRequest?: ArtifactBeforeRequestHook;
  /** Consulted for content-addressed reads only. See `artifacts-viewer/server/cache`. */
  readonly cache?: ArtifactsCacheAdapter;
  /**
   * Extends the request lifetime past the response, for cache writes.
   *
   * Pass the Workers `ctx.waitUntil`. Without it a cache write races the end
   * of the request and may be cancelled, which costs a cache entry but never
   * correctness.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  /** Notified when a cache adapter throws. The request proceeds regardless. */
  readonly onCacheError?: (error: unknown) => void;
};

/**
 * Routes one request.
 *
 * Returns `null` when the request is not addressed to `apiPath`, so the caller
 * can fall through to its own routing:
 *
 * ```ts
 * const handled = await routeArtifactRequest(request, options);
 * if (handled !== null) return handled;
 * return myApp.fetch(request);
 * ```
 *
 * Once a request *is* inside the mount point, every outcome is a `Response` —
 * including unknown sub-paths, which are a 404 from us rather than a
 * fall-through. Owning the namespace outright is what makes the boundary
 * predictable.
 *
 * The step order below is load-bearing: the authorization hook runs before the
 * cache, so a cache hit can never be used to bypass access control.
 */
export async function routeArtifactRequest(
  request: Request,
  options: ArtifactRouterOptions,
): Promise<Response | null> {
  assertUpstreamConfigured(options);

  const url = new URL(request.url);
  const segments = matchApiPath(url.pathname, options.apiPath ?? defaultApiPath);

  if (segments === null) {
    return null;
  }

  const match = matchRoute(request.method, segments, url.searchParams);

  switch (match.kind) {
    case "not-found": {
      return errorEnvelopeResponse(404, "Unknown Artifacts route.");
    }
    case "method-not-allowed": {
      return methodNotAllowedResponse(match.allow);
    }
    case "bad-request": {
      return errorEnvelopeResponse(400, match.reason);
    }
    case "read": {
      break;
    }
  }

  const read = match.request;

  if (options.beforeRequest !== undefined) {
    const short = await options.beforeRequest({
      request,
      read,
      operation: read.operation,
    });
    if (short instanceof Response) {
      return short;
    }
  }

  const cacheKey =
    options.cache !== undefined && isCacheableRead(read)
      ? cacheKeyFor({ namespace: options.namespace }, read)
      : null;

  if (options.cache !== undefined && cacheKey !== null) {
    const hit = await safeCacheGet(options.cache, cacheKey, options.onCacheError);
    if (hit !== undefined) {
      return hit;
    }
  }

  const dispatched = normalizeUpstreamResponse(
    await dispatchRest(
      {
        accountId: options.accountId,
        namespace: options.namespace,
        apiToken: options.apiToken,
        fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      },
      read,
      request.signal,
    ),
  );

  // Declaring a year of immutability on a 404 would cache a transient failure
  // forever, so freshness metadata is attached on success only.
  const response =
    dispatched.ok && cacheKey !== null
      ? withHeader(dispatched, "Cache-Control", immutableCacheControl)
      : dispatched;

  // Awaiting the cache write would deadlock on large bodies: the clone cannot
  // drain until the original is consumed, and the original is not consumed
  // until after we return. `waitUntil` is how the write is kept alive instead.
  if (options.cache !== undefined && cacheKey !== null && response.ok) {
    const write = safeCacheSet(options.cache, cacheKey, response.clone(), options.onCacheError);
    if (options.waitUntil === undefined) {
      void write;
    } else {
      options.waitUntil(write);
    }
  }

  return response;
}

function withHeader(response: Response, name: string, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// A blank account id would otherwise surface as a confusing upstream 404 on
// every request, so misconfiguration fails loudly at the first call instead.
function assertUpstreamConfigured(options: ArtifactRouterOptions): void {
  const missing: string[] = [];
  if (options.accountId === "") {
    missing.push("accountId");
  }
  if (options.namespace === "") {
    missing.push("namespace");
  }
  if (options.apiToken === "") {
    missing.push("apiToken");
  }
  if (missing.length > 0) {
    throw new Error(`routeArtifactRequest is missing required options: ${missing.join(", ")}.`);
  }
}
