/**
 * /blog/built-to-last — "Built to Last: Why Structural Architecture Wins the Vibe Coding Era"
 *
 * TRIGGER-GATED: Do not publish until Lovable announces Series C (est. Q3 2026 at ~$1B ARR).
 * DEC-053-B: Drafted S15 per research loop instruction.
 * DEC-057-C: Series C announcement expected Q3 2026; this post is the marketing activation.
 *
 * Publishing checklist (activate when Series C announced):
 *   1. Remove TRIGGER_GATED comment from this header
 *   2. Add route to src/routes.ts (or router config)
 *   3. Update blog index if exists
 *   4. Submit to sitemap
 *   5. Post thread: "Lovable just raised Series [C] at $[X]B. Here's why we're not surprised..."
 *
 * SEO targets:
 *   lovable series c, ai app builder funding, vibe coding platform architecture,
 *   cloudflare durable objects ai, india developer tools, vibesdk vs lovable
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router';
import {
    Shield,
    Globe,
    Layers,
    TrendingUp,
    ArrowRight,
    CheckCircle2,
} from 'lucide-react';

// ── Animation helpers ─────────────────────────────────────────────────────────

const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
};

// ── Data ──────────────────────────────────────────────────────────────────────

interface PillarCard {
    icon: React.ElementType;
    heading: string;
    body: string;
    proof: string;
}

const PILLARS: PillarCard[] = [
    {
        icon: Shield,
        heading: 'Structural security, not scanning',
        body: 'Every session runs in its own Cloudflare Durable Object — a physically isolated unit of compute and storage. There is no shared object graph to scan. The class of vulnerabilities that exposed 76 days of Lovable user data cannot be expressed in vibesdk\'s architecture.',
        proof: 'DO-per-session isolation → BOLA class structurally impossible',
    },
    {
        icon: Globe,
        heading: 'India-first pricing from day one',
        body: 'vibesdk launched with ₹1,699/month flat pricing through Razorpay — the first AI agentic engineering platform priced for Indian developers. No per-credit surprises, no USD conversion math. Structural India-first positioning takes US competitors 4–8 weeks to replicate, if they try.',
        proof: '₹1,699/mo + Razorpay UPI + GST-inclusive = structural India moat',
    },
    {
        icon: Layers,
        heading: 'Cloudflare-native stack, not Vercel',
        body: 'vibesdk runs on Cloudflare Workers + Durable Objects + D1. Every generated app deploys to the same global edge network. No cold starts, no vendor lock to Next.js. The infrastructure primitives are the product — not a layer above them.',
        proof: 'CF Workers + DO + D1 → 43× cheaper than GCP, zero cold starts',
    },
    {
        icon: TrendingUp,
        heading: 'Eval gate and agent memory from sprint 4',
        body: 'Multi-agent code generation with a DeepEval quality gate has been live since early sprints. Mem0 REST persistent memory is wired to every phase. The quality floor is structural — every generated app goes through a 4-metric eval before shipping to the user.',
        proof: 'DeepEval TS-port (4 metrics) + Mem0 REST memory = shipped S4/S9',
    },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuiltToLastPage() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
            <div className="max-w-2xl mx-auto px-4 py-16 sm:py-24">

                {/* Hero */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate="visible"
                    className="mb-14"
                >
                    <motion.div variants={fadeUp} className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                            Architecture
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                            {/* Update date on publish */}
                            2026
                        </span>
                    </motion.div>

                    <motion.h1
                        variants={fadeUp}
                        className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-tight"
                    >
                        Built to last.
                    </motion.h1>

                    <motion.p
                        variants={fadeUp}
                        className="mt-5 text-base text-gray-500 dark:text-gray-400 leading-relaxed"
                    >
                        Vibe coding is now a{' '}
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                            category
                        </span>
                        . Lovable just raised at a multi-billion-dollar valuation. Cursor is being acquired
                        for $60B. The market has decided AI-assisted app development is real.
                    </motion.p>

                    <motion.p
                        variants={fadeUp}
                        className="mt-4 text-base text-gray-500 dark:text-gray-400 leading-relaxed"
                    >
                        That validation changes nothing about why we built vibesdk the way we did.
                        Every architectural decision — Cloudflare Durable Objects, India-first pricing,
                        structural security isolation — was made to be defensible over years, not quarters.
                        Here's what that means in practice.
                    </motion.p>
                </motion.div>

                {/* Pillars */}
                <motion.section
                    className="mb-14"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <div className="space-y-8">
                        {PILLARS.map((pillar) => {
                            const Icon = pillar.icon;
                            return (
                                <motion.div
                                    key={pillar.heading}
                                    variants={fadeUp}
                                    className="flex flex-col gap-3"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex items-center justify-center size-7 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                                            <Icon className="size-3.5" />
                                        </div>
                                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                            {pillar.heading}
                                        </h2>
                                    </div>

                                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pl-[36px]">
                                        {pillar.body}
                                    </p>

                                    <div className="flex items-center gap-1.5 pl-[36px]">
                                        <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                                        <span className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">
                                            {pillar.proof}
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.section>

                {/* Honest context */}
                <motion.section
                    className="mb-14"
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                >
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                        What we are not
                    </h2>

                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                        We are not the fastest to ship every feature. Lovable has mobile apps. Cursor has
                        enterprise Teams. Bolt has Azure partnerships. We watched each of those launches
                        and made a deliberate choice not to follow every competitive motion.
                    </p>

                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                        What we chose instead: build the architecture that makes the <em>next</em> 5 years
                        defensible. Per-DO isolation means security at the storage layer, not the API layer.
                        India-first pricing means a moat no US competitor can replicate in days. CF
                        Workers-native means the entire platform runs on the same global edge your generated
                        apps will run on.
                    </p>

                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        We are vibesdk. We are the AI agentic engineering platform that was built to last —
                        not to win the press cycle.
                    </p>
                </motion.section>

                {/* Competitive context table */}
                <motion.section
                    className="mb-14"
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                >
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-5">
                        Where we chose differently
                    </h2>

                    <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-black/[0.06] dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.02]">
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Dimension</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Industry trend</th>
                                    <th className="text-left px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-500">vibesdk choice</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    {
                                        dim: 'Security',
                                        trend: 'Add scanning (Wiz, Cursor Security Review)',
                                        choice: 'Structural DO isolation — class cannot exist',
                                    },
                                    {
                                        dim: 'Pricing geography',
                                        trend: 'USD-global (Lovable $25/mo, Bolt credits)',
                                        choice: '₹1,699/mo India-first + Razorpay UPI',
                                    },
                                    {
                                        dim: 'Infrastructure',
                                        trend: 'Vercel / Next.js (v0, Cursor DevEnv)',
                                        choice: 'Cloudflare Workers + DO (CF-native)',
                                    },
                                    {
                                        dim: 'Code quality',
                                        trend: 'LLM output only (no eval gate)',
                                        choice: 'DeepEval 4-metric gate on every generation',
                                    },
                                    {
                                        dim: 'Agent memory',
                                        trend: 'No cross-session memory',
                                        choice: 'Mem0 REST persistent memory per user',
                                    },
                                    {
                                        dim: 'Enterprise vs indie',
                                        trend: 'Cursor + Bolt → B2B/enterprise pivot',
                                        choice: 'India indie developer / SMB — uncontested',
                                    },
                                ].map((row, i) => (
                                    <tr
                                        key={row.dim}
                                        className={`border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 ${
                                            i % 2 === 0 ? '' : 'bg-gray-50/40 dark:bg-white/[0.01]'
                                        }`}
                                    >
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{row.dim}</td>
                                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{row.trend}</td>
                                        <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium">{row.choice}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.section>

                {/* CTA */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 pt-8 border-t border-black/[0.06] dark:border-white/[0.07]"
                >
                    <div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Build something that lasts.
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Start on vibesdk — ₹1,699/mo flat, no per-credit surprises.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            to="/security"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                        >
                            Security architecture
                            <ArrowRight className="size-3" />
                        </Link>
                        <Link
                            to="/pricing"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                        >
                            Get started
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
