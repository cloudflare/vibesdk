import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { resolvePreview } from '../../utils/previewResolver';
import { buildUserWorkerUrl } from '../../utils/urls';

/**
 * Preview status routes - check if an app preview is available
 * This directly checks sandbox/dispatcher without needing to access subdomain URLs
 */
export function setupPreviewProxyRoutes(app: Hono<AppEnv>): void {
    // Check preview availability for an app (HEAD request only)
    app.on('HEAD', '/api/apps/:id/preview-status', setAuthLevel(AuthConfig.public), async (c) => {
        const env = c.env;
        const appId = c.req.param('id');

        try {
            // Create a clean, isolated HEAD request for testing
            // This ensures no user cookies or sensitive headers are forwarded
            const testUrl = buildUserWorkerUrl(env, appId);
            const cleanRequest = new Request(testUrl, {
                method: 'HEAD',
            });
            
            const result = await resolvePreview(appId, cleanRequest, env);
            
            if (!result.available) {
                return new Response(null, { status: 404 });
            }
            
            // Return success with preview type header
            const headers = new Headers();
            if (result.type) {
                headers.set('X-Preview-Type', result.type);
                headers.set('Access-Control-Expose-Headers', 'X-Preview-Type');
            }
            
            return new Response(null, { status: 200, headers });
        } catch (error: unknown) {
            const err = error as Error;
            console.error('Preview status check error:', err);
            return new Response(null, { status: 500 });
        }
    });
}
