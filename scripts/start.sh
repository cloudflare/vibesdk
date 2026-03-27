#!/bin/bash
## VibeSDK - Start Development Environment
## Usage: ./scripts/start.sh [--full] [--build]
##
## Options:
##   --full    Start with sandbox container for code execution
##   --build   Force rebuild containers before starting

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Parse arguments
PROFILE=""
BUILD_FLAG=""

for arg in "$@"; do
    case $arg in
        --full)
            PROFILE="--profile full"
            ;;
        --build)
            BUILD_FLAG="--build"
            ;;
    esac
done

echo "🚀 Starting VibeSDK Development Environment..."
echo "   Project: $PROJECT_ROOT"
echo ""

# Check if .dev.vars exists
if [ ! -f ".dev.vars" ]; then
    echo "⚠️  .dev.vars not found. Creating from example..."
    if [ -f ".dev.vars.example" ]; then
        cp .dev.vars.example .dev.vars
        echo "   Created .dev.vars - please edit with your API keys"
    else
        echo "❌ .dev.vars.example not found. Please create .dev.vars manually."
        exit 1
    fi
fi

# Run database migrations first (local)
echo "📦 Running database migrations..."
if command -v bun &> /dev/null; then
    bun run db:migrate:local 2>/dev/null || echo "   Migrations already applied or bun not available"
fi

# Start containers
echo ""
echo "🐳 Starting Docker containers..."
docker compose -f docker/docker-compose.yml up -d $BUILD_FLAG $PROFILE

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Health check
if curl -s -f http://localhost:3000/api/status > /dev/null 2>&1; then
    echo "✅ VibeSDK is running!"
else
    echo "⏳ Services still starting... check logs with: ./scripts/logs.sh"
fi

echo ""
echo "📍 Access Points:"
echo "   • App:          http://localhost:3000"
echo "   • API:          http://localhost:3000/api"
echo "   • Wrangler:     http://localhost:8787"
echo "   • DB Studio:    http://localhost:5555 (run: bun run db:studio)"
echo ""
echo "📋 Commands:"
echo "   • View logs:    ./scripts/logs.sh"
echo "   • Stop:         ./scripts/stop.sh"
echo "   • Rebuild:      ./scripts/rebuild.sh"
echo ""
