import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { BillingController } from '../controllers/billing/controller';

export function setupBillingRoutes(app: Hono<AppEnv>): void {
    // Current tier + usage
    app.get('/api/billing/status', setAuthLevel(AuthConfig.authenticated), adaptController(BillingController, BillingController.getStatus));

    // Subscription lifecycle
    app.post('/api/billing/subscription', setAuthLevel(AuthConfig.authenticated), adaptController(BillingController, BillingController.createSubscription));
    app.post('/api/billing/subscription/cancel', setAuthLevel(AuthConfig.authenticated), adaptController(BillingController, BillingController.cancelSubscription));

    // One-time orders (credit top-ups)
    app.post('/api/billing/order', setAuthLevel(AuthConfig.authenticated), adaptController(BillingController, BillingController.createOrder));
    app.post('/api/billing/verify-payment', setAuthLevel(AuthConfig.authenticated), adaptController(BillingController, BillingController.verifyPayment));

    // Public webhook — signature-verified in the handler itself.
    app.post('/api/billing/webhook', adaptController(BillingController, BillingController.webhook));
}
