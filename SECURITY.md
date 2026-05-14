# Security Architecture

## Isolated Durable Object Architecture — BOLA Immunity by Design

vibesdk's architecture is structurally immune to Broken Object Level Authorization (BOLA) vulnerabilities — the class of attack that exposed Lovable's entire user base for 48 days (Feb 3–Apr 20 2026, documented [BOLA incident](https://techcrunch.com/2026/04/20/lovable-ai-security-breach/)).

### How Lovable's BOLA occurred

Lovable's original architecture used a shared server-side rendering model with a public project object graph. A free account + 5 API calls was sufficient to access:
- Any user's source code
- Hardcoded Supabase credentials
- Stripe customer IDs from other users' projects

The root cause: **authorization was enforced at the API call layer, but the underlying object graph was shared across tenants.** A single authorization bypass exposed all objects.

### Why vibesdk cannot have the same vulnerability

Every vibesdk session runs in an isolated **Cloudflare Durable Object (DO)** — a single-tenant compute unit with:

1. **Per-session SQLite storage**: All project state (blueprint, files, git history, conversation messages) is stored in a SQLite database inside the DO. No two sessions share a database. No shared object graph means no object-level authorization bypass possible at the storage layer.

2. **DO ID is the authorization boundary**: The session DO is addressed by a unique ID derived at session creation. A user possessing a different session's DO ID cannot be disambiguated from "accessing a non-existent DO" — CF's routing layer enforces this opaquely. There is no API surface to enumerate or list DO IDs.

3. **Git history is inside the DO**: vibesdk uses isomorphic-git with a SQLite filesystem adapter (`worker/agents/git/fs-adapter.ts`). Each session's git repository is entirely within the session's SQLite storage — not accessible from outside the DO instance.

4. **No public project model**: vibesdk does not have a "make project public" feature. There is no shared object graph for public projects. All project data is private to the originating session.

5. **Agent memory is user-scoped**: Memory operations (`AgentMemoryClient`, `Mem0RestMemoryClient`) are keyed by `userId`. The `userId` comes from the authenticated session context in the DO — it cannot be overridden by a request parameter. Cross-user memory access is not possible.

### Architecture comparison

```
Lovable (pre-Apr 2026)                    vibesdk
──────────────────────────────────────    ──────────────────────────────────────
Shared server-side rendering              Isolated Durable Object per session
Shared project object graph               Per-DO SQLite database (no sharing)
Public project visibility option          No public project model
API-layer authorization only              Storage-layer isolation (structural)
Single bypass → all objects exposed       Bypass of one DO exposes only that DO
```

### What an attacker would need to access another user's session

In vibesdk's architecture, an attacker attempting to access another user's session would need:

1. **The target session's DO ID** — not exposed in any API, not enumerable, not derivable from session metadata
2. **A valid auth token for that session** — enforced by the Worker routing layer before the DO is addressed
3. **Physical access to Cloudflare's infrastructure** — the DO storage is encrypted at rest by Cloudflare

Contrast with the Lovable scenario: **a valid free account token** was sufficient.

### Scope of isolation

| Resource | Isolated per | Shared across |
|---|---|---|
| SQLite database (blueprint, files, git) | DO instance | Nothing |
| Git repository | DO instance | Nothing |
| Conversation messages | DO instance | Nothing |
| Agent memory | User ID (cryptographically bound) | Same user's sessions |
| AI model API keys | BYOK per user (vault DO) | Nothing |
| Sandbox environment | Session (container/vm) | Nothing |

### Reporting vulnerabilities

If you believe you have found a security vulnerability in vibesdk, please report it by emailing **security@vibesdk.dev** rather than creating a public GitHub issue.

We commit to:
- Acknowledge receipt within 24 hours
- Provide an initial assessment within 72 hours
- Keep you informed of remediation progress
- Credit you in the release notes (if desired)

### Known limitations and mitigations

1. **CF Workers supply chain**: vibesdk runs on Cloudflare's infrastructure. A vulnerability in Cloudflare's DO isolation could theoretically expose session data. Mitigation: Cloudflare maintains SOC 2 Type II certification; we track CF security advisories.

2. **BYOK key exposure**: If a user's BYOK API key is compromised at the provider level, their LLM calls can be observed. Mitigation: keys are stored in an isolated vault DO with XChaCha20-Poly1305 encryption at rest (`worker/services/secrets/`).

3. **Sandbox escape**: The code sandbox runs user-generated code. Mitigation: container-level isolation with no access to the host network or other users' containers.

4. **Memory client cross-session recall**: Agent memory is scoped by `userId`, not `sessionId`. A user's memory can be recalled across their own sessions. This is intentional (cross-session continuity) and does not expose one user's memory to another.
