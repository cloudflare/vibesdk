#!/bin/bash
## VibeSDK - View Logs
## Usage: ./scripts/logs.sh [service] [--follow]
##
## Options:
##   service   Specific service to view (vibesdk, sandbox)
##   --follow  Follow log output (like tail -f)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

SERVICE=""
FOLLOW_FLAG=""

for arg in "$@"; do
    case $arg in
        --follow|-f)
            FOLLOW_FLAG="-f"
            ;;
        vibesdk|sandbox)
            SERVICE="$arg"
            ;;
    esac
done

echo "📋 VibeSDK Logs"
echo ""

if [ -n "$FOLLOW_FLAG" ]; then
    echo "Following logs... (Ctrl+C to exit)"
    echo ""
fi

if [ -n "$SERVICE" ]; then
    docker compose -f docker/docker-compose.yml logs $FOLLOW_FLAG $SERVICE
else
    docker compose -f docker/docker-compose.yml logs $FOLLOW_FLAG
fi
