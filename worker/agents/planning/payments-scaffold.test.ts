/**
 * Unit tests for the payments scaffold — 'SaaS with Payments' use case.
 *
 * Verifies that:
 * 1. The TemplateSelectionSchema accepts the new useCase value.
 * 2. getUsecaseSpecificInstructions returns the payments-specific content
 *    (not the style fallback) for the new use case.
 * 3. The instructions contain CF-Workers-compatible patterns and safety warnings.
 */

import { describe, it, expect } from 'vitest';
import { TemplateSelectionSchema } from '../schemas';
import { getUsecaseSpecificInstructions } from '../prompts';
import type { TemplateSelection } from '../schemas';

// ── Schema acceptance ─────────────────────────────────────────────────────────

describe('TemplateSelectionSchema — SaaS with Payments use case', () => {
    it('parses a TemplateSelection with useCase "SaaS with Payments"', () => {
        const raw = {
            selectedTemplateName: 'react-dashboard',
            reasoning: 'Dashboard template is the closest match for a SaaS app with billing.',
            useCase: 'SaaS with Payments',
            complexity: 'moderate',
            styleSelection: 'Minimalist Design',
            projectType: 'app',
        };

        const result = TemplateSelectionSchema.safeParse(raw);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.useCase).toBe('SaaS with Payments');
        }
    });

    it('still rejects unknown useCase values', () => {
        const raw = {
            selectedTemplateName: 'react-dashboard',
            reasoning: 'test',
            useCase: 'Unknown Payment Gateway',
            complexity: 'simple',
            styleSelection: null,
            projectType: 'app',
        };

        const result = TemplateSelectionSchema.safeParse(raw);
        expect(result.success).toBe(false);
    });

    it('accepts all pre-existing useCase values unchanged', () => {
        const existingCases = ['SaaS Product Website', 'Dashboard', 'Blog', 'Portfolio', 'E-Commerce', 'General', 'Other'];
        for (const useCase of existingCases) {
            const result = TemplateSelectionSchema.safeParse({
                selectedTemplateName: 'react-dashboard',
                reasoning: 'test',
                useCase,
                complexity: 'simple',
                styleSelection: null,
                projectType: 'app',
            });
            expect(result.success, `Expected ${useCase} to be valid`).toBe(true);
        }
    });
});

// ── Instruction content ───────────────────────────────────────────────────────

function makeSelection(overrides: Partial<TemplateSelection> = {}): TemplateSelection {
    return {
        selectedTemplateName: 'react-dashboard',
        reasoning: 'test',
        useCase: 'SaaS with Payments',
        complexity: 'moderate',
        styleSelection: 'Minimalist Design',
        projectType: 'app',
        ...overrides,
    };
}

describe('getUsecaseSpecificInstructions — SaaS with Payments', () => {
    it('returns a non-empty string for "SaaS with Payments"', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(typeof instructions).toBe('string');
        expect(instructions.length).toBeGreaterThan(100);
    });

    it('mentions Stripe', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('stripe');
    });

    it('mentions Cloudflare Workers compatible fetch pattern for Stripe API', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('fetch');
        expect(instructions.toLowerCase()).toContain('worker');
    });

    it('warns against Node.js Stripe SDK', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        // Must mention the incompatibility explicitly
        expect(instructions).toContain('NOT compatible');
    });

    it('includes secret key safety warning', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toUpperCase()).toContain('STRIPE_SECRET_KEY');
        expect(instructions.toLowerCase()).toContain('never expose');
    });

    it('includes webhook verification guidance', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('webhook');
        expect(instructions).toContain('Stripe-Signature');
    });

    it('includes D1 schema guidance', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('D1');
        expect(instructions).toContain('subscription_status');
    });

    it('includes Pricing page requirement', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('pricing');
    });

    it('does NOT return generic style fallback for "SaaS with Payments"', () => {
        // The default case returns "Use the following artistic style:" — payments must NOT fall through
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).not.toContain('Use the following artistic style');
    });

    it('is distinct from SaaS Product Website instructions', () => {
        const paymentsInstructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'SaaS with Payments' }));
        const landingInstructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'SaaS Product Website' }));
        expect(paymentsInstructions).not.toBe(landingInstructions);
        // Payments must include checkout-specific content absent from landing
        expect(paymentsInstructions).toContain('Checkout Session');
        expect(landingInstructions).not.toContain('Checkout Session');
    });

    it('mentions Paddle as an alternative', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('paddle');
    });

    it('mentions feature gating / entitlements', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('entitlement');
    });
});

// ── DESIGN.md injection ────────────────────────────────────────────────────────

describe('getUsecaseSpecificInstructions — DESIGN.md injection', () => {
    const makeSelection = (overrides: Partial<TemplateSelection> = {}): TemplateSelection => ({
        selectedTemplateName: 'react-dashboard',
        reasoning: 'test',
        useCase: 'SaaS with Payments',
        complexity: 'simple',
        styleSelection: 'Minimalist Design',
        projectType: 'app',
        ...overrides,
    });

    it('omits Design Rules section when designRules is undefined', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).not.toContain('Design Rules (from DESIGN.md)');
    });

    it('appends Design Rules section when designRules is provided', () => {
        const rules = 'Use Inter font. Brand color: #4F46E5.';
        const instructions = getUsecaseSpecificInstructions(makeSelection(), rules);
        expect(instructions).toContain('Design Rules (from DESIGN.md)');
        expect(instructions).toContain(rules);
    });

    it('Design Rules section appears after base instructions', () => {
        const rules = 'Custom rule XYZ';
        const instructions = getUsecaseSpecificInstructions(makeSelection(), rules);
        // Base content (payments) comes before design rules
        const paymentsIdx = instructions.indexOf('Checkout Session');
        const designIdx = instructions.indexOf('Design Rules (from DESIGN.md)');
        expect(paymentsIdx).toBeGreaterThan(-1);
        expect(designIdx).toBeGreaterThan(paymentsIdx);
    });

    it('works across all use cases', () => {
        const rules = 'Always use TailwindCSS utility classes only.';
        const useCases = ['SaaS Product Website', 'E-Commerce', 'Dashboard', 'General'] as const;
        for (const useCase of useCases) {
            const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase } as Partial<TemplateSelection>), rules);
            expect(instructions).toContain('Design Rules (from DESIGN.md)');
            expect(instructions).toContain(rules);
        }
    });
});

