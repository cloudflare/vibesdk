/**
 * Error Handling Utilities
 */

import { createLogger } from '../logger';
import { SecurityError } from 'shared/types/errors';
import { errorResponse } from '../api/responses';

const logger = createLogger('ErrorHandling');

/**
 * Standard error types for the application
 */
export enum AppErrorType {
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
    AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
    NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
    CONFLICT_ERROR = 'CONFLICT_ERROR',
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
    EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Application error class
 */
export class AppError extends Error {
    constructor(
        public type: AppErrorType,
        message: string,
        public statusCode: number = 500,
        public context?: Record<string, any>
    ) {
        super(message);
        this.name = 'AppError';
    }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
    
    /**
     * Handle and log error with context
     */
    static handleError(
        error: unknown, 
        operation: string, 
        context?: Record<string, any>
    ): AppError {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        logger.error(`Error during ${operation}`, {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            ...context
        });

        // Convert SecurityError to AppError
        if (error instanceof SecurityError) {
            return new AppError(
                AppErrorType.AUTHENTICATION_ERROR,
                error.message,
                error.statusCode,
                context
            );
        }

        // Convert AppError
        if (error instanceof AppError) {
            return error;
        }

        // Default to internal error
        return new AppError(
            AppErrorType.INTERNAL_ERROR,
            `Failed to ${operation}`,
            500,
            context
        );
    }

    /**
     * Convert AppError to HTTP Response
     */
    static toResponse(error: AppError): Response {
        return errorResponse(error.message, error.statusCode);
    }

    /**
     * Handle async operation with error catching
     */
    static async safeExecute<T>(
        operation: () => Promise<T>,
        operationName: string,
        context?: Record<string, any>
    ): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
        try {
            const data = await operation();
            return { success: true, data };
        } catch (error) {
            const appError = ErrorHandler.handleError(error, operationName, context);
            return { success: false, error: appError };
        }
    }

    /**
     * Wrap async function with error handling
     */
    static wrapAsync<TArgs extends any[], TReturn>(
        fn: (...args: TArgs) => Promise<TReturn>,
        operationName: string,
        defaultReturn?: TReturn
    ) {
        return async (...args: TArgs): Promise<TReturn> => {
            try {
                return await fn(...args);
            } catch (error) {
                const appError = ErrorHandler.handleError(error, operationName);
                
                if (defaultReturn !== undefined) {
                    return defaultReturn;
                }
                
                throw appError;
            }
        };
    }
}

/**
 * Error factory functions for common scenarios
 */
export class ErrorFactory {
    
    static validationError(message: string, context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.VALIDATION_ERROR, message, 400, context);
    }

    static authenticationError(message: string = 'Authentication required', context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.AUTHENTICATION_ERROR, message, 401, context);
    }

    static authorizationError(message: string = 'Insufficient permissions', context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.AUTHORIZATION_ERROR, message, 403, context);
    }

    static notFoundError(resource: string, context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.NOT_FOUND_ERROR, `${resource} not found`, 404, context);
    }

    static conflictError(message: string, context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.CONFLICT_ERROR, message, 409, context);
    }

    static rateLimitError(message: string = 'Rate limit exceeded', context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.RATE_LIMIT_ERROR, message, 429, context);
    }

    static externalServiceError(service: string, context?: Record<string, any>): AppError {
        return new AppError(
            AppErrorType.EXTERNAL_SERVICE_ERROR, 
            `External service ${service} unavailable`, 
            502, 
            context
        );
    }

    static internalError(message: string = 'Internal server error', context?: Record<string, any>): AppError {
        return new AppError(AppErrorType.INTERNAL_ERROR, message, 500, context);
    }
}

/**
 * Controller error handling mixin
 */
export class ControllerErrorHandler {
    
    /**
     * Handle controller operation with standardized error response
     */
    static async handleControllerOperation<T>(
        operation: () => Promise<T>,
        operationName: string,
        context?: Record<string, any>
    ): Promise<T | Response> {
        try {
            return await operation();
        } catch (error) {
            const appError = ErrorHandler.handleError(error, operationName, context);
            return ErrorHandler.toResponse(appError);
        }
    }

    /**
     * Validate required parameters
     */
    static validateRequiredParams(
        params: Record<string, any>, 
        requiredFields: string[]
    ): void {
        for (const field of requiredFields) {
            if (!params[field]) {
                throw ErrorFactory.validationError(`${field} is required`, { field });
            }
        }
    }

    /**
     * Handle authentication requirement
     */
    static requireAuthentication(user: any): void {
        if (!user) {
            throw ErrorFactory.authenticationError();
        }
    }

    /**
     * Handle resource ownership verification
     */
    static requireResourceOwnership(resource: any, userId: string, resourceName: string): void {
        if (!resource) {
            throw ErrorFactory.notFoundError(resourceName);
        }
        
        if (resource.userId !== userId) {
            throw ErrorFactory.authorizationError(`Access denied to ${resourceName}`);
        }
    }

    /**
     * Handle JSON parsing with proper error
     */
    static async parseJsonBody<T>(request: Request): Promise<T> {
        try {
            return await request.json() as T;
        } catch (error) {
            throw ErrorFactory.validationError('Invalid JSON in request body');
        }
    }

    /**
     * Handle external service errors
     */
    static handleExternalServiceError(
        serviceName: string, 
        error: unknown, 
        context?: Record<string, any>
    ): never {
        logger.error(`External service error: ${serviceName}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            ...context
        });
        
        throw ErrorFactory.externalServiceError(serviceName, context);
    }
}