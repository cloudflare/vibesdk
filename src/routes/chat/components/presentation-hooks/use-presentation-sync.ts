import { useState, useEffect, useRef } from 'react';
import type { FileType } from '@/api-types';
import type { SlideInfo, PresentationTimestamps } from './types';

// Debug: Track hook instance ID across remounts
let hookInstanceCounter = 0;

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

    // DEBUG: Track hook instance to detect remounts
    const hookInstanceId = useRef<number | null>(null);
    if (hookInstanceId.current === null) {
        hookInstanceId.current = ++hookInstanceCounter;
        console.log(`[PresentationSync] HOOK MOUNTED - Instance #${hookInstanceId.current}`);
    }

    // Handle file system updates (new files, modified files)
    useEffect(() => {
        // DEBUG: Log hook instance and fileHashes state at START of effect
        console.log(`[PresentationSync] Effect running (Instance #${hookInstanceId.current}), fileHashes size: ${fileHashes.current.size}`);
        if (fileHashes.current.size > 0) {
            console.log('[PresentationSync] Existing hashes:', [...fileHashes.current.entries()].slice(0, 3));
        }

        // DEBUG: Log allFiles state during streaming
        const slideFilesDebug = allFiles.filter(f => f.filePath.includes('slides/')).map(f => ({
            path: f.filePath,
            isGenerating: f.isGenerating,
            contentLength: f.fileContents?.length || 0
        }));
        if (slideFilesDebug.length > 0) {
            console.log('[PresentationSync] allFiles changed:', slideFilesDebug);
            console.log('[PresentationSync] generatingSlides:', [...generatingSlides]);
        }

        // Helper: Generate hash for file change detection
        const getFileHash = (file: FileType) =>
            `${file.filePath}-${file.fileContents?.length || 0}-${file.isGenerating ? 'gen' : 'ready'}`;

        // Helper: Categorize file types
        const isSlideFile = (path: string) => path.startsWith(`${slideDirectory}/`) && path.endsWith('.json');
        
        // CRITICAL FIX: Manifest is NOT a global file if we are currently generating slides.
        // This prevents the "refresh loop" where adding a slide to manifest triggers a full reload.
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
                // DEBUG: Log hash changes
                console.log(`[PresentationSync] Hash changed for ${file.filePath}: ${previousHash} -> ${currentHash}`);
                fileHashes.current.set(file.filePath, currentHash);
                return true;
            }
            return false;
        });

        if (changedFiles.length === 0) return;

        // DEBUG: Log which files passed the filter and are triggering updates
        console.log('[PresentationSync] changedFiles triggering update:', changedFiles.map(f => {
            const isSlide = isSlideFile(f.filePath);
            const isGlobal = isGlobalFile(f.filePath);
            return {
                path: f.filePath,
                isGenerating: f.isGenerating,
                contentLength: f.fileContents?.length || 0,
                isSlideFile: isSlide,
                isGlobalFile: isGlobal
            };
        }));

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
            console.log('[PresentationPreview] Global file changed, refreshing all');
            setTimestamps((prev) => ({
                ...prev,
                global: now,
                main: now,
            }));
        } else if (updatedSlideIndices.size > 0) {
            console.log(`[PresentationPreview] ${updatedSlideIndices.size} slide(s) changed`);
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
    // This runs when slideFiles or allFiles changes to remove stale entries
    useEffect(() => {
        // DEBUG: Log cleanup effect running
        console.log(`[PresentationSync] Cleanup effect - allFiles count: ${allFiles.length}, fileHashes size: ${fileHashes.current.size}`);

        // Only clean up hashes for files that don't exist in allFiles anymore
        // This is more conservative than checking against slideFiles/manifest,
        // which may not include newly created slides that haven't been added to manifest yet
        const allFilePaths = new Set(allFiles.map((f) => f.filePath));
        const toDelete: string[] = [];
        Array.from(fileHashes.current.keys()).forEach((path) => {
            if (!allFilePaths.has(path)) {
                toDelete.push(path);
                fileHashes.current.delete(path);
            }
        });
        // DEBUG: Log cleanup deletions
        if (toDelete.length > 0) {
            console.log(`[PresentationSync] Cleanup deleted ${toDelete.length} hashes:`, toDelete);
        }
    }, [allFiles]);

    return {
        timestamps,
        setTimestamps,
        generatingSlides,
        setGeneratingSlides
    };
}
