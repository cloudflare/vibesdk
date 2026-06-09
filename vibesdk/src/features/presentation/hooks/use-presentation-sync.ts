import { useState, useEffect, useRef } from 'react';
import type { FileType } from '@/api-types';
import type { SlideInfo, PresentationTimestamps } from './types';

export function usePresentationSync(
    allFiles: FileType[] = [],
    slideFiles: SlideInfo[],
    slideDirectory: string,
    currentSlideIndex: number
) {
    const [timestamps, setTimestamps] = useState<PresentationTimestamps>({
        global: Date.now(),
        main: Date.now(),
        slides: {},
    });
    const [generatingSlides, setGeneratingSlides] = useState<Set<string>>(new Set());
    const fileHashes = useRef<Map<string, string>>(new Map());

    // Handle file system updates (new files, modified files)
    useEffect(() => {
        // Helper: Generate hash for file change detection
        const getFileHash = (file: FileType) =>
            `${file.filePath}-${file.fileContents?.length || 0}-${file.isGenerating ? 'gen' : 'ready'}`;

        // Helper: Categorize file types
        const isSlideFile = (path: string) => path.startsWith(`${slideDirectory}/`) && path.endsWith('.json');
        
        const isGlobalFile = (path: string) =>
            path.includes('slides-styles') ||
            path === 'public/_dev/Presentation.jsx' ||
            path.startsWith('public/_dev/runtime/') ||
            (path.endsWith('manifest.json') && generatingSlides.size === 0);

        // Find files that have actually changed (not just re-rendered)
        const changedFiles = allFiles.filter((file) => {
            if (!(isSlideFile(file.filePath) || isGlobalFile(file.filePath))) return false;
            
            // Skip files currently being generated/streamed
            // These are handled by the streaming event forwarding
            if (file.isGenerating || generatingSlides.has(file.filePath)) return false;

            const currentHash = getFileHash(file);
            const previousHash = fileHashes.current.get(file.filePath);

            if (currentHash !== previousHash) {
                fileHashes.current.set(file.filePath, currentHash);
                return true;
            }
            return false;
        });

        if (changedFiles.length === 0) return;

        // Categorize changes
        const hasGlobalChange = changedFiles.some((f) => isGlobalFile(f.filePath));
        const updatedSlideIndices = new Map<number, number>();

        changedFiles.forEach((file) => {
            if (isSlideFile(file.filePath)) {
                const slide = slideFiles.find((s) => s.filePath === file.filePath);
                if (slide) {
                    updatedSlideIndices.set(slide.index, Date.now());
                }
            }
        });

        // Apply updates
        const now = Date.now();

        if (hasGlobalChange) {
            setTimestamps((prev) => ({
                ...prev,
                global: now,
                main: now,
            }));
        } else if (updatedSlideIndices.size > 0) {
            setTimestamps((prev) => ({
                ...prev,
                slides: {
                    ...prev.slides,
                    ...Object.fromEntries(updatedSlideIndices),
                },
                // Refresh main iframe if current slide was updated
                main: updatedSlideIndices.has(currentSlideIndex) ? now : prev.main,
            }));
        }
    }, [allFiles, slideFiles, currentSlideIndex, slideDirectory, generatingSlides]);

    // Clean up file hashes for files that no longer exist in allFiles
    useEffect(() => {
        // Only clean up hashes for files that don't exist in allFiles anymore
        // This is more conservative than checking against slideFiles/manifest,
        // which may not include newly created slides that haven't been added to manifest yet
        const allFilePaths = new Set(allFiles.map((f) => f.filePath));
        Array.from(fileHashes.current.keys()).forEach((path) => {
            if (!allFilePaths.has(path)) {
                fileHashes.current.delete(path);
            }
        });
    }, [allFiles]);

    return {
        timestamps,
        setTimestamps,
        generatingSlides,
        setGeneratingSlides
    };
}
