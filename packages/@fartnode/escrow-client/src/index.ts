export interface EscrowClientOptions {
	programId: string;
}

export interface ReleaseEscrowInput {
	escrowAccount: string;
	recipient: string;
}

export class EscrowClient {
	constructor(private readonly options: EscrowClientOptions) {}

	get programId() {
		return this.options.programId;
	}

	async release(_input: ReleaseEscrowInput) {
		console.warn('[EscrowClient] release is a stub implementation.');
		return { signature: '', pending: true };
	}
}

export function createEscrowClient(options: EscrowClientOptions) {
	return new EscrowClient(options);
}
