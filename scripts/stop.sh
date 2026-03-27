#!/bin/bash
## VibeSDK - Stop Development Environment
## Usage: ./scripts/stop.sh [--clean]
##
## Options:
##   --clean   Remove volumes and clean up all data

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

CLEAN_FLAG=""

for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN_FLAG="-v"
            ;;
    esac
done

echo "🛑 Stopping VibeSDK Development Environment..."

if [ -n "$CLEAN_FLAG" ]; then
    echo "🧹 Cleaning up volumes and data..."
    docker compose -f docker/docker-compose.yml down -v --remove-orphans
    echo "✅ Stopped and cleaned all containers and volumes"
else
    docker compose -f docker/docker-compose.yml down --remove-orphans
    echo "✅ Stopped all containers (volumes preserved)"
fi

echo ""
echo "💡 To restart: ./scripts/start.sh"
echo "💡 To clean everything: ./scripts/stop.sh --clean"
