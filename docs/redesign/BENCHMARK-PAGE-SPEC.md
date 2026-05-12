## /benchmark — Public Cost+Speed Benchmark Page

**Owner:** @PO + @Dev
**Status:** SPEC (Sprint S2 — Lever 3 of [BEAT-EMERGENT-PLAN.md](BEAT-EMERGENT-PLAN.md))
**Exit gate:** `/benchmark` live with daily cron vs Emergent

---

## 1. Page Goal (2 sentences)

`/benchmark` is the truth-beats-positioning marketing weapon: a public page that runs the **same prompt** through VibeSDK and Emergent every 24h and publishes wall-clock time, credit cost, and deploy success side-by-side with click-through proof. If our numbers are better, this page is the single strongest asset we ship; if they ever regress, we know first and so do they.

---

## 2. Data Shape — Ingestion Row

One row = one benchmark run on one product. The cron writes pairs (`vibesdk` + `emergent` for the same prompt) per day.

```ts
// shared/types/benchmark.ts (to be created in S2)
export interface BenchmarkRun {
  readonly id: string;                    // ULID
  readonly runDate: string;               // 'YYYY-MM-DD' (cron day, UTC)
  readonly timestamp: number;             // unix sec when run started
  readonly product: 'vibesdk' | 'emergent';
  readonly promptId: string;              // stable handle, e.g. 'saas-waitlist-v1'
  readonly promptText: string;            // verbatim prompt fired
  readonly productName: string;           // 'VibeSDK' | 'Emergent' (display)
  readonly wallClockSeconds: number;      // start → preview-ready
  readonly creditsSpent: number;          // tokens billed (each product's own currency)
  readonly creditsUsdEstimate: number;    // normalised to USD for fair comparison
  readonly deploySuccess: boolean;        // got a deployable artifact w/o human fix
  readonly evidenceUrl: string;           // public session URL on that product
  readonly errorNote?: string;            // populated when deploySuccess=false
  readonly modelMix?: readonly string[];  // ['claude-sonnet-4.7', 'gpt-4o-mini'] etc.
  readonly agentChips?: number;           // VibeSDK only — visible parallel agents
}

export interface BenchmarkDailyPair {
  readonly runDate: string;
  readonly promptId: string;
  readonly vibesdk: BenchmarkRun;
  readonly emergent: BenchmarkRun;
  readonly winner: 'vibesdk' | 'emergent' | 'tie';   // by (deploySuccess, time, cost)
}

export interface BenchmarkLatestResponse {
  readonly updatedAt: number;             // unix sec
  readonly history: readonly BenchmarkDailyPair[];   // last 7 days
  readonly aggregate: {
    readonly avgWallClockSeconds: { vibesdk: number; emergent: number };
    readonly avgCreditsUsd: { vibesdk: number; emergent: number };
    readonly deploySuccessRate: { vibesdk: number; emergent: number };  // 0..1
    readonly sampleSize: number;
  };
}
```

---

## 3. Cron Schedule & Source

- **Schedule:** daily at **03:00 UTC** via Cloudflare Workers Cron Trigger.
- **Wrangler binding (to add in S2):**
  ```toml
  [triggers]
  crons = ["0 3 * * *"]
  ```
- **Source script:** `worker/cron/benchmarkRunner.ts` (new in S2).
- **Behaviour:**
  - Picks the next prompt from `worker/cron/benchmark-prompts.json` (5-prompt rotation, one per day → 5-day cycle that covers waitlist, marketplace, dashboard, blog, CRUD).
  - Fires concurrent requests at both products using **our own paid accounts** (Pro tier on both).
  - VibeSDK side: hits internal `/api/agent/run-headless` (existing codegen path with `multiAgentEnabled: true`).
  - Emergent side: hits public app.emergent.sh API via stored credentials in `BENCHMARK_CREDS` Secrets Store DO.
  - Measures wall-clock from POST → `preview-ready` event (or product equivalent).
  - Captures session URL for evidence link.
  - Writes both rows to KV (see §4).
- **Failure handling:** If Emergent times out or rejects, write the row with `deploySuccess: false` + `errorNote`. Never block VibeSDK's row.
- **Cost cap:** Cron stops after **3 retry attempts/day**; if both fail, page falls back to "last successful run" with a stale-data banner.

