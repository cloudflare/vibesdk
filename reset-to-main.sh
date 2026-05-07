#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Saving local changes..."
if git diff --quiet --ignore-submodules -- && git diff --cached --quiet --ignore-submodules -- && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  stash_created=false
else
  git stash push --include-untracked --keep-index -m 'reset-to-main temporary'
  stash_created=true
fi

git checkout main

echo "Working directory: $(pwd)"
echo "Repo root: $(git rev-parse --show-toplevel 2>/dev/null || echo 'not a git repo')"
echo "Current branch: $(git branch --show-current)"
echo "Current remotes:"
git remote -v

if git remote get-url upstream >/dev/null 2>&1; then
  fetch_remote=upstream
  target_branch=main
  echo "Resetting to upstream/main..."
else
  fetch_remote=origin
  target_branch=main
  echo "No upstream remote found. Resetting to origin/main instead."
fi

git fetch "$fetch_remote"

if git show-ref --verify --quiet refs/remotes/$fetch_remote/$target_branch; then
  git reset --hard "$fetch_remote/$target_branch"
else
  echo "Error: branch '$target_branch' not found on remote '$fetch_remote'."
  exit 1
fi

echo "New local HEAD after reset: $(git rev-parse HEAD)"
echo "Local branch status:"
git status --short --branch

if git remote get-url origin >/dev/null 2>&1; then
  echo "Force-pushing the synced main branch to origin..."
  git push --force origin main
else
  echo "Warning: no origin remote found, skipping push."
  exit 1
fi

echo "Remote branch HEAD after push:"
git ls-remote origin main

if [ "$stash_created" = true ]; then
  echo "Re-applying local changes..."
  if ! git stash pop --index; then
    echo "Stash pop failed. Your local changes are still saved in stash."
    echo "Run: git stash list"
    exit 1
  fi

  echo "Committing rebranding changes..."
  git add .
  git commit -m "Rebranding changes"

  echo "Pushing rebranding changes to origin..."
  git push origin main
fi

echo "✓ Done! Your local main is synced to upstream/main and rebranding changes are pushed to your fork."
echo ""
echo "Next steps:"
echo "  1. Run: bun install"
echo "  2. Verify changes with: git status"
