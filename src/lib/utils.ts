import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPreviewUrl(previewURL?: string, tunnelURL?: string): string {
    // return import.meta.env.VITE_PREVIEW_MODE === 'tunnel' ? tunnelURL || previewURL || '' : previewURL || tunnelURL || '';
    return previewURL || tunnelURL || '';
}

/**
 * Convert an HTTPS tunnel URL to an Expo Go–compatible `exps://` URL.
 * Expo Go uses `exp://` for HTTP and `exps://` for HTTPS connections.
 */
export function toExpoUrl(tunnelUrl: string): string {
    return tunnelUrl.replace(/^https:\/\//, 'exps://').replace(/^http:\/\//, 'exp://');
}

export function capitalizeFirstLetter(str: string) {
  if (typeof str !== 'string' || str.length === 0) {
    return str; // Handle non-string input or empty string
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}