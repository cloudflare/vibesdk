/**
 * SDAE DSL Compiler
 *
 * Converts a MasterBible into an executable, validated, optimized DAG.
 *
 * The compilation pipeline:
 * 1. Schema validation — Bible structure against MasterBibleSchema
 * 2. Param validation — each node's params against OP_SCHEMAS[node.op]
 * 3. Duplicate detection — no two nodes may share a nodeId
 * 4. Cycle detection — Kahn's algorithm (O(V+E))
 * 5. Topological sort — execution-safe ordering
 * 6. Content hash — deterministic SHA-256 for every node
 * 7. Dead node detection — nodes unreachable from any terminal
 * 8. Parallelism analysis — groups of concurrently-executable nodes
 *
 * The compiler is stateless and side-effect-free. Given the same Bible it
 * will always produce the same CompilationResult (modulo hash computation
 * which is deterministic but async).
 */

import {
	MasterBibleSchema,
	OP_SCHEMAS,
	DAGNodeSchema,
	computeContentHash,
	type MasterBible,
	type DAGNode,
	type CompilationResult,
	type ValidationResult,
} from '../ir';

export class DSLCompiler {
	/**
	 * Main entry point — validates and compiles a MasterBible into an
	 * executable DAG with topological ordering and parallel groups.
	 */
	static async compile(bible: unknown): Promise<CompilationResult> {
		const warnings: string[] = [];
		const errors: string[] = [];

		// Step 1: Validate the Bible against the master schema
		const parseResult = MasterBibleSchema.safeParse(bible);
		if (!parseResult.success) {
			const zodErrors = parseResult.error.issues.map(
				(i) => `${i.path.join('.')}: ${i.message}`,
			);
			return {
				nodes: [],
				executionOrder: [],
				parallelGroups: [],
				warnings,
				errors: [`Bible schema validation failed: ${zodErrors.join('; ')}`],
				isValid: false,
			};
		}

		const validBible = parseResult.data;
		const nodes = validBible.executionGraph;

		// Step 2: Validate each node's params against its op-specific schema
		for (const node of nodes) {
			const result = DSLCompiler.validateNodeParams(node);
			if (!result.valid) {
				errors.push(...result.errors.map((e) => `[${node.nodeId}] ${e}`));
			}
		}

		// Step 3: Check for duplicate nodeIds
		const duplicates = DSLCompiler.findDuplicateIds(nodes);
		if (duplicates.length > 0) {
			errors.push(`Duplicate nodeIds: ${duplicates.join(', ')}`);
		}

		// Step 4: Validate dependency references exist
		const nodeIds = new Set(nodes.map((n) => n.nodeId));
		for (const node of nodes) {
			for (const dep of node.dependsOn) {
				if (!nodeIds.has(dep)) {
					errors.push(
						`[${node.nodeId}] depends on unknown node "${dep}"`,
					);
				}
			}
		}

		// Step 5: Detect cycles (Kahn's algorithm)
		const cycleNodes = DSLCompiler.detectCycles(nodes);
		if (cycleNodes !== null) {
			errors.push(
				`Cycle detected involving nodes: ${cycleNodes.join(', ')}`,
			);
		}

		// Bail early if there are structural errors — sorting/hashing
		// requires a valid DAG.
		if (errors.length > 0) {
			return {
				nodes,
				executionOrder: [],
				parallelGroups: [],
				warnings,
				errors,
				isValid: false,
			};
		}

		// Step 6: Topological sort
		const sorted = DSLCompiler.topologicalSort(nodes);

		// Step 7: Compute content hashes for every node
		const hashedNodes = await DSLCompiler.computeAllHashes(sorted);

		// Step 8: Dead node detection
		const deadNodes = DSLCompiler.findDeadNodes(hashedNodes);
		if (deadNodes.length > 0) {
			warnings.push(
				`Dead nodes detected (no path to terminal): ${deadNodes.join(', ')}`,
			);
		}

		// Step 9: Parallelism analysis
		const parallelGroups = DSLCompiler.findParallelGroups(hashedNodes);

		// Step 10: Validate governance human-in-loop nodes exist
		for (const gateNodeId of validBible.governance.humanInLoopNodes) {
			if (!nodeIds.has(gateNodeId)) {
				warnings.push(
					`Governance humanInLoopNodes references unknown node "${gateNodeId}"`,
				);
			}
		}

		// Same for execution policy approval gates
		for (const gateNodeId of validBible.executionPolicy.humanApprovalGates) {
			if (!nodeIds.has(gateNodeId)) {
				warnings.push(
					`ExecutionPolicy humanApprovalGates references unknown node "${gateNodeId}"`,
				);
			}
		}

		return {
			nodes: hashedNodes,
			executionOrder: sorted.map((n) => n.nodeId),
			parallelGroups: parallelGroups.map((group) =>
				group.map((n) => n.nodeId),
			),
			warnings,
			errors,
			isValid: true,
		};
	}

