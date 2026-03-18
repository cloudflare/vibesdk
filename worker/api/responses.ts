/**
 * Standardized API response utilities
 */

import { RateLimitError } from "../services/rate-limit/errors";
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
import { createLogger } from '../logger';
/**
 * Standard response shape for all API endpoints
 */

const logger = createLogger('ApiResponses');

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
    // Log full error details on the server side for debugging/observability.
    if (error instanceof Error) {
        logger.error('API error response', error);
    }

    let publicMessage: string;
    if (message) {
        publicMessage = message;
    } else if (error instanceof SecurityError) {
        // SecurityError messages are designed to be safe for clients.
        publicMessage = error.message;
    } else if (typeof error === 'string') {
        // Do not expose raw string errors directly to the client, as they may
        // contain stack traces or other sensitive internal information.
        logger.error('API error response (string)', { error });
        publicMessage = 'An error occurred';
    } else {
        // Do not expose raw internal error messages or stacks to the client.
        publicMessage = 'An error occurred';
    }

    let errorResp: ErrorResponse = {
        message: publicMessage,
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
        message: publicMessage,
    };

    return new Response(JSON.stringify(responseBody), {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}