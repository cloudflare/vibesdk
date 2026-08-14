import { describe, expect, it, vi } from 'vitest';
import { RateLimitService } from './rateLimits';
import { DEFAULT_RATE_LIMIT_SETTINGS, type RateLimitSettings } from './config';

type RateLimitEnv = Parameters<typeof RateLimitService.enforceLLMCallsRateLimit>[0];

function createConfig(overrides: Partial<RateLimitSettings['llmCalls']> = {}): RateLimitSettings {
	return {
		...DEFAULT_RATE_LIMIT_SETTINGS,
		llmCalls: {
			...DEFAULT_RATE_LIMIT_SETTINGS.llmCalls,
			...overrides,
		},
	};
}

function createEnv(increment: ReturnType<typeof vi.fn>): RateLimitEnv {
	return {
		ENVIRONMENT: 'production',
		DORateLimitStore: {
			getByName: vi.fn(() => ({ increment })),
		},
	} as unknown as RateLimitEnv;
}

describe('RateLimitService.enforceLLMCallsRateLimit', () => {
	it('increments the user LLM credit bucket by the supplied credit cost', async () => {
		const increment = vi.fn().mockResolvedValue({ success: true });
		const env = createEnv(increment);

		await RateLimitService.enforceLLMCallsRateLimit(
			env,
			createConfig(),
			'user-1',
			'Think',
			'',
			false,
			false,
			{ creditCost: 2, throwOnExceeded: false },
		);

		expect(increment).toHaveBeenCalledWith(
			'platform:llmCalls:user:user-1',
			expect.objectContaining({ limit: 200, period: 86_400 }),
			2,
		);
	});

	it('does not throw when an increment exceeds the limit in metering mode', async () => {
		const increment = vi.fn().mockResolvedValue({ success: false, exceededLimit: 'daily' });

		await expect(
			RateLimitService.enforceLLMCallsRateLimit(
				createEnv(increment),
				createConfig(),
				'user-1',
				'Think',
				'',
				false,
				false,
				{ creditCost: 2, throwOnExceeded: false },
			),
		).resolves.toBeUndefined();
	});

	it.each([
		['disabled', createConfig({ enabled: false }), false, false, 2],
		['zero cost', createConfig(), false, false, 0],
		['BYOK exclusion', createConfig(), true, false, 2],
		['Cloudflare-connected exclusion', createConfig({ excludeCloudflareConnected: true }), false, true, 2],
	] as const)('does not increment when %s applies', async (_reason, config, isUsingBYOK, hasCloudflareConfigured, creditCost) => {
		const increment = vi.fn().mockResolvedValue({ success: true });

		await RateLimitService.enforceLLMCallsRateLimit(
			createEnv(increment),
			config,
			'user-1',
			'Think',
			'',
			isUsingBYOK,
			hasCloudflareConfigured,
			{ creditCost, throwOnExceeded: false },
		);

		expect(increment).not.toHaveBeenCalled();
	});

	it('fails open when the rate-limit store fails', async () => {
		const increment = vi.fn().mockRejectedValue(new Error('store unavailable'));

		await expect(
			RateLimitService.enforceLLMCallsRateLimit(
				createEnv(increment),
				createConfig(),
				'user-1',
				'Think',
				'',
				false,
				false,
				{ creditCost: 2, throwOnExceeded: false },
			),
		).resolves.toBeUndefined();
	});
});

describe('RateLimitService.getRequestIdentifier', () => {
	function request(headers: Record<string, string>): Request {
		return new Request('https://example.com/api/foo', { headers });
	}

	it('returns the same identifier for the same IP with different bearer tokens', async () => {
		const id1 = await RateLimitService.getRequestIdentifier(
			request({ 'CF-Connecting-IP': '1.2.3.4', Authorization: 'Bearer aaaa' }),
		);
		const id2 = await RateLimitService.getRequestIdentifier(
			request({ 'CF-Connecting-IP': '1.2.3.4', Authorization: 'Bearer bbbb' }),
		);

		expect(id1).toBe('ip:1.2.3.4');
		expect(id1).toBe(id2);
		expect(id1.startsWith('token:')).toBe(false);
	});

	it('returns the same identifier for the same IP with different token cookies', async () => {
		const id1 = await RateLimitService.getRequestIdentifier(
			request({ 'CF-Connecting-IP': '1.2.3.4', Cookie: 'accessToken=aaaa' }),
		);
		const id2 = await RateLimitService.getRequestIdentifier(
			request({ 'CF-Connecting-IP': '1.2.3.4', Cookie: 'accessToken=bbbb' }),
		);

		expect(id1).toBe('ip:1.2.3.4');
		expect(id1).toBe(id2);
	});

	it('returns different identifiers for different IPs', async () => {
		const id1 = await RateLimitService.getRequestIdentifier(request({ 'CF-Connecting-IP': '1.2.3.4' }));
		const id2 = await RateLimitService.getRequestIdentifier(request({ 'CF-Connecting-IP': '5.6.7.8' }));

		expect(id1).not.toBe(id2);
	});

	it('falls back to ip:unknown when no IP headers are present', async () => {
		const id = await RateLimitService.getRequestIdentifier(request({ Authorization: 'Bearer aaaa' }));

		expect(id).toBe('ip:unknown');
	});
});
