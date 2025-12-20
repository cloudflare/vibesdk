import type { FileType } from '@/api-types';

export type ContentType = 'markdown' | null;

interface ContentBundle {
    type: ContentType;
    files: FileType[];
}

export interface ContentDetectionResult {
    Contents: Record<string, ContentBundle>;
}

/**
 * Detect if files contain documentation
 */
export function detectContentType(files: FileType[]): ContentDetectionResult {
    const result: ContentDetectionResult = {
        Contents: {}
    };
    
    for (const file of files) {
        if (isMarkdownFile(file)) {
            result.Contents[file.filePath] = {
                type: 'markdown',
                files: [file]
            };
        }
    }

    return result;
}

/**
 * Check if a file path represents a markdown file
 */
export function isMarkdownPath(path: string): boolean {
	return (
		path.endsWith('.md') ||
		path.endsWith('.mdx') ||
		path.endsWith('.markdown')
	);
}

/**
 * Check if a file is a markdown documentation file
 */
export function isMarkdownFile(file: FileType): boolean {
	return isMarkdownPath(file.filePath);
}

/**
 * Check if a file path represents documentation (markdown, txt, or in docs/ directory)
 */
export function isDocumentationPath(path: string): boolean {
	return (
		isMarkdownPath(path) ||
		path.endsWith('.txt') ||
		path.startsWith('docs/') ||
		path.includes('/docs/')
	);
}

/**
 * Check if a file is documentation (markdown, txt, or in docs/ directory)
 */
export function isDocumentationFile(file: FileType): boolean {
	return isDocumentationPath(file.filePath);
}

/**
 * Get a user-friendly label for the content type
 */
export function getContentTypeLabel(type: ContentType): string {
	switch (type) {
		case 'markdown':
			return 'Documentation';
		default:
            return 'unknown';
	}
}
