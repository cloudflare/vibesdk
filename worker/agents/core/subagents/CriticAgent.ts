/**
 * CriticAgent — Durable Object.
 *
 * Red-teams a draft plan BEFORE Coders start writing. Hard-capped at
 * 2 rounds per plan (see CRITIQUE.md C3); if still unresolved, the
 * coordinator forces execution with a `contested` flag visible in the UI.
 *
 * Model tier: premium (Gemini 3 Pro or equivalent). This is the one place
 * we spend reasoning budget — because catching a bad plan at design time
 * saves orders of magnitude in downstream Coder cost.
 *
 * Entitlement-gated: Pro / Team / Enterprise only. Free tier skips Critic
 * entirely (see entitlements.canUseCritic).
 */

import { DurableObject } from 'cloudflare:workers';
import type {
    CriticRpc,
    CriticInput,
    CriticOutput,
    AgentRunResult,
    AgentStatusSnapshot,
    CriticConcern,
} from './contracts';
import { pickModel } from '../../inferutils/modelRouter';
import { callClaudeForJson, CLAUDE_PREMIUM_MODEL } from '../../inferutils/claudeDirect';
import { createObjectLogger, type StructuredLogger } from '../../../logger';

const MAX_ROUNDS = 2;

interface CriticState {
    status: AgentStatusSnapshot['status'];
    currentActivity?: string;
    startedAt?: number;
    tokensSpent: number;
    abortRequested: boolean;
}

export class CriticAgent extends DurableObject<Cloudflare.Env> implements CriticRpc {
    private criticState: CriticState = {
        status: 'idle',
        tokensSpent: 0,
        abortRequested: false,
    };
    private readonly logger: StructuredLogger;

    constructor(state: DurableObjectState, env: Cloudflare.Env) {
        super(state, env);
        this.logger = createObjectLogger(this, 'CriticAgent');
    }

