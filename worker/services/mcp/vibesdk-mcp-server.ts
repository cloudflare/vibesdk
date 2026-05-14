/**
 * vibesdk MCP Server — stateless JSON-RPC handler for Cloudflare Workers.
 *
 * Implements the MCP 2024-11-05 protocol over a single HTTP POST endpoint.
 * Each request is a complete JSON-RPC exchange (no SSE / persistent sessions).
 *
 * Exposed tools:
 *   vibesdk_get_status   — session state, progress, cost
 *   vibesdk_get_quality  — eval gate verdicts, composite scores per phase
 *   vibesdk_describe_app — app metadata (title, framework, status)
 *
 * Exposed resources (MCP 2024-11-05 §resources, Mastra v1.32 pattern):
 *   vibesdk://session/{sessionId}/status  — same data as vibesdk_get_status
 *   vibesdk://session/{sessionId}/quality — same data as vibesdk_get_quality
 *   vibesdk://session/{sessionId}/app     — same data as vibesdk_describe_app
 *
 * Resources are read-only + non-subscribable (stateless HTTP POST).
 * URI authority: `session`. Path segments: `{sessionId}` + resource name.
 *
 * Authentication: caller passes `Authorization: Bearer <jwt>` on every request.
 * Ownership is enforced per tool/resource (same DB ownership checks as REST controllers).
 *
 * CF Workers compat:
 *   No Node.js built-ins used. Pure fetch / V8 / Zod.
 *   JSON Schema validation is intentionally omitted (stateless, low-risk endpoint).
 */

import { z } from 'zod';
import { SessionMonitorService } from '../../database/services/SessionMonitorService';
import { EvalResultsService } from '../../database/services/EvalResultsService';
import { AppService } from '../../database';
import { computeCompositeEvalScore } from '../../agents/operations/EvalGate';
import { createLogger } from '../../logger';
import type { AuthUser } from '../../types/auth-types';

const logger = createLogger('vibesdk-mcp-server');

// ── JSON-RPC 2.0 types ────────────────────────────────────────────────────────

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number | null;
    method: string;
    params?: unknown;
}

interface JsonRpcSuccess {
    jsonrpc: '2.0';
    id: string | number | null;
    result: unknown;
}

interface JsonRpcError {
    jsonrpc: '2.0';
    id: string | number | null;
    error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

const JSONRPC_ERROR = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
} as const;

function ok(id: string | number | null, result: unknown): JsonRpcSuccess {
    return { jsonrpc: '2.0', id, result };
}

function err(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
): JsonRpcError {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

// ── MCP tool schemas (JSON Schema format) ────────────────────────────────────

const SESSION_ID_SCHEMA = {
    type: 'object' as const,
    properties: {
        sessionId: {
            type: 'string',
            description: 'The vibesdk session / app ID (returned by POST /api/agent).',
        },
    },
    required: ['sessionId'],
};

const MCP_TOOLS = [
    {
        name: 'vibesdk_get_status',
        description:
            'Returns the current state of a vibesdk code generation session: ' +
            'progress (phases completed/total), cost (tokens, credits), ' +
            'current activity, and elapsed time. ' +
            'Poll this tool to track generation progress.',
        inputSchema: SESSION_ID_SCHEMA,
    },
    {
        name: 'vibesdk_get_quality',
        description:
            'Returns eval gate verdicts for each phase in a session: ' +
            'faithfulness, answer relevancy, tool correctness, hallucination risk, ' +
            'composite score (0–1), and pass/fail status. ' +
            'Use this to understand the quality of generated code.',
        inputSchema: SESSION_ID_SCHEMA,
    },
    {
        name: 'vibesdk_describe_app',
        description:
            'Returns metadata about a vibesdk app: title, original prompt, ' +
            'framework, generation status (generating|completed), ' +
            'and creation timestamp.',
        inputSchema: SESSION_ID_SCHEMA,
    },
] as const;

// ── MCP resource templates ────────────────────────────────────────────────────

/**
 * URI scheme: `vibesdk://session/{sessionId}/{resource}`
 *
 * Templates follow RFC 6570 Level 1 (simple string expansion).
 * Clients substitute `{sessionId}` before calling `resources/read`.
 */
const MCP_RESOURCE_TEMPLATES = [
    {
        uriTemplate: 'vibesdk://session/{sessionId}/status',
        name: 'Session Status',
        description:
            'Real-time state of a vibesdk code generation session: progress, cost, ' +
            'current activity, agent counts, elapsed time. Poll to track generation.',
        mimeType: 'application/json',
    },
    {
        uriTemplate: 'vibesdk://session/{sessionId}/quality',
        name: 'Session Quality',
        description:
            'Eval gate verdicts for all completed phases: faithfulness, answer relevancy, ' +
            'tool correctness, hallucination risk, composite score, pass/fail.',
        mimeType: 'application/json',
    },
    {
        uriTemplate: 'vibesdk://session/{sessionId}/app',
        name: 'App Metadata',
        description:
            'App metadata: title, original prompt, framework, status, visibility, ' +
            'creation timestamp, and session URL.',
        mimeType: 'application/json',
    },
] as const;

/**
 * Parse a vibesdk resource URI and return the sessionId + resource name.
 * Expected format: `vibesdk://session/{sessionId}/{resource}`
 *
 * @returns null if the URI does not match the expected format.
 */
function parseResourceUri(
    uri: string,
): { sessionId: string; resource: 'status' | 'quality' | 'app' } | null {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'vibesdk:') return null;
        // authority is `session`, path is `/{sessionId}/{resource}`
        if (url.hostname !== 'session') return null;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 2) return null;
        const [sessionId, resource] = parts;
        if (!sessionId) return null;
        if (resource !== 'status' && resource !== 'quality' && resource !== 'app') return null;
        return { sessionId, resource };
    } catch {
        return null;
    }
}

