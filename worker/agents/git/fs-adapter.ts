/**
 * SQLite filesystem adapter for isomorphic-git
 * One DO = one Git repo, stored directly in SQLite
 *
 * Storage model:
 *   Every file is a sequence of one or more chunks stored as adjacent rows.
 *   Metadata (parent_path, is_dir, size, mtime) lives on chunk_index 0.
 */

import { concatBuffers, rowDataToBytes, toBuffer,  } from '../../utils/encoding';

export type SqlValue = string | number | boolean | null | ArrayBuffer;

export interface SqlExecutor {
	<T = unknown>(query: TemplateStringsArray, ...values: SqlValue[]): T[];
}

// 1.8 MB per chunk
const CHUNK_SIZE = 1800 * 1024;

// ============================================================================
// Helpers
// ============================================================================

/** Normalize a path for storage: strip leading slashes and resolve '.' to root. */
function normalizePath(path: string): string {
	const stripped = path.replace(/^\/+/, '');
	if (stripped === '.' || stripped === './') return '';
	return stripped.replace(/^\.\//, '');
}

function makeErrno(message: string, code: string, errno: number, path: string): NodeJS.ErrnoException {
	const err: NodeJS.ErrnoException = new Error(message);
	err.code = code;
	err.errno = errno;
	err.path = path;
	return err;
}

// ============================================================================
// SqliteFS
// ============================================================================

export class SqliteFS {
	private sql!: SqlExecutor;
	public promises!: this;

	constructor(sql: SqlExecutor) {
		this.sql = sql;
	}

	// ==========================================
	// Schema & Migration
	// ==========================================

	init() {
		const cols = this.sql<{ name: string }>`PRAGMA table_info(git_objects)`;

		if (cols.length === 0) {
			this.createSchema();
		} else if (!cols.some((c) => c.name === 'chunk_index')) {
			this.migrateV1toV2();
		}
		// else: already on v2

		Object.defineProperty(this, 'promises', {
			value: this,
			enumerable: true,
			writable: false,
			configurable: false,
		});
	}

	private createSchema() {
		void this.sql`
            CREATE TABLE git_objects (
                path        TEXT    NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                parent_path TEXT    NOT NULL DEFAULT '',
                data        BLOB,
                is_dir      INTEGER NOT NULL DEFAULT 0,
                size        INTEGER NOT NULL DEFAULT 0,
                mtime       INTEGER NOT NULL,
                PRIMARY KEY (path, chunk_index)
            )
        `;
		void this.sql`CREATE INDEX idx_git_objects_parent ON git_objects(parent_path, path)`;
		void this.sql`CREATE INDEX idx_git_objects_is_dir ON git_objects(is_dir, path)`;
		void this
			.sql`INSERT OR IGNORE INTO git_objects (path, chunk_index, parent_path, data, is_dir, mtime) VALUES ('', 0, '', NULL, 1, ${Date.now()})`;
	}

	private migrateV1toV2() {
		void this.sql`
            CREATE TABLE git_objects_v2 (
                path        TEXT    NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                parent_path TEXT    NOT NULL DEFAULT '',
                data        BLOB,
                is_dir      INTEGER NOT NULL DEFAULT 0,
                size        INTEGER NOT NULL DEFAULT 0,
                mtime       INTEGER NOT NULL,
                PRIMARY KEY (path, chunk_index)
            )
        `;

		// Copy all existing rows as chunk_index = 0.
		// Data is preserved as-is (legacy base64 TEXT) -- the read path handles both formats.
		void this.sql`
            INSERT INTO git_objects_v2 (path, chunk_index, parent_path, data, is_dir, size, mtime)
            SELECT path, 0, parent_path, data, is_dir, 0, mtime FROM git_objects
        `;

		void this.sql`DROP TABLE git_objects`;
		void this.sql`ALTER TABLE git_objects_v2 RENAME TO git_objects`;

		void this.sql`CREATE INDEX idx_git_objects_parent ON git_objects(parent_path, path)`;
		void this.sql`CREATE INDEX idx_git_objects_is_dir ON git_objects(is_dir, path)`;

		void this
			.sql`INSERT OR IGNORE INTO git_objects (path, chunk_index, parent_path, data, is_dir, mtime) VALUES ('', 0, '', NULL, 1, ${Date.now()})`;
	}

	// ==========================================
	// Read
	// ==========================================

	async readFile(
		path: string,
		options?: { encoding?: 'utf8' }
	): Promise<Uint8Array | string> {
		const normalized = normalizePath(path);

		// Metadata check on chunk 0
		const meta = this.sql<{ is_dir: number }>`
            SELECT is_dir FROM git_objects WHERE path = ${normalized} AND chunk_index = 0
        `;
		if (!meta[0]) {
			throw makeErrno(
				`ENOENT: no such file or directory, open '${path}'`,
				'ENOENT',
				-2,
				path
			);
		}
		if (meta[0].is_dir) {
			throw makeErrno(
				`EISDIR: illegal operation on a directory, read '${path}'`,
				'EISDIR',
				-21,
				path
			);
		}

		// Read all chunks, ordered
		const rows = this.sql<{ data: ArrayBuffer | string | null }>`
            SELECT data FROM git_objects WHERE path = ${normalized} ORDER BY chunk_index
        `;

		const chunks = rows.map((r) => rowDataToBytes(r.data));
		const result = concatBuffers(chunks);

		return options?.encoding === 'utf8'
			? new TextDecoder().decode(result)
			: result;
	}

	// ==========================================
	// Write
	// ==========================================

	async writeFile(path: string, data: Uint8Array | string): Promise<void> {
		const normalized = normalizePath(path);
		if (!normalized) throw new Error('Cannot write to root');

		const bytes =
			typeof data === 'string' ? new TextEncoder().encode(data) : data;

		// Guard: can't overwrite a directory
		const existing = this.sql<{ is_dir: number }>`
            SELECT is_dir FROM git_objects WHERE path = ${normalized} AND chunk_index = 0
        `;
		if (existing[0]?.is_dir === 1) {
			throw makeErrno(
				`EISDIR: illegal operation on a directory, open '${path}'`,
				'EISDIR',
				-21,
				path
			);
		}

		// Ensure parent directories exist
		const parts = normalized.split('/');
		const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

		if (parts.length > 1) {
			const now = Date.now();
			for (let i = 0; i < parts.length - 1; i++) {
				const dirPath = parts.slice(0, i + 1).join('/');
				const dirParent = i === 0 ? '' : parts.slice(0, i).join('/');
				void this.sql`INSERT OR IGNORE INTO git_objects
                    (path, chunk_index, parent_path, data, is_dir, mtime)
                    VALUES (${dirPath}, 0, ${dirParent}, NULL, 1, ${now})`;
			}
		}

		// Remove previous content (all chunks)
		void this.sql`DELETE FROM git_objects WHERE path = ${normalized}`;

		// Write chunks
		const totalSize = bytes.length;
		const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
		const now = Date.now();

		for (let i = 0; i < chunkCount; i++) {
			const start = i * CHUNK_SIZE;
			const end = Math.min(start + CHUNK_SIZE, totalSize);
			const chunkBuf = toBuffer(bytes.slice(start, end));

			// Chunk 0 carries metadata; subsequent chunks carry only data
			void this.sql`INSERT INTO git_objects
                (path, chunk_index, parent_path, data, is_dir, size, mtime)
                VALUES (${normalized}, ${i}, ${i === 0 ? parentPath : ''}, ${chunkBuf}, 0, ${i === 0 ? totalSize : 0}, ${now})`;
		}
	}

	// ==========================================
	// Delete
	// ==========================================

	async unlink(path: string): Promise<void> {
		const normalized = normalizePath(path);

		const existing = this.sql<{ is_dir: number }>`
            SELECT is_dir FROM git_objects WHERE path = ${normalized} AND chunk_index = 0
        `;
		if (!existing[0]) {
			throw makeErrno(
				`ENOENT: no such file or directory, unlink '${path}'`,
				'ENOENT',
				-2,
				path
			);
		}
		if (existing[0].is_dir === 1) {
			throw makeErrno(
				`EPERM: operation not permitted, unlink '${path}'`,
				'EPERM',
				-1,
				path
			);
		}

		// Removes all chunks
		void this.sql`DELETE FROM git_objects WHERE path = ${normalized}`;
	}

	// ==========================================
	// Directory Operations
	// ==========================================

	async readdir(path: string): Promise<string[]> {
		const normalized = normalizePath(path).replace(/\/+$/g, '');

		const dirCheck = this.sql<{ is_dir: number }>`
            SELECT is_dir FROM git_objects WHERE path = ${normalized} AND chunk_index = 0
        `;
		if (!dirCheck[0]) {
			throw makeErrno(
				`ENOENT: no such file or directory, scandir '${path}'`,
				'ENOENT',
				-2,
				path
			);
		}
		if (!dirCheck[0].is_dir) {
			throw makeErrno(
				`ENOTDIR: not a directory, scandir '${path}'`,
				'ENOTDIR',
				-20,
				path
			);
		}

		const rows = this.sql<{ path: string }>`
            SELECT path FROM git_objects WHERE parent_path = ${normalized} AND path != ${normalized} AND chunk_index = 0
        `;

		if (!rows || rows.length === 0) return [];

		return rows.map((row) => {
			const segments = row.path.split('/');
			return segments[segments.length - 1];
		});
	}

	async mkdir(path: string, _options?: unknown): Promise<void> {
		const normalized = normalizePath(path).replace(/\/+$/g, '');
		if (!normalized) return;

		const parts = normalized.split('/');

		if (parts.length > 1) {
			const parentPath = parts.slice(0, -1).join('/');
			const parent = this.sql<{ is_dir: number }>`
                SELECT is_dir FROM git_objects WHERE path = ${parentPath} AND chunk_index = 0
            `;
			if (!parent[0] || parent[0].is_dir !== 1) {
				throw makeErrno(
					`ENOENT: no such file or directory, mkdir '${path}'`,
					'ENOENT',
					-2,
					path
				);
			}
		}

		const existing = this.sql<{ is_dir: number }>`
            SELECT is_dir FROM git_objects WHERE path = ${normalized} AND chunk_index = 0
        `;
		if (existing[0]) {
			if (existing[0].is_dir === 1) return; // already exists
			throw makeErrno(
				`EEXIST: file already exists, mkdir '${path}'`,
				'EEXIST',
				-17,
				path
			);
		}

		const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
		void this.sql`INSERT OR IGNORE INTO git_objects
            (path, chunk_index, parent_path, data, is_dir, mtime)
            VALUES (${normalized}, 0, ${parentPath}, NULL, 1, ${Date.now()})`;
	}

	async rmdir(path: string): Promise<void> {
		const normalized = normalizePath(path).replace(/\/+$/g, '');
		if (!normalized) throw new Error('Cannot remove root directory');

		const existing = this.sql<{ is_dir: number }>`
            SELECT is_dir FROM git_objects WHERE path = ${normalized} AND chunk_index = 0
        `;
		if (!existing[0]) {
			throw makeErrno(
				`ENOENT: no such file or directory, rmdir '${path}'`,
				'ENOENT',
				-2,
				path
			);
		}
		if (existing[0].is_dir !== 1) {
			throw makeErrno(
				`ENOTDIR: not a directory, rmdir '${path}'`,
				'ENOTDIR',
				-20,
				path
			);
		}

		const children = this.sql<{ path: string }>`
            SELECT path FROM git_objects WHERE parent_path = ${normalized} AND chunk_index = 0 LIMIT 1
        `;
		if (children.length > 0) {
			throw makeErrno(
				`ENOTEMPTY: directory not empty, rmdir '${path}'`,
				'ENOTEMPTY',
				-39,
				path
			);
		}

		void this.sql`DELETE FROM git_objects WHERE path = ${normalized}`;
	}

	// ==========================================
	// Stat
	// ==========================================

	async stat(path: string): Promise<{
		type: 'file' | 'dir';
		mode: number;
		size: number;
		mtimeMs: number;
		dev: number;
		ino: number;
		uid: number;
		gid: number;
		ctime: Date;
		mtime: Date;
		ctimeMs: number;
		isFile: () => boolean;
		isDirectory: () => boolean;
		isSymbolicLink: () => boolean;
	}> {
		const normalized = normalizePath(path);
		const result = this.sql<{
			data: ArrayBuffer | string | null;
			mtime: number;
			is_dir: number;
			size: number;
		}>`SELECT data, mtime, is_dir, size FROM git_objects WHERE path = ${normalized} AND chunk_index = 0`;

		if (!result[0]) {
			throw makeErrno(
				`ENOENT: no such file or directory, stat '${path}'`,
				'ENOENT',
				-2,
				path
			);
		}

		const row = result[0];
		const isDir = row.is_dir === 1;
        
		let size = row.size;
		// Resolve size: stored size for new writes, computed for legacy data
		if (!isDir && size === 0 && row.data != null) {
			if (row.data instanceof ArrayBuffer) {
				size = row.data.byteLength;
			} else if (typeof row.data === 'string') {
				// Account for base64 padding when computing original size
				const padding = (row.data.match(/=+$/) || [''])[0].length;
				size = Math.floor((row.data.length * 3) / 4) - padding;
			}
		}
        
		return {
			type: isDir ? 'dir' : 'file',
			mode: isDir ? 0o040755 : 0o100644,
			size,
			mtimeMs: row.mtime,
			dev: 0,
			ino: 0,
			uid: 0,
			gid: 0,
			ctime: new Date(row.mtime),
			mtime: new Date(row.mtime),
			ctimeMs: row.mtime,
			isFile: () => !isDir,
			isDirectory: () => isDir,
			isSymbolicLink: () => false,
		};
	}

	async lstat(path: string) {
		return await this.stat(path);
	}

	// ==========================================
	// Symlink (used by git for refs)
	// ==========================================

	async symlink(target: string, path: string): Promise<void> {
		await this.writeFile(path, target);
	}

	async readlink(path: string): Promise<string> {
		return (await this.readFile(path, { encoding: 'utf8' })) as string;
	}

	// ==========================================
	// chmod / rename (needed by git.clone checkout)
	// ==========================================

	async chmod(_path: string, _mode: number): Promise<void> {
		// No-op: SQLite FS doesn't track file modes
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldNorm = normalizePath(oldPath);
		const newNorm = normalizePath(newPath);

		const newParts = newNorm.split('/');
		const newParent = newParts.length > 1 ? newParts.slice(0, -1).join('/') : '';

		const rows = this.sql<{ data: ArrayBuffer | null; chunk_index: number; parent_path: string; is_dir: number; size: number; mtime: number }>`
			SELECT data, chunk_index, parent_path, is_dir, size, mtime FROM git_objects WHERE path = ${oldNorm} ORDER BY chunk_index ASC
		`;

		if (rows.length === 0) {
			throw makeErrno(
				`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`,
				'ENOENT',
				-2,
				oldPath
			);
		}

		// Copy chunks to new path, updating parent_path for chunk 0
		for (const row of rows) {
			const parentPath = row.chunk_index === 0 ? newParent : row.parent_path;
			void this.sql`INSERT OR REPLACE INTO git_objects
				(path, chunk_index, parent_path, data, is_dir, size, mtime)
				VALUES (${newNorm}, ${row.chunk_index}, ${parentPath}, ${row.data}, ${row.is_dir}, ${row.size}, ${row.mtime})`;
		}

		// Remove old path
		void this.sql`DELETE FROM git_objects WHERE path = ${oldNorm}`;
	}

	// ==========================================
	// Utilities
	// ==========================================

	async exists(path: string): Promise<boolean> {
		try {
			await this.stat(path);
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
			throw err;
		}
	}

	async write(path: string, data: Uint8Array | string): Promise<void> {
		return await this.writeFile(path, data);
	}

	// ==========================================
	// Export (for git clone protocol)
	// ==========================================

	exportGitObjects(): Array<{ path: string; data: Uint8Array }> {
		const rows = this.sql<{
			path: string;
			data: ArrayBuffer | string | null;
			chunk_index: number;
		}>`
            SELECT path, data, chunk_index FROM git_objects
            WHERE path LIKE '.git/%' AND is_dir = 0
            ORDER BY path, chunk_index
        `;

		const exported: Array<{ path: string; data: Uint8Array }> = [];
		let currentPath = '';
		let currentChunks: Uint8Array[] = [];

		for (const row of rows) {
			if (row.path !== currentPath) {
				if (currentPath && currentChunks.length > 0) {
					exported.push({
						path: currentPath,
						data: concatBuffers(currentChunks),
					});
				}
				currentPath = row.path;
				currentChunks = [];
			}
			currentChunks.push(rowDataToBytes(row.data));
		}

		// Flush last file
		if (currentPath && currentChunks.length > 0) {
			exported.push({
				path: currentPath,
				data: concatBuffers(currentChunks),
			});
		}

		return exported;
	}

	// ==========================================
	// Observability
	// ==========================================

	getStorageStats(): {
		totalObjects: number;
		totalBytes: number;
		largestObject: { path: string; size: number } | null;
	} {
		const stats = this.sql<{ total_files: number; total_bytes: number }>`
            SELECT
                COUNT(DISTINCT path) as total_files,
                COALESCE(SUM(LENGTH(data)), 0) as total_bytes
            FROM git_objects
            WHERE is_dir = 0
        `;

		const largest = this.sql<{ path: string; total_size: number }>`
            SELECT path, SUM(LENGTH(data)) as total_size
            FROM git_objects
            WHERE is_dir = 0
            GROUP BY path
            ORDER BY total_size DESC
            LIMIT 1
        `;

		return {
			totalObjects: stats[0]?.total_files ?? 0,
			totalBytes: stats[0]?.total_bytes ?? 0,
			largestObject: largest[0]
				? { path: largest[0].path, size: largest[0].total_size }
				: null,
		};
	}
}
