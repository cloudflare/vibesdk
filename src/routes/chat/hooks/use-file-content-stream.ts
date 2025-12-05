import { useState, useEffect, useRef } from 'react';
import type { FileType } from '@/api-types';

/**
 * A hook that streams file contents one by one at a specified rate
 */
export function useFileContentStream(
	files: FileType[],
	options: { tps: number; enabled: boolean },
) {
	const [streamedFiles, setStreamedFiles] = useState<FileType[]>([]);
	const [doneStreaming, setDoneStreaming] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const currentFileRef = useRef<number>(0);
	const currentPositionRef = useRef<number>(0);

	useEffect(() => {
		if (!options.enabled) {
			setStreamedFiles(files);
			setDoneStreaming(true);
			return;
		}

		// Reset state when files change
		setStreamedFiles([]);
		currentFileRef.current = 0;
		currentPositionRef.current = 0;

		// Clear any existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		const streamNextChunk = () => {
			// If we've processed all files, stop
			if (currentFileRef.current >= files.length) {
				setDoneStreaming(true);
				return;
			}

			const currentFile = files[currentFileRef.current];
			const content = currentFile.fileContents;
			const chunkSize = Math.max(1, Math.floor(options.tps / 10)); // Update every 100ms

			// If this is a new file, add it to streamed files
			if (currentPositionRef.current === 0) {
				setStreamedFiles((prev) => [
					...prev,
					{
						...currentFile,
						fileContents: '',
					},
				]);
			}

			// Calculate next chunk
			const nextPosition = Math.min(
				content.length,
				currentPositionRef.current + chunkSize,
			);
			const chunk = content.slice(currentPositionRef.current, nextPosition);

			// Update the current file's content
			setStreamedFiles((prev) =>
				prev.map((file, index) => {
					if (index === prev.length - 1) {
						return {
							...file,
							fileContents: file.fileContents + chunk,
						};
					}
					return file;
				}),
			);

			currentPositionRef.current = nextPosition;

			// If we've finished the current file, move to next file
			if (currentPositionRef.current >= content.length) {
				currentFileRef.current++;
				currentPositionRef.current = 0;
			}

			// Schedule next chunk
			timeoutRef.current = setTimeout(streamNextChunk, 100);
		};

		if (files.length > 0) {
			streamNextChunk();
		}

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [files, options.tps, options.enabled]);

	return { streamedFiles, doneStreaming };
}
