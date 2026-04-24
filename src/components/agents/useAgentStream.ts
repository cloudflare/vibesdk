import { useCallback, useMemo, useReducer } from 'react';
import type {
    AgentSnapshot,
    AgentRole,
    AgentStatus,
    ModelTierLabel,
    PlanNode,
    PlanNodeStatus,
} from './types';

/**
 * useAgentStream — reducer-backed store for live multi-agent state.
 *
 * Consumes the new `agent_status` + `plan_update` WebSocket messages and
 * exposes a stable (AgentSnapshot[], PlanNode[]) view for AgentsDock / PlanTree.
 *
 * Deliberate choices:
 *   - Last-write-wins per agent id — the server coalesces at ~10Hz (per COST-OPTIMIZATION.md #4).
 *   - Plan tree re-derives children from parentId on every update — O(n) at today's scale, fine.
 *   - Reducer (not Zustand) — avoids a new dep and keeps the surface testable.
 */

interface PlanUpdateNodePayload {
    readonly id: string;
    readonly parentId: string | null;
    readonly role: 'milestone' | 'task' | 'subtask';
    readonly title: string;
    readonly description?: string;
    readonly status: PlanNodeStatus;
    readonly assignedAgent?: string;
    readonly ownedFiles: readonly string[];
    readonly criticRounds: number;
    readonly sortIndex: number;
}

export interface AgentStatusMessagePayload {
    readonly agentId: string;
    readonly role: AgentRole;
    readonly displayName: string;
    readonly status: AgentStatus;
    readonly modelTier: ModelTierLabel;
    readonly currentActivity?: string;
    readonly tokensSpent: number;
    readonly startedAt?: number;
}

export interface PlanUpdateMessagePayload {
    readonly action: 'upsert' | 'delete';
    readonly node: PlanUpdateNodePayload;
}

interface State {
    readonly agents: ReadonlyMap<string, AgentSnapshot>;
    readonly planFlat: ReadonlyMap<string, PlanUpdateNodePayload>;
}

type Action =
    | { type: 'agent_status'; payload: AgentStatusMessagePayload }
    | { type: 'plan_update'; payload: PlanUpdateMessagePayload }
    | { type: 'reset' };

const INITIAL: State = { agents: new Map(), planFlat: new Map() };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'agent_status': {
            const next = new Map(state.agents);
            const p = action.payload;
            next.set(p.agentId, {
                id: p.agentId,
                role: p.role,
                displayName: p.displayName,
                status: p.status,
                modelTier: p.modelTier,
                currentActivity: p.currentActivity,
                tokensSpent: p.tokensSpent,
                startedAt: p.startedAt,
            });
            return { ...state, agents: next };
        }
        case 'plan_update': {
            const next = new Map(state.planFlat);
            if (action.payload.action === 'delete') {
                next.delete(action.payload.node.id);
            } else {
                next.set(action.payload.node.id, action.payload.node);
            }
            return { ...state, planFlat: next };
        }
        case 'reset':
            return INITIAL;
        default:
            return state;
    }
}

/**
 * Rebuild a tree of PlanNode from the flat id→payload map.
 * Roots = nodes with parentId === null.
 * O(n) w/ a single pass to bucket children, then O(n) to assemble.
 */
function buildTree(flat: ReadonlyMap<string, PlanUpdateNodePayload>): PlanNode[] {
    const childrenByParent = new Map<string | null, PlanUpdateNodePayload[]>();
    for (const node of flat.values()) {
        const key = node.parentId;
        const bucket = childrenByParent.get(key) ?? [];
        bucket.push(node);
        childrenByParent.set(key, bucket);
    }

    const toPlanNode = (p: PlanUpdateNodePayload): PlanNode => ({
        id: p.id,
        parentId: p.parentId,
        role: p.role,
        title: p.title,
        description: p.description,
        status: p.status,
        assignedAgent: p.assignedAgent as AgentRole | undefined,
        ownedFiles: p.ownedFiles,
        criticRounds: p.criticRounds,
        children: (childrenByParent.get(p.id) ?? [])
            .slice()
            .sort((a, b) => a.sortIndex - b.sortIndex)
            .map(toPlanNode),
    });

    return (childrenByParent.get(null) ?? [])
        .slice()
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .map(toPlanNode);
}

export interface AgentStreamApi {
    readonly agents: readonly AgentSnapshot[];
    readonly plan: readonly PlanNode[];
    readonly handleAgentStatus: (msg: AgentStatusMessagePayload) => void;
    readonly handlePlanUpdate: (msg: PlanUpdateMessagePayload) => void;
    readonly reset: () => void;
}

export function useAgentStream(): AgentStreamApi {
    const [state, dispatch] = useReducer(reducer, INITIAL);

    const handleAgentStatus = useCallback((msg: AgentStatusMessagePayload) => {
        dispatch({ type: 'agent_status', payload: msg });
    }, []);

    const handlePlanUpdate = useCallback((msg: PlanUpdateMessagePayload) => {
        dispatch({ type: 'plan_update', payload: msg });
    }, []);

    const reset = useCallback(() => dispatch({ type: 'reset' }), []);

    const agents = useMemo(() => Array.from(state.agents.values()), [state.agents]);
    const plan = useMemo(() => buildTree(state.planFlat), [state.planFlat]);

    return { agents, plan, handleAgentStatus, handlePlanUpdate, reset };
}
