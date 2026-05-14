# Competitive Research Loop — Index

**Purpose:** Continuous (every-4h) competitive + technology intel collection for vibesdk-vs-emergent positioning.
**Drop pattern:** `YYYY-MM-DD-HHMM-runNNN.md` — each run is timestamped + numbered.
**Rotation:** 4 pillars, one per run. Rotation locks topical diversity so we don't re-research the same thing.

## The 4 Pillars (rotate)

```
# schema: pillar|n|focus|owner-prompt-tag
1|architecture|competitor stacks, hosting, agent loops, hidden infra signals|architecture
2|features|recent launches, pricing changes, new tiers, UX shifts|features
3|tech|state-of-art for agent memory, RAG, sandboxes, model routing|tech
4|market|funding rounds, hiring signals, customer wins/losses, X/HN chatter|market
```

## Schedule

Recurring agent: `cron 0 */4 * * *` (every 4 hours local IST) → research-loop task in `~/.claude/scheduled-tasks/`. See [LOOP.md](LOOP.md) for the contract.

## Run Log

```
# schema: run|date-IST|pillar|file|key-finding
016|2026-05-14 18:00|features|2026-05-14-1800-run016.md|Lovable 2.0 GA: multiplayer (20 users), Chat Mode Agent (read-only reasoning), Security Scan on publish, Dev Mode (in-browser code edit), Visual Edits, custom domains. Lovable MCP Server Preview (May 7): Lovable now EXPOSES itself as MCP server — MCP gap is now bilateral (consumer + provider); vibesdk has zero MCP exposure → CRITICAL. Bolt: Claude Sonnet 4.6 default, v1 Agent sunset Aug 3, MCP consumer connections. Cursor: Context Usage Breakdown dashboard (token spend per category — easy vibesdk UX win). Replit Agent 4: instant micro VM branching (git-DO branching is equivalent — needs counter-marketing), 90% auto merge-conflict resolution (design needed for parallel sub-agent merge strategy). Feature gap table updated: MCP-provider P2, security-scan P1, parallel-subagents P0 unchanged.
015|2026-05-14 17:30|architecture|2026-05-14-1730-run015.md|@cloudflare/think API confirmed: runFiber() + subAgent() typed RPC + five-tier Execution Ladder. Agents SDK v0.12.4 (May 13) REMOVES ChatOptions.tools (breaking) + ADDS cancelOnClientAbort (directly useful for vibesdk WS reconnect). CF parity claim: after benchmark fixes, CF on-par with Vercel EXCEPT Next.js — but zero DO agent hot-path numbers exist publicly (vibesdk opportunity). Terminal Use (YC W26) launched: filesystem-first agent deployment, Claude Agent SDK adapter, persistent forkable FS, sandbox tech unconfirmed (FUSE overhead cited). Spike recommendation: adopt Fibers + subAgent RPC in S9; hold Execution Ladder lift-and-shift until API stabilizes.
014|2026-05-14 17:00|market|2026-05-14-1700-run014.md|Cycle 3 market close. Sierra $950M @ $15B (May 2026); agentic coding AI: $2.66B raised YTD +142.6%. Lovable BOLA: 48-day exposure (Feb 3–Apr 20) + all public projects going private — isolated-DO architecture is direct counterpoint. YC S26 RFS hard-tech pivot (agriculture robots/drone defense/lunar) — coding tools not prioritized, software moat compressing. Cloudflare RIF: revenue $639.8M/q +34% YoY (healthy), but DO velocity risk 2–3 quarters. SpaceX/Cursor IPO June 2026 anchors acquisition timing — neutral-platform lane opens 4–8 months. ARR ladder: Lovable $400M >> Emergent $100M >> Bolt $40M (winner-take-most dynamics active). Cycle 3 complete → cumulative-summary-cycle-3 owed.
S8|2026-05-14 22:30|implementation|2026-05-14-s8-summary.md|S8 complete: 11 commits, 28 files, 3390 insertions. Mastra PhaseWorkflow wired into phasic.ts (plan→implement→eval). AgentMemoryClient persist phase eval results. STATE_DELTA RFC 6902 patches emitted via WebSocket. NullMemoryClient + memory barrel. 15 unit tests across evalGate + NullMemoryClient. ADR-006 S9 spike plan (CF Project Think + Memori pilot). All TypeScript clean (0 errors each commit).
013|2026-05-14 18:38|architecture|2026-05-14-1838-run013.md|Two run009 threads closed: (a) Manus "My Computer" desktop confirmed on E2B Firecracker microVMs via E2B's own Manus case study (≤125ms boot, <5MiB overhead/VM); (b) Cognition Apr-23 "What We Learned Building Cloud Agents" post confirms microVM + hypervisor-level snapshot stack ("over a year of hypervisor engineering," thousands concurrent VMs, machine-state snapshots incl. memory/process trees/FS). Vercel Fluid Compute benchmark (Theo Browne) now public sales ammo: claims 2.55× avg faster than CF Workers, Next.js 3.55×, "1 in 5 Workers requests >10s on Next.js/SvelteKit" — methodology asymmetric (Workers 128MB shared vs Fluid 2vCPU/4GB), but the narrative against vibesdk's CF Workers runtime is now in the wild. Replit Agent 4 parallelism = pipeline of specialized sub-agents (explore/test/build), Pro/Enterprise-gated; per-DO vs per-container topology STILL BLOCKED. No new May-2026 Cursor sandbox tier off Colossus 2 deal — still API-token model, not user-visible compute tier. New competitor surfaced: YC W26 "Terminal Use" ("Vercel for background agents") — infra-layer threat closer to vibesdk than agent-IDE peers; watch next cycle. All other competitors (emergent/bolt/v0/lovable/blink) header-stable over 30h.
012|2026-05-14 14:00|decision|2026-05-14-1400-run012.md|Out-of-rotation Decision run (Owner-directed). ADR-005 written: Mastra AI INCLUDE (CF deployer + DO storage + TS-first), Claude/Mastra Skills INCLUDE (universal SKILL.md), Hermes Agent AVOID (Python 88%, no Workers support), ApeRAG AVOID (K8s + 4 mandatory DBs — destroys 43x cost moat). Does NOT consume the market-pillar slot — next market run still owed.
011|2026-05-14 12:07|tech|2026-05-14-1207-run011.md|Memori Labs UNBLOCKED: live OSS repo (14.4k★, Apache 2.0, v3.3.3 May 5), Python+TS SDKs, free dev tier, self-reported LoCoMo 81.95% at 4.97% of full-context tokens — pilotable today as trace-native memory layer for vibesdk's phase state-machine. OpenAI Agents SDK 0.14 Sandbox Client interface confirmed at source: `RunConfig(sandbox=...)` injection w/ Unix/Docker reference impls — exact shape vibesdk sandbox factory should mirror. LiteLLM Managed Agents Platform Alpha pre-announced for May 18 Town Hall — self-hosted multi-agent infra w/ per-team sandbox isolation + cross-restart session persistence, direct overlap w/ OpenAI Agents SDK. Still BLOCKED: CF AI Gateway unified-billing fee % (docs describe mechanics, omit %); Pinecone Nexus benchmarks (VentureBeat: "one financial test case, awaiting third-party eval"). Mem0/Letta/Zep/CF Agent Memory/Pinecone all UNCHANGED in 13.5h — expected for short window.
010|2026-05-14 08:07|features|2026-05-14-0807-run010.md|Cursor shipped multi-repo cloud-agent dev environments (May 13) w/ Dockerfile + build secrets + audit logs; Manus shipped Preferred Browser (May 12) & confirmed Meta ownership on-site; Blink.new pricing mirrors Lovable's $25/$50/$200 ladder exactly — vibe-coding tier shape has converged.
009|2026-05-14 06:38|architecture|2026-05-14-0638-run009.md|Header/CSP probes UNBLOCKED via plain curl -I (run005 carryover resolved). Hosting topology bifurcated: CF front-door (bolt/lovable/replit/e2b origin) vs Vercel front-door (v0/cursor/devin); emergent=Framer, manus=AWS CloudFront, Blink.new=Railway-edge — nobody else runs on CF Workers+DO+D1 as agent runtime, that's vibesdk's actual moat (not "CF-hosted"). Correction to run008: SpaceX (not xAI) is Cursor acquirer — $10B partnership active, $60B option later 2026, $10B breakup fee. e2b at 88% Fortune 100 / 500M+ sandboxes / $21M Series A — production scale confirmed. Lovable = Supabase-orchestrated (Lovable Cloud). Blink.new = multi-vendor (Railway+Fly.io+Firebase) — direct architectural contrast to vibesdk single-stack.
008|2026-05-14 02:38|market|2026-05-14-0238-run008.md|xAI preempted Cursor's $2B/$50B round w/ $60B option-to-acquire (Apr 21) — Cursor likely becomes Musk-orbit; reshapes top of stack & opens neutral-platform lane. Cloudflare 1,100 RIF (May 7-8, ~20%) explicitly hit Workers/DO/R2/Queues teams; stock -23-24% → vibesdk single-platform-bet now carries material velocity/IR risk for ≥2 quarters. v0 (Vercel) quietly shipped full-stack sandbox + Git panel + Snowflake/AWS DB integrations in 2026 — directly converges on vibesdk full-stack-from-chat differentiator w/ Vercel distribution behind it. Poolside $12B (Oct 25), Augment $252M, Magic.dev seeking $200M @ $1.5B — gap to Cursor/Cognition widening not closing. Lovable BOLA arc (denial→HackerOne-blame→apology) viral on X (@weezerOSINT). Closed: Cursor $50B (NO — xAI deal instead), X virality on BOLA (CONFIRMED). Still BLOCKED: LinkedIn role-mix, Cline 90-day delta, Manus post-block path, S26 batch date.
007|2026-05-13 22:38|tech|2026-05-13-2238-run007.md|Memori Labs (May 7) shipped trace-native agent memory built from tool calls/execution paths (not conversation) — conceptually best fit yet for vibesdk's phase state-machine. Pinecone Nexus expanded May 6 (KnowQL query lang + Marketplace + Builder $20/mo + Frankfurt region). OpenAI Agents SDK 0.14 (May 11) makes Cloudflare a first-class sandbox adapter alongside E2B/Daytona. CF AI Gateway now 70+ models / 14+ providers / unified billing — single-platform routing path materially stronger than 22h ago. Most other subdomains UNCHANGED in 22h window (Mem0, Letta, Zep, LightRAG, Daytona, E2B, DeepEval).
006|2026-05-13 18:38|features|2026-05-13-1838-run006.md|Parallel sub-agent execution shipped at Replit (Agent 4, Mar 11), Cursor (3.3 Build-in-Parallel, May 7), Devin (May Agents tab) in <60d — parallel forks now table-stakes, not differentiator. Replit Series D $400M @ $9B val. Emergent $100M ARR (doubled from $50M in 1 mo). Cursor MS Teams @Cursor dispatch (May 11). Bolt Opus 4.7 + real-time multiplayer + role-based sharing. Lovable simplified to Pro $25 flat + mobile + MCP (Notion/Linear/Confluence/Jira/n8n) + Themes + Chat Mode. Manus rebranded "Meta's Manus" (contradicts run005 block-finalized — needs follow-up) + My Computer desktop. Bugbot effort tiers (Default/High/Custom) converge w/ Devin ACU model. vibesdk DO architecture well-positioned to ship parallel sub-agents fast. New entrants: Blink.new (PH-surfaced, needs deep-fetch).
005|2026-05-13 08:12|architecture|2026-05-13-0812-run005.md|Closed 4 of 7 prior open Qs: Replit Agent 3 = metered (not flat) effort/checkpoint billing; Devin DeepWiki = effort-tiered ACU budget refresh; Lovable model = GPT-4 Mini + Claude orchestration; e2b BYOC ~$3k/mo (3rd-party). Deltas: v0 fully token-metered (3× cheaper output), Replit Core $20→$25, Bolt × Azure/M365 partnership, Lovable mobile, Cursor 3.2 Multitask, Devin SWE-1.6 +11%, CopilotKit $27M Series A confirmed, Manus-Meta block finalized. New entrants: Terminal Use, Tensol, Cardboard, IncidentFox (YC W26). Top arch insight: token-metered per-phase cost preview (v0+Replit convergence) — touch byokHelper.ts + new effortEstimator.ts + websocketTypes.ts. CSP/header probes still BLOCKED — need browser-MCP next architecture cycle.
004|2026-05-13 04:12|market|2026-05-13-0412-run004.md|Capital bifurcated: top-tier (Cursor $50B, Cognition $25B, Replit $9B) doubled in <6mo while vibe-coding tier (Lovable $400M ARR, Emergent $100M ARR/8mo, Bolt+Azure) is fastest-growing revenue cohort in software history; Lovable Apr'26 security crisis + Cloudflare May 7 AI-first layoff (1,100) open a "trustworthy CF-native vibe-coding" lane for vibesdk
003|2026-05-13 00:07|tech|2026-05-13-0007-run003.md|vibesdk has zero memory/RAG/eval/routing layer vs SOTA (Mem0 91.6 LoCoMo, Zep 94.8 DMR, DeepEval 50+ metrics); Cloudflare Q2'26 shipped Agent Memory + AI Search + Sandbox GA as drop-in fixes on same platform
002|2026-05-12 10:38|features|2026-05-12-1038-run002.md|Agent-IDE bar reset: Cursor 3 + Composer 2, Replit Agent 3 sub-agents, Devin 2.0 ACU pricing; Manus shipped 8+ features in 60d; vibesdk gap: sub-agents, parallel worktrees, app monitoring, effort-based pricing
001|2026-05-12 13:23|architecture|2026-05-12-1323-run001.md|Devin collapsed $500→$20/mo; Lovable $400M ARR @ $6.6B val; Manus uses E2B+Sonnet+29 tools
```

