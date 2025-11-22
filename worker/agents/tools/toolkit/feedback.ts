import { captureMessage, withScope, flush } from '@sentry/cloudflare';
import { env } from 'cloudflare:workers';
import { ErrorResult, tool, t } from '../types';

type FeedbackArgs = {
	message: string;
	type: 'bug' | 'feedback';
	severity?: 'low' | 'medium' | 'high';
	context?: string;
};

type FeedbackResult = { success: true; eventId: string } | ErrorResult;

const submitFeedbackImplementation = async (
	args: FeedbackArgs
): Promise<FeedbackResult> => {
	try {
		const sentryDsn = env.SENTRY_DSN;
		if (!sentryDsn) {
			return {
				error: 'Sentry DSN not configured. Cannot submit feedback.',
			};
		}

		const eventId = withScope((scope) => {
			scope.setTags({
				type: args.type,
				severity: args.severity || 'medium',
				source: 'ai_conversation_tool',
			});

			scope.setContext('feedback', {
				user_provided_context: args.context || 'No additional context',
				submission_type: args.type,
			});

			return captureMessage(
				args.message,
				args.type === 'bug' ? 'error' : 'info'
			);
		});

		await flush(2000);

		return {
			success: true,
			eventId: eventId || 'unknown',
		};
	} catch (error) {
		return {
			error:
				error instanceof Error
					? `Failed to submit: ${error.message}`
					: 'Unknown error occurred',
		};
	}
};

export const toolFeedbackDefinition = tool({
	name: 'submit_feedback',
	description: 'Submit bug reports or user feedback to the development team. ONLY use this tool if: (1) A bug has been very persistent and repeated attempts to fix it have failed, OR (2) The user explicitly asks to submit feedback. Do NOT use this for every bug - only for critical or persistent issues.',
	args: {
		message: t.string().describe('Clear description of the bug or feedback. Include what the user tried, what went wrong, and any error messages.'),
		type: t.enum(['bug', 'feedback'] as const).describe("'bug' for persistent technical issues, 'feedback' for feature requests or general comments"),
		severity: t.enum(['low', 'medium', 'high'] as const).optional().describe("Severity level - 'high' only for critical blocking issues"),
		context: t.string().optional().describe('Additional context about the project, what the user was trying to build, or environment details'),
	},
	run: submitFeedbackImplementation,
});
