/**
 * CheckpointStore tests against a real DO `SqlStorage` (via the FsHarnessDO
 * harness, same pattern as the FileSystem contract tests).
 *
 * The checkpoint is the durability layer for UNCOMMITTED workspace writes: it
 * must survive a DO reset even when nothing was ever pushed to Artifacts
 * (the "files missing until first deploy" bug).
 */
import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { CheckpointStore } from '../src/space/checkpoint';
import type {} from './test-env';

function uniqueStub(name: string) {
	const id = env.FsHarnessDO.idFromName(`ckpt-${name}-${Date.now()}-${Math.random()}`);
	return env.FsHarnessDO.get(id);
}

const encoder = new TextEncoder();

describe('CheckpointStore', () => {
	it('saves and loads file bytes', async () => {
		await runInDurableObject(uniqueStub('roundtrip'), async (_instance, state) => {
			const store = new CheckpointStore(state.storage);
			store.save('/a.ts', encoder.encode('aaa'));
			store.save('/dir/b.ts', encoder.encode('bbb'));

			const { files, tombstones } = store.load();
			expect(tombstones).toEqual([]);
			const map = new Map(files.map(([p, b]) => [p, new TextDecoder().decode(b)]));
			expect(map.get('/a.ts')).toBe('aaa');
			expect(map.get('/dir/b.ts')).toBe('bbb');
		});
	});

	it('overwrites a path with the latest bytes', async () => {
		await runInDurableObject(uniqueStub('overwrite'), async (_instance, state) => {
			const store = new CheckpointStore(state.storage);
			store.save('/a.ts', encoder.encode('v1'));
			store.save('/a.ts', encoder.encode('v2'));

			const { files } = store.load();
			expect(files).toHaveLength(1);
			expect(new TextDecoder().decode(files[0][1])).toBe('v2');
		});
	});

	it('tombstones a deletion and drops rows beneath it', async () => {
		await runInDurableObject(uniqueStub('tombstone'), async (_instance, state) => {
			const store = new CheckpointStore(state.storage);
			store.save('/keep.ts', encoder.encode('k'));
			store.save('/dir/a.ts', encoder.encode('a'));
			store.save('/dir/nested/b.ts', encoder.encode('b'));

			store.save('/dir', null);

			const { files, tombstones } = store.load();
			expect(files.map(([p]) => p)).toEqual(['/keep.ts']);
			expect(tombstones).toEqual(['/dir']);
		});
	});

	it('a re-save after a tombstone replaces the tombstone for that path', async () => {
		await runInDurableObject(uniqueStub('resave'), async (_instance, state) => {
			const store = new CheckpointStore(state.storage);
			store.save('/f.ts', encoder.encode('v1'));
			store.save('/f.ts', null);
			store.save('/f.ts', encoder.encode('v2'));

			const { files, tombstones } = store.load();
			expect(tombstones).toEqual([]);
			expect(files).toHaveLength(1);
			expect(new TextDecoder().decode(files[0][1])).toBe('v2');
		});
	});

	it('clear drops every row (post-push reset)', async () => {
		await runInDurableObject(uniqueStub('clear'), async (_instance, state) => {
			const store = new CheckpointStore(state.storage);
			store.save('/a.ts', encoder.encode('a'));
			store.save('/b.ts', null);
			store.clear();

			const { files, tombstones } = store.load();
			expect(files).toEqual([]);
			expect(tombstones).toEqual([]);
		});
	});

	it('persists across store instances bound to the same storage (cold start)', async () => {
		const stub = uniqueStub('persist');
		await runInDurableObject(stub, async (_instance, state) => {
			new CheckpointStore(state.storage).save('/survives.ts', encoder.encode('yes'));
		});
		// A "cold-started" DO constructs a fresh store over the same storage.
		await runInDurableObject(stub, async (_instance, state) => {
			const { files } = new CheckpointStore(state.storage).load();
			expect(files).toHaveLength(1);
			expect(files[0][0]).toBe('/survives.ts');
		});
	});
});
