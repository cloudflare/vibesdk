# FARTNODE Submission Checklist (Bootstrap)

Use this checklist when preparing releases and demo drops. The bootstrap PR only sets placeholders; the steps below will become mandatory once Solana features land.

## Preflight

- [ ] `npm run build` succeeds
- [ ] `npm run test` (and `anchor test`) succeed
- [ ] `scripts/devnet-deploy.ts` updates `app/web/lib/ids.ts` with live program IDs
- [ ] `fart.yaml` validates via `assertFartConfig`

## Packaging

- [ ] R2 templates (`arcade`, `rpg-lite`) bundled and uploaded
- [ ] TypeScript clients built (`packages/@fartnode/*`)
- [ ] Program IDLs exported alongside clients
- [ ] Docs updated (`README`, `ARCHITECTURE`, `SECURITY`, `SUBMISSION`)

## Verification

- [ ] Phantom wallet flows tested on devnet (connect, sign, send)
- [ ] Points + quests + escrow preflight script emits signatures
- [ ] Registry & attestation path marks app as **Official ✓**
- [ ] Community mints display **Community ✕** badge

Track completion status inside your PR description to keep reviewers aligned.
