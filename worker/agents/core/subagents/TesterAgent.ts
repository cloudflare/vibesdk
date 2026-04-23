/**
 * TesterAgent — Durable Object.
 *
 * Runs the generated app in the sandbox, captures runtime errors + static
 * issues, and returns a structured report. Model tier: Flash-Lite — pure
 * log → diagnosis mapping, no creativity needed.
 *
 * Crucially, Tester runs *overlapped* with Coder work: as soon as a task
 * is committed by TeamLead, Tester starts diagnosing that slice while
 * other Coders keep writing.
 */

import { DurableObject } from 'cloudflare:workers';
import type {
    TesterRpc,
    TesterInput,
    TesterOutput,
    AgentRunResult,
    AgentStatusSnapshot,
    RuntimeErrorReport,
    StaticIssueReport,
} from './contracts';
import { pickModel } from '../../inferutils/modelRouter';
import { createObjectLogger, type StructuredLogger } from '../../../logger';

interface TesterState {
    status: AgentStatusSnapshot['status'];
    currentActivity?: string;
    startedAt?: number;
    tokensSpent: number;
    abortRequested: boolean;
}

export class TesterAgent extends DurableObject<Cloudflare.Env> implements TesterRpc {
    private testerState: TesterState = {
        status: 'idle',
        tokensSpent: 0,
        abortRequested: false,
    };
    private readonly logger: StructuredLogger;

    constructor(state: DurableObjectState, env: Cloudflare.Env) {
        super(state, env);
        this.logger = createObjectLogger(this, 'TesterAgent');
    }

    async run(input: TesterInput): Promise<AgentRunResult<TesterOutput>> {
        const start = Date.now();
        this.testerState = {
            status: 'running',
            currentActivity: `running sandbox ${input.sandboxInstanceId}`,
            startedAt: start,
            tokensSpent: 0,
            abortRequested: false,
        };

        const model = pickModel('tester', input.ctx.tier, 'diagnose');
        this.logger.info('TesterAgent.run started', {
            sandboxId: input.sandboxInstanceId,
            changedFiles: input.changedFiles.length,
            model: model.name,
        });

        try {
            // Stage 1: fetch runtime errors + logs from the existing sandbox service.
            const runtimeErrors = await this.collectRuntimeErrors(input);
            if (this.testerState.abortRequested) return this.aborted(start);

            // Stage 2: LLM classifies/enriches static issues (scoped to changedFiles).
            const staticIssues = await this.diagnoseStaticIssues(input, model);
            if (this.testerState.abortRequested) return this.aborted(start);

            const logs = await this.fetchLogs(input);

            const passed = runtimeErrors.length === 0 &&
                staticIssues.every((i) => i.severity !== 'error');

            this.testerState = { ...this.testerState, status: 'done' };
            return {
                ok: true,
                status: 'done',
                output: { passed, runtimeErrors, staticIssues, logs },
                tokensSpent: this.testerState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        } catch (err) {
            this.testerState = { ...this.testerState, status: 'failed' };
            const error = err instanceof Error ? err : new Error(String(err));
            return {
                ok: false,
                status: 'failed',
                error: { code: 'tester-run-failed', message: error.message },
                tokensSpent: this.testerState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        }
    }

    async abort(): Promise<void> {
        this.testerState = { ...this.testerState, abortRequested: true };
    }

    async getStatus(): Promise<AgentStatusSnapshot> {
        return {
            role: 'tester',
            status: this.testerState.status,
            currentActivity: this.testerState.currentActivity,
            modelTier: 'lite',
            tokensSpent: this.testerState.tokensSpent,
            startedAt: this.testerState.startedAt,
        };
    }

    // Stubs — wire to existing sandbox service in `worker/services/sandbox/`.
    private async collectRuntimeErrors(_input: TesterInput): Promise<readonly RuntimeErrorReport[]> {
        this.testerState = { ...this.testerState, currentActivity: 'collecting runtime errors' };
        return [];
    }

    private async diagnoseStaticIssues(
        _input: TesterInput,
        model: ReturnType<typeof pickModel>,
    ): Promise<readonly StaticIssueReport[]> {
        this.testerState = {
            ...this.testerState,
            currentActivity: `diagnosing with ${model.name}`,
        };
        return [];
    }

    private async fetchLogs(_input: TesterInput): Promise<string> {
        this.testerState = { ...this.testerState, currentActivity: 'fetching logs' };
        return '';
    }

    private aborted(start: number): AgentRunResult<TesterOutput> {
        this.testerState = { ...this.testerState, status: 'failed' };
        return {
            ok: false,
            status: 'failed',
            error: { code: 'aborted', message: 'TesterAgent aborted by TeamLead' },
            tokensSpent: this.testerState.tokensSpent,
            elapsedMs: Date.now() - start,
        };
    }
}
