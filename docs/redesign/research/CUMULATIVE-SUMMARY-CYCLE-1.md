# Cycle 1 — 2026-05-12 to 2026-05-13 IST

Sources: run001 (architecture), run002 (features), run003 (tech), run004 (market). No prior cycle.

## What changed (4-pillar synthesis)

### Architecture deltas
- **Sandbox layer commoditizing on Firecracker microVMs.** E2B + Daytona dominate; Daytona 27-90ms cold-start, E2B native in OpenAI Agents SDK 0.14 (May 2026). Manus runs on E2B. vibesdk's bespoke Cloudflare Containers + `/container/` CLI tooling is now off-pattern.
- **Cloudflare itself shipped first-party agent primitives** during Agents Week 2026: Sandbox GA (PTY-over-WS, R2 snapshots, active-CPU billing), Agent Memory (managed Session API w/ per-agent DO + SQLite), AI Search (hybrid retrieval). vibesdk built custom equivalents BEFORE these existed.
- **Model-routing standardizing on three OSS patterns**: OpenRouter (catalog), LiteLLM (self-host proxy w/ fallback chains), Portkey (governance, semantic cache, PII guards). vibesdk's `worker/agents/inferutils/core.ts` + `byokHelper.ts` is bespoke — no fallback chains, no semantic cache.
- **AG-UI Protocol (CopilotKit) becoming the agent↔frontend wire format**, backed by Google/MS/Amazon/Oracle. Would replace vibesdk's bespoke PartySocket message types in `worker/api/websocketTypes.ts`.
- **Sub-agent spawning is now table-stakes**: Replit Agent 3, Cursor 3, Devin all do it. vibesdk's `SimpleCodeGeneratorAgent` is single-DO, single-threaded.

### Feature deltas (last ~60 days)
- **Sonnet 4.6 default in Bolt; Opus 4.7 (Apr 16) + GPT-5.5 (Apr 23) now exposed via Copilot/v0 Max.** Model-router UX is mandatory — v0 explicitly tiers Mini/Pro/Max/Max Fast as product SKUs.
- **Manus shipping cadence relentless**: Make-a-Copy (May 11), self-updating projects (May 6), connector recommendations (May 5), Cloud Computer (Apr 30), Slack (Apr 6), Meta Ads/IG/GWS (Mar). 7+ connectors in 60 days.
- **Replit Agent 3 + App Monitoring** closes build→deploy→prod-log-debug loop. Only player doing this end-to-end.
- **Cursor 3.0 (Apr 2)** ground-up rebuild, agent-first IDE, parallel multi-agent via git worktrees, Composer 2 proprietary MoE @ 200 tok/s and ~10× cheaper inference.
- **Effort-based pricing entrenched** at Replit + Devin. Flat-credit (lovable, emergent) increasingly looks consumer-grade.
- **Pricing-tier convergence**: $20 Pro / $100–200 Power / Team $30–80/seat / Enterprise custom. Free tiers tightening (Lovable killed Q1 hosting promo).
- **New vibe-coding entrants**: Spawned (generate + launch loop), Base44 (quality-over-speed), Blink.new (Lovable clone), YC W26 batch (Sparkles, EmDash, Syntropy, Terminal Use — "Vercel for background agents").

### Tech deltas (SOTA Apr–May 2026)
- **Agent memory consolidated to 4 leaders**: Mem0 (91.6 LoCoMo, vector + BM25 + entity, 4-scope), Letta (Context Repositories, git-versioned mem, three-tier), Zep/Graphiti (94.8 DMR, bi-temporal KG), Pinecone Nexus (Context Compiler, pre-compiled artifacts). vibesdk ships **zero memory** beyond per-DO state.
- **Letta Code (Apr 2026)** is a direct competitor — "memory-first coding agent" applies git-versioning to *agent state*, not source files.
- **RAG hybrid retrieval normalized**: LightRAG + RAG-Anything (PDFs/Office/images), Infinity (0.1ms vector + 1ms full-text + ColBERT rerankers). vibesdk has no retrieval over prior generations / template corpus.
- **Eval pipeline standardizing**: DeepEval (pytest-style, 50+ metrics) + RAGAS (RAG-specific). MLflow ships both as native judges. vibesdk has **no eval gate** between phases.
- **Anthropic prompt caching 90% off / batch 50% off** — disproportionate win for vibesdk's multi-phase loops if wired into `core.ts`.

