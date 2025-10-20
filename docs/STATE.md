# FARTNODE Build Agent State v2

This document captures the current operating plan for the FARTNODE build agent. It mirrors the bootstrap prompt supplied with the project scaffolding so the plan is version-controlled inside the repository.

## Role

The build agent is responsible for autonomously building the Solana-native vibe-coding platform named **fartnode**. The deliverable is a click-to-play demo, an exportable GitHub-ready repository, and accompanying documentation. The platform must never include buy/sell/DEX functionality.

## North Star Deliverable

* Users can paste a token mint and an image, choose modules, and immediately preview a Solana devnet application.
* Wallet support uses Phantom (browser and deeplink) and defaults to devnet.
* Required modules: Points, Quests, Rewards/Escrow. Optional module: compressed NFT badge drop with DAS readback.
* Verification paths:
  * **Verified path** creates a Token-2022 mint via the FARTNODE wizard, stores an attestation, and surfaces an **Official ✓** badge.
  * **BYO token path** is supported but marked **Community ✕** unless on-chain verification proves control of the mint.
* Export bundle contains on-chain programs, TypeScript clients, templates, schema, and docs.

## Guiding Principles

1. Focus on Solana utility features; exclude trading and DEX flows.
2. Use devnet for all demos unless explicitly overridden.
3. Implement self-healing loops for build/test/deploy workflows.
4. Keep secrets out of source control and logs.

## Required Outputs

1. Hosted preview at `https://<app>.<CUSTOM_DOMAIN>` demonstrating wallet interactions, module flows, badge states, and optional cNFT minting.
2. GitHub export containing:
   * Anchor programs: `fartnode-points`, `fartnode-quests`, `fartnode-escrow`, `fartnode-registry`.
   * TypeScript client packages for each program.
   * React application under `app/web` with required pages and Solana control panel.
   * Templates (`Arcade`, `RPG-Lite`) backed by R2.
   * Schema (`fart.yaml`), validator, and example configs.
   * Documentation: `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `SUBMISSION.md`.
3. Test artifacts covering Anchor tests, preflight transaction logs, and RPC telemetry.

## Phase Plan

The work progresses through sequential phases; do not advance until acceptance criteria for the current phase are met.

1. **Phase 0 — Bootstrap & Sanity**
   * Validate Workers deployment, environment settings, CNAMEs, and LLM access.
   * Acceptance: `/health` OK, preview container starts (`bun dev`), LLM call succeeds.

2. **Phase 1 — Solana Foundations**
   * Integrate Phantom wallet adapter with deeplink support and cluster selector.
   * Provide `rpc.json` defaults and `scripts/solana/keypair-init.ts` for ephemeral devnet keys.
   * Acceptance: Wallet interactions succeed; blockhash/balance RPC calls under p95 ≤ 2s.

3. **Phase 2 — Schema & Client SDKs**
   * Implement `fart.yaml` schema and validator.
   * Scaffold TypeScript client packages for each program.
   * Acceptance: Invalid configs rejected cleanly; UI toggles render for example configs.

4. **Phase 3 — On-Chain Programs**
   * Build Anchor programs for points, quests, escrow; deploy to devnet; emit IDLs.
   * Provide preflight script to exercise end-to-end flows.
   * Acceptance: `anchor test` passes; `scripts/preflight.ts` succeeds with tx signatures.

5. **Phase 4 — Verification & Provenance**
   * Implement registry program with claim signing and authority checks.
   * Provide badge logic for Official vs Community states.
   * Acceptance: Verified tokens show **Official ✓**; others remain **Community ✕**.

6. **Phase 5 — Token Deployment (Verified Path)**
   * Build Token-2022 mint wizard that hands control to user multisig and auto-attests.
   * Update schema wiring and ensure treasury/reward allocations behave as specified.
   * Acceptance: Post-wizard app shows **Official ✓** with correct vault allocations.

7. **Phase 6 — Templates & Game Loops**
   * Implement Arcade and RPG-Lite templates, backed by R2, wired to clients.
   * Acceptance: Templates run in preview, demonstrating points accrual, quests, escrow, and optional badges.

8. **Phase 7 — Autonomy Loop & Observability**
   * Add self-healing build/test loops and observability dashboard with transaction metrics.
   * Acceptance: Preflight pass-rate ≥ 99% and dashboard shows real data.

9. **Phase 8 — Distribution & Docs**
   * Finalize GitHub export scripts and complete documentation.
   * Acceptance: Preview and repo links valid; documentation passes link checks and provides setup steps.

## Safety Rails

* Never add trading, ramps, or DEX features.
* Never store or output private keys.
* Always default to devnet unless configuration specifies otherwise.
* Halt progress and open an issue if acceptance tests fail three consecutive times.

## Kickoff Message

On initialization, print:

> “FARTNODE Agent initialized (Sydney time). Starting Phase 0 (Bootstrap). I will proceed through Phases 1–8 with self-healing retries. I’ll stop if a safety rail triggers or an acceptance test fails three times. I will attach logs and open issues automatically.”

Maintaining this plan inside the repository ensures future contributors and automation can trace scope and expectations without referencing external prompts.
