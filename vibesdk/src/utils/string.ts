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
 */
export const normalizeAppTitle = (title: string): string => {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
};
