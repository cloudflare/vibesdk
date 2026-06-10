import type { FileInfo } from '@cloudflare/shell';
import type {
	DeleteOperations,
	EditOperations,
	FindOperations,
	GrepOperations,
	ListOperations,
	ReadOperations,
	WriteOperations,
} from '@cloudflare/think/tools/workspace';

export interface SpaceWorkspaceStub extends DurableObjectStub {
	readFile(path: string): Promise<string>;
	readFileBytes(path: string): Promise<Uint8Array | null>;
	writeFile(path: string, content: string): Promise<unknown>;
	mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
	rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
	readDir(dir: string, opts?: { limit?: number; offset?: number }): Promise<FileInfo[]>;
	glob(pattern: string): Promise<string[]>;
	stat(path: string): Promise<FileInfo | null>;
	// Git + deploy RPC methods (used by the deploy tool and behavior).
	gitCommit(
		message: string,
		author?: { name: string; email: string },
	): Promise<{ sha: string; message: string }>;
	gitStatus(): Promise<unknown>;
	deploy(branch: string): Promise<unknown>;
}

export type SpaceWorkspaceOps = ReadOperations &
	WriteOperations &
	EditOperations &
	ListOperations &
	FindOperations &
	DeleteOperations &
	GrepOperations;

function isFileInfo(value: FileInfo | null): value is FileInfo {
	return value !== null;
}

function compareByPath(a: FileInfo, b: FileInfo): number {
	return a.path.localeCompare(b.path);
}

export function createSpaceWorkspaceOps(stub: SpaceWorkspaceStub): SpaceWorkspaceOps {
	const ops: SpaceWorkspaceOps = {
		async readFile(path: string): Promise<string | null> {
			try {
				return await stub.readFile(path);
			} catch {
				return null;
			}
		},

		async readFileBytes(path: string): Promise<Uint8Array | null> {
			try {
				return await stub.readFileBytes(path);
			} catch {
				return null;
			}
		},

		async stat(path: string): Promise<FileInfo | null> {
			try {
				return await stub.stat(path);
			} catch {
				return null;
			}
		},

		async writeFile(path: string, content: string): Promise<void> {
			await stub.writeFile(path, content);
		},

		async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
			await stub.mkdir(path, opts);
		},

		async readDir(
			dir: string,
			opts?: { limit?: number; offset?: number },
		): Promise<FileInfo[]> {
			try {
				return await stub.readDir(dir, opts);
			} catch {
				return [];
			}
		},

		async glob(pattern: string): Promise<FileInfo[]> {
			const paths = await stub.glob(pattern);
			const infos = await Promise.all(paths.map((path) => stub.stat(path).catch(() => null)));
			return infos.filter(isFileInfo).sort(compareByPath);
		},

		async rm(
			path: string,
			opts?: { recursive?: boolean; force?: boolean },
		): Promise<void> {
			await stub.rm(path, opts);
		},
	};

	return ops;
}
