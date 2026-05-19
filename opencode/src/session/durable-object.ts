import { DurableObject } from "cloudflare:workers"
import type { Env } from "../env"
import type { StoredMessage } from "../types"
import type { SpaceMapping } from "../tools"
import { Session } from "./index"
import { SessionPrompt } from "./prompt"
import { setRegistryContext, clearRegistryContext } from "../tool/registry"
import { Bus } from "../bus"
import { setMessageStore, setPartsStore } from "./message-v2"
import { setProviderEnv } from "../provider/provider"

// ── Sortable ID generation (compatible with OpenCode TUI) ─────────

let lastTimestamp = 0
let idCounter = 0

function generateId(prefix: "msg" | "prt" | "ses" | "evt"): string {
  const currentTimestamp = Date.now()
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp
    idCounter = 0
  }
  idCounter++
  const now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(idCounter)
  const timeBytes = new Uint8Array(6)
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }
  const timeHex = Array.from(timeBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let randomPart = ""
  for (let i = 0; i < 14; i++) {
    randomPart += chars[Math.floor(Math.random() * 62)]
  }
  return `${prefix}_${timeHex}${randomPart}`
}

// StoredMessage and StoredPart types imported from ../types

interface Session {
  id: string
  slug: string
  projectID: string
  directory: string
  path: string
  title: string
  version: string
  agent: string
  model: { id: string; providerID: string }
  cost: number
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  summary: { additions: number; deletions: number; files: number }
  time: { created: number; updated: number }
}

/**
 * Subset of `Env` that the consumer worker can override per-DO via
 * `stub.configure(overrides)`. Useful when the DO is hosted in a
 * different worker (cross-script binding) and provider/gateway creds
 * live with the consumer rather than the host.
 *
 * Overrides are merged on top of `this.env` (overrides win) and
 * persisted in DO storage so they survive eviction.
 */
export interface SessionConfigOverrides {
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_API_KEY?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_GATEWAY_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CF_AIG_TOKEN?: string
  OPENCODE_DIRECTORY?: string
  /**
   * Default model for new sessions created on this DO. Does not change
   * the model on already-created sessions — pass `model` in the prompt
   * body to override per-call.
   */
  defaultModel?: { providerID: string; modelID: string }
  /**
   * Default agent space attached to any session that doesn't have one
   * explicitly attached (via `attachSpace()`). Tools resolve the
   * session's working space from this when no per-session attachment
   * exists. If unset, the DO falls back to an auto-named per-session
   * space (`session-<id-prefix>`).
   */
  defaultSpace?: string
}

interface PromptRequest {
  parts?: Array<{ type: string; text?: string }>
  content?: string
  model?: { providerID: string; modelID: string }
  providerID?: string
  modelID?: string
  agent?: string
  messageID?: string
}

/**
 * Session Durable Object — single "main" instance.
 *
 * Handles ALL sessions in one DO so SSE connections and message
 * broadcasting share the same isolate. Follows the architecture
 * from southpolesteve/opencode-do.
 */
interface SseConn {
  global: boolean
  directory: string
  // AsyncQueue-style: a queue of pending payload strings, plus a `notify`
  // resolver that wakes the consumer loop when new data arrives. The
  // consumer loop awaits each writer.write() which respects HTTP/2 flow
  // control and the client's read pace — true backpressure, unlike a raw
  // controller.enqueue() which just appends bytes synchronously.
  queue: string[]
  notify: (() => void) | null
  closed: boolean
}

export class SessionDO extends DurableObject<Env> {
  // Per-connection state. The map key IS the connection object (we never
  // need to look it up by anything else, just iterate).
  private conns: Set<SseConn> = new Set()
  private encoder = new TextEncoder()
  private abortController: AbortController | null = null
  // Fallback directory used by code paths that aren't tied to a specific
  // SSE connection (e.g., createSession path resolution).
  private clientDir = "/"

  // Per-DO env overrides supplied by the consumer worker via `configure()`.
  // Persisted in DO storage so they survive isolate eviction. Merged on
  // top of `this.env` whenever we hand env to provider/registry.
  private envOverrides: SessionConfigOverrides = {}

  private effectiveEnv(): Env {
    const { defaultModel: _ignore, ...rest } = this.envOverrides
    return { ...this.env, ...rest } as Env
  }

