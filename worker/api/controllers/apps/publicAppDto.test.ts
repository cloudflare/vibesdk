import { describe, it, expect } from 'vitest';
import { toPublicAppListItem, toPublicAppDetail } from './publicAppDto';
import type { EnhancedAppData } from '../../../database/types';

/**
 * Regression tests for the public response projections. These lock the wire
 * contract: sensitive/operational columns must never appear on the public
 * endpoints, and the intended public feature (original prompt on the detail
 * endpoint) must remain present. This catches any future re-leak from naively
 * spreading a full app row into a response.
 */

// Fields that must never appear in a public listing response.
const LISTING_DENY_LIST = [
    'originalPrompt',
    'finalPrompt',
    'sessionToken',
    'userId',
    'deploymentId',
    'parentAppId',
    'isArchived',
    'version',
    'screenshotCapturedAt',
] as const;

// Fields that must never appear in a non-owner detail response.
const DETAIL_NON_OWNER_DENY_LIST = [
    'finalPrompt',
    'sessionToken',
    'userId',
    'deploymentId',
    'parentAppId',
] as const;

function makeApp(overrides: Partial<EnhancedAppData> = {}): EnhancedAppData {
    return {
        // schema.apps columns (sensitive ones deliberately populated)
        id: 'app-1',
        title: 'Test App',
        description: 'A test app',
        iconUrl: null,
        originalPrompt: 'build me a secret internal tool with API keys',
        finalPrompt: 'refined secret prompt',
        framework: 'react',
        userId: 'user-123',
        sessionToken: 'anon-session-token-abc',
        visibility: 'public',
        status: 'completed',
        deploymentId: 'deployment-xyz',
        githubRepositoryUrl: 'https://github.com/acme/private-repo',
        githubRepositoryVisibility: 'private',
        isArchived: false,
        isFeatured: true,
        version: 3,
        parentAppId: 'parent-app-9',
        screenshotUrl: 'https://cdn/shot.png',
        screenshotCapturedAt: new Date('2024-01-01'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-02-01'),
        lastDeployedAt: new Date('2024-02-02'),
        // EnhancedAppData additions
        userName: 'Alice',
        userAvatar: 'https://cdn/avatar.png',
        starCount: 5,
        userStarred: false,
        userFavorited: false,
        viewCount: 10,
        forkCount: 1,
        likeCount: 0,
        ...overrides,
    };
}

describe('toPublicAppListItem', () => {
    it('excludes all sensitive/operational fields', () => {
        const result = toPublicAppListItem(makeApp());
        const keys = Object.keys(result);
        for (const field of LISTING_DENY_LIST) {
            expect(keys).not.toContain(field);
        }
    });

    it('keeps safe display + stats fields', () => {
        const result = toPublicAppListItem(makeApp());
        expect(result.id).toBe('app-1');
        expect(result.title).toBe('Test App');
        expect(result.userName).toBe('Alice');
        expect(result.starCount).toBe(5);
        expect(result.viewCount).toBe(10);
        expect(result.isFeatured).toBe(true);
    });

    it('nulls GitHub fields for private repositories', () => {
        const result = toPublicAppListItem(makeApp());
        expect(result.githubRepositoryUrl).toBeNull();
        expect(result.githubRepositoryVisibility).toBeNull();
    });

    it('exposes GitHub fields for public repositories', () => {
        const result = toPublicAppListItem(
            makeApp({
                githubRepositoryUrl: 'https://github.com/acme/public-repo',
                githubRepositoryVisibility: 'public',
            }),
        );
        expect(result.githubRepositoryUrl).toBe('https://github.com/acme/public-repo');
        expect(result.githubRepositoryVisibility).toBe('public');
    });

    it('never serializes a private repo URL to JSON', () => {
        const json = JSON.stringify(toPublicAppListItem(makeApp()));
        expect(json).not.toContain('private-repo');
        expect(json).not.toContain('secret');
        expect(json).not.toContain('deployment-xyz');
        expect(json).not.toContain('user-123');
    });
});

describe('toPublicAppDetail (non-owner)', () => {
    it('excludes operational fields but keeps the original prompt', () => {
        const result = toPublicAppDetail(makeApp(), false);
        const keys = Object.keys(result);
        for (const field of DETAIL_NON_OWNER_DENY_LIST) {
            // userId/deploymentId are present as keys but must be undefined
            if (field === 'userId' || field === 'deploymentId') {
                expect(result[field]).toBeUndefined();
            } else {
                expect(keys).not.toContain(field);
            }
        }
        // Intended public feature: prompt remains visible.
        expect(result.originalPrompt).toBe('build me a secret internal tool with API keys');
    });

    it('nulls private GitHub fields for non-owners', () => {
        const result = toPublicAppDetail(makeApp(), false);
        expect(result.githubRepositoryUrl).toBeNull();
        expect(result.githubRepositoryVisibility).toBeNull();
    });

    it('does not serialize finalPrompt/sessionToken/deploymentId/userId', () => {
        const json = JSON.stringify(toPublicAppDetail(makeApp(), false));
        expect(json).not.toContain('refined secret prompt');
        expect(json).not.toContain('anon-session-token-abc');
        expect(json).not.toContain('deployment-xyz');
        expect(json).not.toContain('user-123');
    });
});

describe('toPublicAppDetail (owner)', () => {
    it('includes userId and deploymentId for the owner', () => {
        const result = toPublicAppDetail(makeApp(), true);
        expect(result.userId).toBe('user-123');
        expect(result.deploymentId).toBe('deployment-xyz');
    });

    it('exposes the private repo URL to the owner', () => {
        const result = toPublicAppDetail(makeApp(), true);
        expect(result.githubRepositoryUrl).toBe('https://github.com/acme/private-repo');
        expect(result.githubRepositoryVisibility).toBe('private');
    });

    it('still never exposes sessionToken or finalPrompt to the owner', () => {
        const json = JSON.stringify(toPublicAppDetail(makeApp(), true));
        expect(json).not.toContain('anon-session-token-abc');
        expect(json).not.toContain('refined secret prompt');
    });
});
