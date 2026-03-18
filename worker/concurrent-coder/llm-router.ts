/**
 * Provider-agnostic LLM router.
 *
 * Routes to any OpenAI-compatible endpoint configured via env vars.
 * Falls back to the Cloudflare AI binding when no external endpoint is set.
 * No hardcoded model names – everything comes from env.
 */

import type { LLMMessage, LLMRequestOptions, LLMResponse } from './types';

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Send a chat-completion request using the project's configured LLM.
 * Automatically selects DEFAULT_MODEL or COMPLEX_MODEL based on the
 * `model` field in `opts`, or falls back to DEFAULT_MODEL.
 */
export async function llmChat(
	env: Env,
	opts: LLMRequestOptions,
): Promise<LLMResponse> {
	const model = opts.model ?? env.DEFAULT_MODEL;
	const gatewayUrl = env.CLOUDFLARE_AI_GATEWAY_URL;

	// If an external OpenAI-compatible gateway URL is configured, use it.
	if (gatewayUrl) {
		return callOpenAICompatible(gatewayUrl, env.CLOUDFLARE_AI_GATEWAY_TOKEN, model, opts);
	}

	// Otherwise fall back to the Workers AI binding (env.AI).
	return callWorkersAI(env, model, opts);
}

/**
 * Convenience: simple single-prompt helper.
 */
export async function llmSimple(
	env: Env,
	systemPrompt: string,
	userPrompt: string,
	complex = false,
): Promise<string> {
	const res = await llmChat(env, {
		model: complex ? env.COMPLEX_MODEL : env.DEFAULT_MODEL,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
	});
	return res.content;
}

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible endpoint                                         */
/* ------------------------------------------------------------------ */

async function callOpenAICompatible(
	baseUrl: string,
	token: string,
	model: string,
	opts: LLMRequestOptions,
): Promise<LLMResponse> {
	const url = baseUrl.endsWith('/')
		? `${baseUrl}chat/completions`
		: `${baseUrl}/chat/completions`;

	const body: Record<string, unknown> = {
		model,
		messages: opts.messages,
	};
	if (opts.temperature !== undefined) body.temperature = opts.temperature;
	if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
	if (opts.responseFormat === 'json') {
		body.response_format = { type: 'json_object' };
	}

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`LLM request failed (${res.status}): ${text}`);
	}

	const json = (await res.json()) as {
		choices: { message: { content: string } }[];
		usage?: { prompt_tokens: number; completion_tokens: number };
	};

	return {
		content: json.choices[0]?.message?.content ?? '',
		usage: json.usage
			? {
					promptTokens: json.usage.prompt_tokens,
					completionTokens: json.usage.completion_tokens,
				}
			: undefined,
	};
}

/* ------------------------------------------------------------------ */
/*  Workers AI binding fallback                                        */
/* ------------------------------------------------------------------ */

async function callWorkersAI(
	env: Env,
	model: string,
	opts: LLMRequestOptions,
): Promise<LLMResponse> {
	const messages = opts.messages.map((m: LLMMessage) => ({
		role: m.role,
		content: m.content,
	}));

	const result = (await env.AI.run(model as Parameters<Ai['run']>[0], {
		messages,
	})) as { response?: string };

	return {
		content: typeof result === 'string' ? result : (result.response ?? ''),
	};
}
