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
import { callClaudeForJson, CLAUDE_DEFAULT_MODEL } from '../../inferutils/claudeDirect';
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
     * Phase-1 wiring: calls Claude Sonnet directly. One call produces content
     * for all owned files in the task. Snapshot of existing file-tree goes
     * into the prompt so Claude knows what's already there.
     *
     * Phase-2 (deferred): migrate to `executeInference` + SCOF streaming.
     * Each file should stream incrementally — currently we wait for the full
     * Claude response before emitting any patch.
     */
    private async generatePatches(
        input: CoderInput,
        snapshot: Record<string, string>,
        model: ReturnType<typeof pickModel>,
    ): Promise<readonly FilePatch[]> {
        this.coderState = { ...this.coderState, currentActivity: `generating with ${model.name}` };

        if (input.task.ownedFiles.length === 0) return [];

        const systemPrompt = [
            'You are a Coder sub-agent writing production code in parallel with other Coders.',
            'Generate ONLY the files listed in ownedFiles. Do not reference or modify other files.',
            'Match the project style (React 19 + TypeScript + TailwindCSS for frontend, Cloudflare Workers + D1 + Drizzle for backend).',
            'Return one entry per owned file with complete file contents — no diffs, no partial snippets.',
        ].join(' ');

        const userPrompt = [
            `Task: ${input.task.title}`,
            `Files you own (generate each completely):`,
            input.task.ownedFiles.map((f) => `  - ${f}${snapshot[f] !== undefined ? ' (exists, modify)' : ' (new)'}`).join('\n'),
            '',
            'Existing file tree (names only, for reference):',
            Object.keys(snapshot).slice(0, 40).map((p) => `  - ${p}`).join('\n'),
            '',
            input.ctx.blueprint ? `Blueprint context: ${JSON.stringify(input.ctx.blueprint).slice(0, 2000)}` : '',
        ].filter(Boolean).join('\n');

        const result = await callClaudeForJson<CoderJsonResponse>({
            env: this.env,
            model: CLAUDE_DEFAULT_MODEL,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 8000,
            temperature: 0.2,
            jsonSchemaDescription: `{
                "files": [{ "path": string, "contents": string, "purpose": string }]
            }`,
        });

        this.coderState = {
            ...this.coderState,
            tokensSpent: this.coderState.tokensSpent + result.usage.inputTokens + result.usage.outputTokens,
        };

        // Filter to only owned-files to prevent scope-creep (and server-side defense
        // against prompt regressions that try to write outside the partition).
        const owned = new Set(input.task.ownedFiles);
        const patches: FilePatch[] = result.value.files
            .filter((f) => owned.has(f.path))
            .map((f): FilePatch => ({
                path: f.path,
                contents: f.contents,
                action: snapshot[f.path] === undefined ? 'create' : 'update',
                diff: '',    // computed by TeamLead via git-in-sqlite during commit
            }));

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

interface CoderJsonResponse {
    readonly files: readonly {
        readonly path: string;
        readonly contents: string;
        readonly purpose?: string;
    }[];
}
