import { useEffect, useCallback } from 'react';
import type { SlideInfo } from './types';

export function useIframeMessaging(
    iframeRef: React.RefObject<HTMLIFrameElement | null>,
    thumbnailRefs: React.RefObject<Map<number, HTMLDivElement>>,
    slideFiles: SlideInfo[],
    setGeneratingSlides: React.Dispatch<React.SetStateAction<Set<string>>>,
    setCurrentSlideIndex: (index: number) => void
) {
    // Forward streaming events to iframe and track generation state
    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail as { type: string; path?: string; chunk?: string };
            if (!detail || !iframeRef.current?.contentWindow) return;
            if (!detail.path || !detail.path.includes('slides/')) return;
            if (!['file_generating', 'file_chunk', 'file_generated'].includes(detail.type)) return;
            
            // Track generating slides to prevent premature refreshes
            if (detail.type === 'file_generating' && detail.path) {
                setGeneratingSlides(prev => new Set(prev).add(detail.path!));
            } else if (detail.type === 'file_generated' && detail.path) {
                setGeneratingSlides(prev => {
                    const next = new Set(prev);
                    next.delete(detail.path!);
                    return next;
                });
            }

            // Forward event to main iframe for streaming support
            try {
                iframeRef.current.contentWindow.postMessage(detail, '*');
            } catch (error) {
                console.error('Failed to forward presentation file event to iframe', error);
            }

            // Also forward to the specific thumbnail iframe if it exists
            // Find slide index by matching path against loaded slideFiles (from manifest)
            const slide = slideFiles.find((s) => detail.path && (s.filePath === detail.path || detail.path.endsWith(s.filePath)));
            
            if (slide) {
                const idx = slide.index;
                const thumbnailContainer = thumbnailRefs.current.get(idx);
                const thumbnailIframe = thumbnailContainer?.querySelector('iframe');
                if (thumbnailIframe?.contentWindow) {
                    try {
                        thumbnailIframe.contentWindow.postMessage(detail, '*');
                    } catch (error) {
                        console.error(`Failed to forward event to thumbnail ${idx}`, error);
                    }
                }
            }
        };
        window.addEventListener('presentation-file-event', handler);
        return () => window.removeEventListener('presentation-file-event', handler);
    }, [iframeRef, thumbnailRefs, slideFiles, setGeneratingSlides]);

    // iframe message handler for navigation and slide sync
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const { type, data } = event.data;

            switch (type) {
                case 'SLIDE_CHANGED':
                case 'CURRENT_SLIDE_RESPONSE':
                    if (typeof data?.currentSlide === 'number') {
                        setCurrentSlideIndex(data.currentSlide);
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setCurrentSlideIndex]);

    const sendMessageToIframe = useCallback(
        (message: { type: string; data?: unknown }) => {
            if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(message, '*');
            }
        },
        [iframeRef],
    );

    const navigateToSlide = useCallback(
        (index: number) => {
            sendMessageToIframe({
                type: 'NAVIGATE_TO_SLIDE',
                data: { index },
            });
        },
        [sendMessageToIframe],
    );

    return { navigateToSlide };
}
