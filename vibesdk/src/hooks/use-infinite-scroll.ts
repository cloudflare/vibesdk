import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  threshold?: number;
  enabled?: boolean;
  onLoadMore?: () => void;
}

interface UseInfiniteScrollResult {
  triggerRef: React.RefObject<HTMLDivElement | null>;
}

export function useInfiniteScroll({
  threshold = 400,
  enabled = true,
  onLoadMore
}: UseInfiniteScrollOptions = {}): UseInfiniteScrollResult {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (!triggerRef.current || !enabled || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoadingRef.current) {
          isLoadingRef.current = true;
          onLoadMore();
          
          // Reset after a brief delay to prevent duplicate calls
          setTimeout(() => {
            isLoadingRef.current = false;
          }, 300);
        }
      },
      {
        rootMargin: `${threshold}px`,
        threshold: 0
      }
    );

    observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [threshold, enabled, onLoadMore]);

  // Reset loading state when enabled changes to prevent stuck state
  useEffect(() => {
    if (!enabled) {
      isLoadingRef.current = false;
    }
  }, [enabled]);

  return { triggerRef };
}