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

/**
 * Detect Apple/WebKit browsers subject to Intelligent Tracking Prevention
 * (ITP), which blocks third-party cookies for an origin embedded in a
 * cross-site iframe. This covers desktop Safari and every iOS/iPadOS browser
 * (all use WebKit). Best-effort UA sniffing; used only to decide whether to
 * show an advisory banner.
 */
export function isAppleWebKitBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  // iPadOS 13+ reports as "Macintosh" but exposes touch points.
  const isIPadOS =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  if (isIOS || isIPadOS) return true;
  const isDesktopSafari =
    /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android|OPR/.test(ua);
  return isDesktopSafari;
}

const MULTI_PART_SUFFIXES = [
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.in',
  'co.jp',
  'co.nz',
  'co.za',
  'com.br',
];

/**
 * Best-effort registrable domain (eTLD+1) for a host. Strips the port and
 * returns the last two labels, accounting for a small set of common
 * multi-part public suffixes. Heuristic only (no full Public Suffix List);
 * used to decide whether a preview iframe is cross-site for an advisory
 * banner, never for a security decision.
 */
export function getRegistrableDomain(host: string): string {
  if (!host) return '';
  const bare = host.split(':')[0].toLowerCase().replace(/\.$/, '');
  const labels = bare.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.includes(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * True when the preview URL is served from a different registrable domain than
 * the current dashboard page (the case where Safari blocks the cross-site
 * preview cookie). Returns false for same-origin, same-base-domain subdomains,
 * or unparseable input.
 */
export function isCrossSitePreview(previewUrl: string): boolean {
  if (!previewUrl || typeof window === 'undefined') return false;
  try {
    const previewHost = new URL(previewUrl).host;
    const appHost = window.location.host;
    const previewDomain = getRegistrableDomain(previewHost);
    const appDomain = getRegistrableDomain(appHost);
    if (!previewDomain || !appDomain) return false;
    return previewDomain !== appDomain;
  } catch {
    return false;
  }
}