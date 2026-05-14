import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';

type Cycle = 'monthly' | 'annual';
type PaidTier = 'pro' | 'team';

interface TierDef {
    readonly id: 'free' | PaidTier | 'enterprise';
    readonly name: string;
    readonly priceMonthlyINR: number;   // paise-free display value in ₹
    readonly priceAnnualINR: number;
    readonly tagline: string;
    readonly cta: string;
    readonly highlighted?: boolean;
    readonly features: readonly string[];
}

const TIERS: readonly TierDef[] = [
    {
        id: 'free',
        name: 'Free',
        priceMonthlyINR: 0,
        priceAnnualINR: 0,
        tagline: 'Try every core feature. Hobby-scale only.',
        cta: 'Get started',
        features: [
            '5 app generations / month',
            '1 agent (serial execution)',
            'Haiku + Sonnet models',
            'Hosted preview only',
            'GitHub export',
            'Community support',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        priceMonthlyINR: 1699,
        priceAnnualINR: 16_990,
        tagline: 'For solo builders shipping real apps.',
        cta: 'Start Pro',
        highlighted: true,
        features: [
            '100 generations / month',
            '4 parallel Coder agents',
            'Critic agent (plan red-team)',
            'Custom domain deploy',
            'BYO keys (all providers)',
            'Email support',
        ],
    },
    {
        id: 'team',
        name: 'Team',
        priceMonthlyINR: 4999,
        priceAnnualINR: 49_990,
        tagline: 'Shared workspaces for design + eng teams.',
        cta: 'Start Team',
        features: [
            '500 generations / seat',
            '4 parallel agents + Opus option',
            'Team workspaces & SSO-lite',
            'Shared templates library',
            'Usage analytics dashboard',
            'Priority support',
        ],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        priceMonthlyINR: 0,
        priceAnnualINR: 0,
        tagline: 'Self-hosted or private-tenant. SSO, audit, SLA.',
        cta: 'Talk to sales',
        features: [
            'Unlimited seats (token-capped)',
            '8 parallel agents, Opus default',
            'SAML SSO + audit log',
            'Private model endpoint',
            '99.9% uptime SLA',
            'Dedicated Slack channel',
        ],
    },
];

// ── Competitive comparison (DEC-031-E) ────────────────────────────────────

interface ComparisonRow {
    readonly feature: string;
    readonly note?: string;
    /** true = has it, false = missing, string = nuanced */
    readonly freeTools: boolean | string;
    readonly vibesdk: boolean | string;
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
    {
        feature: 'Per-session isolation',
        note: 'Private SQLite per session; no shared infrastructure',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Eval gate',
        note: 'Faithfulness + relevancy + tool correctness + hallucination risk',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Parallel multi-agent',
        note: 'Planner + Coder + Tester + Critic running simultaneously',
        freeTools: false,
        vibesdk: 'Pro+',
    },
    {
        feature: 'DESIGN.md injection',
        note: 'Brand tokens and component rules injected into every phase',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Agentic engineering (multi-phase)',
        note: 'Structured plan → implement → eval per feature phase',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Git history',
        note: 'Full commit log via isomorphic-git; clone-able',
        freeTools: 'Basic',
        vibesdk: true,
    },
    {
        feature: 'MCP server',
        note: 'Expose session status / quality / app description as AI tools',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Context usage breakdown',
        note: 'Tokens per phase, judge tokens, effort estimate',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Cloudflare Workers deploy',
        note: 'One-click deploy to global edge; custom domain on Pro',
        freeTools: false,
        vibesdk: true,
    },
    {
        feature: 'Price',
        freeTools: 'Free forever',
        vibesdk: 'Free tier + paid',
    },
];

function fmtINR(n: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

declare global {
    interface Window {
        Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (...args: unknown[]) => void) => void };
    }
}

