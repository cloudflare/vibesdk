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
 *
 * Implementation notes (S10):
 * - Stage 1 (collectRuntimeErrors): calls sandbox getInstanceErrors() — no LLM.
 * - Stage 2 (diagnoseStaticIssues): calls runStaticAnalysisCode(), filters to
 *   changedFiles, maps CodeIssue → StaticIssueReport. LLM enrichment deferred
 *   to S11 (requires fileContents in TesterInput to be useful).
 * - Stage 3 (fetchLogs): calls getLogs() recent-only.
 *
 * Security: getInstanceErrors() does NOT clear errors (clear=false) — clearing
 * is the caller's responsibility to avoid race conditions with TeamLead logging.
 */

import { DurableObject } from 'cloudflare:workers';
import type {
    TesterRpc,
    TesterInput,
    TesterOutput,
    AgentRunResult,
    AgentStatusSnapshot,
} from './contracts';
import { pickModel } from '../../inferutils/modelRouter';
import { createObjectLogger, type StructuredLogger } from '../../../logger';
import { getSandboxService } from '../../../services/sandbox/factory';
import {
    runtimeErrorToReport,
    codeIssueToReport,
    filterIssuesToChangedFiles,
    mergeAnalysisIssues,
} from './tester-utils';

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

    /**
     * Stage 1: Collect runtime errors from the running sandbox process.
     * Does NOT clear errors — avoids racing with TeamLead's monitoring.
     */
    private async collectRuntimeErrors(input: TesterInput): Promise<readonly RuntimeErrorReport[]> {
        this.testerState = { ...this.testerState, currentActivity: 'collecting runtime errors' };
        try {
            const sandbox = getSandboxService(input.sandboxInstanceId, 'tester');
            const result = await sandbox.getInstanceErrors(input.sandboxInstanceId, false);
            if (!result.success || result.errors.length === 0) return [];
            return result.errors.map(runtimeErrorToReport);
        } catch (err) {
            this.logger.warn('collectRuntimeErrors failed — treating as no errors', {
                sandboxId: input.sandboxInstanceId,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }

    /**
     * Stage 2: Run ESLint + TypeScript type-check in the sandbox, filter
     * results to changedFiles, and return structured StaticIssueReports.
     *
     * LLM enrichment (issue explanation + fix suggestions) is deferred to S11:
     * it requires fileContents to be included in TesterInput so the LLM can
     * reference the source code when explaining issues.
     */
    private async diagnoseStaticIssues(
        input: TesterInput,
        model: ReturnType<typeof pickModel>,
    ): Promise<readonly StaticIssueReport[]> {
        this.testerState = {
            ...this.testerState,
            currentActivity: `static analysis (${model.name} enrichment deferred S11)`,
        };

        if (input.changedFiles.length === 0) return [];

        try {
            const sandbox = getSandboxService(input.sandboxInstanceId, 'tester');
            const analysis = await sandbox.runStaticAnalysisCode(input.sandboxInstanceId);
            if (!analysis.success) {
                this.logger.warn('runStaticAnalysisCode returned failure', {
                    sandboxId: input.sandboxInstanceId,
                    error: analysis.error,
                });
                return [];
            }

            // Combine lint + typecheck, scope to changedFiles, map to report shape.
            const allIssues = mergeAnalysisIssues(
                analysis.lint.issues ?? [],
                analysis.typecheck.issues ?? [],
            );
            const scoped = filterIssuesToChangedFiles(allIssues, input.changedFiles);
            return scoped.map(codeIssueToReport);
        } catch (err) {
            this.logger.warn('diagnoseStaticIssues failed — returning empty', {
                sandboxId: input.sandboxInstanceId,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }

    /**
     * Stage 3: Fetch recent stdout/stderr logs from the sandbox.
     * Uses recent-only mode to avoid returning stale logs from prior runs.
     */
    private async fetchLogs(input: TesterInput): Promise<string> {
        this.testerState = { ...this.testerState, currentActivity: 'fetching logs' };
        try {
            const sandbox = getSandboxService(input.sandboxInstanceId, 'tester');
            const result = await sandbox.getLogs(input.sandboxInstanceId, true);
            if (!result.success) return '';
            const { stdout, stderr } = result.logs;
            return [stdout, stderr].filter(Boolean).join('\n').trim();
        } catch (err) {
            this.logger.warn('fetchLogs failed', {
                sandboxId: input.sandboxInstanceId,
                error: err instanceof Error ? err.message : String(err),
            });
            return '';
        }
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
