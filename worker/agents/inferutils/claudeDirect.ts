/**
 * claudeDirect — edge-safe Anthropic API bridge for sub-agents.
 *
 * Why this exists (temporary):
 *   The full inference stack in `core.ts` + `infer.ts` is routed through the
 *   project's multi-provider gateway (Gemini-primary). Wiring sub-agents to
 *   that stack correctly needs prompt-chain work. For functional E2E testing
 *   NOW, each sub-agent calls Claude Sonnet directly via this helper using
 *   `ANTHROPIC_API_KEY` already present in Cloudflare.Env.
 *
 * Migration path:
 *   When prompt schemas are finalized, replace `callClaudeDirect()` calls
 *   inside each sub-agent with `executeInference()` routed via modelRouter.
 *   The RPC contracts + AgentRunResult shape don't change — only the body
 *   of `generateRawPlan()`, `generatePatches()`, etc.
 *
 * This file is intentionally minimal — no SDK dep, no streaming (sub-agents
 * are short-lived RPC calls), no retry/backoff (handled by Workers runtime
 * + caller abort). Production-wired inference goes through `core.ts`.
 */

import { createLogger } from '../../logger';

const logger = createLogger('claudeDirect');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type ClaudeModel =
    // Current generation (as of May 2026 — run023 research)
    | 'claude-sonnet-4-6'          // GA: 1M ctx, adaptive thinking, same price as 4.5 — DEFAULT
    | 'claude-opus-4-7'            // GA: 1M ctx, 128k out, best agentic coding — Critic Team+ tier ($5/$25 per MTok, NOT $15/$75 — that was Opus 4.1)
    | 'claude-haiku-4-5'           // GA: fastest, Flash-Lite equivalent — Tester lite tier
    // Legacy (still available, kept for regression-safety pinning)
    | 'claude-sonnet-4-5'          // legacy: 200k ctx (use 4.6 for new code)
    | 'claude-sonnet-4-5-20250929' // pinned snapshot — regression-safety only
    | 'claude-opus-4-5'            // legacy Opus — use 4.7 for new code
    // Future: uncomment when released (window closed ~May 14; recheck cycle 15 — run055)
    // | 'claude-sonnet-4-8'       // NOT YET RELEASED — cadence window closed, likely bundled launch; monitor Anthropic API
    ;

// S10 → S11 upgrade: claude-sonnet-4-5 → claude-sonnet-4-6
// Gains: 1M context window (vs 200k), adaptive thinking, same pricing.
// Upgrade to claude-sonnet-4-8 immediately when it becomes available.
export const CLAUDE_DEFAULT_MODEL: ClaudeModel = 'claude-sonnet-4-6';

// Premium model for Critic (Team+) and future Opus-tier operations.
// claude-opus-4-7: step-change agentic coding, 128k output, 1M context.
// Pricing: $5/$25 per MTok in/out (DEC-055-B correction — NOT $15/$75 which was Opus 4.1).
export const CLAUDE_PREMIUM_MODEL: ClaudeModel = 'claude-opus-4-7';

export interface ClaudeMessage {
    readonly role: 'user' | 'assistant';
    readonly content: string;
}

export interface ClaudeCallArgs {
    readonly env: { readonly ANTHROPIC_API_KEY?: string };
    readonly model?: ClaudeModel;
    readonly system?: string;
    readonly messages: readonly ClaudeMessage[];
    readonly maxTokens?: number;
    readonly temperature?: number;
    readonly abortSignal?: AbortSignal;
    /**
     * Opus 4.7 Fast Mode (beta — waitlist-gated, 6× pricing, 2.5× OTPS).
     * Supported models: claude-opus-4-7, claude-opus-4-6.
     * Requires ANTHROPIC_FAST_MODE_ACCESS=true in env or a feature flag.
     * Beta header: fast-mode-2026-02-01 | body param: speed: "fast"
     */
    readonly speedMode?: 'fast' | 'standard';
}

export interface ClaudeCallResult {
    readonly text: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | string;
    readonly model: string;
    readonly elapsedMs: number;
    /** Present when speed: "fast" was requested — confirms which speed was served. */
    readonly speed?: 'fast' | 'standard';
}

export class ClaudeDirectError extends Error {
    constructor(
        public readonly status: number,
        public readonly body: string,
    ) {
        super(`Claude API ${status}: ${body.slice(0, 200)}`);
        this.name = 'ClaudeDirectError';
    }
}

