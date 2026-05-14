/**
 * Unit tests for EmailService and email templates.
 *
 * Tests are offline (no real Resend API calls):
 *   - Template rendering asserts correct content is present
 *   - EmailService send methods are verified via fetch mock
 *   - Error paths (non-2xx, network failure) are covered
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailService } from './EmailService';
import { welcomeEmailHtml, welcomeEmailText } from './templates/welcome';
import {
    subscriptionActivatedEmailHtml,
    subscriptionActivatedEmailText,
} from './templates/subscription-activated';
import {
    subscriptionCancelledEmailHtml,
    subscriptionCancelledEmailText,
} from './templates/subscription-cancelled';
import { passwordResetEmailHtml, passwordResetEmailText } from './templates/password-reset';

// ── Template: welcome ─────────────────────────────────────────────────────────

describe('welcomeEmailHtml', () => {
    const data = { userName: 'Alice', loginUrl: 'https://vibesdk.app/login' };

    it('contains the user name', () => {
        expect(welcomeEmailHtml(data)).toContain('Alice');
    });

    it('contains the login URL', () => {
        expect(welcomeEmailHtml(data)).toContain('https://vibesdk.app/login');
    });

    it('is valid HTML (has DOCTYPE + body)', () => {
        const html = welcomeEmailHtml(data);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</body>');
    });

    it('mentions the free tier details', () => {
        const html = welcomeEmailHtml(data);
        expect(html.toLowerCase()).toContain('free');
        expect(html).toContain('5 app generations');
    });
});

describe('welcomeEmailText', () => {
    const data = { userName: 'Bob', loginUrl: 'https://vibesdk.app/login' };

    it('contains the user name in plain text', () => {
        expect(welcomeEmailText(data)).toContain('Bob');
    });

    it('contains the login URL in plain text', () => {
        expect(welcomeEmailText(data)).toContain('https://vibesdk.app/login');
    });
});

// ── Template: subscription-activated ─────────────────────────────────────────

describe('subscriptionActivatedEmailHtml', () => {
    const data = {
        userName: 'Carol',
        planName: 'Pro',
        billingCycle: 'monthly' as const,
        priceINR: 1699,
        nextBillingDate: '2026-06-15',
        dashboardUrl: 'https://vibesdk.app/dashboard',
    };

    it('contains the plan name', () => {
        expect(subscriptionActivatedEmailHtml(data)).toContain('Pro');
    });

    it('contains the formatted INR price', () => {
        const html = subscriptionActivatedEmailHtml(data);
        expect(html).toContain('1,699');
    });

    it('mentions GST inclusion', () => {
        expect(subscriptionActivatedEmailHtml(data).toLowerCase()).toContain('gst');
    });

    it('contains the dashboard URL', () => {
        expect(subscriptionActivatedEmailHtml(data)).toContain('https://vibesdk.app/dashboard');
    });

    it('shows "year" for annual billing cycle', () => {
        const annual = subscriptionActivatedEmailHtml({ ...data, billingCycle: 'annual', priceINR: 16990 });
        expect(annual).toContain('/year');
    });
});

describe('subscriptionActivatedEmailText', () => {
    const data = {
        userName: 'Dave',
        planName: 'Team',
        billingCycle: 'annual' as const,
        priceINR: 49990,
        nextBillingDate: '2027-05-15',
        dashboardUrl: 'https://vibesdk.app/dashboard',
    };

    it('contains plan and price in plain text', () => {
        const text = subscriptionActivatedEmailText(data);
        expect(text).toContain('Team');
        expect(text).toContain('49990');
    });
});

// ── Template: subscription-cancelled ─────────────────────────────────────────

describe('subscriptionCancelledEmailHtml', () => {
    const data = {
        userName: 'Eve',
        planName: 'Pro',
        accessUntilDate: '2026-06-30',
        reactivateUrl: 'https://vibesdk.app/pricing',
    };

    it('contains the user name', () => {
        expect(subscriptionCancelledEmailHtml(data)).toContain('Eve');
    });

    it('contains the reactivate URL', () => {
        expect(subscriptionCancelledEmailHtml(data)).toContain('https://vibesdk.app/pricing');
    });

    it('mentions access retention after cancellation', () => {
        const html = subscriptionCancelledEmailHtml(data);
        expect(html.toLowerCase()).toContain('access');
    });

    it('omits feedback URL section when not provided', () => {
        const html = subscriptionCancelledEmailHtml(data);
        expect(html).not.toContain('share why you cancelled');
    });

    it('includes feedback URL section when provided', () => {
        const html = subscriptionCancelledEmailHtml({
            ...data,
            feedbackUrl: 'https://vibesdk.app/feedback',
        });
        expect(html).toContain('share why you cancelled');
    });
});

describe('subscriptionCancelledEmailText', () => {
    it('contains cancellation confirmation in plain text', () => {
        const text = subscriptionCancelledEmailText({
            userName: 'Frank',
            planName: 'Pro',
            accessUntilDate: '2026-07-01',
            reactivateUrl: 'https://vibesdk.app/pricing',
        });
        expect(text.toLowerCase()).toContain('cancelled');
        expect(text).toContain('Frank');
    });
});

// ── Template: password-reset ──────────────────────────────────────────────────

describe('passwordResetEmailHtml', () => {
    const data = {
        userName: 'Grace',
        resetUrl: 'https://vibesdk.app/reset?token=abc123',
        expiresInMinutes: 30,
    };

    it('contains the reset URL', () => {
        expect(passwordResetEmailHtml(data)).toContain('https://vibesdk.app/reset?token=abc123');
    });

    it('mentions the expiry time', () => {
        expect(passwordResetEmailHtml(data)).toContain('30');
    });

    it('includes a "did not request" safety note', () => {
        const html = passwordResetEmailHtml(data);
        expect(html.toLowerCase()).toContain("didn");
    });
});

describe('passwordResetEmailText', () => {
    it('contains the reset URL in plain text', () => {
        const text = passwordResetEmailText({
            userName: 'Hank',
            resetUrl: 'https://vibesdk.app/reset?token=xyz',
            expiresInMinutes: 15,
        });
        expect(text).toContain('https://vibesdk.app/reset?token=xyz');
        expect(text).toContain('15');
    });
});

// ── EmailService ──────────────────────────────────────────────────────────────

describe('EmailService', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function mockResendOk(id = 'msg_test_123'): void {
        fetchSpy.mockResolvedValue({
            ok: true,
            json: async () => ({ id }),
            text: async () => '',
        });
    }

    function mockResendError(status: number, body: string): void {
        fetchSpy.mockResolvedValue({
            ok: false,
            status,
            json: async () => ({}),
            text: async () => body,
        });
    }

    const service = new EmailService('re_test_key');

    // sendWelcome
    it('sendWelcome calls Resend API with correct subject', async () => {
        mockResendOk();
        const result = await service.sendWelcome('user@example.com', {
            userName: 'Alice',
            loginUrl: 'https://vibesdk.app',
        });
        expect(result.success).toBe(true);
        expect(result.id).toBe('msg_test_123');

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body.subject).toBe('Welcome to vibesdk');
        expect(body.to).toBe('user@example.com');
    });

    it('sendWelcome includes Bearer token in Authorization header', async () => {
        mockResendOk();
        await service.sendWelcome('user@example.com', {
            userName: 'Test',
            loginUrl: 'https://vibesdk.app',
        });
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer re_test_key');
    });

    // sendSubscriptionActivated
    it('sendSubscriptionActivated calls Resend with plan name in subject', async () => {
        mockResendOk();
        await service.sendSubscriptionActivated('user@example.com', {
            userName: 'Bob',
            planName: 'Pro',
            billingCycle: 'monthly',
            priceINR: 1699,
            nextBillingDate: '2026-06-15',
            dashboardUrl: 'https://vibesdk.app/dashboard',
        });
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect((body.subject as string).toLowerCase()).toContain('pro');
    });

    // sendSubscriptionCancelled
    it('sendSubscriptionCancelled returns success on 2xx', async () => {
        mockResendOk('msg_cancel_001');
        const result = await service.sendSubscriptionCancelled('user@example.com', {
            userName: 'Carol',
            planName: 'Team',
            accessUntilDate: '2026-06-30',
            reactivateUrl: 'https://vibesdk.app/pricing',
        });
        expect(result.success).toBe(true);
        expect(result.id).toBe('msg_cancel_001');
    });

    // sendPasswordReset
    it('sendPasswordReset sets subject to password reset', async () => {
        mockResendOk();
        await service.sendPasswordReset('user@example.com', {
            userName: 'Dave',
            resetUrl: 'https://vibesdk.app/reset?token=abc',
            expiresInMinutes: 30,
        });
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect((body.subject as string).toLowerCase()).toContain('password');
    });

    // Error handling
    it('returns success:false with error message on non-2xx response', async () => {
        mockResendError(422, '{"message":"Invalid email address"}');
        const result = await service.sendWelcome('invalid', {
            userName: 'Test',
            loginUrl: 'https://vibesdk.app',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('422');
    });

    it('returns success:false with error message on network failure', async () => {
        fetchSpy.mockRejectedValue(new Error('Network error'));
        const result = await service.sendWelcome('user@example.com', {
            userName: 'Test',
            loginUrl: 'https://vibesdk.app',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network error');
    });
});
