/**
 * Mastra client factory — lazy singleton per Worker isolate.
 *
 * Mastra 1.x requires Node-compatible runtime for full features (storage,
 * observability).  In a Cloudflare Worker context we use in-memory mode:
 * - No Mastra storage (state lives in the Durable Object SQL layer)
 * - No Studio observability (CF Workers lack DO-backed trace store)
 * - Workflows run to completion in the Worker's request lifetime
 *
 * The singleton avoids re-instantiating Mastra for each WebSocket message
 * while staying within Workers' per-isolate lifetime model.
 */

import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '../../logger';

const logger = createLogger('MastraClient');

let _instance: Mastra | null = null;

/**
 * Return the shared Mastra instance for this Worker isolate.
 * Creates it on first call; subsequent calls return the cached instance.
 */
export function getMastra(): Mastra {
    if (_instance) return _instance;

    logger.info('Initialising Mastra instance (in-memory mode)');

    _instance = new Mastra({
        // No storage: DO SQLite owns all persistent state.
        // No logger: vibesdk has its own logging layer.
        // Workflows are registered lazily via registerWorkflow() calls.
    });

    return _instance;
}

/**
 * Reset the singleton — test helper only.
 * @internal
 */
export function _resetMastraForTest(): void {
    _instance = null;
}
