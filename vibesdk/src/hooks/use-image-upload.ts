import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { 
	type ImageAttachment, 
	isSupportedImageType, 
	MAX_IMAGE_SIZE_BYTES,
	MAX_IMAGES_PER_MESSAGE,
	SUPPORTED_IMAGE_MIME_TYPES
} from '@/api-types';

export interface UseImageUploadOptions {
	maxImages?: number;
	maxSizeBytes?: number;
	onError?: (error: string) => void;
}

export interface UseImageUploadReturn {
	images: ImageAttachment[];
	addImages: (files: File[]) => Promise<void>;
	removeImage: (id: string) => void;
	clearImages: () => void;
	isProcessing: boolean;
}

/**
 * Hook for handling image uploads
 */
export function useImageUpload(options: UseImageUploadOptions = {}): UseImageUploadReturn {
	const {
		maxImages = MAX_IMAGES_PER_MESSAGE,
		maxSizeBytes = MAX_IMAGE_SIZE_BYTES,
		onError,
	} = options;

	const [images, setImages] = useState<ImageAttachment[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);

	const processImageFile = useCallback(async (file: File): Promise<ImageAttachment | null> => {
		// Validate MIME type
		if (!isSupportedImageType(file.type)) {
			const supportedTypes = SUPPORTED_IMAGE_MIME_TYPES.map(t => t.replace('image/', '').toUpperCase());
			const errorMsg = `Unsupported image type: ${file.type}. Only ${supportedTypes.join(', ')} are supported.`;
			toast.error(errorMsg);
			onError?.(errorMsg);
			return null;
		}

		// Validate file size
		if (file.size > maxSizeBytes) {
			const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
			const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
			const errorMsg = `Image too large: ${fileSizeMB}MB. Maximum allowed is ${maxSizeMB}MB.`;
			toast.error(errorMsg);
			onError?.(errorMsg);
			return null;
		}

		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = (e) => {
				try {
					const result = e.target?.result as string;
					if (!result) {
						reject(new Error('Failed to read file'));
						return;
					}

					// Extract base64 data (remove data URL prefix)
					const base64Data = result.split(',')[1];

					// Try to get image dimensions
					const img = new Image();
					img.onload = () => {
						resolve({
							id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
							filename: file.name,
							mimeType: file.type as ImageAttachment['mimeType'],
							base64Data,
							size: file.size,
							dimensions: {
								width: img.width,
								height: img.height,
							},
						});
					};

					img.onerror = () => {
						// Fallback without dimensions if image loading fails
						resolve({
							id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
							filename: file.name,
							mimeType: file.type as ImageAttachment['mimeType'],
							base64Data,
							size: file.size,
						});
					};

					img.src = result;
				} catch (error) {
					reject(error);
				}
			};

			reader.onerror = () => {
				reject(new Error(`Failed to read file: ${file.name}`));
			};

			reader.readAsDataURL(file);
		});
	}, [maxSizeBytes, onError]);

	const addImages = useCallback(async (files: File[]) => {
		setIsProcessing(true);

		try {
			// Check if adding these files would exceed the limit
			if (images.length + files.length > maxImages) {
				const errorMsg = `Maximum ${maxImages} images allowed per message.`;
				toast.error(errorMsg);
				onError?.(errorMsg);
				return;
			}

			// Process all files
			const processedImages = await Promise.all(
				files.map(file => processImageFile(file))
			);

			// Filter out null results (failed validations)
			const validImages = processedImages.filter((img): img is ImageAttachment => img !== null);

			if (validImages.length > 0) {
				setImages(prev => [...prev, ...validImages]);
			}
		} catch (error) {
			onError?.(error instanceof Error ? error.message : 'Failed to process images');
		} finally {
			setIsProcessing(false);
		}
	}, [images.length, maxImages, processImageFile, onError]);

	const removeImage = useCallback((id: string) => {
		setImages(prev => prev.filter(img => img.id !== id));
	}, []);

	const clearImages = useCallback(() => {
		setImages([]);
	}, []);

	return {
		images,
		addImages,
		removeImage,
		clearImages,
		isProcessing,
	};
}
