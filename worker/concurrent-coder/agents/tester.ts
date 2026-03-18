/**
 * Tester agent – generates and runs tests against generated code.
 */

import { BaseAgent } from './base-agent';
import type { AgentRequest, AgentResponse, AgentRole } from '../types';

export class Tester extends BaseAgent {
	readonly role: AgentRole = 'tester';

	protected async run(req: AgentRequest): Promise<AgentResponse> {
		await this.checkAbortOrThrow(req.sessionId);

		const superpowerCtx = await this.getSuperpowerPrompt(req.superpowers);
		const codeStr =
			typeof req.code === 'string' ? req.code : JSON.stringify(req.code ?? {});

		const systemPrompt = [
			'You are the Tester agent. Given application code, write comprehensive tests and report results.',
			'Output valid JSON: { tests: [ { name, status: "pass"|"fail", detail } ], summary: string, passRate: number }.',
			superpowerCtx,
		]
			.filter(Boolean)
			.join('\n\n');

		const userPrompt = [
			'Specification:',
			req.spec ?? '(none)',
			'\nCode to test:',
			codeStr,
		].join('\n');

		await this.checkAbortOrThrow(req.sessionId);

		const testResults = await this.callLLMSimple(systemPrompt, userPrompt, false);

		return {
			status: 'ok',
			agent: this.role,
			result: { testResults },
		};
	}
}
