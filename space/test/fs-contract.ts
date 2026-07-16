/**
 * Shared, implementation-agnostic contract for the `@cloudflare/shell`
 * `FileSystem` interface used by the SpaceDO.
 *
 * Both today's `WorkspaceFileSystem` and the future `ArtifactsFileSystem` must
 * pass this identical suite — that equivalence is the guarantee that swapping
 * the filesystem backend does not change observable behavior. Each case is
 * self-contained (unique paths) and asserts with vitest `expect`.
 *
 * Assertions run inside the caller's `runInDurableObject` callback (a real
 * `SqlStorage` isn't serializable across RPC), so a case receives an already
 * constructed `FileSystem` bound to that DO's storage.
 */
import { expect } from 'vitest';
import type { FileSystem } from '@cloudflare/shell';
import { createGit } from '@cloudflare/shell/git';

export interface FsCase {
	name: string;
	run(fs: FileSystem): Promise<void>;
}

const AUTHOR = { name: 'Test', email: 'test@vibesdk.local' };

/** Contract for the `FileSystem` surface the SpaceDO depends on. */
export const fileSystemContractCases: FsCase[] = [
	{
		name: 'writeFile/readFile round-trips utf8 content',
		async run(fs) {
			await fs.writeFile('/hello.txt', 'hello world');
			expect(await fs.readFile('/hello.txt')).toBe('hello world');
		},
	},
	{
		name: 'writeFileBytes/readFileBytes preserve exact bytes (incl. non-utf8)',
		async run(fs) {
			const bytes = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f, 0x0a]);
			await fs.writeFileBytes('/blob.bin', bytes);
			const read = await fs.readFileBytes('/blob.bin');
			expect(Array.from(read)).toEqual(Array.from(bytes));
		},
	},
	{
		name: 'overwrite updates content and size',
		async run(fs) {
			await fs.writeFile('/f.txt', 'short');
			await fs.writeFile('/f.txt', 'a much longer value');
			expect(await fs.readFile('/f.txt')).toBe('a much longer value');
			expect((await fs.stat('/f.txt')).size).toBe('a much longer value'.length);
		},
	},
	{
		name: 'readFile throws ENOENT for a missing path',
		async run(fs) {
			await expect(fs.readFile('/nope.txt')).rejects.toThrow(/ENOENT/i);
		},
	},
	{
		name: 'readFileBytes throws ENOENT for a missing path',
		async run(fs) {
			await expect(fs.readFileBytes('/nope.bin')).rejects.toThrow(/ENOENT/i);
		},
	},
	{
		name: 'stat/lstat throw ENOENT for a missing path',
		async run(fs) {
			await expect(fs.stat('/nope')).rejects.toThrow(/ENOENT/i);
			await expect(fs.lstat('/nope')).rejects.toThrow(/ENOENT/i);
		},
	},
	{
		name: 'exists returns true/false and never throws',
		async run(fs) {
			expect(await fs.exists('/missing')).toBe(false);
			await fs.writeFile('/present.txt', 'x');
			expect(await fs.exists('/present.txt')).toBe(true);
		},
	},
	{
		name: 'stat reports file type and size',
		async run(fs) {
			await fs.writeFile('/sized.txt', '12345');
			const st = await fs.stat('/sized.txt');
			expect(st.type).toBe('file');
			expect(st.size).toBe(5);
		},
	},
	{
		name: 'mkdir (recursive) creates nested directories, stat reports directory',
		async run(fs) {
			await fs.mkdir('/a/b/c', { recursive: true });
			const st = await fs.stat('/a/b/c');
			expect(st.type).toBe('directory');
		},
	},
	{
		name: 'readdir lists entry names; readdirWithFileTypes reports types',
		async run(fs) {
			await fs.mkdir('/dir', { recursive: true });
			await fs.writeFile('/dir/one.txt', '1');
			await fs.writeFile('/dir/two.txt', '2');
			await fs.mkdir('/dir/sub', { recursive: true });

			const names = await fs.readdir('/dir');
			expect([...names].sort()).toEqual(['one.txt', 'sub', 'two.txt']);

			const dirents = await fs.readdirWithFileTypes('/dir');
			const byName = new Map(dirents.map((d) => [d.name, d.type]));
			expect(byName.get('one.txt')).toBe('file');
			expect(byName.get('sub')).toBe('directory');
		},
	},
	{
		name: 'rm removes a file; subsequent read throws ENOENT',
		async run(fs) {
			await fs.writeFile('/gone.txt', 'bye');
			await fs.rm('/gone.txt');
			expect(await fs.exists('/gone.txt')).toBe(false);
			await expect(fs.readFile('/gone.txt')).rejects.toThrow(/ENOENT/i);
		},
	},
	{
		name: 'rm recursive removes a directory tree',
		async run(fs) {
			await fs.mkdir('/tree/inner', { recursive: true });
			await fs.writeFile('/tree/inner/leaf.txt', 'leaf');
			await fs.rm('/tree', { recursive: true });
			expect(await fs.exists('/tree')).toBe(false);
			expect(await fs.exists('/tree/inner/leaf.txt')).toBe(false);
		},
	},
	{
		name: 'rm with force on a missing path is a no-op',
		async run(fs) {
			await expect(fs.rm('/never-existed', { force: true })).resolves.toBeUndefined();
		},
	},
	{
		name: 'appendFile concatenates and creates when absent',
		async run(fs) {
			await fs.appendFile('/log.txt', 'a');
			await fs.appendFile('/log.txt', 'b');
			expect(await fs.readFile('/log.txt')).toBe('ab');
		},
	},
	{
		name: 'cp copies a file leaving the source intact',
		async run(fs) {
			await fs.writeFile('/src.txt', 'copy me');
			await fs.cp('/src.txt', '/dst.txt');
			expect(await fs.readFile('/dst.txt')).toBe('copy me');
			expect(await fs.readFile('/src.txt')).toBe('copy me');
		},
	},
	{
		name: 'mv moves a file (source removed, content preserved)',
		async run(fs) {
			await fs.writeFile('/from.txt', 'move me');
			await fs.mv('/from.txt', '/to.txt');
			expect(await fs.readFile('/to.txt')).toBe('move me');
			expect(await fs.exists('/from.txt')).toBe(false);
		},
	},
	{
		name: 'glob returns sorted absolute paths and matches nested patterns',
		async run(fs) {
			await fs.mkdir('/proj/src', { recursive: true });
			await fs.writeFile('/proj/src/a.ts', 'a');
			await fs.writeFile('/proj/src/b.ts', 'b');
			await fs.writeFile('/proj/readme.md', 'r');

			const ts = await fs.glob('/proj/**/*.ts');
			expect(ts).toEqual(['/proj/src/a.ts', '/proj/src/b.ts']);
			expect([...ts]).toEqual([...ts].sort());
		},
	},
	{
		name: 'symlink/readlink resolve the link target',
		async run(fs) {
			await fs.writeFile('/target.txt', 'real');
			await fs.symlink('/target.txt', '/link.txt');
			expect(await fs.readlink('/link.txt')).toBe('/target.txt');
		},
	},
	{
		name: 'resolvePath joins/normalizes without I/O',
		async run(fs) {
			expect(fs.resolvePath('/a/b', 'c.txt')).toBe('/a/b/c.txt');
			expect(fs.resolvePath('/a/b', '../c.txt')).toBe('/a/c.txt');
		},
	},
];

