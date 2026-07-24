# AGENTS.md

## Tooling
- Use Bun from the repository root. The tracked lockfile is `bun.lock`, the `space` workspace dependency uses `workspace:*`, and install/build hooks invoke Bun even when started through npm.
- `bun run setup` is the interactive Cloudflare/resource bootstrap. Local development expects the generated `.dev.vars`; never commit `.dev.vars*` or `.prod.vars`.
- `bun run dev` starts the React frontend and Worker together through `@cloudflare/vite-plugin` at `http://localhost:5173`. There is no separate Worker dev command.
- `bun run dev:browser` is an optional local Chromium sidecar for the think agent's browser-console tool; absence only produces a warning.

## Verification
- Root checks: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`.
- `bun run build` builds `space` and the Vite/Worker bundle; it does not typecheck. Run `bun run typecheck` separately.
- Focus a root test with `bunx vitest run path/to/file.test.ts`; test execution uses the Workers pool and `wrangler.test.jsonc`.
- The root Vitest suite excludes all `sdk/test/**` and `container/monitor-cli.test.ts`. SDK tests use Bun: `bun run --cwd sdk test`.
- SDK integration tests require a running root dev server and `VIBESDK_INTEGRATION_API_KEY`; run `bun run --cwd sdk test:integration`. They can take 5-10 minutes; `VIBESDK_INTEGRATION_RUN_PREVIEW=1` enables the slower preview case.
- Root typecheck/lint do not validate `space` or `sdk`. For touched packages run `bun run --cwd space typecheck` / `bun run --cwd space build` and `bun run --cwd sdk package` as appropriate.
- ESLint checks only `src/**` and `worker/**` and deliberately ignores tests; do not treat `bun run lint` as repository-wide validation.
- Pre-commit typechecks staged TypeScript and runs related Vitest tests. `RUN_ALL_TESTS=1` selects its broader suite; `SKIP_TESTS=1` bypasses the hook.

## Boundaries
- `src/` is the React app (`src/main.tsx`, routes in `src/routes.ts`). API contracts live in `src/api-types.ts`; frontend HTTP calls belong in `src/lib/api-client.ts`.
- `worker/index.ts` is the Worker entrypoint and Durable Object export surface. Hono middleware/routes are wired by `worker/app.ts` and `worker/api/routes/index.ts`.
- `space/` is the only declared workspace package. It provides the git-backed `SpaceDO` used by the think agent and is bundled before the root app; edit implementation in `space/src`, never generated `space/dist`, and keep the hand-maintained `space/types/index.d.ts` aligned with public exports.
- `sdk/` is an independent Bun package with its own lockfile, scripts, and tests. It imports the platform WebSocket protocol from `worker/api/websocketTypes.ts`, so protocol changes must remain SDK-compatible.
- Shared frontend/backend types belong in `shared/`; Worker-only types stay under `worker/`.

## Change Paths
- API endpoint: update `src/api-types.ts` -> `src/lib/api-client.ts` -> `worker/database/services/` (when persistence is needed) -> `worker/api/controllers/` -> `worker/api/routes/`, then register the route in `worker/api/routes/index.ts`.
- WebSocket message: update `worker/api/websocketTypes.ts`, backend handling in `worker/agents/core/websocket.ts`, and frontend handling in `src/routes/chat/utils/handle-websocket-message.ts`; verify SDK tests because its protocol re-exports these types.
- LLM tool: add it under `worker/agents/tools/toolkit/` and register it in `worker/agents/tools/customTools.ts` (`buildTools` or `buildDebugTools`). The think behavior has a separate tool path and bypasses `buildTools`.
- D1 schema source is `worker/database/schema.ts`; generate migrations into `migrations/` with `bun run db:generate`, then apply locally with `bun run db:migrate:local`.
- After changing Wrangler bindings, run `bun run cf-typegen`; `worker-configuration.d.ts` is consumed by setup and TypeScript configs.

## Constraints
- Do not introduce new `any` types even though ESLint currently permits existing ones; find or define a concrete type. Frontend API types should import from `@/api-types`.
- Worker code reads bindings from `env`; do not use Vite environment variables there.
- All `/api/*` routes are owner-only by default in `worker/app.ts`; public routes must explicitly follow the existing auth override pattern.
- User secrets RPC methods return `null`/`boolean` on failure rather than throwing; preserve that contract when editing `worker/services/secrets/`.
- For usage-limit UI behavior and its cross-component invariants, read `docs/usage-limits-ui.md` before editing the badge, credits banner, or limit popups.
