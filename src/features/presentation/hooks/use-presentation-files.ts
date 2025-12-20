import { useMemo } from 'react';
import type { FileType } from '@/api-types';
import type { SlideInfo } from './types';

export function usePresentationFiles(allFiles: FileType[] = [], slideDirectory: string) {
    const slideFiles: SlideInfo[] = useMemo(() => {
        // Helper to load manifest slides from a file
        const loadManifestSlides = (filePath: string): string[] => {
            const file = allFiles.find((f) => f.filePath === filePath);
            if (!file?.fileContents) return [];

            try {
                const parsed = JSON.parse(file.fileContents);
                return Array.isArray(parsed.slides) ? parsed.slides : [];
            } catch {
                return [];
            }
        };

        // Load slides from manifest (authoritative order)
        // Note: Demo slides are already filtered out at the source (chat.tsx allFiles)
        const manifestSlideNames = loadManifestSlides(`${slideDirectory}/manifest.json`)
            .filter((name) => name.endsWith('.json'));
        const manifestSlidePaths = new Set(
            manifestSlideNames.map(name => `${slideDirectory}/${name}`)
        );

        // Discover streaming slides NOT in manifest yet
        // These are slides that exist in allFiles but haven't been added to manifest
        const slideDirPrefix = slideDirectory.endsWith('/') ? slideDirectory : `${slideDirectory}/`;
        const streamingSlideNames = allFiles
            .filter((file) =>
                file.filePath.startsWith(slideDirPrefix) &&
                file.filePath.endsWith('.json') &&
                !file.filePath.endsWith('manifest.json') &&
                !manifestSlidePaths.has(file.filePath)
            )
            .map((file) => file.filePath.split('/').pop()!);

        // Combine manifest slides + streaming slides (manifest first, streaming appended)
        const allSlideNames = [
            ...manifestSlideNames,
            ...streamingSlideNames
        ].filter((name, idx, arr) => arr.indexOf(name) === idx); // Deduplicate

        // Transform to SlideInfo objects
        const slides = allSlideNames.map((name, idx) => ({
            index: idx,
            fileName: name.replace(/\.(json)$/i, ''),
            filePath: `${slideDirectory}/${name}`,
        }));

        return slides;
    }, [allFiles, slideDirectory]);

    return { slideFiles };
}
