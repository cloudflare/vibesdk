# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Communication Style
- Be professional, concise, and direct
- Do NOT use emojis in code reviews, changelogs, or any generated content. You may use professional visual indicators or favor markdown formatting over emojis.
- Focus on substance over style
- Use clear technical language

## Project Overview
vibesdk is an AI-powered full-stack application generation platform built on Cloudflare infrastructure.

**Tech Stack:**
- Frontend: React 19, TypeScript, Vite, TailwindCSS, React Router v7
- Backend: Cloudflare Workers, Durable Objects, D1 (SQLite)
- AI/LLM: OpenAI, Anthropic, Google AI Studio (Gemini)
- WebSocket: PartySocket for real-time communication
- Sandbox: Custom container service with CLI tools
- Git: isomorphic-git with SQLite filesystem

**Project Structure**

**Frontend (`/src`):**
- React application with 80+ components
- Single source of truth for types: `src/api-types.ts`
- All API calls in `src/lib/api-client.ts`
- Custom hooks in `src/hooks/`
- Route components in `src/routes/`

**Backend (`/worker`):**
- Entry point: `worker/index.ts` (7860 lines)
- Agent system: `worker/agents/` (88 files)
  - Core: SimpleCodeGeneratorAgent (Durable Object, 2800+ lines)
  - Operations: PhaseGeneration, PhaseImplementation, UserConversationProcessor
  - Tools: tools for LLM (read-files, run-analysis, regenerate-file, etc.)
  - Git: isomorphic-git with SQLite filesystem
- Database: `worker/database/` (Drizzle ORM, D1)
- Services: `worker/services/` (sandbox, code-fixer, oauth, rate-limit, secrets)
- API: `worker/api/` (routes, controllers, handlers)

**Other:**
- `/shared` - Shared types between frontend/backend (not worker specific types that are also imported in frontend)
- `/migrations` - D1 database migrations
- `/container` - Sandbox container tooling
- `/templates` - Project scaffolding templates

**Core Architecture:**
- Each chat session is a Durable Object instance (SimpleCodeGeneratorAgent)
- State machine drives code generation (IDLE → PHASE_GENERATING → PHASE_IMPLEMENTING → REVIEWING)
- Git history stored in SQLite, full clone protocol support
- WebSocket for real-time streaming and state synchronization

## Key Architectural Patterns

**Durable Objects Pattern:**
- Each chat session = Durable Object instance
- Persistent state in SQLite (blueprint, files, history)
- Ephemeral state in memory (abort controllers, active promises)
- Single-threaded per instance

**State Machine:**
IDLE → PHASE_GENERATING → PHASE_IMPLEMENTING → REVIEWING → IDLE

**CodeGenState (Agent State):**
- Project Identity: blueprint, projectName, templateName
- File Management: generatedFilesMap (tracks all files)
- Phase Tracking: generatedPhases, currentPhase
- State Machine: currentDevState, shouldBeGenerating
- Sandbox: sandboxInstanceId, commandsHistory
- Conversation: conversationMessages, pendingUserInputs

**WebSocket Communication:**
- Real-time streaming via PartySocket
- State restoration on reconnect (agent_connected message)
- Message deduplication (tool execution causes duplicates)

**Git System:**
- isomorphic-git with SQLite filesystem adapter
- Full commit history in Durable Object storage
- Git clone protocol support (rebase on template)
- FileManager auto-syncs from git via callbacks

## Common Development Tasks

**Change LLM Model for Operation:**
Edit `/worker/agents/inferutils/config.ts` → `AGENT_CONFIG` object

**Modify Conversation Agent Behavior:**
Edit `/worker/agents/operations/UserConversationProcessor.ts` (system prompt line 50)

**Add New WebSocket Message:**
1. Add type to `worker/api/websocketTypes.ts`
2. Handle in `worker/agents/core/websocket.ts`
3. Handle in `src/routes/chat/utils/handle-websocket-message.ts`

**Add New LLM Tool:**
1. Create `/worker/agents/tools/toolkit/my-tool.ts`
2. Export `createMyTool(agent, logger)` function
3. Import in `/worker/agents/tools/customTools.ts`
4. Add to `buildTools()` (conversation) or `buildDebugTools()` (debugger)

**Add API Endpoint:**
1. Define types in `src/api-types.ts`
2. Add to `src/lib/api-client.ts`
3. Create service in `worker/database/services/`
4. Create controller in `worker/api/controllers/`
5. Add route in `worker/api/routes/`
6. Register in `worker/api/routes/index.ts`

## Important Context

**Deep Debugger:**
- Location: `/worker/agents/assistants/codeDebugger.ts`
- Model: Gemini 2.5 Pro (reasoning_effort: high, 32k tokens)
- Diagnostic priority: run_analysis → get_runtime_errors → get_logs
- Can fix multiple files in parallel (regenerate_file)
- Cannot run during code generation (checked via isCodeGenerating())

**User Secrets Store (Durable Object):**
- Location: `/worker/services/secrets/`
- Purpose: Encrypted storage for user API keys with key rotation
- Architecture: One DO per user, XChaCha20-Poly1305 encryption, SQLite backend
- Key derivation: MEK → UMK → DEK (hierarchical PBKDF2)
- Features: Key rotation, soft deletion, access tracking, expiration support
- RPC Methods: Return `null`/`boolean` on error, never throw exceptions
- Testing: 90 comprehensive tests in `/test/worker/services/secrets/`

**Git System:**
- GitVersionControl class wraps isomorphic-git
- Key methods: commit(), reset(), log(), show()
- FileManager auto-syncs via callback registration
- Access control: user conversations get safe commands, debugger gets full access
- SQLite filesystem adapter (`/worker/agents/git/fs-adapter.ts`)

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