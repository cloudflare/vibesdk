#!/usr/bin/env bash
set -euo pipefail

# Regenerate templates from references and re-upload to local R2.
# Run after editing anything in templates/reference/ or templates/definitions/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$REPO_ROOT/templates"

if [ ! -d "$TEMPLATES_DIR" ]; then
  echo "templates/ directory not found at $TEMPLATES_DIR" >&2
  exit 1
fi

# Match the binding configured in wrangler.jsonc.
BUCKET="${R2_BUCKET_NAME:-vibesdk-templates}"

echo "Re-deploying templates to local R2 bucket: $BUCKET"
cd "$TEMPLATES_DIR"
LOCAL_R2=true R2_BUCKET_NAME="$BUCKET" ./deploy_templates.sh
echo "Done. Restart the dev server (bun run dev:reset) and create a new app to pick up changes."
