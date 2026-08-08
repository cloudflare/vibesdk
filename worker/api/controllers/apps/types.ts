/**
 * Type definitions for App Controller responses
 */

import { App } from '../../../database/schema';
import { AppWithFavoriteStatus, PaginationInfo, FavoriteToggleResult, PublicAppListData } from '../../../database/types';

/**
 * App with extended user and social stats for public listings.
 * Uses the safe public projection - no sensitive/operational columns.
 */
export type AppWithUserAndStats = PublicAppListData & {
    updatedAtFormatted: string;
};

/**
 * Response data for getUserApps, getRecentApps, getFavoriteApps
 */
export interface AppsListData {
    apps: AppWithFavoriteStatus[];
}

/**
 * Response data for getPublicApps
 */
export interface PublicAppsData {
    apps: AppWithUserAndStats[];
    pagination: PaginationInfo;
}

/**
 * Response data for getApp
 */
export interface SingleAppData {
    app: AppWithFavoriteStatus;
}

/**
 * Response data for toggleFavorite
 */
export type FavoriteToggleData = FavoriteToggleResult;

/**
 * Response data for createApp
 */
export interface CreateAppData {
    app: App;
}

/**
 * Response data for updateAppVisibility
 */
export interface UpdateAppVisibilityData {
    app: {
        id: string;
        title: string;
        visibility: App['visibility'];
        updatedAt: Date | null;
    };
    message: string;
}

/**
 * Response data for deleteApp
 */
export interface AppDeleteData {
    success: boolean;
    message: string;
}