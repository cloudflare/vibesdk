/**
 * /benchmark — Public Cost+Speed Benchmark Page (Lever 3, Sprint S2)
 *
 * SCAFFOLD. Backend cron + KV namespace + GET /api/benchmark/latest are TODO in S2.
 * See docs/redesign/BENCHMARK-PAGE-SPEC.md for full spec.
 *
 * Wire-up path when backend lands:
 *  1. Add types to shared/types/benchmark.ts (mirror local interfaces below).
 *  2. Add apiClient.getBenchmarkLatest() + runBenchmark() to src/lib/api-client.ts.
 *  3. Replace the fetch('/api/benchmark/latest') call with apiClient.getBenchmarkLatest().
 *  4. Replace the placeholder POST with apiClient.runBenchmark(promptText).
 *  5. Surface the cost guard from worker/middleware/guardrails/generationGuard.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { apiClient, type BillingStatusData } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Loader2, AlertTriangle, Clock, DollarSign, CheckCircle2, Lock, ExternalLink } from 'lucide-react';

// ── Local types (will move to shared/types/benchmark.ts in S2) ──────────────

interface BenchmarkRun {
    readonly id: string;
    readonly runDate: string;
    readonly timestamp: number;
    readonly product: 'vibesdk' | 'emergent';
    readonly promptId: string;
    readonly promptText: string;
    readonly productName: string;
    readonly wallClockSeconds: number;
    readonly creditsSpent: number;
    readonly creditsUsdEstimate: number;
    readonly deploySuccess: boolean;
    readonly evidenceUrl: string;
    readonly errorNote?: string;
}

interface BenchmarkDailyPair {
    readonly runDate: string;
    readonly promptId: string;
    readonly vibesdk: BenchmarkRun;
    readonly emergent: BenchmarkRun;
    readonly winner: 'vibesdk' | 'emergent' | 'tie';
}

interface BenchmarkLatestResponse {
    readonly updatedAt: number;
    readonly history: readonly BenchmarkDailyPair[];
    readonly aggregate: {
        readonly avgWallClockSeconds: { vibesdk: number; emergent: number };
        readonly avgCreditsUsd: { vibesdk: number; emergent: number };
        readonly deploySuccessRate: { vibesdk: number; emergent: number };
        readonly sampleSize: number;
    };
}

type LoadState =
    | { readonly kind: 'idle' }
    | { readonly kind: 'loading' }
    | { readonly kind: 'error'; readonly message: string }
    | { readonly kind: 'ready'; readonly data: BenchmarkLatestResponse }
    | { readonly kind: 'empty' };

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
    if (s <= 0) return '—';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function fmtUsd(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number): string {
    return `${Math.round(n * 100)}%`;
}

function deltaPct(ours: number, theirs: number): string {
    if (theirs <= 0) return '—';
    const d = ((ours - theirs) / theirs) * 100;
    const sign = d > 0 ? '+' : '';
    return `${sign}${d.toFixed(0)}%`;
}

function fmtDate(iso: string): string {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso));
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [state, setState] = useState<LoadState>({ kind: 'idle' });
    const [billing, setBilling] = useState<BillingStatusData | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const [runSubmitting, setRunSubmitting] = useState(false);
    const [promptText, setPromptText] = useState('');

    // Fetch latest benchmark + (if logged in) billing tier in parallel.
    useEffect(() => {
        let cancelled = false;
        setState({ kind: 'loading' });

        const fetchBenchmark = async (): Promise<BenchmarkLatestResponse | null> => {
            // NOTE: apiClient method does not exist yet (TODO S2).
            // Direct fetch is intentional placeholder — replace w/ apiClient.getBenchmarkLatest().
            try {
                const res = await fetch('/api/benchmark/latest', { headers: { Accept: 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return (await res.json()) as BenchmarkLatestResponse;
            } catch (err) {
                throw err instanceof Error ? err : new Error('Failed to fetch benchmark data');
            }
        };

        const fetchBilling = async (): Promise<void> => {
            if (!user) return;
            try {
                const res = await apiClient.getBillingStatus();
                if (!cancelled && res.success && res.data) setBilling(res.data);
            } catch {
                // billing fetch failure is non-fatal — viewing page is still allowed
            }
        };

        void Promise.allSettled([
            fetchBenchmark()
                .then((data) => {
                    if (cancelled) return;
                    if (!data || data.history.length === 0) {
                        setState({ kind: 'empty' });
                    } else {
                        setState({ kind: 'ready', data });
                    }
                })
                .catch((err: Error) => {
                    if (!cancelled) setState({ kind: 'error', message: err.message });
                }),
            fetchBilling(),
        ]);

        return () => {
            cancelled = true;
        };
    }, [user]);

    const canRunBenchmark = useMemo<'anon' | 'free' | 'allowed'>(() => {
        if (!user) return 'anon';
        if (!billing) return 'free'; // safest default while loading
        return billing.tier === 'free' ? 'free' : 'allowed';
    }, [user, billing]);

    const handleRunClick = useCallback(async () => {
        setRunError(null);
        if (canRunBenchmark === 'anon') {
            navigate('/?auth=signup&next=/benchmark');
            return;
        }
        if (canRunBenchmark === 'free') {
            navigate('/pricing');
            return;
        }
        const trimmed = promptText.trim();
        if (trimmed.length < 8) {
            setRunError('Prompt must be at least 8 characters.');
            return;
        }
        if (trimmed.length > 2000) {
            setRunError('Prompt is too long (max 2000 chars).');
            return;
        }
        try {
            setRunSubmitting(true);
            // NOTE: apiClient.runBenchmark() is TODO S2. Placeholder direct fetch.
            const res = await fetch('/api/benchmark/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ promptText: trimmed }),
            });
            if (!res.ok) {
                if (res.status === 402) {
                    navigate('/pricing');
                    return;
                }
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                throw new Error(body?.error?.message ?? `Run failed (HTTP ${res.status})`);
            }
            // Real impl will stream progress + show evidence links on completion.
            setPromptText('');
        } catch (err) {
            setRunError(err instanceof Error ? err.message : 'Run failed.');
        } finally {
            setRunSubmitting(false);
        }
    }, [canRunBenchmark, promptText, navigate]);

    return (
        <div className="min-h-screen bg-bg-3">
            <div className="mx-auto max-w-6xl px-4 py-16">
                <Header state={state} />

                {state.kind === 'loading' && <LoadingBlock />}
                {state.kind === 'error' && <ErrorBlock message={state.message} />}
                {state.kind === 'empty' && <EmptyBlock />}

                {state.kind === 'ready' && (
                    <>
                        <AggregateCards aggregate={state.data.aggregate} />
                        <HistoryTable history={state.data.history} />
                        <RunYourOwn
                            gate={canRunBenchmark}
                            promptText={promptText}
                            onPromptChange={setPromptText}
                            onSubmit={handleRunClick}
                            submitting={runSubmitting}
                            error={runError}
                        />
                    </>
                )}

                <Methodology />
                <Disclaimer />
            </div>
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Header({ state }: { readonly state: LoadState }): JSX.Element {
    const ts = state.kind === 'ready' ? new Date(state.data.updatedAt * 1000).toUTCString() : null;
    return (
        <header className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-bg-4 bg-bg-2 px-3 py-1 text-xs text-text-primary/70">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                Live · {ts ? `Last run ${ts}` : 'Loading...'}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
                VibeSDK vs Emergent — Real Numbers, Updated Daily
            </h1>
            <p className="mt-4 text-base text-text-primary/70 sm:text-lg">
                Same prompt. Same day. Same Pro accounts on both products. Click-through evidence on every row.
            </p>
        </header>
    );
}

function LoadingBlock(): JSX.Element {
    return (
        <Card className="my-8">
            <CardContent className="flex items-center justify-center gap-3 py-12 text-text-primary/70">
                <Loader2 className="size-4 animate-spin" />
                <span>Loading the latest benchmark run...</span>
            </CardContent>
        </Card>
    );
}

function ErrorBlock({ message }: { readonly message: string }): JSX.Element {
    return (
        <Card className="my-8 border-red-500/30 bg-red-500/5">
            <CardContent className="flex items-start gap-3 py-6 text-sm text-red-300">
                <AlertTriangle className="size-4 shrink-0" />
                <div>
                    <div className="font-semibold">Couldn't load benchmark data</div>
                    <div className="mt-1 text-red-300/80">{message}</div>
                    <div className="mt-2 text-xs text-red-300/60">
                        The daily cron may be running. Retry in a few minutes or check the raw JSON at <code>/api/benchmark/latest?format=raw</code>.
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function EmptyBlock(): JSX.Element {
    return (
        <Card className="my-8">
            <CardContent className="py-12 text-center text-text-primary/70">
                <div className="font-semibold text-text-primary">No benchmark runs yet</div>
                <p className="mt-2 text-sm">The daily cron is set up but hasn't produced its first pair. Check back tomorrow at 03:00 UTC.</p>
            </CardContent>
        </Card>
    );
}

function AggregateCards({ aggregate }: { readonly aggregate: BenchmarkLatestResponse['aggregate'] }): JSX.Element {
    const cards: ReadonlyArray<{
        readonly id: string;
        readonly icon: JSX.Element;
        readonly label: string;
        readonly ours: string;
        readonly theirs: string;
        readonly delta: string;
        readonly foot: string;
    }> = [
        {
            id: 'time',
            icon: <Clock className="size-4" />,
            label: 'Avg wall-clock (7-day)',
            ours: fmtSeconds(aggregate.avgWallClockSeconds.vibesdk),
            theirs: fmtSeconds(aggregate.avgWallClockSeconds.emergent),
            delta: deltaPct(aggregate.avgWallClockSeconds.vibesdk, aggregate.avgWallClockSeconds.emergent),
            foot: 'Prompt-submit → preview-ready URL',
        },
        {
            id: 'cost',
            icon: <DollarSign className="size-4" />,
            label: 'Avg cost / run (USD est.)',
            ours: fmtUsd(aggregate.avgCreditsUsd.vibesdk),
            theirs: fmtUsd(aggregate.avgCreditsUsd.emergent),
            delta: deltaPct(aggregate.avgCreditsUsd.vibesdk, aggregate.avgCreditsUsd.emergent),
            foot: "Normalised from each product's published pricing",
        },
        {
            id: 'success',
            icon: <CheckCircle2 className="size-4" />,
            label: 'Deploy success rate',
            ours: fmtPct(aggregate.deploySuccessRate.vibesdk),
            theirs: fmtPct(aggregate.deploySuccessRate.emergent),
            delta: `${aggregate.deploySuccessRate.vibesdk >= aggregate.deploySuccessRate.emergent ? '+' : ''}${Math.round((aggregate.deploySuccessRate.vibesdk - aggregate.deploySuccessRate.emergent) * 100)}pp`,
            foot: `Working preview, no human fix · n=${aggregate.sampleSize}`,
        },
    ];

    return (
        <div className="my-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => {
                const isWin = c.delta.startsWith('-') || c.delta.startsWith('+') === false ? c.delta.startsWith('-') : !c.delta.startsWith('-0');
                return (
                    <Card key={c.id}>
                        <CardContent className="p-6">
                            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-text-primary/60">
                                {c.icon}
                                <span>{c.label}</span>
                            </div>
                            <div className="flex flex-wrap items-baseline gap-3">
                                <span className={cn('font-mono text-3xl font-bold tracking-tight', 'text-emerald-400')}>{c.ours}</span>
                                <span className="text-xs text-text-primary/40">vs</span>
                                <span className="font-mono text-base text-text-primary/50 line-through">{c.theirs}</span>
                                <span
                                    className={cn(
                                        'inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold',
                                        isWin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
                                    )}
                                >
                                    {c.delta}
                                </span>
                            </div>
                            <div className="mt-3 text-xs text-text-primary/50">{c.foot}</div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

function HistoryTable({ history }: { readonly history: readonly BenchmarkDailyPair[] }): JSX.Element {
    return (
        <section className="my-10">
            <h2 className="mb-2 text-xl font-semibold tracking-tight">Last {history.length} daily runs</h2>
            <p className="mb-5 text-sm text-text-primary/60">
                Each row is a real cron run on accounts we pay for. Click any session link to verify.
            </p>
            <div className="overflow-hidden rounded-2xl border border-bg-4 bg-bg-2">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-bg-4 bg-bg-3 text-left text-[11px] uppercase tracking-wider text-text-primary/60">
                                <th className="px-4 py-3 font-medium">Date</th>
                                <th className="px-4 py-3 font-medium">Prompt</th>
                                <th className="px-4 py-3 font-medium">VibeSDK</th>
                                <th className="px-4 py-3 font-medium">Emergent</th>
                                <th className="px-4 py-3 font-medium">Winner</th>
                                <th className="px-4 py-3 font-medium">Evidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((pair) => (
                                <tr key={`${pair.runDate}-${pair.promptId}`} className="border-b border-bg-4/60 last:border-0 hover:bg-bg-3/50">
                                    <td className="px-4 py-3 font-mono text-xs text-text-primary">{fmtDate(pair.runDate)}</td>
                                    <td className="px-4 py-3">
                                        <div className="text-text-primary">{pair.vibesdk.promptText}</div>
                                        <div className="font-mono text-[11px] text-text-primary/40">{pair.promptId}</div>
                                    </td>
                                    <td className="bg-orange-500/5 px-4 py-3">
                                        <Metrics run={pair.vibesdk} />
                                    </td>
                                    <td className="bg-indigo-500/5 px-4 py-3">
                                        <Metrics run={pair.emergent} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <WinnerBadge winner={pair.winner} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <EvidenceLink url={pair.vibesdk.evidenceUrl} label="VibeSDK" />
                                            <EvidenceLink url={pair.emergent.evidenceUrl} label="Emergent" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

function Metrics({ run }: { readonly run: BenchmarkRun }): JSX.Element {
    if (!run.deploySuccess) {
        return (
            <div className="font-mono text-xs">
                <div className="font-semibold text-red-400">FAIL</div>
                <div className="text-text-primary/50">{run.errorNote ?? 'no deployable output'}</div>
            </div>
        );
    }
    return (
        <div className="font-mono text-xs">
            <div className="text-sm font-semibold text-text-primary">{fmtSeconds(run.wallClockSeconds)}</div>
            <div className="text-text-primary/60">
                ~{run.creditsSpent} cr · {fmtUsd(run.creditsUsdEstimate)}
            </div>
        </div>
    );
}

function WinnerBadge({ winner }: { readonly winner: 'vibesdk' | 'emergent' | 'tie' }): JSX.Element {
    const styles: Record<typeof winner, string> = {
        vibesdk: 'bg-orange-500/15 text-orange-400',
        emergent: 'bg-indigo-500/15 text-indigo-400',
        tie: 'bg-bg-4 text-text-primary/60',
    };
    const label: Record<typeof winner, string> = {
        vibesdk: '✓ VibeSDK',
        emergent: '✓ Emergent',
        tie: '= Tie',
    };
    return <span className={cn('inline-flex items-center rounded-md px-2 py-1 font-mono text-[11px] font-semibold', styles[winner])}>{label[winner]}</span>;
}

function EvidenceLink({ url, label }: { readonly url: string; readonly label: string }): JSX.Element | null {
    if (!url) return null;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-bg-4 bg-bg-3 px-2 py-1 font-mono text-[11px] text-text-primary/70 transition-colors hover:border-bg-4 hover:text-text-primary"
            title={`Open ${label} session in new tab`}
        >
            <ExternalLink className="size-3" />
            {label.slice(0, 1).toLowerCase()}
        </a>
    );
}

function RunYourOwn({
    gate,
    promptText,
    onPromptChange,
    onSubmit,
    submitting,
    error,
}: {
    readonly gate: 'anon' | 'free' | 'allowed';
    readonly promptText: string;
    readonly onPromptChange: (value: string) => void;
    readonly onSubmit: () => void;
    readonly submitting: boolean;
    readonly error: string | null;
}): JSX.Element {
    const isLocked = gate !== 'allowed';

    return (
        <section className="my-12">
            <h2 className="mb-2 text-xl font-semibold tracking-tight">Run your own prompt against both products</h2>
            <p className="mb-5 text-sm text-text-primary/60">
                Pro+ accounts only — Emergent calls aren't free for us either. 3 runs/day on Pro, 10/day on Team.
            </p>
            <Card>
                <CardContent className="p-6">
                    {isLocked && (
                        <div className="mb-5 flex items-center justify-between gap-4 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm">
                            <div className="flex items-center gap-2 text-text-primary">
                                <Lock className="size-4 text-accent" />
                                {gate === 'anon'
                                    ? 'Sign in to run your own benchmark.'
                                    : 'Upgrade to Pro to run your own benchmark. Free accounts can view daily results.'}
                            </div>
                            <Button onClick={onSubmit} className="bg-accent text-black hover:bg-accent/90">
                                {gate === 'anon' ? 'Sign in →' : 'View Pro plans →'}
                            </Button>
                        </div>
                    )}

                    <textarea
                        className="w-full min-h-[96px] resize-y rounded-md border border-bg-4 bg-bg-3 p-3 font-mono text-sm text-text-primary placeholder:text-text-primary/40 focus:border-accent focus:outline-none disabled:opacity-50"
                        placeholder="build a real-time chat app w/ rooms and presence"
                        value={promptText}
                        onChange={(e) => onPromptChange(e.target.value)}
                        disabled={isLocked || submitting}
                        maxLength={2000}
                        aria-label="Benchmark prompt"
                    />
                    {error && (
                        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                            {error}
                        </div>
                    )}
                    <div className="mt-4 flex items-center justify-between text-xs text-text-primary/50">
                        <span>{promptText.length}/2000 chars · 3 runs/day on Pro</span>
                        <Button onClick={onSubmit} disabled={isLocked || submitting} className="bg-accent text-black hover:bg-accent/90">
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 size-3 animate-spin" />
                                    Running on both…
                                </>
                            ) : (
                                'Run on both →'
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}

function Methodology(): JSX.Element {
    const items: ReadonlyArray<{ readonly num: string; readonly title: string; readonly body: string }> = [
        {
            num: '01',
            title: 'Same prompts, fixed rotation',
            body: 'Five prompts rotate one per day. The full list lives in our public repo (benchmark-prompts.json) and is never edited mid-cycle without a changelog entry.',
        },
        {
            num: '02',
            title: 'We pay both bills',
            body: "Both products run on Pro accounts purchased with VibeSDK's own credit card. No insider tier, no comped credits.",
        },
        {
            num: '03',
            title: 'Wall-clock = preview-ready',
            body: 'Timer starts on POST submit. Stops when the product emits a working preview URL we can open in a fresh browser.',
        },
        {
            num: '04',
            title: 'Cost normalised to USD',
            body: "Each product's credit currency converted using its latest published pricing. Raw credits shown so you can do your own math.",
        },
        {
            num: '05',
            title: 'Failures are recorded',
            body: "If Emergent times out, we record the failure rather than retrying until it works. Same rule applies to us.",
        },
        {
            num: '06',
            title: 'Open-source the script',
            body: 'The cron runner is in our public repo at worker/cron/benchmarkRunner.ts. Fork it, run it yourself, prove us wrong.',
        },
    ];

    return (
        <section className="my-12">
            <h2 className="mb-2 text-xl font-semibold tracking-tight">Methodology</h2>
            <p className="mb-5 text-sm text-text-primary/60">No tricks. No insider access. Just the numbers.</p>
            <div className="grid gap-4 sm:grid-cols-2">
                {items.map((m) => (
                    <Card key={m.num}>
                        <CardContent className="p-5">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                                <span className="font-mono text-xs text-accent">{m.num}</span>
                                <span>{m.title}</span>
                            </div>
                            <p className="text-sm leading-relaxed text-text-primary/70">{m.body}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}

function Disclaimer(): JSX.Element {
    return (
        <footer className="my-12 rounded-md border border-bg-4 bg-bg-2 p-5 text-xs leading-relaxed text-text-primary/50">
            <strong className="text-text-primary/70">Disclaimer.</strong> VibeSDK and Emergent are independent products. This comparison is conducted with publicly-purchased Pro accounts on both. All prompts and session URLs shown are produced by automated cron runs paid for by VibeSDK Inc. We do not modify, prompt-engineer for, or sandbag the Emergent runs. Emergent is a trademark of its respective owner; we use the name nominatively for fair comparison. Raw data:{' '}
            <a className="text-accent underline" href="/api/benchmark/latest?format=raw">
                /api/benchmark/latest?format=raw
            </a>
            . Cron source:{' '}
            <a className="text-accent underline" href="https://github.com/cloudflare/vibesdk/tree/main/worker/cron" target="_blank" rel="noopener noreferrer">
                worker/cron/benchmarkRunner.ts
            </a>
            .
        </footer>
    );
}
