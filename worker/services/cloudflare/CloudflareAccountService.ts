/**
 * Cloudflare Account Service
 * Manages Cloudflare accounts and AI Gateways for users
 */

import { eq, and } from 'drizzle-orm';
import { generateId } from '../../utils/idGenerator';
import * as schema from '../../database/schema';
import { BaseService } from '../../database/services/BaseService';

export interface CloudflareAccount {
	id: string;
	name: string;
	email?: string;
}

export interface AIGateway {
	id: string;
	name: string;
	slug: string;
	cacheEnabled?: boolean;
}

export interface GatewayCredits {
	balance: number;
	currency: string;
	lastUpdated: Date;
}

/** Shape of Cloudflare API responses we consume. */
interface CfApiEnvelope<T> {
	success: boolean;
	result?: T;
	errors?: Array<{ code: number; message: string }>;
}

interface CfAccountApi {
	id: string;
	name: string;
	email?: string;
}

interface CfGatewayApi {
	id: string;
	name?: string;
	slug?: string;
	cache_enabled?: boolean;
}

interface CfCreditBalanceApi {
	balance?: number;
}

export type ActiveGatewayWithAccount = {
	gateway: typeof schema.aiGateways.$inferSelect;
	account: typeof schema.cloudflareAccounts.$inferSelect;
};

