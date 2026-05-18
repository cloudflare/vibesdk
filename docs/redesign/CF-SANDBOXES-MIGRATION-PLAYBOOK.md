# CF Sandboxes Migration Playbook

**Status:** INTERNAL — authored because official guide has been 404 since GA (7+ weeks)
**Last verified:** 2026-05-18
**Owner:** @Architect
**Decisions:** DEC-128-A (authored), DEC-132-B (promoted to P0 "must")

---

## Why This Exists

Official documentation URLs that returned HTTP 404 as of 2026-05-18 (verified):

- `https://developers.cloudflare.com/workers/runtime-apis/sandbox/`
- `https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/platform/sandbox/`

Both URLs have been 404 for 7+ weeks post-GA. This playbook was reverse-engineered from:

1. `node_modules/@cloudflare/sandbox/dist/index.d.ts` — full public API surface
2. `node_modules/@cloudflare/sandbox/dist/sandbox-HQazw9bn.d.ts` — Sandbox class + all type definitions
3. `node_modules/@cloudflare/sandbox/tests/wrangler.jsonc` — reference wrangler config shipped with package
4. `worker/services/sandbox/sandboxSdkClient.ts` — vibesdk's existing production integration
5. `wrangler.jsonc` — current vibesdk production binding config

vibesdk needs this internally to unblock any sandbox provider re-architecture decision (ADR-002 trigger conditions, ROADMAP milestone S17+).

---

## CF Sandboxes Overview

CF Sandboxes (branded as `@cloudflare/sandbox`) is Cloudflare's first-party sandbox runtime. It is built on top of `@cloudflare/containers` — each sandbox instance is a Durable Object backed by a container. The SDK wraps the container lifecycle with a high-level API covering command execution, filesystem, sessions, process management, port exposure, and code interpretation.

**vibesdk already uses this stack.** `SandboxSdkClient` in `worker/services/sandbox/sandboxSdkClient.ts` is the production CF Sandboxes adapter. This playbook documents the full integration surface to support future re-architecture, provider comparison, and feature flag switching.

**Key characteristics:**
- Durable Object per sandbox instance (persistent state across requests)
- Container provisioned on first access, sleeps after inactivity (`sleepAfter`, default 10 min)
- Sessions provide isolated execution contexts within one sandbox
- Port exposure generates preview URLs on the `workers.dev` / custom domain
- R2 bucket mounting via s3fs
- Built-in code interpreter (Python/JS/TS)
- Git checkout support

**GA status:** Generally available as of late 2025. Package version in use: see `package.json` → `@cloudflare/sandbox`.

