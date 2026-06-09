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
export type UserAnalyticsResponseData = UserAnalyticsData;

/**
 * Agent analytics response data
 */
export type AgentAnalyticsResponseData = ChatAnalyticsData;
