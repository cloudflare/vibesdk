import { useRef, type ChangeEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/api-types';

export interface ImageUploadButtonProps {
	onFilesSelected: (files: File[]) => void;
	disabled?: boolean;
	multiple?: boolean;
	className?: string;
	iconClassName?: string;
}

/**
 * Button component for uploading images
 */
export function ImageUploadButton({
	onFilesSelected,
	disabled = false,
	multiple = true,
	className = '',
	iconClassName = 'size-4',
}: ImageUploadButtonProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length > 0) {
			onFilesSelected(files);
		}
		// Reset input so the same file can be selected again
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
				multiple={multiple}
				onChange={handleFileChange}
				className="hidden"
				disabled={disabled}
			/>
			<button
				type="button"
				onClick={handleClick}
				disabled={disabled}
				className={`p-1 rounded-md bg-transparent hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
				aria-label="Upload image"
				title="Upload image (PNG, JPEG, WEBP, HEIC, HEIF)"
			>
				<ImagePlus className={iconClassName} strokeWidth={1.5} />
			</button>
		</>
	);
}
