/*
This code is borrowed from Cloudflare Sandbox-sdk's npm package
*/

import { createObjectLogger } from "../../logger";
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { switchPort } from '@cloudflare/containers';

const logger = createObjectLogger({
  component: 'sandbox-do',
  operation: 'proxy'
});

export interface SandboxEnv {
  Sandbox: DurableObjectNamespace<Sandbox>;
}

export interface RouteInfo {
  port: number;
  sandboxId: string;
  path: string;
  token: string;
}

/**
 * Control-plane / internal ports that must never be reachable through a public
 * preview subdomain. The user-app dev server runs on other ports; the sandbox
 * management API (file read/exec) lives on 3000 and is only meant to be reached
 * internally via DO RPC / containerFetch, never from the public host.
 */
const CONTROL_PLANE_PORTS = new Set<number>([3000, 8787]);

/**
 * Strict allowlist of request headers forwarded from the browser into the
 * (untrusted) container. The container runs LLM-generated code, so the proxy
 * must never pass first-party platform credentials across this trust boundary.
 * Anything not listed here is dropped — in particular Cookie, Authorization,
 * X-CSRF-Token, X-Session-*, and X-Api-Key.
 */
const FORWARDED_REQUEST_HEADERS = new Set<string>([
  'accept',
  'accept-language',
  'accept-encoding',
  'content-type',
  'content-length',
  'user-agent',
  'range',
  'if-none-match',
  'if-modified-since',
  'cache-control',
  'pragma',
  'referer',
  'origin',
]);

/**
 * Additional headers required to complete a WebSocket handshake. These carry no
 * credentials and must survive the allowlist so upgrades still work.
 * `cf-container-target-port` is what `switchPort` uses to route to the port.
 */
const WEBSOCKET_HANDSHAKE_HEADERS = new Set<string>([
  'upgrade',
  'connection',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-protocol',
  'sec-websocket-extensions',
  'cf-container-target-port',
]);

/**
 * Build the outbound header set from the incoming request using the strict
 * allowlist, then layer on the proxy-added headers in `extra`.
 */
function buildProxyHeaders(
  request: Request,
  extra: Record<string, string>,
  allowExtra?: ReadonlySet<string>,
): Headers {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (FORWARDED_REQUEST_HEADERS.has(lower) || allowExtra?.has(lower)) {
      headers.set(name, value);
    }
  });
  for (const [name, value] of Object.entries(extra)) {
    headers.set(name, value);
  }
  return headers;
}

export async function proxyToSandbox<E extends SandboxEnv>(
  request: Request,
  env: E
): Promise<Response | null> {
  try {
    const url = new URL(request.url);
    const routeInfo = extractSandboxRoute(url);

    if (!routeInfo) {
      return null; // Not a request to an exposed container port
    }

    const { sandboxId, port, path } = routeInfo;
    // NOTE: id-resolution must match how the sandbox was created
    // (`getSandbox(env.Sandbox, sandboxId)` with no options in
    // sandboxSdkClient.ts). Do NOT add `{ normalizeId: true }` here or
    // `validatePortToken` would hit a different DO instance with no stored
    // tokens and reject every legitimate preview.
    const sandbox = getSandbox(env.Sandbox, sandboxId);

    // Never expose the control plane / reserved ports through public routing.
    if (CONTROL_PLANE_PORTS.has(port)) {
      logger.warn('Blocked control-plane port access', { sandboxId, port, path });
      return new Response('Not found', { status: 404 });
    }

    // Verify the per-port token against the token stored in the Sandbox DO by
    // `exposePort()`. Anyone who merely knows a (sandboxId, port) pair but not
    // the issued token gets a 404 (indistinguishable from a missing sandbox).
    if (!(await sandbox.validatePortToken(port, routeInfo.token))) {
      logger.warn('Blocked invalid sandbox port token', { sandboxId, port, path });
      return new Response('Not found', { status: 404 });
    }

    // Detect WebSocket upgrade request
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      logger.info('[Proxy] WebSocket upgrade request', { sandboxId, port, path });
      // WebSocket path: Must use fetch() not containerFetch()
      // This bypasses JSRPC serialization boundary which cannot handle WebSocket upgrades.
      // Strip credentials while preserving the handshake + port-target headers.
      const wsRequest = switchPort(request, port);
      return await sandbox.fetch(
        new Request(wsRequest, {
          headers: buildProxyHeaders(wsRequest, {}, WEBSOCKET_HANDSHAKE_HEADERS),
        }),
      );
    }

    // Route directly to user's service on the specified port
    const proxyUrl = `http://localhost:${port}${path}${url.search}`;

    const proxyRequest = new Request(proxyUrl, {
      method: request.method,
      headers: buildProxyHeaders(request, {
        'X-Original-URL': request.url,
        'X-Forwarded-Host': url.hostname,
        'X-Forwarded-Proto': url.protocol.replace(':', ''),
        'X-Sandbox-Name': sandboxId, // Pass the friendly name
      }),
      body: request.body,
      // @ts-expect-error - duplex required for body streaming in modern runtimes
      duplex: 'half',
    });

    logger.info('Proxying request to sandbox', {
      sandboxId,
      port,
      path,
      proxyUrl,
    });

    return await sandbox.containerFetch(proxyRequest, port);
  } catch (error) {
    logger.error(
      'Proxy routing error',
      error instanceof Error ? error : new Error(String(error))
    );
    return new Response('Proxy routing error', { status: 500 });
  }
}

function extractSandboxRoute(url: URL): RouteInfo | null {
  // Parse subdomain pattern: port-sandboxId-token.domain (tokens mandatory)
  // Token is always exactly 16 chars (generated by generatePortToken)
  const subdomainMatch = url.hostname.match(
    /^(\d{4,5})-([^.-][^.]*?[^.-]|[^.-])-([a-z0-9_-]{16})\.(.+)$/
  );

  if (!subdomainMatch) {
    return null;
  }

  const portStr = subdomainMatch[1];
  const sandboxId = subdomainMatch[2];
  const token = subdomainMatch[3]; // Mandatory token

  const port = parseInt(portStr, 10);

  // Reject malformed / out-of-range ports at parse time (mirrors the SDK's
  // validatePort range check). Reserved control-plane ports (3000/8787) are
  // still parsed here so proxyToSandbox can return an explicit 404 for them.
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return null;
  }

  // DNS subdomain length limit is 63 characters
  if (sandboxId.length > 63) {
    return null;
  }

  return {
    port,
    sandboxId,
    path: url.pathname || "/",
    token,
  };
}

export function isLocalhostPattern(hostname: string): boolean {
  // Handle IPv6 addresses in brackets (with or without port)
  if (hostname.startsWith('[')) {
    if (hostname.includes(']:')) {
      // [::1]:port format
      const ipv6Part = hostname.substring(0, hostname.indexOf(']:') + 1);
      return ipv6Part === '[::1]';
    } else {
      // [::1] format without port
      return hostname === '[::1]';
    }
  }

  // Handle bare IPv6 without brackets
  if (hostname === '::1') {
    return true;
  }

  // For IPv4 and regular hostnames, split on colon to remove port
  const hostPart = hostname.split(':')[0];

  return (
    hostPart === 'localhost' ||
    hostPart === '127.0.0.1' ||
    hostPart === '0.0.0.0'
  );
}
