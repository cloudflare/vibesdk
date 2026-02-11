/**
 * App Service - Database operations for apps
 */

import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq, and, or, desc, asc, sql, isNull, inArray } from 'drizzle-orm';
import { generateId } from '../../utils/idGenerator';
import { formatRelativeTime } from '../../utils/timeFormatter';
import type {
    EnhancedAppData,
    AppWithFavoriteStatus,
    FavoriteToggleResult,
    PaginatedResult,
    AppQueryOptions,
    PublicAppQueryOptions,
    OwnershipResult,
    AppVisibilityUpdateResult,
    TimePeriod,
    PaginationParams
} from '../types';
import { ScreenshotSecurity } from 'worker/utils/screenshot-security';

// Type definitions
type WhereCondition = ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof or> | undefined;
type RankedAppQueryResult = {
    app: typeof schema.apps.$inferSelect;
    userName: string | null;
    userAvatar: string | null;
    viewCount: number;
    starCount: number;
    forkCount: number;
    recentViews?: number;
    recentStars?: number;
};

export class AppService extends BaseService {
    private readonly RANKING_WEIGHTS = {
        VIEWS: 1,
        STARS: 3,
        FORKS: 5
    };



    // ========================================
    // APP OPERATIONS
    // ========================================

    /**
     * Create a new app
     */
    async createApp(appData:schema.NewApp): Promise<schema.App> {
        const [app] = await this.database
            .insert(schema.apps)
            .values({
                ...appData,
            })
            .returning();
        return app;
    }
    /**
     * Get public apps with pagination and sorting
     */
    async getPublicApps(options: PublicAppQueryOptions = {}): Promise<PaginatedResult<EnhancedAppData>> {
        const {
            limit = 20,
            offset = 0,
            sort = 'recent',
            order = 'desc',
            period = 'all',
            framework,
            search,
            userId
        } = options;

        try {
            const whereConditions = this.buildPublicAppConditions(framework, search);
            const whereClause = this.buildWhereConditions(whereConditions);
            const readDb = this.getReadDb('fast');
            
            const basicApps = await this.executeRankedQuery(
                readDb,
                whereClause,
                sort,
                period,
                order,
                limit,
                offset
            ).catch((error: unknown) => {
                this.logger.error('executeRankedQuery failed', {
                    errorMessage: error instanceof Error ? error.message : String(error),
                    errorName: error instanceof Error ? error.name : 'UnknownError',
                    errorCause: (error as any)?.cause,
                    errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
                    sort,
                    period,
                    limit,
                    offset
                });
                throw error;
            });

            // Get total count for pagination
            const totalCountResult = await readDb
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.apps)
                .where(whereClause)
                .catch((error: unknown) => {
                    this.logger.error('Count query failed', {
                        errorMessage: error instanceof Error ? error.message : String(error),
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                        errorCause: (error as any)?.cause
                    });
                    throw error;
                });

            const total = totalCountResult[0]?.count || 0;

            if (basicApps.length === 0) {
                return {
                    data: [],
                    pagination: {
                        limit,
                        offset,
                        total,
                        hasMore: false
                    }
                };
            }

            const appIds = basicApps.map((row: RankedAppQueryResult) => row.app.id);

            const { userStars, userFavorites } = await this.addUserSpecificAppData(appIds, userId);
            
            const appsWithAnalytics: EnhancedAppData[] = basicApps.map((row: RankedAppQueryResult) => {
                const isStarred = userStars.has(row.app.id);
                const isFavorited = userFavorites.has(row.app.id);
                
                return {
                    ...row.app,
                    userName: row.userName,
                    userAvatar: row.userAvatar,
                    viewCount: row.viewCount || 0,
                    starCount: row.starCount || 0,
                    forkCount: row.forkCount || 0,
                    likeCount: 0,
                    userStarred: isStarred,
                    userFavorited: isFavorited
                };
            });

            return {
                data: await this.enrichScreenshotUrls(appsWithAnalytics),
                pagination: {
                    limit,
                    offset,
                    total,
                    hasMore: offset + limit < total
                }
            };
        } catch (error: unknown) {
            this.logger.error('getPublicApps failed', {
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorCause: (error as any)?.cause,
                errorType: error?.constructor?.name || 'Unknown',
                options
            });
            throw error;
        }
    }

    /**
     * Helper to build common app filters (framework and search)
     * Used by both user apps and public apps to avoid duplication
     */
    private buildCommonAppFilters(framework?: string, search?: string): WhereCondition[] {
        const conditions: WhereCondition[] = [];
        
        if (framework) {
            conditions.push(eq(schema.apps.framework, framework));
        }
        
        if (search) {
            const searchTerm = `%${search.toLowerCase()}%`;
            conditions.push(
                or(
                    sql`LOWER(${schema.apps.title}) LIKE ${searchTerm}`,
                    sql`LOWER(${schema.apps.description}) LIKE ${searchTerm}`
                )
            );
        }
        
        return conditions.filter(Boolean);
    }

    /**
     * Helper to build public app query conditions
     */
    private buildPublicAppConditions(
        framework?: string, 
        search?: string
    ): WhereCondition[] {
        const whereConditions: WhereCondition[] = [
            // Only show public apps or apps from anonymous users
            or(
                eq(schema.apps.visibility, 'public'),
                isNull(schema.apps.userId)
            ),
            or(
                eq(schema.apps.status, 'completed'),
                eq(schema.apps.status, 'generating')
            ),
            // Use shared helper for common filters
            ...this.buildCommonAppFilters(framework, search),
        ];

        return whereConditions.filter(Boolean);
    }

    /**
     * Update app record in database
     */
    async updateApp(
        appId: string,
        updates: Partial<typeof schema.apps.$inferInsert>
    ): Promise<boolean> {
        if (!appId) {
            return false;
        }

        try {
            await this.database
                .update(schema.apps)
                .set({ 
                    ...updates, 
                    updatedAt: new Date() 
                })
                .where(eq(schema.apps.id, appId));
            return true;
        } catch (error) {
            this.logger.error('[AppService] Failed to update app', { appId, error });
            return false;
        }
    }

    /**
     * Update app deployment ID
     */
    async updateDeploymentId(
        appId: string,
        deploymentId: string,
    ): Promise<boolean> {
        return this.updateApp(appId, {
            deploymentId,
        });
    }

    /**
     * Update app with GitHub repository URL and visibility
     */
    async updateGitHubRepository(
        appId: string,
        repositoryUrl: string,
        repositoryVisibility: 'public' | 'private'
    ): Promise<boolean> {
        return this.updateApp(appId, {
            githubRepositoryUrl: repositoryUrl,
            githubRepositoryVisibility: repositoryVisibility
        });
    }

    /**
     * Update app with screenshot data
     */
    async updateAppScreenshot(
        appId: string,
        screenshotUrl: string
    ): Promise<boolean> {
        return this.updateApp(appId, {
            screenshotUrl,
            screenshotCapturedAt: new Date()
        });
    }

    /**
     * Get user apps with favorite status
     * Optimized to fetch favorites separately to avoid subquery memory issues
     */
    async getUserAppsWithFavorites(
        userId: string, 
        options: PaginationParams = {}
    ): Promise<AppWithFavoriteStatus[]> {
        const { limit = 50, offset = 0 } = options;
        
        // Use 'fresh' strategy for user's own data to ensure they see latest changes
        const readDb = this.getReadDb('fresh');
        
        // Fetch user's apps first
        const apps = await readDb
            .select()
            .from(schema.apps)
            .where(eq(schema.apps.userId, userId))
            .orderBy(desc(schema.apps.updatedAt))
            .limit(limit)
            .offset(offset);

        if (apps.length === 0) {
            return [];
        }

        // Fetch favorite status for these apps
        const appIds = apps.map(app => app.id);
        const favorites = await readDb
            .select({ appId: schema.favorites.appId })
            .from(schema.favorites)
            .where(and(
                eq(schema.favorites.userId, userId),
                inArray(schema.favorites.appId, appIds)
            ));

        const favoriteSet = new Set(favorites.map(f => f.appId));

        const result = apps.map(app => ({
            ...app,
            isFavorite: favoriteSet.has(app.id),
            updatedAtFormatted: formatRelativeTime(app.updatedAt)
        }));
        return this.enrichScreenshotUrls(result);
    }

    /**
     * Get recent user apps with favorite status
     */
    async getRecentAppsWithFavorites(
        userId: string, 
        limit: number = 10
    ): Promise<AppWithFavoriteStatus[]> {
        return this.getUserAppsWithFavorites(userId, { limit, offset: 0 });
    }

    /**
     * Get only favorited apps for a user
     */
    async getFavoriteAppsOnly(
        userId: string
    ): Promise<AppWithFavoriteStatus[]> {
        const results = await this.database
            .select({
                app: schema.apps
            })
            .from(schema.apps)
            .innerJoin(schema.favorites, and(
                eq(schema.favorites.appId, schema.apps.id),
                eq(schema.favorites.userId, userId)
            ))
            // Authorization: only return public apps OR user's own apps
            .where(
                or(
                    eq(schema.apps.visibility, 'public'),
                    eq(schema.apps.userId, userId)
                )
            )
            .orderBy(desc(schema.apps.updatedAt));

        // Strip sensitive fields - explicit about what's excluded
        const mapped = results.map(({ app }) => {
            const {
                sessionToken: _sessionToken,
                originalPrompt: _originalPrompt,
                finalPrompt: _finalPrompt,
                githubRepositoryUrl: _githubRepositoryUrl,
                githubRepositoryVisibility: _githubRepositoryVisibility,
                ...safeApp
            } = app;

            return {
                ...safeApp,
                // Provide safe defaults for type compatibility
                sessionToken: null,
                originalPrompt: '',
                finalPrompt: null,
                githubRepositoryUrl: null,
                githubRepositoryVisibility: null,
                isFavorite: true as const,
                updatedAtFormatted: formatRelativeTime(app.updatedAt)
            };
        });
        return this.enrichScreenshotUrls(mapped);
    }


    /**
     * Toggle favorite status for an app
     */
    async toggleAppFavorite(userId: string, appId: string): Promise<FavoriteToggleResult> {
        // Check if already favorited
        const existingFavorite = await this.database
            .select()
            .from(schema.favorites)
            .where(and(
                eq(schema.favorites.appId, appId),
                eq(schema.favorites.userId, userId)
            ))
            .limit(1);

        if (existingFavorite.length > 0) {
            // Remove favorite
            await this.database
                .delete(schema.favorites)
                .where(and(
                    eq(schema.favorites.appId, appId),
                    eq(schema.favorites.userId, userId)
                ));
            return { isFavorite: false };
        } else {
            // Add favorite
            await this.database
                .insert(schema.favorites)
                .values({
                    id: generateId(),
                    userId,
                    appId,
                    createdAt: new Date()
                });
            return { isFavorite: true };
        }
    }

    /**
     * Check if user owns an app and get visibility
     */
    async checkAppOwnership(appId: string, userId: string): Promise<OwnershipResult> {
        // Use read replica for ownership checks
        const readDb = this.getReadDb('fast');
        const app = await readDb
            .select({
                id: schema.apps.id,
                userId: schema.apps.userId,
                visibility: schema.apps.visibility
            })
            .from(schema.apps)
            .where(eq(schema.apps.id, appId))
            .get();

        if (!app) {
            return { exists: false, isOwner: false };
        }

        return {
            exists: true,
            isOwner: app.userId === userId,
            visibility: app.visibility as 'private' | 'public' | null
        };
    }

    /**
     * Get single app with favorite status for user
     * Optimized to fetch favorite status separately
     */
    async getSingleAppWithFavoriteStatus(
        appId: string, 
        userId: string
    ): Promise<AppWithFavoriteStatus | null> {
        // Use 'fresh' strategy since this includes user-specific favorite status
        const readDb = this.getReadDb('fresh');
        
        // Fetch app first
        const app = await readDb
            .select()
            .from(schema.apps)
            .where(eq(schema.apps.id, appId))
            .get();

        if (!app) {
            return null;
        }

        // Check if favorited
        const favorite = await readDb
            .select({ id: schema.favorites.id })
            .from(schema.favorites)
            .where(and(
                eq(schema.favorites.userId, userId),
                eq(schema.favorites.appId, appId)
            ))
            .get();

        const result = {
            ...app,
            isFavorite: !!favorite,
            updatedAtFormatted: formatRelativeTime(app.updatedAt)
        };
        const [enriched] = await this.enrichScreenshotUrls([result]);
        return enriched;
    }

    /**
     * Update app visibility with ownership check
     */
    async updateAppVisibility(
        appId: string,
        userId: string,
        visibility: 'private' | 'public'
    ): Promise<AppVisibilityUpdateResult> {
        // Check if app exists and user owns it
        const existingApp = await this.database
            .select({
                id: schema.apps.id,
                title: schema.apps.title,
                userId: schema.apps.userId,
                visibility: schema.apps.visibility
            })
            .from(schema.apps)
            .where(eq(schema.apps.id, appId))
            .limit(1);

        if (existingApp.length === 0) {
            return { success: false, error: 'App not found' };
        }

        if (existingApp[0].userId !== userId) {
            return { success: false, error: 'You can only change visibility of your own apps' };
        }

        // Update the app visibility
        const updatedApps = await this.database
            .update(schema.apps)
            .set({
                visibility,
                updatedAt: new Date()
            })
            .where(eq(schema.apps.id, appId))
            .returning({
                id: schema.apps.id,
                title: schema.apps.title,
                visibility: schema.apps.visibility,
                updatedAt: schema.apps.updatedAt
            });

        if (updatedApps.length === 0) {
            return { success: false, error: 'Failed to update app visibility' };
        }

        return { success: true, app: updatedApps[0] };
    }

    // ========================================
    // APP VIEW CONTROLLER OPERATIONS
    // ========================================

    /**
     * Get app details with stats
     */
    async getAppDetails(appId: string, userId?: string): Promise<EnhancedAppData | null> {
        const readDb = this.getReadDb('fast');
        
        const appResult = await readDb
            .select({
                app: schema.apps,
                userName: schema.users.displayName,
                userAvatar: schema.users.avatarUrl,
            })
            .from(schema.apps)
            .leftJoin(schema.users, eq(schema.apps.userId, schema.users.id))
            .where(eq(schema.apps.id, appId))
            .get();

        if (!appResult) {
            return null;
        }

        const app = appResult.app;

        // Get stats in parallel using same pattern as analytics service
        // Use 'fresh' strategy for user-specific queries for consistency
        const userReadDb = userId ? this.getReadDb('fresh') : readDb;
        
        const [viewCount, starCount, isFavorite, userHasStarred] = await Promise.all([
            // View count
            readDb
                .select({ count: sql<number>`count(*)` })
                .from(schema.appViews)
                .where(eq(schema.appViews.appId, appId))
                .get()
                .then(r => r?.count || 0),
            
            // Star count
            readDb
                .select({ count: sql<number>`count(*)` })
                .from(schema.stars)
                .where(eq(schema.stars.appId, appId))
                .get()
                .then(r => r?.count || 0),
            
            // Is favorited by current user
            userId ? userReadDb
                .select({ id: schema.favorites.id })
                .from(schema.favorites)
                .where(and(
                    eq(schema.favorites.userId, userId),
                    eq(schema.favorites.appId, appId)
                ))
                .get()
                .then(r => !!r) : false,
            
            // Is starred by current user
            userId ? userReadDb
                .select({ id: schema.stars.id })
                .from(schema.stars)
                .where(and(
                    eq(schema.stars.userId, userId),
                    eq(schema.stars.appId, appId)
                ))
                .get()
                .then(r => !!r) : false
        ]);
        
        const result = {
            ...app,
            userName: appResult.userName,
            userAvatar: appResult.userAvatar,
            starCount,
            userStarred: userHasStarred,
            userFavorited: isFavorite,
            viewCount
        };
        const [enriched] = await this.enrichScreenshotUrls([result]);
        return enriched;
    }

    /**
     * Toggle star status for an app (star/unstar)
     * Uses same pattern as toggleAppFavorite
     */
    async toggleAppStar(userId: string, appId: string): Promise<{ isStarred: boolean; starCount: number }> {
        // Check if already starred
        const existingStar = await this.database
            .select({ id: schema.stars.id })
            .from(schema.stars)
            .where(and(
                eq(schema.stars.userId, userId),
                eq(schema.stars.appId, appId)
            ))
            .get();

        if (existingStar) {
            // Unstar
            await this.database
                .delete(schema.stars)
                .where(eq(schema.stars.id, existingStar.id))
                .run();
        } else {
            // Star
            await this.database
                .insert(schema.stars)
                .values({
                    id: generateId(),
                    userId,
                    appId,
                    starredAt: new Date()
                })
                .run();
        }

        // Get updated star count
        const starCountResult = await this.database
            .select({ count: sql<number>`count(*)` })
            .from(schema.stars)
            .where(eq(schema.stars.appId, appId))
            .get();

        return {
            isStarred: !existingStar,
            starCount: starCountResult?.count || 0
        };
    }

    /**
     * Record app view with duplicate prevention
     */
    async recordAppView(appId: string, userId: string): Promise<void> {
        try {
            await this.database
                .insert(schema.appViews)
                .values({
                    id: generateId(),
                    appId,
                    userId,
                    viewedAt: new Date()
                })
                .run();
        } catch {
            // Ignore duplicate view errors
        }
    }

    /**
     * Get user apps with analytics data
     */
    async getUserAppsWithAnalytics(userId: string, options: Partial<AppQueryOptions> = {}): Promise<EnhancedAppData[]> {
        const { 
            limit = 50, 
            offset = 0, 
            status, 
            visibility, 
            framework,
            search,
            sort = 'recent', 
            order = 'desc',
            period = 'all'
        } = options;

        const whereConditions: WhereCondition[] = [
            eq(schema.apps.userId, userId),
            status ? eq(schema.apps.status, status) : undefined,
            visibility ? eq(schema.apps.visibility, visibility) : undefined,
            ...this.buildCommonAppFilters(framework, search),
        ];

        const whereClause = this.buildWhereConditions(whereConditions);
        
        // Handle starred sort separately
        if (sort === 'starred') {
            const results = await this.database
                .select({
                    app: schema.apps,
                    userName: schema.users.displayName,
                    userAvatar: schema.users.avatarUrl,
                    ...this.getCountSubqueries()
                })
                .from(schema.apps)
                .leftJoin(schema.users, eq(schema.apps.userId, schema.users.id))
                .innerJoin(schema.favorites, eq(schema.favorites.appId, schema.apps.id))
                .where(and(whereClause, eq(schema.favorites.userId, userId)))
                .orderBy(desc(schema.favorites.createdAt))
                .limit(limit)
                .offset(offset);
                
            const starredApps = results.map(r => ({
                ...r.app,
                userName: r.userName,
                userAvatar: r.userAvatar,
                viewCount: r.viewCount || 0,
                starCount: r.starCount || 0,
                forkCount: r.forkCount || 0,
                likeCount: 0,
                userStarred: false,
                userFavorited: true // These are favorited apps
            }));
            return this.enrichScreenshotUrls(starredApps);
        }

        const basicApps = await this.executeRankedQuery(
            this.database,
            whereClause,
            sort,
            period as TimePeriod,
            order,
            limit,
            offset
        );

        if (basicApps.length === 0) {
            return [];
        }

        const appIds = basicApps.map((row: RankedAppQueryResult) => row.app.id);
        const { userStars, userFavorites } = await this.addUserSpecificAppData(appIds, userId);
        
        const normalApps = basicApps.map((row: RankedAppQueryResult) => ({
            ...row.app,
            userName: row.userName,
            userAvatar: row.userAvatar,
            viewCount: row.viewCount || 0,
            starCount: row.starCount || 0,
            forkCount: row.forkCount || 0,
            likeCount: 0,
            userStarred: userStars.has(row.app.id),
            userFavorited: userFavorites.has(row.app.id)
        }));
        return this.enrichScreenshotUrls(normalApps);
    }

    /**
     * Get total count of user apps with filters (for pagination)
     */
    async getUserAppsCount(userId: string, options: Partial<AppQueryOptions> = {}): Promise<number> {
        const { status, visibility, framework, search, sort = 'recent' } = options;

        const whereConditions: WhereCondition[] = [
            eq(schema.apps.userId, userId),
            status ? eq(schema.apps.status, status) : undefined,
            visibility ? eq(schema.apps.visibility, visibility) : undefined,
            ...this.buildCommonAppFilters(framework, search),
        ];

        const whereClause = this.buildWhereConditions(whereConditions);

        const readDb = this.getReadDb('fast');
        const countQuery = readDb
            .select({ count: sql<number>`COUNT(*)` })
            .from(schema.apps);

        if (sort === 'starred') {
            const countResult = await countQuery
                .innerJoin(schema.favorites, eq(schema.favorites.appId, schema.apps.id))
                .where(and(whereClause, eq(schema.favorites.userId, userId)));
            return countResult[0]?.count || 0;
        } else {
            const countResult = await countQuery.where(whereClause);
            return countResult[0]?.count || 0;
        }
    }

    /**
     * Execute ranked query with subqueries for memory efficiency
     * Uses subqueries in ORDER BY to avoid loading all rows before pagination
     */
    private async executeRankedQuery(
        db: ReturnType<typeof this.getReadDb>,
        whereClause: ReturnType<typeof this.buildWhereConditions>,
        sort: string,
        period: TimePeriod,
        order: string,
        limit: number,
        offset: number
    ): Promise<RankedAppQueryResult[]> {
        // Use subquery-based sorting for memory efficiency
        // This allows D1 to apply LIMIT during index scan instead of after GROUP BY
        if (sort === 'trending' || sort === 'popular') {
            const periodThreshold = sort === 'trending' ? this.getTimePeriodThreshold(period) : null;
            const periodUnixTimestamp = periodThreshold ? Math.floor(periodThreshold.getTime() / 1000) : 0;
            
            // Define count subqueries
            const viewCountSubquery = sql<number>`(SELECT COUNT(*) FROM ${schema.appViews} WHERE ${schema.appViews.appId} = ${schema.apps.id})`;
            const starCountSubquery = sql<number>`(SELECT COUNT(*) FROM ${schema.stars} WHERE ${schema.stars.appId} = ${schema.apps.id})`;
            const forkCountSubquery = sql<number>`(SELECT COUNT(*) FROM ${schema.apps} AS forks WHERE forks.parent_app_id = ${schema.apps.id})`;
            
            if (sort === 'popular') {
                // Popular algorithm: (views*1 + stars*3) DESC
                const orderByExpression = sql`(
                    ${viewCountSubquery} * ${this.RANKING_WEIGHTS.VIEWS} +
                    ${starCountSubquery} * ${this.RANKING_WEIGHTS.STARS}
                ) DESC`;
                
                return db
                    .select({
                        app: schema.apps,
                        userName: schema.users.displayName,
                        userAvatar: schema.users.avatarUrl,
                        viewCount: viewCountSubquery,
                        starCount: starCountSubquery,
                        forkCount: forkCountSubquery,
                    })
                    .from(schema.apps)
                    .leftJoin(schema.users, eq(schema.apps.userId, schema.users.id))
                    .where(whereClause)
                    .orderBy(orderByExpression)
                    .limit(limit)
                    .offset(offset);
            } else { // trending
                // Trending algorithm: Activity score (scaled by 10M) + recency bonus
                const recentViewsSubquery = sql<number>`(SELECT COUNT(*) FROM ${schema.appViews} WHERE ${schema.appViews.appId} = ${schema.apps.id} AND ${schema.appViews.viewedAt} >= ${periodUnixTimestamp})`;
                const recentStarsSubquery = sql<number>`(SELECT COUNT(*) FROM ${schema.stars} WHERE ${schema.stars.appId} = ${schema.apps.id} AND ${schema.stars.starredAt} >= ${periodUnixTimestamp})`;
                
                const orderByExpression = sql`(
                    (
                        ${recentViewsSubquery} * ${this.RANKING_WEIGHTS.VIEWS} +
                        ${recentStarsSubquery} * ${this.RANKING_WEIGHTS.STARS} * 2
                    ) * 10000000 + 
                    CAST((1000000 / (1.0 + (strftime('%s', 'now') - ${schema.apps.updatedAt}) / 86400.0)) AS INTEGER)
                ) DESC`;
                
                return db
                    .select({
                        app: schema.apps,
                        userName: schema.users.displayName,
                        userAvatar: schema.users.avatarUrl,
                        viewCount: viewCountSubquery,
                        starCount: starCountSubquery,
                        forkCount: forkCountSubquery,
                        recentViews: recentViewsSubquery,
                        recentStars: recentStarsSubquery,
                    })
                    .from(schema.apps)
                    .leftJoin(schema.users, eq(schema.apps.userId, schema.users.id))
                    .where(whereClause)
                    .orderBy(orderByExpression)
                    .limit(limit)
                    .offset(offset);
            }
        } else {
            // Simple query for recent/starred sorts
            const direction = order === 'asc' ? asc : desc;
            const orderByExpression = sort === 'starred' 
                ? sql`(SELECT COUNT(*) FROM ${schema.stars} WHERE ${schema.stars.appId} = ${schema.apps.id}) DESC`
                : direction(schema.apps.updatedAt);
                
            return db
                .select({
                    app: schema.apps,
                    userName: schema.users.displayName,
                    userAvatar: schema.users.avatarUrl,
                    ...this.getCountSubqueries(),
                })
                .from(schema.apps)
                .leftJoin(schema.users, eq(schema.apps.userId, schema.users.id))
                .where(whereClause)
                .orderBy(orderByExpression)
                .limit(limit)
                .offset(offset);
        }
    }

    private getCountSubqueries() {
        return {
            viewCount: sql<number>`(SELECT COUNT(*) FROM ${schema.appViews} WHERE ${schema.appViews.appId} = ${schema.apps.id})`,
            starCount: sql<number>`(SELECT COUNT(*) FROM ${schema.stars} WHERE ${schema.stars.appId} = ${schema.apps.id})`,
            forkCount: sql<number>`(SELECT COUNT(*) FROM ${schema.apps} AS forks WHERE forks.parent_app_id = ${schema.apps.id})`
        };
    }

    private async addUserSpecificAppData(
        appIds: string[], 
        userId?: string
    ): Promise<{ userStars: Set<string>; userFavorites: Set<string> }> {
        if (!userId || appIds.length === 0) {
            return { userStars: new Set(), userFavorites: new Set() };
        }

        const userReadDb = this.getReadDb('fresh');
        
        // Use Drizzle's inArray for better compatibility
        // We'll batch if needed to avoid D1 limits
        const BATCH_SIZE = 50;
        const userStars = new Set<string>();
        const userFavorites = new Set<string>();

        try {
            // Process in batches if needed
            for (let i = 0; i < appIds.length; i += BATCH_SIZE) {
                const batch = appIds.slice(i, i + BATCH_SIZE);
                
                // Fetch stars and favorites for this batch
                const [starsResult, favoritesResult] = await Promise.all([
                    userReadDb
                        .select({ appId: schema.stars.appId })
                        .from(schema.stars)
                        .where(and(
                            eq(schema.stars.userId, userId),
                            inArray(schema.stars.appId, batch)
                        )),
                    userReadDb
                        .select({ appId: schema.favorites.appId })
                        .from(schema.favorites)
                        .where(and(
                            eq(schema.favorites.userId, userId),
                            inArray(schema.favorites.appId, batch)
                        ))
                ]);

                // Add to sets
                starsResult.forEach(s => userStars.add(s.appId));
                favoritesResult.forEach(f => userFavorites.add(f.appId));
            }
        } catch (error) {
            // Return empty sets on error to not break the app
            return { userStars: new Set(), userFavorites: new Set() };
        }

        return { userStars, userFavorites };
    }

    /**
     * Get date threshold for time period filtering
     */
    private getTimePeriodThreshold(period: TimePeriod): Date {
        const now = new Date();
        switch (period) {
            case 'today':
                return new Date(now.getFullYear(), now.getMonth(), now.getDate());
            case 'week': {
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                return weekAgo;
            }
            case 'month': {
                const monthAgo = new Date(now);
                monthAgo.setMonth(now.getMonth() - 1);
                return monthAgo;
            }
            case 'all':
            default:
                return new Date(0); // Beginning of time
        }
    }

    /**
     * Delete an app with ownership verification and cascade delete related records
     */
    async deleteApp(appId: string, userId: string): Promise<{ success: boolean; error?: string }> {
        try {
            // First check if app exists and user owns it
            const ownershipResult = await this.checkAppOwnership(appId, userId);
            
            if (!ownershipResult.exists) {
                return { success: false, error: 'App not found' };
            }
            
            if (!ownershipResult.isOwner) {
                return { success: false, error: 'You can only delete your own apps' };
            }

            // Delete related records first (foreign key constraints)
            // This follows the cascade delete pattern for data integrity
            
            // Delete favorites
            await this.database
                .delete(schema.favorites)
                .where(eq(schema.favorites.appId, appId));
            
            // Delete stars  
            await this.database
                .delete(schema.stars)
                .where(eq(schema.stars.appId, appId));
            
            // Delete app views
            await this.database
                .delete(schema.appViews)
                .where(eq(schema.appViews.appId, appId));
            
            // Handle fork relationships properly
            // If this app is a parent, make forks independent (don't delete them!)
            await this.database
                .update(schema.apps)
                .set({ parentAppId: null })
                .where(eq(schema.apps.parentAppId, appId));
            
            // If this app is a fork, we don't need to do anything special
            // (the parent fork count will be handled by analytics recalculation)
            
            // Finally delete the app itself
            const deleteResult = await this.database
                .delete(schema.apps)
                .where(and(
                    eq(schema.apps.id, appId),
                    eq(schema.apps.userId, userId)
                ))
                .returning({ id: schema.apps.id });

            if (deleteResult.length === 0) {
                return { success: false, error: 'Failed to delete app - app may have been already deleted' };
            }

            return { success: true };
        } catch (error) {
            this.logger?.error('Error deleting app:', error);
            return { success: false, error: 'An error occurred while deleting the app' };
        }
    }

    // ========================================
    // SCREENSHOT URL SIGNING
    // ========================================

    private async enrichScreenshotUrls<T extends { id: string; screenshotUrl?: string | null }>(apps: T[]): Promise<T[]> {
        return new ScreenshotSecurity(this.env).enrichUrls(apps);
    }
}