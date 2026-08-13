/**
 * ArtifactRepoViewerPanel — read-only browser for the app's Cloudflare
 * Artifacts repository (durable git history: commits, trees, files).
 *
 * Files are displayed exactly like the "Code" tab: the shared `FileExplorer`
 * tree on the left and a read-only Monaco editor on the right (so theming,
 * fonts, and syntax highlighting match the editor). Content is sourced from
 * this origin's owner-gated proxy at `/api/artifacts` (see worker
 * `ArtifactsController`): the tree is walked from the selected commit and blobs
 * are fetched content-addressed by hash.
 *
 * Navigation is GitHub-like:
 *  - A branch selector (branches come from the SpaceDO git op via
 *    `/api/agent/:id/branches`).
 *  - A commit-history dropdown. Selecting a commit switches the pane into a
 *    diff view: the file list becomes the commit's changed files, and each file
 *    renders as a Monaco diff against its parent-commit version.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, GitCommit, Check, RefreshCw, X, Download, Github } from 'lucide-react';
import { cn } from '@cloudflare/kumo';
import { useArtifactLog } from 'artifacts-viewer/react';
import { createArtifactsClient } from 'artifacts-viewer/client';
import type { ArtifactsClient } from 'artifacts-viewer/client';
import {
	MonacoEditor,
	MonacoDiffEditor,
} from '@/components/monaco-editor/lazy-monaco-editor';
import { FileExplorer } from './file-explorer';
import { getFileType } from '@/utils/string';
import { apiClient } from '@/lib/api-client';
import type { FileType } from '@/api-types';

// Module scope: the viewer's hooks treat the client as a dependency, so a new
// instance per render would refetch forever.
const client = createArtifactsClient({ apiPath: '/api/artifacts' });

const COMMIT_LOG_LIMIT = 30;
/** Guard against pathological repos: stop walking after this many entries. */
const MAX_TREE_ENTRIES = 5000;

interface ArtifactRepoViewerPanelProps {
	/** App agent id == SpaceDO instance name == Artifacts repo name. */
	repoName: string;
	/** Only mount the viewer (and let it fetch) when the Repo tab is active. */
	enabled: boolean;
	/** Open the Clone modal (repo actions live here for think apps). */
	onGitCloneClick?: () => void;
	/** Whether GitHub export is available (files exist / owner). */
	isGitHubExportReady?: boolean;
	/** Open the GitHub export modal. */
	onGitHubExportClick?: () => void;
}

interface WalkedFile {
	path: string;
	hash: string;
}

/** A file that differs between two commit trees, with each side's blob hash. */
interface ChangedFile {
	path: string;
	/** Blob hash on the selected commit side (undefined when deleted). */
	newHash?: string;
	/** Blob hash on the parent side (undefined when added). */
	oldHash?: string;
}

/** Blob-like entry types that carry readable content (excludes gitlink). */
function isBlobLike(type: string): boolean {
	return type === 'blob' || type === 'exec' || type === 'symlink';
}

function shortHash(hash: string): string {
	return hash.slice(0, 7);
}

function relativeTime(epochSeconds: number): string {
	const deltaMs = Date.now() - epochSeconds * 1000;
	const mins = Math.round(deltaMs / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(epochSeconds * 1000).toLocaleDateString();
}

/** Recursively enumerate every file (blob-like entry) under a tree hash. */
async function walkTree(
	c: ArtifactsClient,
	repoName: string,
	treeHash: string,
	prefix: string,
	signal: AbortSignal,
	acc: WalkedFile[],
): Promise<void> {
	if (acc.length >= MAX_TREE_ENTRIES || signal.aborted) return;
	const res = await c.readTree({ repoName, hash: treeHash, signal });
	if (!res.ok) return;
	for (const entry of res.value) {
		if (acc.length >= MAX_TREE_ENTRIES) break;
		const path = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.type === 'tree') {
			await walkTree(c, repoName, entry.hash, path, signal, acc);
		} else if (entry.type !== 'gitlink') {
			// blob | exec | symlink are readable as file content; gitlink is a
			// submodule pointer with nothing to show.
			acc.push({ path, hash: entry.hash });
		}
	}
}

