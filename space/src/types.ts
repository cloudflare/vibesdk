/**
 * Shared types for the space package.
 */

// ── Session Types ───────────────────────────────────────────────────

/** @deprecated Use SessionInfo from upstream-types.ts for API responses */
export interface InternalSessionInfo {
  id: string
  title: string
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
}

export interface SessionMessage {
  id: string
  sessionId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  toolCalls?: ToolCallInfo[]
  toolResults?: ToolResultInfo[]
  createdAt: number
}

export interface ToolCallInfo {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResultInfo {
  callId: string
  name: string
  result: string
  isError?: boolean
}

// ── Stored Message Types (shared between DO and agent-loop) ─────────

export type StoredPart = {
  id: string
  sessionID: string
  messageID: string
  type: string
  text?: string
  time?: { start: number; end?: number }
  reason?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  callID?: string
  tool?: string
  state?: {
    status: string
    input: Record<string, unknown>
    raw?: string
    title?: string
    output?: string
    metadata?: Record<string, unknown>
    time?: { start: number; end?: number }
    error?: string
  }
  metadata?: Record<string, unknown>
  snapshot?: string
}

export interface StoredMessage {
  info: {
    id: string
    sessionID: string
    role: "user" | "assistant"
    time: { created: number; completed?: number }
    agent: string
    model?: { providerID: string; modelID: string }
    parentID?: string
    modelID?: string
    providerID?: string
    mode?: string
    path?: { cwd: string; root: string }
    cost?: number
    tokens?: {
      total?: number
      input: number
      output: number
      reasoning: number
      cache: { read: number; write: number }
    }
    finish?: string
    summary?: { diffs: unknown[] }
    error?: unknown
  }
  parts: StoredPart[]
}

// ── Event Types ─────────────────────────────────────────────────────

export type SessionEvent =
  | { type: "session.created"; session: InternalSessionInfo }
  | { type: "session.updated"; session: Partial<InternalSessionInfo> & { id: string } }
  | { type: "message.created"; message: SessionMessage }
  | { type: "step.start"; sessionId: string; messageId: string }
  | { type: "text.start"; sessionId: string; messageId: string }
  | { type: "text.end"; sessionId: string; messageId: string }
  | { type: "message.delta"; sessionId: string; messageId: string; delta: string }
  | { type: "message.completed"; sessionId: string; messageId: string }
  | { type: "tool.called"; sessionId: string; messageId: string; tool: ToolCallInfo }
  | { type: "tool.result"; sessionId: string; messageId: string; result: ToolResultInfo }
  | { type: "error"; sessionId?: string; error: string }
  | { type: "done"; sessionId: string }
