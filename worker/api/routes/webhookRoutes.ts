/**
 * Webhook routes — inbound message receiver for WhatsApp, Telegram, and
 * generic HTTP clients.  No user-JWT auth on inbound (token-based instead).
 *
 * Routes:
 *   POST  /webhook/inbound/:sessionId   — receive a message
 *   GET   /webhook/inbound/:sessionId   — WhatsApp hub.challenge verification
 *   GET   /webhook/token/:sessionId     — retrieve pre-shared token for URL config
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { InboundWebhookController } from '../controllers/webhook/inboundWebhookController';

export function setupWebhookRoutes(app: Hono<AppEnv>): void {
    // Inbound message — WhatsApp / Telegram / generic POST
    app.on(
        ['GET', 'POST'],
        '/webhook/inbound/:sessionId',
        (c) => InboundWebhookController.handle(c.req.raw, c.env as unknown as Env),
    );

    // Token generation for a session (no user-JWT required — session-scoped)
    app.get(
        '/webhook/token/:sessionId',
        (c) => InboundWebhookController.getToken(c.req.raw, c.env as unknown as Env),
    );
}
