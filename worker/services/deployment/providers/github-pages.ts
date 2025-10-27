import { createObjectLogger } from '../../../logger';
import type {
	IDeploymentProvider,
	DeploymentProvider,
	DeploymentResult,
	DeploymentOptions,
	DeploymentConfig,
	DeploymentStatus,
} from '../types';

const logger = createObjectLogger('GitHubPagesProvider');

interface GitHubRepository {
	id: number;
	name: string;
	full_name: string;
	html_url: string;
	default_branch: string;
	has_pages: boolean;
}

interface GitHubPages {
	url: string;
	status: 'built' | 'building' | null;
	html_url?: string;
}

interface GitHubCreateUpdateFileResponse {
	content: {
		name: string;
		path: string;
		sha: string;
	};
	commit: {
		sha: string;
		message: string;
	};
}

interface GitHubTreeItem {
	path: string;
	mode: '100644' | '100755' | '040000' | '160000' | '120000';
	type: 'blob' | 'tree' | 'commit';
	sha?: string;
	content?: string;
}

interface GitHubTree {
	sha: string;
	url: string;
	tree: GitHubTreeItem[];
}

interface GitHubCommit {
	sha: string;
	url: string;
}

interface GitHubReference {
	ref: string;
	url: string;
	object: {
		sha: string;
		type: string;
		url: string;
	};
}

export class GitHubPagesDeploymentProvider implements IDeploymentProvider {
	readonly name: DeploymentProvider = 'github-pages';
	private readonly apiBaseUrl = 'https://api.github.com';

	async deploy(options: DeploymentOptions, config: DeploymentConfig): Promise<DeploymentResult> {
		try {
			logger.info('Starting GitHub Pages deployment', {
				projectName: options.projectName,
				fileCount: options.files.size,
				repo: config.githubRepo,
			});

			if (!config.githubToken) {
				throw new Error('GitHub token is required');
			}

			if (!config.githubRepo) {
				throw new Error('GitHub repository is required (format: owner/repo)');
			}

			const [owner, repo] = config.githubRepo.split('/');
			if (!owner || !repo) {
				throw new Error('Invalid repository format. Expected: owner/repo');
			}

			const repository = await this.getOrCreateRepository(owner, repo, config.githubToken);
			logger.info('Using GitHub repository', { repo: repository.full_name });

			await this.ensureGitHubPages(owner, repo, config.githubToken, config.githubBranch || 'gh-pages');

			const branch = config.githubBranch || 'gh-pages';
			await this.createOrUpdateBranch(owner, repo, branch, options.files, config.githubToken);

			const pagesUrl = await this.getGitHubPagesUrl(owner, repo, config.githubToken);

			logger.info('GitHub Pages deployment completed', {
				repo: repository.full_name,
				url: pagesUrl,
			});

			return {
				success: true,
				deploymentUrl: pagesUrl,
				previewUrl: pagesUrl,
				deploymentId: repository.full_name,
				message: `Successfully deployed to GitHub Pages: ${pagesUrl}`,
			};
		} catch (error) {
			logger.error('GitHub Pages deployment error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown deployment error',
				message: 'Failed to deploy to GitHub Pages',
			};
		}
	}

