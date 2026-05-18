// Shim: upstream @/agent/agent
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"
import { Permission } from "../permission"
import { ModelID, ProviderID } from "../provider/schema"

export namespace Agent {
  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      permission: Permission.Ruleset,
      model: z
        .object({
          modelID: ModelID.zod,
          providerID: ProviderID.zod,
        })
        .optional(),
      variant: z.string().optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()),
      steps: z.number().int().positive().optional(),
    })
    
  export type Info = z.infer<typeof Info>

  export interface Interface {
    readonly get: (agent: string) => any
    readonly list: () => any
    readonly defaultAgent: () => any
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Agent") {}

  const agents: Info[] = [
    { name: "build", description: "The default agent.", mode: "primary", native: true, options: {}, permission: [{ permission: "*", action: "allow", pattern: "*" }] },
    { name: "plan", description: "Plan mode.", mode: "primary", native: true, options: {}, permission: [] },
    { name: "title", mode: "primary", native: true, hidden: true, temperature: 0.5, options: {}, permission: [] },
    { name: "summary", mode: "primary", native: true, hidden: true, options: {}, permission: [] },
    { name: "compaction", mode: "primary", native: true, hidden: true, options: {}, permission: [] },
    { name: "explore", description: "Fast codebase explorer.", mode: "subagent", native: true, options: {}, permission: [] },
    { name: "general", description: "General-purpose agent.", mode: "subagent", native: true, options: {}, permission: [] },
  ] as Info[]

  export const defaultLayer = Layer.succeed(Service, Service.of({
    get: (name: string) => Effect.succeed(agents.find(a => a.name === name) || agents[0]),
    list: () => Effect.succeed(agents),
    defaultAgent: () => Effect.succeed("build"),
  }))

  export async function list() { return agents }
  export async function get(name: string) { return agents.find(a => a.name === name) || agents[0] }
}
