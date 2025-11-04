# LLM Developer Guide for vibesdk

> **📋 Meta-Instruction for AI Assistants:**
> 
> This document contains comprehensive architectural knowledge for **vibesdk** - an AI-powered full-stack app generation platform built on Cloudflare Workers with React.
>
> **Your Responsibilities:**
> 1. **Read this entire document** before making ANY changes
> 2. **Follow ALL rules and patterns** documented here
> 3. **Update this document** whenever you discover new patterns or find inaccuracies
> 4. **Search the codebase thoroughly** before creating anything new - reuse existing code
> 5. **Never compromise on code quality** - all code must be production-ready and type-safe

---

## 📝 Recent Changes (Updated Nov 2024)

### **Git System Refactor - CLI Semantics Alignment**

**Changes Made:**
1. **GitVersionControl Class (`/worker/agents/git/git.ts`):**
   - Added `reset(ref, options)` - Aligns with `git reset --hard` (moves HEAD, no new commit)
   - Removed `revert()` - Was creating incorrect "revert commits"
   - Removed `restoreCommit()` - Functionality merged into internal helpers
   - Removed `inferPurposeFromPath()` - No longer needed
   - Added `setOnFilesChangedCallback()` - Callback mechanism for FileManager sync
   - Added `getAllFilesFromHead()` - Simple HEAD file read for syncing

2. **FileManager Auto-Sync (`/worker/agents/services/implementations/FileManager.ts`):**
   - Self-contained synchronization via callback registration
   - Auto-registers with GitVersionControl during construction
   - Syncs `generatedFilesMap` from git HEAD after operations
   - Preserves file purposes across syncs
   - No external changes required - fully transparent

3. **Git Tool with Access Control (`/worker/agents/tools/toolkit/git.ts`):**
   - Parameterized tool creation: `createGitTool(agent, logger, options?)`
   - Dynamic command filtering via `excludeCommands` parameter
   - **User conversations:** Get safe version (commit, log, show only)
   - **Deep debugger:** Gets full version (includes reset with warnings)
   - Type-safe enum generation based on context

4. **Deep Debugger Prompt Updates (`/worker/agents/assistants/codeDebugger.ts`):**
   - Updated git command documentation
   - Added strong warnings about reset being UNTESTED and DESTRUCTIVE
   - Clear guidance: only use reset when absolutely necessary
   - Documented proper git semantics (reset vs checkout)

5. **User Conversation Updates (`/worker/agents/operations/UserConversationProcessor.ts`):**
   - Added git tool to help documentation
   - Noted reset unavailable for safety

6. **Commit Message Enhancement (`/worker/agents/core/simpleGeneratorAgent.ts`):**
   - Phase commits now include description in body
   - Format: `feat: Phase Name\n\nPhase description`
   - Provides better context in git history

**Benefits:**
- ✅ Git commands now match actual git CLI behavior
- ✅ FileManager stays in sync automatically via callbacks
- ✅ Context-aware tool access (safe for users, full for debugger)
- ✅ Type-safe, DRY, flexible architecture
- ✅ Self-contained FileManager (no external changes needed)

**See detailed documentation:** Section "GitVersionControl Class & Git Tool" (line 901)

---

## 🛠️ Quick Start for Developers

### **Running Locally**

**Prerequisites:**
- Node.js 18+
- Cloudflare account (for D1, Durable Objects)
- API keys: OpenAI, Anthropic, Google AI Studio

**Environment Variables:**
Create `.dev.vars` in project root:
```bash
# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_STUDIO_API_KEY=...

# Authentication
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# Sandbox Service
SANDBOX_SERVICE_URL=https://sandbox.example.com
SANDBOX_SERVICE_TOKEN=...
```

**Setup:**
```bash
# Install dependencies
npm install

# Setup local D1 database
npm run db:migrate:local

# Start dev servers
npm run dev        # Frontend (Vite)
npm run dev:worker # Backend (Wrangler)
```

### **Common Development Tasks**

**Task: Change LLM model for an operation**

**File:** `/worker/agents/inferutils/config.ts`
```typescript
export const AGENT_CONFIG = {
  blueprint: {
    name: GEMINI_2_5_PRO,  // Change this
    reasoning_effort: 'medium',
    max_tokens: 64000,
    temperature: 0.7
  },
  // ... other operations
};
```

**Task: Modify system prompt for conversation agent**

**File:** `/worker/agents/operations/UserConversationProcessor.ts`
- Line ~50: System prompt starts
- Defines Orange AI personality, tool usage rules, behavior

**Task: Add new WebSocket message**

See "Getting Started - Common Tasks" section below (line 1605)

**Task: Debug Durable Object state**

**In code:**
```typescript
// In simpleGeneratorAgent.ts
this.logger().info('Current state', { 
  devState: this.state.currentDevState,
  filesCount: Object.keys(this.state.generatedFilesMap).length,
  currentPhase: this.state.currentPhase
});
```

**Via Cloudflare dashboard:**
1. Go to Workers & Pages → Durable Objects
2. Find your DO instance
3. View SQLite database directly

---

## 🎯 Core Principles & Non-Negotiable Rules

### **1. Strict Type Safety**
- ❌ **NEVER use `any` type** - find or create proper types
- ✅ All frontend types imported from `@/api-types` (which re-exports from worker) or `shared/types/`
- ✅ Search codebase for existing types before creating new ones
- ✅ Extend/compose existing types rather than duplicating

**Type Import Pattern:**
```typescript
// ✅ CORRECT - Single source of truth
import { BlueprintType, WebSocketMessage } from '@/api-types';

// ❌ WRONG - Direct worker imports in frontend
import { BlueprintType } from 'worker/agents/schemas';
```

### **2. DRY Principle**
- Search for similar functionality before implementing
- Extract reusable utilities, hooks, and components
- Never copy-paste code - refactor into shared functions

### **3. Follow Existing Patterns**
- **Frontend APIs:** All defined in `/src/lib/api-client.ts`
- **Backend Routes:** Controllers in `worker/api/controllers/`, routes in `worker/api/routes/`
- **Database Services:** In `worker/database/services/`
- **Types:** Shared types in `shared/types/`, API types in `src/api-types.ts`

### **4. File Naming Conventions**
- **React Components:** `PascalCase.tsx`
- **Utilities/Hooks:** `kebab-case.ts`
- **Backend Services:** `PascalCase.ts`
- Match the naming style of surrounding files

### **5. Code Quality Standards**
- ✅ Production-ready code only - no TODOs or placeholders
- ✅ Proper TypeScript types with no implicit any
- ✅ Clean, maintainable code
- ❌ No hacky workarounds
- ❌ No overly verbose AI-like comments
- ❌ No emojis in code (only in markdown docs)

### **6. Comments Style**
```typescript
// ✅ GOOD - Explains code's purpose
// Calculate exponential backoff with max cap
const delay = Math.min(Math.pow(2, attempt) * 1000, 30000);

// ❌ BAD - Verbose AI narration
// Here we are calculating the delay using exponential backoff...
```

---

## 🏗️ Project Architecture

### **Tech Stack**
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, React Router v7
- **Backend:** Cloudflare Workers, Durable Objects, D1 (SQLite)
- **AI/LLM:** OpenAI, Anthropic, Google AI Studio (Gemini)
- **WebSocket:** PartySocket for real-time communication
- **Sandbox:** Custom container service with CLI tools
- **Templates:** Project scaffolding system with template catalog

### **Complete Directory Structure**

```
📦 vibesdk/
│
├── 📁 src/                                    # Frontend React application
│   ├── api-types.ts                          # ALL shared types (single source of truth)
│   ├── main.tsx                              # React entry point
│   ├── App.tsx                               # Root component with router
│   ├── routes.ts                             # Route definitions
│   │
│   ├── 📁 components/                        # Reusable UI components (80 files)
│   │   ├── 📁 auth/                          # Login, signup, auth modals
│   │   ├── 📁 layout/                        # Headers, footers, sidebars
│   │   ├── 📁 shared/                        # Buttons, inputs, avatars
│   │   ├── 📁 ui/                            # shadcn/ui primitives (46 components)
│   │   ├── 📁 monaco-editor/                 # Code editor integration
│   │   ├── 📁 analytics/                     # Analytics tracking components
│   │   ├── ErrorBoundary.tsx                 # Global error boundary
│   │   ├── theme-toggle.tsx                  # Dark/light mode
│   │   ├── agent-mode-toggle.tsx             # Deterministic/smart mode
│   │   ├── github-export-modal.tsx           # Export to GitHub
│   │   ├── config-modal.tsx                  # Model configuration
│   │   └── byok-api-keys-modal.tsx           # BYOK API key management
│   │
│   ├── 📁 contexts/                          # React contexts
│   │   ├── auth-context.tsx                  # Authentication state
│   │   ├── theme-context.tsx                 # Theme (dark/light)
│   │   └── apps-data-context.tsx             # Apps global state
│   │
│   ├── 📁 hooks/                             # Custom React hooks (14 files)
│   │   ├── useAuthGuard.ts                   # Auth protection
│   │   ├── useActionGuard.ts                 # Action-based auth
│   │   ├── use-app.ts                        # Single app data
│   │   ├── use-apps.ts                       # Apps list with pagination
│   │   ├── use-image-upload.ts               # Image upload handling
│   │   ├── use-analytics.ts                  # Analytics tracking
│   │   └── use-*.ts                          # Other domain hooks
│   │
│   ├── 📁 lib/                               # Core libraries
│   │   ├── api-client.ts                     # ALL API calls (single source)
│   │   └── websocket-client.ts               # WebSocket utilities
│   │
│   ├── 📁 routes/                            # Page components (30 files)
│   │   ├── 📁 chat/                          # Code generation interface
│   │   │   ├── chat.tsx                      # Main chat UI (1208 lines)
│   │   │   ├── 📁 hooks/
│   │   │   │   └── use-chat.ts               # Chat state management (BRAIN)
│   │   │   ├── 📁 utils/
│   │   │   │   ├── handle-websocket-message.ts  # WS message handler (831 lines)
│   │   │   │   └── deduplicate-messages.ts   # Message deduplication
│   │   │   └── 📁 components/
│   │   │       ├── phase-timeline.tsx        # Phase progress UI
│   │   │       ├── messages.tsx              # Chat messages
│   │   │       ├── editor.tsx                # Code editor view
│   │   │       └── blueprint.tsx             # Blueprint display
│   │   │
│   │   ├── 📁 app/                           # Single app detail page
│   │   ├── 📁 apps/                          # Apps list/discovery
│   │   ├── 📁 settings/                      # User settings
│   │   ├── 📁 auth/                          # Auth pages
│   │   └── home.tsx                          # Landing page
│   │
│   ├── 📁 utils/                             # Utility functions
│   │   ├── analytics.ts                      # Analytics helpers
│   │   ├── logger.ts                         # Client-side logging
│   │   ├── screenshot.ts                     # Screenshot utilities
│   │   ├── sentry.ts                         # Error tracking
│   │   ├── validationUtils.ts                # Input validation
│   │   └── 📁 ndjson-parser/                 # NDJSON streaming parser
│   │
│   └── 📁 assets/                            # Static assets
│       └── 📁 provider-logos/                # LLM provider logos
│
├── 📁 worker/                                 # Backend Cloudflare Worker
│   ├── index.ts                              # Worker entry point (7860 lines)
│   ├── app.ts                                # Hono app setup
│   │
│   ├── 📁 agents/                            # AI Agent System (88 files)
│   │   ├── 📁 core/                          # Agent DO base classes
│   │   │   ├── simpleGeneratorAgent.ts       # Main agent DO (2800+ lines)
│   │   │   ├── smartGeneratorAgent.ts        # Smart mode variant
│   │   │   ├── websocket.ts                  # WebSocket handler (250 lines)
│   │   │   ├── state.ts                      # CodeGenState interface
│   │   │   ├── stateMigration.ts             # State version migrations
│   │   │   └── types.ts                      # Core types
│   │   │
│   │   ├── 📁 assistants/                    # Specialized AI assistants
│   │   │   ├── codeDebugger.ts               # Deep debugger (Gemini 2.5 Pro)
│   │   │   ├── projectsetup.ts               # Initial setup assistant
│   │   │   └── realtimeCodeFixer.ts          # Real-time fixes
│   │   │
│   │   ├── 📁 operations/                    # State machine operations
│   │   │   ├── PhaseGeneration.ts            # Phase planning
│   │   │   ├── PhaseImplementation.ts        # File generation (37k lines)
│   │   │   ├── UserConversationProcessor.ts  # Orange AI (42k lines)
│   │   │   ├── PostPhaseCodeFixer.ts         # Code review/fixes
│   │   │   ├── FileRegeneration.ts           # Single file fixes
│   │   │   └── ScreenshotAnalysis.ts         # Image analysis
│   │   │
│   │   ├── 📁 tools/                         # LLM Tools
│   │   │   ├── customTools.ts                # Tool registry
│   │   │   ├── types.ts                      # Tool type definitions
│   │   │   └── 📁 toolkit/                   # Individual tools (17 files)
│   │   │       ├── read-files.ts             # Read source code
│   │   │       ├── run-analysis.ts           # Static analysis
│   │   │       ├── get-runtime-errors.ts     # Runtime errors
│   │   │       ├── get-logs.ts               # Container logs
│   │   │       ├── regenerate-file.ts        # Fix files
│   │   │       ├── generate-files.ts         # Generate files
│   │   │       ├── deploy-preview.ts         # Deploy to sandbox
│   │   │       ├── exec-commands.ts          # Run commands
│   │   │       ├── deep-debugger.ts          # Debug assistant
│   │   │       ├── queue-request.ts          # Queue features
│   │   │       ├── alter-blueprint.ts        # Modify PRD
│   │   │       ├── rename-project.ts         # Rename project
│   │   │       ├── wait.ts                   # Wait N seconds
│   │   │       ├── wait-for-generation.ts    # Wait for generation
│   │   │       ├── wait-for-debug.ts         # Wait for debug
│   │   │       ├── web-search.ts             # Web search (8k lines)
│   │   │       └── feedback.ts               # User feedback
│   │   │
│   │   ├── 📁 inferutils/                    # LLM inference engine
│   │   │   ├── core.ts                       # Main infer() function
│   │   │   ├── infer.ts                      # Execution wrapper
│   │   │   ├── config.ts                     # Model configurations
│   │   │   ├── config.types.ts               # Config types
│   │   │   └── common.ts                     # Shared types
│   │   │
│   │   ├── 📁 services/                      # Agent service abstractions
│   │   │   ├── 📁 interfaces/                # Service interfaces
│   │   │   │   ├── ICodingAgent.ts           # Agent interface
│   │   │   │   ├── IFileManager.ts           # File operations
│   │   │   │   ├── IDeploymentManager.ts     # Deployment interface
│   │   │   │   ├── IServiceOptions.ts        # Service options
│   │   │   │   └── IGitService.ts            # Git operations
│   │   │   └── 📁 implementations/           # Service implementations
│   │   │       ├── CodingAgent.ts            # Agent proxy for DO
│   │   │       ├── FileManager.ts            # File CRUD, validation
│   │   │       ├── DeploymentManager.ts      # Sandbox deployment (710 lines)
│   │   │       ├── GitService.ts             # Git operations
│   │   │       └── BaseAgentService.ts       # Base class
│   │   │
│   │   ├── 📁 git/                           # Git system (isomorphic-git)
│   │   │   ├── git-clone-service.ts          # Git clone protocol (388 lines)
│   │   │   ├── fs-adapter.ts                 # SQLite filesystem
│   │   │   └── MemFS.ts                      # In-memory filesystem
│   │   │
│   │   ├── 📁 planning/                      # Project planning
│   │   │   ├── blueprint.ts                  # Blueprint generation
│   │   │   └── templateSelector.ts           # Template selection
│   │   │
│   │   ├── 📁 domain/                        # Domain logic
│   │   ├── 📁 utils/                         # Agent utilities
│   │   ├── 📁 schemas.ts                     # Zod schemas
│   │   ├── prompts.ts                        # Shared prompts
│   │   └── constants.ts                      # WS message types
│   │
│   ├── 📁 api/                               # HTTP API Layer
│   │   ├── 📁 routes/                        # Route definitions
│   │   │   ├── index.ts                      # Main router
│   │   │   ├── agentRoutes.ts                # Agent CRUD
│   │   │   ├── authRoutes.ts                 # Authentication
│   │   │   ├── appRoutes.ts                  # Apps CRUD
│   │   │   ├── gitRoutes.ts                  # Git clone endpoints
│   │   │   ├── webhookRoutes.ts              # Webhooks
│   │   │   └── diagnosticRoutes.ts           # Debug endpoints
│   │   │
│   │   ├── 📁 controllers/                   # Business logic
│   │   │   ├── 📁 agent/                     # Agent controller
│   │   │   ├── 📁 apps/                      # Apps controller
│   │   │   ├── 📁 auth/                      # Auth controller
│   │   │   ├── 📁 git/                       # Git controller
│   │   │   └── 📁 diagnostics/               # Debug controller
│   │   │
│   │   ├── 📁 handlers/                      # Special handlers
│   │   │   ├── git-cache.ts                  # Git caching
│   │   │   └── websocket-upgrade.ts          # WS upgrade
│   │   │
│   │   ├── websocketTypes.ts                 # WebSocket types
│   │   └── apiUtils.ts                       # API utilities
│   │
│   ├── 📁 database/                          # Database Layer (D1 + Drizzle)
│   │   ├── schema.ts                         # All table schemas (618 lines)
│   │   ├── index.ts                          # Database service exports
│   │   ├── database.ts                       # DatabaseService class
│   │   │
│   │   └── 📁 services/                      # Domain services
│   │       ├── BaseService.ts                # Base DB service
│   │       ├── AuthService.ts                # Authentication
│   │       ├── SessionService.ts             # JWT sessions
│   │       ├── UserService.ts                # User CRUD
│   │       ├── AppService.ts                 # App CRUD + rankings
│   │       ├── AnalyticsService.ts           # Views, stars, activity
│   │       ├── SecretsService.ts             # Encrypted secrets
│   │       ├── ModelConfigService.ts         # Model overrides
│   │       ├── ModelProvidersService.ts      # BYOK providers
│   │       ├── ApiKeyService.ts              # API keys
│   │       └── ModelTestService.ts           # Model testing
│   │
│   ├── 📁 services/                          # External Services (50 files)
│   │   ├── 📁 sandbox/                       # Sandbox service (12 files)
│   │   │   ├── remoteSandboxService.ts       # Sandbox API client
│   │   │   ├── BaseSandboxService.ts         # Base sandbox class
│   │   │   ├── sandboxSdkClient.ts           # SDK wrapper
│   │   │   ├── sandboxTypes.ts               # Types
│   │   │   ├── factory.ts                    # Service factory
│   │   │   ├── request-handler.ts            # HTTP requests
│   │   │   └── fileTreeBuilder.ts            # File tree utilities
│   │   │
│   │   ├── 📁 code-fixer/                    # TypeScript fixer (14 files)
│   │   │   ├── index.ts                      # Main fixer (11k lines)
│   │   │   ├── types.ts                      # Fixer types
│   │   │   ├── 📁 fixers/                    # Error-specific fixers
│   │   │   │   ├── ts2304.ts                 # Cannot find name
│   │   │   │   ├── ts2305.ts                 # Missing export
│   │   │   │   ├── ts2307.ts                 # Cannot find module
│   │   │   │   ├── ts2613.ts                 # Not a module
│   │   │   │   ├── ts2614.ts                 # Import/export mismatch
│   │   │   │   └── ts2724.ts                 # Incorrect import
│   │   │   └── 📁 utils/                     # Fixer utilities
│   │   │
│   │   ├── 📁 oauth/                         # OAuth providers
│   │   │   ├── base.ts                       # Base OAuth provider
│   │   │   ├── google.ts                     # Google OAuth
│   │   │   ├── github.ts                     # GitHub OAuth
│   │   │   └── factory.ts                    # Provider factory
│   │   │
│   │   ├── 📁 github/                        # GitHub integration
│   │   │   ├── GitHubService.ts              # GitHub API client
│   │   │   └── types.ts                      # GitHub types
│   │   │
│   │   ├── 📁 rate-limit/                    # Rate limiting (5 files)
│   │   │   ├── rateLimits.ts                 # Rate limit service
│   │   │   ├── rateLimitDO.ts                # Durable Object store
│   │   │   ├── rateLimitKV.ts                # KV store
│   │   │   └── types.ts                      # Rate limit types
│   │   │
│   │   ├── 📁 deployer/                      # Cloudflare deployment
│   │   ├── 📁 aigateway-proxy/               # AI Gateway proxy
│   │   ├── 📁 analytics/                     # Analytics tracking
│   │   ├── 📁 cache/                         # Caching layer
│   │   ├── 📁 csrf/                          # CSRF protection
│   │   └── 📁 sentry/                        # Error tracking
│   │
│   ├── 📁 utils/                             # Utility functions (15 files)
│   │   ├── authUtils.ts                      # Auth utilities
│   │   ├── jwtUtils.ts                       # JWT creation/verification
│   │   ├── passwordService.ts                # bcrypt password hashing
│   │   ├── cryptoUtils.ts                    # Encryption/hashing
│   │   ├── inputValidator.ts                 # Input validation
│   │   ├── validationUtils.ts                # Schema validation
│   │   ├── ErrorHandling.ts                  # Error classes
│   │   ├── idGenerator.ts                    # ID generation (ULID)
│   │   ├── images.ts                         # Image processing
│   │   ├── urls.ts                           # URL utilities
│   │   ├── githubUtils.ts                    # GitHub helpers
│   │   ├── timeFormatter.ts                  # Time formatting
│   │   ├── deployToCf.ts                     # CF deployment
│   │   ├── dispatcherUtils.ts                # Request dispatching
│   │   └── envs.ts                           # Environment helpers
│   │
│   ├── 📁 middleware/                        # HTTP middleware
│   │   ├── 📁 auth/                          # Auth middleware
│   │   │   └── routeAuth.ts                  # Route protection
│   │   └── errorHandler.ts                   # Global error handler
│   │
│   ├── 📁 config/                            # Configuration
│   │   ├── index.ts                          # Config exports
│   │   └── security.ts                       # Security config
│   │
│   ├── 📁 logger/                            # Logging system
│   │   └── index.ts                          # Logger implementation
│   │
│   ├── 📁 types/                             # Shared types
│   │   ├── image-attachment.ts               # Image types
│   │   └── index.ts                          # Type exports
│   │
│   └── 📁 observability/                     # Observability
│       └── sentry.ts                         # Sentry integration
│
├── 📁 shared/                                # Shared between frontend/backend
│   └── 📁 types/                             # Shared type definitions
│       └── errors.ts                         # Error types
│
├── 📁 migrations/                            # Database migrations
│   ├── 0000_living_forge.sql                # Initial schema
│   ├── 0001_married_moondragon.sql          # Migration 1
│   ├── 0002_nebulous_fantastic_four.sql     # Migration 2
│   └── 📁 meta/                              # Migration metadata
│       ├── _journal.json                     # Migration journal
│       └── *_snapshot.json                   # Schema snapshots
│
├── 📁 scripts/                               # Utility scripts
│   ├── setup.ts                              # Project setup
│   ├── deploy.ts                             # Deployment script
│   └── undeploy.ts                           # Cleanup script
│
├── 📁 public/                                # Static assets
│   ├── favicon.ico
│   └── logo.png
│
├── 📁 docs/                                  # Documentation
│   └── llm.md                                # THIS FILE - comprehensive guide
│
└── 📁 Config Files (Root)
    ├── package.json                          # Dependencies
    ├── tsconfig.json                         # TypeScript config
    ├── vite.config.ts                        # Vite config
    ├── wrangler.jsonc                        # Cloudflare Workers config
    ├── drizzle.config.local.ts               # Local DB config
    ├── drizzle.config.remote.ts              # Production DB config
    ├── components.json                       # shadcn/ui config
    ├── eslint.config.js                      # ESLint config
    ├── .editorconfig                         # Editor config
    └── .dev.vars                             # Local environment variables
```