**Billing model (inferred from architecture; official pricing page not accessible):**
- Cost is subsumed into Cloudflare Workers/Containers compute billing
- No separate per-sandbox-hour line item (unlike E2B's explicit `$0.09/hr` model)
- Container instance type is configurable (`vcpu`, `memory_mib`, `disk_mb`) in `wrangler.jsonc`
- vibesdk's current config: 4 vCPU, 8192 MiB RAM, 10240 MB disk, up to 1400 instances
- ADR-002 estimated $22/mo at 100-active-user / 50k-gen-per-month baseline vs $953/mo for GCP/E2B-style fan-out (43x cost advantage)

---

## Current Sandbox Architecture (vibesdk)

### Provider Selection — `worker/services/sandbox/factory.ts`

```typescript
export function getSandboxService(sessionId: string, agentId: string): BaseSandboxService {
    if (env.SANDBOX_SERVICE_TYPE == 'runner') {
        return new RemoteSandboxServiceClient(sessionId);  // HTTP-based remote runner
    }
    return new SandboxSdkClient(sessionId, agentId);       // CF Sandboxes (default)
}
```

Provider is selected via `SANDBOX_SERVICE_TYPE` environment variable:
- `undefined` or any non-`'runner'` value → `SandboxSdkClient` (CF Sandboxes)
- `'runner'` → `RemoteSandboxServiceClient` (remote HTTP runner service)

### Abstract Interface — `BaseSandboxService` (`worker/services/sandbox/BaseSandboxService.ts`)

All providers implement this abstract class:

```
initialize(): Promise<void>
createInstance(options: InstanceCreationRequest): Promise<BootstrapResponse>
listAllInstances(): Promise<ListInstancesResponse>
getInstanceDetails(instanceId: string): Promise<GetInstanceResponse>
getInstanceStatus(instanceId: string): Promise<BootstrapStatusResponse>
shutdownInstance(instanceId: string): Promise<ShutdownResponse>
writeFiles(instanceId, files, commitMessage?): Promise<WriteFilesResponse>
getFiles(instanceId, filePaths?): Promise<GetFilesResponse>
getLogs(instanceId, onlyRecent?, durationSeconds?): Promise<GetLogsResponse>
executeCommands(instanceId, commands, timeout?): Promise<ExecuteCommandsResponse>
updateProjectName(instanceId, projectName): Promise<boolean>
getInstanceErrors(instanceId, clear?): Promise<RuntimeErrorResponse>
clearInstanceErrors(instanceId): Promise<ClearErrorsResponse>
runStaticAnalysisCode(instanceId, lintFiles?): Promise<StaticAnalysisResponse>
deployToCloudflareWorkers(instanceId, target?): Promise<DeploymentResult>
```

Static methods (not on instance): `listTemplates()`, `getTemplateDetails(templateName)`.

### Current Providers

| Provider | Class | Trigger |
|---|---|---|
| CF Sandboxes | `SandboxSdkClient` | Default (`SANDBOX_SERVICE_TYPE` unset) |
| Remote runner | `RemoteSandboxServiceClient` | `SANDBOX_SERVICE_TYPE=runner` |

### Allocation Strategy

`SandboxSdkClient` supports two strategies (via `ALLOCATION_STRATEGY` env var):

- `many_to_one` — multiple sessions hash to one of N containers in a pool (`container-pool-{0..N}`)
- `one_to_one` (default) — each `sessionId` gets its own container

Pool size controlled by `MAX_SANDBOX_INSTANCES` env var (default: 10).

### wrangler.jsonc (current production bindings)

```jsonc
"containers": [
  {
    "class_name": "UserAppSandboxService",
    "image": "./SandboxDockerfile",
    "max_instances": 1400,
    "instance_type": {
      "vcpu": 4,
      "memory_mib": 8192,
      "disk_mb": 10240
    },
    "rollout_step_percentage": 100
  }
],
"durable_objects": {
  "bindings": [
    { "class_name": "UserAppSandboxService", "name": "Sandbox" },
    // ... other DOs
  ]
},
"migrations": [
  { "new_sqlite_classes": ["UserAppSandboxService"], "tag": "v1" }
]
```

---

## CF Sandboxes SDK API Reference

Sourced from `node_modules/@cloudflare/sandbox/dist/` type definitions. This is the ground-truth API surface since official docs are 404.

### Entry Point

```typescript
import { getSandbox, Sandbox, parseSSEStream, LogEvent, ExecResult } from '@cloudflare/sandbox';

// Get or create sandbox instance (backed by Durable Object)
const sandbox = getSandbox(env.Sandbox, sandboxId, options?: SandboxOptions);
```

### `SandboxOptions`

```typescript
interface SandboxOptions {
  sleepAfter?: string | number;          // e.g. "10m", "30s", 180 (seconds). Default: "10m"
  baseUrl?: string;
  keepAlive?: boolean;                   // Prevent auto-sleep. MUST call sandbox.destroy() when done.
  normalizeId?: boolean;                 // Lowercase sandbox ID (required for preview URLs). Default: false
  containerTimeouts?: {
    instanceGetTimeoutMS?: number;       // Container provisioning timeout. Default: 30000ms
    portReadyTimeoutMS?: number;         // App startup + port ready. Default: 90000ms
    waitIntervalMS?: number;             // Polling interval. Default: 1000ms
  };
}
```

### `ISandbox` — Core Interface

```typescript
// Command execution
exec(command: string, options?: ExecOptions): Promise<ExecResult>
execStream(command: string, options?: StreamOptions): Promise<ReadableStream<Uint8Array>>

// Background processes
startProcess(command: string, options?: ProcessOptions): Promise<Process>
listProcesses(): Promise<Process[]>
getProcess(id: string): Promise<Process | null>
killProcess(id: string, signal?: string): Promise<void>
killAllProcesses(): Promise<number>
getProcessLogs(id: string): Promise<{ stdout: string; stderr: string; processId: string }>
streamProcessLogs(processId: string, options?: { signal?: AbortSignal }): Promise<ReadableStream<Uint8Array>>
cleanupCompletedProcesses(): Promise<number>

// Filesystem
writeFile(path: string, content: string, options?: { encoding?: string }): Promise<WriteFileResult>
readFile(path: string, options?: { encoding?: string }): Promise<ReadFileResult>
readFileStream(path: string): Promise<ReadableStream<Uint8Array>>
mkdir(path: string, options?: { recursive?: boolean }): Promise<MkdirResult>
deleteFile(path: string): Promise<DeleteFileResult>
renameFile(oldPath: string, newPath: string): Promise<RenameFileResult>
moveFile(sourcePath: string, destinationPath: string): Promise<MoveFileResult>
listFiles(path: string, options?: ListFilesOptions): Promise<ListFilesResult>
exists(path: string, sessionId?: string): Promise<FileExistsResult>
gitCheckout(repoUrl: string, options?: { branch?: string; targetDir?: string }): Promise<GitCheckoutResult>
setEnvVars(envVars: Record<string, string>): Promise<void>

// Port management (preview URLs)
// Note: exposePort/unexposePort/getExposedPorts are on the Sandbox class, not ISandbox
// wsConnect(request: Request, port: number): Promise<Response>

// Sessions
createSession(options?: SessionOptions): Promise<ExecutionSession>
deleteSession(sessionId: string): Promise<SessionDeleteResult>

// Storage mounting
mountBucket(bucket: string, mountPath: string, options: MountBucketOptions): Promise<void>
unmountBucket(mountPath: string): Promise<void>

// Code interpreter
createCodeContext(options?: CreateContextOptions): Promise<CodeContext>
runCode(code: string, options?: RunCodeOptions): Promise<ExecutionResult>
runCodeStream(code: string, options?: RunCodeOptions): Promise<ReadableStream>
listCodeContexts(): Promise<CodeContext[]>
deleteCodeContext(contextId: string): Promise<void>
```

### `ExecResult`

```typescript
interface ExecResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
  duration: number;    // ms
  timestamp: string;   // ISO
  sessionId?: string;
}
```

### Sessions (`ExecutionSession`)

Sessions provide isolated execution contexts within one sandbox instance. Same API as `ISandbox` but bound to a specific session.

```typescript
const session = await sandbox.createSession({ id: 'my-session', cwd: '/workspace' });
const result = await session.exec('node index.js');
await sandbox.deleteSession('my-session');
```

### Lifecycle Methods (on `Sandbox` class)

```typescript
sandbox.destroy(): Promise<void>           // Terminate container + cleanup
sandbox.onStart(): void                    // Called when container starts
sandbox.onStop(): Promise<void>            // Called on graceful stop
sandbox.onError(error: unknown): void      // Error handler
sandbox.onActivityExpired(): Promise<void> // Auto-sleep hook
```

### Port Exposure

```typescript
// Expose a port and get preview URL
const { url } = await sandbox.exposePort(3000, { name: 'dev-server', hostname: '<your-domain>' });

// Get exposed ports
const ports = await sandbox.getExposedPorts(hostname);

// Unexpose
await sandbox.unexposePort(3000);
```

### `SessionOptions`

```typescript
interface SessionOptions {
  id?: string;
  name?: string;
  env?: Record<string, string>;
  cwd?: string;
  isolation?: boolean;  // PID namespace isolation (requires CAP_SYS_ADMIN)
}
```

---

## Migration Path: Adding/Replacing Providers

This section is relevant if trigger conditions in ADR-002 fire (E2B escape hatch) or if CF Sandboxes needs to be replaced/augmented.

### Step 1: wrangler.jsonc Changes (CF Sandboxes — already done)

The current vibesdk wrangler.jsonc is fully configured for CF Sandboxes. For reference, the minimum required config:

```jsonc
{
  "containers": [
    {
      "class_name": "UserAppSandboxService",   // Must match exported DO class
      "image": "./SandboxDockerfile",           // Path to Dockerfile
      "max_instances": 1400,                    // Hard cap on concurrent containers
      "instance_type": {
        "vcpu": 4,
        "memory_mib": 8192,
        "disk_mb": 10240
      }
    }
  ],
  "durable_objects": {
    "bindings": [
      { "class_name": "UserAppSandboxService", "name": "Sandbox" }
    ]
  },
  "migrations": [
    { "new_sqlite_classes": ["UserAppSandboxService"], "tag": "v1" }
  ]
}
```

Key points:
- `class_name` in `containers[]` must match `class_name` in `durable_objects.bindings[]`
- `new_sqlite_classes` migration entry is required — Sandbox extends Container which uses SQLite storage
- `image` can be a local Dockerfile path (dev) or a registry URI (prod: `registry.cloudflare.com/...`)
- `max_instances` in config is advisory; runtime cap is `MAX_SANDBOX_INSTANCES` env var

### Step 2: Implement a New Provider (skeleton)

To add a new sandbox provider (e.g., E2B escape hatch per ADR-002), implement `BaseSandboxService`:

```typescript
// worker/services/sandbox/e2bSandboxClient.ts
import { BaseSandboxService } from './BaseSandboxService';
import {
    BootstrapResponse, GetInstanceResponse, BootstrapStatusResponse,
    ShutdownResponse, WriteFilesRequest, WriteFilesResponse, GetFilesResponse,
    ExecuteCommandsResponse, RuntimeErrorResponse, ClearErrorsResponse,
    StaticAnalysisResponse, DeploymentResult, GetLogsResponse,
    ListInstancesResponse, InstanceCreationRequest,
} from './sandboxTypes';
import { DeploymentTarget } from 'worker/agents/core/types';

export class E2bSandboxClient extends BaseSandboxService {

    constructor(sandboxId: string) {
        super(sandboxId);
    }

    async initialize(): Promise<void> {
        // Initialize E2B SDK client, verify connectivity
    }

    async createInstance(options: InstanceCreationRequest): Promise<BootstrapResponse> {
        // POST to E2B API: create sandbox, write initial files, run initCommand
        // Map E2B response → BootstrapResponse shape
        return { success: false, error: 'Not implemented' };
    }

    async listAllInstances(): Promise<ListInstancesResponse> {
        return { success: false, instances: [], count: 0, error: 'Not implemented' };
    }

    async getInstanceDetails(instanceId: string): Promise<GetInstanceResponse> {
        return { success: false, error: 'Not implemented' };
    }

    async getInstanceStatus(instanceId: string): Promise<BootstrapStatusResponse> {
        return { success: false, pending: false, isHealthy: false, error: 'Not implemented' };
    }

    async shutdownInstance(instanceId: string): Promise<ShutdownResponse> {
        return { success: false, error: 'Not implemented' };
    }

    async writeFiles(
        instanceId: string,
        files: WriteFilesRequest['files'],
        commitMessage?: string
    ): Promise<WriteFilesResponse> {
        return { success: false, results: [], error: 'Not implemented' };
    }

    async getFiles(instanceId: string, filePaths?: string[]): Promise<GetFilesResponse> {
        return { success: false, files: [], error: 'Not implemented' };
    }

    async getLogs(instanceId: string, onlyRecent?: boolean, durationSeconds?: number): Promise<GetLogsResponse> {
        return { success: false, logs: { stdout: '', stderr: '' }, error: 'Not implemented' };
    }

    async executeCommands(
        instanceId: string,
        commands: string[],
        timeout?: number
    ): Promise<ExecuteCommandsResponse> {
        return { success: false, results: [], error: 'Not implemented' };
    }

    async updateProjectName(instanceId: string, projectName: string): Promise<boolean> {
        return false;
    }

    async getInstanceErrors(instanceId: string, clear?: boolean): Promise<RuntimeErrorResponse> {
        return { success: false, errors: [], hasErrors: false, error: 'Not implemented' };
    }

    async clearInstanceErrors(instanceId: string): Promise<ClearErrorsResponse> {
        return { success: false, error: 'Not implemented' };
    }

    async runStaticAnalysisCode(instanceId: string, lintFiles?: string[]): Promise<StaticAnalysisResponse> {
        return {
            success: false,
            lint: { issues: [] },
            typecheck: { issues: [] },
            error: 'Not implemented',
        };
    }

    async deployToCloudflareWorkers(instanceId: string, target?: DeploymentTarget): Promise<DeploymentResult> {
        return { success: false, message: 'Not implemented' };
    }
}
```

### Step 3: Register in factory.ts

```typescript
// worker/services/sandbox/factory.ts
import { SandboxSdkClient } from "./sandboxSdkClient";
import { RemoteSandboxServiceClient } from "./remoteSandboxService";
import { E2bSandboxClient } from "./e2bSandboxClient";       // ADD
import { BaseSandboxService } from "./BaseSandboxService";
import { env } from 'cloudflare:workers'

export function getSandboxService(sessionId: string, agentId: string): BaseSandboxService {
    if (env.SANDBOX_SERVICE_TYPE == 'runner') {
        console.log("[getSandboxService] Using runner service");
        return new RemoteSandboxServiceClient(sessionId);
    }
    if (env.SANDBOX_SERVICE_TYPE == 'e2b') {               // ADD
        console.log("[getSandboxService] Using E2B service (ADR-002 escape hatch)");
        return new E2bSandboxClient(sessionId);
    }
    console.log("[getSandboxService] Using CF Sandboxes SDK (default)");
    return new SandboxSdkClient(sessionId, agentId);
}
```

### Step 4: Feature Flag

Control via the existing `SANDBOX_SERVICE_TYPE` environment variable:

| Value | Provider | When to use |
|---|---|---|
| unset (default) | `SandboxSdkClient` — CF Sandboxes | Production default |
| `runner` | `RemoteSandboxServiceClient` | Existing remote runner fallback |
| `e2b` | `E2bSandboxClient` | ADR-002 trigger condition fired |

Set in Cloudflare Dashboard → Workers → vibesdk-production → Settings → Variables, or in `wrangler.jsonc` under `vars`:

```jsonc
"vars": {
  "SANDBOX_SERVICE_TYPE": "e2b"
}
```

To route only specific workloads (hybrid per ADR-002), wrap in agent-level logic before calling `getSandboxService()` rather than modifying the factory.

### Step 5: Validation Smoke Test

After deploying a new provider, run this sequence to confirm end-to-end operation:

```
1. createInstance({ files: [{ filePath: 'index.js', fileContents: 'console.log("ok")' }],
                    projectName: 'smoke-test', initCommand: 'node index.js' })
   → expect: { success: true, runId: '<id>' }

2. getInstanceStatus('<id>')
   → expect: { success: true, pending: false, isHealthy: true }

3. executeCommands('<id>', ['echo smoke-pass'])
   → expect: { success: true, results: [{ success: true, output: 'smoke-pass\n' }] }

4. writeFiles('<id>', [{ filePath: 'test.txt', fileContents: 'hello' }])
   → expect: { success: true, results: [{ file: 'test.txt', success: true }] }

5. getFiles('<id>', ['test.txt'])
   → expect: { success: true, files: [{ filePath: 'test.txt', fileContents: 'hello' }] }

6. getLogs('<id>')
   → expect: { success: true, logs: { stdout: contains 'ok', stderr: '' } }

7. shutdownInstance('<id>')
   → expect: { success: true }
```

---

## Cost Comparison

# schema: provider|dollar_per_hour|cold_start_p50|network|cf_native|notes
CF Sandboxes|~$0.02-0.05 est.|~300ms (warm DO)|Zero egress|YES|Cost subsumed into Workers/Containers billing. No separate line item. ADR-002 baseline: $22/mo at 50k gens.
E2B (Firecracker)|~$0.09/vCPU-hr|~125ms|Egress billed|NO|Pro plan $150/mo floor. ADR-002: breaks ₹1699 pricing wedge above ~200 active sessions.
Daytona|~$0.12/vCPU-hr|~2s|Egress billed|NO|Not evaluated in ADR-002. Slower cold start than E2B.
Custom container (runner)|Variable|~5-10s|Egress billed|Partial|`RemoteSandboxServiceClient` target. Requires separate infra ops.

**Note:** CF Sandboxes pricing is not published in accessible docs as of 2026-05-18. The estimate above is derived from Cloudflare Containers pricing as reported in INFRASTRUCTURE.md. Verify against Cloudflare billing dashboard before any cost-based migration decision.

---

## Known Gaps (as of 2026-05-18)

1. **Official docs 404.** Both canonical documentation URLs return HTTP 404. All API knowledge in this playbook comes from local package types and vibesdk's existing integration. Gaps in official docs include: exact billing rates, quota limits per account tier, SLA/uptime commitments, geographic availability of container instances.

2. **`instance_type` runtime override not documented.** `wrangler.jsonc` comment notes: "Altering `instance_type` value will have no effect. Please use the `SANDBOX_INSTANCE_TYPE` var instead." The format of `SANDBOX_INSTANCE_TYPE` is not documented.

3. **`max_instances` cap behavior.** `wrangler.jsonc` comment: "Altering `max_instances` value will have no effect. Please use the `MAX_SANDBOX_INSTANCES` var instead." What happens when the cap is hit (queue vs reject vs error) is not documented.

4. **Port exposure `hostname` requirement.** `sandbox.exposePort()` requires a `hostname` parameter. The mapping between Workers domain / custom domain and preview URL generation is not in accessible docs.

5. **`normalizeId` future behavior change.** SDK docs note: "In a future version, this will default to `true`." Breaking change window unknown.

6. **Container provisioning latency.** SDK default timeouts suggest "containers take several minutes to provision" (from `DEFAULT_CONTAINER_TIMEOUTS` comment). Cold-start p50 of ~300ms is likely for warm DO — first-ever provision for a new ID may be 2-5 min.

7. **`new_sqlite_classes` migration behavior.** What happens if this migration is missing or if a second migration tag is added for schema changes — undocumented.

8. **`rollout_step_percentage`** semantics. Used in vibesdk production config (`100`). Meaning unclear without accessible docs.

9. **Billing for sleeping containers.** Whether `sleepAfter` saves compute cost or just stops traffic routing — not confirmed.

---

## Decision Criteria for Migration (ADR-002 Trigger Conditions)

Per ADR-002, migrate away from CF Sandboxes (or activate E2B escape hatch) when any one of:

| Trigger | Metric | Threshold |
|---|---|---|
| Runtime ceiling | User requests Python ML / CUDA / >2 GB RAM container CF Containers cannot host | 10+ distinct paying users in rolling 30-day window |
| Boot latency SLO | Sandbox cold-start p95 | Exceeds 2.0s for 7 consecutive days |
| Concurrency ceiling | CF Containers concurrent-instance quota | Blocks Team-tier customer + quota-increase denied |
| Compliance pull | Enterprise prospect requires Firecracker isolation or per-tenant VM | Contractual requirement confirmed in writing |

**If migrating to E2B:** Follow Steps 1-5 above. Route only trigger-causing workloads to E2B; keep everything else on CF Sandboxes.

---

## Rollback Plan

CF Sandboxes → previous state (if CF Sandboxes has issues):

**Immediate (< 5 min):**

1. Set `SANDBOX_SERVICE_TYPE=runner` in Cloudflare Dashboard → Workers → vibesdk-production → Settings → Variables
2. Verify `RemoteSandboxServiceClient.sandboxServiceUrl` and `token` are configured (call `RemoteSandboxServiceClient.init(url, token)` on worker startup if needed)
3. Monitor error rates in Cloudflare Workers Observability dashboard

**Rollback does NOT require a code deploy.** The factory switch is entirely env-var driven.

**If `runner` service is also unavailable:**

1. Emergency: set `SANDBOX_SERVICE_TYPE=e2b` (requires E2B API key in env and E2bSandboxClient implementation to be deployed)
2. Or: temporarily disable sandbox-dependent features via feature flag at the agent level (`worker/agents/core/`)

**To revert from E2B back to CF Sandboxes:**

1. Unset `SANDBOX_SERVICE_TYPE` (or set to empty string)
2. Deploy — factory will default to `SandboxSdkClient`
3. Existing instances created under E2B will need manual cleanup via E2B dashboard

---

## Appendix: Env Vars Reference

| Variable | Default | Effect |
|---|---|---|
| `SANDBOX_SERVICE_TYPE` | unset → CF Sandboxes | `runner` → RemoteSandboxServiceClient, `e2b` → E2bSandboxClient |
| `ALLOCATION_STRATEGY` | `one_to_one` | `many_to_one` → pool-based hashing across N containers |
| `MAX_SANDBOX_INSTANCES` | 10 (factory code default) | Runtime cap on concurrent container pool size |
| `SANDBOX_INSTANCE_TYPE` | See wrangler.jsonc `instance_type` | Override container size at runtime (format undocumented) |
| `SANDBOX_INSTANCE_TIMEOUT_MS` | 30000 | Container provisioning timeout |
| `SANDBOX_PORT_TIMEOUT_MS` | 90000 | Port ready timeout |
| `SANDBOX_POLL_INTERVAL_MS` | 1000 | Container readiness polling interval |
