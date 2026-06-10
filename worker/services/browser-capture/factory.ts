/**
 * Selects the right `BrowserCaptureClient` for the current runtime
 * environment. In dev we hit a local sidecar so puppeteer can run
 * natively against `localhost` previews; in prod we use the
 * Cloudflare `BROWSER` binding directly.
 */

import { isDev } from '../../utils/envs';
import type { StructuredLogger } from '../../logger';
import { BindingCaptureClient } from './binding-client';
import { SidecarCaptureClient } from './sidecar-client';
import type { BrowserCaptureClient } from './types';

export function getBrowserCaptureClient(
	env: Env,
	logger: StructuredLogger,
): BrowserCaptureClient {
	return isDev(env)
		? new SidecarCaptureClient(env, logger)
		: new BindingCaptureClient(env, logger);
}