---

## 💬 Chat View Architecture

### **Core Component:** `/src/routes/chat/chat.tsx`

**Layout:**
- **Left Panel (40%):** Chat messages, phase timeline, deployment controls, chat input
- **Right Panel (60%):** Editor view, Preview iframe, or Blueprint markdown

### **State Management:** `/src/routes/chat/hooks/use-chat.ts`

This hook manages all chat state:
```typescript
{
  files: FileType[]              // Generated files
  phaseTimeline: PhaseTimelineItem[] // Phase progress
  messages: ChatMessage[]        // Chat history
  websocket: WebSocket           // Real-time connection
  isGenerating: boolean          // Generation state
  previewUrl: string             // Preview deployment URL
  // ... deployment, blueprint, bootstrap state
}
```

### **WebSocket Message Handler**

**Location:** `/src/routes/chat/utils/handle-websocket-message.ts`

**Critical Messages:**
- `agent_connected` - Restore full state on connect
- `conversation_state` - Load chat history with deduplication
- `file_generating` / `file_generated` - File generation progress
- `phase_implementing` / `phase_implemented` - Phase progress
- `deployment_completed` - Preview URL ready
- `conversation_response` - AI message (streaming or complete)
- `generation_stopped` - User cancelled, mark phases as "cancelled"

### **Phase Timeline**

**Component:** `/src/routes/chat/components/phase-timeline.tsx`

**Status States:**
- `generating` - Active (orange spinner)
- `validating` - Code review (blue spinner)
- `completed` - Success (green checkmark)
- `cancelled` - Interrupted (orange X)
- `error` - Failed (red alert)

### **Message Deduplication**

**Problem:** Tool execution causes duplicate AI messages

**Solution:** Multi-layer approach
1. Backend skips redundant LLM calls (empty tool results)
2. Frontend utilities (`deduplicate-messages.ts`) for live and restored messages
3. System prompt teaches LLM not to repeat

---

## 🔧 Backend Architecture

### **Durable Objects Pattern**

Each chat session is a Durable Object instance:

```typescript
class SimpleCodeGeneratorAgent implements DurableObject {
  // Persisted in SQLite
  private state: CodeGenState;
  
  // In-memory only (ephemeral)
  private currentAbortController?: AbortController;
  private deepDebugPromise: Promise<any> | null = null;
}
```

**Key Concepts:**
- **Persistent State:** Stored in SQLite (blueprint, files, history)
- **Ephemeral State:** In-memory (abort controllers, active promises)
- **Lifecycle:** Created on-demand, evicted after inactivity
- **Concurrency:** Single-threaded per DO instance

### **CodeGenState - Agent Persistent State**

**Location:** `/worker/agents/core/state.ts`

Stored in Durable Object SQLite, survives page refreshes.

**Key groups:**

1. **Project Identity:** blueprint (full PRD), projectName, original query, templateName
2. **File Management:** generatedFilesMap (tracks all files with hash, modified time, uncommitted changes)
3. **Phase Tracking:** generatedPhases (completed), currentPhase (active), phasesCounter
4. **State Machine:** currentDevState (IDLE/PHASE_GENERATING/PHASE_IMPLEMENTING/REVIEWING/FINALIZING), shouldBeGenerating flag, mvpGenerated, reviewingInitiated
5. **Sandbox:** sandboxInstanceId, commandsHistory, lastPackageJson
6. **Configuration:** agentMode (deterministic/smart), sessionId, hostname
7. **Conversation:** conversationMessages (chat history), pendingUserInputs, projectUpdatesAccumulator
8. **Debug:** lastDeepDebugTranscript (for context in next debug session)

---

## 📋 Blueprint - Project Requirements Document

**Location:** `/worker/agents/schemas.ts`

The blueprint is the complete PRD generated from user's prompt. Contains:

1. **Identity:** title, projectName (kebab-case), description
2. **Visual Design:** colorPalette (RGB codes), views (screens/pages)
3. **User Experience:** uiLayout, uiDesign, userJourney
4. **Technical Architecture:** dataFlow, component structure
5. **Features:** List of capabilities
6. **Phases:** Ordered implementation steps with file paths and purposes
7. **Development Guide:** pitfalls (common bugs to avoid), frameworks (allowed dependencies)
8. **Implementation Roadmap:** High-level phases
9. **Initial Phase:** First phase to implement with file list

**Generation process:**
1. User submits query
2. Template selection (LLM picks React/Vue/Next/etc.)
3. Blueprint generation (large LLM call with full context)
4. Bootstrap template files
5. Initial phase implementation
6. User can iterate or approve

**Key principles:**
- Blueprint is source of truth for entire project
- Modified via `alter_blueprint` tool
- Pitfalls guide prevent common mistakes
- Framework constraints limit dependencies

---

# 📦 ADDITIONAL DIRECTORIES

## container/

**Purpose:** Sandbox container tooling for local development and debugging

**Location:** `/container/`

**Key files:**

1. **cli-tools.ts** - Command-line interface for container operations:
   - File synchronization
   - Command execution in sandbox
   - Log retrieval
   - Static analysis
   - Runtime error monitoring

2. **storage.ts** - Persistent storage management:
   - Key-value store for container state
   - File system operations
   - Cache management

3. **process-monitor.ts** - Process lifecycle monitoring:
   - Dev server health checks
   - Process restart on crashes
   - Resource usage tracking
   - Error collection

4. **types.ts** - TypeScript types for container APIs

**Usage:**
These tools are used internally by the sandbox service and for local debugging. Not typically modified unless adding new sandbox features.

---

## templates/

**Purpose:** Project template system for generating new apps

**Location:** `/templates/`

**Key files:**

1. **template_catalog.json** - Master catalog of all available templates:
   - React (Vite, CRA)
   - Next.js
   - Vue
   - Svelte
   - Vanilla JS
   Each with metadata: name, description, files, dependencies

