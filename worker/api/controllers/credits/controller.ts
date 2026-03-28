import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { CreditService } from '../../../database/services/CreditService';
import { createLogger } from '../../../logger';

const logger = createLogger('CreditController');

interface CreditBalanceData {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    transactionsThisMonth: number;
    spentThisMonth: number;
}

interface CreditTransactionData {
    transactions: Array<{
        id: string;
        amount: number;
        type: string;
        description: string;
        model: string | null;
        provider: string | null;
        balanceAfter: number;
        createdAt: Date | null;
    }>;
}

interface SpendResult {
    success: boolean;
    balance: number;
    cost: number;
    message?: string;
}

export class CreditController extends BaseController {
    static logger = logger;

    static async getBalance(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<CreditBalanceData>>> {
        try {
            const user = context.user!;
            const creditService = new CreditService(env);
            const summary = await creditService.getUsageSummary(user.id);
            return CreditController.createSuccessResponse(summary);
        } catch (error) {
            logger.error('Error getting credit balance:', error);
            return CreditController.createErrorResponse<CreditBalanceData>('Failed to get credit balance', 500);
        }
    }

    static async getTransactions(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<CreditTransactionData>>> {
        try {
            const user = context.user!;
            const url = new URL(request.url);
            const limit = parseInt(url.searchParams.get('limit') || '20');
            const offset = parseInt(url.searchParams.get('offset') || '0');

            const creditService = new CreditService(env);
            const transactions = await creditService.getTransactions(user.id, { limit, offset });

            return CreditController.createSuccessResponse({ transactions });
        } catch (error) {
            logger.error('Error getting transactions:', error);
            return CreditController.createErrorResponse<CreditTransactionData>('Failed to get transactions', 500);
        }
    }

    static async spendCredits(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SpendResult>>> {
        try {
            const user = context.user!;

            const bodyResult = await CreditController.parseJsonBody<{
                model: string;
                ultra: boolean;
                provider?: string;
                appId?: string;
                description?: string;
            }>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<SpendResult>>;
            }

            const { model, ultra, provider, appId, description } = bodyResult.data!;
            const creditService = new CreditService(env);
            const result = await creditService.spendCredits(user.id, { model, ultra, provider, appId, description });

            if (!result.success) {
                return CreditController.createErrorResponse<SpendResult>(result.message || 'Insufficient credits', 402);
            }

            return CreditController.createSuccessResponse(result);
        } catch (error) {
            logger.error('Error spending credits:', error);
            return CreditController.createErrorResponse<SpendResult>('Failed to spend credits', 500);
        }
    }

    static async getCost(request: Request, env: Env): Promise<ControllerResponse<ApiResponse<{ cost: number }>>> {
        try {
            const url = new URL(request.url);
            const model = url.searchParams.get('model') || 'e1';
            const ultra = url.searchParams.get('ultra') === 'true';

            const creditService = new CreditService(env);
            const cost = creditService.getCost(model, ultra);

            return CreditController.createSuccessResponse({ cost });
        } catch (error) {
            logger.error('Error getting cost:', error);
            return CreditController.createErrorResponse<{ cost: number }>('Failed to get cost', 500);
        }
    }
}
