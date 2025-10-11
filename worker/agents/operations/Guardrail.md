import { GuardRailsOutputType, GuardRailsOutput } from '../schemas';
import { GenerationContext } from '../domain/values/GenerationContext';
import { IssueReport } from '../domain/values/IssueReport';
import { createSystemMessage, createUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { generalSystemPromptBuilder, issuesPromptFormatter, PROMPT_UTILS } from '../prompts';
import { TemplateRegistry } from '../inferutils/schemaFormatters';
import { z } from 'zod';
import { AgentOperation, OperationOptions } from './common';

export interface GuardRailsInput {
    userInput: string;
}

const SYSTEM_PROMPT = ``;

const USER_PROMPT = ``;

const userPromptFormatter = (issues: IssueReport, context: string) => {
    const prompt = USER_PROMPT
        .replaceAll('{{issues}}', issuesPromptFormatter(issues))
        .replaceAll('{{context}}', context);
    return PROMPT_UTILS.verifyPrompt(prompt);
}

export class GuardRailsOperation extends AgentOperation<GuardRailsInput, GuardRailsOutputType> {
    async execute(
        inputs: GuardRailsInput,
        options: OperationOptions
    ): Promise<GuardRailsOutputType> {
        const { userInput } = inputs;
        const { env, logger, context } = options;
        try {
            const { object: reviewResult } = await executeInference({
                env: env,
                messages,
                schema: CodeReviewOutput,
                agentActionName: "codeReview",
                context: options.inferenceContext,
                reasoning_effort: issues.runtimeErrors.length || issues.staticAnalysis.lint.issues.length || issues.staticAnalysis.typecheck.issues.length > 0 ? undefined : 'low',
                // format: 'markdown'
            });

            if (!reviewResult) {
                throw new Error("Failed to get code review result");
            }
            return reviewResult;
        } catch (error) {
            logger.error("Error during code review:", error);
            throw error;
        }
    }
}