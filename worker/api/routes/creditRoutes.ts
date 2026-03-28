import { CreditController } from '../controllers/credits/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupCreditRoutes(app: Hono<AppEnv>): void {
    // Get credit balance and usage summary
    app.get('/api/credits/balance', setAuthLevel(AuthConfig.authenticated), adaptController(CreditController, CreditController.getBalance));

    // Get transaction history
    app.get('/api/credits/transactions', setAuthLevel(AuthConfig.authenticated), adaptController(CreditController, CreditController.getTransactions));

    // Spend credits (called during AI generation)
    app.post('/api/credits/spend', setAuthLevel(AuthConfig.authenticated), adaptController(CreditController, CreditController.spendCredits));

    // Get cost for a model/ultra combination (public)
    app.get('/api/credits/cost', adaptController(CreditController, CreditController.getCost));
}
