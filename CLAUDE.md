# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Communication Style
- Be professional, concise, and direct
- Do NOT use emojis in code reviews, changelogs, or any generated content. You may use professional visual indicators or favor markdown formatting over emojis.
- Focus on substance over style
- Use clear technical language

## Project Overview

VibeSDK is an agentic full-stack application builder on Cloudflare.

**Tech Stack:**
- Frontend: React 19, TypeScript, Vite, TailwindCSS, React Router v7
- Backend: Cloudflare Workers, Durable Objects, Hono, D1, R2, and KV
- Agent: Cloudflare Think with AI Gateway model routing
- Workspace: SpaceDO Durable Objects
- Version history: Cloudflare Artifacts
- Preview runtime: Worker Loader bindings and Dynamic Workers
- Generated app data: Durable Object Facets with isolated SQLite
- WebSocket: PartySocket for real-time communication

**Project Structure:**
- `/src` - React frontend, API types, and API client
- `/worker/agents/think` - ThinkAgent, prompts, skills, workspace adapter, and tools
- `/worker/agents/core/behaviors/think.ts` - Think host orchestration
- `/worker/api` - Routes, controllers, handlers, and WebSocket types
- `/worker/database` - D1 schema and services
- `/space` - SpaceDO, Artifacts synchronization, preview bundling, and App Facets
- `/sdk` - TypeScript client SDK
- `/migrations` - D1 migrations
- `/scripts` - Setup and deployment utilities

## Key Architectural Patterns

**ThinkAgent:**
- One Agent backed by a Durable Object per app session
- Owns conversation, context selection, skills, streaming, tools, and step limits
- Uses explicit SpaceDO-backed tools; workspace bash is disabled

**Workspace and Versioning:**
- SpaceDO owns the isolated live workspace and files
- Cloudflare Artifacts owns durable commits, branches, history, and restore points
- `commit` saves without deploying; `deploy_space` commits and rebuilds the preview
- Rollback applies a selected tree, creates a new commit, and redeploys

**Preview Runtime:**
- `@cloudflare/worker-bundler` builds committed project files
- Worker Loader loads bundled modules as a Dynamic Worker
- Generated `App` classes run as Durable Object Facets with isolated SQLite

**WebSocket Communication:**
- PartySocket carries realtime agent output, tools, files, and deployment state
- Session state is restored on reconnect

## Common Development Tasks

**Change LLM Model for Operation:**
Edit `/worker/agents/inferutils/config.ts` → `AGENT_CONFIG` object

**Modify Think Agent Behavior:**
Edit `worker/agents/think/ThinkAgent.ts`, the host behavior in `worker/agents/core/behaviors/think.ts`, and the relevant prompt or skill.

**Add New WebSocket Message:**
1. Add type to `worker/api/websocketTypes.ts`
2. Handle in `worker/agents/core/websocket.ts`
3. Handle in `src/routes/chat/utils/handle-websocket-message.ts`

**Add New Think Tool:**
1. Create the tool under `worker/agents/think/`
2. Add required SpaceDO RPC typing to `space-workspace-ops.ts`
3. Register it in `ThinkAgent.getTools()`
4. Update the relevant prompt or skill
5. Add focused tests

**Add API Endpoint:**
1. Define types in `src/api-types.ts`
2. Add to `src/lib/api-client.ts`
3. Create service in `worker/database/services/`
4. Create controller in `worker/api/controllers/`
5. Add route in `worker/api/routes/`
6. Register in `worker/api/routes/index.ts`

## Important Context

**User Secrets Store (Durable Object):**
- Location: `/worker/services/secrets/`
- Purpose: Encrypted storage for user API keys with key rotation
- Architecture: One DO per user, XChaCha20-Poly1305 encryption, SQLite backend
- Key derivation: MEK → UMK → DEK (hierarchical PBKDF2)
- Features: Key rotation, soft deletion, access tracking, expiration support
- RPC Methods: Return `null`/`boolean` on error, never throw exceptions
- Testing: 90 comprehensive tests in `/test/worker/services/secrets/`

**Workspace and Git:**
- SpaceDO provides workspace and file operations
- Cloudflare Artifacts stores durable git history
- Artifacts synchronization lives in `space/src/space/artifacts-sync.ts`
- Rollback preserves history by creating a new commit

**Abort Controller Pattern:**
- `getOrCreateAbortController()` reuses controller for nested operations
- Cleared after top-level operations complete
- Shared by parent and nested tool calls
- User abort cancels entire operation tree

**Message Deduplication:**
- Tool execution causes duplicate AI messages
- Backend skips redundant LLM calls (empty tool results)
- Frontend utilities deduplicate live and restored messages
- System prompt teaches LLM not to repeat

## Core Rules (Non-Negotiable)

**1. Strict Type Safety**
- NEVER use `any` type
- Frontend imports types from `@/api-types` (single source of truth)
- Search codebase for existing types before creating new ones

**2. DRY Principle**
- Search for similar functionality before implementing
- Extract reusable utilities, hooks, and components
- Never copy-paste code - refactor into shared functions

**3. Follow Existing Patterns**
- Frontend APIs: All in `/src/lib/api-client.ts`
- Backend Routes: Controllers in `worker/api/controllers/`, routes in `worker/api/routes/`
- Database Services: In `worker/database/services/`
- Types: Shared in `shared/types/`, API in `src/api-types.ts`

**4. Code Quality**
- Production-ready code only - no TODOs or placeholders
- No hacky workarounds
- Comments explain purpose, not narration
- No overly verbose AI-like comments

**5. File Naming**
- React Components: PascalCase.tsx
- Utilities/Hooks: kebab-case.ts
- Backend Services: PascalCase.ts

## Common Pitfalls

**Don't:**
- Use `any` type (find or create proper types)
- Copy-paste code (extract to utilities)
- Use Vite env variables in Worker code
- Forget to update types when changing APIs
- Create new implementations without searching for existing ones
- Use emojis in code or comments
- Write verbose AI-like comments

**Do:**
- Search codebase thoroughly before creating new code
- Follow existing patterns consistently
- Keep comments concise and purposeful
- Write production-ready code
- Test thoroughly before submitting