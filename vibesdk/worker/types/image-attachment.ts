/**
 * Supported image MIME types for upload
 * Limited to most common web formats for reliability
 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
] as const;

export type SupportedImageMimeType = typeof SUPPORTED_IMAGE_MIME_TYPES[number];

/**
 * Image attachment for user messages
 * Represents an image that can be sent with text prompts
 */
export interface ImageAttachment {
	/** Unique identifier for this attachment */
	id: string;
	/** Original filename */
	filename: string;
	/** MIME type of the image */
	mimeType: SupportedImageMimeType;
	/** Base64-encoded image data (without data URL prefix) */
	base64Data: string;
	/** Size of the original file in bytes */
	size?: number;
	/** Optional dimensions if available */
	dimensions?: {
		width: number;
		height: number;
	};
}

export interface ProcessedImageAttachment {
	/** MIME type of the image */
	mimeType: SupportedImageMimeType;
	/** Base64-encoded image data (without data URL prefix) */
	base64Data?: string;
    /** R2 key of the image */
    r2Key: string;
    /** URL of the image */
    publicUrl: string;
    /** image data hash */
    hash: string;
}

/**
 * Utility to check if a MIME type is supported
 */
export function isSupportedImageType(mimeType: string): mimeType is SupportedImageMimeType {
	return SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType as SupportedImageMimeType);
}

/**
 * Utility to get file extension from MIME type
 */
export function getFileExtensionFromMimeType(mimeType: SupportedImageMimeType): string {
	const map: Record<SupportedImageMimeType, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/webp': 'webp',
	};
	return map[mimeType] || 'jpg';
}

/**
 * Maximum file size for images (10MB)
 */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum number of images per message
 */
export const MAX_IMAGES_PER_MESSAGE = 2;
