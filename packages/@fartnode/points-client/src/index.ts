export interface PointsClientOptions {
	programId: string;
	cluster?: string;
}

export interface AwardPointsInput {
	recipient: string;
	amount: bigint | number;
	memo?: string;
}

export class PointsClient {
	constructor(private readonly options: PointsClientOptions) {}

	get programId() {
		return this.options.programId;
	}

	async awardPoints(_input: AwardPointsInput) {
		console.warn('[PointsClient] awardPoints is a stub implementation.');
		return { signature: '', pending: true };
	}
}

export function createPointsClient(options: PointsClientOptions) {
	return new PointsClient(options);
}
