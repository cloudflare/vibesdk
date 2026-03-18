/**
 * Debugger agent – analyses failing tests and produces fix recommendations.
 */

import { BaseAgent } from './base-agent';
import type { AgentRequest, AgentResponse, AgentRole } from '../types';

export class Debugger extends BaseAgent {
	readonly role: AgentRole = 'debugger';

	protected async run(req: AgentRequest): Promise<AgentResponse> {
		await this.checkAbortOrThrow(req.sessionId);

		const superpowerCtx = await this.getSuperpowerPrompt(req.superpowers);
		const codeStr =
			typeof req.code === 'string' ? req.code : JSON.stringify(req.code ?? {});

		const systemPrompt = [
			'You are the Debugger agent. Analyse failing test results, identify root causes, and propose fixes.',
			'Output valid JSON: { rootCauses: [ { file, line, issue } ], fixes: [ { file, description, patch } ], confidence: number }.',
			superpowerCtx,
		]
			.filter(Boolean)
			.join('\n\n');

		const userPrompt = [
			'Test results:',
			req.testResults ?? '(none)',
			'\nCode:',
			codeStr,
			`\nIteration: ${req.iteration ?? 1}`,
		].join('\n');

		await this.checkAbortOrThrow(req.sessionId);

		const debugInfo = await this.callLLMSimple(systemPrompt, userPrompt, true);

		return {
			status: 'ok',
			agent: this.role,
			result: { debugInfo },
		};
	}
}