// ── Plausible analytics injection (DEC-033-A) ─────────────────────────────────

describe('getUsecaseSpecificInstructions — Plausible analytics injection', () => {
    const makeSelection = (overrides: Partial<TemplateSelection> = {}): TemplateSelection => ({
        selectedTemplateName: 'react-dashboard',
        reasoning: 'test',
        useCase: 'SaaS with Payments',
        complexity: 'simple',
        styleSelection: 'Minimalist Design',
        projectType: 'app',
        ...overrides,
    });

    it('includes Plausible script tag for SaaS with Payments', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('plausible.io');
        expect(instructions).toContain('data-domain');
        expect(instructions).toContain('defer');
    });

    it('includes Plausible for SaaS Product Website', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'SaaS Product Website' }));
        expect(instructions).toContain('plausible.io');
    });

    it('includes Plausible for AI SaaS', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'AI SaaS' }));
        expect(instructions).toContain('plausible.io');
    });

    it('includes Plausible for E-Commerce', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'E-Commerce' }));
        expect(instructions).toContain('plausible.io');
    });

    it('includes Plausible for Blog', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'Blog' }));
        expect(instructions).toContain('plausible.io');
    });

    it('includes Plausible for General', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'General' }));
        expect(instructions).toContain('plausible.io');
    });

    it('omits Plausible for Dashboard (internal tooling)', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'Dashboard' }));
        expect(instructions).not.toContain('plausible.io');
    });

    it('Plausible hint appears after base usecase instructions', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        const paymentsIdx = instructions.indexOf('Checkout Session');
        const plausibleIdx = instructions.indexOf('plausible.io');
        expect(paymentsIdx).toBeGreaterThan(-1);
        expect(plausibleIdx).toBeGreaterThan(paymentsIdx);
    });

    it('Plausible hint appears after DESIGN.md rules when both present', () => {
        const rules = 'Use Inter font only.';
        const instructions = getUsecaseSpecificInstructions(makeSelection(), rules);
        const designIdx = instructions.indexOf('Design Rules (from DESIGN.md)');
        const plausibleIdx = instructions.indexOf('plausible.io');
        expect(designIdx).toBeGreaterThan(-1);
        expect(plausibleIdx).toBeGreaterThan(designIdx);
    });

    it('uses defer attribute (not async)', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('defer');
        // Should explicitly warn against async
        expect(instructions.toLowerCase()).toContain('async');
    });

    it('includes YOUR_DOMAIN placeholder', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('YOUR_DOMAIN');
    });
});

// ── SEO scaffolding injection (DEC-035-F) ─────────────────────────────────────

describe('getUsecaseSpecificInstructions — SEO scaffolding injection', () => {
    const makeSelection = (overrides: Partial<TemplateSelection> = {}): TemplateSelection => ({
        selectedTemplateName: 'react-dashboard',
        reasoning: 'test',
        useCase: 'SaaS with Payments',
        complexity: 'simple',
        styleSelection: 'Minimalist Design',
        projectType: 'app',
        ...overrides,
    });

    it('includes meta description tag for SaaS with Payments', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('meta name="description"');
    });

    it('includes Open Graph tags', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('og:title');
        expect(instructions).toContain('og:description');
        expect(instructions).toContain('og:image');
    });

    it('includes canonical link tag', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('rel="canonical"');
    });

    it('includes llms.txt guidance (AI search parity with Lovable)', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('llms.txt');
    });

    it('includes react-helmet-async guidance for SPA meta tag updates', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('react-helmet-async');
    });

    it('includes OG image placeholder instruction', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('og-image.png');
    });

    it('includes SEO for SaaS Product Website', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'SaaS Product Website' }));
        expect(instructions).toContain('meta name="description"');
        expect(instructions).toContain('llms.txt');
    });

    it('includes SEO for AI SaaS', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'AI SaaS' }));
        expect(instructions).toContain('og:title');
    });

    it('includes SEO for E-Commerce', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'E-Commerce' }));
        expect(instructions).toContain('llms.txt');
    });

    it('omits SEO for Dashboard (internal tooling)', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'Dashboard' }));
        expect(instructions).not.toContain('llms.txt');
        expect(instructions).not.toContain('og:title');
    });

    it('SEO hint appears before Plausible hint in output', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        const seoIdx = instructions.indexOf('llms.txt');
        const plausibleIdx = instructions.indexOf('plausible.io');
        expect(seoIdx).toBeGreaterThan(-1);
        expect(plausibleIdx).toBeGreaterThan(seoIdx);
    });

    it('SEO hint appears after DESIGN.md rules when both present', () => {
        const rules = 'Use Inter font only.';
        const instructions = getUsecaseSpecificInstructions(makeSelection(), rules);
        const designIdx = instructions.indexOf('Design Rules (from DESIGN.md)');
        const seoIdx = instructions.indexOf('llms.txt');
        expect(designIdx).toBeGreaterThan(-1);
        expect(seoIdx).toBeGreaterThan(designIdx);
    });
});
