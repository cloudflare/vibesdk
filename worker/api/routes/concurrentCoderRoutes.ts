/**
 * API routes for the Concurrent Coder feature.
 *
 * Uses the adaptController pattern to enforce authentication,
 * following the established convention in the codebase.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { ConcurrentCoderController } from '../controllers/concurrent-coder/controller';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupConcurrentCoderRoutes(app: Hono<AppEnv>): void {
	const ccRouter = new Hono<AppEnv>();

	/* -------------------------------------------------------------- */
	/*  Session management (proxied to Orchestrator DO)                */
	/* -------------------------------------------------------------- */

	ccRouter.post('/run', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.runSession));
	ccRouter.post('/stop', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.stopSession));
	ccRouter.post('/auto', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.toggleAuto));
	ccRouter.get('/timeline', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.getTimeline));
	ccRouter.get('/status', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.getStatus));

	/* -------------------------------------------------------------- */
	/*  History & Erase                                                */
	/* -------------------------------------------------------------- */

	ccRouter.get('/history', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.getHistory));
	ccRouter.post('/erase', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.eraseSessions));

	/* -------------------------------------------------------------- */
	/*  Superpowers / Skills Manager                                   */
	/* -------------------------------------------------------------- */

	ccRouter.get('/superpowers', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.listSkills));
	ccRouter.post('/superpowers', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.uploadSkill));
	ccRouter.delete('/superpowers/:filename', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.deleteSkill));

	app.route('/api/cc', ccRouter);
}
