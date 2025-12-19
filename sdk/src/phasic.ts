import type { VibeClientOptions } from './types';
import { VibeClient } from './client';

export class PhasicClient extends VibeClient {
	constructor(options: VibeClientOptions) {
		super(options);
	}

	override async build(prompt: string, options: Parameters<VibeClient['build']>[1] = {}) {
		return super.build(prompt, { ...options, behaviorType: options.behaviorType ?? 'phasic' });
	}
}
