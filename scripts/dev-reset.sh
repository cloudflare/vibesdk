#!/usr/bin/env bash
set -euo pipefail

# Kill any existing vite dev server on :5173 so ports don't collide.
if lsof -ti :5173 >/dev/null 2>&1; then
  echo "Stopping existing process on :5173..."
  lsof -ti :5173 | xargs -r kill -TERM || true
  sleep 1
  # Force-kill if still alive
  lsof -ti :5173 | xargs -r kill -KILL 2>/dev/null || true
fi

# Drop cached sandbox container images so Dockerfile changes take effect.
IMAGES=$(docker images -q cloudflare-dev/userappsandboxservice 2>/dev/null || true)
if [ -n "$IMAGES" ]; then
  echo "Removing cached sandbox images..."
  echo "$IMAGES" | xargs docker rmi -f || true
fi

echo "Starting bun run dev..."
exec bun run dev
