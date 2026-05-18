// Shim: @/question
import { NamedError } from "../vendor/named-error"
import { Effect, Layer, ServiceMap } from "effect"

export namespace Question {
  export class RejectedError extends NamedError.create("QuestionRejectedError") {}

  export interface Interface {
    readonly ask: (input: any) => Effect.Effect<any>
    readonly list: () => Effect.Effect<any[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Question") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    ask: () => Effect.void,
    list: () => Effect.succeed([]),
  }))
}
