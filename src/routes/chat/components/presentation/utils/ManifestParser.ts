import type { FileType } from '@/api-types';

export interface ManifestMetadata {
	title?: string;
	description?: string;
	theme?: string;
	transition?: 'none' | 'fade' | 'slide' | 'convex' | 'concave' | 'zoom';
	controls?: boolean;
	progress?: boolean;
	center?: boolean;
	slideNumber?: boolean | 'h.v' | 'h/v' | 'c' | 'c/t';
}

export interface ManifestData {
	slides: string[];
	metadata: ManifestMetadata;
}

const DEFAULT_METADATA: ManifestMetadata = {
	theme: 'dark',
	transition: 'slide',
	controls: true,
	progress: true,
	center: true,
	slideNumber: false,
};

export function parseManifest(files: FileType[]): ManifestData | null {
	const manifestFile = files.find(
		(f) => f.filePath.endsWith('manifest.json')
	);

	if (!manifestFile) {
		return null;
	}

	try {
		const parsed = JSON.parse(manifestFile.fileContents);

		if (!parsed.slides || !Array.isArray(parsed.slides)) {
			console.warn('[ManifestParser] Invalid manifest: missing or invalid slides array');
			return null;
		}

		return {
			slides: parsed.slides,
			metadata: {
				...DEFAULT_METADATA,
				...parsed.metadata,
			},
		};
	} catch (error) {
		console.error('[ManifestParser] Failed to parse manifest.json:', error);
		return null;
	}
}

export function getSlideOrder(
	manifest: ManifestData | null,
	slideFiles: FileType[],
): FileType[] {
	if (!manifest) {
		return slideFiles;
	}

	const fileMap = new Map(slideFiles.map((f) => [f.filePath.split('/').pop(), f]));
	const ordered: FileType[] = [];

	for (const slideName of manifest.slides) {
		const file = fileMap.get(slideName);
		if (file) {
			ordered.push(file);
			fileMap.delete(slideName);
		}
	}

	ordered.push(...Array.from(fileMap.values()).sort((a, b) => {
		const getNum = (path: string) => {
			const match = path.match(/Slide(\d+)/i);
			return match ? parseInt(match[1]) : 0;
		};
		return getNum(a.filePath) - getNum(b.filePath);
	}));

	return ordered;
}

export function validateManifest(manifest: ManifestData, files: FileType[]): {
	valid: boolean;
	missingSlides: string[];
	warnings: string[];
} {
	const fileNames = new Set(files.map((f) => f.filePath.split('/').pop()));
	const missingSlides = manifest.slides.filter((slide) => !fileNames.has(slide));
	const warnings: string[] = [];

	if (missingSlides.length > 0) {
		warnings.push(
			`${missingSlides.length} slides referenced in manifest not found: ${missingSlides.join(', ')}`,
		);
	}

	const duplicates = manifest.slides.filter(
		(slide, index) => manifest.slides.indexOf(slide) !== index,
	);
	if (duplicates.length > 0) {
		warnings.push(`Duplicate slides in manifest: ${duplicates.join(', ')}`);
	}

	return {
		valid: missingSlides.length === 0 && duplicates.length === 0,
		missingSlides,
		warnings,
	};
}
