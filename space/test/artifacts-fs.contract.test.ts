/**
 * ArtifactsFileSystem tests.
 *
 * 1. No-base mode (no BaseSnapshotSource): must pass the SAME shared
 *    FileSystem + git-on-FS contract as WorkspaceFileSystem — this is the
 *    drop-in-equivalence guarantee for the migration.
 * 2. Base mode (fake in-memory source): verifies the overlay/base/whiteout and
 *    on-demand hydration semantics that make Artifacts the source of truth.
 *
 * The overlay is an in-memory `InMemoryFs` — the same backing store SpaceDO
 * uses in production (no SQLite for file storage).
 */
import { describe, it, expect } from 'vitest';
import { InMemoryFs, type FileSystem } from '@cloudflare/shell';
import { ArtifactsFileSystem } from '../src/space/artifacts-fs';
import { globInfos } from '../src/space/fileinfo';
import type { BaseEntry, BaseSnapshot, BaseSnapshotSource } from '../src/space/git-objects';
import type { CheckpointSource, CheckpointSnapshot } from '../src/space/checkpoint';
import { fileSystemContractCases, gitOnFsCases, type FsCase } from './fs-contract';
import type {} from './test-env';

function overlayFor(): FileSystem {
	return new InMemoryFs();
}

// ── 1. No-base mode: shared contract equivalence ────────────────────

function runContractCase(kase: FsCase) {
	it(kase.name, async () => {
		// Empty base => the FS must behave exactly like the overlay. This is the
		// drop-in-equivalence guarantee: an Artifacts repo with no commits yet
		// is indistinguishable from a plain in-memory overlay.
		const fs = new ArtifactsFileSystem(overlayFor(), {
			source: new FakeBaseSource({}),
			branch: 'main',
		});
		await kase.run(fs);
	});
}

describe('ArtifactsFileSystem (empty base) — FileSystem contract', () => {
	for (const kase of fileSystemContractCases) runContractCase(kase);
});

describe('ArtifactsFileSystem (empty base) — git-on-FS contract', () => {
	for (const kase of gitOnFsCases) runContractCase(kase);
});