(Newest at top going forward.)

## Cumulative Knowledge Base

After every 4 runs (1 cycle = 1 of each pillar), the @Architect agent reads all 4 fresh runs + the prior cumulative summary, and produces a new **CUMULATIVE-SUMMARY-CYCLE-N.md**. Old per-run files stay for evidence, but the cumulative is what informs decisions.

## Stop conditions (when "24/7" actually stops)

The loop runs until ANY of:
1. **Owner pauses it** — `mcp__scheduled-tasks__update_scheduled_task` w/ `enabled: false`
2. **Production launch GO** — Razorpay live + first paying customer
3. **Cost ceiling hit** — if Anthropic-API spend on research alone exceeds $20/month, pause (sanity check)
4. **Findings duplication** — when 3 consecutive runs surface 0 new facts, auto-pause for a week

## Manually trigger a single run

```bash
# Force-run the scheduled task now (doesn't wait for cron)
# Find the taskId via list_scheduled_tasks, then invoke its skill directly.
```

## Files in this folder

| File                                | What it is                                          |
|-------------------------------------|-----------------------------------------------------|
| `INDEX.md`                          | This file — run log + schedule overview             |
| `LOOP.md`                           | Contract for the recurring task (prompt + rules)    |
| `YYYY-MM-DD-HHMM-runNNN.md`         | One file per research run, evidence-cited           |
| `CUMULATIVE-SUMMARY-CYCLE-N.md`     | Synthesis every 4 runs                              |
