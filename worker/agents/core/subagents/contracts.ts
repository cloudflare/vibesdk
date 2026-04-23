/**
 * Sub-agent RPC contracts — the boundary between TeamLead and its workers.
 *
 * Each sub-agent DO exposes this interface via native DO-to-DO RPC (calls on
 * a stub). Shapes are intentionally narrow so a sub-agent can be rewritten or
 * replaced without touching the coordinator.
 *
 * See docs/redesign/ADR-001-multi-agent.md for the full design.
 */

import type { Blueprint, FileOutputType, PhaseConceptType } from '../../schemas';
import type { ModelTier } from '../../inferutils/modelRouter';

export type SubAgentRole = 'planner' | 'coder' | 'tester' | 'critic';

export type SubAgentStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export interface SharedContext {
    readonly sessionId: string;
    readonly userId: string;
    readonly tier: 'free' | 'pro' | 'team' | 'enterprise';
    readonly blueprint: Blueprint;
    readonly ownedFiles: readonly string[];
    readonly budgetTokens: number;
    readonly modelTier: ModelTier;
    /** HTTPS read-only token — sub-agent fetches current file tree from TeamLead. */
    readonly fileTreeReadUrl: string;
}

export interface FilePatch {
    readonly path: string;
    readonly contents: string;
    readonly action: 'create' | 'update' | 'delete';
    /** Unified diff against the previous version; empty string for creates. */
    readonly diff: string;
}

export interface AgentRunResult<TOutput> {
    readonly ok: boolean;
    readonly status: SubAgentStatus;
    readonly output?: TOutput;
    readonly error?: { code: string; message: string };
    readonly tokensSpent: number;
    readonly elapsedMs: number;
}

/** Status snapshot returned by any sub-agent when the coordinator polls. */
export interface AgentStatusSnapshot {
    readonly role: SubAgentRole;
    readonly status: SubAgentStatus;
    readonly currentActivity?: string;
    readonly modelTier: ModelTier;
    readonly tokensSpent: number;
    readonly startedAt?: number;
}

// ── Planner ──────────────────────────────────────────────────────────────

export interface PlannerInput {
    readonly prompt: string;
    readonly ctx: SharedContext;
}

export interface PlannedMilestone {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly tasks: readonly PlannedTask[];
}

export interface PlannedTask {
    readonly id: string;
    readonly title: string;
    readonly ownedFiles: readonly string[];        // globs, non-overlapping across siblings
    readonly assignedRole: 'coder' | 'tester';
    readonly dependsOn: readonly string[];          // task ids
}

export interface PlannerOutput {
    readonly phaseConcept: PhaseConceptType;
    readonly milestones: readonly PlannedMilestone[];
}

// ── Coder ────────────────────────────────────────────────────────────────

export interface CoderInput {
    readonly task: PlannedTask;
    readonly ctx: SharedContext;
}

export interface CoderOutput {
    readonly patches: readonly FilePatch[];
    readonly generatedFiles: readonly FileOutputType[];
}

// ── Tester ───────────────────────────────────────────────────────────────

export interface TesterInput {
    readonly sandboxInstanceId: string;
    readonly ctx: SharedContext;
    /** Which files changed since last run — Tester scopes diagnostics. */
    readonly changedFiles: readonly string[];
}

export interface TesterOutput {
    readonly passed: boolean;
    readonly runtimeErrors: readonly RuntimeErrorReport[];
    readonly staticIssues: readonly StaticIssueReport[];
    readonly logs: string;
}

export interface RuntimeErrorReport {
    readonly file?: string;
    readonly line?: number;
    readonly message: string;
    readonly stackTrace?: string;
}

export interface StaticIssueReport {
    readonly file: string;
    readonly line?: number;
    readonly severity: 'error' | 'warning';
    readonly rule: string;
    readonly message: string;
}

// ── Critic ───────────────────────────────────────────────────────────────

export interface CriticInput {
    readonly plan: readonly PlannedMilestone[];
    readonly ctx: SharedContext;
    readonly previousRounds: number;
}

export interface CriticOutput {
    readonly verdict: 'approve' | 'revise' | 'reject';
    readonly concerns: readonly CriticConcern[];
    readonly suggestedRevisions: readonly string[];
}

export interface CriticConcern {
    readonly severity: 'blocker' | 'major' | 'minor';
    readonly title: string;
    readonly rationale: string;
    readonly offendingTaskId?: string;
}

// ── Coordinator-facing RPC interface (all sub-agents share this shape) ───

export interface SubAgentRpc<TIn, TOut> {
    /** Starts the run; returns when complete. Long-running — use waitUntil. */
    run(input: TIn): Promise<AgentRunResult<TOut>>;
    /** Cooperative cancellation; sub-agent checks abort token on next LLM call. */
    abort(): Promise<void>;
    /** Cheap poll for UI streaming. */
    getStatus(): Promise<AgentStatusSnapshot>;
}

export type PlannerRpc = SubAgentRpc<PlannerInput, PlannerOutput>;
export type CoderRpc = SubAgentRpc<CoderInput, CoderOutput>;
export type TesterRpc = SubAgentRpc<TesterInput, TesterOutput>;
export type CriticRpc = SubAgentRpc<CriticInput, CriticOutput>;
