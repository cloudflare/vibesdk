import { memo, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type PhaseVerdict = {
    phaseName: string;
    passed: boolean;
    blockedReason: string | null;
    scores: {
        faithfulness: number;
        answerRelevancy: number;
        toolCorrectness: number;
        hallucinationRisk: number;
    };
    compositeScore: number;
};

type EvalGateVerdictDetail = {
    phaseName: string;
    passed: boolean;
    blockedReason: string | null;
    scores: {
        faithfulness: number;
        answerRelevancy: number;
        toolCorrectness: number;
        hallucinationRisk: number;
    };
    compositeScore: number;
};

export interface PhaseQualityBadgeProps {
    readonly sessionId: string;
    readonly className?: string;
}

/**
 * Compact pill that surfaces EvalGate phase quality verdicts in real-time.
 * Listens to vibesdk:eval_gate_verdict custom events and fetches history on mount.
 * Click → popover with all verdicts (newest first), each showing 4 metric score bars.
 *
 * Caller decides placement — this component is intentionally not auto-mounted.
 */
export const PhaseQualityBadge = memo(function PhaseQualityBadge({
    sessionId,
    className,
}: PhaseQualityBadgeProps) {
    const [verdicts, setVerdicts] = useState<PhaseVerdict[]>([]);

    const fetchHistory = useCallback(async () => {
        if (!sessionId) return;
        const res = await apiClient.getSessionQuality(sessionId);
        if (res.success && res.data?.hasResults) {
            const mapped: PhaseVerdict[] = res.data.results.map((r) => ({
                phaseName: r.phaseName,
                passed: r.passed,
                blockedReason: r.blockedReason,
                scores: {
                    faithfulness: r.faithfulness,
                    answerRelevancy: r.answerRelevancy,
                    toolCorrectness: r.toolCorrectness,
                    hallucinationRisk: r.hallucinationRisk,
                },
                compositeScore: r.compositeScore,
            }));
            setVerdicts(mapped);
        }
    }, [sessionId]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<EvalGateVerdictDetail>).detail;
            const verdict: PhaseVerdict = {
                phaseName: detail.phaseName,
                passed: detail.passed,
                blockedReason: detail.blockedReason,
                scores: detail.scores,
                compositeScore: detail.compositeScore,
            };
            setVerdicts((prev) => [verdict, ...prev]);
        };
        window.addEventListener('vibesdk:eval_gate_verdict', handler);
        return () => {
            window.removeEventListener('vibesdk:eval_gate_verdict', handler);
        };
    }, []);

    if (verdicts.length === 0) {
        return null;
    }

    const latest = verdicts[0];
    const latestPassed = latest.passed;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Phase quality — ${latestPassed ? 'PASS' : 'FAIL'}`}
                    className={cn(
                        'inline-flex items-center gap-2 rounded-full border bg-bg-2 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-bg-4 focus:outline-none focus:ring-1 focus:ring-accent/40',
                        latestPassed
                            ? 'border-emerald-500/40'
                            : 'border-amber-500/40',
                        className,
                    )}
                >
                    <span
                        className={cn(
                            'inline-block size-1.5 rounded-full',
                            latestPassed ? 'bg-emerald-500' : 'bg-amber-500',
                        )}
                        aria-hidden
                    />
                    {latestPassed ? (
                        <CheckCircle2
                            className="size-3.5 text-emerald-400"
                            aria-hidden
                        />
                    ) : (
                        <AlertTriangle
                            className="size-3.5 text-amber-400"
                            aria-hidden
                        />
                    )}
                    <span
                        className={cn(
                            'font-medium',
                            latestPassed ? 'text-emerald-400' : 'text-amber-400',
                        )}
                    >
                        Quality: {latestPassed ? 'PASS' : '!'}
                    </span>
                    <span className="text-text-primary/60">·</span>
                    <span className="font-mono text-[11px] tabular-nums text-text-primary/60">
                        {verdicts.length} phase{verdicts.length !== 1 ? 's' : ''}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-xs">
                <div className="flex flex-col gap-3">
                    <div className="font-semibold uppercase tracking-wide text-text-primary/80">
                        Phase Quality
                    </div>
                    {verdicts.map((v, idx) => (
                        <VerdictRow key={`${v.phaseName}-${idx}`} verdict={v} />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
});

function VerdictRow({ verdict }: { readonly verdict: PhaseVerdict }) {
    return (
        <div className="flex flex-col gap-1.5 rounded-md border border-bg-4 bg-bg-1 p-2">
            <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary truncate" title={verdict.phaseName}>
                    {verdict.phaseName}
                </span>
                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-[11px] tabular-nums text-text-primary/50">
                        {(verdict.compositeScore * 100).toFixed(0)}%
                    </span>
                    <span
                        className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                            verdict.passed
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-amber-500/15 text-amber-400',
                        )}
                    >
                        {verdict.passed ? 'PASS' : 'FAIL'}
                    </span>
                </div>
            </div>
            {verdict.blockedReason && (
                <p className="text-[10px] text-red-400 leading-snug">{verdict.blockedReason}</p>
            )}
            <div className="flex flex-col gap-1 mt-0.5">
                <ScoreBar label="Faithfulness" value={verdict.scores.faithfulness} positive />
                <ScoreBar label="Relevancy" value={verdict.scores.answerRelevancy} positive />
                <ScoreBar label="Tool accuracy" value={verdict.scores.toolCorrectness} positive />
                <ScoreBar label="Hallucination" value={verdict.scores.hallucinationRisk} positive={false} />
            </div>
        </div>
    );
}

function ScoreBar({
    label,
    value,
    positive,
}: {
    readonly label: string;
    readonly value: number;
    readonly positive: boolean;
}) {
    const pct = Math.min(1, Math.max(0, value)) * 100;
    return (
        <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-text-primary/60">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-bg-3 overflow-hidden">
                <div
                    className={cn(
                        'h-full rounded-full',
                        positive ? 'bg-emerald-500' : 'bg-red-500',
                    )}
                    style={{ width: `${pct.toFixed(1)}%` }}
                />
            </div>
            <span className="w-8 text-right font-mono tabular-nums text-text-primary/70">
                {(value * 100).toFixed(0)}%
            </span>
        </div>
    );
}
