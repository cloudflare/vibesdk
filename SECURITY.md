# FARTNODE Security Notes (Bootstrap)

This bootstrap PR lays the groundwork for Solana integrations. The following controls and follow-up items apply:

## Guiding Principles

- **No custody.** Never commit private keys or mnemonics. Preview scripts should generate ephemeral keypairs and airdrop SOL on-demand.
- **Devnet-first.** Default to devnet RPC endpoints and priority fees. Mainnet-beta support is out of scope until attestation is complete.
- **Deterministic builds.** Anchor + Solana CLI versions must be pinned in the preview container to avoid reproducibility drift.
- **Config validation.** `fart.yaml` is validated with AJV before any chain interactions. Invalid configs must short-circuit orchestration.

## TODO in Later PRs

1. Phantom adapter security review (origin whitelisting, auto-approvals disabled).
2. Registry/attestation program authority controls + multisig.
3. Badge watermarking and official vs community gating for unverified mints.
4. Observability + telemetry for all Solana RPC calls (rate limits, retries, structured logs).
5. Hardening around template uploads to R2 (content scanning + integrity hashing).

Report vulnerabilities to the maintainers via private channels (TBD) before disclosing publicly.
