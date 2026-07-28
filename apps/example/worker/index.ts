import { waitUntil } from "cloudflare:workers";
import { routeArtifactRequest } from "artifacts-viewer";
import { createCacheApiAdapter } from "artifacts-viewer/server/cache";
import { Hono } from "hono";

const artifactsApiPath = "/api/artifacts";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/hello", (c) => {
  return c.text("Hello Hono!");
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.all("/api/artifacts/*", async (c) => {
  const handled = await routeArtifactRequest(c.req.raw, {
    accountId: c.env.ARTIFACTS_ACCOUNT_ID,
    namespace: c.env.ARTIFACTS_NAMESPACE,
    apiToken: c.env.ARTIFACTS_API_TOKEN,
    apiPath: artifactsApiPath,
    cache: createCacheApiAdapter({
      cache: caches.default,
      baseUrl: new URL(c.req.url).origin,
    }),
    waitUntil,
  });

  return handled ?? c.notFound();
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
