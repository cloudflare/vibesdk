/**
 * Unit tests for the AI SaaS scaffold — 'AI SaaS' use case.
 *
 * Verifies that:
 * 1. The TemplateSelectionSchema accepts the new useCase value.
 * 2. getUsecaseSpecificInstructions returns the AI-SaaS-specific content
 *    (not the style fallback) for the new use case.
 * 3. The instructions contain CF-Workers-compatible LLM patterns and safety warnings.
 */

import { describe, it, expect } from 'vitest';
import { TemplateSelectionSchema } from '../schemas';
import { getUsecaseSpecificInstructions } from '../prompts';
import { useCaseToCorpusKeys } from '../prompts/ui-corpus';
import type { TemplateSelection } from '../schemas';

// ── Schema acceptance ─────────────────────────────────────────────────────────

describe('TemplateSelectionSchema — AI SaaS use case', () => {
    it('parses a TemplateSelection with useCase "AI SaaS"', () => {
        const raw = {
            selectedTemplateName: 'react-dashboard',
            reasoning: 'Dashboard template is the closest match for an AI-powered SaaS app.',
            useCase: 'AI SaaS',
            complexity: 'moderate',
            styleSelection: 'Minimalist Design',
            projectType: 'app',
        };

        const result = TemplateSelectionSchema.safeParse(raw);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.useCase).toBe('AI SaaS');
        }
    });

    it('still rejects unknown useCase values', () => {
        const raw = {
            selectedTemplateName: 'react-dashboard',
            reasoning: 'test',
            useCase: 'LLM Magic App',
            complexity: 'simple',
            styleSelection: null,
            projectType: 'app',
        };

        const result = TemplateSelectionSchema.safeParse(raw);
        expect(result.success).toBe(false);
    });

    it('still accepts all pre-existing useCase values unchanged', () => {
        const existingCases = [
            'SaaS Product Website',
            'SaaS with Payments',
            'Dashboard',
            'Blog',
            'Portfolio',
            'E-Commerce',
            'General',
            'Other',
        ];
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
        useCase: 'AI SaaS',
        complexity: 'moderate',
        styleSelection: 'Minimalist Design',
        projectType: 'app',
        ...overrides,
    };
}

describe('getUsecaseSpecificInstructions — AI SaaS', () => {
    it('returns a non-empty string for "AI SaaS"', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(typeof instructions).toBe('string');
        expect(instructions.length).toBeGreaterThan(100);
    });

    it('includes streaming response guidance', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('stream');
        expect(instructions).toContain('text/event-stream');
    });

    it('warns against Node.js LLM SDKs', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('NOT import');
        expect(instructions.toLowerCase()).toContain('openai');
    });

    it('includes CF Workers raw fetch pattern for LLM calls', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('fetch');
        expect(instructions.toLowerCase()).toContain('worker');
    });

    it('includes API key safety warning (no localStorage)', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('never store');
        expect(instructions.toLowerCase()).toContain('localstorage');
    });

    it('includes D1 schema guidance with required tables', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('D1');
        expect(instructions).toContain('conversations');
        expect(instructions).toContain('messages');
        expect(instructions).toContain('user_settings');
    });

    it('includes rate limiting guidance', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('rate limit');
    });

    it('mentions Chat or Completion UI requirement', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        const lower = instructions.toLowerCase();
        expect(lower.includes('chat') || lower.includes('completion')).toBe(true);
    });

    it('includes API Key Settings page requirement', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions.toLowerCase()).toContain('api key');
        expect(instructions.toLowerCase()).toContain('settings');
    });

    it('does NOT return generic style fallback for "AI SaaS"', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).not.toContain('Use the following artistic style');
    });

    it('is distinct from SaaS with Payments instructions', () => {
        const aiInstructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'AI SaaS' }));
        const paymentsInstructions = getUsecaseSpecificInstructions(makeSelection({ useCase: 'SaaS with Payments' }));
        expect(aiInstructions).not.toBe(paymentsInstructions);
        expect(aiInstructions).toContain('ReadableStream');
        expect(paymentsInstructions).not.toContain('ReadableStream');
    });

    it('warns about CF Workers memory and CPU limits for LLM history', () => {
        const instructions = getUsecaseSpecificInstructions(makeSelection());
        expect(instructions).toContain('128 MB');
        expect(instructions).toContain('30 s');
    });
});

// ── Corpus key mapping ────────────────────────────────────────────────────────

describe('useCaseToCorpusKeys — AI SaaS', () => {
    it('maps "AI SaaS" to dashboard + auth keys', () => {
        const keys = useCaseToCorpusKeys('AI SaaS');
        expect(keys).toContain('dashboard');
        expect(keys).toContain('auth');
    });

    it('does not change mapping for existing use cases', () => {
        expect(useCaseToCorpusKeys('SaaS with Payments')).toContain('saas-payments');
        expect(useCaseToCorpusKeys('Dashboard')).toContain('dashboard');
        expect(useCaseToCorpusKeys('E-Commerce')).toContain('ecommerce');
    });
});
