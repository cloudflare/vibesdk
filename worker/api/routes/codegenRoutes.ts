import { CodingAgentController } from '../controllers/agent/controller';
import { AppDatabaseController } from '../controllers/appDatabase/controller';
import { ArtifactsController } from '../controllers/artifacts/controller';
import { AppEnv } from '../../types/appenv';
import { Hono } from 'hono';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';

/**
 * Setup and configure the application router
 */
export function setupCodegenRoutes(app: Hono<AppEnv>): void {
    // ========================================
    // CODE GENERATION ROUTES
    // ========================================
    
    // CRITICAL: Create new app - requires full authentication
    app.post('/api/agent', setAuthLevel(AuthConfig.authenticated), adaptController(CodingAgentController, CodingAgentController.startCodeGeneration));
    
    // ========================================
    // APP EDITING ROUTES (/chat/:id frontend)
    // ========================================
    
    // WebSocket for app editing - OWNER ONLY with ticket support
    // Supports ticket-based auth (SDK) or JWT-based auth (browser)
    app.get('/api/agent/:agentId/ws', setAuthLevel(AuthConfig.ownerOnly, { 
        ticketAuth: { resourceType: 'agent', paramName: 'agentId' } 
    }), adaptController(CodingAgentController, CodingAgentController.handleWebSocketConnection));
    
    // Connect to existing agent for editing - OWNER ONLY
    // Only the app owner should be able to connect for editing purposes
    app.get('/api/agent/:agentId/connect', setAuthLevel(AuthConfig.ownerOnly), adaptController(CodingAgentController, CodingAgentController.connectToExistingAgent));

    // Deploy an ephemeral SANDBOX preview. Intentionally `authenticated` (not
    // `ownerOnly`): public-app previews must be viewer-triggerable, while
    // private apps are owner-gated inside the controller. This is sandbox-only
    // and never mutates production deploy state — see the rationale in
    // CodingAgentController.deployPreview and the port-3000/token hardening in
    // worker/services/sandbox/request-handler.ts.
    app.get('/api/agent/:agentId/preview', setAuthLevel(AuthConfig.authenticated), adaptController(CodingAgentController, CodingAgentController.deployPreview));

    // ========================================
    // APP DATABASE (DB tab) — read-only viewer
    // ========================================
    // Inspect the SQLite storage of the user's App Durable Object,
    // hosted as a Facet of SpaceDO. Only think-behavior apps have
    // a SpaceDO; other behaviors will 404 / error harmlessly.
    app.get(
        '/api/agent/:agentId/db/tables',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(AppDatabaseController, AppDatabaseController.listTables),
    );
    app.get(
        '/api/agent/:agentId/db/query',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(AppDatabaseController, AppDatabaseController.queryTable),
    );
    app.post(
        '/api/agent/:agentId/db/wipe',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(AppDatabaseController, AppDatabaseController.wipe),
    );

    // ========================================
    // ARTIFACTS (Repo tab) — read-only viewer
    // ========================================
    // Owner-gated proxy to the app's Cloudflare Artifacts repository. The
    // repo name (app id) travels in the path; per-repo ownership is enforced
    // inside the controller's `beforeRequest` hook. Auth is `authenticated`
    // (not param-based `ownerOnly`) because the resource id is not a route
    // param — see ArtifactsController.
    app.all(
        '/api/artifacts/*',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(ArtifactsController, ArtifactsController.proxy),
    );

    // Branch list for the Repo tab's branch selector (SpaceDO git op).
    app.get(
        '/api/agent/:agentId/branches',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(ArtifactsController, ArtifactsController.listBranches),
    );
}