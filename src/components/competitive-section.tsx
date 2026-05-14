/**
 * CompetitiveSection — "Why vibesdk vs free tools?" landing page block.
 *
 * Surfaces the 4 architectural proof points that differentiate vibesdk from
 * NxCode and other "free forever" single-pass AI coding tools.
 *
 * DEC-031-E: Sprint 2 P1 — static, no backend calls required.
 */

import { Shield, GitBranch, Zap, Palette, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProofPoint {
    icon: React.ElementType;
    title: string;
    tagline: string;
    description: string;
    badge: string;
}

const PROOF_POINTS: ProofPoint[] = [
    {
        icon: Shield,
        title: 'Per-session isolation',
        tagline: 'Architecture beats shared infra',
        description:
            'Each build runs inside its own Cloudflare Durable Object — a private SQLite instance on Cloudflare\'s global network. Your code, files, and history never share infrastructure with another user\'s project. Free tools run your code in shared sandboxes.',
        badge: 'Enterprise-grade by default',
    },
    {
        icon: Zap,
        title: 'Eval gate',
        tagline: 'Quality scoring on every phase',
        description:
            'Every generated phase is scored across four metrics: faithfulness, relevancy, tool correctness, and hallucination risk. Output that falls below threshold is blocked before it reaches your editor. Free tools ship whatever the model returns.',
        badge: 'Powered by DeepEval metrics',
    },
    {
        icon: GitBranch,
        title: 'Parallel multi-agent',
        tagline: 'Planner + Coder + Tester + Critic simultaneously',
        description:
            'Independent phases run in parallel via Cloudflare Durable Objects — no merge conflicts by construction. Large apps complete up to 3× faster than single-agent generation. Free tools chain one LLM call after another.',
        badge: '3× faster on large projects',
    },
    {
        icon: Palette,
        title: 'DESIGN.md injection',
        tagline: 'Your brand in every component',
        description:
            'Drop a DESIGN.md file with your color tokens, typography rules, and component patterns. The Planner reads it before generating — output matches your design system, not a generic template. Free tools generate the same generic UI for every user.',
        badge: 'Zero post-generation cleanup',
    },
];

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export function CompetitiveSection() {
    return (
        <section
            className="relative z-10 w-full max-w-4xl mx-auto px-4 mt-16 mb-12"
            data-testid="competitive-section"
        >
            {/* Header */}
            <div className="mb-8 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                    Architecture vs free tools
                </p>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                    Why vibesdk?
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                    Free AI coding tools generate apps. vibesdk generates{' '}
                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                        architectures
                    </span>
                    . Four reasons that matter when you ship to real users.
                </p>
            </div>

            {/* Proof points grid */}
            <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-60px' }}
            >
                {PROOF_POINTS.map((point) => {
                    const Icon = point.icon;
                    return (
                        <motion.div
                            key={point.title}
                            variants={cardVariants}
                            className="group relative flex flex-col gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] p-5 backdrop-blur-sm hover:border-black/10 dark:hover:border-white/[0.12] transition-colors"
                            data-testid={`competitive-point-${point.title.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                            {/* Icon + badge row */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                                    <Icon className="size-4" />
                                </div>
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    {point.badge}
                                </span>
                            </div>

                            {/* Title + tagline */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {point.title}
                                </h3>
                                <p className="text-xs text-emerald-600 dark:text-emerald-500 font-medium mt-0.5">
                                    {point.tagline}
                                </p>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                {point.description}
                            </p>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* CTA link to SECURITY.md / docs */}
            <div className="mt-6 flex justify-center">
                <a
                    href="https://github.com/cloudflare/vibesdk/blob/main/docs/SECURITY.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    data-testid="competitive-security-link"
                >
                    Read the architecture security brief
                    <ChevronRight className="size-3" />
                </a>
            </div>
        </section>
    );
}
