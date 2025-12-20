import { isOriginAllowed } from '../../config/security';
import { createLogger } from '../../logger';

const logger = createLogger('WebSocketSecurity');

export function validateWebSocketOrigin(request: Request, env: Env): boolean {
    const origin = request.headers.get('Origin');
    
    if (!origin) {
        // Server-side SDK clients do not send `Origin`.
        // ownership and authorization is anyways checked in the middlewares already
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
            return true;
        }

        logger.warn('WebSocket connection attempt without Origin header');
        return false;
    }
    
    if (!isOriginAllowed(env, origin)) {
        logger.warn('WebSocket connection rejected from unauthorized origin', { origin });
        return false;
    }
    
    return true;
}

export function getWebSocketSecurityHeaders(): Record<string, string> {
    return {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block'
    };
}