---

## 4. Storage — KV Namespace `BENCHMARK_RESULTS`

```toml
# wrangler.jsonc additions
[[kv_namespaces]]
binding = "BENCHMARK_RESULTS"
id = "<provisioned in S2>"
```

| Key                         | Value                                          | TTL    |
|-----------------------------|------------------------------------------------|--------|
| `latest`                    | `BenchmarkLatestResponse` (last 7 days)        | none   |
| `history-YYYY-MM-DD`        | `BenchmarkDailyPair[]` (all prompts that day)  | 90d    |
| `raw-{runId}`               | full `BenchmarkRun` w/ raw logs                | 30d    |

Cron writes all three on each run. Reads from page always hit `latest` only (1 KV read per pageview, cacheable at edge).

---

## 5. Public Read Endpoint

- **Route:** `GET /api/benchmark/latest`
- **Auth:** **public** — no token required (this is marketing content).
- **Backend file:** `worker/api/routes/benchmarkRoutes.ts` (new in S2).
- **Controller:** `worker/api/controllers/benchmarkController.ts` (new in S2).
- **Cache:** `Cache-Control: public, max-age=300` (5 min edge cache).
- **Response:** `BenchmarkLatestResponse` (see §2).
- **Registration:** Add `setupBenchmarkRoutes(app)` to `worker/api/routes/index.ts` before `setupCodegenRoutes`.

### Authenticated "Run Your Own" Endpoint

- **Route:** `POST /api/benchmark/run`
- **Auth:** required + Pro/Team/Enterprise tier (see §7).
- **Body:** `{ promptText: string }` (max 2000 chars).
- **Behaviour:** Same fan-out as cron but for a custom prompt; result is stored under `user-runs/{userId}/{runId}` (24h TTL, never shown publicly).
- **Rate limit:** 3 user runs / day / Pro account (cost protection; Emergent calls are not free for us).

---

## 6. Page Rendering — Sections

### 6.1 Hero (live numbers)

- Headline: **"VibeSDK vs Emergent — Real Numbers, Updated Daily"**
- Sub: "Same prompt. Same day. Same accounts. Public proof."
- Three big-number cards (read from `aggregate`):
  - ⏱ **Avg wall-clock** (vibesdk vs emergent — diff shown as `−43%`).
  - 💰 **Avg credit cost (USD)** (same diff treatment).
  - ✅ **Deploy success rate** (pct, both products).
- Cron timestamp pill: "Last run: {updatedAt} UTC · Next run: 03:00 UTC".

### 6.2 7-Day Side-by-Side Table

Columns: `Date | Prompt | VibeSDK time / cost | Emergent time / cost | Winner | Evidence`.
- Each cell that has an `evidenceUrl` is a click-through to the actual session on that product (trust signal — anyone can verify).
- Winner column shows badge: ✓ VibeSDK / ✓ Emergent / = Tie.

### 6.3 History Chart

- Bar viz: wall-clock seconds, last 30 days, two stacked series (vibesdk vs emergent).
- For scaffold: simple `<canvas>` placeholder block; in S2 we wire `recharts` (already a project dep).

### 6.4 "Run Your Own" Form

- Authenticated-gated. Behaviour by user state:
  - Logged-out: button reads "Sign in to run your own" → `/?auth=signup&next=/benchmark`.
  - Free tier: button reads "Upgrade to run your own" → `/pricing`.
  - Pro+: textarea (1000-char max) + submit → POST `/api/benchmark/run` → live progress chips → final result card with evidence links to both sessions.

### 6.5 Methodology

Bullet list explaining:
- Prompts rotate from a fixed public list (linked).
- Both products run on **Pro plans we pay for** (no insider access on either side).
- Wall-clock = POST → preview-ready (not just "first token").
- Credit cost normalised to USD using each product's published pricing page (linked).
- Deploy success = a working preview URL we could open in a browser, no manual intervention.

### 6.6 Disclaimer & Privacy (Footer)

