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

        const slides = [
            ...loadManifestSlides(`${slideDirectory}/manifest.json`),
        ]
            .filter((name, idx, arr) => arr.indexOf(name) === idx) // Deduplicate
            .filter((name) => !name.startsWith('demo-slide') && name.endsWith('.json')) // Filter demos
            .map((name, idx) => ({
                index: idx,
                fileName: name.replace(/\.(json)$/i, ''),
                filePath: `${slideDirectory}/${name}`,
            }));

        return slides;
    }, [allFiles, slideDirectory]);

    return { slideFiles };
}
