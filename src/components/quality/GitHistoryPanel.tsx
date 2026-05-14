import { memo, useEffect, useState } from 'react';
import { GitCommit, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import type { GitCommitEntry } from '@/api-types';

export interface GitHistoryPanelProps {
    readonly sessionId: string;
    readonly className?: string;
}

/** Format ISO timestamp as a short relative or absolute string. */
function formatTimestamp(iso: string): string {
    const ts = Date.parse(iso);
    if (isNaN(ts)) return iso;
    const diffMs = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** First line of a commit message (strip trailing newlines). */
function commitSubject(message: string): string {
    return message.split('\n')[0].trim();
}

/**
 * Collapsible git commit history panel — surfaces the isomorphic-git log
 * stored in the session's Durable Object SQLite-FS adapter.
 *
 * Renders v0.dev-style git panel: commit list with short OID, subject, timestamp.
 * Lazy-loads on first expand; auto-refreshes whenever the session generates new phases.
 */
export const GitHistoryPanel = memo(function GitHistoryPanel({
    sessionId,
    className,
}: GitHistoryPanelProps) {
    const [open, setOpen] = useState(false);
    const [commits, setCommits] = useState<GitCommitEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await apiClient.getGitLog(sessionId, 30);
                if (!cancelled) {
                    setCommits(res.data?.commits ?? []);
                }
            } catch {
                if (!cancelled) {
                    setError('Could not load git history.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [open, sessionId]);

    return (
        <div className={cn('rounded-lg border border-bg-4 bg-bg-2 text-sm', className)}>
            {/* Header toggle */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={cn(
                    'flex w-full items-center justify-between px-3 py-2',
                    'text-left text-text-2 hover:text-text-1 transition-colors',
                    open && 'border-b border-bg-4',
                )}
                aria-expanded={open}
            >
                <span className="flex items-center gap-1.5 font-medium">
                    <GitCommit className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Git History
                    {commits.length > 0 && (
                        <span className="ml-1 rounded-full bg-bg-3 px-1.5 py-0.5 text-xs text-text-3">
                            {commits.length}
                        </span>
                    )}
                </span>
                {open
                    ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-text-3" aria-hidden="true" />
                    : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-3" aria-hidden="true" />
                }
            </button>

            {/* Commit list */}
            {open && (
                <div className="max-h-64 overflow-y-auto">
                    {loading && (
                        <p className="px-3 py-4 text-center text-xs text-text-3">Loading history…</p>
                    )}
                    {error && (
                        <p className="px-3 py-4 text-center text-xs text-destructive">{error}</p>
                    )}
                    {!loading && !error && commits.length === 0 && (
                        <p className="px-3 py-4 text-center text-xs text-text-3">No commits yet.</p>
                    )}
                    {!loading && !error && commits.length > 0 && (
                        <ul className="divide-y divide-bg-4">
                            {commits.map(c => (
                                <li key={c.oid} className="flex items-start gap-2 px-3 py-2 hover:bg-bg-3 transition-colors">
                                    <code className="mt-0.5 shrink-0 rounded bg-bg-3 px-1 py-0.5 font-mono text-xs text-text-3">
                                        {c.oid.slice(0, 7)}
                                    </code>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs text-text-1">
                                            {commitSubject(c.message)}
                                        </p>
                                        <p className="mt-0.5 text-xs text-text-3">
                                            {formatTimestamp(c.timestamp)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
});
