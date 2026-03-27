#!/bin/bash
## VibeSDK - Quick Setup
## Usage: ./scripts/setup.sh
##
## First-time setup script for new developers
## - Copies environment file
## - Installs dependencies
## - Runs migrations
## - Starts services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "╔════════════════════════════════════════════════╗"
echo "║          VibeSDK Quick Setup                    ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Step 1: Environment file
echo "📋 Step 1: Environment Configuration"
if [ ! -f ".dev.vars" ]; then
    if [ -f ".dev.vars.example" ]; then
        cp .dev.vars.example .dev.vars
        echo "   ✅ Created .dev.vars from example"
        echo ""
        echo "   ⚠️  Please edit .dev.vars with your API keys:"
        echo "      - GOOGLE_AI_STUDIO_API_KEY (for Gemini)"
        echo "      - Or other LLM provider keys"
        echo ""
        read -p "   Press Enter after editing .dev.vars (or Ctrl+C to exit)..."
    else
        echo "   ❌ .dev.vars.example not found!"
        exit 1
    fi
else
    echo "   ✅ .dev.vars already exists"
fi

echo ""

# Step 2: Check Docker
echo "📋 Step 2: Checking Docker..."
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        echo "   ✅ Docker is running"
    else
        echo "   ❌ Docker is not running. Please start Docker."
        exit 1
    fi
else
    echo "   ❌ Docker not found. Please install Docker."
    exit 1
fi

echo ""

# Step 3: Check if we can use local bun
echo "📋 Step 3: Installing dependencies..."
if command -v bun &> /dev/null; then
    echo "   Using local bun installation"
    bun install
    echo "   ✅ Dependencies installed"
else
    echo "   ⚠️  Bun not found locally, will use Docker"
fi

echo ""

# Step 4: Run migrations
echo "📋 Step 4: Database setup..."
if command -v bun &> /dev/null; then
    bun run db:migrate:local
    echo "   ✅ Migrations applied"
else
    echo "   ⏭️  Will run migrations in Docker"
fi

echo ""

# Step 5: Start services
echo "📋 Step 5: Starting services..."
"$SCRIPT_DIR/start.sh"

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║          Setup Complete! 🎉                     ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "🌐 Open http://localhost:3000 in your browser"
echo ""
echo "📖 Documentation: ./docs/setup.md"
echo "🐛 Issues? Check logs: ./scripts/logs.sh --follow"
