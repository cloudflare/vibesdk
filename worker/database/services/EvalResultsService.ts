/**
 * EvalResultsService — persistence layer for EvalGate phase-quality verdicts.
 *
 * Writes and reads rows from the `eval_results` table (see ADR-004 §Implementation step 3).
 * All writes are best-effort: errors are logged but never propagated so that a DB
 * outage cannot block phase completion.
 */

import { desc, eq } from 'drizzle-orm';
import { BaseService } from './BaseService';
import { apps, evalResults } from '../schema';
import type { EvalResultRow } from '../schema';
import { generateId } from '../../utils/idGenerator';

export interface WriteEvalResultParams {
    sessionId: string;
    phaseName: string;
    attempt?: number;
    faithfulness: number;
    answerRelevancy: number;
    toolCorrectness: number;
    hallucinationRisk: number;
    passed: boolean;
    blockedReason: string | null;
    comments: string;
    judgeInputTokens: number;
    judgeOutputTokens: number;
}

export class EvalResultsService extends BaseService {
    /**
     * Insert one verdict row. Best-effort — catches and logs all errors, never throws.
     */
    async writeEvalResult(params: WriteEvalResultParams): Promise<void> {
        try {
            await this.database
                .insert(evalResults)
                .values({
                    id: generateId(),
                    sessionId: params.sessionId,
                    phaseName: params.phaseName,
                    attempt: params.attempt ?? 1,
                    faithfulness: params.faithfulness,
                    answerRelevancy: params.answerRelevancy,
                    toolCorrectness: params.toolCorrectness,
                    hallucinationRisk: params.hallucinationRisk,
                    passed: params.passed ? 1 : 0,
                    blockedReason: params.blockedReason ?? null,
                    comments: params.comments,
                    judgeInputTokens: params.judgeInputTokens,
                    judgeOutputTokens: params.judgeOutputTokens,
                })
                .run();
        } catch (err) {
            this.logger.error('EvalResultsService.writeEvalResult failed (best-effort, ignored)', {
                sessionId: params.sessionId,
                phaseName: params.phaseName,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Return the last `limit` verdicts for a session, newest first.
     * Returns an empty array on error so callers never receive undefined.
     */
    async getEvalResults(sessionId: string, limit: number = 20): Promise<EvalResultRow[]> {
        try {
            return await this.database
                .select()
                .from(evalResults)
                .where(eq(evalResults.sessionId, sessionId))
                .orderBy(desc(evalResults.createdAt))
                .limit(limit)
                .all();
        } catch (err) {
            this.logger.error('EvalResultsService.getEvalResults failed', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }

    /**
     * Resolves the owner userId for a session via the apps table.
     * Returns null when the session does not exist or has no registered owner.
     */
    async getSessionOwnerUserId(sessionId: string): Promise<string | null> {
        const row = await this.database
            .select({ userId: apps.userId })
            .from(apps)
            .where(eq(apps.id, sessionId))
            .get();
        return row?.userId ?? null;
    }
}
