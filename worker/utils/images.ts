
// ===============================
// Screenshot storage helpers
// ===============================

import { ImageAttachment, ProcessedImageAttachment, SupportedImageMimeType } from "worker/types/image-attachment";
import { getProtocolForHost } from "./urls";

// ===============================
// Blank screenshot detection
// ===============================

interface BlankDetectionResult {
    isBlank: boolean;
    reason: string;
}

/**
 * Calculates Shannon entropy of byte data.
 * Higher entropy indicates more randomness/variation.
 * Uniform/blank images have very low entropy (< 2.0).
 */
export function calculateEntropy(data: Uint8Array): number {
    const freq = new Array(256).fill(0);
    for (const byte of data) {
        freq[byte]++;
    }

    let entropy = 0;
    for (const count of freq) {
        if (count > 0) {
            const p = count / data.length;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
}

/**
 * Detects if a screenshot is blank/uniform using file size and entropy analysis.
 * Memory-efficient: doesn't decode full PNG pixel data.
 *
 * @param base64Data - Base64 encoded PNG (without data URL prefix)
 * @param minFileSize - Minimum expected file size in bytes (default: 10KB)
 * @param minEntropy - Minimum entropy threshold (default: 2.0)
 */
export function detectBlankScreenshot(
    base64Data: string,
    minFileSize: number = 10000,
    minEntropy: number = 2.0
): BlankDetectionResult {
    const bytes = base64ToUint8Array(base64Data);

    // Check 1: File size
    // A blank 1280x720 PNG typically compresses to < 5KB
    // Real screenshots with content are usually > 50KB
    if (bytes.length < minFileSize) {
        return {
            isBlank: true,
            reason: `File size too small: ${bytes.length} bytes (minimum: ${minFileSize})`
        };
    }

    // Check 2: Entropy of the last portion of the file (compressed pixel data)
    // Sample the last 1000 bytes which contains compressed image data
    const sampleSize = Math.min(1000, bytes.length);
    const sample = bytes.slice(-sampleSize);
    const entropy = calculateEntropy(sample);

    if (entropy < minEntropy) {
        return {
            isBlank: true,
            reason: `Low entropy: ${entropy.toFixed(2)} (minimum: ${minEntropy})`
        };
    }

    return {
        isBlank: false,
        reason: 'Passed all checks'
    };
}

    
export function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export enum ImageType {
    SCREENSHOTS = 'screenshots',
    UPLOADS = 'uploads',
}

export async function uploadImageToCloudflareImages(env: Env, image: ImageAttachment, type: ImageType, bytes?: Uint8Array): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/images/v1`;

    const filename = `${image.id}-${type}-${image.filename}`;

    const data = bytes ?? base64ToUint8Array(image.base64Data!);
    const blob = new Blob([data], { type: image.mimeType });
    const form = new FormData();
    form.append('file', blob, filename);

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        body: form,
    });

    const json = await resp.json() as {
        success: boolean;
        result?: { id: string; variants?: string[] };
        errors?: Array<{ message?: string }>;
    };

    if (!resp.ok || !json.success || !json.result) {
        const errMsg = json.errors?.map(e => e.message).join('; ') || `status ${resp.status}`;
        throw new Error(`Cloudflare Images upload failed: ${errMsg}`);
    }

    const variants = json.result.variants || [];
    if (variants.length > 0) {
        // Prefer first variant URL
        return variants[0];
    }
    throw new Error('Cloudflare Images upload succeeded without variants');
}

export function getPublicUrlForR2Image(env: Env, r2Key: string): string {
    const protocol = getProtocolForHost(env.CUSTOM_DOMAIN);
    const base = `${protocol}://${env.CUSTOM_DOMAIN}`;
    const url = `${base}/api/${r2Key}`;
    return url;
}

export async function uploadImageToR2(env: Env, image: ImageAttachment, type: ImageType, cfImagesUrl?: string, bytes?: Uint8Array): Promise<{ url: string; r2Key: string }> {
    const data = bytes ?? base64ToUint8Array(image.base64Data!);
    const r2Key = `${type}/${image.id}/${encodeURIComponent(image.filename)}`;
    await env.TEMPLATES_BUCKET.put(r2Key, data, { httpMetadata: { contentType: image.mimeType }, customMetadata: { "cfImagesUrl": cfImagesUrl || '' } });

    return { url: getPublicUrlForR2Image(env, r2Key), r2Key };
}

export async function uploadImage(env: Env, image: ImageAttachment, type: ImageType): Promise<ProcessedImageAttachment> {
    // Hash in parallel to uploads
    const hashPromise = hashImageB64url(image.base64Data!);
    // Compute bytes once for both CF Images and R2
    const bytes = base64ToUint8Array(image.base64Data!);

    // Obtain CF Images URL first (when enabled) so we can pass it into R2 metadata
    let cfImagesUrl = '';
    if (env.USE_CLOUDFLARE_IMAGES) {
        try {
            cfImagesUrl = await uploadImageToCloudflareImages(env, image, type, bytes);
        } catch (err) {
            console.warn('Cloudflare Images upload failed, will try R2 fallback', { error: err instanceof Error ? err.message : String(err), image, type });
        }
    }

    // Upload to R2 with cfImagesUrl in custom metadata when available
    const { r2Key, url } = await uploadImageToR2(env, image, type, cfImagesUrl, bytes);
    const hash = await hashPromise;

    return {
        ...image,
        publicUrl: cfImagesUrl || url,
        hash,
        mimeType: image.mimeType,
        r2Key,
    }
}

function sanitizeBase64Data(dataUrl: string): string {
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

export async function hashImageB64url(dataUrl: string): Promise<string> {
    // This is required for both hashing and uploading.
    const imageBuffer = Buffer.from(sanitizeBase64Data(dataUrl), 'base64');

    // Calculate the SHA-256 hash of the image data for a unique fingerprint.
    const hashBuffer = await crypto.subtle.digest('SHA-256', imageBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hash;
}

export async function imageToBase64(env: Env, image: ProcessedImageAttachment): Promise<string> {
    try {
        // If base64 data is not available, try to fetch it from the r2 key
        if (!image.base64Data) {
            const r2Key = image.r2Key;
            if (!r2Key) {
                throw new Error('No R2 key provided for image');
            }
            image = await downloadR2Image(env, r2Key);
        }
        return `data:${image.mimeType};base64,${image.base64Data}`;
    } catch (error) {
        console.error('Failed to convert image to base64:', error, image);
        return '';
    }
}

export async function imagesToBase64(env: Env, images: ProcessedImageAttachment[]): Promise<string[]> {
    return (await Promise.all(images.map(image => imageToBase64(env, image)))).filter((image) => image !== '');
}

export async function downloadR2Image(env: Env, r2Key: string) : Promise<ProcessedImageAttachment> {
    const response = await env.TEMPLATES_BUCKET.get(r2Key);
    if (!response || !response.body) {
        throw new Error('Failed to fetch image from R2');
    }
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.httpMetadata!.contentType! as SupportedImageMimeType;
    const customMetadata = response.customMetadata;
    const cfImagesUrl = customMetadata?.cfImagesUrl;
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    // Get the filename and mimeType from response
    return {
        base64Data: sanitizeBase64Data(base64),
        r2Key,
        publicUrl: cfImagesUrl || getPublicUrlForR2Image(env, r2Key),
        hash: await hashImageB64url(base64),
        mimeType,    }
}
