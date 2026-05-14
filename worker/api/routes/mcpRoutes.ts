/**
 * MCP HTTP endpoint — POST /api/mcp
 *
 * Stateless JSON-RPC 2.0 endpoint exposing vibesdk session data to MCP clients
 * (Claude Code, Cursor, Windsurf, etc.).
 *
 * Each POST is a complete request/response exchange.
 * No persistent connection or session management.
 *
 * Authentication: `Authorization: Bearer <jwt>` (same token as the REST API).
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { validateToken } from '../../middleware/auth/auth';
import { handleMcpRequest } from '../../services/mcp/vibesdk-mcp-server';
import { createLogger } from '../../logger';

const logger = createLogger('mcpRoutes');

export function setupMcpRoutes(app: Hono<AppEnv>): void {
    // OPTIONS preflight — MCP clients send preflight before POST
    app.options('/api/mcp', (c) => {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            },
        });
    });

    app.post('/api/mcp', async (c) => {
        const env = c.env as Env;

        // --- Auth ---
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json(
                {
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32000, message: 'Unauthorized: Bearer token required' },
                },
                401,
            );
        }

        const token = authHeader.slice(7);
        const session = await validateToken(token, env);
        if (!session) {
            return c.json(
                {
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32000, message: 'Unauthorized: invalid token' },
                },
                401,
            );
        }

        // --- Parse body ---
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return c.json(
                {
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32700, message: 'Parse error: invalid JSON' },
                },
                400,
            );
        }

        logger.debug('MCP request', {
            userId: session.user.id,
            method: (body as { method?: string }).method ?? 'unknown',
        });

        // --- Dispatch ---
        const response = await handleMcpRequest(body, env, session.user);

        return c.json(response, 200, {
            'Access-Control-Allow-Origin': '*',
        });
    });
}
