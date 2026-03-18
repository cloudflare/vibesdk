/**
 * Reviewer agent – the most sophisticated agent in the swarm.
 *
 * Pipeline:
 * 1. Real AST analysis (acorn-based – works in CF Workers unlike native tree-sitter)
 * 2. MedOS-inspired lightweight state-action-transition world-model simulator
 * 3. ESLint / security pattern scan
 * 4. Final LLM scoring (0-100)
 */

import { BaseAgent } from './base-agent';
import * as acorn from 'acorn';
import type {
	AgentRequest,
	AgentResponse,
	AgentRole,
	ASTAnalysis,
	LintResult,
	ReviewResult,
	WorldModelResult,
	WorldModelTransition,
} from '../types';

export class Reviewer extends BaseAgent {
	readonly role: AgentRole = 'reviewer';

	protected async run(req: AgentRequest): Promise<AgentResponse> {
		await this.checkAbortOrThrow(req.sessionId);

		const codeStr =
			typeof req.code === 'string' ? req.code : JSON.stringify(req.code ?? {});

		// 1. AST analysis
		await this.emitTimeline(req.sessionId, 'ast-analysis', 'Running AST analysis');
		const ast = this.analyzeAST(codeStr);

		await this.checkAbortOrThrow(req.sessionId);

		// 2. MedOS world-model simulation
		await this.emitTimeline(req.sessionId, 'world-model', 'Running world-model simulation');
		const worldModel = this.simulateWorldModel(codeStr, req.spec ?? '');

		await this.checkAbortOrThrow(req.sessionId);

		// 3. ESLint / security scan
		await this.emitTimeline(req.sessionId, 'lint-scan', 'Running lint & security scan');
		const lintResults = this.runLintScan(codeStr);

		await this.checkAbortOrThrow(req.sessionId);

		// 4. Final LLM scoring
		await this.emitTimeline(req.sessionId, 'llm-scoring', 'Running LLM quality scoring');
		const llmReview = await this.llmScore(codeStr, ast, worldModel, lintResults, req.spec ?? '');

		const review: ReviewResult = {
			score: llmReview.score,
			issues: llmReview.issues,
			fixes: llmReview.fixes,
			ast,
			worldModel,
			lintResults,
		};

		return {
			status: 'ok',
			agent: this.role,
			result: review,
		};
	}

	/* ---------------------------------------------------------------- */
	/*  1. AST Analysis (acorn)                                          */
	/* ---------------------------------------------------------------- */

	private analyzeAST(code: string): ASTAnalysis {
		const result: ASTAnalysis = {
			functionCount: 0,
			classCount: 0,
			importCount: 0,
			exportCount: 0,
			maxDepth: 0,
			complexity: 0,
			issues: [],
		};

		try {
			const tree = acorn.parse(code, {
				ecmaVersion: 'latest',
				sourceType: 'module',
				allowImportExportEverywhere: true,
			});

			this.walkAST(tree, result, 0);

			// Complexity heuristic
			result.complexity = result.functionCount * 2 + result.classCount * 3 + result.maxDepth;
		} catch {
			result.issues.push('Failed to parse code as valid JavaScript/TypeScript');
		}

		return result;
	}

	private walkAST(
		node: acorn.Node & { body?: acorn.Node[]; type: string },
		result: ASTAnalysis,
		depth: number,
	): void {
		if (depth > result.maxDepth) result.maxDepth = depth;

		switch (node.type) {
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				result.functionCount++;
				break;
			case 'ClassDeclaration':
			case 'ClassExpression':
				result.classCount++;
				break;
			case 'ImportDeclaration':
				result.importCount++;
				break;
			case 'ExportNamedDeclaration':
			case 'ExportDefaultDeclaration':
			case 'ExportAllDeclaration':
				result.exportCount++;
				break;
		}

		// Recurse into child nodes
		for (const key of Object.keys(node)) {
			if (key === 'type' || key === 'start' || key === 'end') continue;
			const child = (node as unknown as Record<string, unknown>)[key];
			if (child && typeof child === 'object') {
				if (Array.isArray(child)) {
					for (const item of child) {
						if (item && typeof item === 'object' && 'type' in item) {
							this.walkAST(item as acorn.Node & { body?: acorn.Node[]; type: string }, result, depth + 1);
						}
					}
				} else if ('type' in child) {
					this.walkAST(child as acorn.Node & { body?: acorn.Node[]; type: string }, result, depth + 1);
				}
			}
		}
	}

	/* ---------------------------------------------------------------- */
	/*  2. MedOS World-Model Simulator                                   */
	/* ---------------------------------------------------------------- */

