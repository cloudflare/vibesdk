/**
 * Baseline: the current `WorkspaceFileSystem` must satisfy the shared
 * FileSystem + git-on-FS contract. When `ArtifactsFileSystem` lands, a sibling
 * test file runs the same `fileSystemContractCases`/`gitOnFsCases` against it,
 * proving the swap is a behavioral drop-in.
 *
 * A real `SqlStorage` is obtained from an empty harness Durable Object
 * (`FsHarnessDO`) via `runInDurableObject`; each case gets a fresh DO instance
 * (unique id) so storage is isolated.
 */
import { describe, it } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { Workspace, WorkspaceFileSystem } from '@cloudflare/shell';
import { fileSystemContractCases, gitOnFsCases, type FsCase } from './fs-contract';
import type {} from './test-env';

function uniqueStub(name: string) {
	const id = env.FsHarnessDO.idFromName(`fs-${name}-${Date.now()}-${Math.random()}`);
	return env.FsHarnessDO.get(id);
}

function runCase(kase: FsCase) {
	it(kase.name, async () => {
		const stub = uniqueStub(kase.name);
		await runInDurableObject(stub, async (_instance, state) => {
			const workspace = new Workspace({ sql: state.storage.sql, name: 'test' });
			const fs = new WorkspaceFileSystem(workspace);
			await kase.run(fs);
		});
	});
}

describe('WorkspaceFileSystem — FileSystem contract', () => {
	for (const kase of fileSystemContractCases) runCase(kase);
});

describe('WorkspaceFileSystem — git-on-FS contract', () => {
	for (const kase of gitOnFsCases) runCase(kase);
});
