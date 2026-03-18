/**
 * Deployer agent – prepares deployment configuration.
 */

import { BaseAgent } from './base-agent';
import type { AgentRequest, AgentResponse, AgentRole } from '../types';

export class Deployer extends BaseAgent {
	readonly role: AgentRole = 'deployer';

	protected async run(req: AgentRequest): Promise<AgentResponse> {
		await this.checkAbortOrThrow(req.sessionId);

		const superpowerCtx = await this.getSuperpowerPrompt(req.superpowers);
		const codeStr =
			typeof req.code === 'string' ? req.code : JSON.stringify(req.code ?? {});

		const systemPrompt = [
			'You are the Deployer agent. Given reviewed & tested code, produce deployment artifacts.',
			'Output valid JSON: { deployConfig: object, steps: string[], wranglerToml?: string, packageJson?: string, notes: string }.',
			superpowerCtx,
		]
			.filter(Boolean)
			.join('\n\n');

		const userPrompt = [
			'Specification:',
			req.spec ?? '(none)',
			'\nArchitecture:',
			req.architecture ?? '(none)',
			'\nCode:',
			codeStr,
		].join('\n');

		await this.checkAbortOrThrow(req.sessionId);

		const deployResult = await this.callLLMSimple(systemPrompt, userPrompt, false);

		return {
			status: 'ok',
			agent: this.role,
			result: { deployResult },
		};
	}
}
