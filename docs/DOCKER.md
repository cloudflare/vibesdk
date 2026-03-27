# Docker Development Guide

This guide covers running VibeSDK locally using Docker.

## Quick Start

```bash
# First-time setup
./scripts/quick-setup.sh

# Or step by step:
cp .dev.vars.example .dev.vars  # Edit with your API keys
./scripts/start.sh
```

Open http://localhost:3000

## Shell Scripts

| Script | Description |
|--------|-------------|
| `./scripts/start.sh` | Start development environment |
| `./scripts/stop.sh` | Stop all containers |
| `./scripts/logs.sh` | View container logs |
| `./scripts/rebuild.sh` | Rebuild and restart |
| `./scripts/status.sh` | Check service status |
| `./scripts/shell.sh` | Open shell in container |
| `./scripts/db.sh` | Database management |
| `./scripts/dev.sh` | Run locally (no Docker) |
| `./scripts/build.sh` | Build for production |
| `./scripts/test.sh` | Run tests |

## Script Options

### start.sh
```bash
./scripts/start.sh           # Start main app only
./scripts/start.sh --full    # Include sandbox container
./scripts/start.sh --build   # Force rebuild
```

### stop.sh
```bash
./scripts/stop.sh            # Stop (keep data)
./scripts/stop.sh --clean    # Stop and remove all data
```

### logs.sh
```bash
./scripts/logs.sh            # Show all logs
./scripts/logs.sh vibesdk    # Show specific service
./scripts/logs.sh --follow   # Follow logs (like tail -f)
```

### db.sh
```bash
./scripts/db.sh migrate      # Run migrations
./scripts/db.sh studio       # Open database GUI
./scripts/db.sh reset        # Reset all data
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| App | 3000 | Main application (Vite) |
| Wrangler | 8787 | Workers backend |
| DB Studio | 5555 | Drizzle Studio (database GUI) |
| Sandbox | 8080 | Code execution (--full mode) |

## Environment Variables

Required in `.dev.vars`:

```bash
# Security (auto-generated, or create your own)
JWT_SECRET="your-jwt-secret-32-chars-min"
SECRETS_ENCRYPTION_KEY="your-encryption-key-64-hex-chars"
ENTROPY_KEY="your-entropy-key-64-hex-chars"

# AI Provider (choose one)
GOOGLE_AI_STUDIO_API_KEY="your-gemini-key"
# or
OPENAI_API_KEY="your-openai-key"
# or
ANTHROPIC_API_KEY="your-anthropic-key"

# Environment
ENVIRONMENT="dev"
```

## Volumes

Docker volumes preserve data between restarts:

| Volume | Purpose |
|--------|---------|
| vibesdk_node_modules | Dependencies |
| vibesdk_bun_cache | Bun cache |
| vibesdk_wrangler_state | D1 database, KV, R2 |
| vibesdk_sandbox_data | Sandbox data |

To completely reset:
```bash
./scripts/stop.sh --clean
```

## Troubleshooting

### Container won't start
```bash
# Check logs
./scripts/logs.sh vibesdk

# Rebuild from scratch
./scripts/rebuild.sh --clean
```

### Database issues
```bash
# Reset database
./scripts/db.sh reset
```

### Port conflicts
Edit `docker/docker-compose.yml` to change ports:
```yaml
ports:
  - "3001:3000"  # Change external port
```

## Running Without Docker

If you prefer to run locally:

```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Setup and run
cp .dev.vars.example .dev.vars
bun install
bun run db:migrate:local
./scripts/dev.sh
```

## Production Build

```bash
# Build Docker image
./scripts/build.sh --docker

# Run production image
docker run -p 3000:3000 --env-file .dev.vars vibesdk:latest
```

For Cloudflare deployment, use:
```bash
bun run deploy
```
