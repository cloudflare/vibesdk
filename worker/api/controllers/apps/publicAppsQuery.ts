/**
 * Request-shape parsing + hard bounds for the unauthenticated public apps
 * listing. Both `page` and `search` are attacker-controlled, so they are capped
 * here to keep D1 read costs bounded (unbounded OFFSET / leading-wildcard LIKE
 * scans otherwise). Kept as a pure function so the bounds are unit-testable.
 */

export const MAX_PUBLIC_APPS_LIMIT = 100;
export const MAX_PUBLIC_APPS_PAGE = 50;
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 64;

export interface PublicAppsQueryBounds {
    limit: number;
    page: number;
    offset: number;
    search?: string;
}

export type PublicAppsQueryResult =
    | { ok: true; value: PublicAppsQueryBounds }
    | { ok: false; error: string };

/**
 * Validate and bound the pagination/search parameters. Returns `ok: false` with
 * a client-safe message when a bound is violated (maps to HTTP 400).
 */
export function parsePublicAppsQuery(params: URLSearchParams): PublicAppsQueryResult {
    const limit = Math.min(Math.max(parseInt(params.get('limit') || '20') || 20, 1), MAX_PUBLIC_APPS_LIMIT);

    const page = parseInt(params.get('page') || '1') || 1;
    if (page < 1 || page > MAX_PUBLIC_APPS_PAGE) {
        return { ok: false, error: `page must be between 1 and ${MAX_PUBLIC_APPS_PAGE}` };
    }

    const rawSearch = params.get('search') || undefined;
    if (rawSearch !== undefined) {
        if (rawSearch.length < MIN_SEARCH_LENGTH || rawSearch.length > MAX_SEARCH_LENGTH) {
            return { ok: false, error: `search must be between ${MIN_SEARCH_LENGTH} and ${MAX_SEARCH_LENGTH} characters` };
        }
        // Reject SQL LIKE wildcard metacharacters so the server fully controls
        // the pattern that reaches the LIKE query.
        if (/[%_]/.test(rawSearch)) {
            return { ok: false, error: 'search may not contain wildcard characters' };
        }
    }

    return {
        ok: true,
        value: {
            limit,
            page,
            offset: (page - 1) * limit,
            search: rawSearch,
        },
    };
}