	async getDeploymentStatus(deploymentId: string, config: DeploymentConfig): Promise<DeploymentStatus> {
		try {
			if (!config.githubToken) {
				throw new Error('GitHub token is required');
			}

			const [owner, repo] = deploymentId.split('/');
			if (!owner || !repo) {
				throw new Error('Invalid deployment ID format');
			}

			const response = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/pages`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.githubToken}`,
					Accept: 'application/vnd.github.v3+json',
				},
			});

			if (!response.ok) {
				return 'failed';
			}

			const pages = (await response.json()) as GitHubPages;

			if (pages.status === 'built') {
				return 'ready';
			} else if (pages.status === 'building') {
				return 'building';
			}

			return 'pending';
		} catch (error) {
			logger.error('Failed to get GitHub Pages deployment status', { error, deploymentId });
			return 'failed';
		}
	}

	private async getOrCreateRepository(owner: string, repo: string, token: string): Promise<GitHubRepository> {
		const checkResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
			},
		});

		if (checkResponse.ok) {
			return (await checkResponse.json()) as GitHubRepository;
		}

		const createResponse = await fetch(`${this.apiBaseUrl}/user/repos`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				name: repo,
				description: 'Deployed via VibSDK',
				private: false,
				auto_init: true,
			}),
		});

		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			throw new Error(`Failed to create repository: ${createResponse.status} - ${errorText}`);
		}

		return (await createResponse.json()) as GitHubRepository;
	}

	private async ensureGitHubPages(owner: string, repo: string, token: string, branch: string): Promise<void> {
		const checkResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/pages`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
			},
		});

		if (checkResponse.ok) {
			logger.info('GitHub Pages already enabled', { owner, repo });
			return;
		}

		logger.info('Enabling GitHub Pages', { owner, repo, branch });

		const enableResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/pages`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				source: {
					branch,
					path: '/',
				},
			}),
		});

		if (!enableResponse.ok && enableResponse.status !== 409) {
			const errorText = await enableResponse.text();
			logger.warn('Failed to enable GitHub Pages', {
				status: enableResponse.status,
				error: errorText,
			});
		}
	}

	private async createOrUpdateBranch(
		owner: string,
		repo: string,
		branch: string,
		files: Map<string, string>,
		token: string,
	): Promise<void> {
		logger.info('Creating/updating branch', { branch, fileCount: files.size });

		let baseTreeSha: string | undefined;
		let baseSha: string | undefined;

		const refResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
			},
		});

		if (refResponse.ok) {
			const ref = (await refResponse.json()) as GitHubReference;
			baseSha = ref.object.sha;

			const commitResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/git/commits/${baseSha}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github.v3+json',
				},
			});

			if (commitResponse.ok) {
				const commit = (await commitResponse.json()) as GitHubCommit & { tree: { sha: string } };
				baseTreeSha = commit.tree.sha;
			}
		} else {
			const defaultBranchResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github.v3+json',
				},
			});

			if (defaultBranchResponse.ok) {
				const repoData = (await defaultBranchResponse.json()) as GitHubRepository;
				const defaultBranch = repoData.default_branch;

				const defaultRefResponse = await fetch(
					`${this.apiBaseUrl}/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
					{
						method: 'GET',
						headers: {
							Authorization: `Bearer ${token}`,
							Accept: 'application/vnd.github.v3+json',
						},
					},
				);

				if (defaultRefResponse.ok) {
					const defaultRef = (await defaultRefResponse.json()) as GitHubReference;
					baseSha = defaultRef.object.sha;
				}
			}
		}

		const tree: GitHubTreeItem[] = Array.from(files.entries()).map(([path, content]) => ({
			path,
			mode: '100644' as const,
			type: 'blob' as const,
			content,
		}));

		const treeResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/git/trees`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				tree,
				base_tree: baseTreeSha,
			}),
		});

		if (!treeResponse.ok) {
			const errorText = await treeResponse.text();
			throw new Error(`Failed to create tree: ${treeResponse.status} - ${errorText}`);
		}

		const treeData = (await treeResponse.json()) as GitHubTree;

		const commitResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/git/commits`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				message: 'Deploy to GitHub Pages',
				tree: treeData.sha,
				parents: baseSha ? [baseSha] : [],
			}),
		});

		if (!commitResponse.ok) {
			const errorText = await commitResponse.text();
			throw new Error(`Failed to create commit: ${commitResponse.status} - ${errorText}`);
		}

		const commit = (await commitResponse.json()) as GitHubCommit;

		const updateRefResponse = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
			method: refResponse.ok ? 'PATCH' : 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(
				refResponse.ok
					? { sha: commit.sha, force: true }
					: { ref: `refs/heads/${branch}`, sha: commit.sha },
			),
		});

		if (!updateRefResponse.ok) {
			const errorText = await updateRefResponse.text();
			throw new Error(`Failed to update reference: ${updateRefResponse.status} - ${errorText}`);
		}

		logger.info('Branch updated successfully', { branch, commitSha: commit.sha });
	}

	private async getGitHubPagesUrl(owner: string, repo: string, token: string): Promise<string> {
		const maxAttempts = 30;
		const pollInterval = 2000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const response = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/pages`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github.v3+json',
				},
			});

			if (response.ok) {
				const pages = (await response.json()) as GitHubPages;
				if (pages.html_url) {
					return pages.html_url;
				}
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}

		return `https://${owner}.github.io/${repo}/`;
	}
}
