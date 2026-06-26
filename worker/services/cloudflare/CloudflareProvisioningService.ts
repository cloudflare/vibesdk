/**
 * Cloudflare AI Gateway provisioning orchestration.
 *
 * Shared by both linking entry points:
 * - the standalone gateway-connect flow (`/oauth/login` -> `/auth/callback`), and
 * - the "Login with Cloudflare" auto-connect path (`/api/auth/callback/cloudflare`).
 *
 * Given a Cloudflare access token and a vibesdk userId, it fetches the user's
 * accounts and AI Gateways, auto-creating a gateway when an account has none, and
 * persists the account/gateway metadata. Exactly one gateway is activated when the
 * user has no pre-existing gateway selection.
 */

import { createLogger } from '../../logger';
import {
	CloudflareAccountService,
	type AIGateway,
	type CloudflareAccount,
} from './CloudflareAccountService';

const logger = createLogger('CloudflareProvisioningService');

export class CloudflareProvisioningService {
	private readonly accountService: CloudflareAccountService;

	constructor(env: Env, accountService?: CloudflareAccountService) {
		this.accountService = accountService ?? new CloudflareAccountService(env);
	}

	/**
	 * Fetch the user's Cloudflare accounts with the given token and provision their
	 * gateways. Returns the number of accounts processed and whether the user ends
	 * up with an active gateway selected.
	 */
	async provisionFromToken(
		accessToken: string,
		userId: string,
	): Promise<{ accountCount: number; hasActiveGateway: boolean }> {
		const accounts = await this.accountService.fetchCloudflareAccounts(accessToken);
		logger.info('Fetched Cloudflare accounts for provisioning', {
			userId,
			accountCount: accounts.length,
		});

		await this.processAllAccounts(accounts, accessToken, userId);

		const hasActiveGateway =
			(await this.accountService.getSelectedGatewayWithAccount(userId)) !== null;

		return { accountCount: accounts.length, hasActiveGateway };
	}

	/**
	 * Process all accounts and their gateways.
	 */
	private async processAllAccounts(
		accounts: CloudflareAccount[],
		accessToken: string,
		userId: string,
	): Promise<void> {
		// Check once: should we activate the first gateway?
		const hasExistingGateways = await this.accountService.hasExistingGateways(userId);
		const shouldActivateFirstGateway = !hasExistingGateways;

		let totalGatewaysSoFar = 0;

		for (let i = 0; i < accounts.length; i++) {
			const account = accounts[i];
			const accountDbId = await this.accountService.saveAccount(
				userId,
				account.id,
				account.name,
				account.email,
			);

			const { gatewayCount } = await this.processAccountGateways(
				accessToken,
				userId,
				account,
				accountDbId,
				shouldActivateFirstGateway && totalGatewaysSoFar === 0,
			);

			totalGatewaysSoFar += gatewayCount;
		}
	}

	/**
	 * Process gateways for a single account.
	 */
	private async processAccountGateways(
		accessToken: string,
		userId: string,
		account: CloudflareAccount,
		accountDbId: string,
		shouldActivateFirst: boolean,
	): Promise<{ savedGateways: string[]; gatewayCount: number }> {
		const { gateways, autoCreatedGatewayId } = await this.ensureAccountHasGateways(
			accessToken,
			userId,
			account,
		);

		// Only auto-activate if there's exactly 1 gateway AND user has no existing gateways.
		const shouldActivate = shouldActivateFirst && gateways.length === 1;

		const savedGateways = await this.saveGateways(
			accessToken,
			userId,
			accountDbId,
			account.id,
			gateways,
			autoCreatedGatewayId,
			shouldActivate,
		);

		return { savedGateways, gatewayCount: gateways.length };
	}

	/**
	 * Ensure account has at least one gateway (auto-create if needed).
	 */
	private async ensureAccountHasGateways(
		accessToken: string,
		userId: string,
		account: CloudflareAccount,
	): Promise<{ gateways: AIGateway[]; autoCreatedGatewayId: string | null }> {
		let gateways = await this.accountService.fetchAIGateways(accessToken, account.id);
		let autoCreatedGatewayId: string | null = null;

		if (gateways.length === 0) {
			logger.info('No gateways found, auto-creating one', {
				userId,
				accountId: account.id,
			});

			const newGateway = await this.accountService.createAIGateway(
				accessToken,
				account.id,
				`${account.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-gateway`,
			);

			if (newGateway) {
				gateways = [newGateway];
				autoCreatedGatewayId = newGateway.id;
				logger.info('Successfully auto-created gateway', {
					gatewayId: newGateway.id,
				});
			}
		}

		return { gateways, autoCreatedGatewayId };
	}

	/**
	 * Save all gateways for an account.
	 */
	private async saveGateways(
		accessToken: string,
		userId: string,
		accountDbId: string,
		accountId: string,
		gateways: AIGateway[],
		autoCreatedGatewayId: string | null,
		shouldActivateFirst: boolean,
	): Promise<string[]> {
		const savedGatewayIds: string[] = [];

		for (let i = 0; i < gateways.length; i++) {
			const gateway = gateways[i];
			const autoCreated = gateway.id === autoCreatedGatewayId;

			const credits = await this.accountService.fetchGatewayCredits(
				accessToken,
				accountId,
				gateway.id,
			);

			const savedGatewayId = await this.accountService.saveGateway(
				userId,
				accountDbId,
				gateway.id,
				gateway.name,
				gateway.slug,
				autoCreated,
				credits,
				shouldActivateFirst && i === 0,
			);

			savedGatewayIds.push(savedGatewayId);
		}

		return savedGatewayIds;
	}
}
