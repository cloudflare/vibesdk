/**
 * Razorpay billing service — edge-compatible (no Node SDK).
 *
 * Uses Web Crypto for HMAC-SHA256 signature verification, fetch() for
 * the Razorpay REST API. Works on Cloudflare Workers with zero dependencies.
 *
 * Flows supported:
 *   1. One-time order (credit top-up): createOrder → client pays → verifyPaymentSignature
 *   2. Subscription (Pro/Team tier): createSubscription → client authorizes → webhook activates
 *   3. Webhook idempotent processing: verifyWebhookSignature + dedup via razorpay_events
 *
 * Environment variables expected on `env`:
 *   RAZORPAY_KEY_ID         — public, sent to client for Checkout
 *   RAZORPAY_KEY_SECRET     — server-only; basic-auth for REST + HMAC for order verify
 *   RAZORPAY_WEBHOOK_SECRET — server-only; HMAC-SHA256 verify incoming webhook body
 */

import type { SubscriptionTier } from '../entitlements/entitlements';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayEnv {
    readonly RAZORPAY_KEY_ID?: string;
    readonly RAZORPAY_KEY_SECRET?: string;
    readonly RAZORPAY_WEBHOOK_SECRET?: string;
    readonly RAZORPAY_PRO_MONTHLY_PLAN_ID?: string;
    readonly RAZORPAY_PRO_ANNUAL_PLAN_ID?: string;
    readonly RAZORPAY_TEAM_MONTHLY_PLAN_ID?: string;
    readonly RAZORPAY_TEAM_ANNUAL_PLAN_ID?: string;
}

export interface CreateOrderArgs {
    readonly amountPaise: number;     // 1 INR = 100 paise
    readonly currency?: 'INR' | 'USD';
    readonly receipt: string;         // our internal id, echoed back by Razorpay
    readonly notes?: Record<string, string>;
}

export interface RazorpayOrder {
    readonly id: string;              // 'order_xxx'
    readonly amount: number;
    readonly currency: string;
    readonly receipt: string;
    readonly status: 'created' | 'attempted' | 'paid';
}

export interface CreateSubscriptionArgs {
    readonly planId: string;          // Razorpay plan_id
    readonly totalCount?: number;     // months for monthly, years for annual
    readonly customerNotify?: 0 | 1;
    readonly notes?: Record<string, string>;
}

export interface RazorpaySubscription {
    readonly id: string;              // 'sub_xxx'
    readonly plan_id: string;
    readonly status: 'created' | 'authenticated' | 'active' | 'paused' | 'halted' | 'cancelled' | 'completed' | 'expired';
    readonly current_start: number | null;
    readonly current_end: number | null;
    readonly short_url: string;       // hosted authorize page
}

export interface VerifyPaymentArgs {
    readonly orderId: string;
    readonly paymentId: string;
    readonly signature: string;
}

export interface RazorpayWebhookEvent {
    readonly entity: 'event';
    readonly event: string;                                    // e.g. 'payment.captured'
    readonly created_at: number;
    readonly payload: {
        readonly payment?: { entity: RazorpayPaymentEntity };
        readonly order?: { entity: RazorpayOrderEntity };
        readonly subscription?: { entity: RazorpaySubscriptionEntity };
    };
    readonly id?: string;
}

export interface RazorpayPaymentEntity {
    readonly id: string;
    readonly order_id: string | null;
    readonly amount: number;
    readonly currency: string;
    readonly status: string;
    readonly method: string;
    readonly email: string;
    readonly notes?: Record<string, string>;
}

export interface RazorpayOrderEntity {
    readonly id: string;
    readonly amount: number;
    readonly amount_paid: number;
    readonly status: string;
    readonly receipt: string;
    readonly notes?: Record<string, string>;
}

export interface RazorpaySubscriptionEntity {
    readonly id: string;
    readonly plan_id: string;
    readonly status: RazorpaySubscription['status'];
    readonly customer_id?: string;
    readonly current_start: number | null;
    readonly current_end: number | null;
    readonly notes?: Record<string, string>;
}

// ── Core API calls ──────────────────────────────────────────────────────

