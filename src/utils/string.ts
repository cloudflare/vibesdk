export const getFileType = (path: string): string => {
	if (!path || typeof path !== 'string') return 'plaintext';
	const extension = path.split('.').pop();

	switch (extension) {
		case 'ts':
		case 'tsx':
			return 'typescript';
		case 'js':
		case 'jsx':
			return 'javascript';
		case 'css':
			return 'css';
		case 'html':
			return 'html';
		case 'json':
			return 'json';
		case 'md':
		case 'markdown':
			return 'markdown';
		case 'mdx':
			return 'mdx';
		default:
			return 'plaintext';
	}
};

/**
 * Normalize a title for use as a Git repository name
 * - Converts to lowercase
 * - Removes special characters except spaces and hyphens
 * - Replaces spaces with hyphens
 * - Removes consecutive/leading/trailing hyphens
 * - Falls back to "app" when nothing is left (e.g. a non-Latin title)
 */
export const normalizeAppTitle = (title: string): string => {
	const normalized = title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	return normalized || 'app';
};
