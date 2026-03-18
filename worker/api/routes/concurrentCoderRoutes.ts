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
	const coderRouter = new Hono<AppEnv>();

	/* -------------------------------------------------------------- */
	/*  Session management (proxied to Orchestrator DO)                */
	/* -------------------------------------------------------------- */

	coderRouter.post('/run', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.runSession));
	coderRouter.post('/stop', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.stopSession));
	coderRouter.post('/auto', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.toggleAuto));
	coderRouter.get('/timeline', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.getTimeline));
	coderRouter.get('/status', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.getStatus));

	/* -------------------------------------------------------------- */
	/*  History & Erase                                                */
	/* -------------------------------------------------------------- */

	coderRouter.get('/history', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.getHistory));
	coderRouter.post('/erase', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.eraseSessions));

	/* -------------------------------------------------------------- */
	/*  Superpowers / Skills Manager                                   */
	/* -------------------------------------------------------------- */

	coderRouter.get('/superpowers', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.listSkills));
	coderRouter.post('/superpowers', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.uploadSkill));
	coderRouter.delete('/superpowers/:filename', setAuthLevel(AuthConfig.authenticated), adaptController(ConcurrentCoderController, ConcurrentCoderController.deleteSkill));

	app.route('/api/coder', coderRouter);
}
