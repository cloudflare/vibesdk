/**
 * Shared types for the multi-agent UI surface.
 *
 * These mirror the shapes exposed by the backend over the new
 * `agent_status` and `plan_update` WebSocket messages. Kept colocated
 * with the components that consume them until we promote to `src/api-types.ts`
 * once the backend contract is locked.
 */

export type AgentRole =
    | 'teamlead'
    | 'planner'
    | 'coder-1'
    | 'coder-2'
    | 'coder-3'
    | 'coder-4'
    | 'tester'
    | 'critic';

export type AgentStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export type ModelTierLabel =
    | 'haiku'
    | 'sonnet-low'
    | 'sonnet-med'
    | 'sonnet-high'
    | 'opus';

export interface AgentSnapshot {
    readonly id: string;
    readonly role: AgentRole;
    readonly displayName: string;
    readonly status: AgentStatus;
    readonly modelTier: ModelTierLabel;
    readonly currentActivity?: string;
    readonly elapsedMs?: number;
    readonly tokensUsed?: number;
    readonly startedAt?: number;
}

export type PlanNodeRole = 'milestone' | 'task' | 'subtask';
export type PlanNodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface PlanNode {
    readonly id: string;
    readonly parentId: string | null;
    readonly role: PlanNodeRole;
    readonly title: string;
    readonly description?: string;
    readonly status: PlanNodeStatus;
    readonly assignedAgent?: AgentRole;
    readonly ownedFiles: readonly string[];
    readonly criticRounds: number;
    readonly criticVerdict?: string;
    readonly children: readonly PlanNode[];
    readonly startedAt?: number;
    readonly completedAt?: number;
}
