import { memo, useEffect, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { AgentSnapshot, AgentRole, AgentStatus, ModelTierLabel } from './types';

const chipVariants = cva(
    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors select-none',
    {
        variants: {
            status: {
                idle: 'bg-bg-2 border-bg-4 text-text-primary/70',
                queued: 'bg-bg-2 border-bg-4 text-text-primary/60',
                running: 'bg-accent/5 border-accent/30 text-text-primary',
                done: 'bg-bg-2 border-bg-4 text-text-primary/80',
                failed: 'bg-red-500/10 border-red-500/40 text-red-400',
            },
            size: {
                sm: 'px-2.5 py-1 text-[11px]',
                md: 'px-3 py-1.5 text-xs',
                lg: 'px-3.5 py-2 text-sm',
            },
        },
        defaultVariants: { status: 'idle', size: 'md' },
    },
);

const ROLE_GLYPH: Record<AgentRole, { label: string; className: string }> = {
    teamlead: { label: 'TL', className: 'bg-gradient-to-br from-[#F38020] to-[#FF8A2E] text-black' },
    planner: { label: 'PL', className: 'bg-indigo-500/20 text-indigo-400' },
    'coder-1': { label: 'C1', className: 'bg-teal-500/20 text-teal-400' },
    'coder-2': { label: 'C2', className: 'bg-teal-500/20 text-teal-400' },
    'coder-3': { label: 'C3', className: 'bg-teal-500/20 text-teal-400' },
    'coder-4': { label: 'C4', className: 'bg-teal-500/20 text-teal-400' },
    tester: { label: 'TS', className: 'bg-amber-500/20 text-amber-400' },
    critic: { label: 'CR', className: 'bg-violet-500/20 text-violet-400' },
};

interface StatusDotProps {
    readonly status: AgentStatus;
}

function StatusDot({ status }: StatusDotProps) {
    const base = 'inline-block size-1.5 rounded-full shrink-0';
    if (status === 'running') {
        return (
            <span
                className={cn(base, 'bg-accent')}
                style={{
                    animation: 'agent-chip-pulse 1.2s ease-in-out infinite',
                    boxShadow: '0 0 0 0 rgba(243,128,32,.5)',
                }}
                aria-label="running"
            />
        );
    }
    if (status === 'done') return <span className={cn(base, 'bg-emerald-500')} aria-label="done" />;
    if (status === 'failed') return <span className={cn(base, 'bg-red-500')} aria-label="failed" />;
    if (status === 'queued') return <span className={cn(base, 'bg-bg-4')} aria-label="queued" />;
    return <span className={cn(base, 'bg-bg-4/50')} aria-label="idle" />;
}

export interface AgentChipProps extends VariantProps<typeof chipVariants> {
    readonly agent: AgentSnapshot;
    readonly onClick?: (agentId: string) => void;
    readonly className?: string;
    readonly compact?: boolean;
}

/**
 * Agent chip — visible status indicator for one sub-agent.
 * Streams its elapsed time live while `status === 'running'`.
 * Click to expand into the full log panel (handled by parent).
 */
export const AgentChip = memo(function AgentChip({
    agent,
    onClick,
    className,
    compact = false,
    size,
}: AgentChipProps) {
    const glyph = ROLE_GLYPH[agent.role];
    const tick = useTick(agent.status === 'running');
    const elapsed = agent.startedAt ? formatElapsed(Date.now() - agent.startedAt + tick * 0) : undefined;

    const handle = onClick
        ? () => onClick(agent.id)
        : undefined;

    return (
        <button
            type="button"
            onClick={handle}
            disabled={!handle}
            aria-label={`Agent ${agent.displayName}, status ${agent.status}`}
            className={cn(
                chipVariants({ status: agent.status, size }),
                handle && 'cursor-pointer hover:border-bg-4',
                !handle && 'cursor-default',
                className,
            )}
        >
            <span
                className={cn(
                    'inline-flex size-5 items-center justify-center rounded-md text-[10px] font-bold leading-none',
                    glyph.className,
                )}
            >
                {glyph.label}
            </span>
            {!compact && <span className="font-medium">{agent.displayName}</span>}
            <ModelPill tier={agent.modelTier} />
            <StatusDot status={agent.status} />
            {elapsed && <span className="font-mono text-[10px] opacity-60">{elapsed}</span>}
        </button>
    );
});

function ModelPill({ tier }: { readonly tier: ModelTierLabel }) {
    return (
        <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">
            {tier === 'sonnet-high' ? 's-hi' : tier === 'sonnet-med' ? 's-md' : tier === 'sonnet-low' ? 's-lo' : tier}
        </span>
    );
}

function formatElapsed(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s.toString().padStart(2, '0')}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
}

/** 1-second tick to drive the elapsed counter without re-rendering the world. */
function useTick(enabled: boolean): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        const id = window.setInterval(() => setTick((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, [enabled]);
    return tick;
}
