/**
 * BYOK Anthropic Jun-8 trigger banner — date-window logic.
 *
 * Pure functions, no React, no DOM. Extracted for unit-testability.
 * Consumed by ByokAnthropicBanner component.
 */

/** localStorage key for permanent banner dismiss. */
export const BANNER_DISMISS_KEY = 'vibesdk_byok_jun8_banner_dismissed';

/** Jun 8 2026 00:00:00 UTC — Anthropic billing split activation email date. */
export const JUN_8_2026_UTC = new Date('2026-06-08T00:00:00Z').getTime();

/** Jun 22 2026 23:59:59 UTC — 14-day window end (decay after 2 weeks). */
export const JUN_22_2026_UTC = new Date('2026-06-22T23:59:59Z').getTime();

/** Returns true when `now` falls within the [Jun 8, Jun 22] 2026 banner window. */
export function isWithinBannerWindow(now: number = Date.now()): boolean {
    return now >= JUN_8_2026_UTC && now <= JUN_22_2026_UTC;
}

/** Returns true when the banner has been permanently dismissed. */
export function isBannerDismissed(): boolean {
    try {
        return localStorage.getItem(BANNER_DISMISS_KEY) === 'true';
    } catch {
        return false;
    }
}

/** Permanently dismisses the banner by setting the localStorage flag. */
export function dismissBanner(): void {
    try {
        localStorage.setItem(BANNER_DISMISS_KEY, 'true');
    } catch {
        // localStorage unavailable — silent no-op
    }
}
