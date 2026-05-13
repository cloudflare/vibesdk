/**
 * SessionQualityController — read-only eval results endpoint.
 *
 * GET /api/sessions/:sessionId/quality
 *
 * Returns all eval_results rows recorded by EvalGate for a session.
 * Ownership is verified via the apps table (userId must match the
 * authenticated caller). No caching — eval results are written in
 * real-time during generation and callers want fresh data.
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { EvalResultsService } from '../../../database/services/EvalResultsService';
import type { EvalResultRow } from '../../../database/schema';

const logger = createLogger('SessionQualityController');

export interface SessionQualityResult {
    id: string;
    sessionId: string;
    phaseName: string;
    attempt: number;
    faithfulness: number;
    answerRelevancy: number;
    toolCorrectness: number;
    hallucinationRisk: number;
    passed: boolean;
    blockedReason: string | null;
    comments: string;
    createdAt: number | null;
}

export interface SessionQualityResponse {
    sessionId: string;
    results: SessionQualityResult[];
    hasResults: boolean;
}

export class SessionQualityController extends BaseController {
    static logger = logger;

    static async getSessionQuality(
        _req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<SessionQualityResponse>>> {
        try {
            const user = context.user!;
            const sessionId = context.pathParams.sessionId;

            if (!sessionId) {
                return SessionQualityController.createErrorResponse<SessionQualityResponse>(
                    'Session ID is required',
                    400,
                );
            }

            const svc = new EvalResultsService(env);

            const ownerUserId = await svc.getSessionOwnerUserId(sessionId);

            if (ownerUserId === null) {
                return SessionQualityController.createErrorResponse<SessionQualityResponse>(
                    'Session not found',
                    404,
                );
            }

            if (ownerUserId !== user.id) {
                return SessionQualityController.createErrorResponse<SessionQualityResponse>(
                    'Forbidden',
                    403,
                );
            }

            const rows = await svc.getEvalResults(sessionId);
            const results: SessionQualityResult[] = rows.map(mapRow);

            const payload: SessionQualityResponse = {
                sessionId,
                results,
                hasResults: results.length > 0,
            };

            return SessionQualityController.createSuccessResponse<SessionQualityResponse>(payload);
        } catch (err) {
            logger.error('getSessionQuality failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return SessionQualityController.createErrorResponse<SessionQualityResponse>(
                'Failed to load session quality results',
                500,
            );
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function mapRow(row: EvalResultRow): SessionQualityResult {
    const createdAt = row.createdAt instanceof Date
        ? row.createdAt.getTime()
        : row.createdAt !== null && row.createdAt !== undefined
            ? Number(row.createdAt)
            : null;

    return {
        id: row.id,
        sessionId: row.sessionId,
        phaseName: row.phaseName,
        attempt: row.attempt,
        faithfulness: row.faithfulness,
        answerRelevancy: row.answerRelevancy,
        toolCorrectness: row.toolCorrectness,
        hallucinationRisk: row.hallucinationRisk,
        passed: row.passed === 1,
        blockedReason: row.blockedReason ?? null,
        comments: row.comments,
        createdAt,
    };
}
