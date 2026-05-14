/**
 * GitLogController — exposes the session's isomorphic-git commit history.
 *
 * GET /api/sessions/:sessionId/git/log?limit=20
 *
 * Each commit is a phase-level entry written by phasic.ts on phase completion
 * (saveGeneratedFiles with a commit message). The git store lives in the DO's
 * SQLite-FS adapter — this controller makes an RPC call to the DO to retrieve it.
 *
 * Auth: authenticated. Ownership checked via apps table (same as qualityController).
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { getAgentStubLightweight } from '../../../agents';
import { EvalResultsService } from '../../../database/services/EvalResultsService';

const logger = createLogger('GitLogController');

export interface GitCommitEntry {
    oid: string;
    message: string;
    author: string;
    timestamp: string;
}

export interface GitLogResponse {
    sessionId: string;
    commits: GitCommitEntry[];
}

export class GitLogController extends BaseController {
    static logger = logger;

    static async getGitLog(
        req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<GitLogResponse>>> {
        try {
            const user = context.user!;
            const sessionId = context.pathParams.sessionId;

            if (!sessionId) {
                return GitLogController.createErrorResponse<GitLogResponse>(
                    'Session ID is required',
                    400,
                );
            }

            // Ownership check via apps table (same pattern as qualityController)
            const svc = new EvalResultsService(env);
            const ownerUserId = await svc.getSessionOwnerUserId(sessionId);

            if (ownerUserId === null) {
                return GitLogController.createErrorResponse<GitLogResponse>(
                    'Session not found',
                    404,
                );
            }
            if (ownerUserId !== user.id) {
                return GitLogController.createErrorResponse<GitLogResponse>(
                    'Forbidden',
                    403,
                );
            }

            // Parse limit from query string (default 20, max 100)
            const url = new URL(req.url);
            const limitParam = parseInt(url.searchParams.get('limit') ?? '20', 10);
            const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100);

            // Call the DO via RPC
            const stub = await getAgentStubLightweight(env, sessionId);
            const commits = await stub.getGitLog(limit);

            return GitLogController.createSuccessResponse<GitLogResponse>({
                sessionId,
                commits,
            });
        } catch (err) {
            logger.error('getGitLog failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return GitLogController.createErrorResponse<GitLogResponse>(
                'Failed to load git history',
                500,
            );
        }
    }
}
