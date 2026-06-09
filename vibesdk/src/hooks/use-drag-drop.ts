import { useCallback, useState, type DragEvent } from 'react';

export interface UseDragDropOptions {
	onFilesDropped: (files: File[]) => void;
	accept?: string[];
	disabled?: boolean;
}

export interface UseDragDropReturn {
	isDragging: boolean;
	dragHandlers: {
		onDragEnter: (e: DragEvent) => void;
		onDragOver: (e: DragEvent) => void;
		onDragLeave: (e: DragEvent) => void;
		onDrop: (e: DragEvent) => void;
	};
}

/**
 * Hook for handling drag and drop file uploads
 */
export function useDragDrop({
	onFilesDropped,
	accept,
	disabled = false,
}: UseDragDropOptions): UseDragDropReturn {
	const [isDragging, setIsDragging] = useState(false);

	const validateFile = useCallback((file: File): boolean => {
		if (!accept || accept.length === 0) return true;
		return accept.includes(file.type);
	}, [accept]);

	const handleDragEnter = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (disabled) return;
		setIsDragging(true);
	}, [disabled]);

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (disabled) return;
		setIsDragging(true);
	}, [disabled]);

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (disabled) return;
		
		// Only set isDragging to false if we're leaving the container itself
		// (not just moving to a child element)
		if (e.currentTarget === e.target) {
			setIsDragging(false);
		}
	}, [disabled]);

	const handleDrop = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
		
		if (disabled) return;

		const files = Array.from(e.dataTransfer.files).filter(validateFile);
		
		if (files.length > 0) {
			onFilesDropped(files);
		}
	}, [disabled, validateFile, onFilesDropped]);

	return {
		isDragging,
		dragHandlers: {
			onDragEnter: handleDragEnter,
			onDragOver: handleDragOver,
			onDragLeave: handleDragLeave,
			onDrop: handleDrop,
		},
	};
}
