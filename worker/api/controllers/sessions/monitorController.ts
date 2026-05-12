/**
 * SessionMonitorController — read-only session monitoring endpoint.
 *
 * GET /api/sessions/:sessionId/monitor
 *
 * Scaffold for the "app monitoring" surface (parity with Manus / Replit / Cursor 3
 * session-monitor pills). Aggregates plan progress, cost, and current activity
 * for one multi-agent session. All DB access flows through SessionMonitorService.
 *
 * Cost note (intentional approximation):
 *   creditsSpent is derived using a flat 250-tokens/credit floor across all
 *   model tiers. This is a scaffold figure — future cycles should refine using
 *   per-tier pricing from worker/services/entitlements/ once published.
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { SessionMonitorService } from '../../../database/services/SessionMonitorService';
import type { AgentBudget } from '../../../database/schema';

const logger = createLogger('SessionMonitorController');

/**
 * Approximate floor: 250 output tokens ≈ 1 credit. Documented as a stub so
 * downstream work can swap in tier-aware pricing without touching the schema.
 */
const TOKENS_PER_CREDIT_FLOOR = 250;

export type SessionMonitorStatus =
    | 'planning'
    | 'coding'
    | 'testing'
    | 'idle'
    | 'failed'
    | 'done';

export interface SessionMonitor {
    sessionId: string;
    startedAt: number;
    elapsedMs: number;
    status: SessionMonitorStatus;
    currentActivity: string | null;
    progress: { completed: number; total: number };
    cost: { creditsSpent: number; tokensSpent: number };
    agents: { running: number; done: number; failed: number };
    lastEventAt: number | null;
    links: { sessionUrl: string; previewUrl: string | null };
}

export class SessionMonitorController extends BaseController {
    static logger = logger;

    static async getMonitor(
        _req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<SessionMonitor>>> {
        try {
            const user = context.user!;
            const sessionId = context.pathParams.sessionId;
            if (!sessionId) {
                return SessionMonitorController.createErrorResponse<SessionMonitor>(
                    'Session ID is required',
                    400,
                );
            }

            const svc = new SessionMonitorService(env);

            // Ownership check: agent_budgets carries the userId of the multi-agent run.
            // A session with no plan_nodes AND no agent_budgets row is treated as
            // "not found" (matches the spec for 404 on unknown sessionId).
            const ownerUserId = await svc.getOwnerUserId(sessionId);
            const progress = await svc.getPlanProgress(sessionId);

            if (!ownerUserId && progress.total === 0) {
                return SessionMonitorController.createErrorResponse<SessionMonitor>(
                    'Session not found',
                    404,
                );
            }
            if (ownerUserId && ownerUserId !== user.id) {
                return SessionMonitorController.createErrorResponse<SessionMonitor>(
                    'Session not found',
                    404,
                );
            }

            const [budget, current, startedAt, lastEventAt] = await Promise.all([
                svc.getAgentBudget(sessionId),
                svc.getCurrentActivity(sessionId),
                svc.getStartedAt(sessionId),
                svc.getLastEventAt(sessionId),
            ]);

            const tokensSpent = sumBudgetTokens(budget);
            const creditsSpent = Math.ceil(tokensSpent / TOKENS_PER_CREDIT_FLOOR);

            const completed = progress.done;
            const total = progress.total;
            const status = deriveStatus(progress);
            const start = startedAt ?? current?.startedAt ?? Date.now();
            const elapsedMs = Math.max(0, Date.now() - start);

            const monitor: SessionMonitor = {
                sessionId,
                startedAt: start,
                elapsedMs,
                status,
                currentActivity: current?.title ?? null,
                progress: { completed, total },
                cost: { creditsSpent, tokensSpent },
                agents: {
                    running: progress.running,
                    done: progress.done,
                    failed: progress.failed,
                },
                lastEventAt,
                links: {
                    sessionUrl: `/chat/${sessionId}`,
                    previewUrl: null,
                },
            };

            return SessionMonitorController.createSuccessResponse<SessionMonitor>(monitor);
        } catch (err) {
            logger.error('getMonitor failed', { error: errorMessage(err) });
            return SessionMonitorController.createErrorResponse<SessionMonitor>(
                'Failed to load session monitor',
                500,
            );
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Derive a high-level monitor status from the plan_nodes status histogram.
 * Order of precedence: failed > running > done > pending > empty.
 */
export function deriveStatus(counts: {
    pending: number;
    running: number;
    done: number;
    failed: number;
    skipped: number;
    total: number;
}): SessionMonitorStatus {
    if (counts.total === 0) return 'idle';
    if (counts.failed > 0 && counts.running === 0 && counts.pending === 0) return 'failed';
    if (counts.running > 0) return 'coding';
    if (counts.pending > 0 && counts.done === 0) return 'planning';
    if (counts.pending === 0 && counts.running === 0 && counts.done > 0) return 'done';
    // Mixed: some done, some pending, none running — treat as still-coding pipeline.
    return 'coding';
}

function sumBudgetTokens(budget: AgentBudget | null): number {
    if (!budget) return 0;
    return (
        (budget.opusTokensUsed ?? 0) +
        (budget.sonnetHighTokensUsed ?? 0) +
        (budget.sonnetMedTokensUsed ?? 0) +
        (budget.sonnetLowTokensUsed ?? 0) +
        (budget.haikuTokensUsed ?? 0)
    );
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
