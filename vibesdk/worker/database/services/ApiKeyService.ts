/**
 * API Key Service
 * Handles all API key-related database operations
 */

import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq, and, desc, sql, or, isNull, gt } from 'drizzle-orm';
import { generateId } from '../../utils/idGenerator';
import { createLogger } from '../../logger';

const logger = createLogger('ApiKeyService');

export interface ApiKeyInfo {
    id: string;
    name: string;
    keyPreview: string;
    createdAt: Date | null;
    lastUsed?: Date | null;
    isActive: boolean | null;
}

export interface CreateApiKeyData {
    userId: string;
    name: string;
    keyHash: string;
    keyPreview: string;
}

/**
 * API Key Service for managing API keys
 */
export class ApiKeyService extends BaseService {
    
    /**
     * Get all API keys for a user
     */
    async getUserApiKeys(userId: string): Promise<ApiKeyInfo[]> {
        try {
            const keys = await this.database
                .select({
                    id: schema.apiKeys.id,
                    name: schema.apiKeys.name,
                    keyPreview: schema.apiKeys.keyPreview,
                    createdAt: schema.apiKeys.createdAt,
                    lastUsed: schema.apiKeys.lastUsed,
                    isActive: schema.apiKeys.isActive
                })
                .from(schema.apiKeys)
                .where(eq(schema.apiKeys.userId, userId))
                .orderBy(desc(schema.apiKeys.createdAt))
                .all();
            
            return keys;
        } catch (error) {
            logger.error('Error fetching user API keys', error);
            return [];
        }
    }
    
    /**
     * Create a new API key
     */
    async createApiKey(data: CreateApiKeyData): Promise<string> {
        try {
            const keyId = generateId();
            
            await this.database.insert(schema.apiKeys).values({
                id: keyId,
                userId: data.userId,
                name: data.name,
                keyHash: data.keyHash,
                keyPreview: data.keyPreview,
                scopes: JSON.stringify([]),
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true
            });
            
            logger.info('API key created', { keyId, userId: data.userId });
            
            return keyId;
        } catch (error) {
            logger.error('Error creating API key', error);
            throw new Error('Failed to create API key');
        }
    }
    
    /**
     * Revoke an API key
     */
    async revokeApiKey(keyId: string, userId: string): Promise<boolean> {
        try {
            await this.database
                .update(schema.apiKeys)
                .set({
                    isActive: false,
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(schema.apiKeys.id, keyId),
                        eq(schema.apiKeys.userId, userId)
                    )
                );
            
            logger.info('API key revoked', { keyId, userId });
            
            return true;
        } catch (error) {
            logger.error('Error revoking API key', error);
            return false;
        }
    }
    
    /**
     * Find API key by hash
     */
    async findApiKeyByHash(keyHash: string): Promise<schema.ApiKey | null> {
        try {
            const now = new Date();
            const key = await this.database
                .select()
                .from(schema.apiKeys)
                .where(
                    and(
                        eq(schema.apiKeys.keyHash, keyHash),
                        eq(schema.apiKeys.isActive, true),
                        or(
                            isNull(schema.apiKeys.expiresAt),
                            gt(schema.apiKeys.expiresAt, now)
                        )
                    )
                )
                .get();

            return key || null;
        } catch (error) {
            logger.error('Error finding API key by hash', error);
            return null;
        }
    }
    
    /**
     * Update API key last used time and increment request count
     */
    async updateApiKeyLastUsed(keyId: string): Promise<void> {
        try {
            await this.database
                .update(schema.apiKeys)
                .set({
                    lastUsed: new Date(),
                    updatedAt: new Date(),
                    requestCount: sql`COALESCE(${schema.apiKeys.requestCount}, 0) + 1`
                })
                .where(eq(schema.apiKeys.id, keyId));
        } catch (error) {
            logger.error('Error updating API key last used', error);
        }
    }
    
    /**
     * Check if API key name is unique for user
     */
    async isApiKeyNameUnique(userId: string, name: string): Promise<boolean> {
        try {
            const existing = await this.database
                .select({ id: schema.apiKeys.id })
                .from(schema.apiKeys)
                .where(
                    and(
                        eq(schema.apiKeys.userId, userId),
                        eq(schema.apiKeys.name, name),
                        eq(schema.apiKeys.isActive, true)
                    )
                )
                .get();
            
            return !existing;
        } catch (error) {
            logger.error('Error checking API key name uniqueness', error);
            return false;
        }
    }
    
    /**
     * Get active API key count for user
     */
    async getActiveApiKeyCount(userId: string): Promise<number> {
        try {
            const result = await this.database
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.apiKeys)
                .where(
                    and(
                        eq(schema.apiKeys.userId, userId),
                        eq(schema.apiKeys.isActive, true)
                    )
                )
                .get();
            
            return Number(result?.count) || 0;
        } catch (error) {
            logger.error('Error counting active API keys', error);
            return 0;
        }
    }
}
