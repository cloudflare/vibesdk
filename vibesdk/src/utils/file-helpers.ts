import type { FileType } from '@/api-types';

/**
 * Merges bootstrap and generated files, deduplicating by filePath.
 * Generated files override bootstrap files when paths match.
 */
export function mergeFiles(bootstrap: FileType[], generated: FileType[]): FileType[] {
	const map = new Map<string, FileType>();
	bootstrap.forEach((f) => map.set(f.filePath, f));
	generated.forEach((f) => map.set(f.filePath, f)); // Generated files override
	return Array.from(map.values());
}
