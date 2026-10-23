import { describe, it, expect } from 'vitest';
import git from '@ashishkumar472/cf-git';
import { GitCloneService } from './git-clone-service';
import { MemFS } from './memfs';
import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

const AGENT = { name: 'Vibesdk', email: 'vibesdk-bot@cloudflare.com' };

const templateDetails: TemplateDetails = {
	name: 'demo-template',
	description: { selection: 'test', usage: 'test' },
	fileTree: { path: '/', type: 'directory', children: [] },
	allFiles: {
		'package.json': '{"name":"demo"}',
		'src/main.tsx': 'template main',
	},
	deps: {},
	projectType: 'app',
	importantFiles: [],
	dontTouchFiles: [],
	redactedFiles: [],
	disabled: false,
};

/** Commit files to an agent repository the way the agent's own git does. */
async function commitToAgentRepo(fs: MemFS, files: Record<string, string>, message: string, timestamp: number): Promise<void> {
	for (const [filepath, contents] of Object.entries(files)) {
		await fs.writeFile(filepath, contents);
		await git.add({ fs, dir: '/', filepath });
	}
	await git.commit({ fs, dir: '/', message, author: { ...AGENT, timestamp, timezoneOffset: 0 } });
}

/** Collect `.git/**` in the shape SqliteFS.exportGitObjects() returns. */
async function exportGitObjects(fs: MemFS, dir = '.git'): Promise<Array<{ path: string; data: Uint8Array }>> {
	const objects: Array<{ path: string; data: Uint8Array }> = [];
	for (const name of await fs.readdir(dir)) {
		const path = `${dir}/${name}`;
		if ((await fs.stat(path)).type === 'dir') {
			objects.push(...(await exportGitObjects(fs, path)));
		} else {
			objects.push({ path, data: (await fs.readFile(path)) as Uint8Array });
		}
	}
	return objects;
}

async function listFilesAt(fs: MemFS, oid: string): Promise<string[]> {
	return (await git.listFiles({ fs, dir: '/', ref: oid })).sort();
}

async function readFileAt(fs: MemFS, oid: string, filepath: string): Promise<string> {
	const { blob } = await git.readBlob({ fs, dir: '/', oid, filepath });
	return new TextDecoder().decode(blob);
}

describe('GitCloneService.buildRepository', () => {
	it('replays each agent commit as a full snapshot on top of the template base', async () => {
		const agentFs = new MemFS();
		await git.init({ fs: agentFs, dir: '/', defaultBranch: 'main' });
		await commitToAgentRepo(agentFs, { 'src/App.tsx': 'v1', 'src/main.tsx': 'agent main' }, 'feat: add app', 1700000000);
		await commitToAgentRepo(agentFs, { 'src/App.tsx': 'v2' }, 'fix: update app', 1700000060);

		const fs = await GitCloneService.buildRepository({
			gitObjects: await exportGitObjects(agentFs),
			templateDetails,
			appQuery: 'build a demo',
			appCreatedAt: new Date(1699999000 * 1000),
		});

		const log = await git.log({ fs, dir: '/', ref: 'HEAD' });
		expect(log.map((entry) => entry.commit.message.trim())).toEqual([
			'fix: update app',
			'feat: add app',
			'Template: demo-template\n\nBase template for build a demo',
		]);

		const [second, first, base] = log;
		expect(base.commit.parent).toEqual([]);
		expect(first.commit.parent).toEqual([base.oid]);
		expect(second.commit.parent).toEqual([first.oid]);
		expect(second.commit.author).toMatchObject({ ...AGENT, timestamp: 1700000060 });

		expect(await listFilesAt(fs, base.oid)).toEqual(['package.json', 'src/main.tsx']);

		expect(await listFilesAt(fs, first.oid)).toEqual(['package.json', 'src/App.tsx', 'src/main.tsx']);
		expect(await readFileAt(fs, first.oid, 'src/App.tsx')).toBe('v1');
		expect(await readFileAt(fs, first.oid, 'src/main.tsx')).toBe('agent main');

		expect(await listFilesAt(fs, second.oid)).toEqual(['package.json', 'src/App.tsx', 'src/main.tsx']);
		expect(await readFileAt(fs, second.oid, 'src/App.tsx')).toBe('v2');
		expect(await readFileAt(fs, second.oid, 'src/main.tsx')).toBe('agent main');
	});
});
