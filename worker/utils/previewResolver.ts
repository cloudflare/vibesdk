import { proxyToSandbox } from '../services/sandbox/request-handler';
import { isDispatcherAvailable } from './dispatcherUtils';
import { createLogger } from '../logger';

const logger = createLogger('PreviewResolver');

export type PreviewType = 'sandbox' | 'sandbox-error' | 'dispatcher';

export interface PreviewResult {
    available: boolean;
    type?: PreviewType;
    response?: Response;
    error?: string;
}

/**
 * Resolve preview availability for an app by checking sandbox and dispatcher
 * @param appId - The app identifier (subdomain)
 * @param request - The incoming request
 * @param env - Worker environment
 * @returns PreviewResult with availability status and response
 */
export async function resolvePreview(
    appId: string,
    request: Request,
    env: Env
): Promise<PreviewResult> {
    // Try sandbox first
    const sandboxResponse = await proxyToSandbox(request, env);
    if (sandboxResponse) {
        logger.info(`Preview available in sandbox for: ${appId}`);
        
        const type: PreviewType = sandboxResponse.status === 500 ? 'sandbox-error' : 'sandbox';
        
        return {
            available: sandboxResponse.status !== 500,
            type,
            response: sandboxResponse,
        };
    }

    // Try dispatcher (deployed worker)
    logger.info(`Sandbox miss for ${appId}, attempting dispatch to permanent worker`);
    if (!isDispatcherAvailable(env)) {
        logger.warn(`Dispatcher not available, cannot serve: ${appId}`);
        return {
            available: false,
            error: 'This application is not currently available.',
        };
    }

    try {
        const dispatcher = env['DISPATCHER'];
        const worker = dispatcher.get(appId);
        const dispatcherResponse = await worker.fetch(request);

        logger.info(`Preview available in dispatcher for: ${appId}`);
        
        return {
            available: dispatcherResponse.ok,
            type: 'dispatcher',
            response: dispatcherResponse,
        };
    } catch (error: unknown) {
        const err = error as Error;
        logger.warn(`Error dispatching to worker '${appId}': ${err.message}`);
        return {
            available: false,
            error: 'An error occurred while loading this application.',
        };
    }
}
