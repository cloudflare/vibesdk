import type { ToolDefinition } from './types';
import { StructuredLogger } from '../../logger';
import { toolWebSearchDefinition } from './toolkit/web-search';
import { toolFeedbackDefinition } from './toolkit/feedback';
import { createQueueRequestTool } from './toolkit/queue-request';
import { createGetLogsTool } from './toolkit/get-logs';
import { createDeployPreviewTool } from './toolkit/deploy-preview';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

export async function executeToolWithDefinition<TArgs, TResult>(
    toolDef: ToolDefinition<TArgs, TResult>,
    args: TArgs
): Promise<TResult> {
    toolDef.onStart?.(args);
    const result = await toolDef.implementation(args);
    toolDef.onComplete?.(args, result);
    return result;
}

/**
 * Build all available tools for the agent
 * Add new tools here - they're automatically included in the conversation
 */
export function buildTools(
    agent: CodingAgentInterface,
    logger: StructuredLogger
): ToolDefinition<any, any>[] {
    return [
        toolWebSearchDefinition,
        toolFeedbackDefinition,
        createQueueRequestTool(agent, logger),
        createGetLogsTool(agent, logger),
        createDeployPreviewTool(agent, logger),
    ];
}
