/**
 * /security — Architecture trust landing page.
 *
 * Counter-narrative to Lovable+Wiz "scan-based security":
 * vibesdk's Durable Object per-session isolation is structural —
 * no scanner needed because there is no shared object graph to exploit.
 *
 * DEC-036-B: Sprint 3 P1 — static, no backend calls required.
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router';
import {
    Shield,
    Lock,
    Database,
    GitBranch,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    ArrowRight,
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

interface IsolationFact {
    icon: React.ElementType;
    heading: string;
    detail: string;
}

const ISOLATION_FACTS: IsolationFact[] = [
    {
        icon: Database,
        heading: 'Per-session SQLite',
        detail:
            'Every session lives in its own isolated SQLite database inside a Cloudflare Durable Object. No two sessions share a database — there is no shared object graph to traverse.',
    },
    {
        icon: Lock,
        heading: 'DO ID as authorization boundary',
        detail:
            'The Durable Object is addressed by a session-unique ID. Cloudflare\'s routing layer enforces access opaquely — enumerating or guessing other sessions\' IDs is indistinguishable from hitting a non-existent resource.',
    },
    {
        icon: GitBranch,
        heading: 'Git history inside the DO',
        detail:
            'isomorphic-git runs on a SQLite filesystem adapter entirely within the session\'s DO. No git state leaks outside the isolation boundary.',
    },
    {
        icon: Shield,
        heading: 'Agent memory is user-scoped',
        detail:
            'Memory operations are keyed by userId derived from the authenticated session context — not from a request parameter. Cross-user memory access has no API surface.',
    },
];

interface ComparisonRow {
    dimension: string;
    lovable: string;
    vibesdk: string;
    lovableOk: boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
    {
        dimension: 'Data storage',
        lovable: 'Shared server + Supabase project graph',
        vibesdk: 'Per-DO SQLite (no sharing)',
        lovableOk: false,
    },
    {
        dimension: 'Public project model',
        lovable: 'Public visibility option existed',
        vibesdk: 'No public project model',
        lovableOk: false,
    },
    {
        dimension: 'Authorization layer',
        lovable: 'API-layer only — bypass exposes all objects',
        vibesdk: 'Storage-layer structural isolation',
        lovableOk: false,
    },
    {
        dimension: 'Blast radius of bypass',
        lovable: 'All users\' projects exposed',
        vibesdk: 'Single session (attacker\'s own DO)',
        lovableOk: false,
    },
    {
        dimension: 'Attack surface needed',
        lovable: 'Valid free-tier token + 5 API calls',
        vibesdk: 'Physical CF infra access required',
        lovableOk: false,
    },
    {
        dimension: 'Security approach',
        lovable: 'Post-incident Wiz scanner + Cursor Security Review (scanning) — finds problems after code is written',
        vibesdk: 'Structural isolation — the vulnerability class cannot exist (Cloudflare SOC 2 Type II)',
        lovableOk: false,
    },
];

interface ScopeRow {
    resource: string;
    isolatedPer: string;
    sharedAcross: string;
}

const SCOPE_ROWS: ScopeRow[] = [
    { resource: 'Blueprint + generated files', isolatedPer: 'DO instance', sharedAcross: 'Nothing' },
    { resource: 'Git repository + history', isolatedPer: 'DO instance', sharedAcross: 'Nothing' },
    { resource: 'Conversation messages', isolatedPer: 'DO instance', sharedAcross: 'Nothing' },
    { resource: 'Agent memory', isolatedPer: 'User ID (cryptographically bound)', sharedAcross: 'Same user\'s sessions' },
    { resource: 'AI model API keys (BYOK)', isolatedPer: 'User vault DO (XChaCha20-Poly1305)', sharedAcross: 'Nothing' },
    { resource: 'Sandbox environment', isolatedPer: 'Session container', sharedAcross: 'Nothing' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
            <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">

                {/* Hero */}
                <motion.div
                    className="text-center mb-16"
                    variants={stagger}
                    initial="hidden"
                    animate="visible"
                >
                    <motion.div variants={fadeUp} className="flex justify-center mb-4">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
                            <Shield className="size-3.5" />
                            Security architecture
                        </span>
                    </motion.div>

                    <motion.h1
                        variants={fadeUp}
                        className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight"
                    >
                        Architecture beats scanning.
                    </motion.h1>

                    <motion.p
                        variants={fadeUp}
                        className="mt-4 text-base text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed"
                    >
                        Code scanners — including those used by Lovable (Wiz) and Cursor (Security Review) —
                        find vulnerabilities after they are written. Structural isolation ensures the
                        vulnerability class does not exist to begin with. vibesdk's Cloudflare Durable Object
                        architecture makes the class of attacks that exposed Lovable's users{' '}
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                            structurally impossible
                        </span>
                        {' '}— not just harder to find.
                    </motion.p>
                </motion.div>

                {/* BOLA incident context */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="mb-12 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-5"
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                Lovable BOLA incident — Feb 3 to Apr 20, 2026 (76 days)
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed mb-2">
                                A free Lovable account and 5 API calls were sufficient to enumerate other
                                users' source code, Supabase credentials, and Stripe customer IDs. Root cause:
                                authorization was enforced at the API layer, but the underlying project object
                                graph was shared across tenants. A single bypass exposed all objects. Adding
                                Wiz scanning after the incident detects new vulnerabilities — it cannot
                                change the shared-graph architecture that made the attack possible.
                            </p>
                            <Link
                                to="/blog/lovable-bola"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                            >
                                Technical deep-dive
                                <ArrowRight className="size-3" />
                            </Link>
                        </div>
                    </div>
                </motion.div>

                {/* Isolation facts grid */}
                <motion.section
                    className="mb-14"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6"
                    >
                        How vibesdk isolation works
                    </motion.h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {ISOLATION_FACTS.map((fact) => {
                            const Icon = fact.icon;
                            return (
                                <motion.div
                                    key={fact.heading}
                                    variants={fadeUp}
                                    className="flex flex-col gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] p-5 backdrop-blur-sm"
                                >
                                    <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                                        <Icon className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                            {fact.heading}
                                        </h3>
                                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                            {fact.detail}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.section>

                {/* Architecture comparison table */}
                <motion.section
                    className="mb-14"
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                >
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6">
                        Architecture comparison
                    </h2>

                    <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-black/[0.06] dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.02]">
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                                        Dimension
                                    </th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                                        Lovable (pre-Apr 2026)
                                    </th>
                                    <th className="text-left px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-500">
                                        vibesdk
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON_ROWS.map((row, i) => (
                                    <tr
                                        key={row.dimension}
                                        className={`border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 ${
                                            i % 2 === 0 ? '' : 'bg-gray-50/40 dark:bg-white/[0.01]'
                                        }`}
                                    >
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">
                                            {row.dimension}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                                            <div className="flex items-start gap-1.5">
                                                <XCircle className="size-3.5 text-red-400 shrink-0 mt-0.5" />
                                                {row.lovable}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                            <div className="flex items-start gap-1.5">
                                                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                {row.vibesdk}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.section>

                {/* Isolation scope table */}
                <motion.section
                    className="mb-14"
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                >
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6">
                        Isolation scope
                    </h2>

                    <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-black/[0.06] dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.02]">
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                                        Resource
                                    </th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                                        Isolated per
                                    </th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                                        Shared across
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {SCOPE_ROWS.map((row, i) => (
                                    <tr
                                        key={row.resource}
                                        className={`border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 ${
                                            i % 2 === 0 ? '' : 'bg-gray-50/40 dark:bg-white/[0.01]'
                                        }`}
                                    >
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">
                                            {row.resource}
                                        </td>
                                        <td className="px-4 py-3 text-emerald-600 dark:text-emerald-500 font-medium">
                                            {row.isolatedPer}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500">
                                            {row.sharedAcross}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.section>

                {/* Attacker requirements callout */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="mb-14 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-5"
                >
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-3">
                        What an attacker would need to access another user's session in vibesdk:
                    </p>
                    <ol className="space-y-1.5">
                        {[
                            "The target session's DO ID — not exposed in any API, not enumerable, not derivable from session metadata",
                            'A valid auth token for that session — enforced by the Worker routing layer before the DO is addressed',
                            "Physical access to Cloudflare's infrastructure — the DO storage is encrypted at rest by Cloudflare",
                        ].map((req, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                                <span className="font-bold shrink-0">{i + 1}.</span>
                                {req}
                            </li>
                        ))}
                    </ol>
                    <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-500 font-medium">
                        Contrast with Lovable: a valid free-tier token was sufficient.
                    </p>
                </motion.div>

                {/* Known limitations */}
                <motion.section
                    className="mb-16"
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                >
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
                        Known limitations and mitigations
                    </h2>

                    <div className="space-y-3">
                        {[
                            {
                                title: 'Cloudflare supply chain',
                                body: 'vibesdk runs on Cloudflare infrastructure. A vulnerability in CF\'s DO isolation could theoretically expose session data. Mitigation: Cloudflare maintains SOC 2 Type II certification; we track CF security advisories.',
                            },
                            {
                                title: 'BYOK key exposure',
                                body: 'If a user\'s BYOK API key is compromised at the provider level, their LLM calls can be observed. Mitigation: keys are stored in an isolated vault DO with XChaCha20-Poly1305 encryption at rest.',
                            },
                            {
                                title: 'Sandbox code execution',
                                body: 'The code sandbox runs user-generated code. Mitigation: container-level isolation with no access to the host network or other users\' containers.',
                            },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-4"
                            >
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    {item.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                    {item.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </motion.section>

                {/* Vulnerability reporting + CTA */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-8 border-t border-black/[0.06] dark:border-white/[0.07]"
                >
                    <motion.div variants={fadeUp}>
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Report a vulnerability
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Email{' '}
                            <a
                                href="mailto:security@vibesdk.dev"
                                className="text-emerald-600 dark:text-emerald-500 hover:underline"
                            >
                                security@vibesdk.dev
                            </a>
                            {' '}— acknowledge within 24h, assessment within 72h.
                        </p>
                    </motion.div>

                    <motion.div variants={fadeUp}>
                        <Link
                            to="/pricing"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                        >
                            Build on structural isolation
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </motion.div>
                </motion.div>

            </div>
        </div>
    );
}
