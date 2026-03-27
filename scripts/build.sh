#!/bin/bash
## VibeSDK - Build for Production
## Usage: ./scripts/build.sh [--docker]
##
## Options:
##   --docker   Build Docker image for production

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

BUILD_DOCKER=false

for arg in "$@"; do
    case $arg in
        --docker)
            BUILD_DOCKER=true
            ;;
    esac
done

echo "🔨 Building VibeSDK..."
echo ""

if [ "$BUILD_DOCKER" = true ]; then
    echo "📦 Building Docker production image..."
    docker build -f docker/Dockerfile -t vibesdk:latest --target production .
    echo ""
    echo "✅ Docker image built: vibesdk:latest"
    echo ""
    echo "Run with:"
    echo "  docker run -p 3000:3000 --env-file .dev.vars vibesdk:latest"
else
    echo "📦 Building application..."
    
    if ! command -v bun &> /dev/null; then
        echo "❌ Bun is required. Install: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
    
    # Type check
    echo "🔍 Type checking..."
    bun run typecheck || echo "⚠️  Type errors found (continuing...)"
    
    # Build
    echo "🔨 Compiling..."
    bun run build
    
    echo ""
    echo "✅ Build complete!"
    echo "   Output: ./dist/"
    echo ""
    echo "Deploy to Cloudflare:"
    echo "  bun run deploy"
fi