// ── Argument validation ───────────────────────────────────────────────────────

const SessionIdArgs = z.object({ sessionId: z.string().min(1) });

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleGetStatus(
    args: unknown,
    env: Env,
    user: AuthUser,
): Promise<string> {
    const { sessionId } = SessionIdArgs.parse(args);
    const svc = new SessionMonitorService(env);

    const [ownerUserId, progress] = await Promise.all([
        svc.getOwnerUserId(sessionId),
        svc.getPlanProgress(sessionId),
    ]);

    if (!ownerUserId && progress.total === 0) {
        throw new McpToolError('Session not found', 404);
    }
    if (ownerUserId && ownerUserId !== user.id) {
        throw new McpToolError('Session not found', 404);
    }

    const [budget, current, startedAt, lastEventAt] = await Promise.all([
        svc.getAgentBudget(sessionId),
        svc.getCurrentActivity(sessionId),
        svc.getStartedAt(sessionId),
        svc.getLastEventAt(sessionId),
    ]);

    const tokensSpent = budget
        ? (budget.promptTokens ?? 0) + (budget.completionTokens ?? 0)
        : 0;
    const creditsSpent = Math.ceil(tokensSpent / 250);
    const start = startedAt ?? Date.now();
    const elapsedMs = Math.max(0, Date.now() - start);

    const deriveStatus = (): string => {
        if (progress.running > 0) return 'coding';
        if (progress.failed > 0 && progress.done < progress.total) return 'failed';
        if (progress.total > 0 && progress.done >= progress.total) return 'done';
        if (progress.pending > 0) return 'planning';
        return 'idle';
    };

    return JSON.stringify({
        sessionId,
        status: deriveStatus(),
        progress: { completed: progress.done, total: progress.total },
        cost: { tokensSpent, creditsSpent },
        agents: { running: progress.running, done: progress.done, failed: progress.failed },
        currentActivity: current?.title ?? null,
        elapsedMs,
        lastEventAt,
    }, null, 2);
}