async function loadRazorpayCheckout(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (window.Razorpay) return true;
    return new Promise<boolean>((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
}

export default function PricingPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [cycle, setCycle] = useState<Cycle>('monthly');
    const [loadingTier, setLoadingTier] = useState<PaidTier | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSelect = async (tier: TierDef) => {
        setError(null);
        if (tier.id === 'free') {
            if (!user) navigate('/?auth=signup');
            else navigate('/');
            return;
        }
        if (tier.id === 'enterprise') {
            window.location.href = 'mailto:sales@vibesdk.app?subject=Enterprise%20inquiry';
            return;
        }
        if (!user) {
            navigate('/?auth=signup&next=/pricing');
            return;
        }
        try {
            setLoadingTier(tier.id);
            const scriptOk = await loadRazorpayCheckout();
            if (!scriptOk) throw new Error('Failed to load Razorpay Checkout.');

            const result = await apiClient.createSubscription({ tier: tier.id, cycle });
            if (!result.success || !result.data) throw new Error(result.error?.message ?? 'Could not start checkout.');

            // Option A: redirect to Razorpay-hosted authorize page (simpler, works everywhere)
            window.location.href = result.data.shortUrl;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Checkout failed.');
        } finally {
            setLoadingTier(null);
        }
    };

    return (
        <div className="min-h-screen bg-bg-3">
            <div className="mx-auto max-w-6xl px-4 py-16">
                <header className="mb-10 text-center">
                    <div className="mb-3 text-sm font-medium uppercase tracking-wider text-accent">Pricing</div>
                    <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">Start free. Scale when you ship.</h1>
                    <p className="mt-4 text-base text-text-primary/70 sm:text-lg">Simple tiers. Honest limits. Cancel any time.</p>
                    <p className="mt-2 text-sm text-text-primary/50">
                        First AI agentic engineering platform priced for India.{' '}
                        <span className="text-accent font-medium">₹1,699/mo</span>
                        {' '}vs ₹2,100+ for global alternatives.
                    </p>

                    <div className="mt-8 inline-flex rounded-full border border-bg-4 bg-bg-2 p-1">
                        <CycleButton active={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</CycleButton>
                        <CycleButton active={cycle === 'annual'} onClick={() => setCycle('annual')}>
                            Annual <span className="ml-1 text-[10px] font-semibold text-accent">SAVE ~17%</span>
                        </CycleButton>
                    </div>
                </header>

                {error && (
                    <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400" role="alert">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {TIERS.map((t) => {
                        const price = t.id === 'enterprise' ? null : cycle === 'monthly' ? t.priceMonthlyINR : t.priceAnnualINR;
                        return (
                            <div
                                key={t.id}
                                className={cn(
                                    'relative flex flex-col rounded-2xl border bg-bg-2 p-6 transition-colors',
                                    t.highlighted
                                        ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]'
                                        : 'border-bg-4 hover:border-bg-4',
                                )}
                            >
                                {t.highlighted && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-black">
                                        Most popular
                                    </div>
                                )}

                                <div className="mb-2 text-sm font-medium text-text-primary/70">{t.name}</div>
                                <div className="mb-1 flex items-baseline gap-1">
                                    {price === null ? (
                                        <span className="text-3xl font-bold tracking-tight">Custom</span>
                                    ) : (
                                        <>
                                            <span className="text-4xl font-bold tracking-tight">{fmtINR(price)}</span>
                                            {price > 0 && (
                                                <span className="text-sm text-text-primary/60">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>
                                            )}
                                        </>
                                    )}
                                </div>
                                <p className="mb-5 min-h-[36px] text-xs text-text-primary/60">{t.tagline}</p>

                                <Button
                                    variant={t.highlighted ? 'default' : 'outline'}
                                    className={cn('mb-5 w-full', t.highlighted && 'bg-accent text-black hover:bg-accent/90')}
                                    onClick={() => handleSelect(t)}
                                    disabled={loadingTier !== null && loadingTier !== t.id}
                                >
                                    {loadingTier === t.id ? 'Redirecting…' : t.cta}
                                </Button>

                                <ul className="flex flex-1 flex-col gap-2 text-sm text-text-primary/80">
                                    {t.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2">
                                            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>

                {/* Competitive comparison table — vibesdk vs free tools (DEC-031-E) */}
                <div className="mt-16" data-testid="competitive-comparison-table">
                    <h2 className="mb-1 text-center text-lg font-semibold text-text-primary">
                        vibesdk vs free AI coding tools
                    </h2>
                    <p className="mb-8 text-center text-sm text-text-primary/60">
                        Free tools generate apps. vibesdk generates architectures.
                    </p>
                    <div className="overflow-x-auto rounded-2xl border border-bg-4">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-bg-4 bg-bg-2">
                                    <th className="px-5 py-3.5 text-left font-semibold text-text-primary/70">Feature</th>
                                    <th className="px-5 py-3.5 text-center font-semibold text-text-primary/50">Free tools<br /><span className="text-[10px] font-normal text-text-primary/40">(NxCode, Bolt free tier, etc.)</span></th>
                                    <th className="px-5 py-3.5 text-center font-semibold text-accent">vibesdk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON_ROWS.map((row, i) => (
                                    <tr
                                        key={row.feature}
                                        className={cn(
                                            'border-b border-bg-4/60 last:border-0',
                                            i % 2 === 0 ? 'bg-bg-3/40' : 'bg-bg-2',
                                        )}
                                    >
                                        <td className="px-5 py-3">
                                            <div className="font-medium text-text-primary">{row.feature}</div>
                                            {row.note && <div className="mt-0.5 text-[11px] text-text-primary/50">{row.note}</div>}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            {row.freeTools === true ? (
                                                <Check className="mx-auto size-4 text-emerald-500" />
                                            ) : row.freeTools === false ? (
                                                <X className="mx-auto size-4 text-text-primary/30" />
                                            ) : (
                                                <span className="text-xs text-text-primary/50">{row.freeTools}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            {row.vibesdk === true ? (
                                                <Check className="mx-auto size-4 text-emerald-500" />
                                            ) : row.vibesdk === false ? (
                                                <X className="mx-auto size-4 text-text-primary/30" />
                                            ) : (
                                                <span className="text-xs font-medium text-accent">{row.vibesdk}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="mt-10 text-center text-xs text-text-primary/50">
                    Prices in INR · GST included for India · International billing on Enterprise
                </p>
            </div>
        </div>
    );
}

function CycleButton({ active, onClick, children }: { readonly active: boolean; readonly onClick: () => void; readonly children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-bg-4 text-text-primary' : 'text-text-primary/60 hover:text-text-primary',
            )}
        >
            {children}
        </button>
    );
}
