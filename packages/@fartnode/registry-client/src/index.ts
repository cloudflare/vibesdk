export interface RegistryClientOptions {
	programId: string;
}

export interface VerifyCollectionInput {
	mint: string;
	authority: string;
}

export class RegistryClient {
	constructor(private readonly options: RegistryClientOptions) {}

	get programId() {
		return this.options.programId;
	}

	async verifyCollection(_input: VerifyCollectionInput) {
		console.warn('[RegistryClient] verifyCollection is a stub implementation.');
		return { signature: '', pending: true };
	}
}

export function createRegistryClient(options: RegistryClientOptions) {
	return new RegistryClient(options);
}
