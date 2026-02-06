import { BaseController } from '../baseController';
import type { ControllerResponse, ApiResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { ScreenshotSecurity } from '../../../utils/screenshot-security';

// -------------------------
// Helpers
// -------------------------
function isValidAppId(id: string): boolean {
    // Allow alphanumeric, underscore, dash. Prevent dots and slashes.
    // Length 1-128.
    return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function validateFileName(file: string): string | null {
    // Reject any traversal or path separators
    if (file.includes('..') || file.includes('/') || file.includes('\\') || file.includes('\0')) {
        return null;
    }
    // Enforce simple filename pattern
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(file)) {
        return null;
    }
    // Disallow leading dot files
    if (file.startsWith('.')) {
        return null;
    }
    // Validate extension
    const extIndex = file.lastIndexOf('.');
    if (extIndex <= 0 || extIndex === file.length - 1) {
        return null;
    }
    const ext = file.substring(extIndex + 1).toLowerCase();
    const allowed = new Set(['png', 'jpg', 'jpeg', 'webp']);
    if (!allowed.has(ext)) {
        return null;
    }
    return file;
}

function getMimeByExtension(file: string): string | undefined {
    const ext = file.substring(file.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        default: return undefined;
    }
}
export class ScreenshotsController extends BaseController {
    static logger = createLogger('ScreenshotsController');
    static async serveScreenshot(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<never>>> {
        try {
            const appId = context.pathParams.id;
            const file = context.pathParams.file;

            if (!appId || !file) {
                return ScreenshotsController.createErrorResponse('Missing path parameters', 400);
            }

            // Validate and sanitize path parameters
            if (!isValidAppId(appId)) {
                return ScreenshotsController.createErrorResponse('Invalid app id', 400);
            }

            const validatedFile = validateFileName(file);
            if (!validatedFile) {
                return ScreenshotsController.createErrorResponse('Invalid file name', 400);
            }

            // Verify screenshot access token
            const url = new URL(request.url);
            const token = url.searchParams.get('token');

            if (!token) {
                return ScreenshotsController.createErrorResponse('Screenshot not found', 404);
            }

            const security = new ScreenshotSecurity(env);
            const isValidToken = await security.verifyToken(token, appId);
            if (!isValidToken) {
                return ScreenshotsController.createErrorResponse('Screenshot not found', 404);
            }

            const key = `screenshots/${appId}/${validatedFile}`;
            const obj = await env.TEMPLATES_BUCKET.get(key);
            if (!obj || !obj.body) {
                return ScreenshotsController.createErrorResponse('Screenshot not found', 404);
            }

            const contentType = obj.httpMetadata?.contentType || getMimeByExtension(validatedFile) || 'image/png';
            const headers = new Headers({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=21600',
                'X-Content-Type-Options': 'nosniff',
            });

			// We return a naked Response because our controller helper types expect JSON, but this route is binary.
			// It's safe because the router uses this Response directly.
			return new Response(obj.body, {
				headers,
			}) as unknown as ControllerResponse<ApiResponse<never>>;
		        } catch (error) {
            this.logger.error('Error serving screenshot', { error });
            return ScreenshotsController.createErrorResponse('Internal server error', 500);
        }
    }
}
