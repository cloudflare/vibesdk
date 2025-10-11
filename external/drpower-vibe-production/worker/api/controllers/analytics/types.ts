/**
 * Analytics Controller Types
 * Type definitions for analytics controller requests and responses
 */

import {
	UserAnalyticsData,
	ChatAnalyticsData,
} from '../../../services/analytics/types';

/**
 * User analytics response data
 */
export interface UserAnalyticsResponseData extends UserAnalyticsData {}

/**
 * Agent analytics response data
 */
export interface AgentAnalyticsResponseData extends ChatAnalyticsData {}