- "VibeSDK and Emergent are independent products; this comparison is conducted with publicly-purchased Pro accounts on both. All prompts and session URLs shown are produced by automated cron runs paid for by VibeSDK Inc. We do not modify, prompt-engineer for, or sandbag the Emergent runs."
- "Emergent® is a trademark of its respective owner. We use 'Emergent' for nominative comparison."
- GitHub link: "View cron script + raw results → github.com/cloudflare/vibesdk/tree/main/worker/cron".

---

## 7. Cost Guard for "Run Your Own"

The Emergent leg of any user-triggered run **costs us real money** (an API call on our Emergent Pro account). The guard:

| User state                  | Behaviour                                                    |
|-----------------------------|--------------------------------------------------------------|
| Anonymous                   | `/api/benchmark/run` returns 401; UI sends to `/?auth=signup` |
| `tier === 'free'`           | Returns 402 `tier-required: pro`; UI sends to `/pricing`     |
| `tier === 'pro'`            | Allowed; rate-limited 3/day/user                             |
| `tier === 'team' \| 'enterprise'` | Allowed; rate-limited 10/day/user                       |

- Wired into existing `checkGenerationGuard` middleware (`worker/middleware/guardrails/generationGuard.ts`) via a new `kind: 'benchmark'` code path that counts against a separate `benchmark_runs_used_this_period` column in `subscription_tiers`.
- Hard cost cap: `BENCHMARK_DAILY_USD_BUDGET` env var (defaults $5/day) — when exceeded, endpoint returns 429 with "benchmark quota exhausted for the day" for everyone.

---

## 8. Privacy & Legal

- **No PII in stored rows.** The prompt text is from our fixed list; user-triggered runs (Pro+) store the prompt but encrypt with the user's UserSecretsStore key — never shown to the public.
- **Comparison is nominative fair use** (we're not implying endorsement, partnership, or affiliation). Disclaimer in footer is explicit.
- **Both products charged on our own bills** — no scraping, no abuse of free tiers.
- If Emergent objects in writing, we honour takedown of their column within 24h while keeping the methodology section live (we replace "Emergent" with a second VibeSDK-tier comparison or a generic "Competitor A").

---

## 9. Trust Signals

Every row in the history table has:
1. **Evidence link to VibeSDK session** (`https://vibesdk.app/s/{sessionId}` — already public for shareable sessions).
2. **Evidence link to Emergent session** (their public share URL).
3. **Cron commit hash** in footer: "Run on commit `abc1234` of benchmark-runner".
4. **Raw JSON link**: `/api/benchmark/latest?format=raw` for skeptics to scrape.

---

## 10. File Map (where things live)

```
# schema: file|status|purpose
docs/redesign/BENCHMARK-PAGE-SPEC.md|THIS DOC|spec
docs/redesign/mockups/benchmark.html|DRAFTED|visual scaffold
src/routes/benchmark/index.tsx|DRAFTED|React component (scaffold, no live API)
src/routes.ts|TO PATCH|register /benchmark route
shared/types/benchmark.ts|TODO S2|BenchmarkRun + BenchmarkLatestResponse types
src/lib/api-client.ts|TODO S2|getBenchmarkLatest() + runBenchmark() methods
worker/api/routes/benchmarkRoutes.ts|TODO S2|GET /api/benchmark/latest + POST /run
worker/api/routes/index.ts|TODO S2|register setupBenchmarkRoutes
worker/api/controllers/benchmarkController.ts|TODO S2|read KV, format response
worker/cron/benchmarkRunner.ts|TODO S2|daily cron entry point
worker/cron/benchmark-prompts.json|TODO S2|5-prompt rotation
worker/middleware/guardrails/generationGuard.ts|TO PATCH|add 'benchmark' kind
wrangler.jsonc|TO PATCH|KV namespace + cron trigger
```

---

## 11. Exit Criteria

S2 ships when ALL of these are true:

- [ ] `/benchmark` renders today's numbers from a real cron run (not seed data).
- [ ] At least 7 consecutive daily pairs are visible in the history table.
- [ ] `GET /api/benchmark/latest` returns < 200ms p95 at the edge.
- [ ] Evidence links open real session URLs on both products.
- [ ] "Run your own" CTA correctly gates Free → /pricing.
- [ ] Methodology + disclaimer + GitHub link visible in footer.
- [ ] Page passes Playwright critical-path test.
