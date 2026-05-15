/**
 * SnapshotController — read-only session snapshot endpoint.
 *
 * GET /api/sessions/:sessionId/snapshot
 *
 * Returns the last-known-good project state written when generation
 * completed (REVIEWING→IDLE). Consumed by the DegradedModeBanner
 * component to show project context during Cloudflare platform incidents.
 * Owner-checked: only the session's owner may read the snapshot.
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { SnapshotService } from '../../../database/services/SnapshotService';

const logger = createLogger('SnapshotController');

export interface SessionSnapshotData {
    sessionId: string;
    projectName: string;
    filesCount: number;
    templateName: string;
    snapshotJson: Record<string, unknown>;
    completedAt: number | null;
}

export class SnapshotController extends BaseController {
    static logger = logger;

    static async getSnapshot(
        _req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<SessionSnapshotData>>> {
        try {
            const user = context.user!;
            const sessionId = context.pathParams.sessionId;
            if (!sessionId) {
                return SnapshotController.createErrorResponse<SessionSnapshotData>(
                    'Session ID is required',
                    400,
                );
            }

            const svc = new SnapshotService(env);

            const ownerUserId = await svc.getSessionOwnerUserId(sessionId);
            if (!ownerUserId) {
                return SnapshotController.createErrorResponse<SessionSnapshotData>(
                    'Session not found',
                    404,
                );
            }
            if (ownerUserId !== user.id) {
                return SnapshotController.createErrorResponse<SessionSnapshotData>(
                    'Session not found',
                    404,
                );
            }

            const row = await svc.getSnapshot(sessionId);
            if (!row) {
                return SnapshotController.createErrorResponse<SessionSnapshotData>(
                    'Snapshot not found',
                    404,
                );
            }

            const snapshotJson =
                row.snapshotJson !== null &&
                typeof row.snapshotJson === 'object' &&
                !Array.isArray(row.snapshotJson)
                    ? (row.snapshotJson as Record<string, unknown>)
                    : {};

            const completedAt =
                typeof snapshotJson.completedAt === 'number' ? snapshotJson.completedAt : null;

            const data: SessionSnapshotData = {
                sessionId: row.sessionId,
                projectName: row.projectName,
                filesCount: row.filesCount,
                templateName: row.templateName,
                snapshotJson,
                completedAt,
            };

            return SnapshotController.createSuccessResponse<SessionSnapshotData>(data);
        } catch (err) {
            logger.error('getSnapshot failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return SnapshotController.createErrorResponse<SessionSnapshotData>(
                'Failed to load session snapshot',
                500,
            );
        }
    }
}
