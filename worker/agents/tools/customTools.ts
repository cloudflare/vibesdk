import type { ToolDefinition } from './types';
import { StructuredLogger } from '../../logger';
import { toolWebSearchDefinition } from './toolkit/web-search';
import { toolFeedbackDefinition } from './toolkit/feedback';
import { createQueueRequestTool } from './toolkit/queue-request';
import { createGetLogsTool } from './toolkit/get-logs';
import { createDeployPreviewTool } from './toolkit/deploy-preview';
import {
  createACIExecuteFunctionTool,
  createACISearchFunctionsTool,
  createACIGetFunctionDefinitionTool,
} from './toolkit/aci-functions';
import { ACIFunctionProvider } from '../../../src/services/aci-provider';
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
    logger: StructuredLogger,
    env?: Env
): ToolDefinition<any, any>[] {
    // Initialize ACI provider if API key is available
    let aciProvider: ACIFunctionProvider | null = null;
    if (env?.ACI_API_KEY) {
      try {
        aciProvider = new ACIFunctionProvider(
          env.ACI_API_KEY,
          env.ACI_API_URL,
          'Admin'
        );
        logger.info('ACI provider initialized successfully with Admin account');
      } catch (error) {
        logger.error('Failed to initialize ACI provider:', error);
      }
    } else {
      logger.info('ACI_API_KEY not found, ACI tools will not be available');
    }

    return [
        toolWebSearchDefinition,
        toolFeedbackDefinition,
        createQueueRequestTool(agent, logger),
        createGetLogsTool(agent, logger),
        createDeployPreviewTool(agent, logger),
        // ACI.dev tools
        createACIExecuteFunctionTool(aciProvider),
        createACISearchFunctionsTool(aciProvider),
        createACIGetFunctionDefinitionTool(aciProvider),
    ];
}
