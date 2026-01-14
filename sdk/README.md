# @cf-vibesdk/sdk

Official TypeScript SDK for the VibeSDK platform - build and deploy fullstack apps with AI.

## Compatibility

Works in any JavaScript runtime with native WebSocket support:

| Runtime | Support |
|---------|---------|
| Cloudflare Workers | Native WebSocket |
| Browsers | Native WebSocket |
| Bun | Native WebSocket |
| Node.js 22+ | Native WebSocket |

## Installation

```bash
npm install @cf-vibesdk/sdk
```

## Quick Start

```ts
import { PhasicClient } from '@cf-vibesdk/sdk';

const client = new PhasicClient({
  baseUrl: 'https://build.cloudflare.dev',
  apiKey: process.env.VIBESDK_API_KEY!,
});

// Build a new app
const session = await client.build('Build a todo app with React');

// Wait until deployable and deploy
await session.wait.deployable();
session.deployPreview();
const preview = await session.wait.previewDeployed();

console.log('Preview URL:', preview.previewURL);
console.log('Files:', session.files.listPaths());

session.close();
```

## Authentication

| Method | Use Case |
|--------|----------|
| `apiKey` | Recommended. Automatically exchanged for a short-lived JWT. |
| `token` | Use when you already have a JWT access token. |

```ts
// Using API key (recommended)
const client = new PhasicClient({
  baseUrl: 'https://build.cloudflare.dev',
  apiKey: 'vibe_xxxxxxxxxxxx',
});

// Using pre-minted JWT
const client = new PhasicClient({
  baseUrl: 'https://build.cloudflare.dev',
  token: 'eyJhbGciOiJIUzI1NiIs...',
});
```

## Clients

| Client | Default Behavior |
|--------|------------------|
| `VibeClient` | No default - specify `behaviorType` in build options |
| `PhasicClient` | `behaviorType: 'phasic'` (phase-based generation) |
| `AgenticClient` | `behaviorType: 'agentic'` (autonomous agent) |

All clients share the same API. The specialized clients simply set a default `behaviorType`.

## Building Apps

### `client.build(prompt, options?)`

Create a new app from a natural language prompt.

```ts
const session = await client.build('Build a weather dashboard', {
  projectType: 'app',           // 'app' | 'component' | 'api'
  behaviorType: 'phasic',       // 'phasic' | 'agentic'
  language: 'typescript',       // Optional
  frameworks: ['react'],        // Optional
  selectedTemplate: 'vite',     // Optional template name
  autoConnect: true,            // Auto-connect WebSocket (default: true)
  autoGenerate: true,           // Auto-start generation (default: true)
  credentials: { ... },         // Optional provider API keys
  onBlueprintChunk: (chunk) => console.log(chunk),
});
```

### `client.connect(agentId)`

Connect to an existing app session. State is automatically restored from the agent, including:
- Phase timeline with completion status
- Generated files
- Agent metadata (query, projectName, behaviorType, etc.)

```ts
const session = await client.connect('agent-id-here', {
  credentials: { ... },  // Optional
});
await session.connect();

// State is now seeded from the agent
console.log('Original query:', session.state.get().query);
console.log('Phases:', session.phases.list());
console.log('Files:', session.files.listPaths());
```

## App Management

```ts
// List apps
const publicApps = await client.apps.listPublic({ limit: 20, sort: 'recent' });
const myApps = await client.apps.listMine();
const recent = await client.apps.listRecent();
const favorites = await client.apps.listFavorites();

// Get app details
const app = await client.apps.get('app-id');

// Manage apps
await client.apps.delete('app-id');
await client.apps.setVisibility('app-id', 'public'); // 'public' | 'private'
await client.apps.toggleStar('app-id');
await client.apps.toggleFavorite('app-id');

// Git clone token
const { cloneUrl, expiresAt } = await client.apps.getGitCloneToken('app-id');
```

## BuildSession

The `BuildSession` object provides real-time interaction with code generation.

### Properties

| Property | Description |
|----------|-------------|
| `agentId` | Unique identifier for this session |
| `behaviorType` | `'phasic'` or `'agentic'` |
| `projectType` | Type of project being built |

