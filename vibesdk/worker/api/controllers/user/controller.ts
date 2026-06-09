import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { UserService } from '../../../database/services/UserService';
import { AppService } from '../../../database/services/AppService';
import { Visibility, AppSortOption, SortOrder, TimePeriod } from '../../../database/types';
import { UserAppsData, ProfileUpdateData } from './types';
import { createLogger } from '../../../logger';

const logger = createLogger('UserController');

/**
 * User Management Controller for Orange
 * Handles user dashboard, profile management, and app history
 */
export class UserController extends BaseController {
    static logger = logger;
    
    /**
     * Get user's apps with pagination and filtering
     */
    static async getApps(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserAppsData>>> {
        try {
            const user = context.user!;

            const url = new URL(request.url);
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '20');
            const status = url.searchParams.get('status') as 'generating' | 'completed' | undefined;
            const visibility = url.searchParams.get('visibility') as Visibility | undefined;
            const framework = url.searchParams.get('framework') || undefined;
            const search = url.searchParams.get('search') || undefined;
            const sort = (url.searchParams.get('sort') || 'recent') as AppSortOption;
            const order = (url.searchParams.get('order') || 'desc') as SortOrder;
            const period = (url.searchParams.get('period') || 'all') as TimePeriod;
            const offset = (page - 1) * limit;
            
            const queryOptions = {
                limit,
                offset,
                status,
                visibility,
                framework,
                search,
                sort,
                order,
                period
            };

            const appService = new AppService(env);
            
            // Get user apps with analytics and proper total count
            const [apps, totalCount] = await Promise.all([
                appService.getUserAppsWithAnalytics(user.id, queryOptions),
                appService.getUserAppsCount(user.id, queryOptions)
            ]);

            const responseData: UserAppsData = {
                apps,
                pagination: {
                    limit,
                    offset,
                    total: totalCount,
                    hasMore: offset + limit < totalCount
                }
            };

            return UserController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting user apps:', error);
            return UserController.createErrorResponse<UserAppsData>('Failed to get user apps', 500);
        }
    }

    /**
     * Update user profile
     */
    static async updateProfile(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ProfileUpdateData>>> {
        try {
            const user = context.user!;

            const bodyResult = await UserController.parseJsonBody<{
                username?: string;
                displayName?: string;
                bio?: string;
                theme?: 'light' | 'dark' | 'system';
            }>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<ProfileUpdateData>>;
            }

            const userService = new UserService(env);
            const result = await userService.updateUserProfileWithValidation(user.id, bodyResult.data!);

            if (!result.success) {
                return UserController.createErrorResponse<ProfileUpdateData>(result.message, 400);
            }

            const responseData: ProfileUpdateData = result;
            return UserController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error updating user profile:', error);
            return UserController.createErrorResponse<ProfileUpdateData>('Failed to update profile', 500);
        }
    }
}