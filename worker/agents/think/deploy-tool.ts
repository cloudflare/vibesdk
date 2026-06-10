/**
 * `deploy_space` — commits
 * the working tree and deploys a SpaceDO branch so the preview at
 * `/space/:name/preview/:branch/` rebuilds. The skills (see
 * `skills/app-file-structure`) instruct the model to call this after writing
 * files; pair it with `get_browser_console_logs` to verify the preview.
 *
 * Runs inside the ThinkAgent DO and talks to the companion SpaceDO directly via
 * RPC (no round-trip through the busy parent agent).
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { SpaceWorkspaceStub } from './space-workspace-ops';

const DESCRIPTION = [
	'Commit the current working tree and deploy a branch so its preview rebuilds and serves the latest code.',
	'',
	'Call this after writing/editing files to make changes visible in the preview. Returns the deploy result as JSON, including the preview path and any build errors — read those errors and fix the code if the build failed, then redeploy.',
	'',
	"Defaults to the 'main' branch.",
].join('\n');

export function createDeploySpaceTool(opts: { getStub: () => SpaceWorkspaceStub }): Tool {
	const { getStub } = opts;
	return tool({
		description: DESCRIPTION,
		inputSchema: z.object({
			branch: z
				.string()
				.optional()
				.describe("Git branch to deploy. Defaults to 'main'."),
		}),
		execute: async (args: { branch?: string }) => {
			const branch = args.branch && args.branch.length > 0 ? args.branch : 'main';
			const stub = getStub();
			try {
				await stub.gitCommit('deploy: snapshot working tree');
			} catch {
				// No changes to commit (clean tree) — proceed to deploy the existing HEAD.
			}
			try {
				const result = await stub.deploy(branch);
				return JSON.stringify({ branch, ...(result as Record<string, unknown>) }, null, 2);
			} catch (e) {
				return JSON.stringify({
					branch,
					error: `Deploy failed: ${e instanceof Error ? e.message : String(e)}`,
				});
			}
		},
	});
}
