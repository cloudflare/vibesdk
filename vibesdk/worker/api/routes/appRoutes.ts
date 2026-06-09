import { AppController } from '../controllers/apps/controller';
import { AppViewController } from '../controllers/appView/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup app management routes
 */
export function setupAppRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for app routes
    const appRouter = new Hono<AppEnv>();
    
    // ========================================
    // PUBLIC ROUTES (Unauthenticated users can access)
    // ========================================
    
    // FIXED: Main apps listing - PUBLIC for /apps frontend route
    // This powers the main /apps page that shows all public apps
    appRouter.get('/public', setAuthLevel(AuthConfig.public), adaptController(AppController, AppController.getPublicApps));

    // ========================================
    // AUTHENTICATED USER ROUTES (Personal dashboard routes)
    // ========================================
    
    // Get user's personal apps - requires authentication (for dashboard/profile)
    appRouter.get('/', setAuthLevel(AuthConfig.authenticated), adaptController(AppController, AppController.getUserApps));

    // Get recent apps - requires authentication (for dashboard)
    appRouter.get('/recent', setAuthLevel(AuthConfig.authenticated), adaptController(AppController, AppController.getRecentApps));

    // Get favorite apps - requires authentication (for dashboard)
    appRouter.get('/favorites', setAuthLevel(AuthConfig.authenticated), adaptController(AppController, AppController.getFavoriteApps));

    // ========================================
    // AUTHENTICATED INTERACTION ROUTES
    // ========================================
    
    // Star/bookmark ANY app - requires authentication (can star others' public apps)
    appRouter.post('/:id/star', setAuthLevel(AuthConfig.authenticated), adaptController(AppViewController, AppViewController.toggleAppStar));
    
    // // Fork ANY public app - requires authentication (can fork others' public apps)
    // DISABLED: Has been disabled for initial alpha release, for security reasons
    // appRouter.post('/:id/fork', setAuthLevel(AuthConfig.authenticated), adaptController(AppViewController, AppViewController.forkApp));

    // Toggle favorite status - requires authentication  
    appRouter.post('/:id/favorite', setAuthLevel(AuthConfig.authenticated), adaptController(AppController, AppController.toggleFavorite));

    // ========================================
    // PUBLIC APP DETAILS (placed after specific routes to avoid conflicts)
    // ========================================

    // App details view - PUBLIC for /app/:id frontend route  
    // Allows unauthenticated users to view and preview apps
    appRouter.get('/:id', setAuthLevel(AuthConfig.public), adaptController(AppViewController, AppViewController.getAppDetails));

    // ========================================
    // OWNER-ONLY ROUTES (App modification)
    // ========================================
    
    // Update app visibility - OWNER ONLY
    appRouter.put('/:id/visibility', setAuthLevel(AuthConfig.ownerOnly), adaptController(AppController, AppController.updateAppVisibility));

    // Delete app - OWNER ONLY
    appRouter.delete('/:id', setAuthLevel(AuthConfig.ownerOnly), adaptController(AppController, AppController.deleteApp));
    
    // ========================================
    // GIT CLONE ROUTES
    // ========================================
    
    // Generate git clone token for private repos - OWNER ONLY
    appRouter.post('/:id/git/token', setAuthLevel(AuthConfig.ownerOnly), adaptController(AppViewController, AppViewController.generateGitCloneToken));
    
    
    // Mount the app router under /api/apps
    app.route('/api/apps', appRouter);
}
