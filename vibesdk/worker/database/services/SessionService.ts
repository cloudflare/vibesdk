/**
 * Session Service for managing user sessions in D1
 * Provides session creation, validation, and cleanup
 */

import { AuthSession } from '../../types/auth-types';
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
import * as schema from '../schema';
import { eq, and, lt, gt, desc, ne } from 'drizzle-orm';
import { createLogger } from '../../logger';
import { generateId } from '../../utils/idGenerator';
import { JWTUtils } from '../../utils/jwtUtils';
import { extractRequestMetadata } from '../../utils/authUtils';
import { BaseService } from './BaseService';

const logger = createLogger('SessionService');

/**
 * Session configuration
 */
interface SessionConfig {
    maxSessions: number; // Max sessions per user
    sessionTTL: number; // Session TTL in seconds
    cleanupInterval: number; // Cleanup interval in seconds
    maxConcurrentDevices: number; // Max concurrent devices per user
}

/**
 * Session Service for D1-based session management
 */
export class SessionService extends BaseService {
    static readonly config: SessionConfig = {
        maxSessions: 5,
        sessionTTL: 3 * 24 * 60 * 60,
        cleanupInterval: 60 * 60, // 1 hour
        maxConcurrentDevices: 3, // Max 3 devices concurrently
    };
    
    private jwtUtils: JWTUtils;
    
    constructor(
        env: Env
    ) {
        super(env);
        this.jwtUtils = JWTUtils.getInstance(env);
    }

    
    /**
     * Log security event for audit purposes
     */
    private async logSecurityEvent(
        userId: string,
        sessionId: string,
        eventType: 'session_hijacking' | 'suspicious_activity' | 'device_change' | 'location_change',
        details: Record<string, unknown>,
        request?: Request
    ): Promise<void> {
        try {
            const metadata = request ? extractRequestMetadata(request) : { ipAddress: 'unknown', userAgent: 'unknown' };
            
            await this.db.db.insert(schema.auditLogs).values({
                id: generateId(),
                userId: userId,
                entityType: 'session',
                entityId: sessionId,
                action: eventType,
                newValues: details,
                ipAddress: metadata.ipAddress,
                userAgent: metadata.userAgent,
                createdAt: new Date()
            });
            
            logger.warn('Security event logged', {
                userId,
                sessionId,
                eventType,
                details
            });
        } catch (error) {
            logger.error('Failed to log security event', error);
        }
    }
    
    /**
     * Create a new session
     */
    async createSession(
        userId: string,
        request: Request
    ): Promise<{
        session: AuthSession;
        accessToken: string;
    }> {
        try {
            // Clean up old sessions for this user
            await this.cleanupUserSessions(userId);
            
            // Generate session ID first
            const sessionId = generateId();
            const userEmail = await this.getUserEmail(userId);
            
            // Generate tokens WITH session ID
            const { accessToken } = await this.jwtUtils.createAccessToken(
                userId,
                userEmail,
                sessionId
            );
            
            // Hash tokens for storage
            const accessTokenHash = await this.jwtUtils.hashToken(accessToken);
            
            // Extract request metadata using centralized utility
            const requestMetadata = extractRequestMetadata(request);
            
            // Create device info object
            const deviceInfo = requestMetadata.userAgent;
            
            // Create session
            const now = new Date();
            const expiresAt = new Date(Date.now() + SessionService.config.sessionTTL * 1000);
            
            await this.db.db.insert(schema.sessions).values({
                id: sessionId,
                userId,
                accessTokenHash,
                refreshTokenHash: '',
                expiresAt,
                lastActivity: now,
                ipAddress: requestMetadata.ipAddress,
                userAgent: requestMetadata.userAgent,
                deviceInfo,
                createdAt: now
            });
            
            const session: AuthSession = {
                userId,
                email: await this.getUserEmail(userId),
                sessionId,
                expiresAt: expiresAt,
            };
            
            logger.info('Session created', { userId, sessionId });
            
            return {
                session,
                accessToken,
            };
        } catch (error) {
            logger.error('Error creating session', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Failed to create session',
                500
            );
        }
    }
    
