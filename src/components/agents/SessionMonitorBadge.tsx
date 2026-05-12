import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiClient, type SessionMonitorData } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const POLL_MS = 5_000;

type Status = SessionMonitorData['status'];

interface StatusStyle {
    readonly dot: string;
    readonly text: string;
    readonly border: string;
    readonly label: string;
    readonly icon: typeof Activity;
}

const STATUS_STYLES: Record<Status, StatusStyle> = {
    planning: { dot: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/40', label: 'Planning', icon: Loader2 },
    coding: { dot: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/40', label: 'Coding', icon: Activity },
    testing: { dot: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/40', label: 'Testing', icon: Loader2 },
    idle: { dot: 'bg-bg-4', text: 'text-text-primary/70', border: 'border-bg-4', label: 'Idle', icon: Activity },
    failed: { dot: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/40', label: 'Failed', icon: AlertTriangle },
    done: { dot: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/40', label: 'Done', icon: CheckCircle2 },
};

export interface SessionMonitorBadgeProps {
    readonly sessionId: string;
    readonly className?: string;
}

/**
 * Compact pill that surfaces live session progress. Polls /api/sessions/:id/monitor
 * every 5s while mounted. Click → popover with full breakdown.
 *
 * Caller decides placement — this component is intentionally not auto-mounted.
 */
export const SessionMonitorBadge = memo(function SessionMonitorBadge({
    sessionId,
    className,
}: SessionMonitorBadgeProps) {
    const [data, setData] = useState<SessionMonitorData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchMonitor = useCallback(async () => {
        const res = await apiClient.getSessionMonitor(sessionId);
        if (res.success && res.data) {
            setData(res.data);
            setError(null);
        } else if (res.error) {
            setError(res.error.message);
        }
    }, [sessionId]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (cancelled) return;
            try {
                await fetchMonitor();
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'monitor failed');
            }
        };
        run();
        const id = window.setInterval(run, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [fetchMonitor]);

    const style = useMemo<StatusStyle>(
        () => (data ? STATUS_STYLES[data.status] : STATUS_STYLES.idle),
        [data],
    );

    if (error && !data) {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-bg-2 px-2.5 py-1 text-[11px] text-red-400',
                    className,
                )}
                title={error}
            >
                <AlertTriangle className="size-3" /> monitor offline
            </span>
        );
    }

    if (!data) {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border border-bg-4 bg-bg-2 px-2.5 py-1 text-[11px] text-text-primary/60',
                    className,
                )}
            >
                <Loader2 className="size-3 animate-spin" /> loading
            </span>
        );
    }

    const Icon = style.icon;
    const elapsedLabel = formatElapsed(data.elapsedMs);
    const isSpin = data.status === 'planning' || data.status === 'testing';

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Session monitor — ${style.label}`}
                    className={cn(
                        'inline-flex items-center gap-2 rounded-full border bg-bg-2 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-bg-4 focus:outline-none focus:ring-1 focus:ring-accent/40',
                        style.border,
                        className,
                    )}
                >
                    <span className={cn('inline-block size-1.5 rounded-full', style.dot)} aria-hidden />
                    <Icon className={cn('size-3.5', style.text, isSpin && 'animate-spin')} aria-hidden />
                    <span className={cn('font-medium', style.text)}>{style.label}</span>
                    <span className="text-text-primary/60">·</span>
                    <span className="font-mono text-[11px] tabular-nums">
                        {data.progress.completed} / {data.progress.total} tasks
                    </span>
                    <span className="text-text-primary/60">·</span>
                    <span className="font-mono text-[11px] tabular-nums">{elapsedLabel}</span>
                    <span className="text-text-primary/60">·</span>
                    <span className="font-mono text-[11px] tabular-nums">{data.cost.creditsSpent} cr</span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-xs">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className={cn('font-semibold uppercase tracking-wide', style.text)}>{style.label}</span>
                        <span className="font-mono text-text-primary/60">{elapsedLabel}</span>
                    </div>
                    {data.currentActivity && (
                        <div>
                            <div className="text-text-primary/60">Current</div>
                            <div className="mt-0.5 truncate font-medium text-text-primary" title={data.currentActivity}>
                                {data.currentActivity}
                            </div>
                        </div>
                    )}
                    <Row label="Progress" value={`${data.progress.completed} / ${data.progress.total}`} />
                    <Row label="Running" value={`${data.agents.running}`} />
                    <Row label="Done" value={`${data.agents.done}`} />
                    <Row label="Failed" value={`${data.agents.failed}`} />
                    <Row label="Tokens" value={data.cost.tokensSpent.toLocaleString()} />
                    <Row label="Credits" value={`${data.cost.creditsSpent}`} />
                    {data.lastEventAt && (
                        <Row label="Last event" value={formatRelative(data.lastEventAt)} />
                    )}
                    <div className="flex gap-3 pt-1">
                        <a
                            href={data.links.sessionUrl}
                            className="text-accent hover:underline"
                        >
                            Open session
                        </a>
                        {data.links.previewUrl && (
                            <a
                                href={data.links.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline"
                            >
                                Preview
                            </a>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
});

function Row({ label, value }: { readonly label: string; readonly value: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-text-primary/60">{label}</span>
            <span className="font-mono tabular-nums text-text-primary">{value}</span>
        </div>
    );
}

function formatElapsed(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatRelative(ts: number): string {
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}
