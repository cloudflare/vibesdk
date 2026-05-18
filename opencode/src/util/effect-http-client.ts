// Shim: @/util/effect-http-client
import { Effect } from "effect"
export const withTransientReadRetry = <T>(effect: Effect.Effect<T>) => effect