### Commands

```ts
session.startGeneration();      // Start code generation
session.stop();                 // Stop generation
session.resume();               // Resume generation
session.deployPreview();        // Deploy to preview environment
session.deployCloudflare();     // Deploy to Cloudflare Workers
session.clearConversation();    // Clear conversation history
session.close();                // Close the session

// Send follow-up message
session.followUp('Add dark mode support', {
  images: [{ base64: '...', mimeType: 'image/png' }],  // Optional
});
```

### Wait Helpers

High-level async waits for generation milestones:

```ts
// Generation lifecycle
await session.wait.generationStarted({ timeoutMs: 60_000 });
await session.wait.generationComplete({ timeoutMs: 600_000 });

// Phase events (phasic mode)
await session.wait.phase({ type: 'phase_validated' });

// Deployment readiness
const { files, reason } = await session.wait.deployable();

// Deployment completion
const preview = await session.wait.previewDeployed();
console.log(preview.previewURL);

const cf = await session.wait.cloudflareDeployed();
console.log(cf.deploymentUrl);
```

### Events

```ts
// High-level events
session.on('connected', (msg) => { ... });
session.on('generation', (msg) => { ... });  // started, complete, stopped, resumed
session.on('phase', (msg) => { ... });       // generating, generated, implementing, etc.
session.on('file', (msg) => { ... });        // generating, generated, regenerated
session.on('preview', (msg) => { ... });     // started, completed, failed
session.on('cloudflare', (msg) => { ... });  // started, completed, error
session.on('error', ({ error }) => { ... });

// WebSocket events
session.on('ws:open', () => { ... });
session.on('ws:close', ({ code, reason }) => { ... });
session.on('ws:error', ({ error }) => { ... });
session.on('ws:reconnecting', ({ attempt, delayMs }) => { ... });

// Listen to specific message type
session.onMessageType('file_generated', (msg) => {
  console.log('Generated:', msg.file.filePath);
});

// Wait for specific message
const msg = await session.waitForMessageType('generation_complete', 60_000);
```

### File Access

```ts
const paths = session.files.listPaths();        // ['src/App.tsx', ...]
const content = session.files.read('src/App.tsx');
const snapshot = session.files.snapshot();      // { 'src/App.tsx': '...', ... }
const tree = session.files.tree();              // Nested file tree structure
```

### Phase Timeline

Access the full phase timeline for phasic builds. The timeline is automatically seeded when connecting to an existing agent and updated as phases progress.

```ts
// Get all phases
const phases = session.phases.list();
// [{ id: 'phase-0', name: 'Core Setup', status: 'completed', files: [...] }, ...]

// Get current active phase
const current = session.phases.current();
if (current) {
  console.log(`Working on: ${current.name}`);
  console.log(`Status: ${current.status}`);  // 'generating' | 'implementing' | 'validating'
}

// Get completed phases
const done = session.phases.completed();
console.log(`Progress: ${done.length}/${session.phases.count()}`);

// Check if all phases are done
if (session.phases.allCompleted()) {
  console.log('Build complete!');
}

// Get phase by ID
const phase = session.phases.get('phase-0');

// Subscribe to phase changes
const unsubscribe = session.phases.onChange((event) => {
  console.log(`Phase ${event.type}:`, event.phase.name);
  console.log(`Status: ${event.phase.status}`);
  console.log(`Total phases: ${event.allPhases.length}`);
});
// Later: unsubscribe();
```

The `onChange` callback receives a `PhaseTimelineEvent`:

```ts
type PhaseTimelineEvent = {
  type: 'added' | 'updated';  // New phase vs status/file change
  phase: PhaseInfo;           // The affected phase
  allPhases: PhaseInfo[];     // All phases after this change
};
```

Each phase contains:

