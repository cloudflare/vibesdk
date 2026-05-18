/**
 * Bus — Effect-compatible pub/sub for SSE event broadcasting.
 *
 * Provides the same Bus.Service interface as upstream so processor.ts,
 * session/index.ts, and status.ts can call `yield* bus.publish(def, props)`.
 *
 * Under the hood it's a simple callback-based relay — no PubSub/Stream.
 * The DO registers its `broadcast()` as a listener.
 */
import z from "zod"
import { Effect, Layer, ServiceMap, Stream } from "effect"
import { BusEvent } from "./bus/bus-event"
import { GlobalBus } from "./bus/global"

let evtCounter = 0
let evtLastTs = 0
function evtId(): string {
  const ts = Date.now()
  if (ts !== evtLastTs) { evtLastTs = ts; evtCounter = 0 }
  evtCounter++
  const now = BigInt(ts) * BigInt(0x1000) + BigInt(evtCounter)
  const bytes = new Uint8Array(6)
  for (let i = 0; i < 6; i++) bytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let rand = ""
  for (let i = 0; i < 14; i++) rand += chars[Math.floor(Math.random() * 62)]
  return `evt_${hex}${rand}`
}

export namespace Bus {
  type Payload<D extends BusEvent.Definition = BusEvent.Definition> = {
    type: D["type"]
    properties: z.infer<D["properties"]>
  }

  const listeners = new Set<(event: Payload) => void>()

  export const InstanceDisposed = BusEvent.define(
    "server.instance.disposed",
    z.object({ directory: z.string() }),
  )

  export interface Interface {
    readonly publish: <D extends BusEvent.Definition>(
      def: D,
      properties: z.output<D["properties"]>,
    ) => Effect.Effect<void>
    readonly subscribe: <D extends BusEvent.Definition>(def: D) => Stream.Stream<Payload<D>>
    readonly subscribeAll: () => Stream.Stream<Payload>
    readonly subscribeCallback: <D extends BusEvent.Definition>(
      def: D,
      callback: (event: Payload<D>) => unknown,
    ) => Effect.Effect<() => void>
    readonly subscribeAllCallback: (callback: (event: any) => unknown) => Effect.Effect<() => void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Bus") {}

  export const layer = Layer.succeed(
    Service,
    Service.of({
      publish: <D extends BusEvent.Definition>(def: D, properties: z.output<D["properties"]>) =>
        Effect.sync(() => {
          const payload = { id: evtId(), type: def.type, properties } as Payload
          for (const fn of listeners) {
            try { fn(payload) } catch {}
          }
          GlobalBus.emit("event", { directory: "/workspace", payload })
        }),
      subscribe: () => Stream.empty as any,
      subscribeAll: () => Stream.empty as any,
      subscribeCallback: (_def: any, callback: any) =>
        Effect.sync(() => {
          const wrapped = (event: Payload) => {
            if (event.type === _def.type) callback(event)
          }
          listeners.add(wrapped)
          return () => listeners.delete(wrapped)
        }),
      subscribeAllCallback: (callback: any) =>
        Effect.sync(() => {
          listeners.add(callback)
          return () => listeners.delete(callback)
        }),
    }),
  )

  // Imperative API for use outside Effect
  export async function publish<D extends BusEvent.Definition>(def: D, properties: z.output<D["properties"]>) {
    const payload = { id: evtId(), type: def.type, properties } as Payload
    for (const fn of listeners) {
      try { fn(payload) } catch {}
    }
    GlobalBus.emit("event", { directory: "/workspace", payload })
  }

  export function subscribe<D extends BusEvent.Definition>(
    def: D,
    callback: (event: Payload<D>) => unknown,
  ) {
    const wrapped = (event: Payload) => {
      if (event.type === def.type) callback(event as Payload<D>)
    }
    listeners.add(wrapped)
    return () => listeners.delete(wrapped)
  }

  export function subscribeAll(callback: (event: Payload) => unknown) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }
}
