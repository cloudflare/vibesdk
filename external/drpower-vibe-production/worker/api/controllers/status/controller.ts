import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import type { PlatformStatusData } from './types';

export class StatusController extends BaseController {
    static async getPlatformStatus(
        _request: Request,
        _env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<PlatformStatusData>>> {
        const messaging = context.config.globalMessaging ?? { globalUserMessage: '', changeLogs: '' };
        const globalUserMessage = messaging.globalUserMessage ?? '';
        const changeLogs = messaging.changeLogs ?? '';

        const data: PlatformStatusData = {
            globalUserMessage,
            changeLogs,
            hasActiveMessage: globalUserMessage.trim().length > 0,
        };

        return StatusController.createSuccessResponse(data);
    }
}
