/**
 * InboundWebhookController
 *
 * Receives inbound messages from external messaging platforms (WhatsApp Cloud
 * API, Telegram Bot API) and forwards them to the target vibesdk session.
 *
 * URL:   POST  /webhook/inbound/:sessionId
 * Auth:  HMAC-SHA256 token in `x-webhook-token` header OR `?token=` query
 *        param (both checked; first match wins).
 *        Token == HMAC-SHA256(WEBHOOK_SECRET, sessionId) encoded as hex.
 *        Clients generate it once via GET /webhook/token/:sessionId.
 *
 * Response delivery:
 *   Inbound messages are forwarded to the Durable Object via RPC
 *   (agentInstance.handleUserInput).  The agent then streams its response
 *   over the existing WebSocket channel.  Outbound webhook push (e.g. calling
 *   WhatsApp send-message API) is a future sprint; for now callers must poll
 *   or maintain a WS connection.
 *
 * Supported providers:
 *   - whatsapp  (Meta Cloud API v19.0+)
 *   - telegram  (Bot API, any recent version)
 *   - generic   (plain JSON { text: string })
 */

import { createLogger } from '../../../logger';
import { getAgentStub } from '../../../agents';

const logger = createLogger('InboundWebhookController');

// ── Types ──────────────────────────────────────────────────────────────────

interface ParsedInbound {
    readonly text: string;
    readonly senderName: string;
    readonly senderId: string;
    readonly provider: string;
}

interface WebhookVerificationChallenge {
    readonly isChallenge: true;
    readonly response: string;
}

type ParseResult = ParsedInbound | WebhookVerificationChallenge | null;

// ── Signature helpers ──────────────────────────────────────────────────────

async function signHex(secret: string, data: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyToken(env: Env, sessionId: string, provided: string | null): Promise<boolean> {
    const secret = (env as unknown as Record<string, unknown>).WEBHOOK_SECRET as string | undefined;
    if (!secret || !provided) return false;
    const expected = await signHex(secret, sessionId);
    // Constant-time comparison via timing-safe HMAC verify.
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(provided));
    // If HMAC(expected, provided) == HMAC(expected, expected) → tokens match.
    const self = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(expected));
    return Buffer.from(mac).toString('hex') === Buffer.from(self).toString('hex');
}

// ── Payload parsers ────────────────────────────────────────────────────────

function parseWhatsApp(body: Record<string, unknown>): ParseResult {
    try {
        // WhatsApp Cloud API webhook body:
        // { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [...] } }] }] }
        const entries = body.entry as Array<Record<string, unknown>> | undefined;
        if (!entries?.length) return null;

        const changes = (entries[0].changes as Array<Record<string, unknown>> | undefined) ?? [];
        if (!changes.length) return null;

        const value = changes[0].value as Record<string, unknown> | undefined;
        if (!value) return null;

        const messages = value.messages as Array<Record<string, unknown>> | undefined;
        if (!messages?.length) return null;

        const msg = messages[0];
        const textContent = (msg.text as Record<string, unknown> | undefined)?.body as string | undefined;
        if (!textContent) return null;

        const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
        const senderName = (contacts?.[0]?.profile as Record<string, unknown> | undefined)?.name as string ?? 'WhatsApp user';
        const senderId = msg.from as string ?? 'unknown';

        return { text: textContent, senderName, senderId, provider: 'whatsapp' };
    } catch {
        return null;
    }
}

function parseTelegram(body: Record<string, unknown>): ParseResult {
    try {
        // Telegram Bot API webhook body: { update_id, message: { text, from: { id, first_name } } }
        const message = body.message as Record<string, unknown> | undefined;
        if (!message) return null;

        const text = message.text as string | undefined;
        if (!text) return null;

        const from = message.from as Record<string, unknown> | undefined;
        const firstName = (from?.first_name as string | undefined) ?? '';
        const lastName = (from?.last_name as string | undefined) ?? '';
        const senderName = [firstName, lastName].filter(Boolean).join(' ') || 'Telegram user';
        const senderId = String(from?.id ?? 'unknown');

        return { text, senderName, senderId, provider: 'telegram' };
    } catch {
        return null;
    }
}

function parseGeneric(body: Record<string, unknown>): ParseResult {
    const text = body.text as string | undefined;
    if (!text) return null;
    return {
        text,
        senderName: (body.sender as string | undefined) ?? 'webhook',
        senderId: (body.senderId as string | undefined) ?? 'webhook',
        provider: 'generic',
    };
}

