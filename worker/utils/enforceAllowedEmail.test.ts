import { describe, expect, it } from 'vitest';
import { enforceAllowedEmail } from './authUtils';
import { SecurityError } from 'shared/types/errors';

const envWith = (allowed: string) => ({ ALLOWED_EMAIL: allowed }) as unknown as Env;

describe('enforceAllowedEmail', () => {
	it('is a no-op when ALLOWED_EMAIL is unset', () => {
		expect(() => enforceAllowedEmail({} as Env, 'anyone@example.com', 'oauth')).not.toThrow();
	});

	it('is a no-op when ALLOWED_EMAIL is empty', () => {
		expect(() => enforceAllowedEmail(envWith(''), 'anyone@example.com', 'oauth')).not.toThrow();
	});

	it('admits an exactly matching email', () => {
		expect(() =>
			enforceAllowedEmail(envWith('staff@cloudflare.com'), 'staff@cloudflare.com', 'oauth'),
		).not.toThrow();
	});

	it('admits a case-insensitive match on both sides', () => {
		expect(() =>
			enforceAllowedEmail(envWith('Staff@Cloudflare.com'), 'staff@cloudflare.COM', 'oauth'),
		).not.toThrow();
	});

	it('rejects a non-matching email with a 403 SecurityError (oauth path)', () => {
		try {
			enforceAllowedEmail(envWith('staff@cloudflare.com'), 'attacker@example.com', 'oauth');
			throw new Error('expected enforceAllowedEmail to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(SecurityError);
			expect((error as SecurityError).statusCode).toBe(403);
			expect((error as SecurityError).message).toContain('to oauth');
		}
	});

	it('uses the action in the rejection message', () => {
		try {
			enforceAllowedEmail(envWith('staff@cloudflare.com'), 'attacker@example.com', 'register');
			throw new Error('expected enforceAllowedEmail to throw');
		} catch (error) {
			expect((error as SecurityError).message).toContain('to register');
		}
	});
});
