# Upstream Upgrade Guide

How to pull new features from `cloudflare/vibesdk` into `bhavin786/vibesdk` without losing custom SDAE code.

## Architecture: Why Upgrades Are Safe

Our custom code lives in **isolated directories** that upstream will never touch:

```
worker/sdae/           ← ALL our custom engine code (ir, compiler, runner, etc.)
migrations/0005_*      ← Our D1 migration (upstream uses 0000-0004)
docs/SDAE_*            ← Our architecture docs
docs/COST_QUALITY_*    ← Our blueprint docs
docs/UPSTREAM_*        ← This guide
.dev.vars.example      ← Our enhanced env template
```

Upstream's active development areas (`worker/agents/`, `worker/services/`, `src/`, `sdk/`) are untouched by our changes. This means **merge conflicts are extremely unlikely**.

## Git Remote Setup

The repo already has both remotes configured:

```bash
git remote -v
# origin    → bhavin786/vibesdk.git      (our fork)
# upstream  → cloudflare/vibesdk.git      (source)
```

If `upstream` is missing:
```bash
git remote add upstream https://github.com/cloudflare/vibesdk.git
```

## Standard Upgrade Workflow

### 1. Fetch latest upstream

```bash
git fetch upstream main
```

### 2. Check what's changed

```bash
# See commit log of new upstream changes
git log main..upstream/main --oneline

# See which files changed (check for conflicts with our code)
git diff main..upstream/main --stat

# Specifically check if upstream touched our directories (should be empty)
git diff main..upstream/main --stat -- worker/sdae/ docs/SDAE_* docs/COST_QUALITY_*
```

### 3. Merge upstream into main

```bash
git checkout main
git merge upstream/main
```

If there are **no conflicts** (expected in most cases), you're done. Push:

```bash
git push origin main
```

### 4. If conflicts occur

Conflicts would only happen if upstream modifies a file we also changed. Currently the only shared files are:

| File | Risk | Resolution |
|---|---|---|
| `migrations/meta/_journal.json` | Medium | We added entry idx:5. Keep both entries. |
| `worker-configuration.d.ts` | Low | Regenerate with `bun run cf-typegen` after merge. |
| `.dev.vars.example` | Low | We replaced it. Keep ours, add any new upstream vars. |

For any conflict:
```bash
# After merge conflict, review each file
git diff --name-only --diff-filter=U  # list conflicted files

# For each: manually resolve, then
git add <file>
git merge --continue
```

### 5. Post-merge checks

```bash
# Regenerate Cloudflare types (picks up any new bindings)
bun run cf-typegen

# Typecheck
bun run typecheck

# Run tests
bun run test

# Check if new migrations were added by upstream
ls migrations/

# If upstream added new migrations, run them
bun run db:migrate:local
```

## When Upstream Adds New Env Vars

After merging, check for new environment variables:

```bash
# Compare our .dev.vars.example with upstream's
git diff upstream/main -- .dev.vars.example

# Check if worker-configuration.d.ts has new entries
git diff HEAD~1 -- worker-configuration.d.ts

# Search for new env references in changed files
git diff HEAD~1 --name-only | xargs grep -l "env\." 2>/dev/null
```

Add any new variables to our `.dev.vars.example` with proper documentation.

## When Upstream Adds New Migrations

Upstream uses sequential migration numbering (0000, 0001, ..., 0004). Our SDAE migration is `0005`. If upstream adds `0005`:

```bash
# Rename our migration to avoid collision
git mv migrations/0005_sdae_cost_quality.sql migrations/0006_sdae_cost_quality.sql

# Update _journal.json: change our idx from 5 to 6
# Then run both migrations in order
bun run db:migrate:local
```

## Automated Upgrade Script

For convenience, here's a one-liner that does the safe upgrade:

```bash
# Safe upstream merge (aborts if conflicts touch our SDAE code)
git fetch upstream main && \
  git merge upstream/main && \
  bun run cf-typegen && \
  bun run typecheck && \
  bun run test && \
  echo "✅ Upgrade complete" || \
  echo "❌ Check conflicts above"
```

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production — merged upstream + our SDAE code |
| `upstream/main` | Read-only tracking of cloudflare/vibesdk |
| `feat/*` | Feature branches for new SDAE development |
| `sdae-emergent-plan` | Legacy planning branch (can be deleted) |

## Best Practices

1. **Never modify upstream files directly** — always extend in `worker/sdae/` or new files
2. **Integration points** should be thin wrappers that import from both upstream and SDAE modules
3. **New migrations** should always use a number higher than upstream's latest
4. **Run tests after every merge** — upstream's CI tests should still pass with our code present
5. **Tag before upgrading** — `git tag pre-upgrade-$(date +%Y%m%d)` so you can rollback
