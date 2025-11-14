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
 * Check if a file is a markdown documentation file
 */
export function isMarkdownFile(file: FileType): boolean {
	return (
		file.filePath.endsWith('.md') ||
		file.filePath.endsWith('.mdx') ||
		file.filePath.endsWith('.markdown')
	);
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
