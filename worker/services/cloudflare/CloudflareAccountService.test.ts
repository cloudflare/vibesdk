import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareAccountService } from './CloudflareAccountService';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('CloudflareAccountService.fetchGatewayCredits', () => {
	it('uses the AI Gateway billing credit-balance endpoint', async () => {
		const fetchMock = vi.fn(async () => Response.json({
			success: true,
			result: { balance: 1234 },
		}));
		vi.stubGlobal('fetch', fetchMock);
		const service = Object.assign(Object.create(CloudflareAccountService.prototype), {
			logger: { error: vi.fn(), warn: vi.fn() },
		}) as CloudflareAccountService;

		const balance = await service.fetchGatewayCredits('access-token', 'account-id', 'gateway-id');

		expect(balance).toBe(12.34);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.cloudflare.com/client/v4/accounts/account-id/ai-gateway/billing/credit-balance',
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
			}),
		);
	});
});
