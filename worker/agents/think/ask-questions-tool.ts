/**
 * `ask_questions` — lets the Think agent ask the user one or more clarifying
 * questions before it continues building. The tool itself is a no-op inside the
 * ThinkAgent DO: it echoes the questions back as JSON. The host behavior
 * (`ThinkCodingBehavior.translateChunk`) observes the tool output on the same
 * streaming channel used by `set_title` and `deploy_space`, and broadcasts it to
 * the frontend as a `conversation_response.tool` event. The frontend renders a
 * popup; the user's answers come back as the next user message.
 *
 * This tool is only registered for the Think agent.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

const DESCRIPTION = [
	'Ask the user one or more clarifying questions when the request is underspecified or ambiguous.',
	'',
	'Each question can provide predefined answer options, allow multiple selections, and/or allow a free-text custom answer. The user can also skip the popup entirely.',
	'',
	'Call this tool once with all the questions you need answered, then end your turn and wait for the user. Do not write or edit files until the scope is clear or the user tells you to proceed with your assumptions.',
].join('\n');

export type ClarifyingQuestion = {
	question: string;
	options?: string[];
	allow_multiple?: boolean;
	allow_custom?: boolean;
};

export function createAskQuestionsTool(): Tool {
	return tool({
		description: DESCRIPTION,
		inputSchema: z.object({
			questions: z
				.array(
					z.object({
						question: z.string().describe('The clarifying question to ask the user.'),
						options: z
							.array(z.string())
							.optional()
							.describe('Predefined answer options the user can choose from.'),
						allow_multiple: z
							.boolean()
							.optional()
							.describe('When true, the user may select more than one predefined option.'),
						allow_custom: z
							.boolean()
							.optional()
							.describe('When true, the user may enter a free-text answer not in options.'),
					}),
				)
				.describe('One or more clarifying questions to present to the user.'),
		}),
		execute: async (args: { questions: ClarifyingQuestion[] }) => {
			const questions = Array.isArray(args.questions) ? args.questions : [];
			return JSON.stringify({ ok: true, questions });
		},
	});
}
