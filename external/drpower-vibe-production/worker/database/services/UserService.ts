/**
 * User Service
 * Handles all user-related database operations including sessions, teams, and profiles
 */

import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq, and, sql, lt, ne } from 'drizzle-orm';
import { generateId } from '../../utils/idGenerator';

/**
 * User Service Class
 */
export class UserService extends BaseService {

    // ========================================
    // USER MANAGEMENT
    // ========================================

    async createUser(userData: schema.NewUser): Promise<schema.User> {
        const [user] = await this.database
            .insert(schema.users)
            .values({ ...userData, id: generateId() })
            .returning();
        return user;
    }

    /**
     * User lookup method
     */
    async findUser(options: {
        id?: string;
        email?: string;
        provider?: { name: string; id: string };
    }): Promise<schema.User | null> {
        const whereConditions = [
            options.id ? eq(schema.users.id, options.id) : undefined,
            options.email ? eq(schema.users.email, options.email) : undefined,
            options.provider ? and(
                eq(schema.users.provider, options.provider.name),
                eq(schema.users.providerId, options.provider.id)
            ) : undefined
        ].filter(Boolean); // Remove undefined values
        
        if (whereConditions.length === 0) {
            return null;
        }
        
        const users = await this.database
            .select()
            .from(schema.users)
            .where(whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions))
            .limit(1);
            
        return users[0] || null;
    }

    async updateUserActivity(userId: string): Promise<void> {
        await this.database
            .update(schema.users)
            .set({ 
                lastActiveAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(schema.users.id, userId));
    }

    // ========================================
    // SESSION MANAGEMENT
    // ========================================

    async createSession(sessionData: schema.NewSession): Promise<schema.Session> {
        const [session] = await this.database
            .insert(schema.sessions)
            .values({ ...sessionData, id: generateId() })
            .returning();
        return session;
    }

    async findValidSession(sessionId: string): Promise<schema.Session | null> {
        const sessions = await this.database
            .select()
            .from(schema.sessions)
            .where(and(
                eq(schema.sessions.id, sessionId),
                sql`${schema.sessions.expiresAt} > CURRENT_TIMESTAMP`
            ))
            .limit(1);
        return sessions[0] || null;
    }

    async cleanupExpiredSessions(): Promise<void> {
        const now = new Date();
        await this.database
            .delete(schema.sessions)
            .where(lt(schema.sessions.expiresAt, now));
    }

    // ========================================
    // USER PROFILE OPERATIONS
    // ========================================

    /**
     * Update user profile directly
     */
    async updateUserProfile(
        userId: string,
        profileData: {
            displayName?: string;
            username?: string;
            bio?: string;
            avatarUrl?: string;
            timezone?: string;
        }
    ): Promise<void> {
        await this.database
            .update(schema.users)
            .set({
                ...profileData,
                updatedAt: new Date()
            })
            .where(eq(schema.users.id, userId));
    }

    /**
     * Check if username is available
     */
    async isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
        const existingUser = await this.database
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
                and(
                    eq(schema.users.username, username),
                    excludeUserId ? ne(schema.users.id, excludeUserId) : undefined
                )
            )
            .get();
        
        return !existingUser;
    }

    /**
     * Update user profile with comprehensive validation
     */
    async updateUserProfileWithValidation(
        userId: string,
        profileData: {
            username?: string;
            displayName?: string;
            bio?: string;
            theme?: 'light' | 'dark' | 'system';
        }
    ): Promise<{ success: boolean; message: string }> {
        // Validate username if provided
        if (profileData.username) {
            const { username } = profileData;

            // Format validation
            if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                return { 
                    success: false, 
                    message: 'Username can only contain letters, numbers, underscores, and hyphens' 
                };
            }
            
            if (username.length < 3 || username.length > 30) {
                return { 
                    success: false, 
                    message: 'Username must be between 3 and 30 characters' 
                };
            }
            
            // Check reserved usernames
            const reserved = ['admin', 'api', 'www', 'mail', 'ftp', 'root', 'support', 'help', 'about', 'terms', 'privacy'];
            if (reserved.includes(username.toLowerCase())) {
                return { 
                    success: false, 
                    message: 'Username is reserved' 
                };
            }
            
            // Check uniqueness
            const existingUser = await this.database
                .select({ id: schema.users.id })
                .from(schema.users)
                .where(eq(schema.users.username, username))
                .get();

            if (existingUser && existingUser.id !== userId) {
                return { 
                    success: false, 
                    message: 'Username already taken' 
                };
            }
        }

        // Update profile
        await this.database
            .update(schema.users)
            .set({
                username: profileData.username || undefined,
                displayName: profileData.displayName || undefined,
                bio: profileData.bio || undefined,
                theme: profileData.theme || undefined,
                updatedAt: new Date()
            })
            .where(eq(schema.users.id, userId));

        return { success: true, message: 'Profile updated successfully' };
    }

    /**
     * Get basic user statistics efficiently
     */
    async getUserStatisticsBasic(userId: string): Promise<{ totalApps: number; appsThisMonth: number }> {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [totalApps, appsThisMonth] = await Promise.all([
            // Total apps count
            this.database
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.apps)
                .where(eq(schema.apps.userId, userId))
                .get()
                .then(r => Number(r?.count) || 0),

            // Apps created this month
            this.database
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.apps)
                .where(and(
                    eq(schema.apps.userId, userId),
                    sql`${schema.apps.createdAt} >= ${startOfMonth}`
                ))
                .get()
                .then(r => Number(r?.count) || 0)
        ]);

        return { totalApps, appsThisMonth };
    }

}