const FAST_MODE_BETA_HEADER = 'fast-mode-2026-02-01';
// Opus models that support the fast-mode beta. Sending speed:"fast" with other models returns a 400.
const FAST_MODE_SUPPORTED_MODELS: ReadonlySet<ClaudeModel> = new Set(['claude-opus-4-7']);

interface AnthropicResponseShape {
    readonly content: readonly { readonly type: string; readonly text?: string }[];
    readonly stop_reason: string;
    readonly usage: { readonly input_tokens: number; readonly output_tokens: number; readonly speed?: 'fast' | 'standard' };
    readonly model: string;
}

/**
 * Fire a single-turn Claude call. Returns the concatenated assistant text
 * + usage counters. Never throws for non-OK HTTP — wraps in ClaudeDirectError
 * so the caller can mark the agent `failed` cleanly.
 *
 * Caller responsibilities:
 *   - Check `env.ANTHROPIC_API_KEY` is set (throws if missing — hard fail is correct)
 *   - Provide an abortSignal when TeamLead wants cooperative cancellation
 *   - Count tokens against agent_budgets after success
 */
export async function callClaudeDirect(args: ClaudeCallArgs): Promise<ClaudeCallResult> {
    if (!args.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY missing on Env — cannot call Claude direct');
    }
    if (args.messages.length === 0) {
        throw new Error('At least one message is required');
    }

    const start = Date.now();
    const model = args.model ?? CLAUDE_DEFAULT_MODEL;

    // Fast mode (Opus 4.7 only, waitlist-gated beta). Logs a warning if requested
    // for an unsupported model so misconfigurations surface immediately.
    const useFastMode = args.speedMode === 'fast';
    if (useFastMode && !FAST_MODE_SUPPORTED_MODELS.has(model as ClaudeModel)) {
        logger.warn('fast mode requested for unsupported model — falling back to standard', { model });
    }
    const fastModeActive = useFastMode && FAST_MODE_SUPPORTED_MODELS.has(model as ClaudeModel);

    const headers: Record<string, string> = {
        'x-api-key': args.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
    };
    if (fastModeActive) {
        headers['anthropic-beta'] = FAST_MODE_BETA_HEADER;
    }

    const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            max_tokens: args.maxTokens ?? 4096,
            temperature: args.temperature ?? 0.7,
            system: args.system,
            messages: args.messages,
            ...(fastModeActive ? { speed: 'fast' } : {}),
        }),
        signal: args.abortSignal,
    });

    const rawBody = await res.text();
    if (!res.ok) {
        logger.warn('Claude non-OK', { status: res.status, body: rawBody.slice(0, 300) });
        throw new ClaudeDirectError(res.status, rawBody);
    }

    const parsed = JSON.parse(rawBody) as AnthropicResponseShape;
    const text = parsed.content
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text ?? '')
        .join('\n');

    return {
        text,
        inputTokens: parsed.usage.input_tokens,
        outputTokens: parsed.usage.output_tokens,
        stopReason: parsed.stop_reason,
        model: parsed.model,
        elapsedMs: Date.now() - start,
        speed: parsed.usage.speed,
    };
}

/**
 * Convenience helper — wraps `callClaudeDirect` with a JSON-output discipline.
 * The system prompt asks Claude to return ONLY JSON; the response is parsed and
 * returned typed. Falls back to throwing on parse failure (caller marks failed).
 */
export async function callClaudeForJson<T>(
    args: ClaudeCallArgs & { readonly jsonSchemaDescription: string },
): Promise<{ readonly value: T; readonly usage: Pick<ClaudeCallResult, 'inputTokens' | 'outputTokens' | 'elapsedMs'> }> {
    const system = [
        args.system ?? '',
        `Respond with ONLY a single JSON object matching this shape: ${args.jsonSchemaDescription}`,
        'Do NOT wrap in markdown code fences. Do NOT include any text before or after the JSON.',
    ].filter(Boolean).join('\n\n');

    const result = await callClaudeDirect({ ...args, system });

    // Tolerant parse: strip ```json fences if the model ignored instructions.
    const cleaned = result.text
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();

    let parsed: T;
    try {
        parsed = JSON.parse(cleaned) as T;
    } catch (err) {
        logger.error('Claude JSON parse failed', {
            sample: cleaned.slice(0, 200),
            error: err instanceof Error ? err.message : String(err),
        });
        throw new Error(`Claude response was not valid JSON: ${cleaned.slice(0, 100)}`);
    }

    return {
        value: parsed,
        usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            elapsedMs: result.elapsedMs,
        },
    };
}