/** Contract for git operating over any conforming `FileSystem`. */
export const gitOnFsCases: FsCase[] = [
	{
		name: 'init + add + commit produces a retrievable log entry',
		async run(fs) {
			const git = createGit(fs);
			await git.init({ defaultBranch: 'main' });
			await fs.writeFile('/index.ts', 'export const x = 1');
			await git.add({ filepath: '.' });
			const { oid } = await git.commit({ message: 'first', author: AUTHOR });
			expect(oid).toMatch(/^[0-9a-f]{40}$/);

			const log = await git.log({ depth: 10 });
			expect(log.length).toBe(1);
			expect(log[0].oid).toBe(oid);
			expect(log[0].message).toContain('first');
		},
	},
	{
		name: 'status reflects a newly written, unstaged file',
		async run(fs) {
			const git = createGit(fs);
			await git.init({ defaultBranch: 'main' });
			await fs.writeFile('/new.ts', 'x');
			const status = await git.status();
			const entry = status.find((s) => s.filepath === 'new.ts');
			expect(entry).toBeDefined();
		},
	},
	{
		// Observed isomorphic-git behavior (both today and required of any FS
		// backend): checkout REPOPULATES a file that is missing from the working
		// tree with the target commit's content. It does NOT clobber an existing
		// working-tree file — which is exactly why the SpaceDO rollback removes
		// files and rewrites bytes explicitly rather than relying on checkout.
		name: 'checkout repopulates a missing file from the target commit',
		async run(fs) {
			const git = createGit(fs);
			await git.init({ defaultBranch: 'main' });

			await fs.writeFile('/app.ts', 'v1');
			await git.add({ filepath: '.' });
			const first = await git.commit({ message: 'v1', author: AUTHOR });

			await fs.writeFile('/app.ts', 'v2');
			await git.add({ filepath: '.' });
			await git.commit({ message: 'v2', author: AUTHOR });

			await fs.rm('/app.ts', { force: true });
			await git.checkout({ ref: first.oid, force: true });
			expect(await fs.readFile('/app.ts')).toBe('v1');
		},
	},
	{
		name: 'branch lists the current branch and creates new ones',
		async run(fs) {
			const git = createGit(fs);
			await git.init({ defaultBranch: 'main' });
			await fs.writeFile('/f.ts', 'x');
			await git.add({ filepath: '.' });
			await git.commit({ message: 'c', author: AUTHOR });

			const created = await git.branch({ name: 'feature' });
			expect('created' in created && created.created).toBe('feature');

			const listed = await git.branch({ list: true });
			expect('branches' in listed && listed.branches).toContain('feature');
			expect('current' in listed && listed.current).toBe('main');
		},
	},
];
