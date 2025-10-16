import { ToolDefinition } from '../types';
import { ACIFunctionProvider } from '../../../services/aci/aci-provider';

interface ACIFunctionExecuteArgs {
  functionName: string;
  arguments: Record<string, any>;
}

interface ACIFunctionSearchArgs {
  intent?: string;
  limit?: number;
}

interface ACIFunctionGetDefinitionArgs {
  functionName: string;
}

/**
 * Execute an ACI.dev function
 */
export function createACIExecuteFunctionTool(aciProvider: ACIFunctionProvider | null): ToolDefinition<ACIFunctionExecuteArgs, any> {
  return {
    type: 'function',
    function: {
      name: 'aci_execute_function',
      description: 'Execute a function from the ACI.dev platform (web search, API calls, data processing, etc.)',
      parameters: {
        type: 'object',
        properties: {
          functionName: {
            type: 'string',
            description: 'The name of the ACI function to execute (e.g., "BRAVE_SEARCH__WEB_SEARCH")',
          },
          arguments: {
            type: 'object',
            description: 'Arguments to pass to the function',
          },
        },
        required: ['functionName', 'arguments'],
      },
    },
    implementation: async (args) => {
      if (!aciProvider) {
        throw new Error('ACI provider not available - check ACI_API_KEY configuration');
      }

      try {
        return await aciProvider.executeFunction(args.functionName, args.arguments);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`ACI function execution failed: ${errorMessage}`);
      }
    },
  };
}

/**
 * Search for ACI.dev functions
 */
export function createACISearchFunctionsTool(aciProvider: ACIFunctionProvider | null): ToolDefinition<ACIFunctionSearchArgs, any> {
  return {
    type: 'function',
    function: {
      name: 'aci_search_functions',
      description: 'Search for available functions in the ACI.dev platform based on intent',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            description: 'What you want to do (e.g., "search the web", "send email", "get weather")',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of functions to return (default: 10)',
            default: 10,
          },
        },
      },
    },
    implementation: async (args) => {
      if (!aciProvider) {
        return { functions: [], message: 'ACI provider not available' };
      }

      try {
        const functions = await aciProvider.getAvailableFunctions(args.intent);
        return {
          functions: functions.slice(0, args.limit || 10),
          total: functions.length,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          functions: [],
          error: `ACI function search failed: ${errorMessage}`,
        };
      }
    },
  };
}

/**
 * Get ACI function definition
 */
export function createACIGetFunctionDefinitionTool(aciProvider: ACIFunctionProvider | null): ToolDefinition<ACIFunctionGetDefinitionArgs, any> {
  return {
    type: 'function',
    function: {
      name: 'aci_get_function_definition',
      description: 'Get the detailed definition and parameters for a specific ACI function',
      parameters: {
        type: 'object',
        properties: {
          functionName: {
            type: 'string',
            description: 'The name of the ACI function to get definition for',
          },
        },
        required: ['functionName'],
      },
    },
    implementation: async (args) => {
      if (!aciProvider) {
        throw new Error('ACI provider not available');
      }

      try {
        const definition = await aciProvider.getFunctionDefinition(args.functionName);
        return definition;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to get ACI function definition: ${errorMessage}`);
      }
    },
  };
}
