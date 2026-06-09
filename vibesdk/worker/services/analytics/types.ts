/**
 * AI Gateway Analytics Types
 * Type definitions for AI Gateway analytics data and responses
 */

/**
 * Time range for analytics queries
 */
export interface TimeRange {
  start: string; // ISO string with timezone
  end: string;   // ISO string with timezone
}

/**
 * Raw GraphQL analytics response from Cloudflare
 */
export interface CloudflareAnalyticsResponse {
  data: {
    viewer: {
      scope: Array<{
        totalRequests: Array<{
          count: number;
          sum: {
            cost: number;
            cachedRequests: number;
            erroredRequests: number;
            uncachedTokensIn: number;
            uncachedTokensOut: number;
            cachedTokensIn: number;
            cachedTokensOut: number;
          };
        }>;
        lastRequest: Array<{
          dimensions: {
            ts: string;
          };
        }>;
        latestRequests: Array<{
          count: number;
          dimensions: {
            ts: string;
          };
        }>;
      }>;
    };
  };
  errors?: Array<{
    message: string;
    path?: string;
    extensions?: {
      code: string;
      timestamp: string;
      ray_id: string;
    };
  }>;
}

/**
 * Processed analytics data for API responses
 */
export interface AnalyticsData {
  totalRequests: number;
  totalCost: number;
  tokensIn: number;
  tokensOut: number;
  errorRate: number; // Percentage
  cacheHitRate: number; // Percentage
  cachedRequests: number;
  erroredRequests: number;
  lastRequestAt: string | null;
  latestHourActivity: {
    count: number;
    timestamp: string;
  } | null;
  timeRange: TimeRange;
  queryResponseTime: number; // milliseconds
}

/**
 * User-specific analytics data
 */
export interface UserAnalyticsData extends AnalyticsData {
  userId: string;
}

/**
 * Chat/Agent-specific analytics data
 */
export interface ChatAnalyticsData extends AnalyticsData {
  chatId: string;
}

/**
 * Analytics service configuration
 */
export interface AnalyticsConfig {
  accountId: string;
  gateway: string;
  graphqlEndpoint: string;
  apiToken: string;
  isStaging: boolean;
}

/**
 * GraphQL query variables
 */
export interface GraphQLQueryVariables {
  accountTag: string;
  gateway: string;
  start: string;
  end: string;
  limit: number;
}

/**
 * GraphQL query structure
 */
export interface GraphQLQuery {
  operationName: null;
  variables: GraphQLQueryVariables;
  query: string;
}

/**
 * Analytics service errors
 */
export class AnalyticsError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

/**
 * Analytics query types
 */
export type AnalyticsQueryType = 'total' | 'user' | 'chat' | 'specific';

/**
 * Query execution result
 */
export interface QueryResult {
  data: CloudflareAnalyticsResponse | null;
  responseTime: number;
  error?: string;
}