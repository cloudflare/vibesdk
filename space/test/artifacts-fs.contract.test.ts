/**
 * ArtifactsFileSystem tests.
 *
 * 1. No-base mode (no BaseSnapshotSource): must pass the SAME shared
 *    FileSystem + git-on-FS contract as WorkspaceFileSystem — this is the
 *    drop-in-equivalence guarantee for the migration.
 * 2. Base mode (fake in-memory source): verifies the overlay/base/whiteout and
 *    on-demand hydration semantics that make Artifacts the source of truth.
 *
 * Real SqlStorage for the overlay comes from the empty `FsHarnessDO` via
 * `runInDurableObject`; each case gets a fresh DO instance.
 */
import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { Workspace, WorkspaceFileSystem, type FileSystem } from '@cloudflare/shell';
import type { SqlStorage } from '@cloudflare/workers-types';
import { ArtifactsFileSystem } from '../src/space/artifacts-fs';
import type { BaseEntry, BaseSnapshot, BaseSnapshotSource } from '../src/space/git-objects';
import { fileSystemContractCases, gitOnFsCases, type FsCase } from './fs-contract';
import type {} from './test-env';

function uniqueStub(name: string) {
	const id = env.FsHarnessDO.idFromName(`afs-${name}-${Date.now()}-${Math.random()}`);
	return env.FsHarnessDO.get(id);
}

function overlayFor(sql: SqlStorage): FileSystem {
	return new WorkspaceFileSystem(new Workspace({ sql, name: 'test' }));
}

// ── 1. No-base mode: shared contract equivalence ────────────────────

function runContractCase(kase: FsCase) {
	it(kase.name, async () => {
		const stub = uniqueStub(kase.name);
		await runInDurableObject(stub, async (_i, state) => {
			// No source => the FS must behave exactly like the overlay.
			const fs = new ArtifactsFileSystem(overlayFor(state.storage.sql));
			await kase.run(fs);
		});
	});
}

describe('ArtifactsFileSystem (no base) — FileSystem contract', () => {
	for (const kase of fileSystemContractCases) runContractCase(kase);
});

describe('ArtifactsFileSystem (no base) — git-on-FS contract', () => {
	for (const kase of gitOnFsCases) runContractCase(kase);
});

// ── 2. Base mode: overlay/base/whiteout/hydration ───────────────────

const enc = new TextEncoder();

/** Minimal in-memory base source for exercising ArtifactsFileSystem semantics. */
class FakeBaseSource implements BaseSnapshotSource {
	private readonly blobs: Map<string, Uint8Array>;
	private readonly files: Map<string, BaseEntry>;
	readBlobCalls = 0;

	constructor(entries: Record<string, string>) {
		this.blobs = new Map();
		this.files = new Map();
		let n = 0;
		for (const [path, content] of Object.entries(entries)) {
			const oid = `oid${n++}`;
			this.blobs.set(oid, enc.encode(content));
			this.files.set(path, { oid, mode: 33188 });
		}
	}

	async loadSnapshot(): Promise<BaseSnapshot> {
		return { head: 'f'.repeat(40), files: new Map(this.files) };
	}

	async readBlob(oid: string): Promise<Uint8Array> {
		this.readBlobCalls++;
		const b = this.blobs.get(oid);
		if (!b) throw new Error(`unknown blob ${oid}`);
		return b;
	}
}

function withBase(
	name: string,
	entries: Record<string, string>,
	run: (fs: ArtifactsFileSystem, source: FakeBaseSource) => Promise<void>,
) {
	it(name, async () => {
		const stub = uniqueStub(name);
		await runInDurableObject(stub, async (_i, state) => {
			const source = new FakeBaseSource(entries);
			const fs = new ArtifactsFileSystem(overlayFor(state.storage.sql), { source, branch: 'main' });
			await run(fs, source);
		});
	});
}

describe('ArtifactsFileSystem (with base)', () => {
	withBase('reads a base file, hydrating on demand', { '/base.txt': 'from-base' }, async (fs, source) => {
		expect(await fs.readFile('/base.txt')).toBe('from-base');
		expect(source.readBlobCalls).toBeGreaterThan(0);
	});

	withBase('exists is true for a base file and its ancestor dir without hydration', { '/dir/nested.txt': 'x' }, async (fs, source) => {
		expect(await fs.exists('/dir/nested.txt')).toBe(true);
		expect(await fs.exists('/dir')).toBe(true);
		expect(await fs.exists('/missing')).toBe(false);
		expect(source.readBlobCalls).toBe(0); // existence needs no blob read
	});

	withBase('stat reports base file type and size', { '/base.txt': 'twelve bytes' }, async (fs) => {
		const st = await fs.stat('/base.txt');
		expect(st.type).toBe('file');
		expect(st.size).toBe('twelve bytes'.length);
	});

	withBase('stat reports a base-only directory', { '/dir/a.txt': 'a' }, async (fs) => {
		const st = await fs.stat('/dir');
		expect(st.type).toBe('directory');
	});

	withBase('overlay write shadows the base file', { '/base.txt': 'from-base' }, async (fs) => {
		await fs.writeFile('/base.txt', 'overridden');
		expect(await fs.readFile('/base.txt')).toBe('overridden');
	});

	withBase('rm tombstones a base file (whiteout): read throws, exists false', { '/base.txt': 'from-base' }, async (fs) => {
		await fs.rm('/base.txt');
		expect(await fs.exists('/base.txt')).toBe(false);
		await expect(fs.readFile('/base.txt')).rejects.toThrow(/ENOENT/i);
	});

	withBase(
		'glob materializes base files, excludes /.afs bookkeeping',
		{ '/src/a.ts': 'a', '/src/b.ts': 'b' },
		async (fs) => {
			const ts = await fs.glob('/src/**/*.ts');
			expect(ts).toEqual(['/src/a.ts', '/src/b.ts']);
			const all = await fs.glob('/**/*');
			expect(all.some((p) => p.startsWith('/.afs'))).toBe(false);
		},
	);

	withBase('readdir root includes base entries and hides .afs', { '/a.txt': 'a', '/dir/b.txt': 'b' }, async (fs) => {
		const names = await fs.readdir('/');
		expect(names).toContain('a.txt');
		expect(names).toContain('dir');
		expect(names).not.toContain('.afs');
	});

	withBase('rewriting a whiteouted base path restores visibility', { '/base.txt': 'from-base' }, async (fs) => {
		await fs.rm('/base.txt');
		expect(await fs.exists('/base.txt')).toBe(false);
		await fs.writeFile('/base.txt', 'recreated');
		expect(await fs.readFile('/base.txt')).toBe('recreated');
		expect(await fs.exists('/base.txt')).toBe(true);
	});
});