### Market deltas
- **Top-tier valuations doubled in <6 months**: Cursor $2B ARR, $50B in talks (Apr 17); Replit $9B (Mar 11), targeting $1B ARR EOY; Cognition+Windsurf ~$25B (Apr 23); Vercel $9.3B (Sep 25).
- **Vibe-coding tier hit revenue escape velocity**: Lovable $200M→$400M ARR Dec→Feb (doubled in **one month**); Emergent $50M→$100M ARR Jan→Feb. Lovable global #1 fastest-growing startup.
- **Cloudflare laid off 1,100 (~20%) May 7** to go AI-first; stock down 18–23%. AI usage +600% in 3 months. **Tailwind** for vibesdk's CF-native positioning, **headwind** for support/account stability.
- **Lovable BOLA leak (48 days open, Apr 2026)** + 91.5% of vibe-coded apps shipped w/ AI-hallucinated vulnerabilities (RLS off, hardcoded secrets, broken access) → trust-positive sentiment fell to 60%. Opens "trustworthy vibe-coding" lane.
- **Meta–Manus $2B blocked by China** (Apr 27) — cross-border agent M&A friction.
- **Bolt + Azure Marketplace partnership (May 2026)** — enterprise procurement is new feature frontier.
- **Dominant Reddit/HN narrative**: "prototype in Lovable/Bolt → graduate to Cursor/Claude Code for production." Vibe-coding platforms perceived as **disposable scaffolding**.

### Cross-pillar patterns (what no single pillar surfaced alone)
1. **Trust + security + CF-native primitives = a defensible wedge.** Lovable BOLA crisis (market) + 91.5% vulnerability rate (market) + vibesdk's existing XChaCha20 secrets DO + CF Sandbox isolation (architecture/tech) = "trustworthy vibe-coding" is a real positioning lane with proven product foundation.
2. **The graduation arc is a strategic fork.** Reddit narrative (market) + Bolt's v1 retirement (features) + Cursor 3 cloud-agent handoff (architecture) all point to: vibe-coding platforms either become export-ramps or fight to keep users. Pick one.
3. **CF Agents Week + CF layoffs + first-party primitives** = vibesdk gets free roadmap (Sandbox GA, Agent Memory, AI Search) but loses account-management runway. Migrate to first-party fast while support exists.
4. **Memory gap + eval gap + routing gap** stack into ONE narrative: vibesdk's `core.ts` + `inferutils/` is the highest-leverage refactor surface — fix all three behind LiteLLM-compatible interface + Mem0/CF-Agent-Memory + DeepEval phase gates.

## What this means for vibesdk (ranked by ROI)

1. **Adopt Cloudflare Agent Memory + AI Search (first-party)** — same platform, zero new vendor. Fills the biggest gap (long-term memory + retrieval). High impact, low effort (~1 sprint). Mirror `generatedFilesMap` to memory store; hook into `UserConversationProcessor.ts`.
2. **Add DeepEval phase gates** per state-machine transition (PHASE_GENERATING → PHASE_IMPLEMENTING → REVIEWING). Faithfulness + tool-use + toxicity metrics. Closes the "AI-hallucinated vulnerability" trust gap and gives a marketing line vs Lovable. Medium effort, high differentiation.
3. **Refactor `worker/agents/inferutils/core.ts` to a LiteLLM-compatible shape** — unlocks OpenRouter + Portkey by config swap, adds fallback chains, semantic cache, model routing. Also lets us ship the v0-style Mini/Pro/Max UX without backend rewrites.
4. **Ship a visible model-router UX in the chat header** — Opus 4.7 / Sonnet 4.6 / GPT-5.5 / Gemini 2.5 Pro w/ per-task cost preview. Table-stakes per run002. Frontend-only change in `src/components/`. ~3 days.
5. **Replace bespoke WebSocket types w/ AG-UI Protocol** — marketing line "vibesdk speaks the open agent protocol." Reduces `worker/api/websocketTypes.ts` + `useAgentStream.ts` surface area. Medium effort, defensive moat.
6. **Pilot e2b/Daytona vs Cloudflare Sandbox GA** w/ a cost+latency benchmark. Decide single sandbox layer before custom `/container/` tooling accrues more debt. Time-box to 2 weeks.
7. **Build the post-deploy ops loop via CF Logpush + Analytics Engine** — only Replit has this. Agent reads user's live app logs, root-causes prod errors. Biggest single feature differentiator available.

