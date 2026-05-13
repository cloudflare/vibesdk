import { describe, expect, it } from 'vitest';

import { resolveBuildArtifacts } from './sandboxSdkClient';

type Session = Parameters<typeof resolveBuildArtifacts>[0];

function fakeSession(files: Record<string, string>): Session {
	return {
		async exec(cmd) {
			const m = cmd.match(/^find (\S+) -maxdepth 2 -name wrangler\.json/);
			if (!m) return { exitCode: 1, stdout: '', stderr: 'unexpected exec' };
			const root = m[1];
			const matches = Object.keys(files).filter(p => p.startsWith(`${root}/`) && p.endsWith('/wrangler.json'));
			return { exitCode: 0, stdout: matches.join('\n'), stderr: '' };
		},
		async readFile(path) {
			return path in files ? { success: true, content: files[path] } : { success: false };
		},
	};
}

describe('resolveBuildArtifacts', () => {
	it('reads the plugin-emitted wrangler.json and resolves ../client to a dist sibling', async () => {
		// Verbatim shape from `bun run build` of a typical vite-plugin generated app.
		const session = fakeSession({
			'/workspace/i-abc/dist/lumina_hello_world/wrangler.json': JSON.stringify({
				name: 'lumina-hello-world',
				main: 'index.js',
				assets: { directory: '../client' },
			}),
		});

		expect(await resolveBuildArtifacts(session, 'i-abc', 'lumina-hello-world')).toEqual({
			workerPath: '/workspace/i-abc/dist/lumina_hello_world/index.js',
			assetsPath: '/workspace/i-abc/dist/client',
		});
	});

	it('picks the env dir matching workerName when multiple are emitted', async () => {
		const session = fakeSession({
			'/workspace/i-abc/dist/api/wrangler.json': JSON.stringify({ name: 'api', main: 'index.js' }),
			'/workspace/i-abc/dist/web/wrangler.json': JSON.stringify({
				name: 'web', main: 'index.js', assets: { directory: '../client' },
			}),
		});

		expect(await resolveBuildArtifacts(session, 'i-abc', 'web')).toEqual({
			workerPath: '/workspace/i-abc/dist/web/index.js',
			assetsPath: '/workspace/i-abc/dist/client',
		});
	});

	it('falls back to legacy dist/index.js paths when no nested wrangler.json exists', async () => {
		// Byte-for-byte the strings the deploy code used before the nested layout.
		expect(await resolveBuildArtifacts(fakeSession({}), 'i-abc', 'anything')).toEqual({
			workerPath: '/workspace/i-abc/dist/index.js',
			assetsPath: 'i-abc/dist/client',
		});
	});
});
