// Shim: upstream @/sync — only SyncEvent.define()
// message-v2.ts only calls SyncEvent.define() at module init to create event type definitions.
// It never calls SyncEvent.run(), .replay(), .process(), etc.
import z from "zod"
import type { ZodObject } from "zod"

export namespace SyncEvent {
  export type Definition = {
    type: string
    version: number
    aggregate: string
    schema: z.ZodObject
    properties: z.ZodObject
  }

  export type Event<Def extends Definition = Definition> = {
    id: string
    seq: number
    aggregateID: string
    data: z.infer<Def["schema"]>
  }

  export type SerializedEvent<Def extends Definition = Definition> = Event<Def> & { type: string }

  export function define<
    Type extends string,
    Agg extends string,
    Schema extends ZodObject<Record<Agg, z.ZodType<string>>>,
    BusSchema extends ZodObject = Schema,
  >(input: { type: Type; version: number; aggregate: Agg; schema: Schema; busSchema?: BusSchema }) {
    return {
      type: input.type,
      version: input.version,
      aggregate: input.aggregate,
      schema: input.schema,
      properties: input.busSchema ? input.busSchema : input.schema,
    }
  }

  export function run(..._args: any[]): void {
    throw new Error("SyncEvent.run() is not available in the Workers shim")
  }

  export function remove(..._args: any[]): void {
    throw new Error("SyncEvent.remove() is not available in the Workers shim")
  }
}
