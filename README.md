# FARTNODE
> Turns JPEG narratives into live Solana economies—vibe-code your token into a playable utility app.

FARTNODE is a Solana-focused fork of Cloudflare's VibeSDK. We are reshaping the original LLM-powered web-app generator into a **token utility toolkit** that ships:

- A Solana-aware control panel and templates (`Arcade`, `RPG-Lite`).
- Anchor programs for **points**, **quests**, **rewards/escrow**, and **registry/attestation**.
- TypeScript client SDKs and build scripts that wire those programs into the UI.
- A rigorous `fart.yaml` schema + validator so every build is deterministic and safe (devnet by default).

> ⚠️ **Current status:** This branch (`scaffolding/fartnode-skeleton`) delivers the bootstrap: folder layout, config schema, AJV validator wiring, stubs for clients/programs/scripts, and a Solana tab in the UI. The on-chain logic, Phantom flows, and template uploads land in the next PRs (see roadmap).

---

## TL;DR for reviewers
- **Goal:** Autonomously turn a mint + vibe prompt into a playable Solana mini-app with provable on-chain utility.
- **Today:** Repo compiles with Solana scaffolding; no RPC calls yet. Preview container ships with Rust/Solana/Anchor toolchain ready for future phases.
- **Next:** Wallet + RPC (PR-002) → real programs + preflight (PR-003) → R2 templates (PR-004) → provenance + docs polish (PR-005).

---

## Quickstart (local)

```bash
# Clone and install
bun install

# Type-check and build (runs tsc + vite)
bun run build

# Spin up the app shell (UI still mostly VibeSDK until later PRs)
bun run dev
```

The repo uses **Bun** and Node 18+. If Bun is unavailable in your workflow you can substitute `npm install` / `npm run`.

---

## Repository layout

```
app/web/                 React workspace for Solana control panel + previews (stubbed)
packages/@fartnode/*     TypeScript client SDK scaffolding for each Anchor program
programs/                Anchor workspace (points, quests, escrow, registry stubs)
schemas/fart.schema.json JSON Schema for fart.yaml configs
scripts/                 Operational entry points (devnet deploy, publish templates, etc.)
shared/fartnode/         Shared config types + AJV validator wiring
src/fartnode/            UI namespace for Solana-specific components
fart.yaml.example        Sample configuration aligned with the schema
ARCHITECTURE.md          High-level system notes
SECURITY.md              Safety rails and follow-ups
SUBMISSION.md            Judge-facing checklist for the finished build
SandboxDockerfile        Preview container now includes Rust, Solana CLI, Anchor toolchain
wrangler.jsonc           Cloudflare worker config (renamed to `fartnode`)
```

---

## `fart.yaml` schema & validation

- Schema lives at `schemas/fart.schema.json` (TypeScript literal in `shared/fartnode/config/schema.ts`).
- The AJV validator is exported via `shared/fartnode/config/validateConfig.ts` and re-exported for the frontend at `src/fartnode/config/validateConfig.ts`.
- `worker/api/controllers/agent/controller.ts` now calls `assertFartConfig` whenever a build request includes `fartConfig`. Invalid configs are rejected before any generation work starts.

### Example (`fart.yaml.example`)
```yaml
project:
  name: FARTNODE Arcade Demo
  slug: fartnode-arcade
  description: Devnet playground wiring points, quests, and escrow flows.
solana:
  cluster: devnet
  programs:
    points: 6B2f3kVVaNY89qB3nXtK7Cf8YpYdRzY1Cq5h8kuSZ4zt
    quests: 8qv6Ycp1i6itV7YcCjPV6d4jPAjNVQYg8St1dD4KmG7Z
    escrow: 5oXmX8XgFu5XjafypvQYbv8XwsnR6bY5d3A6xHS98CDM
    registry: 7pMvBuvgG8AqCgd2APuYw4U9d1Mnr4Xu7rgUXZqQFKmc
modules:
  points: { enabled: true }
  quests: { enabled: true }
  escrow: { enabled: true }
```

---

## Preview container upgrades

`SandboxDockerfile` now installs the Rust toolchain, Solana CLI, and Anchor (via `avm`). This lets Cloudflare preview environments run `anchor build/test/deploy` in later phases without manual intervention. Versions are pinned (`anchor 0.30.1`) for repeatability.

---

## Roadmap (PR series)

1. **PR-001 – Solana bootstrap (this branch)**
   - Schema, validator, program/client/templates scaffolding, Solana UI tab, toolchain updates.
2. **PR-002 – Phantom wallet + RPC**
   - Phantom adapter, network selector (devnet default), tx toaster, `rpc.json` overrides.
3. **PR-003 – Anchor programs + preflight**
   - Real points/quests/escrow/registry logic, devnet deploy script populates `app/web/lib/ids.ts`, scripted preflight demonstrating end-to-end flow.
4. **PR-004 – Templates to R2 + generator integration**
   - Upload Arcade/RPG-Lite bundles to R2, teach agent to fetch them, add "generate from fart.yaml" path.
5. **PR-005 – Attestation, Official/Community modes, docs polish**
   - Authority checks, DAO multisig registry, DNS/SIWS fallback, badges/watermarking, final documentation sweep.

---

## Safety rails

- **No trading.** The platform will never generate swap/DEX/ramp functionality.
- **Devnet-first.** All demos default to devnet unless explicitly overridden.
- **Key custody.** Scripts generate ephemeral keys; signing happens client-side in Phantom.
- **Self-healing.** Build agent halts after three failed acceptance attempts and surfaces logs instead of looping blindly.

See `SECURITY.md` for additional notes and follow-ups slated for later PRs.

---

## Contributing

We welcome issues and PRs as the Solana features land. Please:
- Keep additions ASCII unless the file already uses Unicode.
- Respect the safety rails above.
- Coordinate major design shifts via an issue first.

This project inherits the upstream VibeSDK license (MIT). Any modifications introduced here remain open-source.

---

## Contact

Questions or ideas? Open an issue or reach out on the usual Solana + Cloudflare dev channels. We will update this README with live demo links and deployment instructions once the autonomous build completes PR-005.
