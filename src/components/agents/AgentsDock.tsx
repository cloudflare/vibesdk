import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AgentChip } from './AgentChip';
import type { AgentSnapshot, AgentRole } from './types';

/**
 * AgentsDock — compact row of agent chips showing the live multi-agent pipeline.
 *
 * Mounted in the chat canvas above the phase timeline. Streams from the
 * new `agent_status` WS message. Gracefully invisible when the session has
 * no agent snapshots yet (falls back to existing PhaseTimeline only).
 *
 * Visual contract:
 *   TeamLead ↦ Planner ↦ Coder-{1..N} ↦ Tester ↦ Critic
 *   Running agents pulse, done are muted, queued are greyed.
 */
export interface AgentsDockProps {
    readonly agents: readonly AgentSnapshot[];
    readonly className?: string;
    readonly onAgentClick?: (agentId: string) => void;
    readonly compact?: boolean;
}

const ROLE_ORDER: Record<AgentRole, number> = {
    teamlead: 0,
    planner: 1,
    'coder-1': 2,
    'coder-2': 3,
    'coder-3': 4,
    'coder-4': 5,
    tester: 6,
    critic: 7,
};

export const AgentsDock = memo(function AgentsDock({
    agents,
    className,
    onAgentClick,
    compact = false,
}: AgentsDockProps) {
    const sorted = useMemo(
        () => [...agents].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)),
        [agents],
    );

    if (sorted.length === 0) return null;

    const activeCount = sorted.filter((a) => a.status === 'running').length;

    return (
        <div
            role="region"
            aria-label="Multi-agent status"
            className={cn(
                'flex items-center gap-2 overflow-x-auto rounded-lg border border-bg-4 bg-bg-2 px-3 py-2',
                className,
            )}
        >
            <span
                className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-text-primary/50"
                aria-live="polite"
            >
                Agents · {activeCount} running · {sorted.length} total
            </span>
            <div className="h-3.5 w-px bg-bg-4" aria-hidden />
            {sorted.map((a) => (
                <AgentChip
                    key={a.id}
                    agent={a}
                    compact={compact}
                    onClick={onAgentClick}
                    size={compact ? 'sm' : 'md'}
                />
            ))}
        </div>
    );
});
