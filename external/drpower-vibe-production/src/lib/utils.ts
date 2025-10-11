import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPreviewUrl(previewURL?: string, tunnelURL?: string): string {
    // return import.meta.env.VITE_PREVIEW_MODE === 'tunnel' ? tunnelURL || previewURL || '' : previewURL || tunnelURL || '';
    return previewURL || tunnelURL || '';
}

export function capitalizeFirstLetter(str: string) {
  if (typeof str !== 'string' || str.length === 0) {
    return str; // Handle non-string input or empty string
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}