2. **definitions/** - Template definition files (not in repo, generated)

3. **zips/** - Compressed template archives for deployment

4. **generate_template_catalog.py** - Builds catalog from template sources

5. **deploy_templates.sh** - Deploys templates to production

6. **reference/** - Reference implementations

**How templates work:**
1. Agent selects template based on user's requirements (React, Vue, etc.)
2. Template provides base files (package.json, tsconfig, etc.)
3. Agent generates additional files on top of template
4. All files deployed to sandbox for preview

**Adding new templates:**
1. Create template definition in `definitions/`
2. Run `python generate_template_catalog.py`
3. Test locally with agent
4. Deploy: `bash deploy_templates.sh`

---

# 🌳 GIT SYSTEM

## Overview

**Location:** `/worker/agents/git/`

Vibesdk uses **isomorphic-git** to manage version control entirely in the browser/Worker environment - no git binary required.

**Key features:**
- Git operations in SQLite (no filesystem needed)
- Full commit history tracking
- Git clone protocol support (clone generated repos)
- Template rebasing for clean history

---

## Git Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Agent (Durable Object)                    │
│  - Generates files                                          │
│  - Tracks changes                                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Calls
┌─────────────────────────────────────────────────────────────┐
│                      GitService                             │
│  - commitFiles()                                            │
│  - getCommitHistory()                                       │
│  - buildCloneRepository()                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Uses
┌─────────────────────────────────────────────────────────────┐
│                    isomorphic-git                           │
│  - commit(), log(), readCommit()                            │
│  - Works with SQLite filesystem                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Stores in
┌─────────────────────────────────────────────────────────────┐
│                  SQLite Filesystem                          │
│  - fs-adapter.ts                                            │
│  - Git objects stored as blobs                              │
│  - Read/write via SQL queries                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Operations

### **1. File Commits**
**When:** After each phase implementation, after fixes

**Flow:**
1. Agent tracks file changes (new/modified)
2. Calls `GitService.commitFiles(files, message)`
3. Git service stages all files
4. Creates commit with metadata:
   - Author: "vibesdk AI Agent"
   - Committer: same
   - Message: "Phase X: Feature Y" or "Fix: Bug Z"
   - Timestamp: current time
5. Stores commit in SQLite
6. Returns commit SHA

**Example messages:**
- "Phase 1: Initial project setup"
- "Phase 2: Add user authentication"
- "Fix: Resolve type errors in UserStore"
- "Update: Improve button styling"

### **2. Commit History**
**Used by:** Git clone service, UI display

**Flow:**
1. Query git log via isomorphic-git
2. Returns commits with:
   - SHA, author, message, timestamp
   - Parent commits
   - Tree (file snapshot)
3. Ordered newest first

### **3. Git Clone Service**
**Purpose:** Allow users to clone their generated repos locally

**Location:** `/worker/agents/git/git-clone-service.ts`

**Problem:** Agent commits are separate from template commits. Users cloning would get disconnected history.

**Solution:** Rebase agent commits on top of template

**Process:**
1. **Create fresh repo** in memory (MemFS)
2. **Template base commit:**
   - Write all template files
   - Commit as "Initial template setup"
   - This becomes commit #0
3. **Import agent's git objects** (skip refs)
4. **Replay each agent commit:**
   - Read commit from agent's repo
   - Extract files from commit tree
   - Write files to memory repo (template + agent files)
   - Stage ALL files
   - Create new commit with:
     - Same message as original
     - Same author/committer
     - Same timestamps
     - Parent = previous rebased commit
5. **Generate packfile:**
   - Collect ALL git objects
   - Create git packfile (binary format)
   - Return via HTTP (git clone protocol)

**Result:** Clean linear history starting from template

### **4. Git Clone Protocol**

**Endpoints:**
- `GET /git/{agentId}/info/refs?service=git-upload-pack` - Returns refs (branches/tags)
- `POST /git/{agentId}/git-upload-pack` - Returns packfile for clone

**Usage:**
```bash
git clone https://vibesdk.com/git/{agentId}
```

User gets complete repository with:
✅ All commits with original messages
✅ Full file history
✅ Template base included
✅ Can push to GitHub, modify locally, etc.

---

## SQLite Filesystem Adapter

**Location:** `/worker/agents/git/fs-adapter.ts`

**Purpose:** Make SQLite look like a filesystem to isomorphic-git

**Implementation:**
- Implements Node.js `fs` API (readFile, writeFile, readdir, stat, etc.)
- Stores files as blobs in SQLite
- Handles directory structures
- Supports git object storage format

**Why SQLite?**
- Durable Objects have SQLite built-in
- Persistent across DO hibernation
- Fast for git operations
- No external filesystem needed

---

## Memory Filesystem (MemFS)

**Location:** `/worker/agents/git/MemFS.ts`

**Purpose:** Ephemeral in-memory filesystem for clone service

**Usage:**
- Git clone service builds repo in memory
- Fast (no disk I/O)
- Garbage collected after request completes
- Full async API for isomorphic-git

---

## Commit Preservation

When cloning, the following are preserved:

✅ **Commit messages** - Exact text
✅ **Author info** - Name, email
✅ **Timestamps** - Original commit times
✅ **Committer info** - Who made the commit  
✅ **File states** - Exact file content at each commit
✅ **Template files** - Base template in all commits

❌ **NOT preserved:**
- Original commit SHAs (rebased, so new SHAs)
- Agent's internal refs (branches reset)

---

## Testing

**Coverage:** 140 tests passing

**Test areas:**
- Basic git workflow (init, add, commit, log)
- Template rebasing with multiple commits
- Packfile generation
- Large-scale operations (100+ commits)
- File content integrity
- Commit metadata preservation

---

## GitVersionControl Class & Git Tool

### **Overview**

**Location:** `/worker/agents/git/git.ts`

The `GitVersionControl` class wraps isomorphic-git with Git CLI-aligned semantics and provides callback support for FileManager synchronization.

### **Key Methods**

#### **1. commit(files, message)**
Standard git commit - stages and commits files.

```typescript
await git.commit([], 'feat: Add authentication');
```

#### **2. reset(ref, options?)**
**Aligns with:** `git reset --hard <commit>`

```typescript
await git.reset('abc123', { hard: true });
// Moves HEAD to commit, updates working directory
// No new commit created (destructive)
```

**Behavior:**
- Moves HEAD to specified commit
- Updates working directory (hard: true by default)
- **Does NOT create a new commit**
- Triggers `onFilesChangedCallback`

#### **3. log(limit?)**
Query commit history - standard git log.

#### **4. show(oid)**
Show commit details - files changed in commit.

#### **5. setOnFilesChangedCallback(callback)**
Register callback to be notified after git operations that change files.

```typescript
git.setOnFilesChangedCallback(() => {
  fileManager.syncGeneratedFilesMapFromGit();
});
```

#### **6. getAllFilesFromHead()**
Get all files from HEAD commit for syncing.

```typescript
const files = await git.getAllFilesFromHead();
// Returns: [{ filePath: string, fileContents: string }]
```

### **FileManager Sync Pattern**

**File:** `/worker/agents/services/implementations/FileManager.ts`

FileManager is **self-contained** - it registers with GitVersionControl during construction and auto-syncs after git operations.

```typescript
constructor(stateManager, getTemplateDetailsFunc, git) {
  // Auto-register callback with git
  this.git.setOnFilesChangedCallback(() => {
    this.syncGeneratedFilesMapFromGit();
  });
}

private async syncGeneratedFilesMapFromGit(): Promise<void> {
  // Get all files from HEAD commit
  const gitFiles = await this.git.getAllFilesFromHead();
  
  // Preserve existing file purposes
  const oldMap = this.stateManager.getState().generatedFilesMap;
  
  // Build new map
  const newMap = {};
  for (const file of gitFiles) {
    newMap[file.filePath] = {
      ...file,
      filePurpose: oldMap[file.filePath]?.filePurpose || 'Generated file',
      lastDiff: ''
    };
  }
  
  // Update state
  this.stateManager.setState({ generatedFilesMap: newMap });
}
```

**Flow:**
1. FileManager constructed → Registers callback with git
2. User performs operations → Dual-write continues (map + git)
3. User calls git reset/checkout → Git modifies files
4. Git calls callback → FileManager.syncGeneratedFilesMapFromGit()
5. Sync reads from HEAD → Updates generatedFilesMap
6. State synchronized ✅

### **Git Tool - Access Control**

**Location:** `/worker/agents/tools/toolkit/git.ts`

The git tool has **parameterized access control** - different commands available in different contexts.

#### **Tool Creation**

```typescript
export function createGitTool(
  agent: CodingAgentInterface,
  logger: StructuredLogger,
  options?: { excludeCommands?: GitCommand[] }
): ToolDefinition<...> {
  const allowedCommands = options?.excludeCommands
    ? allCommands.filter(cmd => !options.excludeCommands!.includes(cmd))
    : allCommands;
  
  // Dynamic enum and description based on allowed commands
  return {
    function: {
      enum: allowedCommands,
      description: hasReset 
        ? "... WARNING: reset is destructive!"
        : "...",
    }
  };
}
```

#### **Access by Context**

| Context | Available Commands | File | Notes |
|---------|-------------------|------|-------|
| **User Conversations** | commit, log, show | `/worker/agents/tools/customTools.ts` (line 56) | ✅ Safe - no destructive ops |
| **Deep Debugger** | commit, log, show, reset | `/worker/agents/tools/customTools.ts` (line 71) | ⚠️ Full access with warnings |

**User Conversations:**
```typescript
// Safe version - no reset
createGitTool(agent, logger, { excludeCommands: ['reset'] })
```

**Deep Debugger:**
```typescript
// Full access - includes reset
createGitTool(session.agent, logger) // No restrictions
```

#### **Reset Command - Safety**

**Deep debugger prompt warnings:**
- Marked as **UNTESTED** and **DESTRUCTIVE**
- Only use when:
  - User explicitly requests it
  - Tried everything else
  - Absolutely certain it's necessary
- Must warn user before using
- Prefer alternatives: regenerate_file, generate_files

### **Why This Architecture?**

✅ **Single implementation** - DRY principle maintained  
✅ **Type-safe** - TypeScript enforces valid commands  
✅ **Context-aware** - Different access in different contexts  
✅ **Flexible** - Easy to add more restrictions  
✅ **Safe default** - Users can't accidentally reset commits  
✅ **Git CLI semantics** - Aligns with actual git behavior  

### **Removed Methods**

- `inferPurposeFromPath()` - Removed as requested
- `revert()` - Was creating incorrect "revert commits"
- `restoreCommit()` - Renamed to internal helper `readFilesFromCommit`

---

### **Why These Limits?**

**MAX_PHASES = 12:**
- Prevents infinite generation loops
- Forces focused, efficient implementation
- Keeps projects manageable

**MAX_TOOL_CALLING_DEPTH = 7:**
- Prevents infinite recursion
- Typically need 2-3 levels max
- Safety against runaway LLM behavior

**MAX_IMAGES_PER_MESSAGE = 2:**
- Balance between utility and cost
- Vision API costs are high
- Usually 1-2 images sufficient for context

**MAX_LLM_MESSAGES = 200:**
- Prevents conversation from growing unbounded
- Compactification kicks in before this
- Typical session has 20-50 messages

### **State Machine - Detailed Flow**

**States:** Defined in `CurrentDevState` enum

```
┌─────────────────────────────────────────────────────────┐
│                    IDLE                                  │
│  (No active generation)                                  │
└──────────────────┬──────────────────────────────────────┘
                   │ User clicks "Generate"
                   ↓
┌─────────────────────────────────────────────────────────┐
│              PHASE_GENERATING                            │
│  • LLM plans next phase                                  │
│  • Determines files to create                            │
│  • Decides if last phase                                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│            PHASE_IMPLEMENTING                            │
│  • Generate files (streaming)                            │
│  • Deploy to sandbox                                     │
│  • Run static analysis                                   │
│  • Check runtime errors                                  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│               REVIEWING                                  │
│  • Code review agent analyzes files                      │
│  • Identifies issues                                     │
│  • Regenerates files with fixes (parallel)               │
│  • Redeploys and verifies                                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ├─→ More phases needed? → PHASE_GENERATING
                   │
                   ↓ All phases complete
┌─────────────────────────────────────────────────────────┐
│              FINALIZING                                  │
│  • Final code review                                     │
│  • Final fixes                                           │
│  • Mark as complete                                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│                    IDLE                                  │
│  Generation complete, ready for user input               │
└─────────────────────────────────────────────────────────┘
```

### **State Transitions**

| From | To | Trigger |
|------|----|---------|
| IDLE | PHASE_GENERATING | User starts generation / Resume after queue |
| PHASE_GENERATING | PHASE_IMPLEMENTING | Phase plan ready |
| PHASE_IMPLEMENTING | REVIEWING | Files generated, deployed |
| REVIEWING | IDLE | Review complete (not looping back to PHASE_GENERATING) |
| FINALIZING | REVIEWING | After final fixes, review again |
| PHASE_IMPLEMENTING | FINALIZING | Last phase, no more phases needed |
| ANY | IDLE | User stops generation |

### **State Persistence**

- State stored in `CodeGenState.currentDevState`
- Survives page refreshes
- Used to resume generation after reconnect
- If `shouldBeGenerating=true` and state=IDLE → restart

---

## 🧠 Deep Debugger

### **System Prompt & Configuration**
**File:** `/worker/agents/assistants/codeDebugger.ts`
- System prompt defines behavior, diagnostic priorities, action-oriented instructions
- Model: Gemini 2.5 Pro (reasoning_effort: high, 32k tokens, temperature: 0.2)
- Max tool depth: 7 recursive calls

### **Available Tools**
**Tool Registry:** `/worker/agents/tools/customTools.ts` → `buildDebugTools()` function (lines 59-87)

**Tool Definitions Location:** `/worker/agents/tools/toolkit/`

Each tool is a separate file:
1. **read-files.ts** - Read source code
2. **run-analysis.ts** - TypeScript static analysis (tsc --noEmit)
3. **get-runtime-errors.ts** - Fetch runtime errors from sandbox
4. **get-logs.ts** - Container logs (dev server, console)
5. **regenerate-file.ts** - Fix single file with issues list
6. **generate-files.ts** - Generate multiple files
7. **deploy-preview.ts** - Deploy to sandbox
8. **exec-commands.ts** - Run shell commands
9. **wait.ts** - Wait N seconds (for user interaction)
10. **git.ts** - Version control (commit, log, show, reset)

### **How Tools Work**
Each tool file exports:
```typescript
// Structure in /worker/agents/tools/toolkit/{tool-name}.ts
export function createToolName(agent: CodingAgentInterface, logger: StructuredLogger) {
  return {
    type: 'function',
    function: {
      name: 'tool_name',
      description: 'Brief description (LLM sees this)',
      parameters: { /* JSON schema */ }
    },
    implementation: async (args) => {
      // Tool logic here
      return result;
    }
  };
}
```

### **To Add a New Tool:**
1. Create `/worker/agents/tools/toolkit/my-tool.ts`
2. Export `createMyTool(agent, logger)` function
3. Import in `/worker/agents/tools/customTools.ts`
4. Add to either `buildTools()` (conversation) or `buildDebugTools()` (debugging)
5. Tool automatically available to LLM

### **Diagnostic Priority (in system prompt)**
1. **run_analysis** first (fast, no user interaction needed)
2. **get_runtime_errors** second (focused errors)
3. **get_logs** last resort (verbose, cumulative)

**Can fix multiple files in parallel** - `regenerate_file` called simultaneously on different files

**Concurrency:** Cannot run while code generation active - checked via `agent.isCodeGenerating()`

---

## 🔌 WebSocket Communication

### **Connection Flow**
1. User visits `/chat/:chatId`
2. Frontend calls `apiClient.connectToAgent(chatId)`
3. API returns `websocketUrl`
4. Frontend connects via PartySocket
5. Backend sends `agent_connected` with full state
6. Frontend restores UI

### **State Restoration**
```typescript
case 'agent_connected': {
  // Backend sends snapshot
  setState(message.state);
  websocket.send({ type: 'get_conversation_state' });
}

case 'conversation_state': {
  // Restore with deduplication
  const deduplicated = deduplicateMessages(message.messages);
  setMessages(prev => [...prev, ...deduplicated]);
}
```

### **Streaming Pattern**
```typescript
// Backend sends chunks
ws.send({
  type: 'conversation_response',
  conversationId: 'abc',
  message: 'chunk',
  isStreaming: true,
});

// Frontend updates in place
setMessages(prev => updateOrAppendMessage(prev, id, content));
```

---

## 🛠️ Implementation Patterns

### **Adding New API Endpoint**

**1. Define types (`src/api-types.ts`):**
```typescript
export interface GetFeatureRequest {
  id: string;
}

export interface GetFeatureResponse {
  feature: Feature;
}
```

**2. Add to API client (`src/lib/api-client.ts`):**
```typescript
export const apiClient = {
  async getFeature(req: GetFeatureRequest): Promise<GetFeatureResponse> {
    const response = await fetch('/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!response.ok) throw new ApiError(response);
    return response.json();
  },
};
```

**3. Create service (`worker/database/services/FeatureService.ts`):**
```typescript
export class FeatureService {
  constructor(private env: Env) {}
  
  async getFeature(id: string): Promise<Feature> {
    // Database logic
  }
}
```

**4. Create controller (`worker/api/controllers/feature/controller.ts`):**
```typescript
export const featureController = {
  async getFeature(c: Context<AppEnv>) {
    const body = await c.req.json<GetFeatureRequest>();
    const service = new FeatureService(c.env);
    const feature = await service.getFeature(body.id);
    return c.json({ feature });
  },
};
```

**5. Add route (`worker/api/routes/feature-routes.ts`):**
```typescript
export const featureRoutes = new Hono<AppEnv>();
featureRoutes.post('/', featureController.getFeature);
```

**6. Register in main router (`worker/api/routes/index.ts`):**
```typescript
router.route('/api/features', featureRoutes);
```

### **Creating Custom Hook**

**Pattern:** `/src/hooks/use-{feature}.ts`
```typescript
export function useFeature(params: FeatureParams) {
  const [data, setData] = useState<FeatureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    async function fetch() {
      try {
        const result = await apiClient.getFeature(params);
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [params]);
  
  const refetch = useCallback(() => {
    setLoading(true);
    // ... refetch logic
  }, [params]);
  
  return { data, loading, error, refetch };
}
```

### **Adding LLM Tool**

**1. Create tool file (`worker/agents/tools/toolkit/my-tool.ts`):**
```typescript
export function createMyToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: 'my_tool',
      description: 'Brief description (2-3 lines max)',
      parameters: {
        type: 'object',
        properties: {
          param: { type: 'string', description: 'Param description' },
        },
        required: ['param'],
      },
    },
  };
}

export async function myToolImplementation(
  args: { param: string },
  context: ToolContext,
  streamCb?: StreamCallback
): Promise<ToolResult> {
  // Check concurrency if needed
  if (context.agent.isCodeGenerating()) {
    return { error: 'GENERATION_IN_PROGRESS' };
  }
  
  // Implementation
  const result = await doWork(args.param);
  
  return { result };
}
```

**2. Register tool (`worker/agents/tools/customTools.ts`):**
```typescript
import { createMyToolDefinition, myToolImplementation } from './toolkit/my-tool';

export function buildTools(agent: CodingAgentInterface) {
  return [
    // ... existing tools
    createTool(createMyToolDefinition(), myToolImplementation),
  ];
}
```

---

## 🧪 Testing Patterns

### **Frontend Tests**
- Component tests in `__tests__/` directories
- Integration tests for hooks
- E2E tests with Playwright (if applicable)

### **Backend Tests**
- Unit tests for services
- Integration tests for API endpoints
- Tool execution tests

---

## 📝 Documentation Standards

### **Code Comments**
- Explain WHY, not WHAT (code should be self-documenting)
- Keep comments brief and to the point
- Update comments when code changes
- No emojis in code comments

### **Type Documentation**
```typescript
// ✅ GOOD
/**
 * Represents a generated file in the chat interface.
 * Contains both metadata and content.
 */
export interface FileType {
  filePath: string;
  fileContents: string;
  isGenerating: boolean;
}

// ❌ BAD
// This is a file type that we use to represent files
export interface FileType { ... }
```

---

## 🔍 Debugging Guide

### **Frontend Debugging**
- Use React DevTools for component state
- Check browser console for errors
- Monitor WebSocket messages in Network tab
- Use Debug Panel in chat interface

### **Backend Debugging**
- Check Cloudflare Workers logs
- Use `wrangler tail` for live logs
- Add strategic console.log with prefixes: `[TOOL_CALL_DEBUG]`, `[WS_DEBUG]`
- Check DO storage for persisted state

### **Common Issues**

**Empty Deep Debug Transcript:**
- Check `max_tokens` is sufficient (32000+)
- Verify tool calls are completing
- Check for abort signals

**Duplicate Messages:**
- Verify deduplication utilities are used
- Check backend history management
- Ensure tool results aren't causing re-calls

**WebSocket Disconnects:**
- Check retry logic in `use-chat.ts`
- Verify DO isn't being evicted prematurely
- Check for abort controller issues

---

## 📦 Deployment

### **Frontend**
- Built with Vite
- Deployed as static assets
- Served by Cloudflare Pages or Workers

### **Backend**
- Deployed via Wrangler
- Durable Objects for stateful agents
- D1 for persistent database
- KV for caching (if used)

### **Database Migrations**
```bash
# Generate migration
npm run db:generate

# Apply migrations (local)
npm run db:migrate:local

