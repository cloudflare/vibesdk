import { WorkerEntrypoint } from 'cloudflare:workers';
import { getGlobalConfigurableSettings } from '../../config';
import { RateLimitService } from '../rate-limit/rateLimits';

type AppAIProxyProps = {
	spaceName: string;
};

type DynamicAiModel = {
	inputs: unknown;
	postProcessedOutputs: unknown;
};

type DynamicAi = Ai<Record<string, DynamicAiModel>>;

export class AppAIProxy extends WorkerEntrypoint<Env, AppAIProxyProps> {
	async run(model: string, inputs: unknown, options?: AiOptions): Promise<unknown> {
		if (!this.env.AI) {
			throw new Error('Workers AI is not configured for this platform');
		}

		const config = await getGlobalConfigurableSettings(this.env);
		await RateLimitService.enforceAppAiCallsRateLimit(
			this.env,
			config.security.rateLimit,
			this.ctx.props.spaceName,
		);

		const ai = this.env.AI as unknown as DynamicAi;
		console.log('[AppAIProxy] Running Workers AI model', {
			spaceName: this.ctx.props.spaceName,
			model,
		});
		try {
			return await ai.run(model, inputs, options ?? {});
		} catch (error) {
			console.error('[AppAIProxy] Workers AI request failed', {
				spaceName: this.ctx.props.spaceName,
				model,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}
}
