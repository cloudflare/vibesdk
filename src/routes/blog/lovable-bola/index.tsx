/**
 * /blog/lovable-bola — "The Lovable BOLA Incident: Why Scanning Can't Fix Shared-Graph Architecture"
 *
 * SEO targets:
 *   lovable security incident, lovable bola, ai app builder security,
 *   broken object level authorization ai, vibe coding security
 *
 * DEC-040-D: S13 P2 — static, no backend calls.
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router';
import {
    AlertTriangle,
    Shield,
    Database,
    Lock,
    BookOpen,
    ArrowRight,
    CheckCircle2,
    XCircle,
} from 'lucide-react';

// ── Animation helpers ─────────────────────────────────────────────────────────

const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
};

// ── Data ──────────────────────────────────────────────────────────────────────

const TIMELINE = [
    { date: 'Feb 3, 2026', event: 'BOLA vulnerability introduced', note: 'Shared Supabase project graph allows cross-tenant enumeration via undocumented API parameter.' },
    { date: 'Feb–Apr 2026', event: '76-day exposure window', note: 'Any free Lovable account could issue 5 API calls to enumerate source code, Supabase credentials, and Stripe customer IDs belonging to other users.' },
    { date: 'Apr 20, 2026', event: 'Patch deployed', note: 'Object-level authorization check added to the API layer. Root-cause architecture (shared object graph) unchanged.' },
    { date: 'May 7, 2026', event: 'Lovable 2.0 + Wiz integration announced', note: 'Wiz security scanner added as a compensating control. Scan-based tooling detects known CVEs but cannot change the underlying shared-graph design.' },
];

const BOLA_STEPS = [
    { step: 1, title: 'Obtain a valid token', desc: 'Sign up for a free Lovable account. No credit card required.' },
    { step: 2, title: 'Identify the object ID pattern', desc: 'Inspect API requests in browser DevTools. Project IDs are UUIDs — enumerable via sequential or dictionary-based guessing.' },
    { step: 3, title: 'Call the API with another user\'s ID', desc: 'Substitute a guessed project ID into the object-fetch endpoint. Because authorization was checked at the session layer but not at the object layer, the API returned the owner\'s data.' },
    { step: 4, title: 'Harvest', desc: 'Source code, connected Supabase credentials (project URL + service role key), and Stripe customer IDs were all accessible inside the returned project object.' },
    { step: 5, title: 'Repeat at scale', desc: 'Automate steps 2–4. Enumerate all projects. Log credentials. No rate-limiting applied at the object layer.' },
];

const STRUCTURAL_POINTS = [
    {
        icon: Database,
        heading: 'No shared object graph',
        body: 'Every vibesdk session lives inside its own Cloudflare Durable Object with a private SQLite database. There is no central Supabase project table. Object IDs do not reference other users\' data because no cross-user references exist at the storage layer.',
    },
    {
        icon: Lock,
        heading: 'DO ID is the authorization boundary',
        body: 'A Durable Object is addressed by a session-unique ID. Cloudflare\'s routing layer enforces that only the owner\'s request context can open a given DO. Guessing another user\'s DO ID is indistinguishable from requesting a non-existent resource — the object simply does not exist for the requester.',
    },
    {
        icon: Shield,
        heading: 'BOLA requires enumerable cross-user references',
        body: 'BOLA (OWASP API Security #1) works by substituting one user\'s object identifier into another user\'s API call. If there are no cross-user references in the storage layer, there is nothing to substitute. The attack class is structurally eliminated, not mitigated.',
    },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LovableBolaPost() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
            <div className="max-w-2xl mx-auto px-4 py-16 sm:py-24">

                {/* Header */}
                <motion.header
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    animate="visible"
                >
                    <motion.div variants={fadeUp} className="flex items-center gap-2 mb-6">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
                            <BookOpen className="size-3" />
                            Security analysis
                        </span>
                        <span className="text-gray-300 dark:text-gray-700">·</span>
                        <span className="text-xs text-gray-400 dark:text-gray-600">May 2026</span>
                        <span className="text-gray-300 dark:text-gray-700">·</span>
                        <span className="text-xs text-gray-400 dark:text-gray-600">8 min read</span>
                    </motion.div>

                    <motion.h1
                        variants={fadeUp}
                        className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-tight mb-4"
                    >
                        The Lovable BOLA Incident: Why Scanning Can't Fix Shared-Graph Architecture
                    </motion.h1>

                    <motion.p
                        variants={fadeUp}
                        className="text-base text-gray-500 dark:text-gray-400 leading-relaxed"
                    >
                        From February 3 to April 20, 2026 — 76 days — a free Lovable account and five
                        API calls were sufficient to read any user's source code, Supabase credentials,
                        and Stripe customer IDs. Here is a technical account of what happened, why it
                        happened, and what architectural property prevents the same class of attack from
                        being possible in vibesdk.
                    </motion.p>
                </motion.header>

                {/* TL;DR box */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="mb-12 rounded-xl border border-gray-200 dark:border-white/[0.07] bg-white/80 dark:bg-white/[0.04] p-5 backdrop-blur-sm"
                >
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                        Summary
                    </p>
                    <ul className="space-y-1.5">
                        {[
                            'BOLA (Broken Object Level Authorization) is OWASP API Security #1 — the most common serious API vulnerability.',
                            'Lovable\'s architecture stored all projects in a shared Supabase graph. API-layer authorization was bypassed by substituting another user\'s project ID.',
                            'Adding Wiz scanning post-incident detects future known CVEs. It cannot change the shared object graph that made BOLA possible.',
                            'vibesdk\'s Durable Object per-session architecture has no shared object graph. BOLA has no surface to operate on — it is structurally eliminated.',
                        ].map((point) => (
                            <li key={point} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                {point}
                            </li>
                        ))}
                    </ul>
                </motion.div>

                {/* Section: The Incident */}
                <motion.section
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5"
                    >
                        The incident
                    </motion.h2>

                    <motion.div
                        variants={fadeUp}
                        className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-5 mb-6"
                    >
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                    Exposure window: Feb 3 – Apr 20, 2026 (76 days)
                                </p>
                                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                    Data exposed per affected project: source code, Supabase project credentials
                                    (URL + service role key), Stripe customer IDs. Lovable's paying user base
                                    remained stable after public disclosure, indicating the company communicated
                                    the post-patch status effectively.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5"
                    >
                        Lovable stores every user's project in a shared Supabase backend. Projects are
                        associated with a user account via a foreign key, and the API is supposed to
                        validate that the requesting user owns the project before returning its data.
                        That validation check existed at the session authentication layer but was
                        absent at the individual object fetch layer — the definition of BOLA.
                    </motion.p>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                    >
                        An attacker with a valid session token could call the project object endpoint
                        with any project UUID. The API authenticated the requester (valid token = valid
                        user) but did not verify whether the project UUID in the request belonged to
                        that user. The Supabase row was returned verbatim, including the project's
                        connected Supabase service role key and Stripe identifiers.
                    </motion.p>
                </motion.section>

                {/* Timeline */}
                <motion.section
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5"
                    >
                        Timeline
                    </motion.h2>

                    <div className="relative pl-5">
                        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200 dark:bg-white/[0.07]" />
                        {TIMELINE.map((item, i) => (
                            <motion.div
                                key={i}
                                variants={fadeUp}
                                className="relative mb-5 last:mb-0"
                            >
                                <div className="absolute left-[-20px] top-1.5 size-2 rounded-full bg-gray-300 dark:bg-gray-600 ring-2 ring-gray-50 dark:ring-[#0a0a0a]" />
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-500 mb-0.5">
                                    {item.date}
                                </p>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-0.5">
                                    {item.event}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                    {item.note}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Section: BOLA */}
                <motion.section
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5"
                    >
                        What is BOLA?
                    </motion.h2>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5"
                    >
                        Broken Object Level Authorization (BOLA) has been{' '}
                        <span className="font-medium text-gray-700 dark:text-gray-300">OWASP API Security #1</span>{' '}
                        since 2019. It is the most consistently exploited API vulnerability class because
                        it does not require privilege escalation, injected payloads, or novel techniques —
                        only a valid token and the ability to substitute one object identifier for another.
                    </motion.p>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6"
                    >
                        The standard attack against Lovable took exactly five steps:
                    </motion.p>

                    <div className="space-y-3">
                        {BOLA_STEPS.map((item) => (
                            <motion.div
                                key={item.step}
                                variants={fadeUp}
                                className="flex gap-4 rounded-xl border border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] px-4 py-3.5"
                            >
                                <div className="shrink-0 flex items-center justify-center size-6 rounded-full bg-gray-100 dark:bg-white/[0.06] text-xs font-bold text-gray-500 dark:text-gray-400">
                                    {item.step}
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-0.5">
                                        {item.title}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                        {item.desc}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Section: Why scanning doesn't fix it */}
                <motion.section
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5"
                    >
                        Why Wiz scanning doesn't fix the architecture
                    </motion.h2>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5"
                    >
                        Lovable 2.0 (May 7, 2026) announced a native Wiz security integration as a
                        response to the incident. Wiz is a legitimate cloud security platform that
                        surfaces CVEs, misconfigurations, and known vulnerability signatures. It is a
                        useful tool and Lovable's integration is a reasonable response to external
                        pressure.
                    </motion.p>

                    <motion.div
                        variants={fadeUp}
                        className="rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden mb-5"
                    >
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.02]">
                                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-1/2">
                                        Wiz scanning detects
                                    </th>
                                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-1/2">
                                        Wiz scanning cannot detect
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['Known CVEs in dependencies', 'Missing object-level auth checks in custom logic'],
                                    ['Exposed secrets in code/config', 'Cross-tenant data accessible via valid API calls'],
                                    ['Misconfigured cloud resources', 'Correct-looking code with wrong authorization model'],
                                    ['Infrastructure vulnerabilities', 'Shared-graph architecture risk as an architectural property'],
                                ].map(([detects, cannot], i) => (
                                    <tr
                                        key={i}
                                        className="border-b last:border-b-0 border-gray-100 dark:border-white/[0.04]"
                                    >
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                                                {detects}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 dark:text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <XCircle className="size-3 text-gray-400 dark:text-gray-600 shrink-0" />
                                                {cannot}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </motion.div>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                    >
                        The BOLA in Lovable's case was not a CVE. There was no known signature to
                        match. The vulnerability existed because the authorization model was correct
                        at one layer and absent at another — a logic error in a multi-tenant system
                        with a shared object graph. Scanners detect what they know. They cannot reason
                        about architectural correctness.
                    </motion.p>
                </motion.section>

                {/* Section: vibesdk structural isolation */}
                <motion.section
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2"
                    >
                        How vibesdk eliminates the attack surface
                    </motion.h2>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6"
                    >
                        BOLA requires an enumerable cross-user object graph. vibesdk's architecture
                        removes that graph entirely.
                    </motion.p>

                    <div className="space-y-4">
                        {STRUCTURAL_POINTS.map((point) => {
                            const Icon = point.icon;
                            return (
                                <motion.div
                                    key={point.heading}
                                    variants={fadeUp}
                                    className="flex gap-4 rounded-xl border border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-5 backdrop-blur-sm"
                                >
                                    <div className="shrink-0 flex items-center justify-center size-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                        <Icon className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                                            {point.heading}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                            {point.body}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.section>

                {/* Attacker comparison */}
                <motion.section
                    className="mb-12"
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                >
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">
                        What it costs an attacker
                    </h2>

                    <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-black/[0.06] dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.02]">
                                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400" />
                                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">
                                        Lovable (at time of incident)
                                    </th>
                                    <th className="text-left px-4 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                        vibesdk
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['Step 1', 'Free account signup', 'Free account signup'],
                                    ['Step 2', 'Inspect API calls in DevTools', 'Inspect API calls in DevTools'],
                                    ['Step 3', 'Substitute another user\'s UUID', 'Substitute UUID → CF returns 404 (DO does not exist for requester)'],
                                    ['Step 4', 'Receive victim\'s project data', 'No data returned — no shared graph exists'],
                                    ['Step 5', 'Harvest credentials at scale', 'Physical Cloudflare infra access required'],
                                ].map(([step, lovable, vibe], i) => (
                                    <tr
                                        key={i}
                                        className="border-b last:border-b-0 border-gray-100 dark:border-white/[0.04]"
                                    >
                                        <td className="px-4 py-3 font-semibold text-gray-400 dark:text-gray-600 w-16">
                                            {step}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                            {lovable}
                                        </td>
                                        <td className="px-4 py-3 text-emerald-700 dark:text-emerald-400">
                                            {vibe}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.section>

                {/* Conclusion */}
                <motion.section
                    className="mb-12"
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5"
                    >
                        Architecture is the only durable answer
                    </motion.h2>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5"
                    >
                        When a shared-graph multi-tenant system is breached via BOLA, the post-incident
                        response typically involves patching the specific authorization check that was
                        missing, adding monitoring, and layering in a scanning tool. These are all
                        useful. None of them change the fundamental property: there is still a shared
                        object graph, and the next undiscovered authorization gap will expose it again.
                    </motion.p>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5"
                    >
                        Structural isolation does not mean a harder-to-exploit shared graph. It means
                        no shared graph. The Cloudflare Durable Object routing layer enforces isolation
                        at the infrastructure level — before any application code runs. No application
                        logic bug can create a cross-tenant reference because the storage layer does
                        not support one.
                    </motion.p>

                    <motion.p
                        variants={fadeUp}
                        className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                    >
                        For developers building production apps — apps that will handle their users'
                        source code, connected databases, and payment credentials — the question to ask
                        your AI builder is not "do you run a security scanner?" The question is:
                        "what happens if your authorization logic has a bug?"
                    </motion.p>
                </motion.section>

                {/* CTAs */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="flex flex-col sm:flex-row gap-3"
                >
                    <motion.div variants={fadeUp} className="flex-1">
                        <Link
                            to="/security"
                            className="flex items-center justify-between w-full rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] px-5 py-4 hover:bg-white dark:hover:bg-white/[0.07] transition-colors group"
                        >
                            <div>
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                    Full security architecture
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    Isolation facts, comparison table, known limitations
                                </p>
                            </div>
                            <ArrowRight className="size-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors shrink-0 ml-3" />
                        </Link>
                    </motion.div>

                    <motion.div variants={fadeUp} className="flex-1">
                        <Link
                            to="/pricing"
                            className="flex items-center justify-between w-full rounded-xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 px-5 py-4 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors group"
                        >
                            <div>
                                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    Start building on vibesdk
                                </p>
                                <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                                    Plans from ₹1,699/mo · Structural isolation included
                                </p>
                            </div>
                            <ArrowRight className="size-4 text-emerald-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors shrink-0 ml-3" />
                        </Link>
                    </motion.div>
                </motion.div>

            </div>
        </div>
    );
}