# Apply migrations (production)
npm run db:migrate:remote
```

---

## 🔄 Continuous Improvement

### **Keep This Document Updated**

When you:
- Add new features or components
- Discover undocumented patterns
- Find inaccuracies or outdated info
- Learn domain-specific knowledge
- Identify new best practices

**Update sections:**
- Add to relevant section
- Create new section if needed
- Mark outdated info with ⚠️ and correction
- Add examples for clarity
- Keep it concise but complete

### **Document Structure**
This guide is organized by:
1. Core principles (rules that never change)
2. Architecture (how things are structured)
3. Patterns (how to implement features)
4. Examples (concrete implementations)

Keep this structure when adding content.

---

## 🔌 WebSocket Communication - Complete Reference

### **WebSocket Message Types**

**Location:** `/worker/agents/constants.ts`

#### **Request Messages (Frontend → Backend):**

```typescript
WebSocketMessageRequests:
- GENERATE_ALL: 'generate_all'           // Start code generation
- DEPLOY: 'deploy'                       // Deploy to Cloudflare Workers
- PREVIEW: 'preview'                     // Deploy to sandbox preview
- STOP_GENERATION: 'stop_generation'     // Cancel current operation
- RESUME_GENERATION: 'resume_generation' // Resume paused generation
- USER_SUGGESTION: 'user_suggestion'     // User message (conversational AI)
- CLEAR_CONVERSATION: 'clear_conversation' // Reset chat history
- GET_CONVERSATION_STATE: 'get_conversation_state' // Request history
- GET_MODEL_CONFIGS: 'get_model_configs' // Request model info
- CAPTURE_SCREENSHOT: 'capture_screenshot' // Capture preview screenshot
- GITHUB_EXPORT: 'github_export'         // DEPRECATED - use OAuth flow
```

#### **Response Messages (Backend → Frontend):**

```typescript
WebSocketMessageResponses:
// Generation Lifecycle
- generation_started: Start of generation process
- generation_complete: All generation finished
- generation_stopped: User cancelled generation
- generation_resumed: Generation restarted after pause

// Phase Progress
- phase_generating: Planning next phase (LLM thinking)
- phase_generated: Phase plan ready
- phase_implementing: Generating files for phase
- phase_implemented: Phase complete, preview refreshing
- phase_validating: Code review in progress
- phase_validated: Code review complete

// File Progress
- file_generating: File generation started
- file_chunk_generated: Streaming file content chunk
- file_generated: File completed
- file_regenerating: Fixing file after review
- file_regenerated: File fix complete

// Code Quality
- code_reviewing: Static analysis + runtime error check
- code_reviewed: Review complete with results
- runtime_error_found: Runtime errors detected in sandbox
- deterministic_code_fix_started: Auto-fixing TypeScript errors
- deterministic_code_fix_completed: Auto-fix complete

// Deployment
- deployment_started: Preview deployment started
- deployment_completed: Preview ready (with URL)
- deployment_failed: Preview deployment failed
- preview_force_refresh: Force iframe refresh
- cloudflare_deployment_started: Production deployment started
- cloudflare_deployment_completed: Deployed to Cloudflare (with URL)
- cloudflare_deployment_error: Production deployment failed

// Screenshot
- screenshot_capture_started: Screenshot capture initiated
- screenshot_capture_success: Screenshot saved
- screenshot_capture_error: Screenshot failed

// Conversational AI
- conversation_response: AI message (streaming or complete)
- conversation_state: Full chat history
- conversation_cleared: Chat history cleared
- project_name_updated: Project renamed
- blueprint_updated: Blueprint modified

// System
- error: Generic error message
- rate_limit_error: Rate limit exceeded
- model_configs_info: Model configuration data
```

### **WebSocket Message Flow Examples**

#### **1. Code Generation Flow:**
```
User clicks "Generate" button
  ↓
Frontend: GENERATE_ALL
  ↓
Backend: generation_started
  ↓
[For each phase]
  Backend: phase_generating (LLM thinking)
  Backend: phase_generated (plan ready)
  Backend: phase_implementing (files starting)
  [For each file]
    Backend: file_generating
    Backend: file_chunk_generated (streaming)
    Backend: file_generated
  Backend: deployment_started
  Backend: deployment_completed (preview URL)
  Backend: code_reviewing (static analysis)
  Backend: code_reviewed (results)
  Backend: phase_implemented (phase done)
  ↓
Backend: generation_complete
```

#### **2. User Conversation Flow:**
```
User types message → clicks send
  ↓
Frontend: USER_SUGGESTION { message, images? }
  ↓
Backend: conversation_response { isStreaming: true } (chunks)
  ↓
[If tool calls]
  Backend: conversation_response { tool: { name, status: 'start' } }
  Backend: conversation_response { tool: { name, status: 'success', result } }
  ↓
Backend: conversation_response { isStreaming: false } (final)
```

#### **3. Abort Generation Flow:**
```
User clicks abort button
  ↓
Frontend: STOP_GENERATION
  ↓
Backend: 
  - Calls agent.cancelCurrentInference()
  - Aborts active AbortController
  - Sets shouldBeGenerating = false
  ↓
Backend: generation_stopped
  ↓
Frontend:
  - Marks active phases as 'cancelled'
  - Shows orange X icon
  - Disables abort button
```

### **Critical State Flags**

#### **`shouldBeGenerating` Flag**

**Purpose:** Persistent intent to generate code, survives page refreshes.

**When set to `true`:**
- User clicks "Generate" button
- User resumes generation

**When set to `false`:**
- User clicks "Stop" button
- Generation completes successfully
- Generation fails permanently

**Why it matters:**
- On page refresh, if `shouldBeGenerating=true` and no active generation → restart
- Prevents abandoned generation sessions
- Used by frontend to show "generating" vs "cancelled" phases

---

## 🤖 Conversational AI System ("Orange")

### **Purpose**
Orange is the AI interface between users and the development agent. It handles:
- User questions and discussions
- Feature/bug requests (via `queue_request` tool)
- Immediate debugging (via `deep_debug` tool)
- Web searches for information

### **System Prompt Philosophy**

**CRITICAL:** Orange speaks AS IF it's the developer:
- ✅ "I'll add that feature"
- ✅ "I'm fixing that bug"
- ❌ NEVER: "The team will...", "The agent will..."

**Two Options for User Requests:**

1. **Immediate Action (deep_debug):**
   - For active bugs needing instant fixes
   - Transfers control to autonomous debug agent
   - Returns transcript after completion
   - User sees real-time progress

2. **Queued Implementation (queue_request):**
   - For features or non-urgent fixes
   - Relays to development agent
   - Implemented in next phase
   - Tell user: "I'll have that in the next phase or two"

### **Available Tools**

**Location:** `/worker/agents/tools/customTools.ts` → `buildTools()`

```typescript
1. queue_request: Queue modification requests
2. get_logs: Fetch sandbox logs (USE SPARINGLY)
3. deep_debug: Autonomous debugging (immediate fixes)
4. git: Version control (commit, log, show) - Safe version without reset
5. wait_for_generation: Wait for code generation
6. wait_for_debug: Wait for debug session
7. deploy_preview: Redeploy sandbox
8. clear_conversation: Clear chat history
9. rename_project: Rename the project
10. alter_blueprint: Modify blueprint fields
11. web_search: Search the web
12. feedback: Submit platform feedback
```

**Note:** User conversations get **safe git tool** (no reset command). Deep debugger gets **full git tool** (includes reset with warnings).

### **Tool Call Rendering**

**Pattern:**
```typescript
// Tool calls appear as expandable UI in chat messages
conversation_response {
  tool: {
    name: 'deep_debug',
    status: 'start' | 'success' | 'error',
    args: { issue: "..."},
    result: "transcript or error"
  }
}
```

**Frontend displays:**
- Tool name with icon
- Status indicator (spinner/check/alert)
- Expandable arguments
- Expandable result (for deep_debug, shows full transcript)

### **Conversation History Management**

**Two-Tier Storage:**

1. **Running History (Compact):**
   - Used for LLM context
   - Size-limited for token efficiency
   - Can be archived/summarized
   - Stored in `compact_conversations` table

2. **Full History:**
   - Complete conversation log
   - Used for UI restoration
   - Never truncated
   - Stored in `full_conversations` table

**Compactification:**
```typescript
COMPACTIFICATION_CONFIG:
- MAX_TURNS: 40 conversation turns
- MAX_ESTIMATED_TOKENS: 100,000 tokens
- PRESERVE_RECENT_MESSAGES: 10 messages always kept
- CHARS_PER_TOKEN: 4 (estimation)
```

**Update Pattern:**
```typescript
addConversationMessage(message) {
  // Update or append to both histories
  if (exists) {
    // Update existing (for streaming)
    runningHistory[index] = message;
  } else {
    // Append new message
    runningHistory.push(message);
  }
  // Same for fullHistory
  save();
}
```

---

## 🛠️ Tool System Architecture

### **Tool Definition Pattern**

**Location:** `/worker/agents/tools/toolkit/{tool-name}.ts`

```typescript
// 1. Define tool schema
export function createMyToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: 'my_tool',
      description: 'CONCISE description (2-3 lines max)',
      parameters: {
        type: 'object',
        properties: {
          param: { 
            type: 'string', 
            description: 'Param description' 
          }
        },
        required: ['param'],
      },
    },
  };
}

// 2. Implement tool logic
export async function myToolImplementation(
  args: { param: string },
  context: ToolContext,
  streamCb?: StreamCallback
): Promise<ToolResult> {
  // Validation
  if (!args.param) {
    return { error: 'Missing required parameter' };
  }
  
  // Concurrency checks (if needed)
  if (context.agent.isCodeGenerating()) {
    return { error: 'GENERATION_IN_PROGRESS' };
  }
  
  // Execute tool logic
  const result = await doWork(args.param);
  
  // Stream progress if callback provided
  streamCb?.('Processing...');
  
  return { result };
}
```

### **Tool Registration**

**For Conversation Tools:**
```typescript
// File: /worker/agents/tools/customTools.ts
import { createMyToolDefinition, myToolImplementation } from './toolkit/my-tool';

export function buildTools(
  agent: CodingAgentInterface,
  logger: StructuredLogger,
  toolRenderer: RenderToolCall,
  streamCb: (chunk: string) => void
): ToolDefinition[] {
  return [
    // ... existing tools
    createTool(createMyToolDefinition(), myToolImplementation),
  ];
}
```

**For Debug Tools:**
```typescript
export function buildDebugTools(
  session: DebugSession,
  logger: StructuredLogger
): ToolDefinition[] {
  return [
    createReadFilesTool(session.agent, logger),
    createRunAnalysisTool(session.agent, logger),
    createRegenerateFileTool(session.agent, logger),
    // ... more debug-specific tools
  ];
}
```

### **Tool Lifecycle Hooks**

```typescript
const tool = {
  function: {...},
  implementation: async (args) => {...},
  
  // Optional hooks for UI feedback
  onStart: (args) => {
    toolRenderer({ 
      name: 'my_tool', 
      status: 'start', 
      args 
    });
  },
  
  onComplete: (args, result) => {
    toolRenderer({ 
      name: 'my_tool', 
      status: 'success', 
      args,
      result: JSON.stringify(result)
    });
  }
};
```

---

## 🗄️ Database Schema Overview

### **Core Tables**

**Location:** `/worker/database/schema.ts`

#### **1. Users Table**
```typescript
users {
  id: text (PK)
  email: text (unique)
  username: text (unique, nullable)
  displayName: text
  avatarUrl: text
  provider: 'github' | 'google' | 'email'
  providerId: text
  passwordHash: text (for email provider)
  
  // Security
  emailVerified: boolean
  failedLoginAttempts: number
  lockedUntil: timestamp
  
  // Preferences
  theme: 'light' | 'dark' | 'system'
  timezone: text
  
  // Status
  isActive: boolean
  isSuspended: boolean
  
  // Timestamps
  createdAt, updatedAt, lastActiveAt, deletedAt
}
```

#### **2. Apps Table**
```typescript
apps {
  id: text (PK)
  title: text
  description: text
  iconUrl: text
  
  // Generation
  originalPrompt: text
  finalPrompt: text
  framework: text
  
  // Ownership
  userId: text (FK → users, nullable for anonymous)
  sessionToken: text (for anonymous)
  
  // Visibility
  visibility: 'private' | 'public'
  status: 'generating' | 'completed'
  
  // Deployment
  deploymentId: text
  githubRepositoryUrl: text
  
  // Metadata
  isArchived: boolean
  isFeatured: boolean
  version: number
  parentAppId: text (for forks)
  screenshotUrl: text
  
  // Timestamps
  createdAt, updatedAt, lastDeployedAt
}
```

#### **3. Sessions Table**
```typescript
sessions {
  id: text (PK)
  userId: text (FK → users)
  
  // Session data
  deviceInfo: text
  userAgent: text
  ipAddress: text
  
  // Security
  isRevoked: boolean
  accessTokenHash: text
  refreshTokenHash: text
  
  // Timing
  expiresAt: timestamp
  createdAt: timestamp
  lastActivity: timestamp
}
```

#### **4. Stars & Favorites**
```typescript
stars {
  id: text (PK)
  userId: text (FK → users)
  appId: text (FK → apps)
  starredAt: timestamp
  
  // Unique constraint on (userId, appId)
}

favorites {
  id: text (PK)
  userId: text (FK → users)
  appId: text (FK → apps)
  createdAt: timestamp
  
  // Unique constraint on (userId, appId)
}
```

#### **5. Analytics Tables**
```typescript
appViews {
  id: text (PK)
  appId: text (FK → apps)
  userId: text (FK → users, nullable)
  sessionId: text
  viewedAt: timestamp
  
  // Indexes for fast counting
}

userModelConfigs {
  id: text (PK)
  userId: text (FK → users)
  agentActionName: text
  
  // Model overrides
  modelName: text
  maxTokens: number
  temperature: number
  reasoningEffort: 'low' | 'medium' | 'high'
  fallbackModel: text
  
  // Unique per user+action
}
```

### **Database Service Pattern**

```typescript
// File: /worker/database/services/DomainService.ts
export class DomainService {
  private db: D1Database;
  
  constructor(env: Env) {
    this.db = env.DB;
  }
  
  async getItem(id: string): Promise<Item> {
    // Use Drizzle ORM for type safety
    const result = await this.db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, id))
      .get();
    
    if (!result) throw new ApiError(404, 'Not found');
    return result;
  }
  
  async createItem(data: CreateInput): Promise<Item> {
    // Insert with validation
    const id = generateId();
    await this.db
      .insert(itemsTable)
      .values({ id, ...data });
    
    return this.getItem(id);
  }
}
```

---

## 📸 Image Attachment System

### **Supported Formats**

**Location:** `/worker/types/image-attachment.ts`

```typescript
SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
MAX_IMAGES_PER_MESSAGE = 2;
```

### **Image Flow**

```
1. User uploads/drags image
   ↓
2. Frontend: Validate size/type
   ↓
3. Frontend: Convert to base64
   ↓
4. Frontend: Show preview
   ↓
5. User sends message
   ↓
6. Frontend → Backend: USER_SUGGESTION { message, images: [...] }
   ↓
7. Backend: Upload to R2 storage
   ↓
8. Backend: Pass to LLM with vision model
   ↓
9. LLM: Analyze image + generate response
```

### **Image Types**

```typescript
// Raw upload from user
interface ImageAttachment {
  id: string;
  filename: string;
  mimeType: SupportedImageMimeType;
  base64Data: string; // Without data URL prefix
  size: number;
  dimensions?: { width: number; height: number };
}

// After R2 upload
interface ProcessedImageAttachment {
  mimeType: SupportedImageMimeType;
  base64Data?: string; // Optional, may be cleared after upload
  r2Key: string; // R2 storage key
  publicUrl: string; // Public URL
  hash: string; // Content hash
}
```

### **Frontend Validation**

**Location:** `/src/hooks/use-image-upload.ts`

```typescript
Validation checks:
1. File type in SUPPORTED_IMAGE_MIME_TYPES
2. File size ≤ MAX_IMAGE_SIZE_BYTES
3. Total images ≤ MAX_IMAGES_PER_MESSAGE

Rejection behavior:
- Show error toast
- Don't add to preview
- Log validation failure
```

### **Backend Validation**

**Location:** `/worker/agents/core/websocket.ts`

```typescript
case USER_SUGGESTION:
  if (images && images.length > MAX_IMAGES_PER_MESSAGE) {
    sendError(`Maximum ${MAX_IMAGES_PER_MESSAGE} images allowed`);
    return;
  }
  
  for (const image of images) {
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      sendError(`Image exceeds ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`);
      return;
    }
  }
```

---

## 🔐 Authentication Guards

**Location:** `/src/hooks/useAuthGuard.ts` and `useActionGuard.ts`

**Purpose:** Protect actions requiring authentication (star, fork, etc.)

**Flow:**
1. User clicks protected action (not authenticated)
2. Guard shows auth modal
3. User logs in via GitHub/Google OAuth
4. OAuth callback creates session
5. Redirects back with `?action=star` parameter
6. Frontend detects parameter, executes pending action
7. Clears action parameter

**Options:** requireFullAuth (reject anonymous), actionContext ("to star this app"), onSuccess callback

---

# 🚀 GETTING STARTED - Common Tasks

## **Adding a New LLM Tool**

**Steps:**
1. Create tool file: `/worker/agents/tools/toolkit/my-new-tool.ts`
2. Structure:
```typescript
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { StructuredLogger } from '../../../logger';