describe('globInfos', () => {
	it('includes root-level files for relative glob patterns', async () => {
		const fs = overlayFor();
		await fs.writeFile('/wrangler.json', '{}');
		await fs.writeFile('/src/index.ts', 'export default {}');

		const infos = await globInfos(fs, '**/*');

		expect(infos.map((info) => info.path)).toEqual(['/src', '/src/index.ts', '/wrangler.json']);
	});
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
		const source = new FakeBaseSource(entries);
		const fs = new ArtifactsFileSystem(overlayFor(), { source, branch: 'main' });
		await run(fs, source);
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

// ── 3. Transient base-load failure recovery ───────────────────────
//
// A cold-start fetch can fail transiently (timeout, network blip). The failure
// must NOT be cached: previously pushed files would stay invisible for the
// whole DO lifetime, and the next partial commit + force-push would delete
// them from Artifacts. The FS degrades to overlay-only and retries on the next
// access.

/** A base source whose loadSnapshot can be made to fail on demand. */
class FlakyBaseSource extends FakeBaseSource {
	fail = false;
	loadAttempts = 0;

	override async loadSnapshot(): Promise<BaseSnapshot> {
		this.loadAttempts++;
		if (this.fail) throw new Error('transient fetch failure');
		return super.loadSnapshot();
	}
}

describe('ArtifactsFileSystem (transient base-load failure)', () => {
	it('degrades to overlay-only and retries the base load on the next access', async () => {
		const source = new FlakyBaseSource({ '/app.ts': 'from-base' });
		source.fail = true;
		const fs = new ArtifactsFileSystem(overlayFor(), { source, branch: 'main' });

		// During the outage the base file is invisible, but the FS keeps working.
		expect(await fs.exists('/app.ts')).toBe(false);
		expect(source.loadAttempts).toBe(1);

		// After recovery the next access retries and the base file appears.
		source.fail = false;
		expect(await fs.exists('/app.ts')).toBe(true);
		expect(await fs.readFile('/app.ts')).toBe('from-base');
		expect(source.loadAttempts).toBe(2);
	});

	it('re-materializes listings that already ran base-less during the outage', async () => {
		const source = new FlakyBaseSource({ '/app.ts': 'from-base' });
		source.fail = true;
		const fs = new ArtifactsFileSystem(overlayFor(), { source, branch: 'main' });

		// A listing during the outage materializes nothing (and caches that).
		await fs.writeFile('/local.txt', 'local');
		expect(await fs.readdir('/')).toEqual(['local.txt']);

		// After recovery, listings must include the late-arriving base files.
		source.fail = false;
		const names = await fs.readdir('/');
		expect(names).toContain('local.txt');
		expect(names).toContain('app.ts');
		expect(await fs.readFile('/app.ts')).toBe('from-base');
	});
});

// ── 4. Checkpoint restore (durable uncommitted work) ────────────────
//
// The checkpoint mirrors overlay writes into DO storage so they survive a DO
// reset even when nothing was ever pushed to Artifacts (the "files missing
// until first deploy" bug). On cold start it is replayed over the base.

class FakeCheckpoint implements CheckpointSource {
	constructor(private readonly snapshot: CheckpointSnapshot) {}
	load(): CheckpointSnapshot {
		return this.snapshot;
	}
}

function ckptFiles(entries: Record<string, string>): Array<[string, Uint8Array]> {
	return Object.entries(entries).map(([p, c]) => [p, enc.encode(c)]);
}

describe('ArtifactsFileSystem (checkpoint restore)', () => {
	it('restores checkpointed files over an empty base (pre-first-deploy recovery)', async () => {
		const fs = new ArtifactsFileSystem(overlayFor(), {
			source: new FakeBaseSource({}),
			branch: 'main',
			checkpoint: new FakeCheckpoint({ files: ckptFiles({ '/src/App.tsx': '<App/>', '/package.json': '{}' }), tombstones: [] }),
		});

		expect(await fs.readFile('/src/App.tsx')).toBe('<App/>');
		expect(await fs.readFile('/package.json')).toBe('{}');
		expect((await fs.readdir('/')).sort()).toEqual(['package.json', 'src']);
	});

	it('checkpoint content shadows the base version of the same file', async () => {
		const fs = new ArtifactsFileSystem(overlayFor(), {
			source: new FakeBaseSource({ '/app.ts': 'from-base' }),
			branch: 'main',
			checkpoint: new FakeCheckpoint({ files: ckptFiles({ '/app.ts': 'checkpoint-newer' }), tombstones: [] }),
		});

		expect(await fs.readFile('/app.ts')).toBe('checkpoint-newer');
	});

	it('a tombstone hides the base file; a dir tombstone hides everything beneath it', async () => {
		const fs = new ArtifactsFileSystem(overlayFor(), {
			source: new FakeBaseSource({ '/gone.ts': 'x', '/dir/a.ts': 'a', '/dir/nested/b.ts': 'b', '/keep.ts': 'k' }),
			branch: 'main',
			checkpoint: new FakeCheckpoint({ files: [], tombstones: ['/gone.ts', '/dir'] }),
		});

		expect(await fs.exists('/gone.ts')).toBe(false);
		expect(await fs.exists('/dir/a.ts')).toBe(false);
		expect(await fs.exists('/dir/nested/b.ts')).toBe(false);
		expect(await fs.exists('/keep.ts')).toBe(true);
		await expect(fs.readFile('/dir/a.ts')).rejects.toThrow(/ENOENT/i);
	});

	it('checkpoint files stay visible even while the base load is failing', async () => {
		const source = new FlakyBaseSource({ '/app.ts': 'from-base' });
		source.fail = true;
		const fs = new ArtifactsFileSystem(overlayFor(), {
			source,
			branch: 'main',
			checkpoint: new FakeCheckpoint({ files: ckptFiles({ '/wip.ts': 'uncommitted' }), tombstones: [] }),
		});

		// Base unreachable: the checkpoint (uncommitted work) must still restore.
		expect(await fs.readFile('/wip.ts')).toBe('uncommitted');
		expect(await fs.exists('/app.ts')).toBe(false);

		// Base recovers: both layers are visible, checkpoint still shadows.
		source.fail = false;
		expect(await fs.readFile('/app.ts')).toBe('from-base');
		expect(await fs.readFile('/wip.ts')).toBe('uncommitted');
	});

	it('a file row under a tombstoned dir (rewritten after the delete) stays visible', async () => {
		const fs = new ArtifactsFileSystem(overlayFor(), {
			source: new FakeBaseSource({ '/dir/old.ts': 'old' }),
			branch: 'main',
			checkpoint: new FakeCheckpoint({ files: ckptFiles({ '/dir/new.ts': 'new' }), tombstones: ['/dir'] }),
		});

		expect(await fs.exists('/dir/old.ts')).toBe(false);
		expect(await fs.readFile('/dir/new.ts')).toBe('new');
	});
});
