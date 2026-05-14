/**
 * Unit tests for the UI pattern corpus (ui-corpus.ts).
 *
 * Verifies:
 * 1. getUiPatternHints returns relevant, non-empty content for known keys.
 * 2. useCaseToCorpusKeys maps all TemplateSelectionSchema use cases correctly.
 * 3. Deduplication: repeated keys don't produce duplicate pattern sections.
 * 4. Unknown keys and null gracefully return safe defaults.
 * 5. Each category constant contains its expected anchor terms.
 */

import { describe, it, expect } from 'vitest';
import {
    getUiPatternHints,
    useCaseToCorpusKeys,
    AUTH_PATTERNS,
    NAV_PATTERNS,
    DASHBOARD_PATTERNS,
    TABLE_PATTERNS,
    FORM_PATTERNS,
    ECOMMERCE_PATTERNS,
    SAAS_PATTERNS,
    STATE_PATTERNS,
    CARD_PATTERNS,
    MOBILE_PATTERNS,
} from './ui-corpus';

// ── Category constants ────────────────────────────────────────────────────────

describe('AUTH_PATTERNS', () => {
    it('covers split-screen sign in pattern', () => {
        expect(AUTH_PATTERNS).toContain('Split-Screen Sign In');
    });
    it('covers multi-step onboarding', () => {
        expect(AUTH_PATTERNS).toContain('Multi-Step Onboarding');
    });
    it('covers email verification gate', () => {
        expect(AUTH_PATTERNS).toContain('Email Verification Gate');
    });
});

describe('DASHBOARD_PATTERNS', () => {
    it('covers KPI metric row', () => {
        expect(DASHBOARD_PATTERNS).toContain('Metric KPI Row');
    });
    it('covers time-series chart', () => {
        expect(DASHBOARD_PATTERNS).toContain('Time-Series Chart');
    });
    it('covers activity feed', () => {
        expect(DASHBOARD_PATTERNS).toContain('Activity Feed');
    });
});

describe('ECOMMERCE_PATTERNS', () => {
    it('covers product grid with filters', () => {
        expect(ECOMMERCE_PATTERNS).toContain('Product Grid With Filters');
    });
    it('covers checkout steps', () => {
        expect(ECOMMERCE_PATTERNS).toContain('Checkout Steps');
    });
    it('covers cart sidebar', () => {
        expect(ECOMMERCE_PATTERNS).toContain('Cart Sidebar');
    });
});

describe('SAAS_PATTERNS', () => {
    it('covers API keys management', () => {
        expect(SAAS_PATTERNS).toContain('API Keys Management');
    });
    it('covers billing plan cards', () => {
        expect(SAAS_PATTERNS).toContain('Billing Plan Cards');
    });
    it('covers webhook endpoints', () => {
        expect(SAAS_PATTERNS).toContain('Webhook Endpoints');
    });
});

describe('MOBILE_PATTERNS', () => {
    it('covers pull-to-refresh', () => {
        expect(MOBILE_PATTERNS).toContain('Pull-to-Refresh');
    });
    it('covers bottom sheet action sheet', () => {
        expect(MOBILE_PATTERNS).toContain('Bottom Sheet');
    });
    it('covers floating action button', () => {
        expect(MOBILE_PATTERNS).toContain('Floating Action Button');
    });
});

// ── useCaseToCorpusKeys ───────────────────────────────────────────────────────

describe('useCaseToCorpusKeys', () => {
    it('maps SaaS Product Website to landing + auth', () => {
        const keys = useCaseToCorpusKeys('SaaS Product Website');
        expect(keys).toContain('landing');
        expect(keys).toContain('auth');
    });

    it('maps SaaS with Payments to saas-payments + auth', () => {
        const keys = useCaseToCorpusKeys('SaaS with Payments');
        expect(keys).toContain('saas-payments');
        expect(keys).toContain('auth');
    });

    it('maps Dashboard to dashboard', () => {
        const keys = useCaseToCorpusKeys('Dashboard');
        expect(keys).toContain('dashboard');
    });

    it('maps E-Commerce to ecommerce', () => {
        const keys = useCaseToCorpusKeys('E-Commerce');
        expect(keys).toContain('ecommerce');
    });

    it('maps Blog to general + landing', () => {
        const keys = useCaseToCorpusKeys('Blog');
        expect(keys).toContain('general');
    });

    it('falls back to [general] for null', () => {
        expect(useCaseToCorpusKeys(null)).toEqual(['general']);
    });

    it('falls back to [general] for undefined', () => {
        expect(useCaseToCorpusKeys(undefined)).toEqual(['general']);
    });

    it('falls back to [general] for unknown string', () => {
        expect(useCaseToCorpusKeys('Completely Unknown Use Case')).toEqual(['general']);
    });
});

// ── getUiPatternHints ─────────────────────────────────────────────────────────

describe('getUiPatternHints', () => {
    it('returns non-empty string for known key "dashboard"', () => {
        const hints = getUiPatternHints(['dashboard']);
        expect(hints.length).toBeGreaterThan(200);
    });

    it('returns non-empty string for "ecommerce"', () => {
        const hints = getUiPatternHints(['ecommerce']);
        expect(hints).toContain('E-Commerce Patterns');
    });

    it('returns empty string for empty key array', () => {
        expect(getUiPatternHints([])).toBe('');
    });

    it('returns empty string for all-unknown keys', () => {
        expect(getUiPatternHints(['unknown-key-xyz'])).toBe('');
    });

    it('includes header "UI Pattern Reference" section marker', () => {
        const hints = getUiPatternHints(['auth']);
        expect(hints).toContain('UI Pattern Reference');
    });

    it('deduplicates repeated keys (same section not doubled)', () => {
        const once = getUiPatternHints(['dashboard']);
        const twice = getUiPatternHints(['dashboard', 'dashboard']);
        expect(once).toBe(twice);
    });

    it('combines multiple keys without duplication when they share a section', () => {
        // auth key → AUTH_PATTERNS + FORM_PATTERNS
        // saas-payments key → SAAS_PATTERNS + AUTH_PATTERNS + FORM_PATTERNS + CARD_PATTERNS
        // AUTH_PATTERNS and FORM_PATTERNS appear in both — should appear once
        const hints = getUiPatternHints(['auth', 'saas-payments']);
        const authCount = (hints.match(/Auth & Onboarding Patterns/g) ?? []).length;
        expect(authCount).toBe(1);
    });

    it('saas-payments hints contain SaaS patterns', () => {
        const hints = getUiPatternHints(['saas-payments']);
        expect(hints).toContain('SaaS & Settings Patterns');
    });

    it('dashboard hints contain analytics patterns', () => {
        const hints = getUiPatternHints(['dashboard']);
        expect(hints).toContain('Dashboard & Analytics Patterns');
    });

    it('mobile hints contain mobile-first patterns', () => {
        const hints = getUiPatternHints(['mobile']);
        expect(hints).toContain('Mobile-First Patterns');
    });

    it('general hints include cards and form patterns', () => {
        const hints = getUiPatternHints(['general']);
        expect(hints).toContain('Cards & Content Patterns');
        expect(hints).toContain('Forms & Input Patterns');
    });
});