function detectAndParse(
    body: Record<string, unknown>,
    provider: string,
): ParseResult {
    // WhatsApp verification challenge (GET with hub.challenge).
    if (body['hub.challenge']) {
        return { isChallenge: true, response: String(body['hub.challenge']) };
    }

    switch (provider) {
        case 'whatsapp': return parseWhatsApp(body);
        case 'telegram': return parseTelegram(body);
        default: return parseGeneric(body);
    }
}

// ── Controller ─────────────────────────────────────────────────────────────

export class InboundWebhookController {

    /**
     * POST /webhook/inbound/:sessionId
     * GET  /webhook/inbound/:sessionId  (WhatsApp hub.challenge verification)
     */
    static async handle(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        // pathname: /webhook/inbound/:sessionId  → parts: ['webhook', 'inbound', sessionId]
        const sessionId = pathParts[2];

        if (!sessionId) {
            return InboundWebhookController.json({ error: 'Missing sessionId in path' }, 400);
        }

        // WhatsApp GET verification challenge — bypass token check.
        if (request.method === 'GET') {
            const challenge = url.searchParams.get('hub.challenge');
            const verifyToken = url.searchParams.get('hub.verify_token');
            if (challenge && verifyToken) {
                // Return the challenge so Meta can verify ownership.
                return new Response(challenge, { status: 200 });
            }
            return InboundWebhookController.json({ error: 'Not a verification request' }, 400);
        }

        if (request.method !== 'POST') {
            return InboundWebhookController.json({ error: 'Method not allowed' }, 405);
        }

        // Token verification.
        const tokenHeader = request.headers.get('x-webhook-token');
        const tokenQuery = url.searchParams.get('token');
        const tokenOk = await verifyToken(env, sessionId, tokenHeader ?? tokenQuery);
        if (!tokenOk) {
            logger.warn('Webhook token verification failed', { sessionId });
            return InboundWebhookController.json({ error: 'Unauthorized' }, 401);
        }

        // Parse body.
        let body: Record<string, unknown>;
        try {
            body = await request.json() as Record<string, unknown>;
        } catch {
            return InboundWebhookController.json({ error: 'Invalid JSON body' }, 400);
        }

        const provider = (url.searchParams.get('provider') ?? 'generic').toLowerCase();
        const parsed = detectAndParse(body, provider);

        if (!parsed) {
            // No actionable message — return 200 to prevent retry loops.
            return InboundWebhookController.json({ ok: true, skipped: true });
        }

        if ('isChallenge' in parsed) {
            return new Response(parsed.response, { status: 200 });
        }

        // Forward to the Durable Object.
        try {
            const agentStub = await getAgentStub(env, sessionId);
            const isInit = await agentStub.isInitialized();
            if (!isInit) {
                logger.warn('Webhook message for uninitialised session', { sessionId });
                return InboundWebhookController.json({ error: 'Session not found' }, 404);
            }

            const prefix = parsed.senderName ? `[${parsed.senderName}] ` : '';
            await agentStub.handleUserInput(`${prefix}${parsed.text}`);

            logger.info('Webhook message forwarded', {
                sessionId,
                provider: parsed.provider,
                senderId: parsed.senderId,
                textLength: parsed.text.length,
            });
            return InboundWebhookController.json({ ok: true });
        } catch (err) {
            logger.error('Failed to forward webhook message', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
            return InboundWebhookController.json({ error: 'Internal error' }, 500);
        }
    }

    /**
     * GET /webhook/token/:sessionId
     * Returns the pre-shared token for a session so the caller can configure
     * their webhook URL.  Requires the same WEBHOOK_SECRET env var.
     *
     * This endpoint is intentionally unauthenticated (no user JWT check) since
     * it only reveals a session-scoped token — the caller must already know the
     * sessionId to request a token for it.
     */
    static async getToken(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const sessionId = pathParts[2];

        if (!sessionId) {
            return InboundWebhookController.json({ error: 'Missing sessionId' }, 400);
        }

        const secret = (env as unknown as Record<string, unknown>).WEBHOOK_SECRET as string | undefined;
        if (!secret) {
            return InboundWebhookController.json({ error: 'Webhook not configured on this deployment' }, 503);
        }

        const token = await signHex(secret, sessionId);
        const webhookUrl = `${url.origin}/webhook/inbound/${sessionId}?token=${token}`;

        return InboundWebhookController.json({ sessionId, token, webhookUrl });
    }

    private static json(data: unknown, status = 200): Response {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