export class CloudflareAccountService extends BaseService {
	/**
	 * Fetch all Cloudflare accounts for a given token
	 */
	async fetchCloudflareAccounts(accessToken: string): Promise<CloudflareAccount[]> {
		try {
			const response = await fetch('https://api.cloudflare.com/client/v4/accounts', {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				this.logger.error('Failed to fetch Cloudflare accounts', {
					status: response.status,
					statusText: response.statusText,
				});
				return [];
			}

			const data = await response.json() as CfApiEnvelope<CfAccountApi[]>;

			if (!data.success || !data.result) {
				this.logger.warn('Cloudflare API returned unsuccessful response', { data });
				return [];
			}

			return data.result.map((account) => ({
				id: account.id,
				name: account.name,
				email: account.email,
			}));
		} catch (error) {
			this.logger.error('Error fetching Cloudflare accounts', error);
			return [];
		}
	}

	/**
	 * Fetch AI Gateways for a specific Cloudflare account
	 */
	async fetchAIGateways(accessToken: string, accountId: string): Promise<AIGateway[]> {
		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`,
				{
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (!response.ok) {
				this.logger.warn('Failed to fetch AI Gateways', {
					accountId,
					status: response.status,
				});
				return [];
			}

			const data = await response.json() as CfApiEnvelope<CfGatewayApi[]>;

			if (!data.success || !data.result) {
				return [];
			}

			return data.result.map((gateway) => ({
				id: gateway.id,
				name: gateway.name || gateway.id,
				slug: gateway.slug || gateway.id,
			}));
		} catch (error) {
			this.logger.error('Error fetching AI Gateways', { accountId, error });
			return [];
		}
	}

	/**
	 * Create a new AI Gateway for an account
	 */
	async createAIGateway(
		accessToken: string,
		accountId: string,
		gatewayName: string
	): Promise<AIGateway | null> {
		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`,
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						id: gatewayName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
						cache_ttl: 3600, // 1 hour cache
						cache_enabled: true,
						rate_limiting_interval: 60,
						rate_limiting_limit: 100,
						rate_limiting_technique: 'sliding',
					}),
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				this.logger.error('Failed to create AI Gateway', {
					accountId,
					status: response.status,
					error: errorText,
				});
				return null;
			}

			const data = await response.json() as CfApiEnvelope<CfGatewayApi>;

			if (!data.success || !data.result) {
				return null;
			}

			const gateway = data.result;
			return {
				id: gateway.id,
				name: gateway.name || gatewayName,
				slug: gateway.slug || gateway.id,
				cacheEnabled: gateway.cache_enabled,
			};
		} catch (error) {
			this.logger.error('Error creating AI Gateway', { accountId, error });
			return null;
		}
	}

	/**
	 * Fetch credits for a specific AI Gateway.
	 *
	 * Returns `null` on any upstream failure so callers can distinguish
	 * "unknown balance" (e.g. API outage, parse error) from a genuine $0
	 * balance and keep the last cached value instead of overwriting it.
	 * Note: Credits are account-level, not gateway-specific.
	 */
	async fetchGatewayCredits(
		accessToken: string,
		accountId: string,
		gatewayId: string
	): Promise<number | null> {
		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway-billing/credit_balance`,
				{
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (!response.ok) {
				this.logger.warn('Failed to fetch AI Gateway credits', {
					accountId,
					status: response.status,
				});
				return null;
			}

			const data = await response.json() as CfApiEnvelope<CfCreditBalanceApi>;

			if (!data.success || !data.result) {
				return null;
			}

			// Extract credit balance (in cents) and convert to dollars
			const balanceInCents = data.result.balance || 0;
			const balanceInDollars = balanceInCents / 100;
			return balanceInDollars;
		} catch (error) {
			this.logger.error('Error fetching gateway credits', { accountId, gatewayId, error });
			return null;
		}
	}

	/**
	 * Check if user has any existing accounts
	 */
	async hasExistingAccounts(userId: string): Promise<boolean> {
		const accounts = await this.database
			.select()
			.from(schema.cloudflareAccounts)
			.where(eq(schema.cloudflareAccounts.userId, userId))
			.all();
		return accounts.length > 0;
	}

	/**
	 * Check if user has any existing gateways
	 */
	async hasExistingGateways(userId: string): Promise<boolean> {
		const gateways = await this.database
			.select()
			.from(schema.aiGateways)
			.where(eq(schema.aiGateways.userId, userId))
			.all();
		return gateways.length > 0;
	}

	/**
	 * Save or update Cloudflare account in database
	 */
	async saveAccount(
		userId: string,
		accountId: string,
		accountName: string,
		accountEmail?: string
	): Promise<string> {
		const now = new Date();

		// Check if account already exists
		const existing = await this.database
			.select()
			.from(schema.cloudflareAccounts)
			.where(
				and(
					eq(schema.cloudflareAccounts.userId, userId),
					eq(schema.cloudflareAccounts.accountId, accountId)
				)
			)
			.get();

		if (existing) {
			await this.database
				.update(schema.cloudflareAccounts)
				.set({
					accountName,
					accountEmail,
					updatedAt: now,
					lastSyncedAt: now,
				})
				.where(eq(schema.cloudflareAccounts.id, existing.id));

			return existing.id;
		}

		const id = generateId();
		await this.database.insert(schema.cloudflareAccounts).values({
			id,
			userId,
			accountId,
			accountName,
			accountEmail,
			createdAt: now,
			updatedAt: now,
			lastSyncedAt: now,
		});

		return id;
	}

	/**
	 * Save or update AI Gateway in database
	 */
	async saveGateway(
		userId: string,
		cloudflareAccountId: string,
		gatewayId: string,
		gatewayName: string,
		gatewaySlug: string,
		autoCreated: boolean = false,
		creditsRemaining: number | null = null,
		setAsActive?: boolean
	): Promise<string> {
		const now = new Date();

		// When creditsRemaining is null the upstream credits API was unavailable
		// (see fetchGatewayCredits). Preserve the previously cached value rather
		// than clobbering it with a stale/zero reading.
		const hasCredits = creditsRemaining !== null;

		// Check if gateway already exists
		const existing = await this.database
			.select()
			.from(schema.aiGateways)
			.where(
				and(
					eq(schema.aiGateways.cloudflareAccountId, cloudflareAccountId),
					eq(schema.aiGateways.gatewayId, gatewayId)
				)
			)
			.get();

		if (existing) {
			await this.database
				.update(schema.aiGateways)
				.set({
					gatewayName,
					gatewaySlug,
					...(hasCredits ? {
						creditsRemaining,
						creditsLastUpdated: now,
					} : {}),
					updatedAt: now,
				})
				.where(eq(schema.aiGateways.id, existing.id));

			return existing.id;
		}

		// Caller should check and pass setAsActive explicitly
		const isActive = setAsActive ?? false;

		const id = generateId();
		await this.database.insert(schema.aiGateways).values({
			id,
			userId,
			cloudflareAccountId,
			gatewayId,
			gatewayName,
			gatewaySlug,
			...(hasCredits ? {
				creditsRemaining,
				creditsLastUpdated: now,
			} : {}),
			autoCreated,
			isActive,
			createdAt: now,
			updatedAt: now,
		});

		return id;
	}

	/**
	 * Fetch the user's single active gateway together with its owning account.
	 * Returns `null` when the user has not selected a gateway or the query fails.
	 * Shared by `getSelectedGatewayWithAccount` and `getUserSelection`.
	 */
	private async getActiveGatewayWithAccount(userId: string): Promise<ActiveGatewayWithAccount | null> {
		try {
			const result = await this.database
				.select()
				.from(schema.aiGateways)
				.innerJoin(
					schema.cloudflareAccounts,
					eq(schema.aiGateways.cloudflareAccountId, schema.cloudflareAccounts.id)
				)
				.where(
					and(
						eq(schema.aiGateways.userId, userId),
						eq(schema.aiGateways.isActive, true)
					)
				)
				.get();

			if (!result) return null;
			return {
				gateway: result.ai_gateways,
				account: result.cloudflare_accounts,
			};
		} catch (error) {
			this.logger.error('Error getting active gateway', { userId, error });
			return null;
		}
	}

	/**
	 * Set user's selected account and gateway (only one gateway can be active at a time)
	 */
	async setUserSelection(userId: string, accountId: string, gatewayId: string): Promise<boolean> {
		try {
			// Verify the account and gateway belong to the user
			const gateway = await this.database
				.select()
				.from(schema.aiGateways)
				.innerJoin(
					schema.cloudflareAccounts,
					eq(schema.aiGateways.cloudflareAccountId, schema.cloudflareAccounts.id)
				)
				.where(
					and(
						eq(schema.cloudflareAccounts.id, accountId),
						eq(schema.aiGateways.id, gatewayId),
						eq(schema.cloudflareAccounts.userId, userId)
					)
				)
				.get();

			if (!gateway) {
				this.logger.warn('Invalid account or gateway selection', { userId, accountId, gatewayId });
				return false;
			}

			// Deactivate all other gateways for this user (only one can be active)
			await this.database
				.update(schema.aiGateways)
				.set({ isActive: false })
				.where(eq(schema.aiGateways.userId, userId));

			// Activate the selected gateway
			await this.database
				.update(schema.aiGateways)
				.set({ isActive: true })
				.where(eq(schema.aiGateways.id, gatewayId));

			return true;
		} catch (error) {
			this.logger.error('Error setting user selection', { userId, accountId, gatewayId, error });
			return false;
		}
	}

	/**
	 * Get the user's active gateway with its owning account row (or null).
	 */
	async getSelectedGatewayWithAccount(userId: string): Promise<ActiveGatewayWithAccount | null> {
		return this.getActiveGatewayWithAccount(userId);
	}

	/**
	 * Get user's current selection (active gateway).
	 * Returns the row IDs (account + gateway) rather than the full rows.
	 */
	async getUserSelection(userId: string): Promise<{
		accountId: string | null;
		gatewayId: string | null;
	}> {
		const active = await this.getActiveGatewayWithAccount(userId);
		if (!active) return { accountId: null, gatewayId: null };
		return { accountId: active.account.id, gatewayId: active.gateway.id };
	}

	/**
	 * Get all user's accounts with their gateways
	 * Returns ALL accounts and gateways for display in settings UI
	 */
	async getUserAccountsWithGateways(userId: string) {
		try {
			const accounts = await this.database
				.select()
				.from(schema.cloudflareAccounts)
				.where(eq(schema.cloudflareAccounts.userId, userId))
				.all();

			const accountsWithGateways = await Promise.all(
				accounts.map(async (account) => {
					const gateways = await this.database
						.select()
						.from(schema.aiGateways)
						.where(eq(schema.aiGateways.cloudflareAccountId, account.id))
						.all();

					return {
						...account,
						gateways,
					};
				})
			);

			return accountsWithGateways;
		} catch (error) {
			this.logger.error('Error getting user accounts with gateways', { userId, error });
			return [];
		}
	}
}
