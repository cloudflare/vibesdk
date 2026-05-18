import type { Model } from "../upstream-types"

const MODELS_DEV_URL = "https://models.dev/api.json"
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

let cached: Record<string, Model[]> | undefined
let cachedAt = 0

/**
 * Supported provider IDs we can actually route requests to.
 */
const SUPPORTED = new Set(["anthropic", "openai", "google"])

/**
 * Provider SDK metadata for the `api` field.
 */
const PROVIDER_API: Record<string, { url: string; npm: string }> = {
  anthropic: { url: "https://api.anthropic.com/v1", npm: "@ai-sdk/anthropic" },
  openai: { url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" },
  google: { url: "https://generativelanguage.googleapis.com/v1beta", npm: "@ai-sdk/google" },
}

/**
 * Provider env var names.
 */
export const PROVIDER_ENV: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY"],
}

/**
 * Convert raw models.dev data into upstream-compatible Model shape.
 */
interface RawModel {
  id: string
  name: string
  family?: string
  reasoning?: boolean
  attachment?: boolean
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
  limit: { context: number; output: number }
  modalities?: { input?: string[]; output?: string[] }
  release_date?: string
  variants?: Record<string, Record<string, unknown>>
}

function toModel(pid: string, m: RawModel): Model {
  const api = PROVIDER_API[pid] || { url: "", npm: "" }
  const inp = m.modalities?.input || ["text"]
  const out = m.modalities?.output || ["text"]
  return {
    id: m.id,
    providerID: pid,
    name: m.name,
    family: m.family,
    api: { id: m.id, url: api.url, npm: api.npm },
    status: "active",
    headers: {},
    options: {},
    cost: {
      input: m.cost?.input ?? 0,
      output: m.cost?.output ?? 0,
      cache: { read: m.cost?.cache_read ?? 0, write: m.cost?.cache_write ?? 0 },
    },
    limit: { context: m.limit.context, output: m.limit.output },
    capabilities: {
      temperature: true,
      reasoning: !!m.reasoning,
      attachment: !!m.attachment,
      toolcall: true,
      input: { text: inp.includes("text"), audio: inp.includes("audio"), image: inp.includes("image"), video: inp.includes("video"), pdf: inp.includes("pdf") },
      output: { text: out.includes("text"), audio: out.includes("audio"), image: out.includes("image"), video: out.includes("video"), pdf: out.includes("pdf") },
      interleaved: false,
    },
    release_date: m.release_date || "",
    variants: m.variants,
  }
}

/**
 * Fetch models from models.dev and parse into Model shape.
 */
async function fetchModels(): Promise<Record<string, Model[]> | undefined> {
  try {
    const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined
    const data = await res.json() as Record<string, {
      id: string
      name: string
      models: Record<string, RawModel>
    }>
    const result: Record<string, Model[]> = {}
    for (const [pid, provider] of Object.entries(data)) {
      if (!SUPPORTED.has(pid)) continue
      result[pid] = Object.values(provider.models).map((m) => toModel(pid, m))
    }
    return result
  } catch {
    return undefined
  }
}

/**
 * Get models for a provider. Tries cached models.dev data first,
 * falls back to static PROVIDER_MODELS.
 */
export async function getModels(pid: string): Promise<Record<string, Model>> {
  if (!cached || Date.now() - cachedAt > CACHE_TTL) {
    const fresh = await fetchModels()
    if (fresh) {
      cached = fresh
      cachedAt = Date.now()
    }
  }
  const list = cached?.[pid] ?? PROVIDER_MODELS[pid] ?? []
  const models: Record<string, Model> = {}
  for (const m of list) models[m.id] = m
  return models
}

/**
 * Static model catalog (fallback when models.dev fails).
 */
export const PROVIDER_MODELS: Record<string, Model[]> = {
  anthropic: [
    toModel("anthropic", { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", reasoning: true, attachment: true, cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 }, limit: { context: 200000, output: 16000 } }),
    toModel("anthropic", { id: "claude-opus-4-20250514", name: "Claude Opus 4", reasoning: true, attachment: true, cost: { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 }, limit: { context: 200000, output: 32000 } }),
    toModel("anthropic", { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", attachment: true, cost: { input: 0.8, output: 4, cache_read: 0.08, cache_write: 1 }, limit: { context: 200000, output: 8192 } }),
  ],
  openai: [
    toModel("openai", { id: "gpt-4o", name: "GPT-4o", attachment: true, cost: { input: 2.5, output: 10 }, limit: { context: 128000, output: 16384 } }),
    toModel("openai", { id: "gpt-4o-mini", name: "GPT-4o Mini", attachment: true, cost: { input: 0.15, output: 0.6 }, limit: { context: 128000, output: 16384 } }),
    toModel("openai", { id: "o3", name: "o3", reasoning: true, cost: { input: 2, output: 8 }, limit: { context: 200000, output: 100000 } }),
  ],
  google: [
    toModel("google", { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", reasoning: true, attachment: true, cost: { input: 1.25, output: 10, cache_read: 0.31 }, limit: { context: 1048576, output: 65536 } }),
    toModel("google", { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", reasoning: true, attachment: true, cost: { input: 0.15, output: 0.6, cache_read: 0.03 }, limit: { context: 1048576, output: 65536 } }),
  ],
}

export function buildModels(pid: string): Record<string, Model> {
  const models: Record<string, Model> = {}
  for (const m of (PROVIDER_MODELS[pid] ?? [])) models[m.id] = m
  return models
}

/**
 * Reset the models.dev cache (for testing).
 */
export function resetModelsCache() {
  cached = undefined
  cachedAt = 0
}