  private getDir(): string {
    return this.envOverrides.OPENCODE_DIRECTORY || (this.env as any).OPENCODE_DIRECTORY || this.clientDir
  }

  private defaultModel(): { id: string; providerID: string } {
    const dm = this.envOverrides.defaultModel
    if (dm) return { id: dm.modelID, providerID: dm.providerID }
    return { id: "claude-sonnet-4-20250514", providerID: "anthropic" }
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    try { this._init() } catch (e) { console.error("[SessionDO] constructor error:", e); throw e }
  }

  private _init() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        data TEXT NOT NULL
      )
    `)
    this.ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`,
    )
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_meta (
        session_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (session_id, key)
      )
    `)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_spaces (
        session_id TEXT NOT NULL,
        space_name TEXT NOT NULL,
        PRIMARY KEY (session_id, space_name)
      )
    `)
    this.ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_spaces_session ON session_spaces(session_id)`,
    )
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS known_spaces (
        name TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    `)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS do_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Restore persisted env overrides
    const cfgRows = this.ctx.storage.sql
      .exec(`SELECT value FROM do_config WHERE key = ?`, "envOverrides")
      .toArray()
    if (cfgRows.length > 0) {
      try { this.envOverrides = JSON.parse(cfgRows[0].value as string) } catch {}
    }

    // Wire Session.Service to use DO's SQLite for storage
    Session.setStore({
      get: (id: string) => this.getSessionById(id),
      list: () => this.listSessions(),
      create: (input?: any) => this.createSession(undefined, input?.title),
      storeMessage: (msg: any) => this.storeMessage(msg),
      getMessages: (id: string) => this.getMessagesForSession(id),
      updateSession: (id: string, patch: any) => this.updateSessionTitle(id, patch.title || ""),
      upsertMessageInfo: (info: any) => this.upsertMessageInfo(info),
      upsertPart: (part: any) => this.upsertPart(part),
    })

    // Wire MessageV2.stream/filterCompacted/parts to use DO SQLite
    setMessageStore((id) => this.getMessagesForSession(id) as any)
    setPartsStore((messageId) => {
      const msg = this.getStoredMessage(messageId)
      return msg?.parts ?? []
    })

    // Wire Provider.getLanguage to use real API keys (merged with overrides)
    setProviderEnv(this.effectiveEnv())

    // Wire Bus events → SSE broadcast
    Bus.subscribeAll((event) => {
      this.broadcast(event)
    })
  }

  // ── fetch() — routes SSE + message requests ────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // SSE event stream
    if (path === "/event" && request.method === "GET") {
      const global = url.searchParams.get("global") === "1"
      const dirQuery = url.searchParams.get("directory")
      const dirHeader = request.headers.get("x-opencode-directory")
      const dirRaw = dirQuery || dirHeader
      const dir = dirRaw ? decodeURIComponent(dirRaw) : undefined
      if (dir) this.clientDir = dir
      // When no directory is provided (the binary's GlobalSDK SSE has none),
      // use the same deterministic default as /path returns — NOT the mutable
      // clientDir which gets contaminated by other requests. This ensures the
      // TUI's per-directory listener key (from /path response) always matches.
      const fallback = (this.env as any).OPENCODE_DIRECTORY || "/"
      const resolved = dir ?? fallback
      console.log(`[SSE] ${global ? "/global/event" : "/event"} opened — dirQuery=${JSON.stringify(dirQuery)} dirHeader=${JSON.stringify(dirHeader)} resolved=${JSON.stringify(resolved)}`)
      return this.handleSSE(global, resolved)
    }

    // GET /session/:id/message — get messages
    const msgMatch = path.match(/^\/session\/([^/]+)\/message$/)
    if (msgMatch && request.method === "GET") {
      return this.handleGetMessages(msgMatch[1], url.searchParams)
    }

    // POST /session/:id/message — prompt (streaming response)
    if (msgMatch && request.method === "POST") {
      return this.handlePromptStream(msgMatch[1], request)
    }

    // ── Streaming test endpoint ──
    if (path === "/test-stream") {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          for (let i = 0; i < 5; i++) {
            controller.enqueue(encoder.encode(`data: chunk ${i} at ${Date.now()}\n\n`))
            await new Promise(r => setTimeout(r, 500))
          }
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      })
    }

    return new Response("Not found", { status: 404 })
  }

  // ── SSE Management ─────────────────────────────────────────────
  // Use ReadableStream + controller.enqueue (NOT TransformStream + writer)
  // TransformStream in CF Workers DOs buffers data instead of streaming.

  private handleSSE(global = false, directory: string = this.getDir()): Response {
    // Use TransformStream so writer.write() returns a Promise that respects
    // HTTP/2 flow control. This is the same pattern Hono's streamSSE uses
    // upstream — each write awaits the client's read pace. controller.enqueue
    // is synchronous and just appends bytes; under burst load the client SDK
    // gives up and cancels with no error (we observed "cancel:undefined"
    // mid-prompt). awaited writes prevent that.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    const conn: SseConn = {
      global,
      directory,
      queue: [],
      notify: null,
      closed: false,
    }
    this.conns.add(conn)
    console.log("SSE connection opened, total:", this.conns.size, "global:", global, "dir:", directory)

    const cleanup = (why: string) => {
      if (conn.closed) return
      conn.closed = true
      this.conns.delete(conn)
      conn.notify?.()
      clearInterval(heartbeat)
      writer.close().catch(() => {})
      console.log(`SSE cleaned up (why=${why}). Remaining:`, this.conns.size)
    }

    // Initial connected event — wrapped for /global/event, raw for /event.
    // /global/event clients filter by directory==="global" (see broadcast).
    const initEvent = { id: generateId("evt"), type: "server.connected", properties: {} }
    const init = global ? { directory: "global", payload: initEvent } : initEvent
    conn.queue.push(this.formatSSE(init))

    // Heartbeat every 10s.
    const heartbeat = setInterval(() => {
      const hbEvent = { id: generateId("evt"), type: "server.heartbeat", properties: {} }
      const hb = global ? { directory: "global", payload: hbEvent } : hbEvent
      conn.queue.push(this.formatSSE(hb))
      conn.notify?.()
    }, 10_000)

    // Consumer loop — drains the queue, awaiting each write for proper
    // backpressure. Detached promise; lives until conn.closed or the writer
    // throws.
    ;(async () => {
      try {
        while (!conn.closed) {
          while (conn.queue.length > 0) {
            const chunk = conn.queue.shift()!
            await writer.write(this.encoder.encode(chunk))
          }
          if (conn.closed) break
          // Park until next broadcast/heartbeat/cleanup.
          await new Promise<void>((res) => {
            conn.notify = res
          })
          conn.notify = null
        }
      } catch (e) {
        cleanup(`writer-failed:${e instanceof Error ? e.message : String(e)}`)
      }
    })()

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Vary": "Origin",
        "Date": new Date().toUTCString(),
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

  private formatSSE(data: object): string {
    return `data: ${JSON.stringify(data)}\n\n`
  }

  broadcast(data: object): void {
    const type = (data as any)?.type ?? "<unknown>"
    console.log(`[SSE broadcast] type=${type} conns=${this.conns.size}`)
    const raw = this.formatSSE(data)
    for (const conn of this.conns) {
      if (conn.closed) continue
      // The TUI binary v1.15.x filters incoming events with:
      //   if (J.directory === "global" || J.project === currentProject()) accept
      //   else drop
      // Anything else (e.g. directory="/Users/karishnu") gets silently
      // dropped, which is why messages stop rendering live. Emit "global"
      // so the binary accepts every event for the open session.
      const msg = conn.global
        ? this.formatSSE({ directory: "global", payload: data })
        : raw
      conn.queue.push(msg)
      conn.notify?.()
    }
  }

  // ── Configuration (consumer worker → host DO) ──────────────────

  /**
   * Merge env overrides supplied by the binding worker. Persisted in
   * DO storage so they survive eviction. Re-applies provider env so
   * subsequent prompts pick up the new credentials immediately.
   *
   * Pass `null` for any field to clear it; pass `{}` to no-op.
   */
  configure(overrides: SessionConfigOverrides): SessionConfigOverrides {
    this.envOverrides = { ...this.envOverrides, ...overrides }
    // Drop keys explicitly set to undefined/null so the merge with
    // this.env can fall through to host env values.
    for (const k of Object.keys(this.envOverrides) as (keyof SessionConfigOverrides)[]) {
      if (this.envOverrides[k] == null) delete this.envOverrides[k]
    }
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO do_config (key, value) VALUES (?, ?)`,
      "envOverrides",
      JSON.stringify(this.envOverrides),
    )
    setProviderEnv(this.effectiveEnv())
    return this.envOverrides
  }

  /** Return the currently-applied overrides (does not leak `this.env`). */
  getConfig(): SessionConfigOverrides {
    return { ...this.envOverrides }
  }

  // ── Session CRUD ───────────────────────────────────────────────

  createSession(id?: string, title?: string): Session {
    const sessionId = id || generateId("ses")
    const now = Date.now()
    const session: Session = {
      id: sessionId,
      slug: sessionId.slice(0, 8),
      projectID: "global",
      directory: this.getDir(),
      path: this.getDir(),
      title: title || "New Session",
      version: "0.1.0",
      agent: "build",
      model: this.defaultModel(),
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      summary: { additions: 0, deletions: 0, files: 0 },
      time: { created: now, updated: now },
    }
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO sessions (id, data, created_at) VALUES (?, ?, ?)`,
      sessionId,
      JSON.stringify(session),
      now,
    )
    return session
  }

  async createSessionAndBroadcast(id?: string, title?: string): Promise<Session> {
    const session = this.createSession(id, title)
    await this.broadcast({
      type: "session.created",
      properties: { sessionID: session.id, info: session },
    })
    await this.broadcast({
      type: "session.updated",
      properties: { sessionID: session.id, info: session },
    })
    return session
  }

  private backfill(raw: Record<string, unknown>): Session {
    return {
      path: "workspace",
      agent: "build",
      model: this.defaultModel(),
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      summary: { additions: 0, deletions: 0, files: 0 },
      ...raw,
    } as Session
  }

  getSessionById(id: string): Session | null {
    const rows = this.ctx.storage.sql
      .exec(`SELECT data FROM sessions WHERE id = ?`, id)
      .toArray()
    if (rows.length === 0) return null
    return this.backfill(JSON.parse(rows[0].data as string))
  }

  listSessions(): Session[] {
    const rows = this.ctx.storage.sql
      .exec(`SELECT data FROM sessions ORDER BY created_at DESC`)
      .toArray()
    return rows.map((r) => this.backfill(JSON.parse(r.data as string)))
  }

  deleteSessionById(id: string): void {
    this.ctx.storage.sql.exec(`DELETE FROM sessions WHERE id = ?`, id)
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE session_id = ?`, id)
    this.ctx.storage.sql.exec(`DELETE FROM session_meta WHERE session_id = ?`, id)
  }

  updateSessionTitle(id: string, title: string): Session | null {
    const session = this.getSessionById(id)
    if (!session) return null
    session.title = title
    session.time.updated = Date.now()
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO sessions (id, data, created_at) VALUES (?, ?, ?)`,
      id,
      JSON.stringify(session),
      session.time.created,
    )
    return session
  }

  // ── Session Meta ───────────────────────────────────────────────

  getSessionMeta(sessionId: string): Record<string, string> {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT key, value FROM session_meta WHERE session_id = ?`,
        sessionId,
      )
      .toArray()
    return Object.fromEntries(
      rows.map((r) => [r.key as string, r.value as string]),
    )
  }

  setSessionMeta(sessionId: string, key: string, value: string): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO session_meta (session_id, key, value) VALUES (?, ?, ?)`,
      sessionId,
      key,
      value,
    )
  }

  // ── Session ↔ Space Mappings ────────────────────────────────────

  addSessionSpace(sessionId: string, spaceName: string): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO session_spaces (session_id, space_name) VALUES (?, ?)`,
      sessionId,
      spaceName,
    )
    // Also register the space globally so it shows up in listAllSpaces().
    this.registerSpace(spaceName)
  }

  /**
   * Public RPC: attach (and implicitly create) an agent space for a
   * session. Idempotent — calling repeatedly with the same name is a
   * no-op. The SpaceDO itself auto-initializes on first RPC call from
   * tools, so this method just records the binding.
   *
   * The binding worker should call this immediately after creating a
   * session so the agent inherits a pre-provisioned workspace and the
   * tools don't need a `space` parameter on every call.
   */
  attachSpace(sessionId: string, spaceName: string): { sessionId: string; spaceName: string } {
    this.addSessionSpace(sessionId, spaceName)
    return { sessionId, spaceName }
  }

  /**
   * Resolve the working space for a session, in this order:
   *   1. The first space attached to the session via `attachSpace()`.
   *   2. The `defaultSpace` from envOverrides (applied via `configure()`).
   *   3. An auto-named per-session space (`session-<id-prefix>`).
   *
   * The resolved name is auto-attached to the session if it wasn't
   * already, so subsequent tool calls in the same session reuse it.
   */
  private currentSpaceFor(sessionId: string): string {
    const attached = this.getSessionSpaces(sessionId)
    if (attached.length > 0) return attached[0].spaceName
    const fallback = this.envOverrides.defaultSpace || `session-${sessionId.slice(0, 12).toLowerCase()}`
    this.addSessionSpace(sessionId, fallback)
    return fallback
  }

  removeSessionSpace(sessionId: string, spaceName: string): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM session_spaces WHERE session_id = ? AND space_name = ?`,
      sessionId,
      spaceName,
    )
  }

  hasSessionSpace(sessionId: string, spaceName: string): boolean {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT 1 FROM session_spaces WHERE session_id = ? AND space_name = ?`,
        sessionId,
        spaceName,
      )
      .toArray()
    return rows.length > 0
  }

  getSessionSpaces(sessionId: string): SpaceMapping[] {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT session_id, space_name FROM session_spaces WHERE session_id = ?`,
        sessionId,
      )
      .toArray()
    return rows.map((r) => ({
      sessionId: r.session_id as string,
      spaceName: r.space_name as string,
    }))
  }

  listAllSpaces(): string[] {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT name FROM known_spaces
         UNION
         SELECT DISTINCT space_name AS name FROM session_spaces
         ORDER BY name`,
      )
      .toArray()
    return rows.map((r) => r.name as string)
  }

  registerSpace(name: string): void {
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO known_spaces (name, created_at) VALUES (?, ?)`,
      name,
      Date.now(),
    )
  }

  // ── Get Messages (V2 format for TUI) ──────────────────────────

  private handleGetMessages(sessionId: string, query: URLSearchParams): Response {
    const limit = parseInt(query.get("limit") || "100", 10)
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT data FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT ?`,
        sessionId,
        limit,
      )
      .toArray()
    const messages: StoredMessage[] = rows.map(
      (r) => JSON.parse(r.data as string) as StoredMessage,
    )
    return new Response(JSON.stringify(messages), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  getMessagesForSession(sessionId: string): StoredMessage[] {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT data FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
        sessionId,
      )
      .toArray()
    return rows.map((r) => JSON.parse(r.data as string) as StoredMessage)
  }

  // ── Message Handling (full TUI SSE event protocol) ─────────────

  /**
   * Public RPC entry point for prompt submission.
   * Validates input synchronously, then fires-and-forgets the agent loop
   * so the caller (Worker route) can return 204 immediately.
   */
  prompt(sessionId: string, body: Record<string, unknown>, host: string): string | null {
    const parsed = body as PromptRequest
    const err = this.validatePrompt(parsed)
    if (err) return err
    this.runPrompt(sessionId, parsed, this.extractText(parsed), host).catch((e) =>
      console.error("[prompt] unhandled error:", e),
    )
    return null
  }

  /**
   * Synchronous prompt — waits for completion and returns the assistant message.
   * Used by POST /session/:id/message (upstream returns 200 with body).
   */
  async promptWait(sessionId: string, body: Record<string, unknown>, host: string): Promise<StoredMessage | string> {
    const parsed = body as PromptRequest
    const err = this.validatePrompt(parsed)
    if (err) return err
    return this.runPrompt(sessionId, parsed, this.extractText(parsed), host)
  }

  private validatePrompt(parsed: PromptRequest): string | null {
    return this.extractText(parsed) ? null : "Message content is required"
  }

  private extractText(parsed: PromptRequest): string {
    return (
      parsed.content ||
      (parsed.parts || [])
        .filter(
          (p): p is { type: string; text: string } =>
            (p.type === "text" || p.type === "input") && !!p.text,
        )
        .map((p) => p.text)
        .join("\n")
        .trim()
    )
  }

  /**
   * Delegates to upstream SessionPrompt.prompt() — handles user message creation,
   * assistant message, LLM streaming, tool execution, Bus events — everything.
   * Bus events flow via constructor's Bus.subscribeAll → this.broadcast() → SSE.
   */
  private async runPrompt(
    sessionId: string,
    body: PromptRequest,
    text: string,
    host: string,
  ): Promise<StoredMessage> {
    console.log(`[runPrompt] session=${sessionId}, SSE: ${this.conns.size}`)

    // Re-apply provider env each run — `setProviderEnv` is a module-level
    // singleton and can be clobbered by other DO isolates in the same
    // worker process. Re-asserting here pins the merged-overrides env
    // for the duration of this prompt.
    setProviderEnv(this.effectiveEnv())

    // Set the tool-registry context so each tool's execute() can reach the
    // SpaceDO via DO RPC and read/update session↔space mappings.
    setRegistryContext({
      env: this.env,
      sessionId,
      host,
      spaceStore: {
        add: (name) => this.addSessionSpace(sessionId, name),
        remove: (name) => this.removeSessionSpace(sessionId, name),
        list: () => this.getSessionSpaces(sessionId),
        has: (name) => this.hasSessionSpace(sessionId, name),
        current: () => this.currentSpaceFor(sessionId),
      },
    })

    try {
      const result = await SessionPrompt.prompt({
        sessionID: sessionId,
        parts: body.parts || [{ type: "text", text }],
        agent: body.agent,
        model: body.model,
        messageID: body.messageID,
      })
      // Store the completed message in DO SQLite
      if (result) this.storeMessage(result as any)
      return result as any
    } catch (e) {
      console.error("[runPrompt] error:", e)
      // Return a minimal error message
      const id = generateId("msg")
      const err: StoredMessage = {
        info: {
          id, sessionID: sessionId, role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
          agent: "build", finish: "stop",
          error: { name: "UnknownError", data: { message: e instanceof Error ? e.message : String(e) } },
        },
        parts: [],
      }
      this.storeMessage(err)
      return err
    } finally {
      clearRegistryContext()
    }
  }

  // ── Streaming prompt handler (called via DO fetch, not RPC) ──

  private handlePromptStream(sessionId: string, request: Request): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    ;(async () => {
      try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>
        const host = new URL(request.url).origin
        const result = await this.promptWait(sessionId, body, host)
        const json = typeof result === "string"
          ? JSON.stringify({ error: result })
          : JSON.stringify(result)
        await writer.write(encoder.encode(json))
      } catch (e) {
        await writer.write(encoder.encode(JSON.stringify({
          error: e instanceof Error ? e.message : String(e),
        })))
      } finally {
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: { "Content-Type": "application/json" },
    })
  }

  // ── Upsert helpers (called by Session.Service during prompt) ──

  private upsertMessageInfo(info: any): void {
    const existing = this.getStoredMessage(info.id)
    const msg: StoredMessage = existing || { info, parts: [] }
    msg.info = info
    this.storeMessage(msg)
  }

  private upsertPart(part: any): void {
    const msg = this.getStoredMessage(part.messageID)
    if (!msg) return
    const idx = msg.parts.findIndex((p: any) => p.id === part.id)
    if (idx >= 0) msg.parts[idx] = part
    else msg.parts.push(part)
    this.storeMessage(msg)
  }

  private getStoredMessage(messageId: string): StoredMessage | null {
    const rows = this.ctx.storage.sql
      .exec(`SELECT data FROM messages WHERE id = ?`, messageId)
      .toArray()
    if (rows.length === 0) return null
    return JSON.parse(rows[0].data as string) as StoredMessage
  }

  // ── Storage helper ─────────────────────────────────────────

  private storeMessage(msg: StoredMessage): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO messages (id, session_id, role, created_at, completed_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
      msg.info.id,
      msg.info.sessionID,
      msg.info.role,
      msg.info.time.created,
      msg.info.time.completed || null,
      JSON.stringify(msg),
    )
  }
}
