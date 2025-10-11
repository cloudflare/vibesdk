/**
 * Base Database Service Class
 * Provides common database functionality and patterns for all domain services
 */

import { createDatabaseService, DatabaseService } from '../database';
import { SQL, and } from 'drizzle-orm';
import { createLogger } from '../../logger';

/**
 * Base class for all database domain services
 * Provides shared utilities and database access patterns
 */
export abstract class BaseService {
    protected logger = createLogger(this.constructor.name);
    protected db: DatabaseService;
    protected env: Env;
    constructor(env: Env) {
        this.db = createDatabaseService(env);
        this.env = env;
    }

    /**
     * Helper to build type-safe where conditions
     */
    protected buildWhereConditions(conditions: (SQL<unknown> | undefined)[]): SQL<unknown> | undefined {
        const validConditions = conditions.filter((c): c is SQL<unknown> => c !== undefined);
        if (validConditions.length === 0) return undefined;
        if (validConditions.length === 1) return validConditions[0];
        // Use Drizzle's and() function to properly combine conditions
        return and(...validConditions);
    }

    /**
     * Standard error handling for database operations
     */
    protected handleDatabaseError(error: unknown, operation: string, context?: Record<string, unknown>): never {
        this.logger.error(`Database error in ${operation}`, { error, context });
        throw error;
    }

    /**
     * Get database connection for direct queries when needed
     */
    protected get database() {
        return this.db.db;
    }

    /**
     * Get read-optimized database connection using D1 read replicas
     * For read-only queries to reduce global latency
     * 
     * @param strategy - 'fast' for lowest latency, 'fresh' for latest data
     */
    protected getReadDb(strategy: 'fast' | 'fresh' = 'fast') {
        return this.db.getReadDb(strategy);
    }
}