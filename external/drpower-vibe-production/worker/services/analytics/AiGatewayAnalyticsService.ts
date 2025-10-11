/**
 * AI Gateway Analytics Service
 * Provides analytics data from Cloudflare AI Gateway GraphQL API
 */

import { createLogger, StructuredLogger } from '../../logger';
import {
  AnalyticsConfig,
  AnalyticsData,
  UserAnalyticsData,
  ChatAnalyticsData,
  TimeRange,
  CloudflareAnalyticsResponse,
  GraphQLQueryVariables,
  GraphQLQuery,
  QueryResult,
  AnalyticsError,
  AnalyticsQueryType
} from './types';

export class AiGatewayAnalyticsService {
  private config: AnalyticsConfig;
  private logger: StructuredLogger;

  constructor(env: Env) {
    this.logger = createLogger('AiGatewayAnalyticsService');
    this.config = this.initializeConfig(env);
    this.logger.info('AiGatewayAnalyticsService initialized', {
      endpoint: this.config.graphqlEndpoint,
      isStaging: this.config.isStaging,
      accountId: this.config.accountId,
      gateway: this.config.gateway
    });
  }

  /**
   * Initialize configuration from environment variables
   */
  private initializeConfig(env: Env): AnalyticsConfig {
    let config: AnalyticsConfig = {
      accountId: '',
      gateway: '',
      graphqlEndpoint: 'https://api.cloudflare.com/client/v4/graphql',
      apiToken: '',
      isStaging: false
    };

    // If CLOUDFLARE_AI_GATEWAY_URL is set, parse it and use staging settings
    if (env.CLOUDFLARE_AI_GATEWAY_URL) {
      try {
        const { accountId, gateway, isStaging } = this.parseGatewayUrl(env.CLOUDFLARE_AI_GATEWAY_URL);
        
        config.accountId = accountId;
        config.gateway = gateway;
        config.isStaging = isStaging;
        
        if (isStaging) {
          config.graphqlEndpoint = 'https://api.staging.cloudflare.com/client/v4/graphql';
          config.apiToken = env.CLOUDFLARE_AI_GATEWAY_TOKEN || '';
        } else {
          config.apiToken = env.CLOUDFLARE_API_TOKEN || '';
        }
      } catch (error) {
        this.logger.warn('Failed to parse CLOUDFLARE_AI_GATEWAY_URL, falling back to direct env vars', { error });
        // Fall through to direct env vars
      }
    }

    // Use direct environment variables if gateway URL not set or parsing failed
    if (!config.accountId || !config.gateway || !config.apiToken) {
      config.accountId = env.CLOUDFLARE_ACCOUNT_ID || config.accountId;
      config.gateway = env.CLOUDFLARE_AI_GATEWAY || config.gateway;
      config.apiToken = env.CLOUDFLARE_API_TOKEN || config.apiToken;
    }

    // Validate required configuration
    if (!config.accountId || !config.gateway || !config.apiToken) {
      const missing = [];
      if (!config.accountId) missing.push('Account ID');
      if (!config.gateway) missing.push('Gateway name');
      if (!config.apiToken) missing.push('API token');
      
      throw new AnalyticsError(
        `Missing required configuration: ${missing.join(', ')}`,
        'CONFIG_MISSING',
        500
      );
    }

    return config;
  }

  /**
   * Parse AI Gateway URL to extract account ID and gateway name
   */
  private parseGatewayUrl(url: string): { accountId: string; gateway: string; isStaging: boolean } {
    try {
      const parsedUrl = new URL(url);
      const isStaging = url.includes('staging');
      
      // URL format: https://staging.gateway.ai.cfdata.org/v1/{account_id}/{gateway_name}
      const pathParts = parsedUrl.pathname.split('/').filter(part => part);
      
      if (pathParts.length >= 3 && pathParts[0] === 'v1') {
        return {
          accountId: pathParts[1],
          gateway: pathParts[2],
          isStaging
        };
      }
      
      throw new Error('Invalid gateway URL format');
    } catch (error) {
      throw new AnalyticsError(
        `Failed to parse gateway URL: ${error}`,
        'INVALID_URL',
        400,
        error as Error
      );
    }
  }

  /**
   * Generate time range for analytics queries
   * If no days specified, returns maximum allowed range (30 days due to API limits)
   */
  private getTimeRange(days?: number): TimeRange {
    const end = new Date();
    
    // Cloudflare AI Gateway API has a time range limit (~32 days max)
    // If no days specified, use 30 days to stay within limits
    const daysToQuery = days || 30;
    const start = new Date(end.getTime() - (daysToQuery * 24 * 60 * 60 * 1000));
    
    // Use the exact format from working examples
    const offsetMinutes = end.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const offsetSign = offsetMinutes <= 0 ? '+' : '-';
    const offsetStr = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;
    
    // Set start time to beginning of the day
    const startOfDay = new Date(start);
    startOfDay.setHours(0, 0, 0, 0);
    
    return {
      start: startOfDay.toISOString().slice(0, 19) + offsetStr,
      end: end.toISOString().slice(0, 19) + offsetStr
    };
  }

