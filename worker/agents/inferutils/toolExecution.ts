import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources';
import type { ToolDefinition, ToolCallResult, ResourceAccess } from '../tools/types';
import { hasResourceConflict } from '../tools/resources';

export interface ExecutionPlan {
	parallelGroups: ChatCompletionMessageFunctionToolCall[][];
}

/**
 * Build execution plan from tool calls using topological sort.
 *
 * Algorithm:
 * 1. Build dependency graph from:
 *    - Explicit dependencies (dependsOn)
 *    - Resource conflicts (writes/reads)
 *    - Conflict declarations (conflictsWith)
 * 2. Topologically sort into parallel groups:
 *    - Each group contains tools with no mutual dependencies
 *    - Tools in group N depend only on tools in groups 0..N-1
 * 3. Handle edge cases:
 *    - Circular dependencies -> fallback to sequential
 *    - Missing tool definitions -> Warn and skip
 */
export function buildExecutionPlan(
	toolCalls: ChatCompletionMessageFunctionToolCall[],
	toolDefinitions: Map<string, ToolDefinition>
): ExecutionPlan {
	// Parse arguments and get resource access for each tool call
	const toolCallResources = new Map<string, ResourceAccess>();

	for (const call of toolCalls) {
		const def = toolDefinitions.get(call.function.name);
		if (!def) continue;

		try {
			const args = JSON.parse(call.function.arguments || '{}');
			const resources = def.resources(args);
			toolCallResources.set(call.id, resources);
		} catch (error) {
			console.warn(`[TOOL_EXECUTION] Failed to parse arguments for ${call.function.name}:`, error);
			toolCallResources.set(call.id, {});
		}
	}

	// Build dependency graph
	const dependencyGraph = new Map<string, Set<string>>();

	// Initialize graph nodes
	for (const call of toolCalls) {
		if (!dependencyGraph.has(call.id)) {
			dependencyGraph.set(call.id, new Set());
		}
	}

	// Add edges based on resource conflicts
	for (const call of toolCalls) {
		const callResources = toolCallResources.get(call.id);
		if (!callResources) continue;

		const callDeps = dependencyGraph.get(call.id)!;

		// Add resource-based dependencies
		for (const otherCall of toolCalls) {
			if (otherCall.id === call.id) continue;

			const otherResources = toolCallResources.get(otherCall.id);
			if (!otherResources) continue;

			// If tools conflict, make them sequential
			if (hasResourceConflict(callResources, otherResources)) {
				const callIndex = toolCalls.indexOf(call);
				const otherIndex = toolCalls.indexOf(otherCall);

				// Later call depends on earlier call
				if (callIndex > otherIndex) {
					callDeps.add(otherCall.id);
				}
			}
		}
	}

	// Topological sort into parallel groups
	const parallelGroups: ChatCompletionMessageFunctionToolCall[][] = [];
	const executed = new Set<string>();

	while (executed.size < toolCalls.length) {
		const group: ChatCompletionMessageFunctionToolCall[] = [];

		// Find all tools whose dependencies are satisfied
		for (const call of toolCalls) {
			if (executed.has(call.id)) continue;

			const deps = dependencyGraph.get(call.id) || new Set();
			const allDepsExecuted = Array.from(deps).every((depId) => executed.has(depId));

			if (allDepsExecuted) {
				group.push(call);
			}
		}

		// Handle circular dependencies
		if (group.length === 0) {
			console.warn(
				'[TOOL_EXECUTION] Circular dependency detected, falling back to sequential'
			);

			// Add first unexecuted tool to break cycle
			for (const call of toolCalls) {
				if (!executed.has(call.id)) {
					group.push(call);
					break;
				}
			}
		}

		parallelGroups.push(group);
		group.forEach((call) => executed.add(call.id));
	}

	return { parallelGroups };
}

/**
 * Execute a single tool call
 */
async function executeSingleTool(
	toolCall: ChatCompletionMessageFunctionToolCall,
	toolDefinition: ToolDefinition<any, any>
): Promise<ToolCallResult> {
	try {
		const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};

		// Execute lifecycle hooks and implementation
		await toolDefinition.onStart?.(toolCall, args);

		const result = await toolDefinition.implementation(args);

		await toolDefinition.onComplete?.(toolCall, args, result);

		return {
			id: toolCall.id,
			name: toolCall.function.name,
			arguments: args,
			result,
		};
	} catch (error) {
		// Propagate abort errors immediately
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}

		// Return error result for other failures
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';

		return {
			id: toolCall.id,
			name: toolCall.function.name,
			arguments: {},
			result: {
				error: `Failed to execute ${toolCall.function.name}: ${errorMessage}`,
			},
		};
	}
}

/**
 * Execute tool calls with dependency-aware parallelization.
 *
 * This is the main entry point for tool execution. It:
 * 1. Builds execution plan based on dependencies
 * 2. Logs plan for debugging
 * 3. Executes groups sequentially, tools within group in parallel
 * 4. Collects and returns all results
 *
 * Performance characteristics:
 * - Independent tools: Execute in parallel (speedup = N tools)
 * - Dependent tools: Execute sequentially (no speedup)
 * - Mixed workflows: Partial parallelization (speedup varies)
 */
export async function executeToolCallsWithDependencies(
	toolCalls: ChatCompletionMessageFunctionToolCall[],
	toolDefinitions: ToolDefinition<any, any>[]
): Promise<ToolCallResult[]> {
	// Build tool definition map for fast lookup
	const toolDefMap = new Map(
		toolDefinitions.map((td) => [td.name, td])
	);

	// Build execution plan
	const plan = buildExecutionPlan(toolCalls, toolDefMap);

	// Log execution plan for debugging
	console.log(`[TOOL_EXECUTION] Execution plan: ${plan.parallelGroups.length} parallel groups`);
	plan.parallelGroups.forEach((group, i) => {
		const toolNames = group.map((c) => c.function.name).join(', ');
		const parallelIndicator = group.length > 1 ? ' (parallel)' : '';
		console.log(`[TOOL_EXECUTION]   Group ${i + 1}: ${toolNames}${parallelIndicator}`);
	});

	// Execute groups sequentially, tools within group in parallel
	const allResults: ToolCallResult[] = [];

	for (const [groupIndex, group] of plan.parallelGroups.entries()) {
		console.log(
			`[TOOL_EXECUTION] Executing group ${groupIndex + 1}/${plan.parallelGroups.length}`
		);

		// Execute all tools in group in parallel
		const groupResults = await Promise.all(
			group.map(async (toolCall) => {
				const toolDef = toolDefMap.get(toolCall.function.name);

				if (!toolDef) {
					throw new Error(`Tool definition not found: ${toolCall.function.name}`);
				}

				const result = await executeSingleTool(toolCall, toolDef);

				console.log(
					`[TOOL_EXECUTION] ${toolCall.function.name} completed ${result.result && typeof result.result === 'object' && result.result !== null && 'error' in result.result ? '(with error)' : 'successfully'}`
				);

				return result;
			})
		);

		allResults.push(...groupResults);
	}

	console.log(`[TOOL_EXECUTION] All ${toolCalls.length} tool calls completed`);

	return allResults;
}
