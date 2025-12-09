import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

const COPY_FEEDBACK_DURATION = 2000;

interface UseCopyToClipboardOptions {
	/** Duration in ms to show copied state (default: 2000) */
	duration?: number;
	/** Success toast message (if provided, shows toast on success) */
	successMessage?: string;
	/** Error toast message (default: 'Failed to copy') */
	errorMessage?: string;
}

interface UseCopyToClipboardReturn {
	/** Whether the content was recently copied */
	copied: boolean;
	/** Copy text to clipboard */
	copy: (text: string) => Promise<boolean>;
	/** Reset copied state manually */
	reset: () => void;
}

/**
 * Hook for copying text to clipboard
 */
export function useCopyToClipboard(
	options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardReturn {
	const {
		duration = COPY_FEEDBACK_DURATION,
		successMessage,
		errorMessage = 'Failed to copy',
	} = options;

	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	const reset = useCallback(() => {
		setCopied(false);
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const copy = useCallback(
		async (text: string): Promise<boolean> => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);

				if (successMessage) {
					toast.success(successMessage);
				}

				// Clear any existing timeout
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}

				// Reset copied state after duration
				timeoutRef.current = setTimeout(() => {
					setCopied(false);
					timeoutRef.current = null;
				}, duration);

				return true;
			} catch (error) {
				console.error('Failed to copy to clipboard:', error);
				toast.error(errorMessage);
				return false;
			}
		},
		[duration, successMessage, errorMessage]
	);

	return { copied, copy, reset };
}

export { COPY_FEEDBACK_DURATION };
