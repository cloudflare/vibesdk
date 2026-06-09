import { useState, useEffect, useRef } from 'react';
import type { SlideInfo } from './types';

export function useThumbnailObserver(slideFiles: SlideInfo[]) {
    const [visibleThumbnails, setVisibleThumbnails] = useState<Set<number>>(new Set());
    const thumbnailRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const observedRefs = useRef<Set<HTMLDivElement>>(new Set());
    const observerInstance = useRef<IntersectionObserver | null>(null);

    // Initial load - show first few thumbnails immediately
    useEffect(() => {
        if (slideFiles.length > 0 && visibleThumbnails.size === 0) {
            const initialVisible = slideFiles.slice(0, 3).map((s) => s.index);
            setVisibleThumbnails(new Set(initialVisible));
        }
    }, [slideFiles, visibleThumbnails.size]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const index = parseInt(entry.target.getAttribute('data-slide-index') || '0', 10);
                    if (entry.isIntersecting) {
                        setVisibleThumbnails((prev) => new Set([...prev, index]));
                    }
                });
            },
            {
                rootMargin: '200px',
                threshold: 0.01,
            },
        );

        observerInstance.current = observer;

        const observed = observedRefs.current;

        // Observe all current thumbnail refs
        thumbnailRefs.current.forEach((ref) => {
            observer.observe(ref);
            observed.add(ref);
        });

        return () => {
            observer.disconnect();
            observed.clear();
        };
    }, []);

    // Observe new thumbnails as they're added
    useEffect(() => {
        if (!observerInstance.current) return;

        thumbnailRefs.current.forEach((ref) => {
            if (!observedRefs.current.has(ref)) {
                observerInstance.current?.observe(ref);
                observedRefs.current.add(ref);
            }
        });
    }, [slideFiles]);

    return {
        visibleThumbnails,
        thumbnailRefs
    };
}
