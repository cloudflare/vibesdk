/**
 * REST dispatch to the official Cloudflare Artifacts API.
 *
 * The only module holding the API token. Outbound requests are built from
 * scratch rather than mutated from the inbound one, which is what guarantees a
 * caller's cookies, headers, or method can never ride along.
 */

import type { ArtifactReadRequest } from "./routes.ts";

const cloudflareApiBase = "https://api.cloudflare.com/client/v4";

export type UpstreamConfig = {
  readonly accountId: string;
  readonly namespace: string;
  readonly apiToken: string;
  readonly fetch: typeof globalThis.fetch;
};

// Every path component is encoded individually, so a component containing a
// slash becomes `%2F` and stays one segment instead of silently deepening the
// path, while a genuinely nested `raw` path keeps its real hierarchy.
export function upstreamUrl(config: UpstreamConfig, request: ArtifactReadRequest): URL {
  const segments = [
    "accounts",
    config.accountId,
    "artifacts",
    "namespaces",
    config.namespace,
    "repos",
    request.repoName,
    ...operationSegments(request),
  ];

  const url = new URL(`${cloudflareApiBase}/${segments.map(encodeURIComponent).join("/")}`);

  for (const [key, value] of operationQuery(request)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function operationSegments(request: ArtifactReadRequest): string[] {
  switch (request.operation) {
    case "repository": {
      return [];
    }
    case "log": {
      return ["log"];
    }
    case "file": {
      return ["file"];
    }
    case "commit":
    case "tree":
    case "blob": {
      return [request.operation, request.hash];
    }
    case "raw": {
      return ["raw", request.ref, ...request.path.split("/")];
    }
  }
}

function operationQuery(request: ArtifactReadRequest): [string, string][] {
  switch (request.operation) {
    case "log": {
      const query: [string, string][] = [];
      if (request.ref !== null) {
        query.push(["ref", request.ref]);
      }
      if (request.limit !== null) {
        query.push(["limit", String(request.limit)]);
      }
      if (request.offset !== null) {
        query.push(["offset", String(request.offset)]);
      }
      return query;
    }
    case "file": {
      return [
        ["ref", request.ref],
        ["path", request.path],
      ];
    }
    default: {
      return [];
    }
  }
}

// `raw` asks for anything so the upstream can pick a browser-safe content type
// — that is the entire difference between `raw` and `blob`, and forcing
// `application/octet-stream` here would turn every inline image into a
// download.
function acceptHeaderFor(operation: ArtifactReadRequest["operation"]): string {
  switch (operation) {
    case "blob":
    case "file": {
      return "application/octet-stream";
    }
    case "raw": {
      return "*/*";
    }
    default: {
      return "application/json";
    }
  }
}

export async function dispatchRest(
  config: UpstreamConfig,
  request: ArtifactReadRequest,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const headers = new Headers({
    Accept: acceptHeaderFor(request.operation),
    Authorization: `Bearer ${config.apiToken}`,
  });

  return await config.fetch(upstreamUrl(config, request).toString(), {
    method: "GET",
    headers,
    signal,
  });
}

// An allowlist, not a denylist: an unrecognized upstream header is far more
// likely to leak infrastructure detail than to be something the browser needs.
const forwardableHeaders: readonly string[] = [
  "Content-Type",
  "Content-Length",
  "Content-Disposition",
  "ETag",
  "Last-Modified",
];

// The body is passed through by reference and never read, so a multi-megabyte
// blob streams to the client without ever being buffered here.
export function normalizeUpstreamResponse(upstream: Response): Response {
  const headers = new Headers();
  for (const name of forwardableHeaders) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
