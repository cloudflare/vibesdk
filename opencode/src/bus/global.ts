// Shim: @/bus/global
type Handler = (event: any) => void
const handlers = new Map<string, Set<Handler>>()

export namespace GlobalBus {
  export function on(event: string, handler: Handler) {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(handler)
  }
  export function off(event: string, handler: Handler) {
    handlers.get(event)?.delete(handler)
  }
  export function emit(event: string, data: any) {
    for (const h of handlers.get(event) ?? []) h(data)
  }
}