export function createMyNewTool(agent: CodingAgentInterface, logger: StructuredLogger) {
  return {
    type: 'function' as const,
    function: {
      name: 'my_new_tool',
      description: 'Clear 2-3 line description. LLM uses this to decide when to call.',
      parameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'What this parameter does'
          }
        },
        required: ['input']
      }
    },
    implementation: async (args: { input: string }) => {
      logger.info('Tool called', { args });
      // Your logic here
      return { result: 'success' };
    }
  };
}
```
3. Register in `/worker/agents/tools/customTools.ts`:
   - Import: `import { createMyNewTool } from './toolkit/my-new-tool';`
   - Add to `buildTools()` array (line 44): `createMyNewTool(agent, logger),`
4. Tool is now available to conversation agent (Orange AI)

## **Modifying Deep Debugger Behavior**

**File:** `/worker/agents/assistants/codeDebugger.ts`

**System prompt sections:**
- **Identity** (lines 11-25): Who the debugger is
- **Available Tools** (lines 27-70): Tool descriptions (keep concise!)
- **Required Workflow** (lines 72-80): Step-by-step process
- **Diagnostic Priority** (lines 82-110): When to use which tool
- **Action-Oriented** (lines 112-120): Prevents "explain instead of do"
- **Common Pitfalls** (lines 122-140): What NOT to do

**To change tool priority:** Edit "Diagnostic Priority" section

**To add tool to debugger:**
1. Create tool in `/worker/agents/tools/toolkit/`
2. Import in `customTools.ts`
3. Add to `buildDebugTools()` function (line 59)
4. Update debugger system prompt's "Available Tools" section

## **Adding a New WebSocket Message Type**

**Backend:**
1. Add type to `/worker/agents/constants.ts`:
   - `WebSocketMessageRequests` (client → server)
   - `WebSocketMessageResponses` (server → client)
2. Handle in `/worker/agents/core/websocket.ts` → `handleWebSocketMessage()`
3. Send via `sendToConnection(connection, messageType, data)`

**Frontend:**
1. Add type to `/src/api-types.ts` → `WebSocketMessage` union
2. Handle in `/src/routes/chat/utils/handle-websocket-message.ts`
3. Update state in handler

## **Modifying Database Schema**

**Steps:**
1. Edit `/worker/database/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review SQL in `/migrations/{number}_*.sql`
4. Apply locally: `npm run db:migrate:local`
5. Test changes
6. Apply to production: `npm run db:migrate:remote`

**Never:** Manually edit migration files

## **Adding a New Database Service Method**

**Example:** Add method to UserService

**File:** `/worker/database/services/UserService.ts`

```typescript
export class UserService extends BaseService {
  // Existing methods...
  
  async getNewMethod(userId: string): Promise<ResultType> {
    // Use 'fresh' for user's own data
    const readDb = this.getReadDb('fresh');
    
    const result = await readDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
      
    if (!result) throw new Error('Not found');
    return result;
  }
}
```

**Call from controller:**
```typescript
const userService = new UserService(c.env);
const data = await userService.getNewMethod(userId);
```

## **Understanding Agent State Machine**

**Current state:** Check `agent.state.currentDevState`

**States:** Defined in `/worker/agents/core/state.ts` → `CurrentDevState` enum
- `IDLE` (0): No generation
- `PHASE_GENERATING` (1): Planning next phase  
- `PHASE_IMPLEMENTING` (2): Generating files
- `REVIEWING` (3): Code review
- `FINALIZING` (4): Final touches

**State machine logic:** `/worker/agents/core/simpleGeneratorAgent.ts` → `launchStateMachine()` (line 856)

**Operations:**
- Phase Generation: `/worker/agents/operations/PhaseGeneration.ts`
- Phase Implementation: `/worker/agents/operations/PhaseImplementation.ts`
- Code Review: `/worker/agents/operations/PostPhaseCodeFixer.ts`
- Conversation: `/worker/agents/operations/UserConversationProcessor.ts`

## **Finding Where Something is Implemented**

**"Where is X implemented?"**

| Feature | Primary Location |
|---------|------------------|
| Agent state machine | `/worker/agents/core/simpleGeneratorAgent.ts` → `launchStateMachine()` |
| Blueprint generation | `/worker/agents/operations/PhaseGeneration.ts` → system prompt |
| File generation | `/worker/agents/operations/PhaseImplementation.ts` |
| Chat messages | `/worker/agents/operations/UserConversationProcessor.ts` |
| Deep debugging | `/worker/agents/assistants/codeDebugger.ts` |
| Sandbox deployment | `/worker/agents/services/implementations/DeploymentManager.ts` |
| Git operations | `/worker/agents/services/implementations/GitService.ts` |
| WebSocket handling | `/worker/agents/core/websocket.ts` → `handleWebSocketMessage()` |
| Database queries | `/worker/database/services/{Domain}Service.ts` |
| API routes | `/worker/api/routes/*.ts` |
| API controllers | `/worker/api/controllers/{domain}/controller.ts` |
| Frontend API calls | `/src/lib/api-client.ts` (ALL calls in one place) |
| Chat UI state | `/src/routes/chat/hooks/use-chat.ts` |
| Phase timeline UI | `/src/routes/chat/components/phase-timeline.tsx` |
| Auth guards | `/src/hooks/useAuthGuard.ts` |

---

# 🛠️ WORKER SERVICES

## Rate Limiting Service

**Location:** `/worker/services/rate-limit/`

**Purpose:** Prevent API abuse with bucketed sliding window rate limiting

### **Architecture**

**Storage Options:**
1. **Durable Objects** (Primary) - `rateLimitDO.ts`
   - Bucketed sliding window algorithm
   - Better consistency than KV
   - Per-key isolated storage
2. **KV Store** (Fallback) - `rateLimitKV.ts`
   - Global edge cache
   - Eventual consistency

### **Identifier Strategy**

```typescript
// User-based (authenticated)
user:abc123

// Token-based (JWT hash)
token:sha256_hash_16_chars

// IP-based (anonymous)
ip:192.168.1.1
```

### **Rate Limit Types**

**Location:** `/worker/services/rate-limit/config.ts`

1. **API_ENDPOINT** - HTTP endpoint rate limit
2. **LLM_REQUEST** - LLM inference rate limit
3. **AUTH_ATTEMPT** - Login/signup attempts
4. **APP_CREATION** - New app creation
5. **GITHUB_EXPORT** - GitHub push operations

### **Configuration Structure**

```typescript
interface DORateLimitConfig {
  limit: number;        // Max requests per period
  period: number;       // Time window in seconds
  burst?: number;       // Burst allowance
  burstWindow?: number; // Burst time window
  bucketSize: number;   // Bucket size for sliding window
  dailyLimit?: number;  // Optional daily cap
}
```

### **Usage**

```typescript
// In API route
const allowed = await RateLimitService.enforce(
  env,
  request,
  RateLimitType.API_ENDPOINT,
  user
);

if (!allowed) {
  throw new RateLimitExceededError('Too many requests');
}
```

### **LLM Model-Specific Rates**

Different models have different rate increments:
- GPT-4o: 10 units
- GPT-4o-mini: 1 unit
- Claude Sonnet: 15 units
- Gemini Pro: 20 units
- Gemini Flash: 5 units

**Why?** Expensive models consume more quota to prevent abuse.

---

## GitHub Service

**Location:** `/worker/services/github/GitHubService.ts`

**Purpose:** Export generated apps to GitHub repositories

### **Key Operations**

**1. Create Repository**
```typescript
static async createUserRepository(options: {
  token: string;           // User's GitHub PAT
  name: string;            // Repo name
  description?: string;
  private: boolean;        // Public or private
  auto_init?: boolean;     // Create with README
})
```

**2. Push Generated Code**
```typescript
static async pushCodeToRepository({
  token,
  owner,
  repo,
  gitObjects,           // Agent's git objects
  templateDetails,      // Template base
  appQuery,            // Original user prompt
  branch = 'main'
})
```

**Process:**
1. Build git repo with `GitCloneService` (rebases on template)
2. Push all commits to GitHub via Octokit
3. Add README with app description + Cloudflare deploy button
4. Return repository URL

**3. Add Deploy to Cloudflare Button**
```typescript
static async addCloudflareDeployButton({
  token,
  owner,
  repo,
  templateName
})
```

Appends markdown button to README for one-click Cloudflare deployment.

---

## OAuth Service

**Location:** `/worker/services/oauth/`

**Providers:** Google, GitHub

### **Base Pattern** (`base.ts`)

All providers extend `BaseOAuthProvider`:

```typescript
abstract class BaseOAuthProvider {
  abstract getAuthorizationUrl(params): string;
  abstract exchangeCodeForToken(code, verifier): Promise<TokenResponse>;
  abstract getUserInfo(token): Promise<UserInfo>;
}
```

### **OAuth Flow**

**Step 1: Generate Auth URL**
```typescript
const provider = OAuthProviderFactory.create('google', env);
const { url, state, codeVerifier } = await provider.getAuthorizationUrl({
  redirectUri: 'https://app.com/auth/callback',
  state: csrfToken,
  scopes: ['openid', 'email', 'profile']
});

// Store state + verifier in oauthStates table
// Redirect user to url
```

**Step 2: Handle Callback**
```typescript
// Verify state (CSRF protection)
const storedState = await db.getOAuthState(state);
if (!storedState || storedState.used) throw new Error('Invalid state');

// Exchange code for token
const tokenData = await provider.exchangeCodeForToken(
  code,
  storedState.codeVerifier
);

// Get user info
const userInfo = await provider.getUserInfo(tokenData.access_token);

// Create or update user
const user = await authService.findOrCreateOAuthUser({
  provider: 'google',
  providerId: userInfo.id,
  email: userInfo.email,
  displayName: userInfo.name
});

// Create session
const session = await sessionService.createSession(user);
```

**Step 3: Cleanup**
```typescript
// Mark state as used
await db.markOAuthStateUsed(state);

// Cleanup expired states (runs periodically)
await db.cleanupExpiredOAuthStates();
```

### **PKCE (Proof Key for Code Exchange)**

**Purpose:** Prevent authorization code interception

**Flow:**
1. Generate random `codeVerifier` (128 chars)
2. Create `codeChallenge` = SHA256(codeVerifier)
3. Send challenge in auth URL
4. Store verifier in oauthStates table
5. Send verifier in token exchange
6. Provider verifies: SHA256(verifier) == challenge

**Google Implementation:**
- Uses `code_challenge_method=S256`
- Requires `openid` scope

**GitHub Implementation:**
- Standard OAuth 2.0 (no PKCE)
- Uses `state` for CSRF only

---

## Analytics Service

**Location:** `/worker/services/analytics/`

**Purpose:** Track app views, stars, user activity

### **Database Service**

**File:** `/worker/database/services/AnalyticsService.ts`

**Key Operations:**

**1. Track View**
```typescript
await analyticsService.trackView(appId, userId, ipAddress);
```
- Creates view record
- Deduplicates by IP (1 view per IP per day)
- Updates app.viewsCount

**2. Star App**
```typescript
const result = await analyticsService.toggleStar(appId, userId);
// result: { starred: true } or { starred: false }
```
- Adds/removes star
- Updates app.starsCount
- Returns new state

**3. Get Activity Stats**
```typescript
const stats = await analyticsService.getUserActivity(userId, days = 30);
// Returns: appsCreated, totalViews, totalStars, recentActivity[]
```

### **Ranking Impact**

Views and stars affect app rankings:
- **Popular**: `(views × 1) + (stars × 3)` DESC
- **Trending**: `(recent_activity × 1000000 + recency_bonus)` DESC

---

## Cache Service

**Location:** `/worker/services/cache/`

**Purpose:** Cache expensive operations

### **Cache Strategies**

**1. Git Packfile Cache**
```typescript
// Cache generated packfiles for git clone
await cacheService.set(
  `git:packfile:${agentId}`,
  packfileBuffer,
  3600 // 1 hour TTL
);
```

**2. Static Analysis Cache**
```typescript
// Cache TypeScript analysis results
await cacheService.set(
  `analysis:${fileHash}`,
  analysisResults,
  300 // 5 min TTL
);
```

**3. Template Cache**
```typescript
// Cache template file trees
await cacheService.set(
  `template:${templateName}`,
  templateFiles,
  86400 // 24 hours
);
```

### **Implementation**

Uses Cloudflare Cache API:
```typescript
const cache = caches.default;
await cache.put(request, response);
const cached = await cache.match(request);
```

---

## CSRF Protection

**Location:** `/worker/services/csrf/`

**Purpose:** Prevent cross-site request forgery

### **Token Generation**

```typescript
// Generate token for OAuth state
const csrfToken = await crypto.subtle.digest(
  'SHA-256',
  crypto.getRandomValues(new Uint8Array(32))
);
```

### **Validation**

```typescript
// In OAuth callback
if (callbackState !== storedState.state) {
  throw new SecurityError('CSRF token mismatch');
}
```

### **Storage**

CSRF tokens stored in `oauthStates` table:
- `state` column = CSRF token
- `expiresAt` = 10 minutes
- `used` flag prevents replay

---

## User Secrets Store (Durable Object)

**Location:** `/worker/services/secrets/`

**Purpose:** Secure, encrypted storage for user API keys and secrets with key rotation support

### **Architecture**

**Storage:** Durable Object with SQLite backend
- One DO instance per user (userId as DO ID)
- XChaCha20-Poly1305 encryption (AEAD)
- Hierarchical key derivation: MEK → UMK → DEK
- Key rotation metadata tracking

**Core Components:**
1. **UserSecretsStore** (`UserSecretsStore.ts`) - Main DO class
2. **KeyDerivation** (`KeyDerivation.ts`) - PBKDF2-based key derivation
3. **EncryptionService** (`EncryptionService.ts`) - XChaCha20-Poly1305 encryption
4. **Types** (`types.ts`) - Type definitions

### **Key Features**

**1. Hierarchical Key Derivation**
```
Master Encryption Key (MEK) [from env.SECRETS_ENCRYPTION_KEY]
    ↓ PBKDF2 with userId salt
User Master Key (UMK)
    ↓ PBKDF2 with secret-specific salt
Data Encryption Key (DEK) - unique per secret
```

**2. Encryption**
- Algorithm: XChaCha20-Poly1305 (AEAD)
- Unique salt per secret (16 bytes)
- Unique nonce per encryption (24 bytes)
- Authentication tag for integrity verification

**3. Key Rotation**
- Tracks master key fingerprint (SHA-256)
- Detects key changes automatically
- Re-encrypts all secrets with new key
- Maintains rotation statistics

**4. Security Features**
- Access counting (tracks how many times secret accessed)
- Secret expiration timestamps
- Soft deletion (90-day retention)
- Key preview masking (shows first/last 4 chars)

### **Database Schema**

**Tables:**
```sql
-- Main secrets table
CREATE TABLE secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    secret_type TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    nonce BLOB NOT NULL,
    salt BLOB NOT NULL,
    key_preview TEXT NOT NULL,
    metadata TEXT,
    access_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER,
    is_active INTEGER DEFAULT 1,
    key_fingerprint TEXT NOT NULL
);

-- Key rotation tracking
CREATE TABLE key_rotation_metadata (
    id INTEGER PRIMARY KEY DEFAULT 1,
    current_key_fingerprint TEXT NOT NULL,
    last_rotation_at INTEGER NOT NULL,
    rotation_count INTEGER DEFAULT 0
);
```

### **API Methods (RPC - No Exceptions)**

**Critical:** All DO RPC methods return `null` or `boolean` on error, never throw exceptions.

```typescript
// Store new secret
async storeSecret(request: StoreSecretRequest): Promise<SecretMetadata | null>

// Get decrypted value
async getSecretValue(secretId: string): Promise<SecretWithValue | null>

// List secrets (metadata only)
async listSecrets(): Promise<SecretMetadata[]>

// Update secret
async updateSecret(secretId: string, updates: UpdateSecretRequest): Promise<SecretMetadata | null>

// Delete secret (soft delete)
async deleteSecret(secretId: string): Promise<boolean>

// Get key rotation info
async getKeyRotationInfo(): Promise<KeyRotationInfo>
```

### **Type Definitions**

```typescript
interface StoreSecretRequest {
    name: string;
    secretType: 'api_key' | 'oauth_token' | 'webhook_secret' | 'encryption_key' | 'other';
    value: string;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
}

interface SecretMetadata {
    id: string;
    userId: string;
    name: string;
    secretType: string;
    keyPreview: string;
    metadata?: Record<string, unknown>;
    accessCount: number;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}

interface SecretWithValue {
    value: string;
    metadata: SecretMetadata;
}

interface KeyRotationInfo {
    currentKeyFingerprint: string;
    lastRotationAt: number;
    rotationCount: number;
    totalSecrets: number;
    secretsRotated: number;
}
```

### **Usage Example**

