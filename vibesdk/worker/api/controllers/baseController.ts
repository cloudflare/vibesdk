/**
 * Base Controller Class
 */
import { authMiddleware } from '../../middleware/auth/auth';
import { successResponse, errorResponse } from '../responses';
import { ControllerErrorHandler, ErrorHandler } from '../../utils/ErrorHandling';
import { createLogger } from '../../logger';
import { AuthUser } from '../../types/auth-types';
import type { ControllerResponse, ApiResponse } from './types';

/**
 * Base controller class that provides common functionality
 */
export abstract class BaseController {
    static logger = createLogger('BaseController');
    
    /**
     * Get optional user for public endpoints that can benefit from user context
     * Uses authMiddleware directly for optional authentication
     */
    static async getOptionalUser(request: Request, env: Env): Promise<AuthUser | null> {
        try {
            const userSession = await authMiddleware(request, env);
            if (!userSession) {
                return null;
            }
            return userSession.user;
        } catch (error) {
            this.logger.debug('Optional auth failed, continuing without user', { error });
            return null;
        }
    }

    /**
     * Parse query parameters from request URL
     */
    static parseQueryParams(request: Request): URLSearchParams {
        const url = new URL(request.url);
        return url.searchParams;
    }

    /**
     * Parse JSON body from request with error handling
     */
    static async parseJsonBody<T>(request: Request): Promise<{ success: boolean; data?: T; response?: Response }> {
        try {
            const body = await ControllerErrorHandler.parseJsonBody<T>(request);
            return { success: true, data: body };
        } catch (error) {
            const appError = ErrorHandler.handleError(error, 'parse JSON body');
            return {
                success: false,
                response: ErrorHandler.toResponse(appError)
            };
        }
    }

    /**
     * Handle errors with consistent logging and response format
     */
    static handleError(error: unknown, action: string, context?: Record<string, unknown>): Response {
        const appError = ErrorHandler.handleError(error, action, context);
        return ErrorHandler.toResponse(appError);
    }

    /**
     * Execute controller operation with error handling
     */
    static async executeWithErrorHandling<T>(
        operation: () => Promise<T>,
        operationName: string,
        context?: Record<string, any>
    ): Promise<T | Response> {
        return ControllerErrorHandler.handleControllerOperation(operation, operationName, context);
    }

    /**
     * Validate required parameters
     */
    static validateRequiredParams(params: Record<string, unknown>, requiredFields: string[]): void {
        ControllerErrorHandler.validateRequiredParams(params, requiredFields);
    }

    /**
     * Require authentication with standardized error
     */
    static requireAuthentication(user: unknown): void {
        ControllerErrorHandler.requireAuthentication(user);
    }

    /**
     * Create a typed success response that enforces response interface compliance
     * This method ensures the response data matches the expected type T at compile time
     */
    static createSuccessResponse<T>(data: T): ControllerResponse<ApiResponse<T>> {
        const response = successResponse(data) as ControllerResponse<ApiResponse<T>>;
        // The phantom type helps TypeScript understand this response contains type T
        return response;
    }

    /**
     * Create a typed error response with proper type annotation
     */
    static createErrorResponse<T = never>(message: string | Error, statusCode: number = 500): ControllerResponse<ApiResponse<T>> {
        const response = errorResponse(message, statusCode) as ControllerResponse<ApiResponse<T>>;
        return response;
    }

    /**
     * Extract client IP address from request headers
     */
    static getClientIpAddress(request: Request): string {
        return request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For')?.split(',')[0] || 
               'unknown';
    }

    /**
     * Extract user agent from request headers
     */
    static getUserAgent(request: Request): string {
        return request.headers.get('user-agent') || 'unknown';
    }

}