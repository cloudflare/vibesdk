/**
 * Type definitions for User Controller responses
 */

import { EnhancedAppData, PaginationInfo } from '../../../database/types';

/**
 * Response data for getApps
 */
export interface UserAppsData {
    apps: EnhancedAppData[];
    pagination: PaginationInfo;
}

/**
 * Response data for updateProfile
 */
export interface ProfileUpdateData {
    success: boolean;
    message: string;
}