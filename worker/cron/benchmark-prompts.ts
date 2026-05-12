/**
 * Benchmark prompts — canonical rotation for the daily VibeSDK-vs-Emergent run.
 *
 * Spec: docs/redesign/BENCHMARK-PAGE-SPEC.md §3 ("5-day cycle").
 *
 * Why .ts and not .json: keeping a typed `BenchmarkPrompt[]` lets the importer
 * stay strict without enabling `resolveJsonModule` across the worker bundle and
 * matches the existing benchmark-prompts.json content (kept on disk for ops
 * tooling that prefers raw JSON).
 */

import type { BenchmarkPrompt } from '../../shared/types/benchmark';

export const BENCHMARK_PROMPTS: readonly BenchmarkPrompt[] = [
    {
        id: 'waitlist-saas',
        prompt:
            'Build a SaaS waitlist landing page with email capture, double opt-in, and an admin dashboard that shows total signups, last 7-day chart, and a CSV export.',
        expectedStack: 'next.js+d1',
    },
    {
        id: 'invoice-tool',
        prompt:
            'Build an invoice generator with line items, tax, discounts, PDF export, and Razorpay checkout for paying invoices online.',
        expectedStack: 'react+workers',
    },
    {
        id: 'link-in-bio',
        prompt:
            'Build a link-in-bio page builder with custom slug, social icons, click analytics, and a simple analytics dashboard.',
        expectedStack: 'static+kv',
    },
    {
        id: 'crud-dashboard',
        prompt:
            "Build a CRUD admin dashboard for a 'products' table with create, edit, delete, search, pagination, and CSV import/export.",
        expectedStack: 'react+d1',
    },
    {
        id: 'realtime-chat',
        prompt:
            'Build a real-time chat app with rooms, presence indicators, message history, and emoji reactions using WebSockets.',
        expectedStack: 'react+durable-objects',
    },
] as const;
