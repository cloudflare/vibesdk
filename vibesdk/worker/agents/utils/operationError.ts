import { StructuredLogger } from "../../logger";

/**
 * Utility for consistent error handling in operations
 */
export class OperationError {
    /**
     * Log error and re-throw with consistent format
     */
    static logAndThrow(logger: StructuredLogger, operation: string, error: unknown): never {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error in ${operation}:`, error);
        throw new Error(`${operation} failed: ${errorMessage}`);
    }

    /**
     * Log error and return default value instead of throwing
     */
    static logAndReturn<T>(logger: StructuredLogger, operation: string, error: unknown, defaultValue: T): T {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error in ${operation}:`, error);
        logger.warn(`Returning default value for ${operation} due to error: ${errorMessage}`);
        return defaultValue;
    }
}