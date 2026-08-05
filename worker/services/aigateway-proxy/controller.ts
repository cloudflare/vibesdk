import { getConfigurationForModel } from '../../agents/inferutils/core';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { apps } from '../../database/schema';
import { jwtVerify, SignJWT } from 'jose';
import { isDev } from 'worker/utils/envs';
import { RateLimitService } from '../rate-limit/rateLimits';
import { getUserConfigurableSettings } from 'worker/config';
import { AI_MODEL_CONFIG, AIModels } from 'worker/agents/inferutils/config.types';

// Resource caps to protect the shared platform gateway from abuse (CWE-770).
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB total request body
const MAX_MESSAGES = 200; // messages array length
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // total base64 image payload across messages
const MAX_OUTPUT_TOKENS = 16384; // clamp for max_tokens / max_completion_tokens
const UPSTREAM_TIMEOUT_MS = 120_000; // upstream fetch timeout

// Only OpenAI-compatible inference endpoints may be reached through the proxy.
const ALLOWED_PROXY_PATHS = new Set([
    '/chat/completions',
    '/completions',
    '/embeddings',
    '/responses',
    '/models',
]);

// JWT scoping claims for app-proxy tokens.
const AI_PROXY_AUDIENCE = 'vibesdk-ai-proxy';
const AI_PROXY_ISSUER = 'vibesdk';

