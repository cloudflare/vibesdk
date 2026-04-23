/**
 * TeamLead Coordinator — fan-out + merge logic.
 *
 * Not a new DO. Mixed into the existing `CodeGeneratorAgent` so the
 * rollback path (feature flag OFF → original monolith behavior) stays
 * trivial. When the flag is ON, `CodeGeneratorAgent` delegates phase
 * execution to `runParallelPhase(...)` below.
 *
 * The wedge: while emergent executes phase tasks serially, we fan out
 * up to `maxParallelCoders` DOs simultaneously. TeamLead is the single
 * writer that commits patches back to git in dependency-safe order.
 */

import type {
    PlannedMilestone,
    PlannedTask,
    SharedContext,
    FilePatch,
    CoderOutput,
    CriticOutput,
    AgentStatusSnapshot,
} from './contracts';
import type { CoderAgent } from './CoderAgent';
import type { PlannerAgent } from './PlannerAgent';
import type { CriticAgent } from './CriticAgent';
import type { TesterAgent } from './TesterAgent';
import {
    canSpawnParallelAgents,
    canUseCritic,
    type SubscriptionTier,
} from '../../../services/entitlements/entitlements';
import type { StructuredLogger } from '../../../logger';

export interface CoordinatorBindings {
    readonly CoderAgent: DurableObjectNamespace<CoderAgent>;
    readonly PlannerAgent: DurableObjectNamespace<PlannerAgent>;
    readonly CriticAgent: DurableObjectNamespace<CriticAgent>;
    readonly TesterAgent: DurableObjectNamespace<TesterAgent>;
}

export interface RunPhaseArgs {
    readonly sessionId: string;
    readonly tier: SubscriptionTier;
    readonly milestone: PlannedMilestone;
    readonly ctx: SharedContext;
    readonly maxParallelCoders: 1 | 4 | 8;
    readonly enableCritic: boolean;
    readonly bindings: CoordinatorBindings;
    readonly logger: StructuredLogger;
    /** Called for every sub-agent status change so the coordinator can stream to the WS. */
    readonly onStatus?: (snapshot: AgentStatusSnapshot & { readonly agentId: string }) => void;
    /** Called when a Coder proposes patches; coordinator merges + commits via git. */
    readonly onPatches: (agentId: string, patches: readonly FilePatch[]) => Promise<void>;
}

export interface RunPhaseResult {
    readonly ok: boolean;
    readonly completedTaskIds: readonly string[];
    readonly failedTaskIds: readonly string[];
    readonly criticVerdict?: CriticOutput['verdict'];
    readonly totalTokensSpent: number;
    readonly elapsedMs: number;
}

/**
 * Execute one milestone — fan out Coders across its tasks, merge results.
 *
 * Algorithm:
 *   1. Optionally run Critic on the milestone's tasks.
 *      - Pro+ tier only. Free tier skips.
 *      - Verdict `reject` aborts milestone; `revise` re-runs Planner (out of scope here).
 *   2. Build a dependency graph from `task.dependsOn`.
 *   3. Topologically order ready-set → dispatch up to `maxParallelCoders` Coder DOs.
 *   4. As each Coder completes, commit its patches via `onPatches` (single-writer via caller),
 *      then promote unblocked dependents into the ready-set.
 *   5. If any Coder fails, mark dependents as failed; continue with independent tasks.
 */