  /**
   * Execute GraphQL query against Cloudflare Analytics API
   */
  private async executeQuery(query: GraphQLQuery): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.config.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new AnalyticsError(
          `HTTP ${response.status}: ${errorText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json() as CloudflareAnalyticsResponse;

      // Check for GraphQL errors
      if (data.errors && data.errors.length > 0) {
        const error = data.errors[0];
        throw new AnalyticsError(
          error.message || 'GraphQL query failed',
          error.extensions?.code || 'GRAPHQL_ERROR',
          error.extensions?.code === 'authz' ? 403 : 500
        );
      }

      return {
        data,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error instanceof AnalyticsError) {
        return {
          data: null,
          responseTime,
          error: error.message
        };
      }
      
      return {
        data: null,
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Build GraphQL query for specific filter type
   */
  private buildQuery(type: AnalyticsQueryType, timeRange: TimeRange, filterId?: string): GraphQLQuery {
    const variables: GraphQLQueryVariables = {
      accountTag: this.config.accountId,
      gateway: this.config.gateway,
      start: timeRange.start,
      end: timeRange.end,
      limit: 1
    };

    let filterClause = '';
    switch (type) {
      case 'user':
        filterClause = 'metadataKeys_has: "userId",';
        break;
      case 'chat':
        filterClause = 'metadataKeys_has: "chatId",';
        break;
      case 'specific':
        if (!filterId) throw new AnalyticsError('Filter ID required for specific queries', 'MISSING_FILTER_ID', 400);
        filterClause = `metadataValues_has: "${filterId}",`;
        break;
      case 'total':
      default:
        // No additional filter for total analytics
        break;
    }

    return {
      operationName: null,
      variables,
      query: `{
        viewer {
          scope: accounts(filter: {accountTag: $accountTag}) {
            latestRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, ${filterClause} datetimeHour_geq: $start, datetimeHour_leq: $end}) {
              count
              dimensions {
                ts: datetimeHour
                __typename
              }
              __typename
            }
            lastRequest: aiGatewayRequestsAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {gateway: $gateway, ${filterClause} datetimeHour_geq: $start, datetimeHour_leq: $end}) {
              dimensions {
                ts: datetimeMinute
                __typename
              }
              __typename
            }
            totalRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, ${filterClause} datetimeHour_geq: $start, datetimeHour_leq: $end}) {
              count
              sum {
                cost
                cachedRequests
                erroredRequests
                uncachedTokensIn
                uncachedTokensOut
                cachedTokensIn
                cachedTokensOut
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }`
    };
  }

  /**
   * Process raw analytics response into structured data
   */
  private processAnalyticsResponse(result: QueryResult, timeRange: TimeRange): AnalyticsData {
    if (result.error || !result.data?.data?.viewer?.scope?.[0]) {
      throw new AnalyticsError(
        result.error || 'No analytics data available',
        'NO_DATA',
        404
      );
    }

    const scope = result.data.data.viewer.scope[0];
    const totalRequests = scope.totalRequests?.[0];
    const lastRequest = scope.lastRequest?.[0];
    const latestRequests = scope.latestRequests?.[0];

    if (!totalRequests) {
      throw new AnalyticsError('No request data available', 'NO_REQUEST_DATA', 404);
    }

    const {
      cost,
      cachedRequests,
      erroredRequests,
      uncachedTokensIn,
      uncachedTokensOut,
      cachedTokensIn,
      cachedTokensOut
    } = totalRequests.sum;

    const totalTokensIn = uncachedTokensIn + cachedTokensIn;
    const totalTokensOut = uncachedTokensOut + cachedTokensOut;
    const errorRate = totalRequests.count > 0 ? ((erroredRequests / totalRequests.count) * 100) : 0;
    const cacheHitRate = totalRequests.count > 0 ? ((cachedRequests / totalRequests.count) * 100) : 0;

    return {
      totalRequests: totalRequests.count,
      totalCost: cost,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      errorRate: parseFloat(errorRate.toFixed(2)),
      cacheHitRate: parseFloat(cacheHitRate.toFixed(2)),
      cachedRequests,
      erroredRequests,
      lastRequestAt: lastRequest?.dimensions?.ts || null,
      latestHourActivity: latestRequests ? {
        count: latestRequests.count,
        timestamp: latestRequests.dimensions.ts
      } : null,
      timeRange,
      queryResponseTime: result.responseTime
    };
  }

  /**
   * Get analytics data for a specific user
   * @param userId - User ID to filter by
   * @param days - Number of days to query (optional, defaults to 30 days due to API limits)
   */
  async getUserAnalytics(userId: string, days?: number): Promise<UserAnalyticsData> {
    this.logger.info('Getting user analytics', { userId, days: days || '30 days (default)' });
    
    const timeRange = this.getTimeRange(days);
    const query = this.buildQuery('specific', timeRange, userId);
    const result = await this.executeQuery(query);
    const analyticsData = this.processAnalyticsResponse(result, timeRange);

    return {
      ...analyticsData,
      userId
    };
  }

  /**
   * Get analytics data for a specific chat/agent
   * @param chatId - Chat/Agent ID to filter by
   * @param days - Number of days to query (optional, defaults to 30 days due to API limits)
   */
  async getChatAnalytics(chatId: string, days?: number): Promise<ChatAnalyticsData> {
    this.logger.info('Getting chat analytics', { chatId, days: days || '30 days (default)' });
    
    const timeRange = this.getTimeRange(days);
    const query = this.buildQuery('specific', timeRange, chatId);
    const result = await this.executeQuery(query);
    const analyticsData = this.processAnalyticsResponse(result, timeRange);

    return {
      ...analyticsData,
      chatId
    };
  }

  /**
   * Get total gateway analytics (for debugging/admin purposes)
   * @param days - Number of days to query (optional, defaults to 30 days due to API limits)
   */
  async getTotalAnalytics(days?: number): Promise<AnalyticsData> {
    this.logger.info('Getting total analytics', { days: days || '30 days (default)' });
    
    const timeRange = this.getTimeRange(days);
    const query = this.buildQuery('total', timeRange);
    const result = await this.executeQuery(query);
    
    return this.processAnalyticsResponse(result, timeRange);
  }
}