import { getConfigurationForModel } from '../../agents/inferutils/core';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { apps } from '../../database/schema';
import { jwtVerify, SignJWT } from 'jose';
import { isDev } from 'worker/utils/envs';
import { RateLimitService } from '../rate-limit/rateLimits';
import { getUserConfigurableSettings } from 'worker/config';
import { AI_MODEL_CONFIG, AIModels } from 'worker/agents/inferutils/config.types';

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
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        });
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
            const { payload } = await jwtVerify(token, jwtSecret);
            
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
        const requestBody = await request.json() as {
            model: string;
            [key: string]: unknown;
        };

        if (!requestBody.model || typeof requestBody.model !== 'string') {
            return new Response(JSON.stringify({ 
                error: { 
                    message: 'Missing required parameter: model',
                    type: 'invalid_request_error',
                    param: 'model',
                    code: 'missing_required_parameter'
                } 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const modelName = requestBody.model;

        // Enforce rate limit
        const userConfig = await getUserConfigurableSettings(env, app.userId)
        await RateLimitService.enforceLLMCallsRateLimit(env, userConfig.security.rateLimit, app.userId, modelName, "apps")

        const { baseURL, apiKey, defaultHeaders } = await getConfigurationForModel(
            AI_MODEL_CONFIG[modelName as AIModels],
            env,
            app.userId
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

        const targetPath = url.pathname.replace('/api/proxy/openai', '');
        const targetUrl = `${baseURL}${targetPath}${url.search}`;

        console.log(`[AI Proxy] Target URL: ${targetUrl}`);

        const proxyResponse = await fetch(targetUrl, {
            method: request.method,
            headers: proxyHeaders,
            body: JSON.stringify(requestBody),
        });

        return new Response(proxyResponse.body, {
            status: proxyResponse.status,
            statusText: proxyResponse.statusText,
            headers: proxyResponse.headers,
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