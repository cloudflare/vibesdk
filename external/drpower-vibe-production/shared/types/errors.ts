import type { RateLimitError } from "worker/services/rate-limit/errors";
import type { RateLimitType } from "worker/services/rate-limit/config";

/**
 * Security error types for proper error handling
 */
export enum SecurityErrorType {
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    INVALID_TOKEN = 'INVALID_TOKEN',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    RATE_LIMITED = 'RATE_LIMITED',
    INVALID_INPUT = 'INVALID_INPUT',
    CSRF_VIOLATION = 'CSRF_VIOLATION',
}

/**
 * Custom security error class
 */
export class SecurityError extends Error {
    constructor(
        public type: SecurityErrorType,
        message: string,
        public statusCode: number = 401
    ) {
        super(message);
        this.name = 'SecurityError';
    }
}

export class RateLimitExceededError extends SecurityError {
    public details: RateLimitError;
    constructor(
        message: string,
        public limitType: RateLimitType,
        public limit?: number,
        public period?: number,
        public suggestions?: string[]
    ) {
        super(SecurityErrorType.RATE_LIMITED, message, 429);
        this.name = 'RateLimitExceededError';
        this.details = {
            message,
            limitType,
            limit,
            period,
            suggestions
        };
    }

    static fromRateLimitError(error: RateLimitError): RateLimitExceededError {
        return new RateLimitExceededError(
            error.message,
            error.limitType,
            error.limit,
            error.period,
            error.suggestions
        );
    }
}