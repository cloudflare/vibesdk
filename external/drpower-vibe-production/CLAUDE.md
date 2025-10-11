# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is an official Cloudflare product - a React+Vite frontend with Cloudflare Workers backend that features a Durable Object-based AI agent capable of building webapps phase-wise from user prompts.

**Important Context:**
- Core functionality: AI-powered webapp generation via Durable Objects
- Authentication system and database schemas are currently under development (existing code is AI-generated and needs review/rewrite)
- Full Cloudflare stack: Workers, D1, Durable Objects, R2 (planned)
- All tests in the project are AI-generated and need replacement

## Development Commands

### Frontend Development
```bash
npm run dev              # Start Vite dev server with hot reload
npm run build            # Build production frontend
npm run lint             # Run ESLint
npm run preview          # Preview production build
```

### Worker Development
```bash
npm run local            # Run Worker locally with Wrangler
npm run cf-typegen       # Generate TypeScript types for CF bindings
npm run deploy           # Deploy to Cloudflare Workers + secrets
```

### Database (D1) - Under Development
```bash
npm run db:setup         # Initial database setup
npm run db:generate      # Generate migrations (local)
npm run db:migrate:local # Apply migrations locally
npm run db:migrate:remote # Apply migrations to production
npm run db:studio        # Open Drizzle Studio for local DB
```

### Testing - Needs Rewrite
```bash
npm run test             # Run Jest tests (current tests need replacement)
```

## Core Architecture: AI Code Generation

### Phase-wise Generation System (`worker/agents/codegen/`)
The heart of the system is the `CodeGeneratorAgent` Durable Object that implements sophisticated code generation:

1. **Blueprint Phase**: Analyzes user requirements and creates project blueprint
2. **Incremental Generation**: Generates code phase-by-phase with specific files per phase
3. **SCOF Protocol**: Structured Code Output Format for streaming generated code
4. **Review Cycles**: Multiple automated review passes including:
   - Static analysis (linting, type checking)
   - Runtime validation via Runner Service
   - AI-powered error detection and fixes
5. **Diff Support**: Efficient file updates using unified diff format

### Key Components
- **Durable Object**: `worker/agents/codegen/phasewiseGenerator.ts` - Stateful code generation
- **State Management**: `worker/agents/codegen/state.ts` - Generation state tracking
- **WebSocket Protocol**: Real-time streaming of generation progress
- **Runner Service**: External service for code execution and validation

### Frontend-Worker Communication
- **Initial Request**: POST `/api/agent`
- **WebSocket Connection**: `/api/agent/:agentId/ws` for real-time updates
- **Message Types**: Typed protocol for file updates, errors, phase transitions

## Areas Under Development

### Authentication System (Needs Review/Rewrite)
Current implementation in `worker/auth/` and `worker/api/controllers/authController.ts`:
- OAuth providers (Google, GitHub) - needs production hardening
- JWT session management - requires security review
- Database schema for users/sessions - needs optimization

### Database Architecture (In Progress)
- Currently using Drizzle ORM with D1
- Schema in `worker/database/schema.ts` - under active development
- Migration system needs refinement

### Testing Strategy (Needs Implementation)
- All current tests are AI-generated placeholders
- Need proper unit tests for core generation logic
- Integration tests for Durable Objects
- E2E tests for generation workflow

## Working with the Codebase

### Adding Features to Code Generation
1. Modify agent logic in `worker/agents/codegen/phasewiseGenerator.ts`
2. Update state types in `worker/agents/codegen/state.ts`
3. Add new message types for WebSocket protocol
4. Update frontend handler in `src/routes/chat/hooks/use-chat.ts`

### Cloudflare-Specific Patterns
- **Durable Objects**: Used for stateful, long-running operations
- **D1 Database**: SQLite-based, use batch operations for performance
- **Environment Bindings**: Access via `env` parameter (AI, DB, CodeGenObject)
- **Service Bindings**: Runner service accessed via `env.RUNNER_SERVICE`

### Environment Variables
Required in `.dev.vars` for local development:
- `JWT_SECRET` - For session management (under development)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY` - AI providers
- `RUNNER_SERVICE_API_KEY` - For code execution service
- OAuth credentials (being redesigned)

## Important Notes
- Focus on core AI generation functionality when making changes
- Prioritize Cloudflare-native solutions (D1, Durable Objects, R2)
- Always **strictly** follow DRY principles
- Keep code quality high and maintainability in mind
- Always research and understand the codebase before making changes
- Never use 'any' type. If you see 'any', Find the proper appropriate type in the project and then replace it. If nothing is found, then write a type for it. 
- Never use dynamic imports. If you see dynamic imports, Correct it!
- Implement everything the 'right' and 'correct' way instead of 'fast' and 'quick'.
- Don't add comments for explaining your changes to me. Comments should be professional, to the point and should be there to explain the code, not your changes
- Don't start writing new 'corrected' versions of files instead of working on fixing the existing ones

## Common Tasks

### Debugging Code Generation
1. Monitor Durable Object logs: `npm run local`
2. Check WebSocket messages in browser DevTools
3. Verify Runner Service connectivity
4. Review generation state in `CodeGeneratorAgent`

### Working with Durable Objects
- Class: `worker/agents/codegen/phasewiseGenerator.ts`
- Binding: `env.CodeGenObject`
- ID Generation: Based on session/user context
- State Persistence: Automatic via Cloudflare

### Runner Service Integration
- Executes generated code in isolated environment
- Provides runtime error feedback
- Returns preview URLs for generated apps
- Configuration in `wrangler.jsonc`