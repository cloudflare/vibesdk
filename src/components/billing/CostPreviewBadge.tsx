import { memo, useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostPreviewDetail {
    phaseName: string;
    fileCount: number;
    creditsMin: number;
    creditsMax: number;
    modelTier: 'lite' | 'regular' | 'reasoning' | 'premium';
}

export interface CostPreviewBadgeProps {
    readonly className?: string;
}

/**
 * Compact badge shown while a phase is executing — displays the estimated
 * credit cost range emitted by the backend `cost_preview` WebSocket message.
 *
 * Listens to the `vibesdk:cost_preview` custom event dispatched by
 * `handle-websocket-message.ts`. Auto-clears 8 s after the last update so
 * it doesn't linger after phase completion.
 */
export const CostPreviewBadge = memo(function CostPreviewBadge({
    className,
}: CostPreviewBadgeProps) {
    const [preview, setPreview] = useState<CostPreviewDetail | null>(null);

    useEffect(() => {
        let clearTimer: ReturnType<typeof setTimeout>;

        const handler = (e: Event) => {
            const detail = (e as CustomEvent<CostPreviewDetail>).detail;
            setPreview(detail);
            clearTimeout(clearTimer);
            // Auto-dismiss 8 s after the preview arrives — by then the phase
            // will have started streaming and the badge is no longer useful.
            clearTimer = setTimeout(() => setPreview(null), 8_000);
        };

        window.addEventListener('vibesdk:cost_preview', handler);
        return () => {
            window.removeEventListener('vibesdk:cost_preview', handler);
            clearTimeout(clearTimer);
        };
    }, []);

    if (!preview) return null;

    const sameRange = preview.creditsMin === preview.creditsMax;
    const rangeLabel = sameRange
        ? `~${preview.creditsMin}`
        : `~${preview.creditsMin}–${preview.creditsMax}`;

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400',
                className,
            )}
            title={`Estimated cost for "${preview.phaseName}" (${preview.fileCount} file${preview.fileCount !== 1 ? 's' : ''})`}
        >
            <Coins className="size-3 shrink-0" aria-hidden />
            <span>{rangeLabel} credits</span>
            <span className="text-amber-400/60">·</span>
            <span className="text-amber-400/60 font-mono text-[10px] tabular-nums truncate max-w-[120px]">
                {preview.phaseName}
            </span>
        </div>
    );
});
