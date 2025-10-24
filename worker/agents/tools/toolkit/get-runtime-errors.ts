import { ErrorResult, ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { RuntimeError } from 'worker/services/sandbox/sandboxTypes';

type GetRuntimeErrorsArgs = Record<string, never>;

type GetRuntimeErrorsResult = { errors: RuntimeError[] } | ErrorResult;

export function createGetRuntimeErrorsTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger
): ToolDefinition<GetRuntimeErrorsArgs, GetRuntimeErrorsResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'get_runtime_errors',
			description:
				`Fetch latest runtime errors from the sandbox error storage. These are errors captured by the runtime error detection system.

**IMPORTANT CHARACTERISTICS:**
- Runtime errors are USER-INTERACTION DRIVEN - they only appear when users interact with the app
- Errors may be a few seconds stale (not real-time)
- Errors persist in storage until explicitly cleared

**BEST PRACTICE WORKFLOW:**
1. Call this tool to see what runtime errors exist
2. If you make fixes and deploy changes (deploy_preview)
3. Use wait(20-30) to allow time for user interaction
4. Call get_runtime_errors again to verify errors are resolved

**When to use:**
- ✅ To see what runtime errors users have encountered
- ✅ After deploying fixes to verify issues are resolved
- ✅ To understand error patterns in the application

**When NOT to use:**
- ❌ Immediately after deploy (errors need user interaction to generate)
- ❌ In rapid succession (errors update on user interaction, not continuously)`,
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		implementation: async (_args?) => {
			try {
				logger.info('Fetching runtime errors from sandbox');
				
				const errors = await agent.fetchRuntimeErrors(true);
				
				return { 
					errors: errors || []
				};
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to get runtime errors: ${error.message}`
							: 'Unknown error occurred while fetching runtime errors',
				};
			}
		},
	};
}