```ts
type PhaseInfo = {
  id: string;           // 'phase-0', 'phase-1', etc.
  name: string;         // 'Core Setup', 'Authentication', etc.
  description: string;  // What the phase accomplishes
  status: PhaseStatus;  // 'pending' | 'generating' | 'implementing' | 'validating' | 'completed' | 'cancelled'
  files: PhaseFile[];   // Files in this phase
};

type PhaseFile = {
  path: string;         // 'src/App.tsx'
  purpose: string;      // 'Main application component'
  status: PhaseFileStatus;  // 'pending' | 'generating' | 'completed' | 'cancelled'
};
```

### State

```ts
// Current state
const state = session.state.get();
console.log(state.connection);  // 'disconnected' | 'connecting' | 'connected'
console.log(state.generation);  // { status: 'idle' | 'running' | 'stopped' | 'complete', ... }
console.log(state.phase);       // { status: 'idle' | 'generating' | ... }
console.log(state.preview);     // Preview deployment state
console.log(state.cloudflare);  // Cloudflare deployment state

// Phase timeline (array of all phases)
console.log(state.phases);      // [{ id, name, status, files }, ...]

// Agent metadata (seeded from agent_connected)
console.log(state.behaviorType);      // 'phasic' | 'agentic'
console.log(state.projectType);       // 'app' | 'workflow' | etc.
console.log(state.query);             // Original user prompt
console.log(state.projectName);       // Project name from blueprint
console.log(state.shouldBeGenerating); // Whether agent is actively generating

// Subscribe to changes
session.state.onChange((next, prev) => {
  console.log('State changed:', next);
});

// Workspace file changes
session.workspace.onChange((change) => {
  console.log(change.type, change.path); // 'upsert' | 'delete' | 'reset'
});
```

## WebSocket Reliability

Connections automatically reconnect with exponential backoff.

```ts
// Custom retry config
await session.connect({
  retry: {
    enabled: true,        // Default: true
    initialDelayMs: 1000, // Default: 1000
    maxDelayMs: 30000,    // Default: 30000
    maxRetries: 10,       // Default: Infinity
  },
});

// Disable auto-reconnect
await session.connect({ retry: { enabled: false } });
```

## HTTP Retry

HTTP requests automatically retry on 5xx errors.

```ts
const client = new PhasicClient({
  baseUrl: 'https://build.cloudflare.dev',
  apiKey: 'vibe_xxx',
  retry: {
    enabled: true,        // Default: true
    initialDelayMs: 1000, // Default: 1000
    maxDelayMs: 10000,    // Default: 10000
    maxRetries: 3,        // Default: 3
  },
});
```

## Utilities

### Blueprint Parsing

```ts
import { BlueprintStreamParser, blueprintToMarkdown } from '@cf-vibesdk/sdk';

// Parse streaming blueprint chunks
const parser = new BlueprintStreamParser();
parser.append(chunk1);
parser.append(chunk2);
const markdown = parser.toMarkdown();

// Convert blueprint object to markdown
const md = blueprintToMarkdown(blueprint);
```

### Timeout Helper

```ts
import { withTimeout, TimeoutError } from '@cf-vibesdk/sdk';

try {
  const result = await withTimeout(someAsyncOperation(), 30000, 'Operation timed out');
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log('Timed out!');
  }
}
```

## Error Handling

All API methods return an `ApiResponse<T>` discriminated union:

```ts
const result = await client.apps.get('app-id');

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error.message);
}
```

## TypeScript

All types are exported:

```ts
import type {
  // Client & Session
  VibeClientOptions,
  BuildOptions,
  BuildSession,
  SessionState,
  SessionFiles,
  SessionPhases,
  
  // Phase Timeline
  PhaseInfo,
  PhaseFile,
  PhaseStatus,
  PhaseFileStatus,
  PhaseEventType,
  PhaseTimelineEvent,
  PhaseTimelineChangeType,
  
  // API
  ApiResponse,
  AppDetails,
  Credentials,
  BehaviorType,
  ProjectType,
  // ... and more
} from '@cf-vibesdk/sdk';
```

## Testing

```bash
cd sdk

# Unit tests
bun test

# Integration tests (requires API key)
VIBESDK_INTEGRATION_API_KEY=your_key bun run test:integration
```

## License

MIT
