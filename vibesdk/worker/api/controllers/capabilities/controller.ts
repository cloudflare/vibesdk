/**
 * Capabilities Controller
 *
 * Exposes platform capabilities including available features and their configurations.
 * This endpoint allows the frontend to dynamically discover what features are available
 * on this platform instance.
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import type { CapabilitiesData } from './types';
import type { FeatureDefinition, PlatformCapabilities } from '../../../agents/core/features/types';
import { DEFAULT_FEATURE_DEFINITIONS } from '../../../agents/core/features';
import { createLogger } from '../../../logger';

const logger = createLogger('CapabilitiesController');

export class CapabilitiesController extends BaseController {
	/**
	 * Get platform capabilities
	 *
	 * Returns the list of available features and their capabilities.
	 * Feature availability is controlled by PLATFORM_CAPABILITIES in wrangler.jsonc.
	 *
	 * @route GET /api/capabilities
	 * @access Public
	 */
	static async getCapabilities(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<CapabilitiesData>>> {
		const config = env.PLATFORM_CAPABILITIES;

		// Build feature list by merging defaults with enabled status from config
		const features: FeatureDefinition[] = [
			{ ...DEFAULT_FEATURE_DEFINITIONS.app, enabled: config.features.app.enabled },
			{ ...DEFAULT_FEATURE_DEFINITIONS.presentation, enabled: config.features.presentation.enabled },
			{ ...DEFAULT_FEATURE_DEFINITIONS.general, enabled: config.features.general.enabled },
		];

		const capabilities: PlatformCapabilities = {
			features,
			version: config.version,
		};

		logger.info('Returning platform capabilities', {
			enabledFeatures: features.filter((f) => f.enabled).map((f) => f.id),
			version: capabilities.version,
		});

		return CapabilitiesController.createSuccessResponse(capabilities);
	}
}
