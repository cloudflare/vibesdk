import { describe, expect, it } from 'vitest';
import { JWTUtils } from './jwtUtils';
import { signSpacePreviewToken, verifySpacePreviewToken } from './spacePreviewToken';

const testEnv = {
	JWT_SECRET: 'test-secret-for-space-preview-token-validation-1234567890',
};

describe('spacePreviewToken', () => {
	it('verifies a valid signed token', async () => {
		const token = await signSpacePreviewToken(testEnv, {
			spaceName: 'space-a',
			userId: 'user-a',
		});

		const claims = await verifySpacePreviewToken(testEnv, token, 'space-a');
		expect(claims).toEqual({
			spaceName: 'space-a',
			userId: 'user-a',
		});
	});

	it('rejects token for a different space', async () => {
		const token = await signSpacePreviewToken(testEnv, {
			spaceName: 'space-a',
			userId: 'user-a',
		});

		const claims = await verifySpacePreviewToken(testEnv, token, 'space-b');
		expect(claims).toBeNull();
	});

	it('rejects token with wrong purpose', async () => {
		const jwt = JWTUtils.getInstance(testEnv);
		const token = await jwt.signPayload(
			{
				spaceName: 'space-a',
				userId: 'user-a',
				purpose: 'not-space-preview',
			},
			60,
		);

		const claims = await verifySpacePreviewToken(testEnv, token, 'space-a');
		expect(claims).toBeNull();
	});

	it('rejects expired token', async () => {
		const jwt = JWTUtils.getInstance(testEnv);
		const token = await jwt.signPayload(
			{
				spaceName: 'space-a',
				userId: 'user-a',
				purpose: 'space_preview',
			},
			-1,
		);

		const claims = await verifySpacePreviewToken(testEnv, token, 'space-a');
		expect(claims).toBeNull();
	});
});
