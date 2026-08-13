# Publishing `artifacts-viewer`

Versions and changelogs are managed by pnpm's native release tooling (`pnpm change` +
`pnpm version -r`). Publishing to npm is done by GitHub Actions via OIDC trusted
publishing — no token is ever held locally or in repository secrets.

Never hand-edit `version` in `packages/artifacts-viewer/package.json`, and never
hand-write `CHANGELOG.md`. Both are generated.

---

## 1. Record a change intent (during development)

Every change that affects the published package needs an intent. Record it in the
same commit as the code change:

```sh
pnpm change
```

This prompts for the affected packages, the bump type, and a summary that becomes the
changelog entry. It writes a file such as `.changeset/calm-cats-resolve.md`.

Non-interactive equivalent:

```sh
pnpm change --bump patch --summary "Fix raw path encoding for nested files" artifacts-viewer
```

Bump types are `patch`, `minor`, `major`, or `none`. Use `none` to explicitly record
that a change needs no release.

Changes limited to documentation, CI, or private workspace apps do not need an intent.

Commit the generated markdown file alongside the code:

```sh
git add .changeset/ packages/
git commit -m "fix: encode raw path segments individually"
```

## 2. Preview the release plan

At any point, see what the pending intents would produce:

```sh
pnpm change status
pnpm version -r --dry-run
```

`change status` lists the pending intent files and the resulting version bumps.
`version -r --dry-run` prints the same plan without touching the working tree.

## 3. Apply the release

The working tree must be clean.

```sh
pnpm version -r
```

This consumes every pending intent and:

- bumps `version` in `packages/artifacts-viewer/package.json`
- propagates bumps to any workspace dependents through `workspace:` ranges
- writes `packages/artifacts-viewer/CHANGELOG.md` (we set
  `versioning.changelog.storage: repository` in `pnpm-workspace.yaml`)
- records the consumed intents in `.changeset/ledger.yaml`

It deliberately does **not** create a git commit or tag. pnpm skips those in recursive
mode because a workspace release can bump several packages to different versions.

Verify the workspace still passes before committing:

```sh
vp run ready
```

## 4. Commit and tag

Read the new version back out rather than typing it, so the tag can never disagree
with the manifest:

```sh
VERSION=$(node -p "require('./packages/artifacts-viewer/package.json').version")

git add .
git commit -m "chore(release): artifacts-viewer@${VERSION}"
git tag -a "v${VERSION}" -m "artifacts-viewer@${VERSION}"
git push origin main --follow-tags
```

The tag **must** be exactly `v<version>`. `publish.yml` compares the two and fails the
release if they differ.

## 5. Create the GitHub release

```sh
gh release create "v${VERSION}" --title "v${VERSION}" --generate-notes
```

Publishing to npm triggers on the `release: published` event, so creating the release
is what starts the publish.

## 6. Watch the publish

```sh
gh run watch
```

`.github/workflows/publish.yml` then:

1. runs `vp install --frozen-lockfile`
2. validates that the release tag equals `v<package.json version>`, failing otherwise
3. runs `vp run ready`
4. runs `pnpm pack` then `npm publish <tarball>` from `packages/artifacts-viewer`
   (`pnpm pack` rewrites `catalog:` ranges; plain `npm publish` does not —
   that is how 0.0.3 shipped broken). pnpm is installed via `pnpm/action-setup`

Authentication is OIDC trusted publishing (`permissions: id-token: write`). There is no
`NODE_AUTH_TOKEN`. npm generates an SLSA provenance attestation automatically.

Confirm the result. Run this **outside** the repository — the root manifest's
`devEngines` requires pnpm, so npm commands fail with `EBADDEVENGINES` from inside it:

```sh
(cd /tmp && npm view artifacts-viewer dist-tags)
```

---

## Trusted publishing configuration

Configured on npmjs.com for the package:

| Field             | Value              |
| ----------------- | ------------------ |
| Organization      | `mdhruvil`         |
| Repository        | `artifacts-viewer` |
| Workflow filename | `publish.yml`      |
| Environment       | _(empty)_          |

The binding is to that workflow filename. Renaming `publish.yml`, or moving the
`npm publish` step into a different workflow file, breaks publishing until the trusted
publisher is reconfigured.

## Things that will bite you

- **Do not add `publishConfig.provenance: true`.** Provenance requires OIDC, so the flag
  would break any local publish. CI generates provenance automatically without it.
- **Avoid publishing from your laptop.** `pnpm publish` rewrites the workspace root
  `package.json` and strips `"private": true`. If you ever must publish locally, check
  `git diff` afterwards and revert the root manifest.
- **The first publish already happened.** `0.0.0` was a placeholder published by hand to
  bootstrap trusted publishing, and it permanently occupies the `placeholder` dist-tag.
  Every release from `0.0.1` onward goes through CI.
- **Intents are consumed, not reused.** Once `pnpm version -r` runs, the intent files are
  deleted and recorded in `.changeset/ledger.yaml`. Do not restore them by hand.

## Quick reference

```sh
# during development, per change
pnpm change

# at release time
pnpm version -r
vp run ready
VERSION=$(node -p "require('./packages/artifacts-viewer/package.json').version")
git add . && git commit -m "chore(release): artifacts-viewer@${VERSION}"
git tag -a "v${VERSION}" -m "artifacts-viewer@${VERSION}"
git push origin main --follow-tags
gh release create "v${VERSION}" --title "v${VERSION}" --generate-notes
```
