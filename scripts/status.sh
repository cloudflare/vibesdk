#!/bin/bash
## VibeSDK - Service Status
## Usage: ./scripts/status.sh
##
## Shows status of all VibeSDK services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "📊 VibeSDK Service Status"
echo ""

# Container status
echo "🐳 Containers:"
docker compose -f docker/docker-compose.yml ps

echo ""
echo "🔍 Health Checks:"

# Check main app
if curl -s -f http://localhost:3000/api/status > /dev/null 2>&1; then
    STATUS=$(curl -s http://localhost:3000/api/status)
    echo "   ✅ App (3000):     Running"
    echo "      Response: $STATUS"
else
    echo "   ❌ App (3000):     Not responding"
fi

# Check Wrangler backend
if curl -s -f http://localhost:8787 > /dev/null 2>&1; then
    echo "   ✅ Wrangler (8787): Running"
else
    echo "   ⚪ Wrangler (8787): Not running (optional)"
fi

# Check sandbox
if curl -s -f http://localhost:8080 > /dev/null 2>&1; then
    echo "   ✅ Sandbox (8080):  Running"
else
    echo "   ⚪ Sandbox (8080):  Not running (start with --full)"
fi

echo ""
echo "💾 Volumes:"
docker volume ls --filter name=vibesdk

echo ""
echo "📋 Quick Commands:"
echo "   • Start:   ./scripts/start.sh"
echo "   • Stop:    ./scripts/stop.sh"
echo "   • Logs:    ./scripts/logs.sh --follow"
echo "   • Shell:   ./scripts/shell.sh"