	private simulateWorldModel(code: string, spec: string): WorldModelResult {
		const states: string[] = ['initialized'];
		const transitions: WorldModelTransition[] = [];
		const edgeCases: string[] = [];

		// Detect lifecycle states from code patterns
		if (code.includes('async') || code.includes('await') || code.includes('fetch')) {
			states.push('loading');
			transitions.push({
				from: 'initialized',
				to: 'loading',
				action: 'async_operation_start',
				probability: 0.95,
			});
		}

		states.push('running');
		transitions.push({
			from: states.includes('loading') ? 'loading' : 'initialized',
			to: 'running',
			action: 'process_data',
			probability: 0.9,
		});

		if (code.includes('try') || code.includes('catch')) {
			states.push('error_handled');
			transitions.push({
				from: 'running',
				to: 'error_handled',
				action: 'error_caught',
				probability: 0.15,
			});
		} else {
			edgeCases.push('Missing error handling – no try/catch blocks detected');
		}

		states.push('complete');
		transitions.push({
			from: 'running',
			to: 'complete',
			action: 'finish',
			probability: 0.85,
		});

		// Edge-case detection
		if (!code.includes('null') && !code.includes('undefined')) {
			edgeCases.push('No null/undefined guards detected');
		}

		if (!code.includes('timeout') && !code.includes('AbortController')) {
			edgeCases.push('No timeout or cancellation handling');
		}

		if (spec.includes('user') && !code.includes('valid')) {
			edgeCases.push('Spec mentions user input but no validation logic detected');
		}

		// Unreachable code detection (simple heuristic)
		const unreachableCodeDetected =
			/return\s+[^;]+;\s*\n\s*[a-zA-Z]/.test(code) ||
			/throw\s+[^;]+;\s*\n\s*[a-zA-Z]/.test(code);

		return {
			predictedStates: states,
			transitions,
			edgeCases,
			unreachableCodeDetected,
		};
	}

	/* ---------------------------------------------------------------- */
	/*  3. ESLint / Security Pattern Scan                                */
	/* ---------------------------------------------------------------- */

	private runLintScan(code: string): LintResult[] {
		const results: LintResult[] = [];
		const lines = code.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			// Security patterns
			if (/eval\s*\(/.test(line)) {
				results.push({
					rule: 'no-eval',
					severity: 'error',
					message: 'Use of eval() is a security risk',
					line: lineNum,
				});
			}

			if (/innerHTML\s*=/.test(line)) {
				results.push({
					rule: 'no-innerHTML',
					severity: 'warning',
					message: 'Direct innerHTML assignment – risk of XSS',
					line: lineNum,
				});
			}

			if (/document\.write/.test(line)) {
				results.push({
					rule: 'no-document-write',
					severity: 'warning',
					message: 'document.write is discouraged',
					line: lineNum,
				});
			}

			// Quality patterns
			if (/console\.(log|debug|info)\s*\(/.test(line)) {
				results.push({
					rule: 'no-console',
					severity: 'warning',
					message: 'Unexpected console statement',
					line: lineNum,
				});
			}

			if (/\bany\b/.test(line) && /:\s*any\b/.test(line)) {
				results.push({
					rule: 'no-explicit-any',
					severity: 'warning',
					message: 'Avoid using explicit `any` type',
					line: lineNum,
				});
			}

			// Secret detection
			if (/(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]+['"]/i.test(line)) {
				results.push({
					rule: 'no-hardcoded-secrets',
					severity: 'error',
					message: 'Possible hardcoded secret detected',
					line: lineNum,
				});
			}

			// SQL injection pattern
			if (/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i.test(line)) {
				results.push({
					rule: 'no-sql-injection',
					severity: 'error',
					message: 'Possible SQL injection via template literal',
					line: lineNum,
				});
			}
		}

		return results;
	}

	/* ---------------------------------------------------------------- */
	/*  4. LLM Final Scoring                                             */
	/* ---------------------------------------------------------------- */

	private async llmScore(
		code: string,
		ast: ASTAnalysis,
		worldModel: WorldModelResult,
		lintResults: LintResult[],
		spec: string,
	): Promise<{ score: number; issues: { severity: 'error' | 'warning' | 'info'; message: string }[]; fixes: string[] }> {
		const systemPrompt = [
			'You are a code reviewer. Evaluate the code using the AST analysis, world-model simulation, and lint results provided.',
			'Return valid JSON: { "score": 0-100, "issues": [{"severity":"error"|"warning"|"info","message":"..."}], "fixes": ["..."] }.',
			'Score guide: 90-100 excellent, 70-89 good, 50-69 needs work, <50 major issues.',
		].join('\n');

		const userPrompt = [
			`Specification: ${spec}`,
			`\nCode (truncated to 4000 chars):\n${code.substring(0, 4000)}`,
			`\nAST Summary: functions=${ast.functionCount}, classes=${ast.classCount}, imports=${ast.importCount}, exports=${ast.exportCount}, maxDepth=${ast.maxDepth}, complexity=${ast.complexity}, parseIssues=${ast.issues.length}`,
			`\nWorld Model: states=${worldModel.predictedStates.join(',')}, edgeCases=${worldModel.edgeCases.join('; ')}, unreachable=${worldModel.unreachableCodeDetected}`,
			`\nLint Issues: ${lintResults.length} (errors: ${lintResults.filter((r) => r.severity === 'error').length}, warnings: ${lintResults.filter((r) => r.severity === 'warning').length})`,
		].join('\n');

		try {
			const raw = await this.callLLMSimple(systemPrompt, userPrompt, true);
			return JSON.parse(raw);
		} catch {
			// Fallback: compute score heuristically
			const errorCount = lintResults.filter((r) => r.severity === 'error').length;
			const warningCount = lintResults.filter((r) => r.severity === 'warning').length;
			const edgeCaseCount = worldModel.edgeCases.length;
			const baseScore = 100;
			const score = Math.max(
				0,
				baseScore - errorCount * 15 - warningCount * 5 - edgeCaseCount * 3 - ast.issues.length * 20,
			);

			return {
				score,
				issues: lintResults.map((r) => ({ severity: r.severity, message: r.message })),
				fixes: worldModel.edgeCases.map((e) => `Address: ${e}`),
			};
		}
	}
}
