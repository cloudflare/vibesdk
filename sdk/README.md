# @cf-vibesdk/sdk

Client SDK for the VibeSDK platform.

## Install

```bash
npm install @cf-vibesdk/sdk
```

## Quickstart (Bun)

```ts
import { PhasicClient } from '@cf-vibesdk/sdk';

const client = new PhasicClient({
  baseUrl: 'http://localhost:5173',
  apiKey: process.env.VIBESDK_API_KEY!,
});

const session = await client.build('Build a simple hello world page.', {
  projectType: 'app',
  autoGenerate: true,
});

// High-level lifecycle waits
await session.wait.generationStarted();
await session.wait.deployable();

// Preview deployment (command + awaitable)
const previewWait = session.wait.previewDeployed();
session.deployPreview();
const deployed = await previewWait;

console.log('Preview URL:', deployed.previewURL);

// Workspace is always kept in sync from agent state + WS events
console.log(session.files.listPaths());
console.log(session.files.read('README.md'));

session.close();
```

## Quickstart (Node)

Node requires a WebSocket factory (the browser `WebSocket` global is not available):

```ts
import { PhasicClient } from '@cf-vibesdk/sdk';
import { createNodeWebSocketFactory } from '@cf-vibesdk/sdk/node';

const client = new PhasicClient({
  baseUrl: 'http://localhost:5173',
  apiKey: process.env.VIBESDK_API_KEY!,
  webSocketFactory: createNodeWebSocketFactory(),
});

const session = await client.build('Build a simple hello world page.', {
  projectType: 'app',
  autoGenerate: true,
});

await session.wait.generationStarted();
await session.wait.deployable();
session.close();
```

## Authentication

Use either:

- `apiKey`: a VibeSDK API key (recommended for CLIs and automation)
- `token`: an already-minted JWT access token

When `apiKey` is provided, the SDK exchanges it for a short-lived access token and caches it.

## Workspace (no platform file APIs)

The SDK reconstructs and maintains a local view of the codebase using:

- `agent_connected.state.generatedFilesMap`
- `cf_agent_state.state.generatedFilesMap`
- incremental `file_*` messages

APIs:

- `session.files.listPaths()`
- `session.files.read(path)`
- `session.files.snapshot()`
- `session.files.tree()`

## Waiting primitives

Use high-level waits instead of depending on agent-internal message ordering:

- `session.wait.generationStarted()`
- `session.wait.generationComplete()`
- `session.wait.deployable()` (phasic resolves on `phase_validated`)
- `session.wait.previewDeployed()`
- `session.wait.cloudflareDeployed()`

All waits default to a long timeout (10 minutes). You can override per call:

```ts
await session.wait.generationComplete({ timeoutMs: 2 * 60_000 });
```

## Reliable WebSocket connections

Connections automatically reconnect with exponential backoff + jitter.

Events:

- `session.on('ws:reconnecting', ({ attempt, delayMs, reason }) => { ... })`

To disable reconnect:

```ts
session.connect({ retry: { enabled: false } });
```

## Low-level access

For advanced clients, you can subscribe to the raw typed WS stream:

- `session.on('ws:message', (msg) => { ... })`

The SDK also exposes `ws:raw` when the platform sends malformed/untyped payloads.

## Tests

From `sdk/`:

- Unit: `bun run test`
- Integration (requires local platform + API key): `bun run test:integration`

Integration expects:

- `VIBESDK_INTEGRATION_API_KEY`
- optional `VIBESDK_INTEGRATION_BASE_URL` (default `http://localhost:5173`)
