/**
 * Cloudflare Worker environment bindings.
 *
 * Secrets are set via `wrangler secret put <NAME>`.
 * Non-secret vars are defined in wrangler.toml [vars].
 */
export interface Env {
  // Durable Object bindings
  SPACE_DO: DurableObjectNamespace
  /**
   * VibeSDK agent DO. Optional — the host worker may or may not provide
   * this — but when present, the `get_browser_console_logs` tool routes
   * RPC calls through it to reuse the agent's capture pipeline.
   *
   * Typed as a loose namespace so TS doesn't complain about the
   * concrete `CodeGeneratorAgent` class shape from VibeSDK (which
   * lives outside this workspace). The tool casts at the call site
   * with the expected method signature.
   */
  CodeGenObject?: DurableObjectNamespace

  // Worker loader for deploy engine (Dynamic Workers). Typed by
  // @cloudflare/workers-types — supports `env` field for injected
  // bindings and `getDurableObjectClass(name)` on the returned stub.
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
}
