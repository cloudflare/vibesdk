/**
 * EmailService — Resend.com integration for transactional emails.
 *
 * Uses raw fetch() to the Resend REST API — compatible with Cloudflare Workers
 * (no Node.js SDK). Requires the RESEND_API_KEY secret set via `wrangler secret put`.
 *
 * Supported templates:
 *   - welcome              — new user signup
 *   - subscription-activated — payment succeeded
 *   - subscription-cancelled  — cancellation confirmed
 *   - password-reset       — one-time reset link
 *
 * Usage:
 *   const email = new EmailService(env.RESEND_API_KEY);
 *   await email.sendWelcome({ userName: 'Alice', loginUrl: 'https://vibesdk.app' });
 */

import {
    welcomeEmailHtml,
    welcomeEmailText,
    type WelcomeEmailData,
} from './templates/welcome';
import {
    subscriptionActivatedEmailHtml,
    subscriptionActivatedEmailText,
    type SubscriptionActivatedEmailData,
} from './templates/subscription-activated';
import {
    subscriptionCancelledEmailHtml,
    subscriptionCancelledEmailText,
    type SubscriptionCancelledEmailData,
} from './templates/subscription-cancelled';
import {
    passwordResetEmailHtml,
    passwordResetEmailText,
    type PasswordResetEmailData,
} from './templates/password-reset';

const RESEND_API = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'vibesdk <noreply@vibesdk.app>';

export interface EmailResult {
    readonly success: boolean;
    readonly id?: string;          // Resend message ID
    readonly error?: string;
}

interface ResendSendPayload {
    readonly from: string;
    readonly to: string | readonly string[];
    readonly subject: string;
    readonly html: string;
    readonly text: string;
    readonly reply_to?: string;
}

export class EmailService {
    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    // ── Public send methods ──────────────────────────────────────────────────

    async sendWelcome(to: string, data: WelcomeEmailData): Promise<EmailResult> {
        return this.send({
            from: FROM_ADDRESS,
            to,
            subject: 'Welcome to vibesdk',
            html: welcomeEmailHtml(data),
            text: welcomeEmailText(data),
        });
    }

    async sendSubscriptionActivated(
        to: string,
        data: SubscriptionActivatedEmailData,
    ): Promise<EmailResult> {
        return this.send({
            from: FROM_ADDRESS,
            to,
            subject: `Your vibesdk ${data.planName} plan is active`,
            html: subscriptionActivatedEmailHtml(data),
            text: subscriptionActivatedEmailText(data),
        });
    }

    async sendSubscriptionCancelled(
        to: string,
        data: SubscriptionCancelledEmailData,
    ): Promise<EmailResult> {
        return this.send({
            from: FROM_ADDRESS,
            to,
            subject: `Your vibesdk ${data.planName} plan has been cancelled`,
            html: subscriptionCancelledEmailHtml(data),
            text: subscriptionCancelledEmailText(data),
        });
    }

    async sendPasswordReset(to: string, data: PasswordResetEmailData): Promise<EmailResult> {
        return this.send({
            from: FROM_ADDRESS,
            to,
            subject: 'Reset your vibesdk password',
            html: passwordResetEmailHtml(data),
            text: passwordResetEmailText(data),
        });
    }

    // ── Internal Resend API call ─────────────────────────────────────────────

    private async send(payload: ResendSendPayload): Promise<EmailResult> {
        try {
            const response = await fetch(RESEND_API, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const body = await response.text();
                return { success: false, error: `Resend ${response.status}: ${body}` };
            }

            const json = (await response.json()) as { id?: string };
            return { success: true, id: json.id };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            return { success: false, error: message };
        }
    }
}