    /**
     * Revoke session with ID and userID
     */
    async revokeUserSession(sessionId: string, userId: string): Promise<void> {
        try {
            await this.db.db
                .update(schema.sessions)
                .set({
                    isRevoked: true,
                    revokedAt: new Date(),
                    revokedReason: 'user_logout'
                })
                .where(
                    and(
                        eq(schema.sessions.id, sessionId),
                        eq(schema.sessions.userId, userId)
                    )
                );
            
            logger.info('Session revoked', { sessionId });
        } catch (error) {
            logger.error('Error revoking session', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Failed to revoke session',
                500
            );
        }
    }
    
    /**
     * Revoke all sessions for a user
     */
    async revokeAllUserSessions(userId: string): Promise<void> {
        try {
            await this.db.db
                .update(schema.sessions)
                .set({
                    isRevoked: true,
                    revokedAt: new Date(),
                    revokedReason: 'user_force_logout'
                })
                .where(eq(schema.sessions.userId, userId));
            
            logger.info('All user sessions revoked', { userId });
        } catch (error) {
            logger.error('Error revoking user sessions', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Failed to revoke sessions',
                500
            );
        }
    }
    
    /**
     * Get all active sessions for a user
     */
    async getUserSessions(userId: string): Promise<Array<{
        id: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastActivity: Date;
        createdAt: Date;
        isCurrent?: boolean;
    }>> {
        try {
            const sessions = await this.db.db
                .select({
                    id: schema.sessions.id,
                    userAgent: schema.sessions.userAgent,
                    ipAddress: schema.sessions.ipAddress,
                    lastActivity: schema.sessions.lastActivity,
                    createdAt: schema.sessions.createdAt
                })
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        eq(schema.sessions.isRevoked, false),
                        gt(schema.sessions.expiresAt, new Date())
                    )
                )
                .orderBy(desc(schema.sessions.lastActivity))
                .all();

