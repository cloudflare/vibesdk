// Shim: upstream @/provider/provider
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"
import { ModelID, ProviderID } from "./schema"
import { getLanguageModel } from "./registry"
import type { Env } from "../env"

let _env: Env | undefined
export function setProviderEnv(env: Env) { _env = env }

export namespace Provider {
  export const Model = z
    .object({
      id: ModelID.zod,
      providerID: ProviderID.zod,
      api: z.object({
        id: z.string(),
        url: z.string(),
        npm: z.string(),
      }),
      name: z.string(),
      family: z.string().optional(),
      capabilities: z.object({
        temperature: z.boolean(),
        reasoning: z.boolean(),
        attachment: z.boolean(),
        toolcall: z.boolean(),
        input: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        output: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        interleaved: z.union([
          z.boolean(),
          z.object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          }),
        ]),
      }),
      cost: z.object({
        input: z.number(),
        output: z.number(),
        cache: z.object({
          read: z.number(),
          write: z.number(),
        }),
        experimentalOver200K: z
          .object({
            input: z.number(),
            output: z.number(),
            cache: z.object({
              read: z.number(),
              write: z.number(),
            }),
          })
          .optional(),
      }),
      limit: z.object({
        context: z.number(),
        input: z.number().optional(),
        output: z.number(),
      }),
      status: z.enum(["alpha", "beta", "deprecated", "active"]),
      options: z.record(z.string(), z.any()),
      headers: z.record(z.string(), z.string()),
      release_date: z.string(),
      variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
    })
    
  export type Model = z.infer<typeof Model>

  export function parseModel(model: string) {
    const [providerID, ...rest] = model.split("/")
    return {
      providerID: ProviderID.make(providerID),
      modelID: ModelID.make(rest.join("/")),
    }
  }

  export class ModelNotFoundError {
    static isInstance(e: any) { return e?.name === "ModelNotFoundError" }
  }

  // Effect Service
  export interface Interface {
    readonly getModel: (providerID: any, modelID: any) => any
    readonly getSmallModel: (providerID: any) => any
    readonly getLanguage: (model: any) => any
    readonly getProvider: (providerID: any) => any
    readonly defaultModel: () => any
    readonly list: () => any
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Provider") {}

  const defaultCapabilities = {
    temperature: true, reasoning: false, attachment: true, toolcall: true,
    input: { text: true, audio: false, image: true, video: false, pdf: true },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  }

  function model(pid: string, mid: string): Model {
    return {
      id: ModelID.make(mid),
      providerID: ProviderID.make(pid),
      api: { id: mid, url: "", npm: `@ai-sdk/${pid}` },
      name: mid,
      capabilities: defaultCapabilities,
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 200000, output: 16384 },
      status: "active",
      options: {},
      headers: {},
      release_date: "2025-01-01",
    } as Model
  }

  export const defaultLayer = Layer.succeed(Service, Service.of({
    getModel: (pid: any, mid: any) => Effect.succeed(model(pid, mid)),
    getSmallModel: (pid: any) => Effect.succeed(model(pid, "claude-sonnet-4-20250514")),
    getLanguage: () => Effect.succeed(undefined),
    getProvider: (pid: any) => Effect.succeed({ id: pid, options: {} }),
    defaultModel: () => Effect.succeed({ providerID: "anthropic", modelID: "claude-sonnet-4-20250514" }),
    list: () => Effect.succeed({}),
  }))

  export async function getLanguage(model: any) {
    if (!_env) throw new Error("Provider env not set — DO must call setProviderEnv()")
    return getLanguageModel(model.providerID, model.api?.id ?? model.id, _env)
  }
  export async function getProvider(providerID: string) { return { id: providerID, options: {} } }
  export function sort(models: Model[]) { return models }
  export function fromModelsDevProvider(p: any) { return p }
}
