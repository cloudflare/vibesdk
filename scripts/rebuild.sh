#!/bin/bash
## VibeSDK - Rebuild and Restart
## Usage: ./scripts/rebuild.sh [--full] [--clean]
##
## Options:
##   --full    Include sandbox container
##   --clean   Clean rebuild (remove volumes first)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

PROFILE=""
CLEAN=false

for arg in "$@"; do
    case $arg in
        --full)
            PROFILE="--profile full"
            ;;
        --clean)
            CLEAN=true
            ;;
    esac
done

echo "🔄 Rebuilding VibeSDK Development Environment..."
echo ""

# Stop existing containers
echo "🛑 Stopping existing containers..."
if [ "$CLEAN" = true ]; then
    docker compose -f docker/docker-compose.yml down -v --remove-orphans
    echo "🧹 Removed volumes"
else
    docker compose -f docker/docker-compose.yml down --remove-orphans
fi

# Rebuild and start
echo ""
echo "🔨 Building containers..."
docker compose -f docker/docker-compose.yml build --no-cache

echo ""
echo "🚀 Starting containers..."
docker compose -f docker/docker-compose.yml up -d $PROFILE

echo ""
echo "⏳ Waiting for services..."
sleep 5

# Health check
if curl -s -f http://localhost:3000/api/status > /dev/null 2>&1; then
    echo "✅ VibeSDK rebuilt and running!"
else
    echo "⏳ Services still starting... check logs with: ./scripts/logs.sh"
fi

echo ""
echo "📍 App available at: http://localhost:3000"
