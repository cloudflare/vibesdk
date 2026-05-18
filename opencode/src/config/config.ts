// Shim: @/config/config
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"

export namespace Config {
  export const Info = z.object({
    $schema: z.string().optional(),
    agent: z.record(z.string(), z.any()).optional(),
    mode: z.record(z.string(), z.any()).optional(),
    plugin: z.array(z.any()).optional(),
    command: z.record(z.string(), z.any()).optional(),
    provider: z.record(z.string(), z.any()).optional(),
    mcp: z.record(z.string(), z.any()).optional(),
    permission: z.any().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    username: z.string().optional(),
    disabled_providers: z.array(z.string()).optional(),
    enabled_providers: z.array(z.string()).optional(),
    model: z.string().optional(),
    small_model: z.string().optional(),
    default_agent: z.string().optional(),
    instructions: z.array(z.string()).optional(),
    experimental: z.any().optional(),
    compaction: z.any().optional(),
  })
  export type Info = z.infer<typeof Info>

  const DEFAULT: Info = {
    $schema: "https://opencode.ai/config.json",
    agent: {},
    mode: {},
    plugin: [],
    command: {},
  }

  export interface Interface {
    readonly get: () => Effect.Effect<Info>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Config") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    get: Effect.fn("Config.get")(function* () { return DEFAULT }),
  }))

  export async function get(): Promise<Info> { return DEFAULT }
  export async function getGlobal(): Promise<Info> { return { $schema: "https://opencode.ai/config.json" } }
  export async function invalidate(_reload?: boolean) {}
}
