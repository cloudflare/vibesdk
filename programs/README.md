# FARTNODE Anchor Workspace

This workspace will house the on-chain programs that back FARTNODE:

- `points` – tracks player reputation, multipliers, and streaks
- `quests` – orchestrates quest states and completion proofs
- `escrow` – time-locks and releases rewards
- `registry` – verifies authority + attestation state

The current implementation is a stub so the preview container can install the toolchain without compiling real logic. Actual program code will land in later PRs.