    async run(input: CriticInput): Promise<AgentRunResult<CriticOutput>> {
        const start = Date.now();

        // Round-cap enforcement — force-approve if caller violates the contract.
        if (input.previousRounds >= MAX_ROUNDS) {
            this.logger.warn('CriticAgent round cap hit — force approve', {
                previousRounds: input.previousRounds,
            });
            return {
                ok: true,
                status: 'done',
                output: {
                    verdict: 'approve',
                    concerns: [],
                    suggestedRevisions: [
                        `Forced approval after ${MAX_ROUNDS} rounds; plan marked contested in UI.`,
                    ],
                },
                tokensSpent: 0,
                elapsedMs: Date.now() - start,
            };
        }

        this.criticState = {
            status: 'running',
            currentActivity: `round ${input.previousRounds + 1} of ${MAX_ROUNDS}`,
            startedAt: start,
            tokensSpent: 0,
            abortRequested: false,
        };

        const model = pickModel('critic', input.ctx.tier, 'critique');
        this.logger.info('CriticAgent.run started', {
            round: input.previousRounds + 1,
            planSize: input.plan.length,
            model: model.name,
            tier: input.ctx.tier,
        });

        try {
            const { verdict, concerns, suggestedRevisions } = await this.critique(input, model);
            if (this.criticState.abortRequested) return this.aborted(start);

            this.criticState = { ...this.criticState, status: 'done' };
            return {
                ok: true,
                status: 'done',
                output: { verdict, concerns, suggestedRevisions },
                tokensSpent: this.criticState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        } catch (err) {
            this.criticState = { ...this.criticState, status: 'failed' };
            const error = err instanceof Error ? err : new Error(String(err));
            return {
                ok: false,
                status: 'failed',
                error: { code: 'critic-run-failed', message: error.message },
                tokensSpent: this.criticState.tokensSpent,
                elapsedMs: Date.now() - start,
            };
        }
    }

    async abort(): Promise<void> {
        this.criticState = { ...this.criticState, abortRequested: true };
    }

    async getStatus(): Promise<AgentStatusSnapshot> {
        return {
            role: 'critic',
            status: this.criticState.status,
            currentActivity: this.criticState.currentActivity,
            modelTier: 'premium',
            tokensSpent: this.criticState.tokensSpent,
            startedAt: this.criticState.startedAt,
        };
    }

    /**
     * Phase-1 wiring: Claude Sonnet direct. Returns structured verdict +
     * concerns. Cheap deterministic guard runs first to avoid wasting tokens
     * on empty plans.
     */
    private async critique(
        input: CriticInput,
        model: ReturnType<typeof pickModel>,
    ): Promise<CriticOutput> {
        this.criticState = {
            ...this.criticState,
            currentActivity: `critiquing with ${model.name}`,
        };

        const taskCount = input.plan.reduce((sum, m) => sum + m.tasks.length, 0);
        if (taskCount === 0) {
            return {
                verdict: 'reject',
                concerns: [{
                    severity: 'blocker',
                    title: 'Empty plan',
                    rationale: 'Planner produced zero tasks; cannot execute.',
                }],
                suggestedRevisions: ['Planner must produce at least one milestone with one task.'],
            };
        }

        const systemPrompt = [
            'You are the Critic sub-agent. Red-team the proposed plan BEFORE Coders execute it.',
            'Focus on: file-partitioning (siblings must not claim same file), missing deps, unrealistic scope, security/auth gaps.',
            'Be DIRECT. Verdict "approve" is the correct response for clean plans — do NOT invent issues to appear thorough.',
        ].join(' ');

        const userPrompt = `Round ${input.previousRounds + 1} of 2.\n\nPlan:\n${JSON.stringify(input.plan, null, 2).slice(0, 6000)}`;

        // Fast Mode (Opus 4.7 beta, 2.5× OTPS, 6× pricing) — active only when
        // ANTHROPIC_FAST_MODE_ACCESS="true" (set via `wrangler secret put` after waitlist approval).
        // Critic is the ideal first target: plan critique is latency-sensitive and
        // benefits most from faster token generation.
        const speedMode = this.env.ANTHROPIC_FAST_MODE_ACCESS === 'true' ? 'fast' as const : 'standard' as const;

        const result = await callClaudeForJson<CriticJsonResponse>({
            env: this.env,
            model: CLAUDE_PREMIUM_MODEL, // Opus 4.7 — best agentic coding for plan critique
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 2000,
            temperature: 0.1,
            speedMode,
            jsonSchemaDescription: `{
                "verdict": "approve" | "revise" | "reject",
                "concerns": [{ "severity": "blocker" | "major" | "minor", "title": string, "rationale": string, "offendingTaskId"?: string }],
                "suggestedRevisions": string[]
            }`,
        });

        this.criticState = {
            ...this.criticState,
            tokensSpent: this.criticState.tokensSpent + result.usage.inputTokens + result.usage.outputTokens,
        };

        return {
            verdict: result.value.verdict,
            concerns: (result.value.concerns ?? []) as readonly CriticConcern[],
            suggestedRevisions: result.value.suggestedRevisions ?? [],
        };
    }

    private aborted(start: number): AgentRunResult<CriticOutput> {
        this.criticState = { ...this.criticState, status: 'failed' };
        return {
            ok: false,
            status: 'failed',
            error: { code: 'aborted', message: 'CriticAgent aborted by TeamLead' },
            tokensSpent: this.criticState.tokensSpent,
            elapsedMs: Date.now() - start,
        };
    }
}

interface CriticJsonResponse {
    readonly verdict: 'approve' | 'revise' | 'reject';
    readonly concerns?: readonly {
        readonly severity: 'blocker' | 'major' | 'minor';
        readonly title: string;
        readonly rationale: string;
        readonly offendingTaskId?: string;
    }[];
    readonly suggestedRevisions?: readonly string[];
}