function jsonError(status: number, message: string, type = 'invalid_request_error', extra?: Record<string, unknown>): Response {
    return new Response(JSON.stringify({ error: { message, type, ...extra } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Sum the byte length of base64-encoded image payloads in an OpenAI-style
 * messages array. Non-image content and remote image URLs are ignored.
 */
function countImageBytes(messages: unknown): number {
    if (!Array.isArray(messages)) return 0;
    let total = 0;
    for (const message of messages) {
        const content = (message as { content?: unknown } | null)?.content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
            const url = (part as { image_url?: { url?: unknown } } | null)?.image_url?.url;
            if (typeof url !== 'string') continue;
            const commaIndex = url.indexOf(',');
            if (url.startsWith('data:') && commaIndex !== -1) {
                // base64 length -> decoded byte estimate
                total += Math.floor((url.length - commaIndex - 1) * 3 / 4);
            }
        }
    }
    return total;
}

export async function proxyToAiGateway(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    console.log(`[AI Proxy] Received request: ${request.method} ${request.url}`);
    if (!env.AI_PROXY_JWT_SECRET) {
        console.error('AI Gateway proxy is not enabled for this platform');
        // Platform doesnt have ai gateway proxy enabled, return 403
        return new Response(JSON.stringify({ 
            error: { message: 'AI Gateway proxy is not enabled for this platform', type: 'invalid_request_error' } 
        }), { 
            status: 403, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // The proxy only serves JSON inference requests, which are always POST.
    if (request.method !== 'POST') {
        return jsonError(405, 'Method not allowed', 'invalid_request_error');
    }

    // Reject oversized bodies up front via Content-Length; the actual byte
    // length is re-checked after reading to defend against a missing or
    // spoofed header.
    const contentLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return jsonError(413, 'Request body too large', 'invalid_request_error');
    }

    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ 
                error: { message: 'Missing Authorization header', type: 'invalid_request_error' } 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token) {
            return new Response(JSON.stringify({ 
                error: { message: 'Invalid Authorization header format', type: 'invalid_request_error' } 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        let appId: string;
        let userId: string;
        try {
            const jwtSecret = new TextEncoder().encode(env.AI_PROXY_JWT_SECRET);
            const { payload } = await jwtVerify(token, jwtSecret, {
                audience: AI_PROXY_AUDIENCE,
                issuer: AI_PROXY_ISSUER,
            });

            if (payload.type !== 'app-proxy') {
                return jsonError(401, 'Invalid token: wrong token type', 'invalid_request_error');
            }

            if (!payload.appId || typeof payload.appId !== 'string') {
                return new Response(JSON.stringify({ 
                    error: { message: 'Invalid token: missing appId', type: 'invalid_request_error' } 
                }), { 
                    status: 401, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            
            if (!payload.userId || typeof payload.userId !== 'string') {
                return new Response(JSON.stringify({ 
                    error: { message: 'Invalid token: missing userId', type: 'invalid_request_error' } 
                }), { 
                    status: 401, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            
            appId = payload.appId as string;
            userId = payload.userId as string;
            
        } catch (error) {
            console.error('[AI Proxy] Token verification failed:', error);
            return new Response(JSON.stringify({ 
                error: { message: 'Invalid or expired token', type: 'invalid_request_error' } 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const db = drizzle(env.DB);
        const app = await db.select({
            id: apps.id,
            userId: apps.userId,
            title: apps.title,
            status: apps.status,
        })
        .from(apps)
        .where(eq(apps.id, appId))
        .get();

        if (!app) {
            return new Response(JSON.stringify({ 
                error: { message: 'App not found', type: 'invalid_request_error' } 
            }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        
        if (app.userId !== userId) {
            console.error(`[AI Proxy] UserId mismatch: token userId=${userId}, app userId=${app.userId}`);
            return new Response(JSON.stringify({ 
                error: { message: 'Token does not match app owner', type: 'invalid_request_error' } 
            }), { 
                status: 403, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        console.log(`[AI Proxy] Authenticated request from app: ${app.title} (${app.id}), user: ${app.userId}`);

        const url = new URL(request.url);

        // Only allow OpenAI-compatible inference endpoints through the proxy.
        const targetPath = url.pathname.replace('/api/proxy/openai', '');
        if (!ALLOWED_PROXY_PATHS.has(targetPath)) {
            return jsonError(404, `Unsupported proxy path: ${targetPath}`, 'invalid_request_error');
        }

        // Read the raw body and enforce the byte cap against the actual payload,
        // not just the (optional/spoofable) Content-Length header.
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
            return jsonError(413, 'Request body too large', 'invalid_request_error');
        }

        let requestBody: { model: string; [key: string]: unknown };
        try {
            requestBody = JSON.parse(rawBody) as { model: string; [key: string]: unknown };
        } catch {
            return jsonError(400, 'Invalid JSON body', 'invalid_request_error');
        }

        if (!requestBody.model || typeof requestBody.model !== 'string') {
            return jsonError(400, 'Missing required parameter: model', 'invalid_request_error', {
                param: 'model',
                code: 'missing_required_parameter',
            });
        }

        // Cap the number of messages and the total inline image payload.
        if (requestBody.messages !== undefined) {
            if (!Array.isArray(requestBody.messages)) {
                return jsonError(400, 'Invalid parameter: messages must be an array', 'invalid_request_error', { param: 'messages' });
            }
            if (requestBody.messages.length > MAX_MESSAGES) {
                return jsonError(400, `Too many messages (max ${MAX_MESSAGES})`, 'invalid_request_error', { param: 'messages' });
            }
            if (countImageBytes(requestBody.messages) > MAX_IMAGE_BYTES) {
                return jsonError(413, 'Inline image payload too large', 'invalid_request_error');
            }
        }

        // Clamp the requested output tokens so a single call cannot exhaust the
        // platform budget. Rewritten in place rather than rejected.
        for (const key of ['max_tokens', 'max_completion_tokens'] as const) {
            const value = requestBody[key];
            if (typeof value === 'number' && value > MAX_OUTPUT_TOKENS) {
                requestBody[key] = MAX_OUTPUT_TOKENS;
            }
        }

        const modelName = requestBody.model;

        // Enforce rate limit
        const userConfig = await getUserConfigurableSettings(env, app.userId)
        await RateLimitService.enforceLLMCallsRateLimit(env, userConfig.security.rateLimit, app.userId, modelName, "apps")

        const { baseURL, apiKey, defaultHeaders } = await getConfigurationForModel(
            AI_MODEL_CONFIG[modelName as AIModels],
            env,
            app.userId,
            undefined, // User app proxy doesn't use BYOK
            undefined,
            null // No user gateway for app proxy
        );

        console.log(`[AI Proxy] Forwarding request to model: ${modelName}, baseURL: ${baseURL}`);

        const proxyHeaders = new Headers();
        proxyHeaders.set('Content-Type', 'application/json');
        proxyHeaders.set('Authorization', `Bearer ${apiKey}`);
        
        if (defaultHeaders) {
            Object.entries(defaultHeaders).forEach(([key, value]) => {
                proxyHeaders.set(key, value);
            });
        }
        // Add metadata for tracking
        proxyHeaders.set('cf-aig-metadata', JSON.stringify({
            appId: app.id,
            userId: app.userId,
            source: 'user-app-proxy',
            model: modelName
        }));

        const targetUrl = `${baseURL}${targetPath}${url.search}`;

        console.log(`[AI Proxy] Target URL: ${targetUrl}`);

        let proxyResponse: Response;
        try {
            proxyResponse = await fetch(targetUrl, {
                method: request.method,
                headers: proxyHeaders,
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            });
        } catch (error) {
            if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
                console.error('[AI Proxy] Upstream request timed out');
                return jsonError(504, 'Upstream request timed out', 'timeout_error');
            }
            throw error;
        }

        // Allowlist response headers to avoid leaking upstream cookies, cf-aig-* metadata,
        // or any Cloudflare-internal auth headers back to the caller.
        const SAFE_RESPONSE_HEADERS = new Set([
            'content-type',
            'content-length',
            'content-encoding',
            'cache-control',
            'openai-model',
            'openai-organization',
            'openai-processing-ms',
            'openai-version',
            'x-request-id',
        ]);
        const safeHeaders = new Headers();
        for (const [name, value] of proxyResponse.headers) {
            if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) {
                safeHeaders.set(name, value);
            }
        }

        return new Response(proxyResponse.body, {
            status: proxyResponse.status,
            statusText: proxyResponse.statusText,
            headers: safeHeaders,
        });

    } catch (error) {
        console.error('[AI Proxy] Error processing request:', error);
        return new Response(JSON.stringify({ 
            error: { 
                message: error instanceof Error ? error.message : 'Internal server error',
                type: 'internal_error' 
            } 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}

export async function generateAppProxyToken(
    appId: string,
    userId: string,
    env: Env,
    expiresInSeconds: number = 3 * 60 * 60 // 3 hours
): Promise<string> {
    const jwtSecret = new TextEncoder().encode(env.AI_PROXY_JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    
    const token = await new SignJWT({
        appId,
        userId,
        type: 'app-proxy',
        iat: now,
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setIssuer(AI_PROXY_ISSUER)
    .setAudience(AI_PROXY_AUDIENCE)
    .setExpirationTime(now + expiresInSeconds)
    .sign(jwtSecret);
    
    return token;
}

export function generateAppProxyUrl(env: Env) {
    let protocol = 'https';
    const domain = env.CUSTOM_DOMAIN;
    if (isDev(env)) {
        protocol = 'http';
    }
    return `${protocol}://${domain}/api/proxy/openai`;
}