```typescript
// Get DO stub
const id = env.UserSecretsStore.idFromName(user.id);
const store = env.UserSecretsStore.get(id);

// Store secret
const metadata = await store.storeSecret({
    name: 'OpenAI API Key',
    secretType: 'api_key',
    value: 'sk-...',
    metadata: { provider: 'openai' }
});

if (!metadata) {
    throw new Error('Failed to store secret');
}

// Retrieve decrypted value
const secret = await store.getSecretValue(metadata.id);

if (!secret) {
    throw new Error('Secret not found or expired');
}

console.log(secret.value); // Decrypted value
console.log(secret.metadata.accessCount); // Incremented on each access

// List all secrets (no values)
const secrets = await store.listSecrets();

// Update secret
const updated = await store.updateSecret(metadata.id, {
    name: 'OpenAI API Key (Production)',
    expiresAt: Date.now() + 86400000 // 24 hours
});

// Delete secret
const deleted = await store.deleteSecret(metadata.id);
```

### **Controller Integration**

**Location:** `/worker/api/controllers/user-secrets/controller.ts`

```typescript
// Example: Get secret value
static async getSecretValue(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    context: RouteContext
): Promise<ControllerResponse<ApiResponse<UserSecretValueData>>> {
    const user = context.user!;
    const secretId = context.pathParams.secretId;
    
    const stub = this.getUserSecretsStub(env, user.id);
    const result = await stub.getSecretValue(secretId);
    
    if (!result) {
        return UserSecretsController.createErrorResponse(
            'Secret not found or has expired',
            404
        );
    }
    
    return UserSecretsController.createSuccessResponse(result);
}
```

### **Key Rotation Process**

**Automatic Detection:**
1. On DO initialization, checks current master key fingerprint
2. Compares with stored fingerprint in database
3. If different, triggers key rotation

**Re-encryption:**
```typescript
async performKeyRotation() {
    // 1. Fetch all active secrets
    const secrets = this.ctx.storage.sql.exec(`
        SELECT * FROM secrets WHERE is_active = 1
    `);
    
    // 2. Decrypt with old key, encrypt with new key
    for (const secret of secrets) {
        const decrypted = await this.decrypt(secret.encrypted_value, ...);
        const encrypted = await this.encrypt(decrypted);
        // 3. Update in database atomically
    }
    
    // 4. Update rotation metadata
}
```

### **Security Considerations**

**✅ Good Practices:**
- Master key stored in Worker environment variable
- Unique salt per secret
- AEAD encryption with integrity verification
- Key rotation support
- Soft deletion for recovery
- Access tracking for audit

**⚠️ Important Notes:**
- DO RPC methods return `null`/`boolean` instead of throwing exceptions
- Master key must be 64 hex characters (32 bytes)
- Expired secrets automatically filtered from results
- Soft deleted secrets retained for 90 days

### **Testing**

**Location:** `/test/worker/services/secrets/`

Comprehensive test suite with **90+ tests** (3 test files):
- **KeyDerivation.test.ts** - 17 unit tests for key derivation
- **EncryptionService.test.ts** - 18 unit tests for encryption/decryption
- **UserSecretsStore.test.ts** - 55+ E2E tests for full DO lifecycle

**Run tests:**
```bash
npm test test/worker/services/secrets
# Or with Bun:
bun run test:bun test/worker/services/secrets
```

**Test Coverage:**
- CRUD operations
- Encryption/decryption
- Key rotation
- Expiration handling
- Concurrency (10 parallel operations)
- Large scale (20+ secrets, 5KB values)
- Data integrity verification
- Error handling

### **Configuration**

**Environment Variables:**
```bash
# Required: 64 hex characters (32 bytes)
SECRETS_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

**Wrangler Configuration:**
```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "UserSecretsStore",
        "class_name": "UserSecretsStore"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v3",
      "new_sqlite_classes": ["UserSecretsStore"]
    }
  ]
}
```

---

# 🎨 FRONTEND RENDERING PATTERNS

## Component Architecture

### **Atomic Design Structure**

**Hierarchy:**
```
1. Primitives (ui/) - shadcn/ui base components
   ↓
2. Shared (shared/) - App-specific reusable components
   ↓
3. Features (routes/) - Page-specific components
   ↓
4. Pages (routes/*.tsx) - Full page views
```

### **Example: Button Hierarchy**

```typescript
// 1. Primitive: /components/ui/button.tsx
export const Button = forwardRef<HTMLButtonElement, ButtonProps>((
  { className, variant, size, ...props },
  ref
) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});

// 2. Shared: /components/shared/AppCard.tsx
export function AppCard({ app }: { app: App }) {
  return (
    <Card>
      <CardHeader>
        <h3>{app.title}</h3>
      </CardHeader>
      <CardFooter>
        <Button onClick={() => navigate(`/app/${app.id}`)}>
          View App
        </Button>
      </CardFooter>
    </Card>
  );
}

// 3. Feature: /routes/apps/apps-list.tsx
export function AppsList() {
  const { apps } = useApps();
  
  return (
    <div>
      {apps.map(app => <AppCard key={app.id} app={app} />)}
    </div>
  );
}
```

---

## State Management Patterns

### **1. Local State (useState)**

**Use for:** UI-only state (modals, dropdowns, form inputs)

```typescript
const [isOpen, setIsOpen] = useState(false);
const [selectedFile, setSelectedFile] = useState<FileType | null>(null);
```

### **2. Server State (Custom Hooks)**

**Use for:** Data from API

```typescript
// /hooks/use-apps.ts
export function useApps(filters?: AppFilters) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    apiClient.getApps(filters).then(setApps);
  }, [filters]);
  
  return { apps, loading, refetch };
}

// Usage
const { apps, loading } = useApps({ sortBy: 'popular' });
```

### **3. Global State (Context)**

**Use for:** Cross-component shared state (auth, theme)

```typescript
// /contexts/auth-context.tsx
const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Usage
const { user } = useAuth();
```

### **4. WebSocket State (use-chat hook)**

**Use for:** Real-time agent state

**Location:** `/src/routes/chat/hooks/use-chat.ts`

**Pattern:**
```typescript
export function useChat(chatId: string) {
  // Local state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<FileType[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // WebSocket connection
  const [websocket, setWebSocket] = useState<WebSocket | null>(null);
  
  // Message handler
  useEffect(() => {
    if (!websocket) return;
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message, {
        setMessages,
        setFiles,
        setIsGenerating,
        // ... other setters
      });
    };
  }, [websocket]);
  
  return {
    messages,
    files,
    isGenerating,
    websocket,
    sendMessage: (text) => {
      websocket?.send(JSON.stringify({ type: 'USER_MESSAGE', text }));
    }
  };
}
```

---

## Rendering Optimization

### **1. useMemo for Expensive Computations**

```typescript
const sortedFiles = useMemo(() => {
  return files.sort((a, b) => a.path.localeCompare(b.path));
}, [files]);
```

### **2. useCallback for Event Handlers**

```typescript
const handleFileClick = useCallback((fileId: string) => {
  setSelectedFile(files.find(f => f.id === fileId));
}, [files]);
```

### **3. React.memo for Pure Components**

```typescript
export const FileTreeNode = memo(({ file, onSelect }: Props) => {
  return (
    <div onClick={() => onSelect(file.id)}>
      {file.name}
    </div>
  );
});
```

### **4. Virtual Scrolling for Large Lists**

```typescript
// For 1000+ items
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: apps.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 200, // Card height
});
```

---

## Data Fetching Patterns

### **1. Single Resource**

```typescript
// /hooks/use-app.ts
export function useApp(appId?: string) {
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    if (!appId) return;
    
    setLoading(true);
    apiClient.getApp(appId)
      .then(setApp)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [appId]);
  
  return { app, loading, error, refetch };
}
```

### **2. Paginated List**

```typescript
// /hooks/use-apps.ts
export function useApps(filters?: AppFilters) {
  const [apps, setApps] = useState<App[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const currentPageRef = useRef(1);
  const isLoadingMoreRef = useRef(false);
  
  const fetchApps = useCallback(async (loadMore = false) => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    
    const page = loadMore ? currentPageRef.current + 1 : 1;
    const result = await apiClient.getApps({ ...filters, page });
    
    if (loadMore) {
      setApps(prev => [...prev, ...result.apps]);
    } else {
      setApps(result.apps);
    }
    
    setHasMore(result.hasMore);
    currentPageRef.current = page;
    isLoadingMoreRef.current = false;
  }, [filters]);
  
  const loadMore = () => fetchApps(true);
  
  return { apps, hasMore, loadMore };
}
```

### **3. Infinite Scroll**

```typescript
const { apps, hasMore, loadMore } = useApps();

const observerRef = useRef<IntersectionObserver>();
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  observerRef.current = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore) {
      loadMore();
    }
  });
  
  if (sentinelRef.current) {
    observerRef.current.observe(sentinelRef.current);
  }
  
  return () => observerRef.current?.disconnect();
}, [hasMore, loadMore]);

return (
  <div>
    {apps.map(app => <AppCard key={app.id} app={app} />)}
    <div ref={sentinelRef} /> {/* Sentinel element */}
  </div>
);
```

---

## Form Handling

### **Controlled Components**

```typescript
const [formData, setFormData] = useState({
  title: '',
  description: '',
  isPublic: true
});

const handleChange = (field: keyof typeof formData) => (
  e: React.ChangeEvent<HTMLInputElement>
) => {
  setFormData(prev => ({ ...prev, [field]: e.target.value }));
};

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  await apiClient.createApp(formData);
};

return (
  <form onSubmit={handleSubmit}>
    <input value={formData.title} onChange={handleChange('title')} />
    <button type="submit">Create</button>
  </form>
);
```

### **Form Validation**

```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

const validate = () => {
  const newErrors: Record<string, string> = {};
  
  if (!formData.title) {
    newErrors.title = 'Title is required';
  }
  if (formData.title.length < 3) {
    newErrors.title = 'Title must be at least 3 characters';
  }
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  if (!validate()) return;
  
  await apiClient.createApp(formData);
};
```

---

## Modal Patterns

### **Simple Modal State**

```typescript
const [isOpen, setIsOpen] = useState(false);

return (
  <>
    <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
    
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modal Title</DialogTitle>
        </DialogHeader>
        {/* Modal content */}
      </DialogContent>
    </Dialog>
  </>
);
```

### **Modal with Data**

```typescript
const [selectedApp, setSelectedApp] = useState<App | null>(null);

return (
  <>
    {apps.map(app => (
      <Button key={app.id} onClick={() => setSelectedApp(app)}>
        Edit
      </Button>
    ))}
    
    {selectedApp && (
      <EditAppModal
        app={selectedApp}
        onClose={() => setSelectedApp(null)}
      />
    )}
  </>
);
```

---

## Error Handling

### **Error Boundary**

```typescript
// /components/ErrorBoundary.tsx
export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to Sentry
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### **API Error Handling**

```typescript
try {
  const app = await apiClient.getApp(appId);
  setApp(app);
} catch (error) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      setError('App not found');
    } else if (error.status === 403) {
      setError('Access denied');
    } else {
      setError('Something went wrong');
    }
  }
}
```

---

# 🏗️ CORE AGENT SYSTEM (Durable Objects)

## Overview

**SimpleCodeGeneratorAgent** is the brain of vibesdk - a Durable Object that orchestrates entire app generation lifecycle.

**Key responsibilities:**
- Blueprint generation from user prompts
- Phase-by-phase code generation
- File management and versioning
- Sandbox deployment and monitoring
- Conversation handling
- Debug session orchestration

---

## Agent Operations (State Machine)

### **1. Blueprint Generation**
**Trigger:** User submits initial prompt
**Flow:**
1. LLM analyzes prompt → generates complete PRD (Blueprint)
2. Blueprint includes: project structure, phases, tech stack, UI design, color palette
3. Saved to state, shown to user for confirmation
4. User can iterate or approve

### **2. Phase Generation** 
**Trigger:** User starts generation or requests new feature
**Flow:**
1. Agent determines next phase from blueprint
2. Uses PhaseGeneration operation to plan files
3. Updates currentDevState = PHASE_GENERATING
4. Generates phase concept (files to create, purposes)

### **3. Phase Implementation**
**Trigger:** Phase concept ready
**Flow:**
1. PhaseImplementation operation generates all files for phase
2. Uses LLM with file generation tools
3. Tracks progress per-file
4. Updates generatedFilesMap with new files
5. Commits to git (isomorphic-git in SQLite)
6. Sets currentDevState = PHASE_IMPLEMENTING

### **4. Code Review & Fixing**
**Trigger:** Phase complete, auto-triggered or user-requested
**Flow:**
1. PostPhaseCodeFixer runs TypeScript static analysis
2. Identifies type errors, missing imports, etc.
3. Automatically fixes common issues (TS2304, TS2307, etc.)
4. Re-analyzes until clean or max iterations
5. Updates files in generatedFilesMap

### **5. Deployment to Sandbox**
**Trigger:** Files ready, user clicks preview
**Flow:**
1. DeploymentManager.deployToSandbox()
2. Syncs all files to remote sandbox container
3. Executes install commands (npm install, etc.)
4. Starts dev server
5. Returns preview URL
6. Monitors health with periodic checks

### **6. User Conversation**
**Trigger:** User sends message during generation
**Flow:**
1. UserConversationProcessor handles chat
2. Queues feature requests if generating
3. Processes immediately if idle
4. Has access to tools: queue_request, deep_debug, deploy, etc.
5. Streams responses via WebSocket

### **7. Deep Debugging**
**Trigger:** User reports bug or runtime error
**Flow:**
1. Agent checks not currently generating (conflict prevention)
2. DeepCodeDebugger assistant spawned
3. Has access to: read files, static analysis, runtime errors, logs, regenerate files
4. Iteratively diagnoses and fixes
5. Saves transcript for context in next session
6. Deploys fixes automatically

---

## Agent Services (Delegation Pattern)

Agent delegates specific responsibilities to service classes:

**Location:** `/worker/agents/services/implementations/`

1. **FileManager** - File CRUD, validation, deduplication
2. **DeploymentManager** - Sandbox lifecycle, deployment, health checks
3. **GitService** - Commit, history, clone service
4. **CodingAgent (Proxy)** - Exposes agent methods to tools (runs in DO context)

**Why services?**
- Separation of concerns
- Testability
- Code reuse
- Clean interfaces

---

# 🧪 SANDBOX SYSTEM

## Overview

Sandboxes are **ephemeral containers** that run user's generated apps in isolated environments.

**Technology:** Remote sandbox service (separate infrastructure)
**Communication:** HTTP API with bearer token auth
**Lifecycle:** Created on-demand, destroyed after inactivity

---

## Sandbox Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent (Durable Object)                  │
│  - Generates code                                           │
│  - Manages state                                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ HTTP API calls
┌─────────────────────────────────────────────────────────────┐
│              RemoteSandboxServiceClient                     │
│  - createInstance()                                         │
│  - writeFiles()                                             │
│  - executeCommands()                                        │
│  - getStaticAnalysis()                                      │
│  - getRuntimeErrors()                                       │
│  - getLogs()                                                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ HTTPS (authenticated)
┌─────────────────────────────────────────────────────────────┐
│                   Sandbox Service API                       │
│  (External infrastructure)                                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Manages
┌─────────────────────────────────────────────────────────────┐
│              Container Instance (per session)               │
│  - Node.js environment                                      │
│  - File system (template + generated files)                 │
│  - Dev server (Vite/Next/etc)                               │
│  - Error monitoring                                         │
│  - Log collection                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Sandbox Operations

### **1. Instance Creation**
**Method:** `createInstance(templateName, projectName, webhookUrl?, envVars?)`

**Flow:**
1. Agent calls with template (react-vite, nextjs, etc.)
2. Sandbox service spins up container
3. Clones template from git
4. Installs base dependencies
5. Returns instanceId + preview URL

**Response:** `{ instanceId, url, status: 'ready' }`

### **2. File Synchronization**
**Method:** `writeFiles(instanceId, files, commitMessage?)`

**Flow:**
1. Agent sends array of files: `[{ path, content, encoding }]`
2. Sandbox writes to container filesystem
3. Triggers hot reload if dev server running
4. Optionally commits to git with message

**Used for:** Initial deployment, incremental updates, fixes

### **3. Command Execution**
**Method:** `executeCommands(instanceId, commands, timeout?)`

**Flow:**
1. Agent sends shell commands (npm install, npm run build, etc.)
2. Sandbox executes in container
3. Returns stdout, stderr, exit code
4. Timeout after 60s default

**Security:** Commands validated/filtered before execution to prevent dangerous operations

### **4. Static Analysis**
**Method:** `getStaticAnalysis(instanceId)`

**Flow:**
1. Sandbox runs TypeScript compiler (tsc --noEmit)
2. Collects all errors with file/line/column
3. Returns structured error list

**Used by:** PostPhaseCodeFixer, deep debugger

### **5. Runtime Error Monitoring**
**Method:** `getRuntimeErrors(instanceId)`

**Flow:**
1. Sandbox monitors browser console errors
2. Collects stack traces, error messages
3. Deduplicates and categorizes
4. Returns recent errors

**Triggers:** Websocket webhook to agent when errors occur

### **6. Log Retrieval**
**Method:** `getLogs(instanceId, lines?, filter?)`

