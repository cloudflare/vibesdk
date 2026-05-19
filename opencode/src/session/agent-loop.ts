import { streamText, convertToModelMessages, tool, jsonSchema, type UIMessage } from "ai"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import type { StoredMessage, SessionEvent } from "../types"

const MAX_STEPS = 25

export interface AgentLoopInput {
  model: LanguageModelV3
  tools: Record<string, any>
  system: string[]
  getMessages: () => StoredMessage[]
  sessionId: string
  signal: AbortSignal
  onEvent: (event: SessionEvent) => Promise<void>
}

/**
 * Convert StoredMessage[] → UIMessage[] for use with convertToModelMessages.
 * Mirrors upstream opencode's toModelMessagesEffect (message-v2.ts).
 */
function toUIMessages(stored: StoredMessage[]): UIMessage[] {
  const result: UIMessage[] = []

  for (const msg of stored) {
    if (msg.parts.length === 0) continue

    if (msg.info.role === "user") {
      const parts = msg.parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => ({ type: "text" as const, text: p.text! }))
      if (parts.length > 0) {
        result.push({ id: msg.info.id, role: "user", parts })
      }
      continue
    }

    if (msg.info.role === "assistant") {
      if (msg.info.error) continue

      const parts: UIMessage["parts"] = []
      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          parts.push({ type: "text" as const, text: part.text })
        }
        if (part.type === "step-start") {
          parts.push({ type: "step-start" as const })
        }
        if (part.type === "reasoning" && part.text) {
          parts.push({ type: "reasoning" as const, text: part.text })
        }
        if (part.type === "tool" && part.tool && part.callID) {
          const name = part.tool
          if (part.state?.status === "completed") {
            parts.push({
              type: `tool-${name}` as `tool-${string}`,
              state: "output-available",
              toolCallId: part.callID,
              input: part.state.input,
              output: part.state.output ?? "",
            } as any)
          } else if (part.state?.status === "error") {
            parts.push({
              type: `tool-${name}` as `tool-${string}`,
              state: "output-error",
              toolCallId: part.callID,
              input: part.state?.input ?? {},
              errorText: part.state.error ?? "Tool execution failed",
            } as any)
          } else {
            parts.push({
              type: `tool-${name}` as `tool-${string}`,
              state: "output-error",
              toolCallId: part.callID,
              input: part.state?.input ?? {},
              errorText: "[Tool execution was interrupted]",
            } as any)
          }
        }
      }

      if (parts.length > 0) {
        result.push({ id: msg.info.id, role: "assistant", parts })
      }
    }
  }

  return result
}

/**
 * Stream LLM response — matches upstream LLM.stream() + processor pattern.
 *
 * Single streamText() call with maxSteps. The AI SDK handles multi-round
 * tool execution internally. The fullStream emits start-step, finish-step,
 * tool-call, tool-result events naturally across rounds.
 *
 * This replaces the old manual while-loop that called streamText per round.
 */
export async function runAgentLoop(input: AgentLoopInput): Promise<void> {
  const { model, tools, system, getMessages, sessionId, signal, onEvent } = input

  const allTools: Record<string, any> = {
    ...tools,
    invalid: tool({
      description: "Called when the model makes an invalid tool call. Do not call this tool directly.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          tool: { type: "string", description: "The invalid tool name" },
          error: { type: "string", description: "The error message" },
        },
      }),
      execute: async (args: any) =>
        `Error: Invalid tool call "${args.tool}": ${args.error}`,
    }),
  }

  const uiMessages: UIMessage[] = toUIMessages(getMessages())
  const messages = await convertToModelMessages(uiMessages, { tools: allTools })

  // Single streamText call — AI SDK handles multi-round tool execution.
  // Matches upstream LLM.stream() which also calls streamText() once.
  const result = streamText({
    model,
    tools: allTools,
    maxSteps: MAX_STEPS,
    system: system.length > 0 ? system.join("\n\n") : undefined,
    messages,
    abortSignal: signal,
    activeTools: Object.keys(allTools).filter((x) => x !== "invalid"),
    onError(error) {
      console.error("[stream] error:", error)
    },
    async experimental_repairToolCall(failed) {
      const lower = failed.toolCall.toolName.toLowerCase()
      if (lower !== failed.toolCall.toolName && allTools[lower]) {
        return { ...failed.toolCall, toolName: lower }
      }
      return {
        ...failed.toolCall,
        input: JSON.stringify({
          tool: failed.toolCall.toolName,
          error: failed.error.message,
        }),
        toolName: "invalid",
      }
    },
  })

  // Iterate the full stream — AI SDK emits all events across all rounds
  for await (const part of result.fullStream) {
    if (signal.aborted) break

    switch (part.type) {
      case "start-step":
        await onEvent({ type: "step.start", sessionId, messageId: "" })
        break
      case "finish-step":
        await onEvent({ type: "step.finish", sessionId, messageId: "", usage: (part as any).usage, finish: (part as any).finishReason } as any)
        break
      case "start":
        await onEvent({ type: "start", sessionId, messageId: "" } as any)
        break
      case "text-start":
        await onEvent({ type: "text.start", sessionId, messageId: "" })
        break
      case "text-delta":
        await onEvent({ type: "message.delta", sessionId, messageId: "", delta: part.text })
        break
      case "text-end":
        await onEvent({ type: "text.end", sessionId, messageId: "" })
        break
      case "reasoning-start":
        await onEvent({ type: "reasoning.start", sessionId, messageId: "", id: (part as any).id || "" } as any)
        break
      case "reasoning-delta":
        await onEvent({ type: "reasoning.delta", sessionId, messageId: "", id: (part as any).id || "", delta: (part as any).text || "" } as any)
        break
      case "reasoning-end":
        await onEvent({ type: "reasoning.end", sessionId, messageId: "", id: (part as any).id || "" } as any)
        break
      case "tool-call":
        await onEvent({
          type: "tool.called", sessionId, messageId: "",
          tool: { id: part.toolCallId, name: part.toolName, arguments: part.input as Record<string, unknown> },
        })
        break
      case "tool-result":
        await onEvent({
          type: "tool.result", sessionId, messageId: "",
          result: {
            callId: part.toolCallId,
            name: part.toolName,
            result: typeof (part as any).output === "string" ? (part as any).output : JSON.stringify((part as any).output),
          },
        })
        break
      case "tool-error": {
        const err = (part as any).error
        await onEvent({
          type: "tool.result", sessionId, messageId: "",
          result: {
            callId: part.toolCallId,
            name: part.toolName,
            result: `Error: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          },
        })
        break
      }
      case "error":
        console.error("[stream] error:", (part as any).error)
        break
    }
  }

  await onEvent({ type: "message.completed", sessionId, messageId: "" })
}
