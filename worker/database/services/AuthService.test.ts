import { describe, it, expect } from 'vitest';
import { providerLabel } from './AuthService';

describe('providerLabel', () => {
	it('maps known OAuth providers to display names', () => {
		expect(providerLabel('google')).toBe('Google');
		expect(providerLabel('github')).toBe('GitHub');
		expect(providerLabel('cloudflare')).toBe('Cloudflare');
	});

	it('falls back for email or unknown/missing providers', () => {
		expect(providerLabel('email')).toBe('a different sign-in method');
		expect(providerLabel('unknown')).toBe('a different sign-in method');
		expect(providerLabel(null)).toBe('a different sign-in method');
		expect(providerLabel(undefined)).toBe('a different sign-in method');
	});
});
