/**
 * Benchmark types — shared between frontend (/benchmark page) + worker (cron + API).
 *
 * Spec: docs/redesign/BENCHMARK-PAGE-SPEC.md §2.
 * Single source of truth for the BenchmarkLatestResponse shape; the React page
 * still keeps a local copy (will move to this module once api-client is wired).
 */

export type BenchmarkProduct = 'vibesdk' | 'emergent';
export type BenchmarkWinner = 'vibesdk' | 'emergent' | 'tie';

export interface BenchmarkRun {
    readonly id: string;                    // ULID-ish id (cron-emitted)
    readonly runDate: string;               // 'YYYY-MM-DD' (cron day, UTC)
    readonly timestamp: number;             // unix sec when run started
    readonly product: BenchmarkProduct;
    readonly promptId: string;              // stable handle, e.g. 'waitlist-saas'
    readonly promptText: string;            // verbatim prompt fired
    readonly productName: string;           // 'VibeSDK' | 'Emergent' (display)
    readonly wallClockSeconds: number;      // start -> preview-ready
    readonly creditsSpent: number;          // each product's own credit currency
    readonly creditsUsdEstimate: number;    // normalised to USD for fair comparison
    readonly deploySuccess: boolean;        // got a deployable artifact w/o human fix
    readonly evidenceUrl: string;           // public session URL on that product
    readonly errorNote?: string;            // populated when deploySuccess=false
    readonly modelMix?: readonly string[];
    readonly agentChips?: number;           // VibeSDK only — visible parallel agents
}

export interface BenchmarkDailyPair {
    readonly runDate: string;
    readonly promptId: string;
    readonly vibesdk: BenchmarkRun;
    readonly emergent: BenchmarkRun;
    readonly winner: BenchmarkWinner;
}

export interface BenchmarkAggregate {
    readonly avgWallClockSeconds: { readonly vibesdk: number; readonly emergent: number };
    readonly avgCreditsUsd: { readonly vibesdk: number; readonly emergent: number };
    readonly deploySuccessRate: { readonly vibesdk: number; readonly emergent: number };  // 0..1
    readonly sampleSize: number;
}

export interface BenchmarkLatestResponse {
    readonly updatedAt: number;             // unix sec
    readonly history: readonly BenchmarkDailyPair[];   // last 7 days
    readonly aggregate: BenchmarkAggregate;
}

/**
 * Empty-state fallback — controller returns this when KV `latest` is null.
 * The React page treats `history.length === 0` as the "empty" state.
 */
export const EMPTY_BENCHMARK_RESPONSE: BenchmarkLatestResponse = {
    updatedAt: 0,
    history: [],
    aggregate: {
        avgWallClockSeconds: { vibesdk: 0, emergent: 0 },
        avgCreditsUsd: { vibesdk: 0, emergent: 0 },
        deploySuccessRate: { vibesdk: 0, emergent: 0 },
        sampleSize: 0,
    },
} as const;

/**
 * Cron prompt entry — see worker/cron/benchmark-prompts.json.
 */
export interface BenchmarkPrompt {
    readonly id: string;
    readonly prompt: string;
    readonly expectedStack: string;
}
