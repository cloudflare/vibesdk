/**
 * Cloudflare Worker environment bindings.
 *
 * Secrets are set via `wrangler secret put <NAME>`.
 * Non-secret vars are defined in wrangler.toml [vars].
 */
export interface Env {
  // Durable Object bindings
  SESSION_DO: DurableObjectNamespace
  SPACE_DO: DurableObjectNamespace

  // Worker loader for deploy engine (Dynamic Workers)
  LOADER: WorkerLoader

  // AI binding (optional — for AI Gateway zero-config fallback)
  AI?: Ai

  // LLM provider API keys
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_API_KEY?: string

  // Cloudflare AI Gateway (matches upstream env var names)
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_GATEWAY_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CF_AIG_TOKEN?: string  // alias accepted by upstream

  // Server auth
  SERVER_PASSWORD?: string
  SERVER_USERNAME?: string

  // General
  ENVIRONMENT?: string
  OPENCODE_DIRECTORY?: string
}
