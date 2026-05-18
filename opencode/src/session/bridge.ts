/**
 * SessionBridge — mirrors upstream Session.Service + Bus.publish pattern
 * without the full Effect runtime. The DO provides a broadcast callback.
 *
 * updatePart(part) → store + Bus.publish(PartUpdated)
 * updatePartDelta(input) → Bus.publish(PartDelta) (no storage)
 * updateMessage(msg) → store + Bus.publish(MessageUpdated)
 * setStatus(status) → Bus.publish(SessionStatus) + Bus.publish(SessionIdle)
 * sessionDiff(diff) → Bus.publish(SessionDiff)
 */

import type { StoredPart, StoredMessage } from "../types"

export type Broadcaster = (event: { type: string; properties: any }) => Promise<void>

export interface SessionBridge {
  updatePart(part: StoredPart): Promise<StoredPart>
  updatePartDelta(input: { sessionID: string; messageID: string; partID: string; field: string; delta: string }): Promise<void>
  updateMessage(msg: StoredMessage["info"]): Promise<void>
  setStatus(sessionID: string, status: { type: string; [k: string]: any }): Promise<void>
  sessionDiff(sessionID: string, diff: any[]): Promise<void>
  sessionUpdated(sessionID: string, info: any): Promise<void>
}

export function createBridge(broadcast: Broadcaster, store: {
  storeMessage: (msg: StoredMessage) => void
  getMessagesForSession: (sessionId: string) => StoredMessage[]
}): SessionBridge {
  return {
    async updatePart(part) {
      await broadcast({
        type: "message.part.updated",
        properties: { sessionID: part.sessionID, part, time: Date.now() },
      })
      return part
    },

    async updatePartDelta(input) {
      await broadcast({
        type: "message.part.delta",
        properties: input,
      })
    },

    async updateMessage(info) {
      await broadcast({
        type: "message.updated",
        properties: { sessionID: info.sessionID, info },
      })
    },

    async setStatus(sessionID, status) {
      await broadcast({
        type: "session.status",
        properties: { sessionID, status },
      })
      if (status.type === "idle") {
        await broadcast({
          type: "session.idle",
          properties: { sessionID },
        })
      }
    },

    async sessionDiff(sessionID, diff) {
      await broadcast({
        type: "session.diff",
        properties: { sessionID, diff },
      })
    },

    async sessionUpdated(sessionID, info) {
      await broadcast({
        type: "session.updated",
        properties: { sessionID, info },
      })
    },
  }
}
