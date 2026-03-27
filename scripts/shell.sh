#!/bin/bash
## VibeSDK - Development Shell
## Usage: ./scripts/shell.sh [service]
##
## Opens an interactive shell in the container
## Default service: vibesdk

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

SERVICE="${1:-vibesdk}"

echo "🐚 Opening shell in $SERVICE container..."
echo "   Type 'exit' to leave"
echo ""

docker compose -f docker/docker-compose.yml exec $SERVICE /bin/bash
