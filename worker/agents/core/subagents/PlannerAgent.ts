/**
 * PlannerAgent — Durable Object.
 *
 * Designs the blueprint + milestone/task tree for the session. Crucially,
 * it also *partitions* the file set across Coder agents so sibling tasks
 * never touch the same file — this is what makes parallel execution safe
 * without a three-way merge layer (see ADR-001 §"File Write Partitioning").
 *
 * Runs once per session (or on "alter-blueprint"); the plan tree persists
 * in D1 `plan_nodes`.
 */

import { DurableObject } from 'cloudflare:workers';
import type {
    PlannerRpc,
    PlannerInput,
    PlannerOutput,
    AgentRunResult,
    AgentStatusSnapshot,
    PlannedMilestone,
    PlannedTask,
} from './contracts';
import { pickModel } from '../../inferutils/modelRouter';
import { createObjectLogger, type StructuredLogger } from '../../../logger';

interface PlannerState {
    status: AgentStatusSnapshot['status'];
    currentActivity?: string;
    startedAt?: number;
    tokensSpent: number;
    abortRequested: boolean;
}

export class PlannerAgent extends DurableObject<Cloudflare.Env> implements PlannerRpc {
    private plannerState: PlannerState = {
        status: 'idle',
        tokensSpent: 0,
        abortRequested: false,
    };
    private readonly logger: StructuredLogger;

    constructor(state: DurableObjectState, env: Cloudflare.Env) {
        super(state, env);
        this.logger = createObjectLogger(this, 'PlannerAgent');
    }

    async run(input: PlannerInput): Promise<AgentRunResult<PlannerOutput>> {
        const start = Date.now();
        this.plannerState = {
            status: 'running',
            currentActivity: 'drafting blueprint',
            startedAt: start,
            tokensSpent: 0,
            abortRequested: false,
        };

        const model = pickModel('planner', input.ctx.tier, 'plan');
        this.logger.info('PlannerAgent.run started', {
            tier: input.ctx.tier,
            model: model.name,
            promptLen: input.prompt.length,
        });

        try {
            // Stage 1: blueprint + raw plan (LLM call — to wire to executeInference)
            const rawPlan = await this.generateRawPlan(input, model);
            if (this.plannerState.abortRequested) return this.aborted(start);

            // Stage 2: validate + partition file-set across tasks (pure, no LLM)
            this.plannerState = { ...this.plannerState, currentActivity: 'partitioning files' };
            const partitioned = partitionFileSet(rawPlan.milestones);

            this.plannerState = { ...this.plannerState, status: 'done' };
            return {
                ok: true,
                status: 'done',
                output: { phaseConcept: rawPlan.phaseConcept, milestones: partitioned },
                tokensSpent: this.plannerState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        } catch (err) {
            this.plannerState = { ...this.plannerState, status: 'failed' };
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error('PlannerAgent.run failed', { error: error.message });
            return {
                ok: false,
                status: 'failed',
                error: { code: 'planner-run-failed', message: error.message },
                tokensSpent: this.plannerState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        }
    }

    async abort(): Promise<void> {
        this.plannerState = { ...this.plannerState, abortRequested: true };
    }

    async getStatus(): Promise<AgentStatusSnapshot> {
        return {
            role: 'planner',
            status: this.plannerState.status,
            currentActivity: this.plannerState.currentActivity,
            modelTier: 'reasoning',
            tokensSpent: this.plannerState.tokensSpent,
            startedAt: this.plannerState.startedAt,
        };
    }

    /**
     * Delegates to existing PhaseGeneration + blueprint operations in
     * `worker/agents/operations/`. Wiring lands in the next commit — this
     * scaffold keeps the DO type-clean and returns a valid empty plan so
     * downstream agents can exercise the pipeline.
     */
    private async generateRawPlan(
        input: PlannerInput,
        model: ReturnType<typeof pickModel>,
    ): Promise<PlannerOutput> {
        this.plannerState = {
            ...this.plannerState,
            currentActivity: `planning with ${model.name}`,
        };
        // Placeholder phase concept — real wiring imports PhaseGeneration op.
        return {
            phaseConcept: {
                name: 'initial-scaffold',
                description: input.prompt.slice(0, 500),
                files: [],
                lastPhase: false,
            } as unknown as PlannerOutput['phaseConcept'],
            milestones: [],
        };
    }

    private aborted(start: number): AgentRunResult<PlannerOutput> {
        this.plannerState = { ...this.plannerState, status: 'failed' };
        return {
            ok: false,
            status: 'failed',
            error: { code: 'aborted', message: 'PlannerAgent aborted by TeamLead' },
            tokensSpent: this.plannerState.tokensSpent,
            elapsedMs: Date.now() - start,
        };
    }
}

// ── File-set partitioner ─────────────────────────────────────────────────

/**
 * Ensures no two sibling tasks claim overlapping file globs.
 * Greedy algorithm:
 *   - collect all globs in sibling set
 *   - for each collision, assign the glob to whichever task has fewer files
 *   - tie-break by task index
 *
 * If collision is unresolvable (e.g., two tasks both need `package.json`),
 * the later task is demoted to `dependsOn` the earlier one — the Coder for
 * task B then runs AFTER Coder A commits, not in parallel.
 */
export function partitionFileSet(
    milestones: readonly PlannedMilestone[],
): readonly PlannedMilestone[] {
    return milestones.map((m) => ({
        ...m,
        tasks: resolveTaskPartition(m.tasks),
    }));
}

function resolveTaskPartition(tasks: readonly PlannedTask[]): readonly PlannedTask[] {
    if (tasks.length <= 1) return tasks;

    const claimed = new Map<string, string>();        // path → taskId
    const updatedTasks: PlannedTask[] = [];
    const extraDeps = new Map<string, Set<string>>(); // taskId → dependsOn additions

    for (const task of tasks) {
        const kept: string[] = [];
        for (const path of task.ownedFiles) {
            const prior = claimed.get(path);
            if (prior === undefined) {
                claimed.set(path, task.id);
                kept.push(path);
            } else if (prior !== task.id) {
                // Collision — serialize: this task depends on the prior owner.
                const deps = extraDeps.get(task.id) ?? new Set<string>();
                deps.add(prior);
                extraDeps.set(task.id, deps);
            }
        }
        updatedTasks.push({ ...task, ownedFiles: kept });
    }

    return updatedTasks.map((t) => {
        const extras = extraDeps.get(t.id);
        if (!extras) return t;
        const merged = new Set([...t.dependsOn, ...extras]);
        return { ...t, dependsOn: Array.from(merged) };
    });
}
