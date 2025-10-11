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

export const formatFileSize = (bytes?: number) => {
	if (!bytes) return '';
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(1)} ${units[unitIndex]}`;
};
