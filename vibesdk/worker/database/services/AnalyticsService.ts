/**
 * Analytics and Count Queries Service
 */

import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq, count, and, inArray, sql } from 'drizzle-orm';
import type {
    UserStats,
    UserActivity,
    BatchAppStats
} from '../types';

export class AnalyticsService extends BaseService {

    /**
     * Batch get statistics for multiple entities
     * More efficient when loading lists of items
     */
    async batchGetAppStats(appIds: string[]): Promise<BatchAppStats> {
        if (appIds.length === 0) return {};

        // Use read replica for batch analytics
        const readDb = this.getReadDb('fast');
        
        // Get all stats in parallel using batch queries
        const [views, forks, likes] = await Promise.all([
            // Batch view counts
            readDb
                .select({
                    appId: schema.appViews.appId,
                    count: count()
                })
                .from(schema.appViews)
                .where(inArray(schema.appViews.appId, appIds))
                .groupBy(schema.appViews.appId)
                .all(),
            
            // Batch fork counts
            readDb
                .select({
                    parentAppId: schema.apps.parentAppId,
                    count: count()
                })
                .from(schema.apps)
                .where(inArray(schema.apps.parentAppId, appIds))
                .groupBy(schema.apps.parentAppId)
                .all(),
            
            // Batch like counts
            readDb
                .select({
                    appId: schema.appLikes.appId,
                    count: count()
                })
                .from(schema.appLikes)
                .where(inArray(schema.appLikes.appId, appIds))
                .groupBy(schema.appLikes.appId)
                .all()
        ]);

        // Combine results into lookup object
        const result: BatchAppStats = {};
        
        appIds.forEach(appId => {
            result[appId] = {
                viewCount: views.find(v => v.appId === appId)?.count ?? 0,
                forkCount: forks.find(f => f.parentAppId === appId)?.count ?? 0,
                likeCount: likes.find(l => l.appId === appId)?.count ?? 0
            };
        });

        return result;
    }

    /**
     * Get user statistics with all metrics
     */
    async getUserStats(userId: string): Promise<UserStats> {
        // Use 'fresh' strategy for user dashboard data
        const readDb = this.getReadDb('fresh');
        
        const [appCount, publicAppCount, favoriteCount, totalLikesReceived, totalViewsReceived, streakDays] = await Promise.all([
            // Count user's total apps
            readDb
                .select({ count: count() })
                .from(schema.apps)
                .where(eq(schema.apps.userId, userId))
                .get()
                .then(r => r?.count ?? 0),
            
            // Count user's public apps
            readDb
                .select({ count: count() })
                .from(schema.apps)
                .where(
                    and(
                        eq(schema.apps.userId, userId),
                        eq(schema.apps.visibility, 'public')
                    )
                )
                .get()
                .then(r => r?.count ?? 0),
            
            // Count favorites
            readDb
                .select({ count: count() })
                .from(schema.favorites)
                .where(eq(schema.favorites.userId, userId))
                .get()
                .then(r => r?.count ?? 0),
            
            // Count total likes received on user's apps (using favorites instead of appLikes)
            readDb
                .select({ count: count() })
                .from(schema.favorites)
                .innerJoin(schema.apps, eq(schema.favorites.appId, schema.apps.id))
                .where(eq(schema.apps.userId, userId))
                .get()
                .then(r => r?.count ?? 0),
            
            // Count total views received on user's apps
            readDb
                .select({ count: count() })
                .from(schema.appViews)
                .innerJoin(schema.apps, eq(schema.appViews.appId, schema.apps.id))
                .where(eq(schema.apps.userId, userId))
                .get()
                .then(r => r?.count ?? 0),
                
            // Calculate user activity streak
            this.calculateUserStreak(userId)
        ]);

        return {
            appCount,
            publicAppCount,
            favoriteCount,
            totalLikesReceived,
            totalViewsReceived,
            streakDays,
            achievements: [] // Placeholder for future achievement system
        };
    }


    /**
     * Calculate consecutive days of user activity
     * Based on app creation and update dates
     */
    private async calculateUserStreak(userId: string): Promise<number> {
        try {
            // Get app activities grouped by date
            const activities = await this.database
                .select({
                    date: sql<string>`DATE(${schema.apps.updatedAt})`
                })
                .from(schema.apps)
                .where(eq(schema.apps.userId, userId))
                .orderBy(sql`DATE(${schema.apps.updatedAt}) DESC`)
                .groupBy(sql`DATE(${schema.apps.updatedAt})`)
                .all();

            if (activities.length === 0) return 0;

            let streak = 0;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Check if there's activity today or yesterday
            const lastActivity = new Date(activities[0].date);
            const daysDiff = Math.floor((today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff > 1) return 0; // Streak broken

            // Count consecutive days
            let currentDate = new Date(lastActivity);
            for (const activity of activities) {
                const activityDate = new Date(activity.date);
                const diff = Math.floor((currentDate.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (diff <= 1) {
                    streak++;
                    currentDate = activityDate;
                } else {
                    break; // Streak broken
                }
            }

            return streak;
        } catch {
            return 0; // Return 0 on any error
        }
    }

    /**
     * Get user activity timeline
     * Returns recent activities for user dashboard
     */
    async getUserActivityTimeline(userId: string, limit: number = 20): Promise<UserActivity[]> {
        // Use 'fresh' strategy for user's activity feed
        const readDb = this.getReadDb('fresh');
        
        // Get recent app activities
        const appActivities = await readDb
            .select({
                id: schema.apps.id,
                title: schema.apps.title,
                action: sql<string>`CASE WHEN ${schema.apps.createdAt} = ${schema.apps.updatedAt} THEN 'created' ELSE 'updated' END`,
                timestamp: schema.apps.updatedAt,
                framework: schema.apps.framework
            })
            .from(schema.apps)
            .where(eq(schema.apps.userId, userId))
            .orderBy(sql`${schema.apps.updatedAt} DESC`)
            .limit(limit);

        // Get recent favorites
        const favoriteActivities = await readDb
            .select({
                appId: schema.favorites.appId,
                appTitle: schema.apps.title,
                timestamp: schema.favorites.createdAt
            })
            .from(schema.favorites)
            .innerJoin(schema.apps, eq(schema.favorites.appId, schema.apps.id))
            .where(eq(schema.favorites.userId, userId))
            .orderBy(sql`${schema.favorites.createdAt} DESC`)
            .limit(Math.floor(limit / 2));

        // Combine and sort activities
        const activities: UserActivity[] = [
            ...appActivities.map(a => ({
                type: a.action as 'created' | 'updated',
                title: a.title,
                timestamp: a.timestamp,
                metadata: { framework: a.framework, appId: a.id }
            })),
            ...favoriteActivities.map(f => ({
                type: 'favorited' as const,
                title: f.appTitle || 'Unknown App',
                timestamp: f.timestamp,
                metadata: { appId: f.appId }
            }))
        ];

        // Sort by timestamp descending and limit results
        return activities
            .sort((a, b) => {
                const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return dateB - dateA;
            })
            .slice(0, limit);
    }
}