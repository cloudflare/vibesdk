/**
 * Benchmark routes — public read + Pro+ "run your own".
 *
 * Spec: docs/redesign/BENCHMARK-PAGE-SPEC.md §5.
 *
 *   GET  /api/benchmark/latest   public — no auth
 *   POST /api/benchmark/run      authenticated — tier check happens in the
 *                                controller so we can return a typed 402
 *                                "upgrade required" payload instead of a
 *                                generic 401.
 *
 * Pattern mirrors billingRoutes.ts.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { BenchmarkController } from '../controllers/benchmark/controller';

export function setupBenchmarkRoutes(app: Hono<AppEnv>): void {
    // Public marketing endpoint — no auth.
    app.get(
        '/api/benchmark/latest',
        setAuthLevel(AuthConfig.public),
        adaptController(BenchmarkController, BenchmarkController.getLatest),
    );

    // Authenticated — Pro/Team/Enterprise tier check + per-day rate limit
    // enforced in the controller.
    app.post(
        '/api/benchmark/run',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(BenchmarkController, BenchmarkController.runOnDemand),
    );
}
