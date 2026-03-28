# VibeSDK Platform - Product Requirements Document

## Project Overview
VibeSDK is a fork of Cloudflare's open-source "vibe coding" platform with custom SDAE additions. The goal is to build an "Emergent-grade" AI coding platform.

## Original Problem Statement
Setup and review requirements from attached docs. Configure Gemini AI, fix local dev preview, create Docker infrastructure for Railway deployment. UI should match Emergent platform style with functional toolbar buttons.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **AI**: Gemini (Google AI Studio)
- **Runtime**: Bun, workerd (Cloudflare Workers runtime)

## Architecture
- Vite dev server on port 3000 (frontend + Cloudflare Workers backend via `@cloudflare/vite-plugin`)
- FastAPI reverse proxy on port 8001 (bridges Emergent ingress to Vite)
- `wrangler.local.jsonc` for local dev (no remote Cloudflare bindings)

## What's Been Implemented

### Dev Environment Setup - COMPLETED
- [x] Bun + dependencies installed
- [x] Local wrangler config, D1 migrations, Gemini API key
- [x] Dev server on port 3000

### Docker Infrastructure - COMPLETED
- [x] Production/dev Dockerfiles, docker-compose.yml
- [x] Shell scripts (start, stop, logs, etc.)

### Emergent Preview Fix - COMPLETED (Mar 27, 2026)
- [x] Fixed Worker domain routing for Emergent preview (`*.emergentcf.cloud`)
- [x] FastAPI reverse proxy on port 8001
- [x] CORS + wildcard pattern matching

### UI Redesign (Emergent-style) - COMPLETED (Mar 27, 2026)
- [x] Removed Cloudflare logo from header
- [x] Removed Register button (accessible via Sign In modal)
- [x] Removed "Deploy your own vibe-coding platform" banner
- [x] Emergent-style prompt input with "Message Agent..." placeholder
- [x] Toolbar: Attach (multi-file), Save (GitHub), Fork, Model selector, Voice, Send
- [x] GitHub Save dialog (repo name, desc, private, OAuth flow)
- [x] Fork dialog (App ID input, forkApp API)
- [x] Model selector (E-1 Lite, E-1.5 Standard, E-2 Ultra)
- [x] Registration and login fully functional with CSRF protection
- [x] Enabled fork backend route + controller

## Remaining Features (P0-P2)

### P0 - High Priority
1. Credit/Billing System (Stripe integration, balance, usage tracking)
2. Voice input implementation (microphone button currently placeholder)

### P1 - Medium Priority
3. GitHub Import (OAuth + repo cloning)
4. Chrome-style Tab Bar
5. Custom Agent Builder

### P2 - Low Priority
6. Notifications System
7. Advanced Settings Panel

## Key Files
- `/app/src/routes/home.tsx` - Home page with Emergent-style input
- `/app/src/components/layout/global-header.tsx` - Clean header
- `/app/worker/index.ts` - Worker entry with domain routing
- `/app/worker/api/routes/appRoutes.ts` - App routes (fork enabled)
- `/app/backend/server.py` - FastAPI reverse proxy

## Preview URL
https://prompt-studio-103.preview.emergentagent.com