async function handleGetQuality(
    args: unknown,
    env: Env,
    user: AuthUser,
): Promise<string> {
    const { sessionId } = SessionIdArgs.parse(args);
    const svc = new EvalResultsService(env);

    const ownerUserId = await svc.getSessionOwnerUserId(sessionId);
    if (ownerUserId === null) {
        throw new McpToolError('Session not found', 404);
    }
    if (ownerUserId !== user.id) {
        throw new McpToolError('Session not found', 404);
    }

    const rows = await svc.getEvalResults(sessionId);

    if (rows.length === 0) {
        return JSON.stringify({
            sessionId,
            hasResults: false,
            message: 'No eval results yet. Generation may still be in progress.',
            phases: [],
            overallCompositeScore: null,
        }, null, 2);
    }

    const phases = rows.map((row) => ({
        phaseName: row.phaseName,
        attempt: row.attempt,
        passed: row.passed === 1,
        compositeScore: computeCompositeEvalScore({
            faithfulness: row.faithfulness,
            answerRelevancy: row.answerRelevancy,
            toolCorrectness: row.toolCorrectness,
            hallucinationRisk: row.hallucinationRisk,
        }),
        faithfulness: row.faithfulness,
        answerRelevancy: row.answerRelevancy,
        toolCorrectness: row.toolCorrectness,
        hallucinationRisk: row.hallucinationRisk,
        blockedReason: row.blockedReason ?? null,
        judgeTokens: {
            input: row.judgeInputTokens ?? 0,
            output: row.judgeOutputTokens ?? 0,
        },
    }));

    const overallCompositeScore =
        phases.reduce((sum, p) => sum + p.compositeScore, 0) / phases.length;

    return JSON.stringify({
        sessionId,
        hasResults: true,
        overallCompositeScore: Math.round(overallCompositeScore * 1000) / 1000,
        overallPassed: phases.every((p) => p.passed),
        phases,
    }, null, 2);
}

async function handleDescribeApp(
    args: unknown,
    env: Env,
    user: AuthUser,
): Promise<string> {
    const { sessionId } = SessionIdArgs.parse(args);
    const svc = new AppService(env);

    const app = await svc.getAppDetails(sessionId, user.id);
    if (!app) {
        throw new McpToolError('App not found', 404);
    }
    // Allow owner or public apps; hide private apps of other users.
    if (app.userId !== user.id && app.visibility !== 'public') {
        throw new McpToolError('App not found', 404);
    }

    return JSON.stringify({
        id: app.id,
        title: app.title,
        description: app.description ?? null,
        originalPrompt: app.originalPrompt,
        framework: app.framework ?? null,
        status: app.status,
        visibility: app.visibility,
        createdAt: app.createdAt,
        sessionUrl: `/chat/${app.id}`,
    }, null, 2);
}

// ── Resource handlers ─────────────────────────────────────────────────────────

/**
 * Build the text content for a resource URI.
 * Ownership is checked via the same DB guards used by the equivalent tool handlers.
 */
async function readResource(
    sessionId: string,
    resource: 'status' | 'quality' | 'app',
    env: Env,
    user: AuthUser,
): Promise<string> {
    switch (resource) {
        case 'status':
            return handleGetStatus({ sessionId }, env, user);
        case 'quality':
            return handleGetQuality({ sessionId }, env, user);
        case 'app':
            return handleDescribeApp({ sessionId }, env, user);
    }
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

class McpToolError extends Error {
    constructor(message: string, readonly statusCode: number) {
        super(message);
        this.name = 'McpToolError';
    }
}

async function callTool(
    name: string,
    args: unknown,
    env: Env,
    user: AuthUser,
): Promise<unknown> {
    switch (name) {
        case 'vibesdk_get_status':
            return handleGetStatus(args, env, user);
        case 'vibesdk_get_quality':
            return handleGetQuality(args, env, user);
        case 'vibesdk_describe_app':
            return handleDescribeApp(args, env, user);
        default:
            throw new McpToolError(`Unknown tool: ${name}`, 404);
    }
}

// ── MCP method handlers ───────────────────────────────────────────────────────

function handleInitialize(id: string | number | null): JsonRpcResponse {
    return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
            tools: {},
            // S10 — MCP Resources (Mastra v1.32 pattern, MCP 2024-11-05 §resources).
            // Read-only; non-subscribable (stateless HTTP POST, no push channel).
            resources: {
                subscribe: false,
                listChanged: false,
            },
        },
        serverInfo: {
            name: 'vibesdk',
            version: '1.1.0',
        },
        instructions:
            'vibesdk MCP server. Use tools (vibesdk_get_status, vibesdk_get_quality, ' +
            'vibesdk_describe_app) or resources (vibesdk://session/{sessionId}/status|quality|app) ' +
            'to inspect code generation sessions. All require a sessionId ' +
            '(the app ID returned when creating a session via POST /api/agent).',
    });
}

function handleResourcesList(id: string | number | null): JsonRpcResponse {
    // Return URI templates (RFC 6570 Level 1) — clients substitute {sessionId}.
    return ok(id, {
        resources: [],
        resourceTemplates: MCP_RESOURCE_TEMPLATES,
    });
}

