/**
 * Billing controller — Razorpay subscriptions + one-time credit top-ups.
 *
 * Endpoints:
 *   GET  /api/billing/status              → current tier + usage
 *   POST /api/billing/subscription        → create Razorpay subscription (returns short_url + sub id)
 *   POST /api/billing/subscription/cancel → cancel at cycle end
 *   POST /api/billing/order               → create one-time order (credit pack)
 *   POST /api/billing/verify-payment      → verify client-returned payment signature
 *   POST /api/billing/webhook             → Razorpay webhook (signature-verified, idempotent)
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { RazorpayService, type RazorpayWebhookEvent } from '../../../services/billing/razorpay';
import {
    ENTITLEMENTS,
    ensureSubscriptionRow,
    type SubscriptionTier,
} from '../../../services/entitlements/entitlements';
import { eq } from 'drizzle-orm';
import { subscriptionTiers, razorpayEvents } from '../../../database/schema';
import { createDatabase } from '../../../database/database';

const logger = createLogger('BillingController');

interface BillingStatusData {
    tier: SubscriptionTier;
    billingCycle: 'monthly' | 'annual';
    generationsLimit: number;
    generationsUsedThisPeriod: number;
    periodEndsAt: number | null;
    active: boolean;
    features: typeof ENTITLEMENTS[SubscriptionTier];
    razorpaySubscriptionId: string | null;
    currency: string;
}

interface CreateSubscriptionResult {
    subscriptionId: string;
    shortUrl: string;      // hosted Razorpay authorize page
    status: string;
    keyId: string;         // public key for Razorpay Checkout SDK
}

interface CreateOrderResult {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
}

interface VerifyPaymentResult {
    verified: boolean;
    message?: string;
}

interface PlanTierSelection {
    tier: Exclude<SubscriptionTier, 'free' | 'enterprise'>;   // pro | team
    cycle: 'monthly' | 'annual';
}

export class BillingController extends BaseController {
    static logger = logger;

    static async getStatus(
        _req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<BillingStatusData>>> {
        try {
            const user = context.user!;
            const db = createDatabase(env);
            await ensureSubscriptionRow(env.DB as unknown as D1Database, user.id);
            const row = await db
                .select()
                .from(subscriptionTiers)
                .where(eq(subscriptionTiers.userId, user.id))
                .get();
            if (!row) return BillingController.createErrorResponse<BillingStatusData>('No subscription row', 500);
            return BillingController.createSuccessResponse<BillingStatusData>({
                tier: row.tier as SubscriptionTier,
                billingCycle: row.billingCycle as 'monthly' | 'annual',
                generationsLimit: row.generationsLimit,
                generationsUsedThisPeriod: row.generationsUsedThisPeriod,
                periodEndsAt: row.periodEndsAt,
                active: Boolean(row.active),
                features: ENTITLEMENTS[row.tier as SubscriptionTier],
                razorpaySubscriptionId: row.razorpaySubscriptionId,
                currency: row.currency,
            });
        } catch (err) {
            logger.error('getStatus failed', { error: err instanceof Error ? err.message : String(err) });
            return BillingController.createErrorResponse<BillingStatusData>('Failed to load billing status', 500);
        }
    }

    static async createSubscription(
        req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<CreateSubscriptionResult>>> {
        try {
            const user = context.user!;
            const body = (await req.json()) as PlanTierSelection;
            const planId = resolvePlanId(env, body.tier, body.cycle);
            if (!planId) {
                return BillingController.createErrorResponse<CreateSubscriptionResult>(
                    `No Razorpay plan configured for ${body.tier}/${body.cycle}`,
                    400,
                );
            }

            const rzp = new RazorpayService(env);
            const sub = await rzp.createSubscription({
                planId,
                totalCount: body.cycle === 'annual' ? 1 : 12,
                notes: { userId: user.id, tier: body.tier, cycle: body.cycle },
            });

            // Record the pending subscription id so webhook can correlate.
            const db = createDatabase(env);
            await db
                .insert(subscriptionTiers)
                .values({
                    userId: user.id,
                    tier: 'free',                    // stays free until webhook activates
                    billingCycle: body.cycle,
                    razorpaySubscriptionId: sub.id,
                    razorpayPlanId: sub.plan_id,
                    generationsLimit: ENTITLEMENTS.free.maxGenerationsPerMonth,
                    active: 1,
                })
                .onConflictDoUpdate({
                    target: subscriptionTiers.userId,
                    set: {
                        razorpaySubscriptionId: sub.id,
                        razorpayPlanId: sub.plan_id,
                        billingCycle: body.cycle,
                        updatedAt: new Date(),
                    },
                });

            return BillingController.createSuccessResponse<CreateSubscriptionResult>({
                subscriptionId: sub.id,
                shortUrl: sub.short_url,
                status: sub.status,
                keyId: env.RAZORPAY_KEY_ID ?? '',
            });
        } catch (err) {
            logger.error('createSubscription failed', { error: err instanceof Error ? err.message : String(err) });
            return BillingController.createErrorResponse<CreateSubscriptionResult>('Failed to create subscription', 500);
        }
    }

    static async cancelSubscription(
        _req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<{ status: string }>>> {
        try {
            const user = context.user!;
            const db = createDatabase(env);
            const row = await db
                .select()
                .from(subscriptionTiers)
                .where(eq(subscriptionTiers.userId, user.id))
                .get();
            if (!row?.razorpaySubscriptionId) {
                return BillingController.createErrorResponse<{ status: string }>('No active subscription', 404);
            }
            const rzp = new RazorpayService(env);
            const cancelled = await rzp.cancelSubscription(row.razorpaySubscriptionId, true);
            return BillingController.createSuccessResponse({ status: cancelled.status });
        } catch (err) {
            logger.error('cancelSubscription failed', { error: err instanceof Error ? err.message : String(err) });
            return BillingController.createErrorResponse<{ status: string }>('Failed to cancel subscription', 500);
        }
    }

    static async createOrder(
        req: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<CreateOrderResult>>> {
        try {
            const user = context.user!;
            const body = (await req.json()) as { amountPaise: number; currency?: 'INR' | 'USD' };
            if (!Number.isInteger(body.amountPaise) || body.amountPaise < 100) {
                return BillingController.createErrorResponse<CreateOrderResult>('Invalid amount', 400);
            }
            const rzp = new RazorpayService(env);
            const order = await rzp.createOrder({
                amountPaise: body.amountPaise,
                currency: body.currency ?? 'INR',
                receipt: `u_${user.id}_${Date.now()}`,
                notes: { userId: user.id },
            });
            return BillingController.createSuccessResponse<CreateOrderResult>({
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: env.RAZORPAY_KEY_ID ?? '',
            });
        } catch (err) {
            logger.error('createOrder failed', { error: err instanceof Error ? err.message : String(err) });
            return BillingController.createErrorResponse<CreateOrderResult>('Failed to create order', 500);
        }
    }

    static async verifyPayment(
        req: Request,
        env: Env,
    ): Promise<ControllerResponse<ApiResponse<VerifyPaymentResult>>> {
        try {
            const body = (await req.json()) as { orderId: string; paymentId: string; signature: string };
            const rzp = new RazorpayService(env);
            const ok = await rzp.verifyPaymentSignature(body);
            return BillingController.createSuccessResponse<VerifyPaymentResult>({
                verified: ok,
                message: ok ? undefined : 'Signature mismatch',
            });
        } catch (err) {
            logger.error('verifyPayment failed', { error: err instanceof Error ? err.message : String(err) });
            return BillingController.createErrorResponse<VerifyPaymentResult>('Failed to verify payment', 500);
        }
    }

    /**
     * Razorpay webhook receiver.
     * Public endpoint — gated by HMAC signature check, not auth cookie.
     * Idempotent: drops duplicate event_ids via razorpay_events table.
     */
    static async webhook(
        req: Request,
        env: Env,
    ): Promise<ControllerResponse<ApiResponse<{ ok: boolean }>>> {
        try {
            const signature = req.headers.get('x-razorpay-signature');
            if (!signature) {
                return BillingController.createErrorResponse<{ ok: boolean }>('Missing signature', 400);
            }
            const rawBody = await req.text();
            const rzp = new RazorpayService(env);
            const valid = await rzp.verifyWebhookSignature(rawBody, signature);
            if (!valid) {
                logger.warn('Webhook signature failed');
                return BillingController.createErrorResponse<{ ok: boolean }>('Invalid signature', 401);
            }

            const event = JSON.parse(rawBody) as RazorpayWebhookEvent;
            const eventId = event.id ?? `${event.event}-${event.created_at}`;
            const entityId =
                event.payload.subscription?.entity.id ??
                event.payload.order?.entity.id ??
                event.payload.payment?.entity.id ??
                null;

            const db = createDatabase(env);

            // Idempotency — skip if already processed.
            const existing = await db
                .select({ id: razorpayEvents.eventId })
                .from(razorpayEvents)
                .where(eq(razorpayEvents.eventId, eventId))
                .get();
            if (existing) {
                return BillingController.createSuccessResponse({ ok: true });
            }
            await db.insert(razorpayEvents).values({
                eventId,
                eventType: event.event,
                entityId,
            });

            // Dispatch by event type.
            await dispatchWebhook(event, env, rzp);
            return BillingController.createSuccessResponse({ ok: true });
        } catch (err) {
            logger.error('webhook failed', { error: err instanceof Error ? err.message : String(err) });
            return BillingController.createErrorResponse<{ ok: boolean }>('Webhook processing failed', 500);
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function resolvePlanId(
    env: Env,
    tier: PlanTierSelection['tier'],
    cycle: PlanTierSelection['cycle'],
): string | undefined {
    if (tier === 'pro' && cycle === 'monthly') return env.RAZORPAY_PRO_MONTHLY_PLAN_ID;
    if (tier === 'pro' && cycle === 'annual') return env.RAZORPAY_PRO_ANNUAL_PLAN_ID;
    if (tier === 'team' && cycle === 'monthly') return env.RAZORPAY_TEAM_MONTHLY_PLAN_ID;
    if (tier === 'team' && cycle === 'annual') return env.RAZORPAY_TEAM_ANNUAL_PLAN_ID;
    return undefined;
}

async function dispatchWebhook(
    event: RazorpayWebhookEvent,
    env: Env,
    rzp: RazorpayService,
): Promise<void> {
    const db = createDatabase(env);

    switch (event.event) {
        case 'subscription.activated':
        case 'subscription.charged': {
            const sub = event.payload.subscription?.entity;
            if (!sub) return;
            const mapping = rzp.mapPlanToTier(sub.plan_id);
            if (!mapping) return;

            const userId = sub.notes?.userId;
            if (!userId) return;

            const ent = ENTITLEMENTS[mapping.tier];
            await db
                .update(subscriptionTiers)
                .set({
                    tier: mapping.tier,
                    billingCycle: mapping.cycle,
                    generationsLimit: ent.maxGenerationsPerMonth,
                    generationsUsedThisPeriod: 0,
                    periodStartedAt: sub.current_start ?? Math.floor(Date.now() / 1000),
                    periodEndsAt: sub.current_end,
                    active: 1,
                    razorpayLastEventId: event.id,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptionTiers.userId, userId));
            return;
        }

        case 'subscription.cancelled':
        case 'subscription.halted':
        case 'subscription.paused': {
            const sub = event.payload.subscription?.entity;
            if (!sub) return;
            await db
                .update(subscriptionTiers)
                .set({
                    tier: 'free',
                    generationsLimit: ENTITLEMENTS.free.maxGenerationsPerMonth,
                    active: event.event === 'subscription.cancelled' ? 0 : 1,
                    razorpayLastEventId: event.id,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptionTiers.razorpaySubscriptionId, sub.id));
            return;
        }

        case 'payment.captured': {
            // Credit top-up flow. Order.notes.creditPackId could be used to map packages.
            // Left as a TODO-marker — requires credit-pack catalog table.
            return;
        }

        default:
            // Unknown event — record but don't act. Safe default.
            return;
    }
}
