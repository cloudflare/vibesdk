// Shim: @/installation
import { BusEvent } from "../bus/bus-event"
import z from "zod"

export namespace Installation {
  export const VERSION = "0.1.0-worker"

  export function isLocal() { return false }
  export async function method() { return "unknown" as const }
  export async function latest(_method: string) { return VERSION }
  export async function upgrade(_method: string, _target: string) {}

  export const Event = {
    Updated: BusEvent.define("installation.updated", z.object({ version: z.string() })),
  }
}
