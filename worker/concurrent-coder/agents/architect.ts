/**
 * Architect agent – designs application architecture from a natural-language spec.
 */

import { BaseAgent } from './base-agent';
import type { AgentRequest, AgentResponse, AgentRole } from '../types';

export class Architect extends BaseAgent {
	readonly role: AgentRole = 'architect';

	protected async run(req: AgentRequest): Promise<AgentResponse> {
		await this.checkAbortOrThrow(req.sessionId);

		const superpowerCtx = await this.getSuperpowerPrompt(req.superpowers);

		const systemPrompt = [
			'You are the Architect agent. Your job is to take a natural-language application specification and produce a detailed technical architecture.',
			'Output valid JSON with keys: { projectName, framework, files (array of {path, purpose, dependencies}), dataModel, apiEndpoints, notes }.',
			superpowerCtx,
		]
			.filter(Boolean)
			.join('\n\n');

		const userPrompt = `Application specification:\n${req.spec ?? '(no spec provided)'}`;

		await this.checkAbortOrThrow(req.sessionId);

		const architecture = await this.callLLMSimple(systemPrompt, userPrompt, true);

		return {
			status: 'ok',
			agent: this.role,
			result: { architecture },
		};
	}
}
