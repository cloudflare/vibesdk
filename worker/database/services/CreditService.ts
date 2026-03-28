/**
 * Credit Service - Handles credit balance and transaction operations
 */

import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { generateId } from '../../utils/idGenerator';

const CREDIT_COSTS: Record<string, number> = {
    'e1': 1,
    'e1.5': 3,
    'e2': 5,
};

const ULTRA_MULTIPLIER = 2;
const INITIAL_CREDITS = 50;

export class CreditService extends BaseService {

    async getOrCreateBalance(userId: string): Promise<schema.Credit> {
        const existing = await this.database
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.userId, userId))
            .get();

        if (existing) return existing;

        const [created] = await this.database
            .insert(schema.credits)
            .values({
                id: generateId(),
                userId,
                balance: INITIAL_CREDITS,
                totalEarned: INITIAL_CREDITS,
                totalSpent: 0,
            })
            .returning();

        // Record the initial bonus
        await this.database.insert(schema.creditTransactions).values({
            id: generateId(),
            userId,
            amount: INITIAL_CREDITS,
            type: 'bonus',
            description: 'Welcome bonus credits',
            balanceAfter: INITIAL_CREDITS,
        });

        return created;
    }

    async getBalance(userId: string): Promise<number> {
        const credit = await this.getOrCreateBalance(userId);
        return credit.balance;
    }

    getCost(model: string, ultra: boolean): number {
        const baseCost = CREDIT_COSTS[model] ?? 1;
        return ultra ? baseCost * ULTRA_MULTIPLIER : baseCost;
    }

    async spendCredits(userId: string, opts: {
        model: string;
        ultra: boolean;
        provider?: string;
        appId?: string;
        description?: string;
    }): Promise<{ success: boolean; balance: number; cost: number; message?: string }> {
        const cost = this.getCost(opts.model, opts.ultra);
        const credit = await this.getOrCreateBalance(userId);

        if (credit.balance < cost) {
            return { success: false, balance: credit.balance, cost, message: 'Insufficient credits' };
        }

        const newBalance = credit.balance - cost;

        await this.database
            .update(schema.credits)
            .set({
                balance: newBalance,
                totalSpent: credit.totalSpent + cost,
                updatedAt: new Date(),
            })
            .where(eq(schema.credits.userId, userId));

        await this.database.insert(schema.creditTransactions).values({
            id: generateId(),
            userId,
            amount: -cost,
            type: 'spent',
            description: opts.description || `AI generation (${opts.model}${opts.ultra ? ' Ultra' : ''})`,
            model: opts.model,
            provider: opts.provider,
            appId: opts.appId,
            balanceAfter: newBalance,
        });

        return { success: true, balance: newBalance, cost };
    }

    async addCredits(userId: string, amount: number, description: string, type: 'earned' | 'bonus' | 'refund' = 'bonus'): Promise<number> {
        const credit = await this.getOrCreateBalance(userId);
        const newBalance = credit.balance + amount;

        await this.database
            .update(schema.credits)
            .set({
                balance: newBalance,
                totalEarned: credit.totalEarned + amount,
                updatedAt: new Date(),
            })
            .where(eq(schema.credits.userId, userId));

        await this.database.insert(schema.creditTransactions).values({
            id: generateId(),
            userId,
            amount,
            type,
            description,
            balanceAfter: newBalance,
        });

        return newBalance;
    }

    async getTransactions(userId: string, opts?: { limit?: number; offset?: number }): Promise<schema.CreditTransaction[]> {
        const limit = opts?.limit ?? 20;
        const offset = opts?.offset ?? 0;

        return this.database
            .select()
            .from(schema.creditTransactions)
            .where(eq(schema.creditTransactions.userId, userId))
            .orderBy(desc(schema.creditTransactions.createdAt))
            .limit(limit)
            .offset(offset);
    }

    async getUsageSummary(userId: string): Promise<{
        balance: number;
        totalEarned: number;
        totalSpent: number;
        transactionsThisMonth: number;
        spentThisMonth: number;
    }> {
        const credit = await this.getOrCreateBalance(userId);
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyStats = await this.database
            .select({
                count: sql<number>`COUNT(*)`,
                totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${schema.creditTransactions.type} = 'spent' THEN ABS(${schema.creditTransactions.amount}) ELSE 0 END), 0)`,
            })
            .from(schema.creditTransactions)
            .where(and(
                eq(schema.creditTransactions.userId, userId),
                gte(schema.creditTransactions.createdAt, startOfMonth)
            ))
            .get();

        return {
            balance: credit.balance,
            totalEarned: credit.totalEarned,
            totalSpent: credit.totalSpent,
            transactionsThisMonth: Number(monthlyStats?.count) || 0,
            spentThisMonth: Number(monthlyStats?.totalSpent) || 0,
        };
    }
}
