/**
 * BYOK FAQ Section — accordion with 4 BYOK/pricing questions.
 *
 * Copy from BYOK-ONBOARDING-COPY.md §FAQ Additions.
 * Rendered at the bottom of the pricing page.
 * Ship by Jun 3 2026 (T-5d before Anthropic Jun-8 activation email).
 */

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';

interface FaqEntry {
    readonly id: string;
    readonly question: string;
    readonly answer: string;
}

const BYOK_FAQ_ENTRIES: readonly FaqEntry[] = [
    {
        id: 'anthropic-jun15',
        question: "Will Anthropic's new pricing (Jun 15) affect my vibesdk subscription?",
        answer:
            "If you use BYOK — your own Anthropic API key — then no. You pay Anthropic directly at their published rates. vibesdk never adds a markup on AI usage. Your vibesdk subscription price does not change.",
    },
    {
        id: 'what-is-byok',
        question: 'What is BYOK?',
        answer:
            'BYOK means Bring Your Own Key. Instead of vibesdk buying AI credits on your behalf, you connect your own Anthropic, OpenAI, or Google AI API key. Every AI request goes directly from vibesdk to your provider account — you see the exact costs in your Anthropic Console or OpenAI dashboard, not in vibesdk billing. There is no per-token markup from vibesdk.',
    },
    {
        id: 'key-safety',
        question: 'Is my API key safe?',
        answer:
            'Yes. Your key is encrypted with XChaCha20-Poly1305 using a per-user encryption key before it is stored. It is never logged, never visible to vibesdk staff, and never sent anywhere except directly to your chosen AI provider. You can delete it from vibesdk Settings at any time — this does not affect your provider account.',
    },
    {
        id: 'switch-byok',
        question: 'Can I switch between vibesdk\'s AI and my own key?',
        answer:
            'Yes. Open Settings > AI Model Configurations > Manage API Keys to add, swap, or remove your key. If no BYOK key is configured, vibesdk falls back to its own AI provider pool, which counts against your plan quota.',
    },
];

export function ByokFaqSection() {
    return (
        <section className="mx-auto w-full max-w-2xl px-4 py-16">
            <h2 className="mb-8 text-center text-xl font-semibold text-text-primary">
                Frequently asked questions
            </h2>
            <Accordion type="single" collapsible className="w-full">
                {BYOK_FAQ_ENTRIES.map((entry) => (
                    <AccordionItem key={entry.id} value={entry.id}>
                        <AccordionTrigger className="text-left text-sm font-medium text-text-primary">
                            {entry.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-text-primary/70">
                            {entry.answer}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </section>
    );
}
