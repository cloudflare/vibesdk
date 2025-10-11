import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';

/**
 * Sentry Tunnel Controller
 * Proxies Sentry events from frontend to bypass ad blockers
 * Implements https://docs.sentry.io/platforms/javascript/troubleshooting/#dealing-with-ad-blockers
 */
export class SentryTunnelController extends BaseController {
    /**
     * Tunnel endpoint for Sentry events from the frontend.
     * POST /api/sentry/tunnel
     * 
     * This endpoint:
     * 1. Receives Sentry envelopes from the frontend
     * 2. Validates they're for our configured DSN
     * 3. Forwards them to Sentry with proper auth headers
     */
    static async tunnel(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Check if Sentry is configured
            if (!env.SENTRY_DSN) {
                return SentryTunnelController.createErrorResponse('Sentry not configured', 503);
            }

            const envelope = await request.text();
            
            if (!envelope) {
                return SentryTunnelController.createErrorResponse('Empty envelope', 400);
            }

            // Parse envelope to validate it's for our DSN
            const pieces = envelope.split('\n');
            if (pieces.length < 2) {
                return SentryTunnelController.createErrorResponse('Invalid envelope format', 400);
            }

            const header = JSON.parse(pieces[0]);
            const dsn = header.dsn;
            
            // Security: Validate the DSN matches our configured one
            if (!dsn || dsn !== env.SENTRY_DSN) {
                return SentryTunnelController.createErrorResponse('Invalid DSN', 403);
            }

            // Parse our DSN to get the ingestion URL
            const dsnUrl = new URL(env.SENTRY_DSN);
            const projectId = dsnUrl.pathname.replace('/', '');
            const sentryHost = dsnUrl.hostname;
            
            // Build the Sentry ingestion endpoint URL
            const sentryUrl = `https://${sentryHost}/api/${projectId}/envelope/`;
            
            // Build headers including CF Access headers if configured
            const headers: HeadersInit = {
                'Content-Type': 'application/x-sentry-envelope',
            };
            
            // Add CF Access headers if configured (matching backend Sentry config)
            if (env.CF_ACCESS_ID && env.CF_ACCESS_SECRET) {
                headers['CF-Access-Client-Id'] = env.CF_ACCESS_ID;
                headers['CF-Access-Client-Secret'] = env.CF_ACCESS_SECRET;
            }
            
            // Forward to Sentry
            const sentryResponse = await fetch(sentryUrl, {
                method: 'POST',
                body: envelope,
                headers,
            });

            // Return Sentry's response
            return new Response(sentryResponse.body, {
                status: sentryResponse.status,
                headers: {
                    'Content-Type': sentryResponse.headers.get('Content-Type') || 'text/plain',
                },
            });
        } catch (error) {
            // Log error but return success to not block the frontend
            // Sentry SDKs expect 200 OK even on tunnel errors
            this.logger.error('Sentry tunnel error', error);
            return new Response('ok', { status: 200 });
        }
    }
}
