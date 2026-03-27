# VibeSDK Platform - Product Requirements Document

## Project Overview
VibeSDK is a fork of Cloudflare's open-source "vibe coding" platform with custom SDAE (Spec-Driven Autonomous Engine) additions. The goal is to build an "Emergent-grade" AI coding platform.

## Original Problem Statement
Setup and review requirements from attached documentation files to understand the project scope for building an Emergent-style vibe coding platform.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: R2, KV
- **AI**: Gemini (Google AI Studio) configured
- **Other**: Durable Objects, Workers AI

## What's Been Implemented (Current State)
- [x] Core app generation with phase-wise implementation
- [x] Chat interface with streaming responses
- [x] App preview with iframe sandbox
- [x] SDAE engine (IR, compiler, runner, cache)
- [x] Cost-quality policy layer (PolicyEngine, UsageTracker)
- [x] Deployment to Cloudflare Workers
- [x] User authentication (basic)
- [x] Template system

## Development Environment Setup - COMPLETED (Jan 27, 2026)
- [x] Installed Bun and project dependencies
- [x] Created local wrangler config (`wrangler.local.jsonc`)
- [x] Applied D1 database migrations
- [x] Configured Gemini API key
- [x] Dev server running on http://localhost:3000

## Docker Setup - COMPLETED (Jan 27, 2026)
- [x] Created production Dockerfile (`docker/Dockerfile`)
- [x] Updated development Dockerfile (`docker/Dockerfile.dev`)
- [x] Updated docker-compose.yml with all services
- [x] Created shell scripts for common operations:
  - `scripts/start.sh` - Start development environment
  - `scripts/stop.sh` - Stop containers
  - `scripts/logs.sh` - View logs
  - `scripts/rebuild.sh` - Rebuild containers
  - `scripts/status.sh` - Check service status
  - `scripts/shell.sh` - Open container shell
  - `scripts/db.sh` - Database management
  - `scripts/dev.sh` - Local development (no Docker)
  - `scripts/build.sh` - Build for production
  - `scripts/test.sh` - Run tests
  - `scripts/quick-setup.sh` - First-time setup
- [x] Created Docker documentation (`docs/DOCKER.md`)

## Gap Analysis - Features to Implement

### HIGH PRIORITY (P0)
1. **Credit/Billing System** (~5-8 days)
   - Stripe integration
   - Balance display in header
   - Credit purchase flow
   - Usage tracking per request

2. **Machine Type/Agent Profiles** (~2-3 days)
   - E-1 (Lite), E-1.5 (Standard), E-2 (Pro) agent tiers
   - Different model configurations per tier
   - Thinking time/capability differences

### MEDIUM PRIORITY (P1)
3. **GitHub Import** (~3-4 days)
   - Import repos into agent sessions
   - OAuth flow for GitHub
   - Clone and analyze repos

4. **Chrome-style Tab Bar** (~3-4 days)
   - Multi-tab navigation
   - Tab management (close, rearrange)
   - Persistent tabs

5. **Custom Agent Builder** (~4-5 days)
   - Pro feature
   - Define custom system prompts
   - Configure model parameters

### LOW PRIORITY (P2)
6. **Notifications System** (~2-3 days)
7. **Voice Input** (~2-3 days)
8. **Advanced Settings Panel**

## User Personas
1. **Hobbyist Developer**: Quick prototyping, free tier
2. **Professional Developer**: Production apps, paid tier
3. **Enterprise Team**: Custom agents, volume usage

## Next Action Items
1. Choose priority feature to implement
2. Review design guidelines from docs
3. Begin implementation

## Files of Reference
- `/app/docs/GAP_ANALYSIS_AND_IMPLEMENTATION_GUIDE.md` - Detailed implementation guide
- `/app/docs/SDAE_ARCHITECTURE.md` - Engine architecture
- `/app/docs/COST_QUALITY_MULTITENANT_BLUEPRINT.md` - Cost management
- `/app/docs/PROJECT_REVIEW.md` - Setup instructions
