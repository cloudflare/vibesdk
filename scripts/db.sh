#!/bin/bash
## VibeSDK - Database Management
## Usage: ./scripts/db.sh <command>
##
## Commands:
##   migrate     Run database migrations
##   studio      Open Drizzle Studio (database GUI)
##   reset       Reset database (drops all data)
##   seed        Seed database with sample data

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

COMMAND="${1:-help}"

case $COMMAND in
    migrate)
        echo "📦 Running database migrations..."
        docker compose -f docker/docker-compose.yml exec vibesdk bun run db:migrate:local
        echo "✅ Migrations complete"
        ;;
    
    studio)
        echo "🎨 Starting Drizzle Studio..."
        echo "   Open http://localhost:5555 in your browser"
        docker compose -f docker/docker-compose.yml exec vibesdk bun run db:studio
        ;;
    
    reset)
        echo "⚠️  This will delete all database data!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "🗑️  Resetting database..."
            docker compose -f docker/docker-compose.yml exec vibesdk rm -rf .wrangler/state/v3/d1
            echo "📦 Re-running migrations..."
            docker compose -f docker/docker-compose.yml exec vibesdk bun run db:migrate:local
            echo "✅ Database reset complete"
        else
            echo "Cancelled"
        fi
        ;;
    
    seed)
        echo "🌱 Seeding database..."
        # Add seed script execution here when available
        echo "⚠️  Seed script not yet implemented"
        ;;
    
    help|*)
        echo "VibeSDK Database Management"
        echo ""
        echo "Usage: ./scripts/db.sh <command>"
        echo ""
        echo "Commands:"
        echo "  migrate   Run database migrations"
        echo "  studio    Open Drizzle Studio (database GUI)"
        echo "  reset     Reset database (drops all data)"
        echo "  seed      Seed database with sample data"
        ;;
esac