**Flow:**
1. Returns recent console output from container
2. Includes dev server logs, build output, console.log statements
3. Filtered by pattern if provided

**Note:** Logs only appear when user interacts with app

### **7. Instance Shutdown**
**Method:** `shutdownInstance(instanceId)`

**Flow:**
1. Stops dev server
2. Destroys container
3. Frees resources

**Auto-triggered:** After 30 min inactivity or explicit user close

---

## Session Management

Each agent has a **sessionId** that maps to a sandbox instance:

- **Stored in:** `CodeGenState.sessionId`
- **Purpose:** Ensures deployment goes to correct container
- **Reset on:** Timeout errors, critical failures
- **Cached client:** DeploymentManager caches sandbox client per session

**Health Checks:**
- Periodic ping to sandbox every 30s
- If unhealthy, resets sessionId
- Forces redeployment on next attempt

---

# 🚀 DEPLOYMENT FLOW

## Complete Deployment Process

### **Trigger:** User clicks "Preview" button

**Step-by-step:**

1. **Pre-deployment Validation**
   - Check files exist in generatedFilesMap
   - Verify no generation in progress
   - Get or create sessionId

2. **Sandbox Instance Check**
   - If no sandboxInstanceId: create new instance
   - If exists: check health status
   - If unhealthy: reset session, create new instance

3. **Create Instance (if needed)**
   ```
   → createInstance(templateName, projectName, webhookUrl)
   ← { instanceId, url, status }
   → Save instanceId to state
   ```

4. **File Synchronization**
   ```
   → Collect all files from generatedFilesMap
   → Format as { path, content, encoding: 'utf-8' }[]
   → writeFiles(instanceId, files, "Deploy generated code")
   ← { success: true, filesWritten: 42 }
   ```

5. **Package.json Sync**
   ```
   → Check if package.json changed
   → If changed: executeCommands(['npm install'])
   → Wait for completion (timeout: 60s)
   → Cache new package.json in state
   ```

6. **Bootstrap Commands (if needed)**
   ```
   → Execute commandsHistory (previously run user commands)
   → Validates/filters dangerous commands
   → Runs: npm install, setup scripts, etc.
   ```

7. **Start Dev Server**
   ```
   → Already running from instance creation
   → Or trigger via command if stopped
   → Monitor startup logs
   ```

8. **Health Check Loop**
   ```
   → setInterval(30s): ping sandbox
   → Check status endpoint
   → If unhealthy: log warning, may reset
   ```

9. **Return Preview URL**
   ```
   → Send URL to frontend via WebSocket
   → User can open in iframe or new tab
   → App is live and interactive
   ```

---

## Redeployment (Incremental Updates)

When files change after initial deploy:

1. **Diff Detection**
   - Compare file hashes in generatedFilesMap
   - Only sync changed files

2. **Partial Sync**
   ```
   → writeFiles(instanceId, [changedFiles])
   ← Hot reload triggered automatically
   ```

3. **No Full Rebuild**
   - Dev server hot reloads changes
   - Fast iteration (< 1s typically)

---

## Deployment Errors & Recovery

**Common errors:**

1. **Timeout (60s)**
   - Cause: npm install too slow, network issues
   - Recovery: Reset sessionId, retry with fresh instance

2. **Instance Not Found**
   - Cause: Container crashed or evicted
   - Recovery: Create new instance, redeploy all files

3. **Command Execution Failed**
   - Cause: Invalid package.json, dependency conflicts
   - Recovery: Show error to user, allow editing

4. **Health Check Failed**
   - Cause: Dev server crashed, port conflict
   - Recovery: Reset session on next deploy attempt

---

# 🤖 LLM INFERENCE SYSTEM

## Overview

**Location:** `/worker/agents/inferutils/`

Centralized inference engine that all operations use to call LLMs.

**Key features:**
- Multi-provider support (OpenAI, Anthropic via Cloudflare AI Gateway)
- Streaming responses
- Tool calling with recursive execution
- Retry logic with exponential backoff
- Cancellation support (AbortController)
- Token tracking

---

## Inference Flow

```
Operation (PhaseImplementation, UserConversationProcessor, etc.)
        ↓
   getOperationOptions() → InferenceContext
        ↓
   executeInference(args, context)
        ↓
   ┌─────────────────────────────────┐
   │   Retry Loop (max 3 attempts)  │
   └─────────────┬───────────────────┘
                 ↓
            infer(args)
                 ↓
   ┌─────────────────────────────────┐
   │  OpenAI SDK (via AI Gateway)   │
   │  - Model selection              │
   │  - Token streaming              │
   │  - Tool call parsing            │
   └─────────────┬───────────────────┘
                 ↓
          Tool calls present?
                 │
         ┌───────┴───────┐
        Yes              No
         │                │
         ↓                ↓
  Execute tools    Return response
  Recursive infer
```

---

## Model Selection

**Location:** `/worker/agents/inferutils/config.ts`

**Available models:**

1. **GPT-4o** - Fast, good for most tasks
2. **GPT-4o-mini** - Cheapest, simple operations
3. **Claude 3.5 Sonnet** - Best for complex reasoning
4. **Gemini 2.0 Flash** - Fast, experimental
5. **Gemini 2.5 Pro** - Highest quality, deep debugging

**Selection by operation:**
- Blueprint generation: GPT-4o
- Phase planning: GPT-4o  
- File generation: GPT-4o
- Conversation: GPT-4o-mini
- Deep debugging: Gemini 2.5 Pro (reasoning_effort: high)
- Code review: GPT-4o

---

## Streaming

**When enabled:**
- User conversation responses
- Deep debugger output
- Real-time code generation feedback

**How it works:**
1. LLM sends Server-Sent Events (SSE)
2. `infer()` yields chunks via async generator
3. Operation accumulates + forwards to WebSocket
4. Frontend renders progressively

---

## Tool Calling

**Recursive execution:**

1. LLM response includes `tool_calls` array
2. `infer()` executes each tool in parallel
3. Results collected
4. Filtered (empty/null results skipped)
5. If results exist: call LLM again with tool outputs
6. Repeat until LLM provides final response

**Max depth:** Configurable per operation

---

## Retry Logic

**Triggers retry:**
- Rate limit errors (429)
- Network timeouts
- Temporary API failures (5xx)

**Does NOT retry:**
- Cancelled operations (AbortError)
- Invalid API key (401)
- Malformed requests (400)

**Backoff:** Exponential (1s, 2s, 4s)

---

## Cancellation

Each operation gets AbortSignal:

```
User clicks stop button
     ↓
WebSocket: STOP_GENERATION
     ↓
agent.cancelCurrentInference()
     ↓
AbortController.abort()
     ↓
OpenAI SDK cancels HTTP request
     ↓
infer() throws InferError('cancelled')
     ↓
No retry, immediate propagation
```

**Nested operations:** Share same AbortController
**Tool calls:** All cancelled together

---

# 🔐 AUTHENTICATION & AUTHORIZATION SYSTEM

## Overview

The auth system implements a **comprehensive JWT-based authentication** with **OAuth 2.0 social login** (Google, GitHub), **session management**, **API keys**, and **security auditing**. All auth operations are centralized through services that interact with D1 database.

**Core Components:**
1. **AuthService** - Main authentication orchestrator
2. **SessionService** - JWT session management with D1 persistence
3. **JWTUtils** - Token creation, verification, signing
4. **OAuth Providers** - Google & GitHub implementations with PKCE
5. **Middleware** - Route protection and token extraction
6. **Security** - Password hashing, rate limiting, audit logs

---

## Auth Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                           │
│  (Browser / API Client / WebSocket)                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│            TOKEN EXTRACTION (authUtils.ts)                  │
│  Priority:                                                  │
│  1. Authorization: Bearer <token>  (most secure)            │
│  2. Cookie: accessToken            (browser)                │
│  3. Query: ?token=<token>          (WebSocket)              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│              JWT VERIFICATION (JWTUtils)                    │
│  • Verify signature with JWT_SECRET                         │
│  • Check expiration (exp claim)                             │
│  • Validate payload structure                               │
│  • Extract: userId, email, sessionId                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│          SESSION VALIDATION (SessionService)                │
│  • Query sessions table in D1                               │
│  • Check: isRevoked = false                                 │
│  • Check: expiresAt > now                                   │
│  • Update lastActivity timestamp                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│           USER LOOKUP (AuthService)                         │
│  • Query users table with userId                            │
│  • Check: deletedAt IS NULL                                 │
│  • Return AuthUser object                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│            REQUEST CONTEXT ENRICHED                         │
│  request.user = { id, email, displayName, ... }             │
│  request.session = { sessionId, expiresAt }                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Database Tables

### **users Table**

Stores user identity, OAuth provider info, preferences, and security settings.

**Key fields:**
- Identity: id, email, username, displayName, avatarUrl
- OAuth: provider (github/google/email), providerId, emailVerified
- Security: passwordHash (email provider only), failedLoginAttempts, lockedUntil
- Preferences: theme, timezone
- Timestamps: createdAt, updatedAt, deletedAt (soft delete)

**Indexed on:** email, provider+providerId (unique), username

### **sessions Table**

Manages JWT sessions with device tracking and revocation support.

**Key fields:**
- Session ID, userId (FK to users)
- Device tracking: deviceInfo, userAgent, ipAddress
- Token hashes: accessTokenHash, refreshTokenHash (SHA-256)
- Revocation: isRevoked, revokedAt, revokedReason
- Expiry: expiresAt (default 3 days), lastActivity

**Configuration:** Max 5 sessions per user, 3 concurrent devices

### **oauthStates Table**

Temporary storage for OAuth flow state tokens (CSRF protection).

**Key fields:**
- state (unique CSRF token), provider (google/github)
- codeVerifier (PKCE), redirectUri
- isUsed (one-time use), expiresAt (10 minutes)

**Security:** Prevents CSRF attacks, implements PKCE flow

### **apiKeys Table**

Stores hashed API keys for programmatic access.

**Key fields:**
- name, keyHash (SHA-256), keyPreview
- scopes (JSON array), isActive
- Usage: lastUsed, requestCount
- Optional: expiresAt

### **authAttempts Table**

Audit log for all authentication attempts.

**Purpose:** Track login/register attempts, detect suspicious activity
**Fields:** identifier (email), attemptType, success, ipAddress, timestamp

### **verificationOtps Table**

Email verification codes (currently not actively used as users are auto-verified).

**Fields:** email, otp (hashed), used, expiresAt (15 min)

### **auditLogs Table**

Detailed audit trail for security events.

**Fields:** userId, entityType/entityId, action, oldValues/newValues (JSON), ipAddress, userAgent

---

## AuthService - Core Operations

**Location:** `/worker/database/services/AuthService.ts`

Handles all authentication operations (login, register, OAuth) and delegates session management to SessionService.

### **register() Flow**

1. Validate email format and password strength (min 8 chars, mixed case, numbers)
2. Check email doesn't already exist
3. Hash password with bcrypt (12 rounds)
4. Create user with emailVerified=true (no OTP currently)
5. Auto-login: create session + generate JWT
6. Log attempt to authAttempts table
7. Return user + accessToken + sessionId

### **login() Flow**

1. Find user by email (case-insensitive), check not deleted
2. Verify passwordHash exists
3. Compare password with bcrypt.verify()
4. Create session + generate JWT
5. Log attempt (success/fail) with IP + user agent
6. Return user + accessToken + sessionId

**Security:** Failed attempts logged, passwords never logged

### **OAuth Flow**

**Step 1: getOAuthAuthorizationUrl()**
1. Cleanup expired OAuth states
2. Validate redirect URL (same-origin only)
3. Generate CSRF state token + PKCE code verifier
4. Store in oauthStates table (10 min expiry)
5. Build authorization URL with state + code_challenge
6. Return URL to redirect user to provider

**Step 2: handleOAuthCallback()**
1. Verify state token (not used, not expired)
2. Mark state as used
3. Exchange code for tokens using PKCE verifier
4. Fetch user info from provider
5. Find or create user (update OAuth info if exists)
6. Create session + JWT
7. Return user + token + intended redirectUrl

**Security:** CSRF protected, PKCE prevents code interception, one-time state tokens

### **Other Key Methods**

**getUserForAuth(userId):** Fetch user by ID (checks not deleted) - used by middleware

**validateTokenAndGetUser(token):** Complete pipeline: verify JWT signature → check expiration → fetch user → return user + sessionId

---

## JWTUtils - Token Management

**Location:** `/worker/utils/jwtUtils.ts`

Singleton class for JWT operations using `jose` library.

**Token payload contains:** userId (sub), email, sessionId, type (access/refresh), iat/exp timestamps

**Key operations:**
- **createAccessToken()** - Sign JWT with HS256, 3-day expiry
- **verifyToken()** - Verify signature, check expiration, return payload
- **hashToken()** - SHA-256 hash for database storage (security: prevents token leakage from DB breaches)

---

## SessionService - Session Management

**Location:** `/worker/database/services/SessionService.ts`

**Config:** Max 5 sessions/user, 3-day TTL, max 3 concurrent devices

**Key operations:**

1. **createSession()** - Cleanup old sessions (keep 5 most recent) → generate session ID → create JWT → hash token → extract request metadata (IP, user agent, Cloudflare headers) → store in D1

2. **revokeUserSession()** - Mark session as revoked with reason

3. **revokeAllUserSessions()** - Revoke all user sessions (for password change, security breach)

4. **getUserSessions()** - List active sessions (not revoked, not expired)

5. **getUserSecurityStatus()** - Analyze security: count active sessions + recent security events → calculate risk level (high: >5 events/24h or hijacking; medium: >2 events or >3 devices; low: normal)

6. **forceLogoutAllOtherSessions()** - Delete all sessions except current (for suspected compromise)

7. **cleanupExpiredSessions()** - Delete expired sessions (run via cron)

---

## OAuth Providers

**Location:** `/worker/services/oauth/`

Abstract base class provides common OAuth 2.0 flow with PKCE.

**PKCE Flow:**
1. Generate code_verifier (random 32 bytes)
2. Hash to create code_challenge (SHA-256)
3. Send challenge in authorization URL
4. Provider stores challenge
5. Exchange code + verifier for tokens
6. Provider verifies: hash(verifier) === stored_challenge

**Purpose:** Prevents authorization code interception attacks

### **Google OAuth**
- Scopes: openid, email, profile
- Fetches user info from Google API
- Returns: id, email, name, picture, verified_email
- Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

### **GitHub OAuth**
- Scopes: read:user, user:email (minimal, no repo access)
- Special handling: Email not always in /user endpoint, fetches from /user/emails if needed
- Returns: id, email (primary verified), name, avatar_url
- Env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

---

## Authentication Middleware

**Location:** `/worker/middleware/auth/routeAuth.ts`

**Three auth levels:**
1. **public** - No auth required
2. **authenticated** - Requires valid JWT
3. **owner-only** - Requires ownership of resource (e.g., user can only edit their own apps)

**Flow:**
1. Route declares auth level via `setAuthLevel()` middleware
2. `enforceAuthRequirement()` checks:
   - Public: pass through
   - Authenticated/Owner: extract token → validate JWT → fetch user → check ownership if needed
3. User injected into request context: `c.set('user', user)`
4. Route handler executes with authenticated user

**Token extraction priority:** Authorization header (APIs) → Cookie (browser) → Query param (WebSocket)

---

## Security Features

### **Password Security**
- **Hashing:** bcrypt with 12 rounds (~250ms, intentionally slow to prevent brute force)
- **Validation:** Min 8 chars, mixed case, numbers, special chars, not common password, no sequential patterns (12345)
- **Strength scoring:** 0-4 scale

### **Rate Limiting**
- User-configurable limits (default: 100 requests/min)
- Separate limits for auth endpoints
- Tracked per user/IP in Durable Objects or KV

### **CSRF Protection**
- OAuth state tokens: cryptographically random, 10-min expiry, one-time use
- Verified on callback to prevent cross-site request forgery

### **Session Security**
- Tokens hashed (SHA-256) in database
- 3-day expiry by default
- Device + IP tracking
- Max 5 sessions per user, 3 concurrent devices
- Force logout feature for security incidents

### **Audit Logging**
- All auth attempts logged to `authAttempts` table
- Includes: IP, user agent, timestamp, success/failure
- Used for security analysis and anomaly detection

---

# 🗄️ DATABASE LAYER

## Overview

The database layer uses **Cloudflare D1** (SQLite) with **Drizzle ORM** for type-safe queries. All database operations are abstracted through service classes that extend `BaseService`.

**Key Technologies:**
- **D1 Database:** Serverless SQLite on Cloudflare's edge
- **Drizzle ORM:** Type-safe SQL query builder
- **D1 Sessions API:** Read replicas for lower latency
- **Migrations:** SQL-based schema migrations

---

## Database Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     API Controllers                        │
│  (Handle HTTP requests, validate input)                   │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ↓
┌────────────────────────────────────────────────────────────┐
│                   Domain Services                          │
│  AppService │ UserService │ AuthService │ etc.            │
│  (Business logic, transaction management)                  │
└──────────────────────┬─────────────────────────────────────┘
                       │ extends
                       ↓