/**
 * Recursively diff two trees, collecting only the files that changed. Exploits
 * git's Merkle property: a directory whose tree hash is identical on both sides
 * is skipped entirely, so `readTree` calls scale with the changed paths rather
 * than the whole repository. `oldTreeHash` null means no parent (initial
 * commit) — every file is reported as added.
 */
async function diffTrees(
	c: ArtifactsClient,
	repoName: string,
	newTreeHash: string | null,
	oldTreeHash: string | null,
	prefix: string,
	signal: AbortSignal,
	out: ChangedFile[],
): Promise<void> {
	if (out.length >= MAX_TREE_ENTRIES || signal.aborted) return;
	// Identical subtree (or nothing to compare) — prune.
	if (newTreeHash && newTreeHash === oldTreeHash) return;

	const [newRes, oldRes] = await Promise.all([
		newTreeHash ? c.readTree({ repoName, hash: newTreeHash, signal }) : Promise.resolve(null),
		oldTreeHash ? c.readTree({ repoName, hash: oldTreeHash, signal }) : Promise.resolve(null),
	]);
	if (signal.aborted) return;

	const newEntries = new Map(newRes?.ok ? newRes.value.map((e) => [e.name, e]) : []);
	const oldEntries = new Map(oldRes?.ok ? oldRes.value.map((e) => [e.name, e]) : []);

	// Enumerate one side of a subtree as all-added / all-deleted.
	const enumerateSide = async (hash: string, path: string, side: 'new' | 'old') => {
		const acc: WalkedFile[] = [];
		await walkTree(c, repoName, hash, path, signal, acc);
		for (const f of acc) {
			out.push(side === 'new' ? { path: f.path, newHash: f.hash } : { path: f.path, oldHash: f.hash });
		}
	};

	for (const name of new Set([...newEntries.keys(), ...oldEntries.keys()])) {
		if (out.length >= MAX_TREE_ENTRIES) break;
		const path = prefix ? `${prefix}/${name}` : name;
		const n = newEntries.get(name);
		const o = oldEntries.get(name);
		const nTree = n?.type === 'tree';
		const oTree = o?.type === 'tree';

		if (nTree && oTree) {
			if (n.hash !== o.hash) await diffTrees(c, repoName, n.hash, o.hash, path, signal, out);
		} else if (n && o && !nTree && !oTree) {
			// Both blob-like: modified when the content hash differs. Non-content
			// entries (gitlink) are ignored.
			if (n.hash !== o.hash && isBlobLike(n.type) && isBlobLike(o.type)) {
				out.push({ path, newHash: n.hash, oldHash: o.hash });
			}
		} else {
			// Present on only one side, or a tree<->blob type change: emit the new
			// side as added and the old side as deleted.
			if (n) {
				if (nTree) await enumerateSide(n.hash, path, 'new');
				else if (isBlobLike(n.type)) out.push({ path, newHash: n.hash });
			}
			if (o) {
				if (oTree) await enumerateSide(o.hash, path, 'old');
				else if (isBlobLike(o.type)) out.push({ path, oldHash: o.hash });
			}
		}
	}
}

async function fetchBlobText(
	repoName: string,
	hash: string | undefined,
	signal?: AbortSignal,
): Promise<string> {
	if (!hash) return '';
	const res = await client.readBlob({ repoName, hash, signal });
	if (!res.ok) return '';
	try {
		return await res.value.text();
	} catch {
		return '';
	}
}

function toFileList(paths: string[]): FileType[] {
	return paths
		.slice()
		.sort((a, b) => a.localeCompare(b))
		.map((p) => ({ filePath: p, fileContents: '', language: getFileType(p) }));
}

