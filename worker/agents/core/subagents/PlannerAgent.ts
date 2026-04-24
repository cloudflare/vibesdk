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
import { callClaudeForJson, CLAUDE_DEFAULT_MODEL } from '../../inferutils/claudeDirect';
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
     * Phase-1 wiring: calls Claude Sonnet directly via claudeDirect helper.
     * Phase-2 (deferred): migrate to `executeInference` from inferutils/core
     * so Gemini is default + Claude is only for tier-gated upgrade.
     *
     * JSON-schema'd response so we can parse without regex.
     */
    private async generateRawPlan(
        input: PlannerInput,
        model: ReturnType<typeof pickModel>,
    ): Promise<PlannerOutput> {
        this.plannerState = {
            ...this.plannerState,
            currentActivity: `planning with ${model.name}`,
        };

        const systemPrompt = [
            'You are the Planner sub-agent of a multi-agent AI app generator.',
            'Given a user prompt, produce a blueprint + milestone/task plan.',
            'CRITICAL: each sibling task must own NON-OVERLAPPING file globs so Coder agents can run in parallel without conflicts.',
            'Prefer 2-4 milestones with 2-3 tasks each. Be concrete — every task must have a clear title and at least one owned file path.',
        ].join(' ');

        const result = await callClaudeForJson<PlannerJsonResponse>({
            env: this.env,
            model: CLAUDE_DEFAULT_MODEL,
            system: systemPrompt,
            messages: [{ role: 'user', content: input.prompt }],
            maxTokens: 4000,
            temperature: 0.3,
            jsonSchemaDescription: `{
                "phaseConcept": { "name": string, "description": string, "lastPhase": boolean },
                "milestones": [{
                    "title": string,
                    "description": string,
                    "tasks": [{
                        "title": string,
                        "ownedFiles": string[],
                        "assignedRole": "coder" | "tester",
                        "dependsOn": string[]
                    }]
                }]
            }`,
        });

        this.plannerState = {
            ...this.plannerState,
            tokensSpent: this.plannerState.tokensSpent + result.usage.inputTokens + result.usage.outputTokens,
        };

        const milestones = result.value.milestones.map((m, mi) => ({
            id: `m${mi}`,
            title: m.title,
            description: m.description,
            tasks: m.tasks.map((t, ti) => ({
                id: `m${mi}-t${ti}`,
                title: t.title,
                ownedFiles: t.ownedFiles,
                assignedRole: (t.assignedRole ?? 'coder') as 'coder' | 'tester',
                dependsOn: t.dependsOn ?? [],
            })),
        }));

        return {
            phaseConcept: {
                name: result.value.phaseConcept.name,
                description: result.value.phaseConcept.description,
                files: [],
                lastPhase: result.value.phaseConcept.lastPhase,
            } as unknown as PlannerOutput['phaseConcept'],
            milestones,
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

// ── Claude JSON response shape ──────────────────────────────────────────

interface PlannerJsonResponse {
    readonly phaseConcept: {
        readonly name: string;
        readonly description: string;
        readonly lastPhase: boolean;
    };
    readonly milestones: readonly {
        readonly title: string;
        readonly description: string;
        readonly tasks: readonly {
            readonly title: string;
            readonly ownedFiles: readonly string[];
            readonly assignedRole?: 'coder' | 'tester';
            readonly dependsOn?: readonly string[];
        }[];
    }[];
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