            return sessions.map(session => ({
                id: session.id,
                userAgent: session.userAgent || 'Unknown',
                ipAddress: session.ipAddress || 'Unknown',
                lastActivity: session.lastActivity || new Date(),
                createdAt: session.createdAt || new Date()
            }));
        } catch (error) {
            logger.error('Error getting user sessions', error);
            return [];
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions(): Promise<number> {
        try {
            const now = new Date();
            
            // Delete expired sessions
            await this.db.db
                .delete(schema.sessions)
                .where(lt(schema.sessions.expiresAt, now));
            
            logger.info('Cleaned up expired sessions');
            
            return 0; // D1 doesn't return count
        } catch (error) {
            logger.error('Error cleaning up sessions', error);
            return 0;
        }
    }
    
    /**
     * Clean up old sessions for a user (keep only most recent)
     */
    private async cleanupUserSessions(userId: string): Promise<void> {
        try {
            // Get all sessions for user, ordered by last activity
            const sessions = await this.db.db
                .select({ id: schema.sessions.id })
                .from(schema.sessions)
                .where(eq(schema.sessions.userId, userId))
                .orderBy(desc(schema.sessions.lastActivity))
                .all();
            
            // Keep only the most recent sessions
            if (sessions.length > SessionService.config.maxSessions) {
                const sessionsToDelete = sessions.slice(SessionService.config.maxSessions);
                
                for (const session of sessionsToDelete) {
                    await this.db.db
                        .delete(schema.sessions)
                        .where(eq(schema.sessions.id, session.id));
                }
                
                logger.debug('Cleaned up old user sessions', { 
                    userId, 
                    deleted: sessionsToDelete.length 
                });
            }
        } catch (error) {
            logger.error('Error cleaning up user sessions', error);
        }
    }
    
    /**
     * Get user email (helper method)
     */
    private async getUserEmail(userId: string): Promise<string> {
        const user = await this.db.db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .get();
        
        return user?.email || '';
    }
    
    /**
     * Get security status and recent events for a user
     */
    async getUserSecurityStatus(userId: string): Promise<{
        activeSessions: number;
        recentSecurityEvents: number;
        lastSecurityEvent?: Date;
        riskLevel: 'low' | 'medium' | 'high';
        recommendations: string[];
    }> {
        try {
            // Get active sessions count
            const activeSessions = await this.db.db
                .select({ count: schema.sessions.id })
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        eq(schema.sessions.isRevoked, false),
                        gt(schema.sessions.expiresAt, new Date())
                    )
                )
                .all();
                
            // Get recent security events (last 24 hours)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentEvents = await this.db.db
                .select({
                    createdAt: schema.auditLogs.createdAt,
                    action: schema.auditLogs.action
                })
                .from(schema.auditLogs)
                .where(
                    and(
                        eq(schema.auditLogs.userId, userId),
                        eq(schema.auditLogs.entityType, 'session'),
                        gt(schema.auditLogs.createdAt, oneDayAgo)
                    )
                )
                .orderBy(desc(schema.auditLogs.createdAt))
                .all();
                
            const activeSessionCount = activeSessions.length;
            const recentSecurityEvents = recentEvents.length;
            const lastSecurityEvent = recentEvents[0]?.createdAt || undefined;
            
            // Determine risk level
            let riskLevel: 'low' | 'medium' | 'high' = 'low';
            const recommendations: string[] = [];
            
            if (activeSessionCount > SessionService.config.maxConcurrentDevices) {
                riskLevel = 'medium';
                recommendations.push('Consider revoking old sessions - you have many active sessions');
            }
            
            if (recentSecurityEvents > 5) {
                riskLevel = 'high';
                recommendations.push('Multiple security events detected - review your account activity');
            } else if (recentSecurityEvents > 2) {
                riskLevel = 'medium';
                recommendations.push('Some suspicious activity detected - monitor your account');
            }
            
            // Check for session hijacking events
            const hijackingEvents = recentEvents.filter(e => e.action === 'session_hijacking');
            if (hijackingEvents.length > 0) {
                riskLevel = 'high';
                recommendations.push('Session hijacking attempts detected - change your password immediately');
            }
            
            if (recommendations.length === 0) {
                recommendations.push('Your account security looks good');
            }
            
            return {
                activeSessions: activeSessionCount,
                recentSecurityEvents,
                lastSecurityEvent,
                riskLevel,
                recommendations
            };
        } catch (error) {
            logger.error('Error getting user security status', error);
            return {
                activeSessions: 0,
                recentSecurityEvents: 0,
                riskLevel: 'low',
                recommendations: ['Unable to assess security status']
            };
        }
    }
    
    /**
     * Revoke session by ID
     */
    async revokeSessionId(sessionId: string): Promise<void> {
        try {
            await this.db.db
                .update(schema.sessions)
                .set({
                    isRevoked: true,
                    revokedAt: new Date(),
                    revokedReason: 'user_logout'
                })
                .where(eq(schema.sessions.id, sessionId));
            
            logger.info('Session revoked by refresh token hash');
        } catch (error) {
            logger.error('Error revoking session by refresh token hash', error);
            // Don't throw error for logout operations
        }
    }
    
    /**
     * Force logout all sessions except current (for security)
     */
    async forceLogoutAllOtherSessions(userId: string, currentSessionId: string): Promise<number> {
        try {
            const result = await this.db.db
                .delete(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        ne(schema.sessions.id, currentSessionId)
                    )
                );
                
            const deletedCount = result.meta.changes || 0;
            
            // Log security event
            await this.logSecurityEvent(
                userId,
                currentSessionId,
                'device_change',
                {
                    action: 'force_logout_other_sessions',
                    sessionsRevoked: deletedCount
                }
            );
            
            logger.info('Force logged out other sessions', { userId, currentSessionId, deletedCount });
            
            return deletedCount;
        } catch (error) {
            logger.error('Error force logging out other sessions', error);
            return 0;
        }
    }
}
