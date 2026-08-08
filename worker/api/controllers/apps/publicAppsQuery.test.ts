import { describe, it, expect } from 'vitest';
import {
    parsePublicAppsQuery,
    MAX_PUBLIC_APPS_PAGE,
    MAX_PUBLIC_APPS_LIMIT,
} from './publicAppsQuery';

function query(params: Record<string, string>): URLSearchParams {
    return new URLSearchParams(params);
}

describe('parsePublicAppsQuery', () => {
    it('applies defaults for an empty query', () => {
        const result = parsePublicAppsQuery(query({}));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.limit).toBe(20);
            expect(result.value.page).toBe(1);
            expect(result.value.offset).toBe(0);
            expect(result.value.search).toBeUndefined();
        }
    });

    it('caps limit at the maximum', () => {
        const result = parsePublicAppsQuery(query({ limit: '99999' }));
        expect(result.ok && result.value.limit).toBe(MAX_PUBLIC_APPS_LIMIT);
    });

    it('rejects an out-of-range page', () => {
        const result = parsePublicAppsQuery(query({ page: '999999' }));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain(`${MAX_PUBLIC_APPS_PAGE}`);
        }
    });

    it('accepts the maximum page', () => {
        const result = parsePublicAppsQuery(query({ page: String(MAX_PUBLIC_APPS_PAGE), limit: '10' }));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.offset).toBe((MAX_PUBLIC_APPS_PAGE - 1) * 10);
        }
    });

    it('rejects a too-short search', () => {
        const result = parsePublicAppsQuery(query({ search: 'a' }));
        expect(result.ok).toBe(false);
    });

    it('rejects a too-long search', () => {
        const result = parsePublicAppsQuery(query({ search: 'a'.repeat(65) }));
        expect(result.ok).toBe(false);
    });

    it('rejects wildcard metacharacters in search', () => {
        expect(parsePublicAppsQuery(query({ search: '%' })).ok).toBe(false);
        expect(parsePublicAppsQuery(query({ search: 'ab%cd' })).ok).toBe(false);
        expect(parsePublicAppsQuery(query({ search: 'ab_cd' })).ok).toBe(false);
    });

    it('accepts a valid search term', () => {
        const result = parsePublicAppsQuery(query({ search: 'todo app' }));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.search).toBe('todo app');
        }
    });
});
