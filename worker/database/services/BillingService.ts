/**
 * BillingService — thin wrapper over subscription_tiers + razorpay_events tables.
 *
 * Keeps drizzle queries off the controller. Exposes the patterns the controller
 * needs (get status, upsert on subscribe, mark cancelled, record webhook event).
 */

import { eq } from 'drizzle-orm';
import { BaseService } from './BaseService';
import * as schema from '../schema';
import type { SubscriptionTierRow } from '../schema';
import type { SubscriptionTier } from '../../services/entitlements/entitlements';
import { ENTITLEMENTS } from '../../services/entitlements/entitlements';

export class BillingService extends BaseService {
    async getStatus(userId: string): Promise<SubscriptionTierRow | undefined> {
        return this.database
            .select()
            .from(schema.subscriptionTiers)
            .where(eq(schema.subscriptionTiers.userId, userId))
            .get();
    }

    async ensureRow(userId: string, tier: SubscriptionTier = 'free'): Promise<void> {
        const existing = await this.database
            .select({ userId: schema.subscriptionTiers.userId })
            .from(schema.subscriptionTiers)
            .where(eq(schema.subscriptionTiers.userId, userId))
            .get();
        if (existing) return;

        const ent = ENTITLEMENTS[tier];
        const limit = tier === 'enterprise' ? 10_000 : ent.maxGenerationsPerMonth;
        await this.database.insert(schema.subscriptionTiers).values({
            userId,
            tier,
            billingCycle: 'monthly',
            generationsLimit: limit,
            active: 1,
        }).run();
    }

    async recordPendingSubscription(
        userId: string,
        subscriptionId: string,
        planId: string,
        cycle: 'monthly' | 'annual',
    ): Promise<void> {
        // Upsert: if row exists, set the pending Razorpay ids + cycle.
        // Tier only flips to paid after webhook `subscription.activated`.
        const existing = await this.database
            .select({ userId: schema.subscriptionTiers.userId })
            .from(schema.subscriptionTiers)
            .where(eq(schema.subscriptionTiers.userId, userId))
            .get();

        if (existing) {
            await this.database
                .update(schema.subscriptionTiers)
                .set({
                    razorpaySubscriptionId: subscriptionId,
                    razorpayPlanId: planId,
                    billingCycle: cycle,
                    updatedAt: new Date(),
                })
                .where(eq(schema.subscriptionTiers.userId, userId))
                .run();
        } else {
            await this.database.insert(schema.subscriptionTiers).values({
                userId,
                tier: 'free',
                billingCycle: cycle,
                razorpaySubscriptionId: subscriptionId,
                razorpayPlanId: planId,
                generationsLimit: ENTITLEMENTS.free.maxGenerationsPerMonth,
                active: 1,
            }).run();
        }
    }

    async activateTier(params: {
        userId: string;
        tier: SubscriptionTier;
        cycle: 'monthly' | 'annual';
        periodStart: number;
        periodEnd: number | null;
        eventId?: string;
    }): Promise<void> {
        const ent = ENTITLEMENTS[params.tier];
        const limit = params.tier === 'enterprise' ? 10_000 : ent.maxGenerationsPerMonth;
        await this.database
            .update(schema.subscriptionTiers)
            .set({
                tier: params.tier,
                billingCycle: params.cycle,
                generationsLimit: limit,
                generationsUsedThisPeriod: 0,
                periodStartedAt: params.periodStart,
                periodEndsAt: params.periodEnd,
                active: 1,
                razorpayLastEventId: params.eventId,
                updatedAt: new Date(),
            })
            .where(eq(schema.subscriptionTiers.userId, params.userId))
            .run();
    }

    async demoteToFreeBySubscriptionId(subscriptionId: string, opts: { active: boolean; eventId?: string }): Promise<void> {
        await this.database
            .update(schema.subscriptionTiers)
            .set({
                tier: 'free',
                generationsLimit: ENTITLEMENTS.free.maxGenerationsPerMonth,
                active: opts.active ? 1 : 0,
                razorpayLastEventId: opts.eventId,
                updatedAt: new Date(),
            })
            .where(eq(schema.subscriptionTiers.razorpaySubscriptionId, subscriptionId))
            .run();
    }

    /**
     * Webhook idempotency — returns `true` if this is a first-time sighting.
     */
    async markEventProcessed(params: { eventId: string; eventType: string; entityId: string | null }): Promise<boolean> {
        const existing = await this.database
            .select({ eventId: schema.razorpayEvents.eventId })
            .from(schema.razorpayEvents)
            .where(eq(schema.razorpayEvents.eventId, params.eventId))
            .get();
        if (existing) return false;
        await this.database.insert(schema.razorpayEvents).values({
            eventId: params.eventId,
            eventType: params.eventType,
            entityId: params.entityId,
        }).run();
        return true;
    }
}
