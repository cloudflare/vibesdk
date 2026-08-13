/**
 * Server entry point.
 *
 * Mount {@link routeArtifactRequest} in a Worker (or any fetch-based server)
 * to expose a read-only proxy of the official Cloudflare Artifacts API. The
 * API token stays here; the browser only ever talks to your own origin.
 *
 * React-free and platform-neutral by construction — it uses only `Request`,
 * `Response`, `Headers`, `URL`, and `fetch`. Cache backends live behind
 * `artifacts-viewer/server/cache` so their Workers-only globals stay out of
 * browser bundles.
 *
 * ```ts
 * import { routeArtifactRequest } from "artifacts-viewer";
 * import { createCacheApiAdapter } from "artifacts-viewer/server/cache";
 *
 * export default {
 *   async fetch(request, env, ctx) {
 *     const handled = await routeArtifactRequest(request, {
 *       accountId: env.CF_ACCOUNT_ID,
 *       namespace: env.ARTIFACTS_NAMESPACE,
 *       apiToken: env.CF_API_TOKEN,
 *       cache: createCacheApiAdapter({
 *         cache: caches.default,
 *         baseUrl: new URL(request.url).origin,
 *       }),
 *       waitUntil: (promise) => ctx.waitUntil(promise),
 *     });
 *     return handled ?? new Response("Not found", { status: 404 });
 *   },
 * };
 * ```
 */

export { routeArtifactRequest } from "./server/router.ts";
export type {
  ArtifactBeforeRequestHook,
  ArtifactRouteContext,
  ArtifactRouterOptions,
} from "./server/router.ts";

export type {
  ArtifactsCacheAdapter,
  ArtifactsCacheScope,
  CacheableArtifactRead,
} from "./server/cache.ts";

export type { ArtifactReadRequest } from "./server/routes.ts";

export type {
  ArtifactReadOperation,
  ArtifactsCommitMetadata,
  ArtifactsGitIdentity,
  ArtifactsRepositoryPayload,
  ArtifactsTreeEntry,
  CloudflareEnvelope,
  CloudflareEnvelopeError,
  ImmutableArtifactReadOperation,
} from "./shared/official-types.ts";
