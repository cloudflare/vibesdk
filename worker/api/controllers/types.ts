/**
 * Base Controller Types
 */

import { BaseApiResponse } from "../responses";


/**
 * Typed response wrapper for controller methods
 * Ensures controller responses match their expected interface types
 */
export type ControllerResponse<T> = Response & {
    __typedData: T; // Phantom type for compile-time checking
};

/**
 * Type-safe API response interface that ensures data is properly typed
 */
export type ApiResponse<T = unknown> = BaseApiResponse<T>;