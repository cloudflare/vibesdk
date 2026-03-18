/**
 * Coder agent – generates source code from an architecture plan.
 */

import { BaseAgent } from './base-agent';
import type { AgentRequest, AgentResponse, AgentRole } from '../types';

export class Coder extends BaseAgent {
	readonly role: AgentRole = 'coder';

	protected async run(req: AgentRequest): Promise<AgentResponse> {
		await this.checkAbortOrThrow(req.sessionId);

		const superpowerCtx = await this.getSuperpowerPrompt(req.superpowers);

		const systemPrompt = [
			'You are the Coder agent. Given an architecture plan, produce the complete source code for every file.',
			'Output valid JSON: { files: [ { path: string, content: string } ] }.',
			'Write production-quality, well-commented code.',
			superpowerCtx,
		]
			.filter(Boolean)
			.join('\n\n');

		const userPrompt = [
			'Architecture:',
			req.architecture ?? '(none)',
			req.debugInfo ? `\nDebug feedback to incorporate:\n${req.debugInfo}` : '',
			req.reviewResult
				? `\nReview feedback (score ${req.reviewResult.score}):\n${JSON.stringify(req.reviewResult.fixes)}`
				: '',
		].join('\n');

		await this.checkAbortOrThrow(req.sessionId);

		const code = await this.callLLMSimple(systemPrompt, userPrompt, true);

		return {
			status: 'ok',
			agent: this.role,
			result: { code },
		};
	}
}
