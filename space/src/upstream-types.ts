/**
 * Upstream-compatible type definitions.
 *
 * These mirror the shapes a client expects from the server API.
 */

// ── Session ───────────────────────────────────────────────────────

export interface SessionInfo {
  id: string
  slug: string
  projectID: string
  workspaceID?: string
  directory: string
  parentID?: string
  title: string
  version: string
  summary?: {
    additions: number
    deletions: number
    files: number
    diffs?: unknown[]
  }
  share?: { url: string }
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
  permission?: Array<{ permission: string; pattern: string; action: string }>
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}

// ── Config ────────────────────────────────────────────────────────

export interface ConfigInfo {
  $schema?: string
  agent?: Record<string, AgentConfig>
  mode?: Record<string, AgentConfig>
  plugin?: unknown[]
  command?: Record<string, { template: string; description?: string; agent?: string; model?: string }>
  provider?: Record<string, unknown>
  mcp?: Record<string, unknown>
  permission?: Record<string, unknown>
  tools?: Record<string, boolean>
  username?: string
  disabled_providers?: string[]
  enabled_providers?: string[]
  model?: string
  small_model?: string
  default_agent?: string
  instructions?: string[]
  experimental?: Record<string, unknown>
}

export interface AgentConfig {
  model?: string
  variant?: string
  temperature?: number
  prompt?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  color?: string
  steps?: number
  permission?: Record<string, unknown>
  options?: Record<string, unknown>
  tools?: Record<string, boolean>
  disable?: boolean
}

// ── Agent (runtime info, returned by GET /agent) ──────────────────

export interface AgentInfo {
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  temperature?: number
  color?: string
  prompt?: string
  options: Record<string, unknown>
  permission?: Array<{ permission: string; action: string; pattern: string }>
  model?: { modelID: string; providerID: string }
  variant?: string
  steps?: number
}

// ── Provider ──────────────────────────────────────────────────────

export interface Model {
  id: string
  providerID: string
  name: string
  family?: string
  api: { id: string; url: string; npm: string }
  status: "alpha" | "beta" | "deprecated" | "active"
  headers: Record<string, string>
  options: Record<string, unknown>
  cost: {
    input: number
    output: number
    cache: { read: number; write: number }
  }
  limit: { context: number; output: number; input?: number }
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean }
    output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean }
    interleaved: boolean | { field: string }
  }
  release_date: string
  variants?: Record<string, Record<string, unknown>>
}

export interface Provider {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: string[]
  options: Record<string, unknown>
  models: Record<string, Model>
}

export interface ProviderListResponse {
  all: Provider[]
  default: Record<string, string>
  connected: string[]
}

// ── Project ───────────────────────────────────────────────────────

export interface ProjectInfo {
  id: string
  worktree: string
  vcs?: string
  name?: string
  time: {
    created: number
    updated: number
    initialized?: number
  }
  sandboxes?: string[]
}

// ── Bus Events ────────────────────────────────────────────────────

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }

export type BusEventPayload =
  | { type: "server.connected"; properties: Record<string, never> }
  | { type: "server.heartbeat"; properties: Record<string, never> }
  | { type: "session.created"; properties: { sessionID: string; info: SessionInfo } }
  | { type: "session.updated"; properties: { sessionID: string; info: SessionInfo } }
  | { type: "session.deleted"; properties: { sessionID: string; info: SessionInfo } }
  | { type: "message.updated"; properties: { sessionID: string; info: unknown } }
  | { type: "message.part.updated"; properties: { sessionID: string; part: unknown; time: number } }
  | { type: "message.part.delta"; properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string } }
  | { type: "session.status"; properties: { sessionID: string; status: SessionStatus } }
  | { type: "session.idle"; properties: { sessionID: string } }
  | { type: "session.error"; properties: { sessionID?: string; error?: unknown } }
  | { type: string; properties: Record<string, unknown> }

// ── Helpers ───────────────────────────────────────────────────────

let _counter = 0
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return `${base}-${(++_counter).toString(36)}`
}