export function ArtifactRepoViewerPanel({
	repoName,
	enabled,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
}: ArtifactRepoViewerPanelProps) {
	const [branches, setBranches] = useState<string[]>([]);
	const [currentBranch, setCurrentBranch] = useState<string | null>(null);
	// The ref the viewer renders: a branch name, or a specific commit hash when
	// the user drills into history.
	const [selectedRef, setSelectedRef] = useState<string | undefined>(undefined);
	const [pinnedCommit, setPinnedCommit] = useState<string | null>(null);
	const [showCommits, setShowCommits] = useState(false);

	const [files, setFiles] = useState<FileType[]>([]);
	const [treeLoading, setTreeLoading] = useState(false);
	const [treeError, setTreeError] = useState<string | null>(null);
	const [activeFile, setActiveFile] = useState<FileType | undefined>(undefined);
	const [activeOriginal, setActiveOriginal] = useState<string>('');
	const [contentLoading, setContentLoading] = useState(false);

	// filePath -> blob hash for the selected commit (right/modified side) and,
	// in diff mode, its parent (left/original side).
	const commitHashesRef = useRef<Map<string, string>>(new Map());
	const parentHashesRef = useRef<Map<string, string>>(new Map());
	const contentReqRef = useRef(0);

	const diffMode = pinnedCommit !== null;

	// Load branches once the tab is active.
	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		void (async () => {
			const res = await apiClient.listAppBranches(repoName);
			if (cancelled || !res.success || !res.data) return;
			const data = res.data;
			setBranches(data.branches);
			setCurrentBranch(data.current);
			setSelectedRef((prev) => prev ?? data.current ?? undefined);
		})();
		return () => {
			cancelled = true;
		};
	}, [enabled, repoName]);

	// Resolve the selected ref into a file list. In browse mode that is the full
	// tree; in diff (pinned-commit) mode it is the commit's changed files.
	useEffect(() => {
		if (!enabled) return;
		const controller = new AbortController();
		const signal = controller.signal;
		setTreeLoading(true);
		setTreeError(null);
		setActiveFile(undefined);
		setActiveOriginal('');
		void (async () => {
			try {
				const head = await client.getLog({ repoName, ref: selectedRef, limit: 1, signal });
				if (!head.ok) {
					if (!signal.aborted) setTreeError('Failed to load repository');
					return;
				}
				const commit = head.value[0];
				if (!commit) {
					commitHashesRef.current = new Map();
					parentHashesRef.current = new Map();
					setFiles([]);
					return;
				}

				if (!pinnedCommit) {
					// Browse mode: list every file in the commit tree (a full walk
					// is inherent — we show the whole tree).
					const commitWalked: WalkedFile[] = [];
					await walkTree(client, repoName, commit.treeHash, '', signal, commitWalked);
					if (signal.aborted) return;
					const commitHashes = new Map(commitWalked.map((f) => [f.path, f.hash]));
					commitHashesRef.current = commitHashes;
					parentHashesRef.current = new Map();
					setFiles(toFileList([...commitHashes.keys()]));
					return;
				}

				// Diff mode: resolve the parent tree and compute the changed files
				// via a pruned Merkle tree-diff (skips identical subtrees), rather
				// than walking both trees in full.
				const parentHash = commit.parents[0];
				let parentTreeHash: string | null = null;
				if (parentHash) {
					const parentCommit = await client.readCommit({ repoName, hash: parentHash, signal });
					if (signal.aborted) return;
					if (parentCommit.ok) parentTreeHash = parentCommit.value.treeHash;
				}

				const changed: ChangedFile[] = [];
				await diffTrees(client, repoName, commit.treeHash, parentTreeHash, '', signal, changed);
				if (signal.aborted) return;

				// Per-file hash maps drive the lazy blob fetch in onFileClick.
				const changedNew = new Map<string, string>();
				const changedOld = new Map<string, string>();
				for (const f of changed) {
					if (f.newHash) changedNew.set(f.path, f.newHash);
					if (f.oldHash) changedOld.set(f.path, f.oldHash);
				}
				commitHashesRef.current = changedNew;
				parentHashesRef.current = changedOld;
				setFiles(toFileList(changed.map((f) => f.path)));
			} catch {
				if (!signal.aborted) setTreeError('Failed to load repository');
			} finally {
				if (!signal.aborted) setTreeLoading(false);
			}
		})();
		return () => controller.abort();
	}, [enabled, repoName, selectedRef, pinnedCommit]);

	const log = useArtifactLog(client, {
		repoName,
		ref: selectedRef,
		limit: COMMIT_LOG_LIMIT,
	});
	const commits = useMemo(() => (log.status === 'success' ? log.data : []), [log]);

	const activeBranch = pinnedCommit ? null : selectedRef ?? currentBranch;

	const onSelectBranch = (branch: string) => {
		setPinnedCommit(null);
		setSelectedRef(branch);
		setShowCommits(false);
	};

	const onSelectCommit = (hash: string) => {
		setPinnedCommit(hash);
		setSelectedRef(hash);
		setShowCommits(false);
	};

	const resetToBranch = () => {
		setPinnedCommit(null);
		setSelectedRef(currentBranch ?? undefined);
	};

	const onFileClick = useCallback(
		(file: FileType) => {
			const path = file.filePath;
			setActiveFile(file);
			const reqId = ++contentReqRef.current;
			setContentLoading(true);
			void (async () => {
				const modified = await fetchBlobText(repoName, commitHashesRef.current.get(path));
				const original = pinnedCommit
					? await fetchBlobText(repoName, parentHashesRef.current.get(path))
					: '';
				if (reqId !== contentReqRef.current) return;
				setActiveOriginal(original);
				setActiveFile({ ...file, fileContents: modified });
				setContentLoading(false);
			})();
		},
		[repoName, pinnedCommit],
	);

	if (!enabled) return null;

	return (
		<div className="flex-1 flex flex-col overflow-hidden bg-kumo-base text-text-primary">
			<div className="relative flex items-center gap-2 px-3 py-2 border-b border-bg-2 bg-bg-4/40">
				{/* Branch selector */}
				<div className="flex items-center gap-1.5">
					<GitBranch className="size-4 text-text-50/70" />
					<select
						className="bg-bg-1 text-text-primary text-xs rounded-md px-2 py-1 border border-bg-2 focus:outline-none focus:ring-1 focus:ring-brand"
						value={pinnedCommit ? '' : activeBranch ?? ''}
						onChange={(e) => onSelectBranch(e.target.value)}
					>
						{pinnedCommit && (
							<option value="" disabled>
								detached: {shortHash(pinnedCommit)}
							</option>
						)}
						{branches.length === 0 && activeBranch && (
							<option value={activeBranch}>{activeBranch}</option>
						)}
						{branches.map((b) => (
							<option key={b} value={b}>
								{b}
							</option>
						))}
					</select>
				</div>

				{/* Commit history toggle */}
				<button
					onClick={() => setShowCommits((v) => !v)}
					className={cn(
						'flex items-center gap-1.5 text-xs rounded-md px-2 py-1 transition-colors',
						showCommits
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-bg-4/60',
					)}
					title="Commit history"
				>
					<GitCommit className="size-4" />
					Commits
				</button>

				{pinnedCommit && (
					<button
						onClick={resetToBranch}
						className="flex items-center gap-1 text-xs text-text-50/70 hover:text-text-primary rounded-md px-2 py-1 hover:bg-bg-4/60 transition-colors"
						title="Back to branch"
					>
						<X className="size-3.5" />
						diff {shortHash(pinnedCommit)} · {files.length} changed
					</button>
				)}

				<div className="ml-auto flex items-center gap-2">
					{(treeLoading || contentLoading || log.status === 'loading') && (
						<RefreshCw className="size-3.5 animate-spin text-text-50/40" />
					)}
					{onGitCloneClick && (
						<button
							onClick={onGitCloneClick}
							className="flex items-center gap-1.5 text-xs rounded-md px-2 py-1 text-text-50/70 hover:text-text-primary hover:bg-bg-4/60 transition-colors"
							title="Clone to local machine"
						>
							<Download className="size-4" />
							Clone
						</button>
					)}
					{onGitHubExportClick && isGitHubExportReady && (
						<button
							onClick={onGitHubExportClick}
							className="flex items-center gap-1.5 text-xs rounded-md px-2 py-1 text-text-50/70 hover:text-text-primary hover:bg-bg-4/60 transition-colors"
							title="Export to GitHub"
						>
							<Github className="size-4" />
							GitHub
						</button>
					)}
					<span className="text-xs font-mono text-text-50/40">read-only</span>
				</div>

				{/* Commit dropdown */}
				{showCommits && (
					<div className="absolute left-3 top-full z-20 mt-1 w-[28rem] max-w-[calc(100%-1.5rem)] max-h-96 overflow-auto rounded-md border border-bg-2 bg-kumo-elevated shadow-lg">
						{log.status === 'error' && (
							<div className="px-3 py-3 text-xs text-red-500/80">
								Failed to load commits
							</div>
						)}
						{log.status === 'success' && commits.length === 0 && (
							<div className="px-3 py-3 text-xs text-text-50/50">No commits yet</div>
						)}
						{commits.map((commit) => {
							const isActive = pinnedCommit === commit.hash;
							return (
								<button
									key={commit.hash}
									onClick={() => onSelectCommit(commit.hash)}
									className={cn(
										'w-full flex items-start gap-2 px-3 py-2 text-left border-b border-bg-2/60 last:border-b-0 transition-colors hover:bg-bg-4/60',
										isActive && 'bg-bg-4/80',
									)}
								>
									<GitCommit className="size-4 mt-0.5 shrink-0 text-text-50/60" />
									<div className="min-w-0 flex-1">
										<div className="truncate text-xs text-text-primary">
											{commit.message.split('\n')[0]}
										</div>
										<div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-50/50">
											<span className="font-mono">{shortHash(commit.hash)}</span>
											<span className="truncate">{commit.author.name}</span>
											<span>{relativeTime(commit.authoredAt)}</span>
										</div>
									</div>
									{isActive && <Check className="size-4 shrink-0 text-brand" />}
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* File display — mirrors the Code tab: FileExplorer + Monaco. In diff
			    mode the right pane is a Monaco diff against the parent commit. */}
			<div className="flex-1 relative">
				<div className="absolute inset-0 flex">
					<FileExplorer
						files={files}
						currentFile={activeFile}
						onFileClick={onFileClick}
					/>
					<div className="flex-1 min-w-0">
						{treeError ? (
							<div className="flex h-full items-center justify-center text-sm text-red-500/80">
								{treeError}
							</div>
						) : activeFile ? (
							diffMode ? (
								<MonacoDiffEditor
									className="h-full"
									path={activeFile.filePath}
									originalValue={activeOriginal}
									modifiedValue={activeFile.fileContents || ''}
									language={activeFile.language || 'plaintext'}
								/>
							) : (
								<MonacoEditor
									className="h-full"
									path={activeFile.filePath}
									createOptions={{
										value: activeFile.fileContents || '',
										language: activeFile.language || 'plaintext',
										readOnly: true,
										minimap: { enabled: false },
										lineNumbers: 'on',
										scrollBeyondLastLine: false,
										fontSize: 13,
										automaticLayout: true,
									}}
								/>
							)
						) : (
							<div className="flex h-full items-center justify-center text-sm text-text-50/50">
								{treeLoading
									? 'Loading repository…'
									: diffMode
										? 'Select a changed file to view its diff'
										: 'Select a file to view'}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
