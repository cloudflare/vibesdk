/**
 * SessionMonitorService — read-only data access for the session monitor endpoint.
 *
 * Pulls progress, cost, and activity signals for a single multi-agent session.
 * Mirrors the BillingService shape (thin wrapper around Drizzle).
 *
 * Scope:
 *   - getPlanProgress       → counts of plan_nodes by status
 *   - getAgentBudget        → tokens consumed by tier
 *   - getCurrentActivity    → title of the currently-running plan_node, if any
 *   - getAgentCounts        → alias for getPlanProgress (kept separate per spec)
 *   - getOwnerUserId        → ownership check (agent_budgets is the canonical owner)
 *
 * Methods stay narrow on purpose — only what monitorController needs.
 */

import { and, desc, eq } from 'drizzle-orm';
import { BaseService } from './BaseService';
import * as schema from '../schema';
import type { AgentBudget } from '../schema';

export interface PlanStatusCounts {
    pending: number;
    running: number;
    done: number;
    failed: number;
    skipped: number;
    total: number;
}

export class SessionMonitorService extends BaseService {
    /**
     * Owner of the session as recorded in agent_budgets. Returns null when no
     * multi-agent run has been registered for this sessionId yet.
     */
    async getOwnerUserId(sessionId: string): Promise<string | null> {
        const row = await this.database
            .select({ userId: schema.agentBudgets.userId })
            .from(schema.agentBudgets)
            .where(eq(schema.agentBudgets.sessionId, sessionId))
            .get();
        return row?.userId ?? null;
    }

    /**
     * Returns counts of plan_nodes grouped by status for a session.
     * Safe when no rows exist — all counts default to 0.
     */
    async getPlanProgress(sessionId: string): Promise<PlanStatusCounts> {
        const rows = await this.database
            .select({ status: schema.planNodes.status })
            .from(schema.planNodes)
            .where(eq(schema.planNodes.sessionId, sessionId))
            .all();

        const counts: PlanStatusCounts = {
            pending: 0,
            running: 0,
            done: 0,
            failed: 0,
            skipped: 0,
            total: rows.length,
        };
        for (const row of rows) {
            if (row.status === 'pending') counts.pending += 1;
            else if (row.status === 'running') counts.running += 1;
            else if (row.status === 'done') counts.done += 1;
            else if (row.status === 'failed') counts.failed += 1;
            else if (row.status === 'skipped') counts.skipped += 1;
        }
        return counts;
    }

    /**
     * Returns the agent_budgets row for a session, or null if no row exists.
     */
    async getAgentBudget(sessionId: string): Promise<AgentBudget | null> {
        const row = await this.database
            .select()
            .from(schema.agentBudgets)
            .where(eq(schema.agentBudgets.sessionId, sessionId))
            .get();
        return row ?? null;
    }

    /**
     * Title + start timestamp of the most recently started running plan_node,
     * or null when nothing is in flight.
     */
    async getCurrentActivity(sessionId: string): Promise<{ title: string; startedAt: number | null } | null> {
        const row = await this.database
            .select({
                title: schema.planNodes.title,
                startedAt: schema.planNodes.startedAt,
            })
            .from(schema.planNodes)
            .where(
                and(
                    eq(schema.planNodes.sessionId, sessionId),
                    eq(schema.planNodes.status, 'running'),
                ),
            )
            .orderBy(desc(schema.planNodes.startedAt))
            .get();
        if (!row) return null;
        return { title: row.title, startedAt: row.startedAt ?? null };
    }

    /**
     * Agent counts by status — same source as plan progress but kept as a
     * distinct method per controller contract.
     */
    async getAgentCounts(sessionId: string): Promise<{ running: number; done: number; failed: number }> {
        const counts = await this.getPlanProgress(sessionId);
        return {
            running: counts.running,
            done: counts.done,
            failed: counts.failed,
        };
    }

    /**
     * Earliest createdAt across plan_nodes — used as session start.
     */
    async getStartedAt(sessionId: string): Promise<number | null> {
        const row = await this.database
            .select({ createdAt: schema.planNodes.createdAt })
            .from(schema.planNodes)
            .where(eq(schema.planNodes.sessionId, sessionId))
            .orderBy(schema.planNodes.createdAt)
            .get();
        const t = row?.createdAt;
        if (!t) return null;
        return t instanceof Date ? t.getTime() : Number(t);
    }

    /**
     * Most recent updatedAt across plan_nodes — used as last event marker.
     */
    async getLastEventAt(sessionId: string): Promise<number | null> {
        const row = await this.database
            .select({ updatedAt: schema.planNodes.updatedAt })
            .from(schema.planNodes)
            .where(eq(schema.planNodes.sessionId, sessionId))
            .orderBy(desc(schema.planNodes.updatedAt))
            .get();
        const t = row?.updatedAt;
        if (!t) return null;
        return t instanceof Date ? t.getTime() : Number(t);
    }
}
