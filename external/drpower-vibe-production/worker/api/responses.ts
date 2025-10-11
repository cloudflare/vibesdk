/**
 * Standardized API response utilities
 */

import { RateLimitError } from "../services/rate-limit/errors";
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
/**
 * Standard response shape for all API endpoints
 */

export interface BaseErrorResponse {
    message: string;
    name: string;
    type?: SecurityErrorType;
}

export interface RateLimitErrorResponse extends BaseErrorResponse {
    details: RateLimitError;
}
    
type ErrorResponse = BaseErrorResponse | RateLimitErrorResponse;

export interface BaseApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: ErrorResponse;
    message?: string;
}

/**
 * Creates a success response with standard format
 */
export function successResponse<T = unknown>(data: T, message?: string): Response {
    const responseBody: BaseApiResponse<T> = {
        success: true,
        data,
        message,
    };

    return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

/**
 * Creates an error response with standard format
 */
export function errorResponse(error: string | Error | SecurityError, statusCode = 500, message?: string): Response {
    let errorResp: ErrorResponse = {
        message: error instanceof Error ? error.message : error,
        name: error instanceof Error ? error.name : 'Error',
    }
    if (error instanceof SecurityError) {
        errorResp = {
            ...errorResp,
            type: error.type,
        }
    }
    const responseBody: BaseApiResponse = {
        success: false,
        error: errorResp,
        message: message || (error instanceof Error ? error.message : 'An error occurred'),
    };

    return new Response(JSON.stringify(responseBody), {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}