## Decision asks for Owner (binary)

1. **Cloudflare-native bet or best-of-breed?** Recommend **CF-native** (Agent Memory + AI Search + Sandbox GA + Workers AI Gateway). Pros: one vendor, one bill, same DO model we already use. Cons: lock-in, CF layoff risk on roadmap velocity. **Recommendation: YES, CF-native** — lock the platform thesis while CF is still incentivized to court us.
2. **Own the graduation arc (export-to-IDE) or fight to retain (production deploy moat)?** Reddit narrative says users WILL graduate. **Recommendation: own it** — ship "export to GitHub repo + Cursor/Claude Code-ready" as a paid feature. Higher trust, lower churn anxiety. Pricing wedge: free export, paid hosting+ops.
3. **Adopt AG-UI Protocol or keep bespoke PartySocket types?** **Recommendation: YES, AG-UI**. Backed by Google/MS/Amazon, CopilotKit just raised $27M. Lock-in risk is lower than the marketing+integration upside.
4. **Effort-based pricing or flat credits?** Replit + Devin proved users prefer effort-based. **Recommendation: YES, switch.** Price per phase complexity, not per message. Migrate `worker/api/controllers/billing.ts` next quarter.
5. **Ship sub-agent spawning (multi-DO) in next two quarters — yes/no?** **Recommendation: YES.** Cursor 3 + Replit Agent 3 + Devin already there; this becomes a checkbox loss within 6 months. Each sub-agent = separate DO instance, parent orchestrates.

## Open threads carrying forward to Cycle 2

- **[Pillar 1 - Architecture]** CSP/network signals on emergent.sh, lovable.dev, manus.im — needs Chrome MCP run for header inspection + network waterfall. Also: Cursor 3 cloud-agent handoff protocol (AG-UI or proprietary?).
- **[Pillar 1]** Manus 27–29 tool catalog — full enumeration to inform `worker/agents/tools/toolkit/` roadmap. e2b enterprise BYOC pricing (sales-gated).
- **[Pillar 2 - Features]** Emergent changelog (@emergent_ai on X), Spawned/Base44/Blink.new full pricing+feature audit. ProductHunt weekly leaderboards. Letta Code deep dive — direct competitor.
- **[Pillar 2]** e2b GitHub releases SDK changelog Mar–Apr 2026.
- **[Pillar 3 - Tech]** TrustLLM status (live framework or just 2024 paper?). Benchmark vibesdk's current CF Container cold-start vs Daytona 27ms / E2B Firecracker. DeepEval metric mapping to IDLE→PHASE_GEN→PHASE_IMPL→REVIEWING states. Letta Code vs vibesdk head-to-head.
- **[Pillar 4 - Market]** LinkedIn role-mix breakdown for Lovable/Replit/Bolt (infra vs sales vs AI ratio). Cursor's $50B close confirmation. Manus post-block path (Butterfly Effect standalone raise?). X virality counts on Lovable BOLA. Augment, Magic.dev, Poolside, Cline 90-day funding deltas.
- **[Pillar 4]** Cloudflare layoff blast-radius — does it hit Workers/DO/Agents teams specifically? Account-rep stability for vibesdk.

## Top-3 findings to surface in orchestrator notification

1. Cloudflare Agents Week shipped Sandbox GA + Agent Memory + AI Search as first-party primitives — vibesdk built custom equivalents and should migrate while CF support runway exists (post-1,100-person layoff).
2. Lovable BOLA crisis + 91.5% AI-hallucinated-vulnerability rate opens "trustworthy vibe-coding" positioning lane; vibesdk's secrets-DO + sandbox isolation + adding DeepEval phase gates is the cheapest moat available.
3. The "prototype in Lovable → graduate to Cursor/Claude Code" Reddit narrative is now dominant — vibesdk must pick a side (own graduation via export, or fight retention via prod-ops loop) before the perception of "disposable scaffolding" hardens.
