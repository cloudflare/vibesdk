import { memo, useCallback, useMemo, useState } from 'react';
import { ChevronRight, Check, CircleDashed, AlertTriangle, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanNode, PlanNodeStatus, AgentRole } from './types';

const AGENT_SHORT: Record<AgentRole, string> = {
    teamlead: 'TeamLead',
    planner: 'Planner',
    'coder-1': 'Coder-1',
    'coder-2': 'Coder-2',
    'coder-3': 'Coder-3',
    'coder-4': 'Coder-4',
    tester: 'Tester',
    critic: 'Critic',
};

export interface PlanTreeProps {
    readonly nodes: readonly PlanNode[];
    readonly currentNodeId?: string;
    readonly onSelect?: (nodeId: string) => void;
    readonly defaultOpen?: boolean;
    readonly className?: string;
}

/**
 * PlanTree — hierarchical live view of the TeamLead's current plan.
 * Milestones (depth 0) are collapsible; tasks/subtasks render flat under them.
 * Expects the backend to push `plan_update` WS messages that merge into this tree.
 */
export const PlanTree = memo(function PlanTree({
    nodes,
    currentNodeId,
    onSelect,
    defaultOpen = true,
    className,
}: PlanTreeProps) {
    if (nodes.length === 0) {
        return <PlanEmpty className={className} />;
    }
    return (
        <div className={cn('flex flex-col gap-1 p-2', className)}>
            {nodes.map((node) => (
                <PlanGroup
                    key={node.id}
                    node={node}
                    currentNodeId={currentNodeId}
                    onSelect={onSelect}
                    defaultOpen={defaultOpen}
                />
            ))}
        </div>
    );
});

interface PlanGroupProps {
    readonly node: PlanNode;
    readonly currentNodeId?: string;
    readonly onSelect?: (nodeId: string) => void;
    readonly defaultOpen: boolean;
}

function PlanGroup({ node, currentNodeId, onSelect, defaultOpen }: PlanGroupProps) {
    const [open, setOpen] = useState(defaultOpen);
    const toggle = useCallback(() => setOpen((o) => !o), []);

    const stats = useMemo(() => countStatuses(node), [node]);
    const progress = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

    return (
        <div>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-bg-2 transition-colors"
            >
                <ChevronRight
                    className={cn('size-3.5 text-text-primary/50 transition-transform', open && 'rotate-90')}
                    aria-hidden
                />
                <span className="flex-1 truncate">{node.title}</span>
                <span className="font-mono text-[10px] text-text-primary/50 tabular-nums">
                    {stats.done}/{stats.total}
                </span>
                <span
                    className="h-1 w-10 overflow-hidden rounded-full bg-bg-3"
                    aria-label={`${progress}% complete`}
                >
                    <span
                        className="block h-full bg-accent transition-[width] duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </span>
            </button>
            {open && node.children.length > 0 && (
                <div className="ml-5 flex flex-col gap-0.5 pl-2 border-l border-bg-3">
                    {node.children.map((child) => (
                        <PlanLeaf
                            key={child.id}
                            node={child}
                            depth={1}
                            isCurrent={child.id === currentNodeId}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface PlanLeafProps {
    readonly node: PlanNode;
    readonly depth: number;
    readonly isCurrent: boolean;
    readonly onSelect?: (nodeId: string) => void;
}

function PlanLeaf({ node, depth, isCurrent, onSelect }: PlanLeafProps) {
    const handle = useCallback(() => onSelect?.(node.id), [onSelect, node.id]);
    const hasKids = node.children.length > 0;

    return (
        <>
            <button
                type="button"
                onClick={onSelect ? handle : undefined}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                    isCurrent ? 'bg-bg-3 text-text-primary' : 'text-text-primary/75 hover:bg-bg-2 hover:text-text-primary',
                    !onSelect && 'cursor-default',
                )}
            >
                <StatusIcon status={node.status} />
                <span className="flex-1 truncate">{node.title}</span>
                {node.assignedAgent && (
                    <span className="font-mono text-[10px] text-text-primary/40 tabular-nums">
                        {AGENT_SHORT[node.assignedAgent]}
                    </span>
                )}
                {node.criticRounds > 0 && (
                    <span
                        title={`Critic reviewed ${node.criticRounds}×`}
                        className="font-mono text-[10px] text-violet-400"
                    >
                        ✦{node.criticRounds}
                    </span>
                )}
            </button>
            {hasKids && (
                <div className={cn('flex flex-col gap-0.5', depth >= 2 ? 'ml-3' : 'ml-5 pl-2 border-l border-bg-3')}>
                    {node.children.map((child) => (
                        <PlanLeaf
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            isCurrent={child.id === undefined ? false : false /* currentNodeId not threaded past depth 1 */}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

function StatusIcon({ status }: { readonly status: PlanNodeStatus }) {
    const base = 'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full';
    if (status === 'done') {
        return (
            <span className={cn(base, 'bg-emerald-500/20 text-emerald-400')} aria-label="done">
                <Check className="size-2.5" strokeWidth={3} />
            </span>
        );
    }
    if (status === 'running') {
        return (
            <span className={cn(base, 'bg-accent/20 text-accent')} aria-label="running">
                <span
                    className="size-2 rounded-full border-[1.5px] border-current border-t-transparent"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                />
            </span>
        );
    }
    if (status === 'failed') {
        return (
            <span className={cn(base, 'bg-red-500/20 text-red-400')} aria-label="failed">
                <AlertTriangle className="size-2.5" strokeWidth={2.5} />
            </span>
        );
    }
    if (status === 'skipped') {
        return (
            <span className={cn(base, 'bg-bg-3 text-text-primary/40')} aria-label="skipped">
                <SkipForward className="size-2.5" strokeWidth={2.5} />
            </span>
        );
    }
    return (
        <span className={cn(base, 'bg-bg-3 text-text-primary/40')} aria-label="pending">
            <CircleDashed className="size-2.5" strokeWidth={2} />
        </span>
    );
}

function PlanEmpty({ className }: { readonly className?: string }) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-text-primary/50',
                className,
            )}
        >
            <CircleDashed className="size-6 opacity-40" />
            <span>Plan will appear here once the Planner agent drafts it.</span>
        </div>
    );
}

interface StatusCounts {
    readonly total: number;
    readonly done: number;
    readonly running: number;
    readonly failed: number;
}

/** Recursively count leaf statuses under a node (excludes the node itself when it's a group). */
function countStatuses(node: PlanNode): StatusCounts {
    if (node.children.length === 0) {
        return {
            total: 1,
            done: node.status === 'done' ? 1 : 0,
            running: node.status === 'running' ? 1 : 0,
            failed: node.status === 'failed' ? 1 : 0,
        };
    }
    return node.children.reduce<StatusCounts>(
        (acc, child) => {
            const c = countStatuses(child);
            return {
                total: acc.total + c.total,
                done: acc.done + c.done,
                running: acc.running + c.running,
                failed: acc.failed + c.failed,
            };
        },
        { total: 0, done: 0, running: 0, failed: 0 },
    );
}
