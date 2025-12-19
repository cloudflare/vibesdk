import { TypedEmitter } from './emitter';
import type { AgentState } from './protocol';
import type { AgentWsServerMessage } from './types';

export type WorkspaceFile = {
	path: string;
	content: string;
};

export type WorkspaceChange =
	| { type: 'reset'; files: number }
	| { type: 'upsert'; path: string }
	| { type: 'delete'; path: string };

type WorkspaceEvents = {
	change: WorkspaceChange;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function extractGeneratedFilesFromState(state: AgentState): WorkspaceFile[] {
	const out: WorkspaceFile[] = [];
	for (const file of Object.values(state.generatedFilesMap ?? {})) {
		const path = (file as unknown as { filePath?: unknown }).filePath;
		const content = (file as unknown as { fileContents?: unknown }).fileContents;
		if (typeof path === 'string' && typeof content === 'string') {
			out.push({ path, content });
		}
	}
	return out;
}

function extractGeneratedFileFromMessageFile(file: unknown): WorkspaceFile | null {
	if (!isRecord(file)) return null;
	const path = file.filePath;
	const content = file.fileContents;
	if (typeof path !== 'string' || typeof content !== 'string') return null;
	return { path, content };
}

export class WorkspaceStore {
	private files = new Map<string, string>();
	private emitter = new TypedEmitter<WorkspaceEvents>();

	paths(): string[] {
		return Array.from(this.files.keys()).sort();
	}

	read(path: string): string | null {
		return this.files.get(path) ?? null;
	}

	snapshot(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [path, content] of this.files.entries()) out[path] = content;
		return out;
	}

	onChange(cb: (change: WorkspaceChange) => void): () => void {
		return this.emitter.on('change', cb);
	}

	/** Apply authoritative snapshot from an AgentState. */
	applyStateSnapshot(state: AgentState): void {
		this.files.clear();
		for (const f of extractGeneratedFilesFromState(state)) {
			this.files.set(f.path, f.content);
		}
		this.emitter.emit('change', { type: 'reset', files: this.files.size });
	}

	/** Apply a single file upsert from WS file events. */
	applyFileUpsert(file: unknown): void {
		const f = extractGeneratedFileFromMessageFile(file);
		if (!f) return;
		this.files.set(f.path, f.content);
		this.emitter.emit('change', { type: 'upsert', path: f.path });
	}

	applyWsMessage(msg: AgentWsServerMessage): void {
		switch (msg.type) {
			case 'agent_connected':
				this.applyStateSnapshot(msg.state);
				break;
			case 'cf_agent_state':
				this.applyStateSnapshot(msg.state);
				break;
			case 'file_generated':
				this.applyFileUpsert(msg.file);
				break;
			case 'file_regenerated':
				this.applyFileUpsert(msg.file);
				break;
			default:
				break;
		}
	}
}
