#!/bin/bash
## VibeSDK - Local Development (No Docker)
## Usage: ./scripts/dev.sh
##
## Runs the development server locally without Docker
## Requires: bun installed locally

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "🚀 Starting VibeSDK Local Development..."
echo ""

# Check bun
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is required but not installed."
    echo "   Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check .dev.vars
if [ ! -f ".dev.vars" ]; then
    echo "❌ .dev.vars not found. Run ./scripts/setup.sh first."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    bun install
fi

# Run migrations
echo "📦 Running database migrations..."
bun run db:migrate:local 2>/dev/null || true

echo ""
echo "🔥 Starting development server..."
echo "   Press Ctrl+C to stop"
echo ""

# Set environment and run
export DEV_MODE=true
exec bun run dev