export class RazorpayService {
    constructor(private readonly env: RazorpayEnv) {
        if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
            throw new Error('Razorpay keys not configured on env');
        }
    }

    /** One-time order — used for credit top-ups or one-shot purchases. */
    async createOrder(args: CreateOrderArgs): Promise<RazorpayOrder> {
        const body = {
            amount: args.amountPaise,
            currency: args.currency ?? 'INR',
            receipt: args.receipt,
            notes: args.notes ?? {},
        };
        return this.post<RazorpayOrder>('/orders', body);
    }

    /** Recurring subscription — Pro / Team tier plans. */
    async createSubscription(args: CreateSubscriptionArgs): Promise<RazorpaySubscription> {
        const body = {
            plan_id: args.planId,
            total_count: args.totalCount ?? 12,
            customer_notify: args.customerNotify ?? 1,
            notes: args.notes ?? {},
        };
        return this.post<RazorpaySubscription>('/subscriptions', body);
    }

    async cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true): Promise<RazorpaySubscription> {
        return this.post<RazorpaySubscription>(`/subscriptions/${subscriptionId}/cancel`, {
            cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
        });
    }

    async fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
        return this.get<RazorpaySubscription>(`/subscriptions/${subscriptionId}`);
    }

    /**
     * Verify the HMAC signature returned by Razorpay Checkout.
     * Signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
     * Used immediately after client-side handler receives it.
     */
    async verifyPaymentSignature(args: VerifyPaymentArgs): Promise<boolean> {
        const payload = `${args.orderId}|${args.paymentId}`;
        return hmacVerify(payload, args.signature, this.env.RAZORPAY_KEY_SECRET!);
    }

    /**
     * Verify the HMAC signature on an incoming webhook.
     * Signature = HMAC-SHA256(raw_body, webhook_secret)
     * Header: X-Razorpay-Signature
     */
    async verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
        if (!this.env.RAZORPAY_WEBHOOK_SECRET) return false;
        return hmacVerify(rawBody, signature, this.env.RAZORPAY_WEBHOOK_SECRET);
    }

    /**
     * Best-effort plan-id → tier mapping.
     * Returns null if the plan is unknown (don't grant entitlements blindly).
     */
    mapPlanToTier(planId: string): { tier: SubscriptionTier; cycle: 'monthly' | 'annual' } | null {
        if (planId === this.env.RAZORPAY_PRO_MONTHLY_PLAN_ID) return { tier: 'pro', cycle: 'monthly' };
        if (planId === this.env.RAZORPAY_PRO_ANNUAL_PLAN_ID) return { tier: 'pro', cycle: 'annual' };
        if (planId === this.env.RAZORPAY_TEAM_MONTHLY_PLAN_ID) return { tier: 'team', cycle: 'monthly' };
        if (planId === this.env.RAZORPAY_TEAM_ANNUAL_PLAN_ID) return { tier: 'team', cycle: 'annual' };
        return null;
    }

    // ── private ─────────────────────────────────────────────────────────

    private async post<T>(path: string, body: unknown): Promise<T> {
        const res = await fetch(`${RAZORPAY_API}${path}`, {
            method: 'POST',
            headers: {
                'Authorization': this.basicAuth(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        return this.parseOrThrow<T>(res, path);
    }

    private async get<T>(path: string): Promise<T> {
        const res = await fetch(`${RAZORPAY_API}${path}`, {
            headers: { 'Authorization': this.basicAuth() },
        });
        return this.parseOrThrow<T>(res, path);
    }

    private async parseOrThrow<T>(res: Response, path: string): Promise<T> {
        const text = await res.text();
        if (!res.ok) {
            throw new RazorpayApiError(res.status, path, text);
        }
        return JSON.parse(text) as T;
    }

    private basicAuth(): string {
        const token = btoa(`${this.env.RAZORPAY_KEY_ID}:${this.env.RAZORPAY_KEY_SECRET}`);
        return `Basic ${token}`;
    }
}

export class RazorpayApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly path: string,
        public readonly body: string,
    ) {
        super(`Razorpay ${status} on ${path}: ${body.slice(0, 200)}`);
        this.name = 'RazorpayApiError';
    }
}

// ── Web Crypto HMAC helpers ─────────────────────────────────────────────

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
    const computed = await hmacSha256Hex(payload, secret);
    return timingSafeEqual(computed, signature);
}

async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    return bytesToHex(new Uint8Array(sig));
}

function bytesToHex(b: Uint8Array): string {
    let out = '';
    for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0');
    return out;
}

/** Constant-time equality — avoid timing side-channels on signature compare. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
