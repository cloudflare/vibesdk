import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { WebSocketMessageResponses } from '../../constants';
import { IdGenerator } from '../../utils/idGenerator';

type PreflightQuestionResult = {
	questionAsked: string;
	questionsAskedSoFar: number;
	message: string;
};

export function createAskPreflightQuestionTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'ask_preflight_question',
		description:
			'Ask the user a single clarifying question before starting project generation. The question will be sent to the user and the system will wait for their answer. Only call this tool once per turn — after calling it, stop and wait for the user to respond.',
		args: {
			question: t.string().describe('The question to ask the user. Be specific and concise.'),
		},
		run: async ({ question }): Promise<PreflightQuestionResult> => {
			const currentState = agent.getPreflightState() ?? { questionsAsked: 0, isWaitingForAnswer: false };

			agent.updatePreflightState({
				questionsAsked: currentState.questionsAsked + 1,
				isWaitingForAnswer: true,
			});

			const conversationId = IdGenerator.generateConversationId();

			agent.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE as 'conversation_response', {
				message: question,
				conversationId,
				isStreaming: false,
			});

			agent.addConversationMessage({
				role: 'assistant',
				content: question,
				conversationId,
			});

			logger.info('Preflight question asked', {
				question,
				questionsAskedSoFar: currentState.questionsAsked + 1,
			});

			return {
				questionAsked: question,
				questionsAskedSoFar: currentState.questionsAsked + 1,
				message: `Question sent to user. Wait for their response before continuing.`,
			};
		},
	});
}
