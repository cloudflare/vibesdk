#!/bin/bash
## VibeSDK - Test Runner
## Usage: ./scripts/test.sh [--watch] [--coverage]
##
## Options:
##   --watch     Run tests in watch mode
##   --coverage  Generate coverage report

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

COMMAND="test"

for arg in "$@"; do
    case $arg in
        --watch)
            COMMAND="test:watch"
            ;;
        --coverage)
            COMMAND="test:coverage"
            ;;
    esac
done

echo "🧪 Running VibeSDK Tests..."
echo ""

if ! command -v bun &> /dev/null; then
    echo "❌ Bun is required. Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

bun run $COMMAND
