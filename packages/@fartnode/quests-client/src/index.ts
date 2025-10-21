export interface QuestClientOptions {
	programId: string;
}

export interface CompleteQuestInput {
	questId: string;
	player: string;
}

export class QuestsClient {
	constructor(private readonly options: QuestClientOptions) {}

	get programId() {
		return this.options.programId;
	}

	async completeQuest(_input: CompleteQuestInput) {
		console.warn('[QuestsClient] completeQuest is a stub implementation.');
		return { signature: '', pending: true };
	}
}

export function createQuestsClient(options: QuestClientOptions) {
	return new QuestsClient(options);
}
