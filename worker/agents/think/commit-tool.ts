/**
 * `commit` — lets the Think agent snapshot the current working tree as a git
 * commit in the companion SpaceDO. Commits are the restore points the user can
 * roll back to, so the model decides when a coherent unit of work is worth
 * saving (rather than the harness committing automatically).
 *
 * Runs inside the ThinkAgent DO and talks to the SpaceDO directly via RPC (no
 * round-trip through the parent agent). `deploy_space` still commits+deploys;
 * `commit` is for saving a restore point without (re)deploying.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { withDurableObjectResetRetry, type SpaceWorkspaceStub } from './space-workspace-ops';

const DESCRIPTION = [
	'Commit the current working tree as a restore point the user can roll back to later.',
	'',
	'Call this when you have completed a coherent unit of work and want to save a snapshot — for example before a risky change, or after finishing a feature. Write a short, descriptive commit message (imperative mood, e.g. "Add login form").',
	'',
	'Returns the created commit sha. If there are no changes to commit, it reports that instead — that is not an error. Note that `deploy_space` also commits as part of deploying, so you do not need to call `commit` immediately before deploying.',
].join('\n');

export function createCommitTool(opts: { getStub: () => SpaceWorkspaceStub }): Tool {
	const { getStub } = opts;
	return tool({
		description: DESCRIPTION,
		inputSchema: z.object({
			message: z
				.string()
				.describe('Short, descriptive commit message in imperative mood.'),
		}),
		execute: async (args: { message: string }) => {
			const message = (args.message ?? '').trim() || 'Update project';
			try {
				const result = await withDurableObjectResetRetry(getStub, (stub) =>
					stub.gitCommit(message),
				);
				return JSON.stringify({ ok: true, commit_hash: result.sha, message: result.message });
			} catch {
				// `gitCommit` throws when the tree is clean — surface as a benign
				// "nothing to commit" result rather than a tool error.
				return JSON.stringify({ ok: true, nothing_to_commit: true });
			}
		},
	});
}
