/**
 * Extensions Entry Point
 *
 * This module registers all custom extensions that build on top of upstream
 * VibeSDK without modifying upstream files. Every feature we add goes here
 * or in a subdirectory of worker/extensions/.
 *
 * ARCHITECTURE RULE: Never modify upstream files directly.
 * - New backend logic → worker/extensions/ or worker/sdae/
 * - New API routes → registered via setupExtensionRoutes() below
 * - New D1 tables → migrations/0005+ (upstream uses 0000-0004)
 * - New Durable Objects → register in wrangler.jsonc (tracked merge file)
 *
 * The ONLY upstream files we intentionally modify:
 * - worker/api/routes/index.ts (add one line to register extension routes)
 * - wrangler.jsonc (add new DO bindings, vars)
 * - migrations/meta/_journal.json (add our migration entries)
 * - src/routes.ts (add routes for extension pages)
 *
 * See docs/UPSTREAM_UPGRADE_GUIDE.md and
 * docs/GAP_ANALYSIS_AND_IMPLEMENTATION_GUIDE.md for full details.
 */

import type { Hono } from 'hono';
import type { AppEnv } from '../types/appenv';

// Import extension route modules as they are built
// import { setupCreditRoutes } from './credits/routes';
// import { setupAgentProfileRoutes } from './agent-profiles/routes';

/**
 * Register all extension API routes.
 * Call this from worker/api/routes/index.ts with a single line:
 *   import { setupExtensionRoutes } from '../../extensions';
 *   setupExtensionRoutes(app);
 */
export function setupExtensionRoutes(_app: Hono<AppEnv>): void {
    // Phase 1: Credits & Machine Types
    // setupCreditRoutes(app);
    // setupAgentProfileRoutes(app);

    // Phase 2: Agent Builder & GitHub Import
    // setupAgentBuilderRoutes(app);
    // setupGitHubImportRoutes(app);

    // Phase 3: Notifications & Billing
    // setupNotificationRoutes(app);
    // setupBillingRoutes(app);
}
