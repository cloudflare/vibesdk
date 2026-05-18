// Shim: upstream @/permission
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"

export namespace Permission {
  export const Action = z.enum(["allow", "deny", "ask"])
  export type Action = z.infer<typeof Action>

  export const Rule = z
    .object({
      permission: z.string(),
      pattern: z.string(),
      action: Action,
    })
  export type Rule = z.infer<typeof Rule>

  export const Ruleset = Rule.array()
  export type Ruleset = z.infer<typeof Ruleset>

  export function disabled(_tools: string[], ..._rulesets: Ruleset[]): Set<string> {
    return new Set()
  }

  export function merge(...rulesets: Ruleset[]): Ruleset {
    return rulesets.flat()
  }

  export function fromConfig(_cfg: Record<string, unknown>): Ruleset {
    return []
  }

  export function evaluate(_permission: string, _pattern: string, _ruleset: Ruleset) {
    return { action: "allow" as const }
  }

  export class RejectedError extends Error {
    constructor(message?: string) {
      super(message ?? "Permission rejected")
    }
  }

  export const Reply = z.enum(["allow", "deny"])

  export interface Interface {
    readonly ask: (input: any) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Permission") {}

  export const layer = Layer.succeed(Service, Service.of({
    ask: () => Effect.void,
  }))
}
