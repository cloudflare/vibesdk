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
	rollbackToCommit(branch: string, commitHash: string): Promise<unknown>;
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

/**
 * Detect a transient Durable Object restart. "Durable Object reset because its
 * code was updated" is thrown on stub calls that are in flight when the worker
 * version changes (platform deploy, or a local dev rebuild). The error is
 * per-call: a freshly resolved stub routes to the new instance.
 */
export function isDurableObjectResetError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /reset because its code was updated|Durable Object .*(reset|restarted)/i.test(message);
}

/**
 * Run a SpaceDO RPC, retrying ONCE with a freshly resolved stub when the call
 * failed because the DO was reset. All other errors propagate unchanged.
 */
export async function withDurableObjectResetRetry<S, T>(
	getStub: () => S,
	call: (stub: S) => Promise<T>,
): Promise<T> {
	try {
		return await call(getStub());
	} catch (error) {
		if (!isDurableObjectResetError(error)) throw error;
		return await call(getStub());
	}
}

// ── TEMP DIAGNOSTIC (write-escape-diag) ──────────────────────────────────────
// The deploy build has been failing on generated files that contain literal
// backslash-escaped quotes/backticks (e.g. `\" + \"`), which is a double-escape
// signature. This detector flags when such sequences arrive at writeFile so we
// can tell whether the corruption is present in the content the tool receives
// (i.e. upstream of the SpaceDO write) or introduced later. Remove once the
// source is confirmed.
const ESCAPE_DIAG_RE = /\\["'`]/;
function logSuspiciousEscaping(path: string, content: string): void {
	if (!ESCAPE_DIAG_RE.test(content)) return;
	const m = ESCAPE_DIAG_RE.exec(content);
	const idx = m ? m.index : 0;
	const snippet = content.slice(Math.max(0, idx - 40), idx + 40);
	// Count occurrences to gauge whether it's pervasive (double-escape) vs a
	// single legitimately-escaped char inside a normal string.
	const count = (content.match(/\\["'`]/g) ?? []).length;
	console.warn(
		`[write-escape-diag] path="${path}" len=${content.length} escapedQuoteCount=${count} firstAt=${idx}\n` +
			`  contextJSON=${JSON.stringify(snippet)}`,
	);
}
// ─────────────────────────────────────────────────────────────────────────────

function compareByPath(a: FileInfo, b: FileInfo): number {
	return a.path.localeCompare(b.path);
}

export function createSpaceWorkspaceOps(getStub: () => SpaceWorkspaceStub): SpaceWorkspaceOps {
	const ops: SpaceWorkspaceOps = {
		async readFile(path: string): Promise<string | null> {
			try {
				return await withDurableObjectResetRetry(getStub, (stub) => stub.readFile(path));
			} catch {
				return null;
			}
		},

		async readFileBytes(path: string): Promise<Uint8Array | null> {
			try {
				return await withDurableObjectResetRetry(getStub, (stub) =>
					stub.readFileBytes(path),
				);
			} catch {
				return null;
			}
		},

		async stat(path: string): Promise<FileInfo | null> {
			try {
				return await withDurableObjectResetRetry(getStub, (stub) => stub.stat(path));
			} catch {
				return null;
			}
		},

		async writeFile(path: string, content: string): Promise<void> {
			// TEMP: flag double-escaped content arriving at the write boundary.
			logSuspiciousEscaping(path, content);
			await withDurableObjectResetRetry(getStub, (stub) => stub.writeFile(path, content));
		},

		async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
			await withDurableObjectResetRetry(getStub, (stub) => stub.mkdir(path, opts));
		},

		async readDir(
			dir: string,
			opts?: { limit?: number; offset?: number },
		): Promise<FileInfo[]> {
			try {
				return await withDurableObjectResetRetry(getStub, (stub) => stub.readDir(dir, opts));
			} catch {
				return [];
			}
		},

		async glob(pattern: string): Promise<FileInfo[]> {
			const paths = await withDurableObjectResetRetry(getStub, (stub) => stub.glob(pattern));
			const infos = await Promise.all(
				paths.map((path) =>
					withDurableObjectResetRetry(getStub, (stub) => stub.stat(path)).catch(() => null),
				),
			);
			return infos.filter(isFileInfo).sort(compareByPath);
		},

		async rm(
			path: string,
			opts?: { recursive?: boolean; force?: boolean },
		): Promise<void> {
			await withDurableObjectResetRetry(getStub, (stub) => stub.rm(path, opts));
		},
	};

	return ops;
}
