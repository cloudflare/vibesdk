
// ===============================
// Screenshot storage helpers
// ===============================

import { ImageAttachment } from "worker/types/image-attachment";
import { getProtocolForHost } from "./urls";

    
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

export async function uploadImageToCloudflareImages(env: Env, image: ImageAttachment, type: ImageType): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/images/v1`;

    const filename = `${image.id}-${type}-${image.filename}`;

    const bytes = base64ToUint8Array(image.base64Data);
    const blob = new Blob([bytes], { type: 'image/png' });
    const form = new FormData();
    form.append('file', blob, filename);

    // Type guard for Images binding
    const maybeImages = (env as unknown as { [key: string]: unknown })['IMAGES'];
    let resp: Response;
    if (maybeImages) {
        // Use Images service binding when available (no explicit token needed)
        type ImagesBinding = { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
        const imagesBinding = (maybeImages as ImagesBinding);

        resp = await imagesBinding.fetch(url, { method: 'POST', body: form });
    } else if (env.CLOUDFLARE_API_TOKEN) {
        // Fallback to direct API with token
        resp = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
            body: form,
        });
    } else {
        throw new Error('Cloudflare Images not available: missing IMAGES binding and CLOUDFLARE_API_TOKEN');
    }

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

export async function uploadImageToR2(env: Env, image: ImageAttachment, type: ImageType): Promise<string> {
    const bytes = base64ToUint8Array(image.base64Data);
    const r2Key = `${type}/${image.id}-${type}-${image.filename}`;
    await env.TEMPLATES_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType: 'image/png' } });

    const protocol = getProtocolForHost(env.CUSTOM_DOMAIN);
    const base = `${protocol}://${env.CUSTOM_DOMAIN}`;
    const url = `${base}/api/${encodeURIComponent(r2Key)}`;
    return url;
}


export async function uploadImage(env: Env, image: ImageAttachment, type: ImageType): Promise<string> {
    try {
        return await uploadImageToCloudflareImages(env, image, type);
    } catch (err) {
        console.warn('Cloudflare Images upload failed, will try R2 fallback', { error: err instanceof Error ? err.message : String(err), image, type });
        try {
            return await uploadImageToR2(env, image, type);
        } catch (r2Err) {
            console.warn('R2 upload fallback failed, will store as data URL', { error: r2Err instanceof Error ? r2Err.message : String(r2Err), image, type });
            // Fallback to data URL
            return `data:image/png;base64,${image.base64Data}`;
        }
    }
}