export async function runParallelPhase(args: RunPhaseArgs): Promise<RunPhaseResult> {
    const start = Date.now();
    const completed = new Set<string>();
    const failed = new Set<string>();
    let totalTokens = 0;

    // ── Entitlement checks ──
    const parallelCheck = canSpawnParallelAgents(args.tier, args.maxParallelCoders);
    const effectiveMaxParallel: 1 | 4 | 8 = parallelCheck.allowed
        ? args.maxParallelCoders
        : 1; // downgrade silently to serial execution

    const criticCheck = args.enableCritic ? canUseCritic(args.tier) : { allowed: false };
    const criticRuns = criticCheck.allowed;

    // ── Stage 1: Critic ──
    let criticVerdict: CriticOutput['verdict'] | undefined;
    if (criticRuns) {
        const criticResult = await runCritic(args);
        totalTokens += criticResult.tokens;
        criticVerdict = criticResult.verdict;
        if (criticVerdict === 'reject') {
            args.logger.warn('Critic rejected milestone', { milestoneId: args.milestone.id });
            return {
                ok: false,
                completedTaskIds: [],
                failedTaskIds: args.milestone.tasks.map((t) => t.id),
                criticVerdict,
                totalTokensSpent: totalTokens,
                elapsedMs: Date.now() - start,
            };
        }
    }

    // ── Stage 2: dependency-ordered parallel Coder dispatch ──
    const pending = new Map<string, PlannedTask>(args.milestone.tasks.map((t) => [t.id, t]));
    const running = new Map<string, Promise<{ taskId: string; output: CoderOutput | null; tokens: number }>>();

    while (pending.size > 0 || running.size > 0) {
        // Promote ready tasks up to the parallel cap.
        while (running.size < effectiveMaxParallel && pending.size > 0) {
            const next = pickReadyTask(pending, completed, failed);
            if (!next) break; // everything else is blocked by in-flight work
            pending.delete(next.id);
            running.set(next.id, dispatchCoder(args, next));
            args.logger.info('Coder dispatched', {
                taskId: next.id,
                inFlight: running.size,
                parallelCap: effectiveMaxParallel,
            });
        }

        if (running.size === 0) break; // deadlock guard — no ready tasks + nothing in flight

        // Wait for the next completion.
        const finished = await Promise.race(running.values());
        running.delete(finished.taskId);
        totalTokens += finished.tokens;

        if (finished.output && finished.output.patches.length > 0) {
            await args.onPatches(finished.taskId, finished.output.patches);
            completed.add(finished.taskId);
        } else {
            failed.add(finished.taskId);
            // Cascade-fail dependents of this task.
            for (const [id, task] of pending) {
                if (task.dependsOn.includes(finished.taskId)) {
                    pending.delete(id);
                    failed.add(id);
                }
            }
        }
    }

    return {
        ok: failed.size === 0,
        completedTaskIds: Array.from(completed),
        failedTaskIds: Array.from(failed),
        criticVerdict,
        totalTokensSpent: totalTokens,
        elapsedMs: Date.now() - start,
    };
}

// ── helpers ──────────────────────────────────────────────────────────────

function pickReadyTask(
    pending: Map<string, PlannedTask>,
    completed: Set<string>,
    failed: Set<string>,
): PlannedTask | undefined {
    for (const task of pending.values()) {
        const unmet = task.dependsOn.some((d) => !completed.has(d) && !failed.has(d));
        if (!unmet) return task;
    }
    return undefined;
}

async function dispatchCoder(
    args: RunPhaseArgs,
    task: PlannedTask,
): Promise<{ taskId: string; output: CoderOutput | null; tokens: number }> {
    const agentId = `${args.sessionId}:${task.id}`;
    const stub = args.bindings.CoderAgent.get(args.bindings.CoderAgent.idFromName(agentId));
    try {
        const result = await stub.run({ task, ctx: { ...args.ctx, ownedFiles: task.ownedFiles } });
        args.onStatus?.({
            agentId,
            role: 'coder',
            status: result.status,
            tokensSpent: result.tokensSpent,
            modelTier: 'regular',
        });
        return {
            taskId: task.id,
            output: result.ok ? result.output ?? null : null,
            tokens: result.tokensSpent,
        };
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        args.logger.error('Coder dispatch threw', { taskId: task.id, error: error.message });
        return { taskId: task.id, output: null, tokens: 0 };
    }
}

async function runCritic(
    args: RunPhaseArgs,
): Promise<{ verdict: CriticOutput['verdict']; tokens: number }> {
    const agentId = `${args.sessionId}:critic:${args.milestone.id}`;
    const stub = args.bindings.CriticAgent.get(args.bindings.CriticAgent.idFromName(agentId));
    const result = await stub.run({
        plan: [args.milestone],
        ctx: args.ctx,
        previousRounds: 0,
    });
    args.onStatus?.({
        agentId,
        role: 'critic',
        status: result.status,
        tokensSpent: result.tokensSpent,
        modelTier: 'premium',
    });
    if (!result.ok || !result.output) {
        return { verdict: 'approve', tokens: result.tokensSpent }; // fail-open to not block pipeline
    }
    return { verdict: result.output.verdict, tokens: result.tokensSpent };
}
