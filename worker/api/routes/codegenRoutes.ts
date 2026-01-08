import { CodingAgentController } from '../controllers/agent/controller';
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
    
    // WebSocket for app editing - OWNER ONLY (for /chat/:id route)
    // Only the app owner should be able to connect and modify via WebSocket
    app.get('/api/agent/:agentId/ws', setAuthLevel(AuthConfig.ownerOnly), adaptController(CodingAgentController, CodingAgentController.handleWebSocketConnection));
    
    // Connect to existing agent for editing - OWNER ONLY
    // Only the app owner should be able to connect for editing purposes
    app.get('/api/agent/:agentId/connect', setAuthLevel(AuthConfig.ownerOnly), adaptController(CodingAgentController, CodingAgentController.connectToExistingAgent));

    app.get('/api/agent/:agentId/preview', setAuthLevel(AuthConfig.authenticated), adaptController(CodingAgentController, CodingAgentController.deployPreview));
}