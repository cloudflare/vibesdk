import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createAiGateway } from "ai-gateway-provider"
import { createAnthropic as createAigAnthropic } from "ai-gateway-provider/providers/anthropic"
import { createOpenAI as createAigOpenAI } from "ai-gateway-provider/providers/openai"
import { createGoogleGenerativeAI as createAigGoogle } from "ai-gateway-provider/providers/google"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import type { Env } from "../env"

/**
 * Resolve the AI Gateway API token, matching upstream precedence:
 * CLOUDFLARE_API_TOKEN ?? CF_AIG_TOKEN
 */
function gatewayToken(env: Env): string | undefined {
  return env.CLOUDFLARE_API_TOKEN || env.CF_AIG_TOKEN
}

/**
 * True when all three gateway env vars are present.
 */
function hasGateway(env: Env): boolean {
  return !!(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_GATEWAY_ID && gatewayToken(env))
}

/**
 * True when the AI binding is available (zero-config gateway fallback).
 */
function hasAiBinding(env: Env): boolean {
  return !!env.AI
}

/**
 * Build a LanguageModelV3 instance from provider + model IDs.
 *
 * When Cloudflare AI Gateway credentials are set, requests are
 * transparently routed through the gateway (observability, caching,
 * rate-limiting) — no separate provider needed. Provider API keys
 * are optional in gateway mode (BYOK / stored keys handle auth).
 *
 * Without gateway creds, each provider requires its own API key.
 */
export async function getLanguageModel(
  providerId: string,
  modelId: string,
  env: Env,
): Promise<LanguageModelV3> {
  // ── 1. Gateway-routed path (per-provider SDKs with BYOK) ──────────
  if (hasGateway(env)) {
    const gw = createAiGateway({
      accountId: env.CLOUDFLARE_ACCOUNT_ID!,
      gateway: env.CLOUDFLARE_GATEWAY_ID!,
      apiKey: gatewayToken(env)!,
    })

    switch (providerId) {
      case "anthropic": {
        const sdk = createAigAnthropic()
        return gw(sdk(modelId)) as unknown as LanguageModelV3
      }
      case "openai": {
        const sdk = createAigOpenAI({
          apiKey: env.OPENAI_API_KEY || "CF_TEMP_TOKEN",
        })
        return gw(sdk.chat(modelId)) as unknown as LanguageModelV3
      }
      case "google": {
        const sdk = createAigGoogle({
          apiKey: env.GOOGLE_API_KEY || "CF_TEMP_TOKEN",
        })
        return gw(sdk(modelId)) as unknown as LanguageModelV3
      }
      default:
        throw new Error(`Unknown provider: ${providerId}`)
    }
  }

  // ── 2. Direct path (provider API keys) ────────────────────────────
  const directKey = providerKey(env, providerId)
  if (directKey) {
    switch (providerId) {
      case "anthropic":
        return createAnthropic({ apiKey: directKey })(modelId)
      case "openai":
        return createOpenAI({ apiKey: directKey })(modelId)
      case "google":
        return createGoogleGenerativeAI({ apiKey: directKey })(modelId)
      default:
        throw new Error(`Unknown provider: ${providerId}`)
    }
  }

  // ── 3. AI binding fallback (zero-config gateway) ──────────────────
  if (hasAiBinding(env)) {
    const gatewayId = env.CLOUDFLARE_GATEWAY_ID ?? "default"
    let baseURL: string
    try {
      baseURL = await env.AI!.gateway(gatewayId).getUrl(providerId)
    } catch (e) {
      throw new Error(
        `AI Gateway "${gatewayId}" error for ${providerId} — ` +
        `create the gateway in your CF dashboard or set a provider API key directly. ` +
        `Original: ${e instanceof Error ? e.message : e}`,
      )
    }
    // SDK providers validate apiKey even when baseURL points to the
    // gateway (which handles auth via BYOK). Pass the real key if
    // available, otherwise a placeholder to satisfy validation.
    const key = providerKey(env, providerId) ?? "sk-aig"
    switch (providerId) {
      case "anthropic":
        return createAnthropic({ baseURL, apiKey: key })(modelId)
      case "openai":
        return createOpenAI({ baseURL, apiKey: key })(modelId)
      case "google":
        return createGoogleGenerativeAI({ baseURL, apiKey: key })(modelId)
      default:
        throw new Error(`Unknown provider: ${providerId}`)
    }
  }

  throw new Error(`${providerId} not configured — set an API key or enable the [ai] binding`)
}

/**
 * Map internal provider IDs to AI Gateway unified endpoint provider names.
 */
function gatewayProviderName(providerId: string): string {
  switch (providerId) {
    case "google": return "google-ai-studio"
    case "amazon-bedrock": return "aws-bedrock"
    default: return providerId
  }
}

/**
 * Get the provider-specific API key, if set.
 */
function providerKey(env: Env, providerId: string): string | undefined {
  switch (providerId) {
    case "anthropic": return env.ANTHROPIC_API_KEY
    case "openai": return env.OPENAI_API_KEY
    case "google": return env.GOOGLE_API_KEY
    default: return undefined
  }
}

/**
 * List available providers based on which env keys are set.
 *
 * When AI Gateway is configured, all providers are marked as
 * configured — the gateway handles auth via stored keys (BYOK).
 */
export function listProviders(env: Env): Array<{ id: string; name: string; configured: boolean }> {
  const gw = hasGateway(env)
  const ai = hasAiBinding(env)
  return [
    { id: "anthropic", name: "Anthropic", configured: gw || ai || !!env.ANTHROPIC_API_KEY },
    { id: "openai", name: "OpenAI", configured: gw || ai || !!env.OPENAI_API_KEY },
    { id: "google", name: "Google", configured: gw || ai || !!env.GOOGLE_API_KEY },
  ]
}
