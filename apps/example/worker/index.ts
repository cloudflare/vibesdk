import { routeArtifactRequest } from "artifacts-viewer";
import { createCacheApiAdapter } from "artifacts-viewer/server/cache";

export default {
  async fetch(request, env, ctx) {
    const handled = await routeArtifactRequest(request, {
      accountId: env.ARTIFACTS_ACCOUNT_ID,
      namespace: env.ARTIFACTS_NAMESPACE,
      apiToken: env.ARTIFACTS_API_TOKEN,
      cache: createCacheApiAdapter({
        cache: caches.default,
        baseUrl: new URL(request.url).origin,
      }),
      waitUntil: (promise) => {
        ctx.waitUntil(promise);
      },
    });

    return handled ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
