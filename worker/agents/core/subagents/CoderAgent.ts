/**
 * CoderAgent — Durable Object.
 *
 * Workhorse of the pipeline. N of these run in parallel, each owning a
 * non-overlapping slice of the file-tree (partitioned at plan-time by the
 * Planner). CoderAgent:
 *   1. Fetches current file-tree from TeamLead via `ctx.fileTreeReadUrl`
 *   2. Generates / modifies its owned files via executeInference
 *   3. Proposes patches back to TeamLead (single-writer commits them to git)
 *
 * Safety: never commits directly to the DO file-tree. TeamLead owns git.
 */

import { DurableObject } from 'cloudflare:workers';
import type {
    CoderRpc,
    CoderInput,
    CoderOutput,
    AgentRunResult,
    AgentStatusSnapshot,
    FilePatch,
} from './contracts';
import { pickModel } from '../../inferutils/modelRouter';
import { createObjectLogger, type StructuredLogger } from '../../../logger';

interface CoderState {
    status: AgentStatusSnapshot['status'];
    currentActivity?: string;
    startedAt?: number;
    tokensSpent: number;
    abortRequested: boolean;
}

export class CoderAgent extends DurableObject<Cloudflare.Env> implements CoderRpc {
    private coderState: CoderState = {
        status: 'idle',
        tokensSpent: 0,
        abortRequested: false,
    };
    private readonly logger: StructuredLogger;

    constructor(state: DurableObjectState, env: Cloudflare.Env) {
        super(state, env);
        this.logger = createObjectLogger(this, 'CoderAgent');
    }

    async run(input: CoderInput): Promise<AgentRunResult<CoderOutput>> {
        const start = Date.now();
        this.coderState = {
            status: 'running',
            currentActivity: `writing ${input.task.ownedFiles.join(', ')}`,
            startedAt: start,
            tokensSpent: 0,
            abortRequested: false,
        };

        const model = pickModel('coder', input.ctx.tier, 'implement-file');
        this.logger.info('CoderAgent.run started', {
            taskId: input.task.id,
            files: input.task.ownedFiles,
            model: model.name,
            tier: input.ctx.tier,
        });

        try {
            // Fetch current file-tree snapshot from TeamLead (read-only).
            const snapshot = await this.fetchFileSnapshot(input.ctx.fileTreeReadUrl);
            if (this.coderState.abortRequested) return this.aborted(start);

            // Generate patches for owned files.
            const patches = await this.generatePatches(input, snapshot, model);
            if (this.coderState.abortRequested) return this.aborted(start);

            this.coderState = { ...this.coderState, status: 'done' };
            return {
                ok: true,
                status: 'done',
                output: {
                    patches,
                    generatedFiles: patches.map((p) => ({
                        filePath: p.path,
                        fileContents: p.contents,
                        filePurpose: input.task.title,
                    })),
                },
                tokensSpent: this.coderState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        } catch (err) {
            this.coderState = { ...this.coderState, status: 'failed' };
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error('CoderAgent.run failed', { taskId: input.task.id, error: error.message });
            return {
                ok: false,
                status: 'failed',
                error: { code: 'coder-run-failed', message: error.message },
                tokensSpent: this.coderState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        }
    }

    async abort(): Promise<void> {
        this.coderState = { ...this.coderState, abortRequested: true };
    }

    async getStatus(): Promise<AgentStatusSnapshot> {
        return {
            role: 'coder',
            status: this.coderState.status,
            currentActivity: this.coderState.currentActivity,
            modelTier: 'regular',
            tokensSpent: this.coderState.tokensSpent,
            startedAt: this.coderState.startedAt,
        };
    }

    // ── private ──────────────────────────────────────────────────────────

    private async fetchFileSnapshot(url: string): Promise<Record<string, string>> {
        this.coderState = { ...this.coderState, currentActivity: 'fetching file tree' };
        const res = await fetch(url, { cf: { cacheTtl: 0 } });
        if (!res.ok) throw new Error(`fileTreeReadUrl ${url} → ${res.status}`);
        return (await res.json()) as Record<string, string>;
    }

    /**
     * Real implementation delegates to `executeInference` from
     * `worker/agents/inferutils/core.ts` with the file-generation prompt
     * + SCOF streaming. Kept as a typed seam so the parallel-agent backbone
     * compiles and ships, while the prompt wiring lands in the next commit.
     *
     * Wiring checklist (tracked in docs/redesign/WEDGES.md Sprint 1):
     *   - import `executeInference` + SCOF parser
     *   - build `PhaseImplementationInputs` from `input.task`
     *   - stream tokens → update `this.coderState.currentActivity` per file
     *   - accumulate `this.coderState.tokensSpent` from usage events
     *   - map streamed `FileOutputType` → `FilePatch` w/ `diff` via git-in-sqlite
     */
    private async generatePatches(
        input: CoderInput,
        snapshot: Record<string, string>,
        model: ReturnType<typeof pickModel>,
    ): Promise<readonly FilePatch[]> {
        this.coderState = { ...this.coderState, currentActivity: `generating with ${model.name}` };

        // Minimum viable path: emit empty-content stubs for each owned file so the
        // DO chain validates end-to-end. Prompt wiring replaces this body.
        const patches: FilePatch[] = input.task.ownedFiles.map((path): FilePatch => {
            const isCreate = snapshot[path] === undefined;
            return {
                path,
                contents: '// generated by CoderAgent — pending prompt wiring\n',
                action: isCreate ? 'create' : 'update',
                diff: '',
            };
        });
        return patches;
    }

    private aborted(start: number): AgentRunResult<CoderOutput> {
        this.coderState = { ...this.coderState, status: 'failed' };
        return {
            ok: false,
            status: 'failed',
            error: { code: 'aborted', message: 'CoderAgent aborted by TeamLead' },
            tokensSpent: this.coderState.tokensSpent,
            elapsedMs: Date.now() - start,
        };
    }
}
