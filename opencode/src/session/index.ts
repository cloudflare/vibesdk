/**
 * Session module — Workers-compatible replacement for upstream session/index.ts.
 *
 * Provides the same exports that processor.ts and prompt.ts depend on:
 * - Session.Service (Effect service with updatePart/updatePartDelta/updateMessage/get/create/etc.)
 * - Session.Event (Bus event definitions)
 * - Session.Info (zod schema)
 * - Session.BusyError, Session.isDefaultTitle, Session.plan, Session.getUsage
 * - Session.defaultLayer, Session.layer
 *
 * Backed by a global store ref that the DO sets before calling SessionPrompt.prompt().
 * No drizzle, no Database.use().
 */
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"
import { Log } from "../util/log"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID, PartID } from "./schema"
import { Permission } from "../permission"
import { Instance } from "../project/instance"
import { NamedError } from "../vendor/named-error"
import { Snapshot } from "../snapshot"
import { Config } from "../config/config"
import { makeRuntime } from "../effect/run-service"
import { slug } from "../vendor/slug"

export namespace Session {
  const log = Log.create({ service: "session" })

  // ── Types ──

  export const Info = z.object({
    id: SessionID.zod,
    slug: z.string(),
    projectID: z.string(),
    workspaceID: z.string().optional(),
    directory: z.string(),
    path: z.string(),
    parentID: SessionID.zod.optional(),
    title: z.string(),
    version: z.string(),
    cost: z.number(),
    tokens: z.object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({ read: z.number(), write: z.number() }),
    }),
    summary: z.object({
      additions: z.number(),
      deletions: z.number(),
      files: z.number(),
      diffs: z.any().optional(),
    }).optional(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
      compacting: z.number().optional(),
      archived: z.number().optional(),
    }),
    permission: Permission.Ruleset.optional(),
    revert: z.object({
      messageID: MessageID.zod,
      partID: PartID.zod.optional(),
      snapshot: z.string().optional(),
      diff: z.string().optional(),
    }).optional(),
    share: z.object({ url: z.string() }).optional(),
    agent: z.string().optional(),
    model: z.object({ id: z.string(), providerID: z.string() }).optional(),
  })
  export type Info = z.infer<typeof Info>

  export class BusyError extends NamedError.create("SessionBusyError", { sessionID: z.string() }) {}
  export class NotFoundError extends NamedError.create("SessionNotFoundError", { message: z.string() }) {}

  export function isDefaultTitle(title: string) {
    return title.startsWith("New session - ") || title.startsWith("New Session")
  }

  export function plan(session: Info) {
    return `/workspace/.opencode/plans/${session.id}.md`
  }

  export function getUsage(input: { model: any; usage: any; metadata?: any }) {
    const u = input.usage || {}
    const tokens = {
      total: (u.totalTokens ?? u.inputTokens ?? 0) + (u.outputTokens ?? 0),
      input: u.inputTokens ?? u.promptTokens ?? 0,
      output: u.outputTokens ?? u.completionTokens ?? 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    }
    return { cost: 0, tokens }
  }

  // ── Events ──

  export const Event = {
    Created: BusEvent.define("session.created", z.object({ sessionID: SessionID.zod, info: Info })),
    Updated: BusEvent.define("session.updated", z.object({ sessionID: SessionID.zod, info: Info })),
    Deleted: BusEvent.define("session.deleted", z.object({ sessionID: SessionID.zod, info: Info })),
    Error: BusEvent.define("session.error", z.object({ sessionID: SessionID.zod.optional(), error: z.any().optional() })),
    Diff: BusEvent.define("session.diff", z.object({ sessionID: SessionID.zod, diff: z.array(z.any()) })),
  }

  // ── Global store ref (DO sets this) ──

  export interface Store {
    get(id: string): any
    list(): any[]
    create(input?: any): any
    storeMessage(msg: any): void
    getMessages(sessionId: string): any[]
    updateSession(id: string, patch: any): any
    upsertMessageInfo(info: any): void
    upsertPart(part: any): void
  }

  let _store: Store | undefined
  export function setStore(store: Store) { _store = store }
  function store(): Store {
    if (!_store) throw new Error("Session._store not set — DO must call Session.setStore() first")
    return _store
  }

  // ── Service ──

  export interface Interface {
    readonly create: (input?: any) => Effect.Effect<Info>
    readonly get: (sessionID: SessionID) => Effect.Effect<Info>
    readonly touch: (sessionID: SessionID) => Effect.Effect<void>
    readonly setTitle: (input: { sessionID: SessionID; title: string }) => Effect.Effect<void>
    readonly setPermission: (input: { sessionID: SessionID; permission: any }) => Effect.Effect<void>
    readonly setRevert: (input: any) => Effect.Effect<void>
    readonly clearRevert: (sessionID: SessionID) => Effect.Effect<void>
    readonly setSummary: (input: any) => Effect.Effect<void>
    readonly diff: (sessionID: SessionID) => Effect.Effect<any[]>
    readonly messages: (input: { sessionID: SessionID; limit?: number }) => Effect.Effect<any[]>
    readonly updateMessage: <T extends MessageV2.Info>(msg: T) => Effect.Effect<T>
    readonly updatePart: <T extends MessageV2.Part>(part: T) => Effect.Effect<T>
    readonly updatePartDelta: (input: { sessionID: SessionID; messageID: MessageID; partID: PartID; field: string; delta: string }) => Effect.Effect<void>
    readonly removePart: (input: any) => Effect.Effect<any>
    readonly removeMessage: (input: any) => Effect.Effect<void>
    readonly fork: (input: any) => Effect.Effect<Info>
    readonly remove: (sessionID: SessionID) => Effect.Effect<void>
    readonly initialize: (input: any) => Effect.Effect<void>
    readonly children: (parentID: SessionID) => Effect.Effect<Info[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Session") {}

  export const layer: Layer.Layer<Service, never, Bus.Service | Config.Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service

      const updateMessage = Effect.fn("Session.updateMessage")(function* <T extends MessageV2.Info>(msg: T) {
        store().upsertMessageInfo(msg)
        yield* bus.publish(MessageV2.Event.Updated, { sessionID: msg.sessionID, info: msg })
        return msg
      })

      const updatePart = Effect.fn("Session.updatePart")(function* <T extends MessageV2.Part>(part: T) {
        store().upsertPart(part)
        yield* bus.publish(MessageV2.Event.PartUpdated, { sessionID: part.sessionID, part, time: Date.now() })
        return part
      })

      const updatePartDelta = Effect.fn("Session.updatePartDelta")(function* (input: {
        sessionID: SessionID; messageID: MessageID; partID: PartID; field: string; delta: string
      }) {
        yield* bus.publish(MessageV2.Event.PartDelta, input)
      })

      const create = Effect.fn("Session.create")(function* (input?: any) {
        return store().create(input) as Info
      })

      const get = Effect.fn("Session.get")(function* (sessionID: SessionID) {
        const s = store().get(sessionID as string)
        if (!s) yield* Effect.fail(new NotFoundError({ message: `Session not found: ${sessionID}` }))
        return s as Info
      })

      return Service.of({
        create,
        get,
        touch: (_id) => Effect.void,
        setTitle: (input) => Effect.sync(() => store().updateSession(input.sessionID as string, { title: input.title })),
        setPermission: (input) => Effect.sync(() => store().updateSession(input.sessionID as string, { permission: input.permission })),
        setRevert: () => Effect.void,
        clearRevert: () => Effect.void,
        setSummary: () => Effect.void,
        diff: () => Effect.succeed([]),
        messages: (input) => Effect.succeed(store().getMessages(input.sessionID as string)),
        updateMessage,
        updatePart,
        updatePartDelta,
        removePart: () => Effect.succeed(undefined as any),
        removeMessage: () => Effect.void,
        fork: () => Effect.succeed(undefined as any),
        remove: () => Effect.void,
        initialize: () => Effect.void,
        children: () => Effect.succeed([]),
      })
    }),
  )

  export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Config.defaultLayer))

  const { runPromise } = makeRuntime(Service, defaultLayer)

  // ── Imperative API ──

  export async function create(input?: any) { return runPromise((svc) => svc.create(input)) }
  export async function get(id: string) { return runPromise((svc) => svc.get(SessionID.make(id))) }
  export async function touch(id: string) { return runPromise((svc) => svc.touch(SessionID.make(id))) }
  export async function messages(input: { sessionID: string; limit?: number }) {
    return runPromise((svc) => svc.messages({ sessionID: SessionID.make(input.sessionID), limit: input.limit }))
  }
  export async function updateMessage(msg: any) { return runPromise((svc) => svc.updateMessage(msg)) }
  export async function updatePart(part: any) { return runPromise((svc) => svc.updatePart(part)) }
  export async function updatePartDelta(input: any) { return runPromise((svc) => svc.updatePartDelta(input)) }
  export async function setTitle(input: any) { return runPromise((svc) => svc.setTitle(input)) }
  export async function diff(id: string) { return runPromise((svc) => svc.diff(SessionID.make(id))) }
}