	// -----------------------------------------------------------------------
	// Param validation — checks node.params against OP_SCHEMAS[node.op]
	// -----------------------------------------------------------------------
	static validateNodeParams(node: DAGNode): ValidationResult {
		const schema = OP_SCHEMAS[node.op];
		if (!schema) {
			return {
				nodeId: node.nodeId,
				valid: false,
				errors: [`Unknown op type: ${node.op}`],
			};
		}

		const result = schema.safeParse(node.params);
		if (!result.success) {
			return {
				nodeId: node.nodeId,
				valid: false,
				errors: result.error.issues.map(
					(i) => `params.${i.path.join('.')}: ${i.message}`,
				),
			};
		}

		return { nodeId: node.nodeId, valid: true, errors: [] };
	}

	// -----------------------------------------------------------------------
	// Duplicate ID detection
	// -----------------------------------------------------------------------
	private static findDuplicateIds(nodes: DAGNode[]): string[] {
		const seen = new Set<string>();
		const dupes = new Set<string>();
		for (const node of nodes) {
			if (seen.has(node.nodeId)) {
				dupes.add(node.nodeId);
			}
			seen.add(node.nodeId);
		}
		return [...dupes];
	}

	// -----------------------------------------------------------------------
	// Cycle detection — Kahn's algorithm
	//
	// Returns null if no cycle, or an array of nodeIds involved in cycles.
	// Works by repeatedly removing nodes with zero in-degree; any nodes
	// remaining after exhaustion are part of a cycle.
	// -----------------------------------------------------------------------
	static detectCycles(nodes: DAGNode[]): string[] | null {
		const inDegree = new Map<string, number>();
		const adjacency = new Map<string, string[]>();

		for (const node of nodes) {
			inDegree.set(node.nodeId, 0);
			adjacency.set(node.nodeId, []);
		}

		for (const node of nodes) {
			for (const dep of node.dependsOn) {
				const existing = adjacency.get(dep);
				if (existing) {
					existing.push(node.nodeId);
				}
				inDegree.set(
					node.nodeId,
					(inDegree.get(node.nodeId) ?? 0) + 1,
				);
			}
		}

		// Seed queue with zero-in-degree nodes
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) {
				queue.push(id);
			}
		}

		let processed = 0;
		while (queue.length > 0) {
			const current = queue.shift()!;
			processed++;

			for (const neighbour of adjacency.get(current) ?? []) {
				const newDegree = (inDegree.get(neighbour) ?? 1) - 1;
				inDegree.set(neighbour, newDegree);
				if (newDegree === 0) {
					queue.push(neighbour);
				}
			}
		}

		if (processed === nodes.length) {
			return null; // No cycle
		}

		// Nodes still with in-degree > 0 are part of cycles
		const cycleNodes: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree > 0) {
				cycleNodes.push(id);
			}
		}
		return cycleNodes;
	}

	// -----------------------------------------------------------------------
	// Topological sort — returns nodes in valid execution order.
	// Uses Kahn's algorithm (same as cycle detection but collects ordering).
	// Assumes no cycles (call detectCycles first).
	// -----------------------------------------------------------------------
	static topologicalSort(nodes: DAGNode[]): DAGNode[] {
		const nodeMap = new Map<string, DAGNode>();
		const inDegree = new Map<string, number>();
		const adjacency = new Map<string, string[]>();

		for (const node of nodes) {
			nodeMap.set(node.nodeId, node);
			inDegree.set(node.nodeId, 0);
			adjacency.set(node.nodeId, []);
		}

		for (const node of nodes) {
			for (const dep of node.dependsOn) {
				adjacency.get(dep)?.push(node.nodeId);
				inDegree.set(
					node.nodeId,
					(inDegree.get(node.nodeId) ?? 0) + 1,
				);
			}
		}

		// Deterministic ordering: sort zero-in-degree nodes alphabetically
		// so the topological order is stable across runs.
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) {
				queue.push(id);
			}
		}
		queue.sort();

		const sorted: DAGNode[] = [];
		while (queue.length > 0) {
			const current = queue.shift()!;
			const node = nodeMap.get(current);
			if (node) {
				sorted.push(node);
			}

			const neighbours = [...(adjacency.get(current) ?? [])];
			neighbours.sort(); // deterministic
			for (const neighbour of neighbours) {
				const newDegree = (inDegree.get(neighbour) ?? 1) - 1;
				inDegree.set(neighbour, newDegree);
				if (newDegree === 0) {
					queue.push(neighbour);
					// Re-sort to maintain deterministic order
					queue.sort();
				}
			}
		}

		return sorted;
	}

	// -----------------------------------------------------------------------
	// Parallel group analysis
	//
	// Groups nodes by their "depth" in the DAG — nodes at the same depth
	// have no mutual dependencies and can execute concurrently.
	// -----------------------------------------------------------------------
	static findParallelGroups(nodes: DAGNode[]): DAGNode[][] {
		if (nodes.length === 0) return [];

		const nodeMap = new Map<string, DAGNode>();
		const depth = new Map<string, number>();

		for (const node of nodes) {
			nodeMap.set(node.nodeId, node);
		}

		// Compute depth for each node: max(depth of dependencies) + 1
		const computeDepth = (nodeId: string, visited: Set<string>): number => {
			if (depth.has(nodeId)) return depth.get(nodeId)!;
			if (visited.has(nodeId)) return 0; // cycle guard (shouldn't happen post-validation)
			visited.add(nodeId);

			const node = nodeMap.get(nodeId);
			if (!node || node.dependsOn.length === 0) {
				depth.set(nodeId, 0);
				return 0;
			}

			let maxDepDeth = 0;
			for (const dep of node.dependsOn) {
				const depDepth = computeDepth(dep, visited);
				maxDepDeth = Math.max(maxDepDeth, depDepth);
			}

			const d = maxDepDeth + 1;
			depth.set(nodeId, d);
			return d;
		};

		for (const node of nodes) {
			computeDepth(node.nodeId, new Set());
		}

		// Group by depth
		const groups = new Map<number, DAGNode[]>();
		for (const node of nodes) {
			const d = depth.get(node.nodeId) ?? 0;
			if (!groups.has(d)) {
				groups.set(d, []);
			}
			groups.get(d)!.push(node);
		}

		// Return groups ordered by depth (ascending)
		const sortedDepths = [...groups.keys()].sort((a, b) => a - b);
		return sortedDepths.map((d) => groups.get(d)!);
	}

	// -----------------------------------------------------------------------
	// Dead node detection
	//
	// A "dead" node has no path to any terminal node (a node that no other
	// node depends on). This indicates an orphaned subgraph whose output
	// is never consumed.
	// -----------------------------------------------------------------------
	static findDeadNodes(nodes: DAGNode[]): string[] {
		if (nodes.length === 0) return [];

		// Build reverse adjacency: for each node, who depends on it?
		const dependedOnBy = new Map<string, Set<string>>();
		const allIds = new Set<string>();

		for (const node of nodes) {
			allIds.add(node.nodeId);
			if (!dependedOnBy.has(node.nodeId)) {
				dependedOnBy.set(node.nodeId, new Set());
			}
		}

		for (const node of nodes) {
			for (const dep of node.dependsOn) {
				if (!dependedOnBy.has(dep)) {
					dependedOnBy.set(dep, new Set());
				}
				dependedOnBy.get(dep)!.add(node.nodeId);
			}
		}

		// Terminal nodes: nodes that nobody depends on
		const terminals = new Set<string>();
		for (const id of allIds) {
			const dependents = dependedOnBy.get(id);
			if (!dependents || dependents.size === 0) {
				terminals.add(id);
			}
		}

		// BFS backwards from terminals to find all "live" nodes
		const live = new Set<string>();
		const queue = [...terminals];

		while (queue.length > 0) {
			const current = queue.shift()!;
			if (live.has(current)) continue;
			live.add(current);

			// Walk backwards: this node's dependencies are also live
			const node = nodes.find((n) => n.nodeId === current);
			if (node) {
				for (const dep of node.dependsOn) {
					if (!live.has(dep)) {
						queue.push(dep);
					}
				}
			}
		}

		// Dead nodes: in allIds but not in live
		const dead: string[] = [];
		for (const id of allIds) {
			if (!live.has(id)) {
				dead.push(id);
			}
		}
		return dead;
	}

	// -----------------------------------------------------------------------
	// Hash computation for all nodes
	// -----------------------------------------------------------------------
	private static async computeAllHashes(nodes: DAGNode[]): Promise<DAGNode[]> {
		const results: DAGNode[] = [];
		for (const node of nodes) {
			const hash = await computeContentHash(node);
			results.push({ ...node, contentHash: hash });
		}
		return results;
	}
}
