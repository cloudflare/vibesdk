import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { apiClient, type BillingStatusData } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

const TIER_LABEL: Record<BillingStatusData['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
    team: 'Team',
    enterprise: 'Enterprise',
};

function fmtDate(unixSec: number | null): string {
    if (!unixSec) return '—';
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(unixSec * 1000));
}

export default function BillingPage() {
    const [status, setStatus] = useState<BillingStatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.getBillingStatus();
            if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Failed to load billing');
            setStatus(res.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load billing');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleCancel = useCallback(async () => {
        if (!confirm('Cancel your subscription at the end of the current billing period?')) return;
        setCancelling(true);
        setError(null);
        try {
            const res = await apiClient.cancelSubscription();
            if (!res.success) throw new Error(res.error?.message ?? 'Cancel failed');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Cancel failed');
        } finally {
            setCancelling(false);
        }
    }, [load]);

    if (loading) {
        return <PageShell><LoadingCard /></PageShell>;
    }

    if (error) {
        return (
            <PageShell>
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    {error}
                </div>
                <Button onClick={() => void load()} variant="outline" className="mt-4">Retry</Button>
            </PageShell>
        );
    }

    if (!status) return null;

    const used = status.generationsUsedThisPeriod;
    const limit = status.generationsLimit;
    const pct = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
    const hasSubscription = status.razorpaySubscriptionId !== null;
    const onPaidTier = status.tier === 'pro' || status.tier === 'team';

    return (
        <PageShell>
            <header className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-text-primary">Billing</h1>
                <p className="mt-1 text-sm text-text-primary/60">Manage your plan, usage, and billing details.</p>
            </header>

            {/* Current plan card */}
            <section className="mb-6 rounded-xl border border-bg-4 bg-bg-2 p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-text-primary/50">Current plan</div>
                        <div className="mt-1 flex items-center gap-3">
                            <span className="text-2xl font-bold text-text-primary">{TIER_LABEL[status.tier]}</span>
                            <span className={cn(
                                'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                status.active
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                    : 'border-amber-500/40 bg-amber-500/10 text-amber-400',
                            )}>
                                {status.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <div className="mt-1 text-xs text-text-primary/60">
                            Billed {status.billingCycle} · Renews {fmtDate(status.periodEndsAt)}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {status.tier !== 'enterprise' && (
                            <Button onClick={() => navigate('/pricing')}>
                                {status.tier === 'free' ? 'Upgrade' : 'Change plan'}
                            </Button>
                        )}
                        {hasSubscription && onPaidTier && status.active && (
                            <Button variant="ghost" onClick={handleCancel} disabled={cancelling} className="text-red-400 hover:text-red-400">
                                {cancelling ? <Loader2 className="size-4 animate-spin" /> : 'Cancel subscription'}
                            </Button>
                        )}
                    </div>
                </div>
            </section>

            {/* Usage card */}
            <section className="mb-6 rounded-xl border border-bg-4 bg-bg-2 p-6">
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-text-primary/50">Generations this period</div>
                        <div className="mt-1 text-lg font-semibold text-text-primary">{used} / {limit === Number.MAX_SAFE_INTEGER ? '∞' : limit}</div>
                    </div>
                    {pct >= 80 && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                            <AlertTriangle className="size-3.5" /> {pct}% used
                        </div>
                    )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-3">
                    <div
                        className={cn(
                            'h-full rounded-full transition-[width] duration-500',
                            pct < 80 ? 'bg-accent' : pct < 100 ? 'bg-amber-500' : 'bg-red-500',
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className="mt-2 text-xs text-text-primary/60">Resets on {fmtDate(status.periodEndsAt)}</div>
            </section>

            {/* Feature entitlements */}
            <section className="mb-6 rounded-xl border border-bg-4 bg-bg-2 p-6">
                <div className="mb-4 text-xs font-medium uppercase tracking-wider text-text-primary/50">Your plan includes</div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FeatureRow label={`Up to ${status.features.maxParallelAgents} parallel Coder agent${status.features.maxParallelAgents > 1 ? 's' : ''}`} on />
                    <FeatureRow label="Plan critique (Critic agent)" on={status.features.criticEnabled} />
                    <FeatureRow label="Custom domain deploy" on={status.features.customDomainDeploy} />
                    <FeatureRow label="Team workspaces" on={status.features.teamWorkspaces} />
                    <FeatureRow label="SAML SSO" on={status.features.ssoEnabled} />
                    <FeatureRow label={`Support: ${status.features.supportSla}`} on />
                </ul>
            </section>

            {hasSubscription && (
                <section className="rounded-xl border border-bg-4 bg-bg-2 p-6 text-sm">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-primary/50">Razorpay subscription</div>
                    <div className="flex items-center gap-2">
                        <code className="rounded bg-bg-3 px-2 py-1 font-mono text-xs text-text-primary/80">{status.razorpaySubscriptionId}</code>
                        <a
                            href={`https://dashboard.razorpay.com/app/subscriptions/${status.razorpaySubscriptionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-text-primary/60 hover:text-text-primary"
                        >
                            View <ExternalLink className="size-3" />
                        </a>
                    </div>
                </section>
            )}
        </PageShell>
    );
}

function FeatureRow({ label, on }: { readonly label: string; readonly on: boolean }) {
    return (
        <li className={cn('flex items-center gap-2 text-sm', on ? 'text-text-primary/85' : 'text-text-primary/35 line-through')}>
            <CheckCircle2 className={cn('size-4 shrink-0', on ? 'text-emerald-500' : 'text-text-primary/30')} />
            <span>{label}</span>
        </li>
    );
}

function LoadingCard() {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-bg-4 bg-bg-2 p-6 text-sm text-text-primary/70">
            <Loader2 className="size-4 animate-spin" /> Loading billing details…
        </div>
    );
}

function PageShell({ children }: { readonly children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-bg-3">
            <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
        </div>
    );
}
