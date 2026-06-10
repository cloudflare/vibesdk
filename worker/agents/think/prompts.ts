/**
 * File-based system prompts (`worker/agents/think/prompts/*.txt`). Each provider
 * family gets a tuned base prompt; `selectSystemPrompt()` chooses the right one
 * by model family so the Think agent uses the prompt tuned for that model.
 *
 * The `?raw` import suffix inlines each file as a string at build time (typed
 * via `vite/client`).
 */
import PROMPT_ANTHROPIC from './prompts/anthropic.txt?raw';
import PROMPT_DEFAULT from './prompts/default.txt?raw';
import PROMPT_BEAST from './prompts/beast.txt?raw';
import PROMPT_GEMINI from './prompts/gemini.txt?raw';
import PROMPT_GPT from './prompts/gpt.txt?raw';
import PROMPT_KIMI from './prompts/kimi.txt?raw';
import PROMPT_CODEX from './prompts/codex.txt?raw';
import PROMPT_TRINITY from './prompts/trinity.txt?raw';
// Injected as a final assistant message when the step budget is exhausted, to
// force a tool-free wrap-up (see max-steps.txt).
import PROMPT_MAX_STEPS from './prompts/max-steps.txt?raw';

export {
	PROMPT_ANTHROPIC,
	PROMPT_DEFAULT,
	PROMPT_BEAST,
	PROMPT_GEMINI,
	PROMPT_GPT,
	PROMPT_KIMI,
	PROMPT_CODEX,
	PROMPT_TRINITY,
	PROMPT_MAX_STEPS,
};

/**
 * Pick the base system prompt for a model id, by model family.
 * `modelId` may be a plain model name or a `provider/model` slug
 * (e.g. `google-ai-studio/gemini-3-flash-preview`).
 */
export function selectSystemPrompt(modelId: string): string {
	const id = modelId.toLowerCase();
	if (id.includes('gpt-4') || id.includes('o1') || id.includes('o3')) return PROMPT_BEAST;
	if (id.includes('gpt')) {
		if (id.includes('codex')) return PROMPT_CODEX;
		return PROMPT_GPT;
	}
	if (id.includes('gemini-') || id.includes('gemini/')) return PROMPT_GEMINI;
	if (id.includes('claude')) return PROMPT_ANTHROPIC;
	if (id.includes('trinity')) return PROMPT_TRINITY;
	if (id.includes('kimi')) return PROMPT_KIMI;
	return PROMPT_DEFAULT;
}
