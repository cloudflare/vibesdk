# artifacts-viewer

A read-only React repository viewer for Cloudflare Artifacts. This workspace contains the publishable package and a React example application.

The package foundation follows the architecture in `/Users/dhruvil/work/gitflare-next/artifacts-viewer-implementation-plan.md`. Product behavior will be implemented in the phases defined there.

## Workspace

```text
apps/example                 React example application
packages/artifacts-viewer    Publishable npm package
```

The package reserves separate runtime boundaries:

- `artifacts-viewer` for server APIs
- `artifacts-viewer/client` for the framework-independent client
- `artifacts-viewer/react` for React hooks and components
- `artifacts-viewer/styles.css` for compiled, scoped styles

The root and client entry points intentionally contain no unfinished runtime behavior yet.

## Development

- Install dependencies:

```bash
vp install
```

- Run the example with source-level library HMR:

```bash
vp run dev
```

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

## Releases

Record the semver impact and changelog text alongside each publishable change:

```bash
pnpm change
```

Preview and apply a release plan with `pnpm version -r --dry-run` and `pnpm version -r`. Review the version, changelog, and lockfile before creating a GitHub Release whose tag matches `vX.Y.Z`.

The first `artifacts-viewer@0.1.0` publish must be performed manually with npm 2FA because npm requires a package to exist before trusted publishing can be configured. Afterward, configure npm trusted publishing for public repository `mdhruvil/artifacts-viewer`, workflow `publish.yml`, and the `npm publish` permission. Later GitHub Releases publish without a long-lived npm token.
