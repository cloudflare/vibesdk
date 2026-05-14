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
