import type { FileType } from '../hooks/use-chat';

export type PresentationType = 'spectacle' | 'documentation' | 'app' | null;

interface ContentDetectionResult {
	type: PresentationType;
	primaryFile?: FileType;
	relatedFiles?: FileType[];
	// When both presentation and docs exist
	hasDocumentation?: boolean;
	documentationFiles?: FileType[];
}

/**
 * Detect the type of content being generated based on file structure and patterns
 */
export function detectContentType(files: FileType[]): ContentDetectionResult {
	if (files.length === 0) {
		return { type: null };
	}

	// Check for both Spectacle presentation and documentation
	const spectacleResult = detectSpectaclePresentation(files);
	const docsResult = detectDocumentation(files);

	// If both presentation and documentation exist
	if (spectacleResult.type === 'spectacle' && docsResult.type === 'documentation') {
		return {
			type: 'spectacle',
			primaryFile: spectacleResult.primaryFile,
			relatedFiles: spectacleResult.relatedFiles,
			hasDocumentation: true,
			documentationFiles: docsResult.relatedFiles,
		};
	}

	// Only presentation
	if (spectacleResult.type === 'spectacle') {
		return spectacleResult;
	}

	// Only documentation
	if (docsResult.type === 'documentation') {
		return docsResult;
	}

	// Default to app
	return { type: 'app' };
}

/**
 * Detect if files represent a Spectacle presentation
 */
function detectSpectaclePresentation(files: FileType[]): ContentDetectionResult {
	// Look for Deck.tsx file (main presentation file)
	const deckFile = files.find(
		(f) =>
			f.filePath === 'src/Deck.tsx' ||
			f.filePath.endsWith('/Deck.tsx') ||
			f.filePath === 'Deck.tsx'
	);

	if (deckFile) {
		// Verify it's actually a Spectacle file by checking content
		const hasSpectacleImports =
			deckFile.fileContents?.includes('from \'spectacle\'') ||
			deckFile.fileContents?.includes('from "spectacle"');

		const hasSlideComponents =
			deckFile.fileContents?.includes('<Slide') ||
			deckFile.fileContents?.includes('<Slide>');

		if (hasSpectacleImports || hasSlideComponents) {
			return {
				type: 'spectacle',
				primaryFile: deckFile,
				relatedFiles: files.filter((f) => f.filePath !== deckFile.filePath),
			};
		}
	}

	// Check package.json for spectacle dependency
	const packageJson = files.find((f) => f.filePath === 'package.json');
	if (packageJson?.fileContents?.includes('"spectacle"')) {
		// If we have spectacle dep but no deck file yet, it's still a spectacle project
		return {
			type: 'spectacle',
			primaryFile: deckFile,
			relatedFiles: files,
		};
	}

	return { type: null };
}

/**
 * Detect if files represent documentation
 */
function detectDocumentation(files: FileType[]): ContentDetectionResult {
	const markdownFiles = files.filter(
		(f) =>
			f.filePath.endsWith('.md') ||
			f.filePath.endsWith('.mdx') ||
			f.filePath.endsWith('.markdown')
	);

	if (markdownFiles.length === 0) {
		return { type: null };
	}

	// Check for docs folder structure
	const hasDocsFolder = files.some(
		(f) =>
			f.filePath.startsWith('docs/') ||
			f.filePath.includes('/docs/') ||
			f.filePath.startsWith('documentation/')
	);

	// Multiple markdown files or docs folder indicates documentation
	if (markdownFiles.length >= 2 || hasDocsFolder) {
		// Prioritize README as primary file
		const readmeFile = markdownFiles.find((f) =>
			f.filePath.toLowerCase().includes('readme')
		);

		return {
			type: 'documentation',
			primaryFile: readmeFile || markdownFiles[0],
			relatedFiles: markdownFiles,
		};
	}

	// Single README file can also be documentation
	if (
		markdownFiles.length === 1 &&
		markdownFiles[0].filePath.toLowerCase().includes('readme')
	) {
		// Check if it's substantial documentation (more than just a project description)
		const content = markdownFiles[0].fileContents || '';
		const hasMultipleSections = (content.match(/^##/gm) || []).length >= 3;
		const isLongContent = content.length > 1000;

		if (hasMultipleSections || isLongContent) {
			return {
				type: 'documentation',
				primaryFile: markdownFiles[0],
				relatedFiles: [markdownFiles[0]],
			};
		}
	}

	return { type: null };
}

/**
 * Check if a specific file is a Spectacle presentation file
 */
export function isSpectacleFile(file: FileType): boolean {
	if (!file.filePath.endsWith('.tsx') && !file.filePath.endsWith('.jsx')) {
		return false;
	}

	const content = file.fileContents || '';
	return (
		(content.includes('from \'spectacle\'') ||
			content.includes('from "spectacle"')) &&
		(content.includes('<Slide') || content.includes('<Slide>'))
	);
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
 * Get a user-friendly label for the presentation type
 */
export function getPresentationTypeLabel(type: PresentationType): string {
	switch (type) {
		case 'spectacle':
			return 'Presentation';
		case 'documentation':
			return 'Documentation';
		case 'app':
			return 'Application';
		default:
			return 'Preview';
	}
}
