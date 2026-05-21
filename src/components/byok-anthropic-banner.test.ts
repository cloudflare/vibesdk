/**
 * Unit tests for ByokAnthropicBanner — date-window logic.
 *
 * Pure function tests (no DOM, no React rendering).
 * ADR-011 Option B BYOK Jun-8 trigger banner.
 */

import { describe, it, expect } from 'vitest';
import {
    isWithinBannerWindow,
    JUN_8_2026_UTC,
    JUN_22_2026_UTC,
    BANNER_DISMISS_KEY,
} from '../lib/byok-window';

describe('isWithinBannerWindow', () => {
    it('returns false before Jun 8 2026', () => {
        // Jun 7 2026 23:59:59 UTC
        const before = JUN_8_2026_UTC - 1;
        expect(isWithinBannerWindow(before)).toBe(false);
    });

    it('returns true on Jun 8 2026 exactly', () => {
        expect(isWithinBannerWindow(JUN_8_2026_UTC)).toBe(true);
    });

    it('returns true on Jun 22 2026 exactly', () => {
        expect(isWithinBannerWindow(JUN_22_2026_UTC)).toBe(true);
    });

    it('returns false after Jun 22 2026', () => {
        // Jun 23 2026 00:00:00 UTC
        const after = JUN_22_2026_UTC + 1;
        expect(isWithinBannerWindow(after)).toBe(false);
    });

    it('returns true in the middle of the window (Jun 15 2026)', () => {
        const mid = new Date('2026-06-15T12:00:00Z').getTime();
        expect(isWithinBannerWindow(mid)).toBe(true);
    });

    it('constants: JUN_22_2026_UTC is 14 days after JUN_8_2026_UTC', () => {
        const diffMs = JUN_22_2026_UTC - JUN_8_2026_UTC;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        // window is Jun 8 00:00:00 → Jun 22 23:59:59 = 14d 23h 59m 59s → floor = 14
        expect(diffDays).toBe(14);
    });
});

describe('BANNER_DISMISS_KEY', () => {
    it('matches expected localStorage key', () => {
        expect(BANNER_DISMISS_KEY).toBe('vibesdk_byok_jun8_banner_dismissed');
    });
});