async function handleResourcesRead(
    id: string | number | null,
    params: unknown,
    env: Env,
    user: AuthUser,
): Promise<JsonRpcResponse> {
    const parsed = z
        .object({ uri: z.string().min(1) })
        .safeParse(params);

    if (!parsed.success) {
        return err(id, JSONRPC_ERROR.INVALID_PARAMS, 'resources/read requires a uri parameter');
    }

    const { uri } = parsed.data;
    const parsed_uri = parseResourceUri(uri);

    if (!parsed_uri) {
        return err(
            id,
            JSONRPC_ERROR.INVALID_PARAMS,
            `Unrecognised resource URI. Expected format: vibesdk://session/{sessionId}/{status|quality|app}`,
        );
    }

    try {
        const text = await readResource(parsed_uri.sessionId, parsed_uri.resource, env, user);
        return ok(id, {
            contents: [{ uri, mimeType: 'application/json', text }],
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return err(id, JSONRPC_ERROR.INVALID_PARAMS, 'Invalid resource arguments', e.issues);
        }
        if (e instanceof McpToolError) {
            return err(id, JSONRPC_ERROR.INTERNAL_ERROR, e.message);
        }
        logger.error('MCP resource read failed', {
            uri,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(id, JSONRPC_ERROR.INTERNAL_ERROR, 'Resource read failed');
    }
}

function handleToolsList(id: string | number | null): JsonRpcResponse {
    return ok(id, { tools: MCP_TOOLS });
}

async function handleToolsCall(
    id: string | number | null,
    params: unknown,
    env: Env,
    user: AuthUser,
): Promise<JsonRpcResponse> {
    const parsed = z
        .object({ name: z.string(), arguments: z.unknown().optional() })
        .safeParse(params);

    if (!parsed.success) {
        return err(id, JSONRPC_ERROR.INVALID_PARAMS, 'tools/call requires name + optional arguments');
    }

    const { name, arguments: toolArgs } = parsed.data;

    try {
        const text = await callTool(name, toolArgs ?? {}, env, user);
        return ok(id, {
            content: [{ type: 'text', text }],
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return err(id, JSONRPC_ERROR.INVALID_PARAMS, 'Invalid tool arguments', e.issues);
        }
        if (e instanceof McpToolError) {
            return err(id, JSONRPC_ERROR.INTERNAL_ERROR, e.message);
        }
        logger.error('MCP tool call failed', {
            tool: name,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(id, JSONRPC_ERROR.INTERNAL_ERROR, 'Tool execution failed');
    }
}

// ── Public handler ────────────────────────────────────────────────────────────

/**
 * Handle one MCP JSON-RPC request. Called by the Hono route.
 *
 * @param body    - Parsed JSON from the request body (must be a JSON-RPC 2.0 object)
 * @param env     - Cloudflare Worker environment bindings
 * @param user    - Authenticated user (ownership checked per tool)
 * @returns       JSON-RPC 2.0 response object (serialize to JSON before sending)
 */
export async function handleMcpRequest(
    body: unknown,
    env: Env,
    user: AuthUser,
): Promise<JsonRpcResponse> {
    // Parse JSON-RPC envelope
    const rpcParsed = z
        .object({
            jsonrpc: z.literal('2.0'),
            id: z.union([z.string(), z.number(), z.null()]).optional().default(null),
            method: z.string(),
            params: z.unknown().optional(),
        })
        .safeParse(body);

    if (!rpcParsed.success) {
        return err(null, JSONRPC_ERROR.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
    }

    const { id, method, params } = rpcParsed.data;

    switch (method) {
        case 'initialize':
            return handleInitialize(id);

        case 'notifications/initialized':
            // Client acknowledgement — no response required for notifications,
            // but return a null-id success so callers get a clean HTTP 200.
            return ok(null, {});

        case 'tools/list':
            return handleToolsList(id);

        case 'tools/call':
            return handleToolsCall(id, params, env, user);

        // S10 — MCP Resources (Mastra v1.32 pattern, MCP 2024-11-05 §resources).
        case 'resources/list':
            return handleResourcesList(id);

        case 'resources/read':
            return handleResourcesRead(id, params, env, user);

        default:
            return err(id, JSONRPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
}