┌────────────────────────────────────────────────────────────┐
│                     BaseService                            │
│  - Database connection (DatabaseService)                   │
│  - Read replicas (D1 Sessions API)                         │
│  - Common utilities (buildWhereConditions)                 │
│  - Error handling                                          │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ↓
┌────────────────────────────────────────────────────────────┐
│                  DatabaseService                           │
│  - Primary database connection (writes)                    │
│  - Read replica connections (reads)                        │
│  - Drizzle ORM instance                                    │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ↓
┌────────────────────────────────────────────────────────────┐
│                Cloudflare D1 Database                      │
│  Primary + Read Replicas (Global Distribution)             │
└────────────────────────────────────────────────────────────┘
```

---

## BaseService Pattern

**Location:** `/worker/database/services/BaseService.ts`

### **Purpose**

Provides common database functionality to all domain services:
- Database connection management
- Read replica access (D1 Sessions API)
- Type-safe where condition building
- Error handling patterns
- Logging

### **Implementation**

```typescript
abstract class BaseService {
  protected logger = createLogger(this.constructor.name);
  protected db: DatabaseService;
  protected env: Env;
  
  constructor(env: Env) {
    this.db = createDatabaseService(env);
    this.env = env;
  }
  
  // Direct database access (primary)
  protected get database() {
    return this.db.db;
  }
  
  // Read replica access (optimized latency)
  protected getReadDb(strategy: 'fast' | 'fresh' = 'fast') {
    return this.db.getReadDb(strategy);
  }
  
  // Build type-safe WHERE conditions
  protected buildWhereConditions(
    conditions: (SQL<unknown> | undefined)[]
  ): SQL<unknown> | undefined {
    const validConditions = conditions.filter(
      (c): c is SQL<unknown> => c !== undefined
    );
    if (validConditions.length === 0) return undefined;
    if (validConditions.length === 1) return validConditions[0];
    return and(...validConditions);
  }
  
  // Standard error handling
  protected handleDatabaseError(
    error: unknown,
    operation: string,
    context?: Record<string, unknown>
  ): never {
    this.logger.error(`Database error in ${operation}`, { error, context });
    throw error;
  }
}
```

---

## D1 Sessions API - Read Replicas

### **What is D1 Sessions?**

Cloudflare D1 Sessions API provides **read replicas** for D1 databases distributed globally. This dramatically reduces latency for read queries by serving them from the nearest replica.

### **Strategies**

**Location:** `/worker/database/database.ts`

```typescript
class DatabaseService {
  getReadDb(strategy: 'fast' | 'fresh' = 'fast') {
    if (strategy === 'fast') {
      // Lowest latency - may be slightly stale
      return drizzle(this.env.DB, { ... });
    } else {
      // Latest data - may have higher latency
      return drizzle(this.env.DB.withSession({ strategy: 'fresh' }), { ... });
    }
  }
}
```

### **When to Use Each Strategy**

#### **'fast' Strategy (Default)**

**Use for:**
- Public app listings
- Public app details
- Analytics and stats
- Search results
- Any read-only public data

**Benefits:**
- **Lowest latency** (served from nearest replica)
- Suitable for data that can tolerate slight staleness (few seconds)
- Most queries should use this

**Example:**
```typescript
// Public apps - use fast replicas
async getPublicApps(options: PublicAppQueryOptions) {
  const readDb = this.getReadDb('fast');  // ← Use fast strategy
  
  const apps = await readDb
    .select()
    .from(schema.apps)
    .where(eq(schema.apps.visibility, 'public'));
}
```

#### **'fresh' Strategy**

**Use for:**
- User's own data (own apps, favorites)
- Immediately after writes (read-after-write)
- Auth/session validation
- Account settings
- Any data where staleness is unacceptable

**Benefits:**
- **Latest data** from primary or recent replica
- Ensures user sees their own changes immediately

**Example:**
```typescript
// User's own apps - use fresh data
async getUserApps(userId: string) {
  const readDb = this.getReadDb('fresh');  // ← Use fresh strategy
  
  const apps = await readDb
    .select()
    .from(schema.apps)
    .where(eq(schema.apps.userId, userId));
}
```

### **NEVER Use Read Replicas For:**

❌ **Write operations** - Always use primary (`this.database`)
❌ **Auth validation** - Use primary to avoid security issues
❌ **Immediately after INSERT/UPDATE** - Read from primary
❌ **Critical consistency** - Password changes, payments, etc.

---

## Drizzle ORM Patterns

### **Basic Queries**

#### **SELECT**

```typescript
// Simple select
const users = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, email));

// Select specific columns
const users = await db
  .select({
    id: schema.users.id,
    email: schema.users.email
  })
  .from(schema.users);

// With JOIN
const apps = await db
  .select({
    app: schema.apps,
    userName: schema.users.displayName
  })
  .from(schema.apps)
  .leftJoin(schema.users, eq(schema.apps.userId, schema.users.id));
```

#### **INSERT**

```typescript
// Insert one
const [user] = await db
  .insert(schema.users)
  .values({
    id: generateId(),
    email: 'user@example.com',
    displayName: 'User',
    createdAt: new Date()
  })
  .returning();

// Insert many
await db
  .insert(schema.apps)
  .values([
    { id: id1, title: 'App 1', ... },
    { id: id2, title: 'App 2', ... }
  ]);
```

#### **UPDATE**

```typescript
await db
  .update(schema.users)
  .set({ 
    displayName: 'New Name',
    updatedAt: new Date()
  })
  .where(eq(schema.users.id, userId));
```

#### **DELETE**

```typescript
// Hard delete
await db
  .delete(schema.sessions)
  .where(eq(schema.sessions.id, sessionId));

// Soft delete (preferred)
await db
  .update(schema.users)
  .set({ deletedAt: new Date() })
  .where(eq(schema.users.id, userId));
```

### **Complex Queries**

#### **Aggregations**

```typescript
// COUNT
const result = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(schema.apps)
  .where(eq(schema.apps.visibility, 'public'));

const total = result[0].count;

// SUM, AVG
const stats = await db
  .select({
    totalViews: sql<number>`SUM(${schema.appViews.id})`,
    avgViews: sql<number>`AVG(view_count)`
  })
  .from(schema.apps);
```

#### **Subqueries**

```typescript
// Subquery in WHERE
const apps = await db
  .select()
  .from(schema.apps)
  .where(
    inArray(
      schema.apps.id,
      db.select({ id: schema.favorites.appId })
        .from(schema.favorites)
        .where(eq(schema.favorites.userId, userId))
    )
  );
```

#### **Conditional WHERE Clauses**

```typescript
// Use BaseService.buildWhereConditions()
const conditions: WhereCondition[] = [];

if (framework) {
  conditions.push(eq(schema.apps.framework, framework));
}

if (search) {
  conditions.push(
    or(
      sql`LOWER(${schema.apps.title}) LIKE ${`%${search}%`}`,
      sql`LOWER(${schema.apps.description}) LIKE ${`%${search}%`}`
    )
  );
}

const whereClause = this.buildWhereConditions(conditions);

const apps = await db
  .select()
  .from(schema.apps)
  .where(whereClause);
```

---

## Domain Services

### **Available Services**

**Location:** `/worker/database/services/`

1. **AuthService** - Authentication, login, OAuth
2. **SessionService** - JWT sessions, token management
3. **UserService** - User CRUD, profiles
4. **AppService** - App CRUD, public listings, search, ranking
5. **AnalyticsService** - Views, stars, activity tracking
6. **SecretsService** - Encrypted secrets storage
7. **ModelConfigService** - User model overrides
8. **ApiKeyService** - API key generation, validation

Each extends BaseService, uses Drizzle ORM, follows standard CRUD patterns.

---

## AppService - Public App Ranking

**Key methods:** createApp, getPublicApps (paginated with filters), getUserAppsWithFavorites, toggleAppStar, updateDeploymentId, updateGitHubRepository, updateAppScreenshot

**Ranking algorithms:**
- **Popular:** (views × 1 + stars × 3) DESC
- **Trending:** (recent_activity × 1000000 + recency_bonus) DESC  
- **Recent:** updatedAt DESC
- **Starred:** COUNT(stars) DESC

**Read replica usage:** Public queries use 'fast', user's own data uses 'fresh'

---

## Database Migrations

**Location:** `/migrations/` (SQL files + meta snapshots)

**Commands:**
- `npm run db:generate` - Generate migration from schema changes
- `npm run db:migrate:local` - Apply to local D1
- `npm run db:migrate:remote` - Apply to production D1
- `npm run db:push:local` - Direct push (dev only)

**Tool:** Drizzle Kit with d1-http driver

---

## 📚 Key Files Reference

### **Frontend Core Files**
- `/src/api-types.ts` - ALL shared API types (single source of truth)
- `/src/lib/api-client.ts` - ALL API calls defined here
- `/src/routes/chat/chat.tsx` - Main chat interface (1208 lines)
- `/src/routes/chat/hooks/use-chat.ts` - Chat state management (BRAIN)
- `/src/routes/chat/utils/handle-websocket-message.ts` - WebSocket handler (831 lines)
- `/src/routes/chat/utils/deduplicate-messages.ts` - Message deduplication utilities
- `/src/routes/chat/components/phase-timeline.tsx` - Phase progress UI
- `/src/routes/chat/components/messages.tsx` - User/AI message rendering
- `/src/hooks/useAuthGuard.ts` - Authentication guards
- `/src/hooks/use-image-upload.ts` - Image upload handling

### **Backend Core Files**
- `/worker/agents/core/simpleGeneratorAgent.ts` - Base agent DO class
- `/worker/agents/core/state.ts` - CodeGenState interface
- `/worker/agents/core/websocket.ts` - WebSocket message handler (250 lines)
- `/worker/agents/constants.ts` - WebSocket message type constants
- `/worker/agents/inferutils/core.ts` - LLM inference engine
- `/worker/agents/inferutils/infer.ts` - Inference execution wrapper
- `/worker/agents/inferutils/config.ts` - Model configurations
- `/worker/agents/assistants/codeDebugger.ts` - Deep debugger assistant
- `/worker/agents/operations/UserConversationProcessor.ts` - Orange AI (818 lines)
- `/worker/agents/tools/customTools.ts` - Tool registration
- `/worker/api/routes/index.ts` - Main API router
- `/worker/database/schema.ts` - Database schema (618 lines)

### **Configuration Files**
- `/worker/agents/inferutils/config.ts` - LLM model configs
- `/wrangler.jsonc` - Cloudflare Workers config
- `/vite.config.ts` - Frontend build config
- `/tsconfig.json` - TypeScript config
- `/drizzle.config.local.ts` - Local database config
- `/drizzle.config.remote.ts` - Remote database config

---

## ✅ Checklist for Changes

Before submitting any change, verify:

- [ ] Types are properly defined (no `any`)
- [ ] Existing patterns are followed
- [ ] Code is DRY (no duplication)
- [ ] Comments are clear and concise
- [ ] File naming matches conventions
- [ ] API calls use `api-client.ts`
- [ ] Database operations use service classes
- [ ] Error handling is comprehensive
- [ ] AbortController lifecycle is correct (if applicable)
- [ ] WebSocket messages are handled (if applicable)
- [ ] This document is updated (if needed)

---

## 🔧 Troubleshooting Common Issues

### **Issue: "Cannot find module" errors**

**Cause:** Import path incorrect or module not installed

**Fix:**
1. Check import path matches file location
2. For workspace imports, use `worker/...` not `../../../...`
3. Run `npm install` if package missing
4. Check `tsconfig.json` path mappings

### **Issue: Durable Object not receiving WebSocket messages**

**Check:**
1. Message type in constants: `/worker/agents/constants.ts`
2. Handler in `/worker/agents/core/websocket.ts` → `handleWebSocketMessage()`
3. Frontend sending correct type (check browser console)
4. WebSocket connection established (check `agent_connected` received)

**Debug:**
```typescript
// Add to websocket.ts handleWebSocketMessage()
logger.info('Received WebSocket message', { type: message.type, data: message });
```

### **Issue: LLM not calling tools**

**Common causes:**
1. Tool description unclear → LLM doesn't know when to use it
2. Tool not registered in `buildTools()` or `buildDebugTools()`
3. Parameter schema too complex → simplify
4. System prompt doesn't mention tool

**Fix:**
- Keep tool description to 2-3 clear lines
- Make parameters simple (prefer strings over complex objects)
- Add tool to relevant system prompt

### **Issue: Database query returning stale data**

**Cause:** Using read replica for data that needs to be fresh

**Fix:**
```typescript
// WRONG - uses fast replica
const readDb = this.getReadDb('fast');

// RIGHT - uses fresh data
const readDb = this.getReadDb('fresh');

// OR use primary for critical consistency
const result = await this.database.select()...
```

### **Issue: "Rate limit exceeded" during development**

**Quick fix:**
```typescript
// In UserConversationProcessor.ts or codeDebugger.ts
// Temporarily increase max_tokens or reduce frequency
```

**Better fix:** Use cheaper model for testing
```typescript
// In config.ts
conversationalResponse: {
  name: GEMINI_2_5_FLASH,  // Fast & cheap
  max_tokens: 4000,
}
```

### **Issue: Type errors after schema change**

**Steps:**
1. Regenerate Drizzle types: `npm run db:generate`
2. Restart TypeScript server in IDE
3. Check migration applied: `npm run db:migrate:local`

### **Issue: Sandbox deployment failing**

**Check logs:**
```typescript
// In DeploymentManager.ts, enable verbose logging
this.logger.info('Deployment attempt', { 
  sessionId: this.getSessionId(),
  filesCount: files.length 
});
```

**Common causes:**
1. Sandbox service unreachable
2. Invalid template name
3. sessionId mismatch (check `agent.state.sessionId`)
4. npm install timeout → increase timeout or split commands

### **Issue: Agent state not persisting**

**Verify:**
1. Check DO storage: Cloudflare dashboard → Durable Objects
2. Ensure `setState()` called after changes
3. Check for exceptions in state serialization

**Test:**
```typescript
const currentState = this.getState();
this.logger().info('State before save', { currentState });
this.setState(newState);
this.logger().info('State after save', { newState });
```

### **Where to Look for Logs**

**Local development:**
- Frontend: Browser console
- Worker: Terminal where `npm run dev:worker` is running
- Durable Objects: Same terminal, prefixed with DO ID

**Production:**
- Cloudflare dashboard → Workers & Pages → Logs
- Real-time logs via `wrangler tail`
- Sentry (if configured)

### **Useful Debug Snippets**

**Log all WebSocket messages:**
```typescript
// In websocket.ts
logger.info('[WS_IN]', { type: message.type, keys: Object.keys(message) });
```

**Log all tool calls:**
```typescript
// In customTools.ts executeToolWithDefinition()
logger.info('[TOOL_CALL]', { name: toolDef.function.name, args });
```

**Log state transitions:**
```typescript
// In simpleGeneratorAgent.ts launchStateMachine()
logger.info('[STATE_TRANSITION]', { 
  from: currentDevState, 
  to: executionResults.currentDevState 
});
```

---

# 🔒 RATE LIMITING

## Overview

**Location:** `/worker/middleware/rate-limiter.ts`

Rate limiting protects API endpoints from abuse using token bucket algorithm with Durable Object storage.

---

## Implementation

**Middleware:** Applied to all API routes except health checks

**Strategy:**
- **Token bucket algorithm** - Tokens refill over time
- **Per-user basis** - Keyed by userId (authenticated) or IP (anonymous)
- **Durable Object storage** - Distributed rate limit state
- **Graceful degradation** - Falls back on DO errors

---

## Rate Limits

| User Type | Requests | Window | Burst |
|-----------|----------|--------|-------|
| **Authenticated** | 100 | 1 minute | 150 |
| **Anonymous** | 20 | 1 minute | 30 |
| **API Keys** | 300 | 1 minute | 400 |

**Burst:** Maximum requests in short burst before throttling

---

## Response Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1698765432
```

**On rate limit exceeded:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "retryAfter": 42
}
```

---

## Frontend Handling

**Location:** `/src/routes/chat/utils/message-helpers.ts`

```typescript
export function handleRateLimitError(
  error: RateLimitExceededError,
  setMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void
) {
  const retryAfter = error.retryAfter || 60;
  const message = `Rate limit exceeded. Please wait ${retryAfter} seconds.`;
  
  setMessages(prev => [
    ...prev,
    createAIMessage('rate-limit', message)
  ]);
}
```

**Usage:**
```typescript
catch (error) {
  if (error instanceof RateLimitExceededError) {
    handleRateLimitError(error, setMessages);
    return;
  }
  // ... other error handling
}
```

---

## Bypassing for Internal Tools

Some endpoints bypass rate limiting:
- Health checks (`/health`, `/api/health`)
- WebSocket connections (rate limited separately)
- Internal service-to-service calls (authenticated with service tokens)

**Configuration:**
```typescript
// In rate-limiter.ts
const EXEMPT_PATHS = ['/health', '/api/health'];
```

---

## Monitoring

**Cloudflare Analytics:**
- 429 response rate
- Peak request times
- Top rate-limited IPs

**Custom Logs:**
```typescript
logger.warn('Rate limit exceeded', {
  userId: ctx.userId,
  ip: ctx.ip,
  path: ctx.path,
  remaining: 0
});
```

---

**Last Updated:** 2024-10-31  
**Maintainers:** All AI assistants working on this project

