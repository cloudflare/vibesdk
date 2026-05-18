/**
 * DegradedModeBanner — ADR-010 Option A.
 *
 * Shown when the WebSocket connection has failed permanently (all retry
 * attempts exhausted). Fetches the last-completed snapshot and surfaces
 * the project's last-known-good state so users understand what was built
 * before the platform incident.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import type { SessionSnapshot } from '@/api-types';

interface DegradedModeBannerProps {
    sessionId: string;
    isVisible: boolean;
}

function formatRelativeTime(timestamp: number | null): string {
    if (timestamp === null) return 'unknown time';
    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function DegradedModeBanner({ sessionId, isVisible }: DegradedModeBannerProps) {
    const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isVisible || !sessionId) return;

        let cancelled = false;
        setLoading(true);

        apiClient
            .getSessionSnapshot(sessionId)
            .then((data) => {
                if (!cancelled) setSnapshot(data);
            })
            .catch(() => {
                // Snapshot unavailable — banner still shows the degraded warning
                if (!cancelled) setSnapshot(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isVisible, sessionId]);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="w-full border-b border-orange-500/30 bg-orange-500/10 px-4 py-2.5"
                    role="alert"
                    aria-live="polite"
                >
                    <div className="flex items-start gap-2.5">
                        <AlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-orange-400" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-orange-300">
                                Platform degraded — connection lost
                            </p>
                            {loading ? (
                                <p className="mt-0.5 text-xs text-orange-400/70 flex items-center gap-1.5">
                                    <RefreshCw className="size-3 animate-spin" />
                                    Loading last completed state...
                                </p>
                            ) : snapshot ? (
                                <p className="mt-0.5 text-xs text-orange-400/70">
                                    Last completed state:{' '}
                                    <span className="font-medium text-orange-300">
                                        {snapshot.projectName || 'Untitled project'}
                                    </span>
                                    {' '}({snapshot.filesCount} file{snapshot.filesCount === 1 ? '' : 's'}
                                    {snapshot.templateName ? `, ${snapshot.templateName}` : ''})
                                    {' '}— {formatRelativeTime(snapshot.completedAt)}
                                </p>
                            ) : (
                                <p className="mt-0.5 text-xs text-orange-400/70">
                                    No completed state available. Refresh the page to reconnect.
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-shrink-0 rounded px-2 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition-colors"
                            aria-label="Reload page to reconnect"
                        >
                            Reload
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
