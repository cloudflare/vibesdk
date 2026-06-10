import { isDev } from './envs';

export const getProtocolForHost = (host: string): string => {
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('0.0.0.0') || host.startsWith('::1')) {
        return 'http';
    } else {
        return 'https';
    }
}
export function getPreviewDomain(env: Env): string {
    if (env.CUSTOM_PREVIEW_DOMAIN && env.CUSTOM_PREVIEW_DOMAIN.trim() !== '') {
        return env.CUSTOM_PREVIEW_DOMAIN;
    }
    return env.CUSTOM_DOMAIN;
}

export function isSeparatePreviewDomain(env: Env): boolean {
    const previewDomain = getPreviewDomain(env);
    return previewDomain.trim() !== '' && previewDomain !== env.CUSTOM_DOMAIN;
}

export function buildSpacePreviewPath(spaceName: string, branch: string): string {
    return `/space/${encodeURIComponent(spaceName)}/preview/${encodeURIComponent(branch)}/`;
}

/** True when the host is a loopback (localhost / 127.0.0.1 / etc), with or without port. */
export function isLocalHost(host: string): boolean {
    if (!host) return false;
    const lower = host.toLowerCase();
    const bare = lower.split(':')[0];
    return (
        bare === 'localhost' ||
        bare === '127.0.0.1' ||
        bare === '0.0.0.0' ||
        bare === '::1'
    );
}

/**
 * Heuristic: does this host look like a publicly-routable FQDN?
 * Rejects internal-only synthetic hostnames like `space-internal`
 * or `dummy-example.cloudflare.com.local` that DOs use for
 * internal-RPC fetches, by requiring at least one dot. Public hosts
 * (build.cloudflare.dev, etc.) always have dots; internal
 * synthetic ones generally don't.
 */
export function isPublicHostname(host: string): boolean {
    if (!host) return false;
    const bare = host.split(':')[0];
    if (!bare.includes('.')) return false;
    // Reject obvious dev-internal synthetic hosts.
    if (bare.endsWith('.local')) return false;
    return true;
}

/**
 * Extract `host:port` from an origin/URL string. Returns `undefined`
 * if the input isn't parseable as a URL.
 */
export function safeUrlHost(origin: string | undefined): string | undefined {
    if (!origin) return undefined;
    try {
        return new URL(origin).host;
    } catch {
        return undefined;
    }
}

/**
 * Pick the best public host to use for preview URLs from inside the
 * worker. Priority:
 *   1. The host the frontend used when it opened the WebSocket
 *      (captured in agent state at WS upgrade time) — only if it
 *      isn't loopback AND looks like a real public FQDN. This is the
 *      most accurate "what URL is the user actually hitting" answer.
 *   2. `getPreviewDomain(env)` — the configured custom preview
 *      domain or CUSTOM_DOMAIN.
 *   3. `env.CUSTOM_DOMAIN` as a last resort.
 *   4. The (possibly-loopback) wsOrigin host if absolutely nothing
 *      else is set.
 */
export function resolvePreviewHost(env: Env, wsOrigin: string | undefined): string {
    const fromOrigin = safeUrlHost(wsOrigin);
    if (fromOrigin && !isLocalHost(fromOrigin) && isPublicHostname(fromOrigin)) {
        return fromOrigin;
    }
    const fromEnv = getPreviewDomain(env);
    if (fromEnv && fromEnv.trim() !== '') return fromEnv;
    if (env.CUSTOM_DOMAIN && env.CUSTOM_DOMAIN.trim() !== '') return env.CUSTOM_DOMAIN;
    return fromOrigin ?? 'localhost';
}

export function buildUserWorkerUrl(env: Env, deploymentId: string): string {
    const domain = getPreviewDomain(env);
    const protocol = getProtocolForHost(domain);
    return `${protocol}://${deploymentId}.${domain}`;
}

/**
 * Migrate a stored preview URL to the current domain.
 * Extracts subdomain from old URL and rebuilds with current getPreviewDomain().
 * Used to handle domain changes without invalidating existing sandbox instances.
 */
export function migratePreviewUrl(storedUrl: string | undefined, env: Env): string | undefined {
    if (!storedUrl) return undefined;

    try {
        const url = new URL(storedUrl);
        const hostname = url.hostname;
        const currentDomain = getPreviewDomain(env);

        // Already using current domain
        if (hostname.endsWith(`.${currentDomain}`)) {
            return storedUrl;
        }

        // Extract subdomain by finding the first dot
        const firstDotIndex = hostname.indexOf('.');
        if (firstDotIndex === -1) return storedUrl;

        const subdomain = hostname.slice(0, firstDotIndex);

        // Rebuild with current domain
        return `${url.protocol}//${subdomain}.${currentDomain}${url.pathname}`;
    } catch {
        return storedUrl;
    }
}

/**
 * Resolve the correct preview URL based on environment.
 * In tunnel mode (local dev or USE_TUNNEL_FOR_PREVIEW), returns the tunnel URL.
 * In production, applies domain migration to the sandbox preview URL.
 */
export function resolvePreviewUrl(
    previewURL: string | undefined,
    tunnelURL: string | undefined,
    env: Env
): string | undefined {
    if (isDev(env) || env.USE_TUNNEL_FOR_PREVIEW) {
        return tunnelURL || previewURL;
    }
    return migratePreviewUrl(previewURL, env);
}

export function buildGitCloneUrl(env: Env, appId: string, token?: string): string {
    const domain = env.CUSTOM_DOMAIN;
    const protocol = getProtocolForHost(domain);
    // Git expects username:password format. Use 'oauth2' as username and token as password
    // This is a standard pattern for token-based git authentication
    const auth = token ? `oauth2:${token}@` : '';
    return `${protocol}://${auth}${domain}/apps/${appId}.git`;
}