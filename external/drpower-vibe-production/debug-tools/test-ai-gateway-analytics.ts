#!/usr/bin/env bun

/**
 * Cloudflare AI Gateway Analytics Testing Script
 * 
 * Tests the Cloudflare AI Gateway GraphQL Analytics API and displays comprehensive
 * analytics data including costs, tokens, requests, errors, and response times.
 * 
 * Usage:
 *   bun --env-file .dev.vars scripts/test-ai-gateway-analytics.ts
 *   bun --env-file .dev.vars scripts/test-ai-gateway-analytics.ts --user-id abc123
 *   bun --env-file .dev.vars scripts/test-ai-gateway-analytics.ts --chat-id xyz789
 *   bun --env-file .dev.vars scripts/test-ai-gateway-analytics.ts --days 7
 *   bun --env-file .dev.vars scripts/test-ai-gateway-analytics.ts --show-models --show-providers
 *   bun --env-file .dev.vars scripts/test-ai-gateway-analytics.ts --granularity minute --top-models 5
 */

// Types
interface AnalyticsResponse {
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
  errors?: any[];
}

// Enhanced types for provider and model analytics
interface ProviderRequestAnalytics {
  data: {
    viewer: {
      accounts: Array<{
        data: Array<{
          count: number;
          dimensions: {
            ts: string;
            provider: string;
          };
        }>;
      }>;
    };
  };
  errors?: any[];
}

interface ModelTokenAnalytics {
  data: {
    viewer: {
      accounts: Array<{
        data: Array<{
          count: number;
          sum: {
            uncachedTokensIn: number;
            uncachedTokensOut: number;
            cost: number;
          };
          dimensions: {
            ts: string;
            provider: string;
            model: string;
          };
        }>;
      }>;
    };
  };
  errors?: any[];
}

// Provider summary data structure
interface ProviderSummary {
  name: string;
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  models: ModelSummary[];
}

// Model summary data structure
interface ModelSummary {
  name: string;
  provider: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  firstSeen: string;
  lastSeen: string;
}

// Enhanced query result types
interface QueryResult {
  name: string;
  responseTime: number;
  data: AnalyticsResponse | ProviderRequestAnalytics | ModelTokenAnalytics | null;
  error?: string;
}

// Configuration (will be updated from env vars)
let CONFIG = {
  ACCOUNT_TAG: '',
  GATEWAY: '',
  GRAPHQL_ENDPOINT: 'https://api.cloudflare.com/client/v4/graphql',
  IS_STAGING: false,
  API_TOKEN: '',
};

// Parse AI Gateway URL to extract account ID and gateway name
function parseGatewayUrl(url: string): { accountId: string; gateway: string; isStaging: boolean } {
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
    throw new Error(`Failed to parse gateway URL: ${error}`);
  }
}

// Initialize configuration from environment variables
function initializeConfig(): void {
  const {
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_AI_GATEWAY,
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_AI_GATEWAY_TOKEN,
    CLOUDFLARE_AI_GATEWAY_URL
  } = process.env;

  // If CLOUDFLARE_AI_GATEWAY_URL is set, parse it and use staging settings
  if (CLOUDFLARE_AI_GATEWAY_URL) {
    const { accountId, gateway, isStaging } = parseGatewayUrl(CLOUDFLARE_AI_GATEWAY_URL);
    
    CONFIG.ACCOUNT_TAG = accountId;
    CONFIG.GATEWAY = gateway;
    CONFIG.IS_STAGING = isStaging;
    
    if (isStaging) {
      CONFIG.GRAPHQL_ENDPOINT = 'https://api.staging.cloudflare.com/client/v4/graphql';
      CONFIG.API_TOKEN = CLOUDFLARE_AI_GATEWAY_TOKEN || '';
    } else {
      CONFIG.API_TOKEN = CLOUDFLARE_API_TOKEN || '';
    }
  } else {
    // Use direct environment variables
    CONFIG.ACCOUNT_TAG = CLOUDFLARE_ACCOUNT_ID || '';
    CONFIG.GATEWAY = CLOUDFLARE_AI_GATEWAY || '';
    CONFIG.API_TOKEN = CLOUDFLARE_API_TOKEN || '';
  }

  // Validate required configuration
  if (!CONFIG.ACCOUNT_TAG || !CONFIG.GATEWAY || !CONFIG.API_TOKEN) {
    console.error('❌ Missing required environment variables:');
    if (!CONFIG.ACCOUNT_TAG) console.error('   - Account ID not found');
    if (!CONFIG.GATEWAY) console.error('   - Gateway name not found');
    if (!CONFIG.API_TOKEN) console.error('   - API token not found');
    process.exit(1);
  }
}

// GraphQL Queries
const QUERIES = {
  totalGateway: (start: string, end: string) => ({
    operationName: null,
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 1
    },
    query: `{
      viewer {
        scope: accounts(filter: {accountTag: $accountTag}) {
          latestRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            count
            dimensions {
              ts: datetimeHour
              __typename
            }
            __typename
          }
          lastRequest: aiGatewayRequestsAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {gateway: $gateway, datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            dimensions {
              ts: datetimeMinute
              __typename
            }
            __typename
          }
          totalRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, datetimeHour_geq: $start, datetimeHour_leq: $end}) {
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
  }),

  // Provider-level request analytics with minute-level precision
  providerRequests: (start: string, end: string, granularity: 'minute' | 'hour' = 'minute') => ({
    operationName: 'GetAIRequests',
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 10000,
      orderBy: granularity === 'minute' ? 'datetimeMinute_ASC' : 'datetimeHour_ASC'
    },
    query: `query GetAIRequests($accountTag: string, $gateway: string, $start: string, $end: string, $limit: Int, $orderBy: [String!]) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          data: aiGatewayRequestsAdaptiveGroups(
            filter: {
              gateway: $gateway, 
              metadataKeys_has: "userId", 
              error: 0, 
              ${granularity === 'minute' ? 'datetimeMinute_geq: $start, datetimeMinute_leq: $end' : 'datetimeHour_geq: $start, datetimeHour_leq: $end'}
            }, 
            orderBy: [$orderBy], 
            limit: $limit
          ) {
            count
            dimensions {
              ts: ${granularity === 'minute' ? 'datetimeMinute' : 'datetimeHour'}
              provider
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  }),

  // Model-level token analytics with minute-level precision
  modelTokens: (start: string, end: string, granularity: 'minute' | 'hour' = 'minute') => ({
    operationName: 'GetAITokens',
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 10000,
      orderBy: granularity === 'minute' ? 'datetimeMinute_ASC' : 'datetimeHour_ASC'
    },
    query: `query GetAITokens($accountTag: string, $gateway: string, $start: string, $end: string, $limit: Int, $orderBy: [String!]) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          data: aiGatewayRequestsAdaptiveGroups(
            filter: {
              gateway: $gateway, 
              metadataKeys_has: "userId", 
              error: 0, 
              ${granularity === 'minute' ? 'datetimeMinute_geq: $start, datetimeMinute_leq: $end' : 'datetimeHour_geq: $start, datetimeHour_leq: $end'}
            }, 
            orderBy: [$orderBy], 
            limit: $limit
          ) {
            count
            sum {
              uncachedTokensIn
              uncachedTokensOut
              cost
              __typename
            }
            dimensions {
              ts: ${granularity === 'minute' ? 'datetimeMinute' : 'datetimeHour'}
              provider
              model
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  }),

  // Chat-specific provider request analytics
  chatProviderRequests: (start: string, end: string, chatId: string, granularity: 'minute' | 'hour' = 'minute') => ({
    operationName: 'GetChatAIRequests',
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 10000,
      orderBy: granularity === 'minute' ? 'datetimeMinute_ASC' : 'datetimeHour_ASC'
    },
    query: `query GetChatAIRequests($accountTag: string, $gateway: string, $start: string, $end: string, $limit: Int, $orderBy: [String!]) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          data: aiGatewayRequestsAdaptiveGroups(
            filter: {
              gateway: $gateway, 
              metadataValues_has: "${chatId}", 
              error: 0, 
              ${granularity === 'minute' ? 'datetimeMinute_geq: $start, datetimeMinute_leq: $end' : 'datetimeHour_geq: $start, datetimeHour_leq: $end'}
            }, 
            orderBy: [$orderBy], 
            limit: $limit
          ) {
            count
            dimensions {
              ts: ${granularity === 'minute' ? 'datetimeMinute' : 'datetimeHour'}
              provider
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  }),

  // Chat-specific model token analytics
  chatModelTokens: (start: string, end: string, chatId: string, granularity: 'minute' | 'hour' = 'minute') => ({
    operationName: 'GetChatAITokens',
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 10000,
      orderBy: granularity === 'minute' ? 'datetimeMinute_ASC' : 'datetimeHour_ASC'
    },
    query: `query GetChatAITokens($accountTag: string, $gateway: string, $start: string, $end: string, $limit: Int, $orderBy: [String!]) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          data: aiGatewayRequestsAdaptiveGroups(
            filter: {
              gateway: $gateway, 
              metadataValues_has: "${chatId}", 
              error: 0, 
              ${granularity === 'minute' ? 'datetimeMinute_geq: $start, datetimeMinute_leq: $end' : 'datetimeHour_geq: $start, datetimeHour_leq: $end'}
            }, 
            orderBy: [$orderBy], 
            limit: $limit
          ) {
            count
            sum {
              uncachedTokensIn
              uncachedTokensOut
              cost
              __typename
            }
            dimensions {
              ts: ${granularity === 'minute' ? 'datetimeMinute' : 'datetimeHour'}
              provider
              model
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  }),

  userFiltered: (start: string, end: string) => ({
    operationName: null,
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 1
    },
    query: `{
      viewer {
        scope: accounts(filter: {accountTag: $accountTag}) {
          latestRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, metadataKeys_has: "userId", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            count
            dimensions {
              ts: datetimeHour
              __typename
            }
            __typename
          }
          lastRequest: aiGatewayRequestsAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {gateway: $gateway, metadataKeys_has: "userId", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            dimensions {
              ts: datetimeMinute
              __typename
            }
            __typename
          }
          totalRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, metadataKeys_has: "userId", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
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
  }),

  chatFiltered: (start: string, end: string) => ({
    operationName: null,
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 1
    },
    query: `{
      viewer {
        scope: accounts(filter: {accountTag: $accountTag}) {
          latestRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, metadataKeys_has: "chatId", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            count
            dimensions {
              ts: datetimeHour
              __typename
            }
            __typename
          }
          lastRequest: aiGatewayRequestsAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {gateway: $gateway, metadataKeys_has: "chatId", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            dimensions {
              ts: datetimeMinute
              __typename
            }
            __typename
          }
          totalRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, metadataKeys_has: "chatId", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
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
  }),

  specificId: (start: string, end: string, metadataValue: string) => ({
    operationName: null,
    variables: {
      accountTag: CONFIG.ACCOUNT_TAG,
      gateway: CONFIG.GATEWAY,
      start,
      end,
      limit: 1
    },
    query: `{
      viewer {
        scope: accounts(filter: {accountTag: $accountTag}) {
          latestRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, metadataValues_has: "${metadataValue}", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            count
            dimensions {
              ts: datetimeHour
              __typename
            }
            __typename
          }
          lastRequest: aiGatewayRequestsAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {gateway: $gateway, metadataValues_has: "${metadataValue}", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
            dimensions {
              ts: datetimeMinute
              __typename
            }
            __typename
          }
          totalRequests: aiGatewayRequestsAdaptiveGroups(limit: $limit, filter: {gateway: $gateway, metadataValues_has: "${metadataValue}", datetimeHour_geq: $start, datetimeHour_leq: $end}) {
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
  })
};

// Execute GraphQL query
async function executeQuery(query: any): Promise<AnalyticsResponse> {
  const response = await fetch(CONFIG.GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Enhanced analytics display functions
function processProviderRequestData(data: ProviderRequestAnalytics): ProviderSummary[] {
  const providerMap = new Map<string, { requests: number; timestamps: string[] }>();
  
  data.data.viewer.accounts[0]?.data.forEach(item => {
    const provider = item.dimensions.provider;
    if (!providerMap.has(provider)) {
      providerMap.set(provider, { requests: 0, timestamps: [] });
    }
    const providerData = providerMap.get(provider)!;
    providerData.requests += item.count;
    providerData.timestamps.push(item.dimensions.ts);
  });

  return Array.from(providerMap.entries()).map(([name, data]) => ({
    name,
    totalRequests: data.requests,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCost: 0,
    models: []
  }));
}

function processModelTokenData(data: ModelTokenAnalytics): { providers: ProviderSummary[]; models: ModelSummary[] } {
  const providerMap = new Map<string, ProviderSummary>();
  const modelMap = new Map<string, ModelSummary>();
  
  data.data.viewer.accounts[0]?.data.forEach(item => {
    const { provider, model, ts } = item.dimensions;
    const { uncachedTokensIn, uncachedTokensOut, cost } = item.sum;
    const modelKey = `${provider}::${model}`;
    
    // Update provider summary
    if (!providerMap.has(provider)) {
      providerMap.set(provider, {
        name: provider,
        totalRequests: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCost: 0,
        models: []
      });
    }
    const providerSummary = providerMap.get(provider)!;
    providerSummary.totalRequests += item.count;
    providerSummary.totalTokensIn += uncachedTokensIn;
    providerSummary.totalTokensOut += uncachedTokensOut;
    providerSummary.totalCost += cost;
    
    // Update model summary
    if (!modelMap.has(modelKey)) {
      modelMap.set(modelKey, {
        name: model,
        provider,
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        firstSeen: ts,
        lastSeen: ts
      });
    }
    const modelSummary = modelMap.get(modelKey)!;
    modelSummary.requests += item.count;
    modelSummary.tokensIn += uncachedTokensIn;
    modelSummary.tokensOut += uncachedTokensOut;
    modelSummary.cost += cost;
    modelSummary.lastSeen = ts > modelSummary.lastSeen ? ts : modelSummary.lastSeen;
    modelSummary.firstSeen = ts < modelSummary.firstSeen ? ts : modelSummary.firstSeen;
  });

  // Group models by provider
  const models = Array.from(modelMap.values());
  providerMap.forEach(provider => {
    provider.models = models.filter(m => m.provider === provider.name);
  });
  
  return { providers: Array.from(providerMap.values()), models };
}

function displayProviderSummary(providers: ProviderSummary[]): void {
  console.log('\n📊 Provider Summary');
  console.log('-'.repeat(80));
  
  const providerTable = providers.map(provider => ({
    Provider: provider.name,
    Requests: provider.totalRequests.toLocaleString(),
    'Tokens In': provider.totalTokensIn.toLocaleString(),
    'Tokens Out': provider.totalTokensOut.toLocaleString(),
    'Total Cost': `$${provider.totalCost.toFixed(6)}`,
    Models: provider.models.length
  }));
  
  console.table(providerTable);
}

function displayModelBreakdown(providers: ProviderSummary[], topN?: number): void {
  console.log('\n🎯 Model Breakdown by Provider');
  console.log('-'.repeat(80));
  
  providers.forEach(provider => {
    console.log(`\n📈 ${provider.name.toUpperCase()} Models`);
    
    let models = provider.models.sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut));
    if (topN) {
      models = models.slice(0, topN);
    }
    
    if (models.length === 0) {
      console.log('   No model data available');
      return;
    }
    
    const modelTable = models.map(model => ({
      Model: model.name,
      Requests: model.requests.toLocaleString(),
      'Tokens In': model.tokensIn.toLocaleString(),
      'Tokens Out': model.tokensOut.toLocaleString(),
      'Total Tokens': (model.tokensIn + model.tokensOut).toLocaleString(),
      'Cost': `$${model.cost.toFixed(6)}`,
      'First Seen': new Date(model.firstSeen).toLocaleString(),
      'Last Seen': new Date(model.lastSeen).toLocaleString()
    }));
    
    console.table(modelTable);
  });
}

function displayTopModels(models: ModelSummary[], topN: number): void {
  console.log(`\n🏆 Top ${topN} Models by Token Usage`);
  console.log('-'.repeat(80));
  
  const sortedModels = models
    .sort((a, b) => (b.tokensIn + b.tokensOut) - (a.tokensIn + a.tokensOut))
    .slice(0, topN);
  
  const topModelsTable = sortedModels.map((model, index) => ({
    Rank: `#${index + 1}`,
    Model: model.name,
    Provider: model.provider,
    'Total Tokens': (model.tokensIn + model.tokensOut).toLocaleString(),
    'Tokens In': model.tokensIn.toLocaleString(),
    'Tokens Out': model.tokensOut.toLocaleString(),
    'Cost': `$${model.cost.toFixed(6)}`,
    Requests: model.requests.toLocaleString()
  }));
  
  console.table(topModelsTable);
}

// Enhanced main display function
function displayResults(results: QueryResult[], options: {
  showProviders?: boolean;
  showModels?: boolean;
  topModels?: number;
}): void {
  console.log('\n🚀 Cloudflare AI Gateway Analytics Results\n');
  console.log('=' .repeat(80));

  let providerData: ProviderSummary[] = [];
  let modelData: ModelSummary[] = [];

  results.forEach(result => {
    console.log(`\n📊 ${result.name}`);
    console.log(`⏱️  Response Time: ${result.responseTime}ms`);
    console.log('-'.repeat(50));

    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
      return;
    }

    // Handle different response types
    if (result.name.includes('Provider Request Analytics')) {
      const data = result.data as ProviderRequestAnalytics;
      if (data?.data?.viewer?.accounts?.[0]?.data) {
        providerData = processProviderRequestData(data);
        const totalRequests = providerData.reduce((sum, p) => sum + p.totalRequests, 0);
        console.log(`✅ Found ${providerData.length} providers with ${totalRequests.toLocaleString()} total requests`);
      }
    } else if (result.name.includes('Model Token Analytics')) {
      const data = result.data as ModelTokenAnalytics;
      if (data?.data?.viewer?.accounts?.[0]?.data) {
        const processed = processModelTokenData(data);
        providerData = processed.providers;
        modelData = processed.models;
        const totalCost = processed.providers.reduce((sum, p) => sum + p.totalCost, 0);
        console.log(`✅ Found ${processed.providers.length} providers and ${modelData.length} models with $${totalCost.toFixed(4)} total cost`);
      }
    } else {
      // Legacy analytics display
      const data = result.data as AnalyticsResponse;
      if (!data?.data?.viewer?.scope?.[0]) {
        console.log('❌ No data available');
        return;
      }

      const scope = data.data.viewer.scope[0];
      const totalRequests = scope.totalRequests?.[0];
      const lastRequest = scope.lastRequest?.[0];
      const latestRequests = scope.latestRequests?.[0];

      if (totalRequests) {
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
        const errorRate = totalRequests.count > 0 ? ((erroredRequests / totalRequests.count) * 100).toFixed(2) : '0.00';
        const cacheHitRate = totalRequests.count > 0 ? ((cachedRequests / totalRequests.count) * 100).toFixed(2) : '0.00';

        const analytics = [
          { 
            Metric: 'Total Requests', 
            Value: totalRequests.count.toLocaleString(),
            Details: `${cachedRequests} cached, ${erroredRequests} errors`
          },
          { 
            Metric: 'Total Cost', 
            Value: `$${cost.toFixed(6)}`,
            Details: 'Estimated cost'
          },
          { 
            Metric: 'Tokens In', 
            Value: totalTokensIn.toLocaleString(),
            Details: `${uncachedTokensIn.toLocaleString()} uncached, ${cachedTokensIn.toLocaleString()} cached`
          },
          { 
            Metric: 'Tokens Out', 
            Value: totalTokensOut.toLocaleString(),
            Details: `${uncachedTokensOut.toLocaleString()} uncached, ${cachedTokensOut.toLocaleString()} cached`
          },
          { 
            Metric: 'Error Rate', 
            Value: `${errorRate}%`,
            Details: `${erroredRequests} errors out of ${totalRequests.count} requests`
          },
          { 
            Metric: 'Cache Hit Rate', 
            Value: `${cacheHitRate}%`,
            Details: `${cachedRequests} cached out of ${totalRequests.count} requests`
          }
        ];

        if (lastRequest?.dimensions?.ts) {
          analytics.push({
            Metric: 'Last Request',
            Value: new Date(lastRequest.dimensions.ts).toLocaleString(),
            Details: 'Most recent request timestamp'
          });
        }

        if (latestRequests?.count && latestRequests?.dimensions?.ts) {
          analytics.push({
            Metric: 'Latest Hour Activity',
            Value: `${latestRequests.count} requests`,
            Details: `At ${new Date(latestRequests.dimensions.ts).toLocaleString()}`
          });
        }

        console.table(analytics);
      } else {
        console.log('❌ No request data available');
      }
    }
  });

  // Display enhanced analytics if requested
  if (options.showProviders && providerData.length > 0) {
    displayProviderSummary(providerData);
  }

  if (options.showModels && providerData.length > 0) {
    displayModelBreakdown(providerData, options.topModels);
  }

  if (options.topModels && modelData.length > 0) {
    displayTopModels(modelData, options.topModels);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Analysis complete!');
}

// Parse command line arguments
function parseArgs(): { 
  userId?: string; 
  chatId?: string; 
  days?: number;
  showModels?: boolean;
  showProviders?: boolean;
  granularity?: 'minute' | 'hour';
  topModels?: number;
} {
  const args = process.argv.slice(2);
  const result: { 
    userId?: string; 
    chatId?: string; 
    days?: number;
    showModels?: boolean;
    showProviders?: boolean;
    granularity?: 'minute' | 'hour';
    topModels?: number;
  } = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--user-id':
        result.userId = args[i + 1];
        i++;
        break;
      case '--chat-id':
        result.chatId = args[i + 1];
        i++;
        break;
      case '--days':
        result.days = parseInt(args[i + 1]) || 1;
        i++;
        break;
      case '--show-models':
        result.showModels = true;
        break;
      case '--show-providers':
        result.showProviders = true;
        break;
      case '--granularity':
        const granularity = args[i + 1];
        if (granularity === 'minute' || granularity === 'hour') {
          result.granularity = granularity;
        }
        i++;
        break;
      case '--top-models':
        result.topModels = parseInt(args[i + 1]) || 10;
        i++;
        break;
    }
  }

  return result;
}

// Generate time range (using format from your examples)
function getTimeRange(days: number = 1, granularity: 'minute' | 'hour' = 'hour'): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));
  
  if (granularity === 'minute') {
    // For minute-level queries, use ISO format as shown in examples
    return {
      start: start.toISOString(),
      end: end.toISOString()
    };
  } else {
    // Use the timezone-aware format for hour-level queries
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
}

// Main function
async function main(): Promise<void> {
  try {
    console.log('🔍 Initializing configuration from environment variables...');
    initializeConfig();

    console.log(`🔧 Configuration:`);
    console.log(`   Account: ${CONFIG.ACCOUNT_TAG}`);
    console.log(`   Gateway: ${CONFIG.GATEWAY}`);
    console.log(`   Endpoint: ${CONFIG.GRAPHQL_ENDPOINT}`);
    console.log(`   Environment: ${CONFIG.IS_STAGING ? 'Staging' : 'Production'}`);
    console.log(`   Token: ${CONFIG.API_TOKEN.substring(0, 8)}... (${CONFIG.IS_STAGING ? 'AI Gateway token' : 'API token'})`);

    const args = parseArgs();
    const granularity = args.granularity || 'hour';
    const timeRange = getTimeRange(args.days || 1, granularity);
    
    console.log(`📅 Analyzing data from ${timeRange.start} to ${timeRange.end}`);
    console.log(`⚙️  Granularity: ${granularity}-level precision`);
    
    const queries: Array<{ name: string; query: any }> = [];

    // Enhanced query selection based on user input and options
    if (args.userId) {
      queries.push({
        name: `User Analytics (${args.userId})`,
        query: QUERIES.specificId(timeRange.start, timeRange.end, args.userId)
      });
      
      // Add enhanced queries if requested - using generic queries for user ID (user-specific filtering would need different implementation)
      if (args.showProviders || args.showModels) {
        queries.push(
          { name: 'User Provider Request Analytics', query: QUERIES.providerRequests(timeRange.start, timeRange.end, granularity) },
          { name: 'User Model Token Analytics', query: QUERIES.modelTokens(timeRange.start, timeRange.end, granularity) }
        );
      }
    } else if (args.chatId) {
      queries.push({
        name: `Chat Analytics (${args.chatId})`,
        query: QUERIES.specificId(timeRange.start, timeRange.end, args.chatId)
      });
      
      // Add chat-specific enhanced queries if requested
      if (args.showProviders || args.showModels) {
        queries.push(
          { name: `Chat Provider Request Analytics (${args.chatId})`, query: QUERIES.chatProviderRequests(timeRange.start, timeRange.end, args.chatId, granularity) },
          { name: `Chat Model Token Analytics (${args.chatId})`, query: QUERIES.chatModelTokens(timeRange.start, timeRange.end, args.chatId, granularity) }
        );
      }
    } else {
      // Default analytics - always include legacy queries for compatibility
      queries.push(
        { name: 'Total Gateway Analytics', query: QUERIES.totalGateway(timeRange.start, timeRange.end) },
        { name: 'User-Filtered Analytics', query: QUERIES.userFiltered(timeRange.start, timeRange.end) },
        { name: 'Chat-Filtered Analytics', query: QUERIES.chatFiltered(timeRange.start, timeRange.end) }
      );
      
      // Add enhanced queries if requested or if no specific filters are provided
      if (args.showProviders || args.showModels || args.topModels || (!args.userId && !args.chatId)) {
        queries.push(
          { name: 'Provider Request Analytics', query: QUERIES.providerRequests(timeRange.start, timeRange.end, granularity) },
          { name: 'Model Token Analytics', query: QUERIES.modelTokens(timeRange.start, timeRange.end, granularity) }
        );
      }
    }
    
    // Show configuration summary
    const configSummary = [
      `Enhanced Analytics: ${args.showProviders || args.showModels || args.topModels ? 'Enabled' : 'Disabled'}`,
      args.showProviders ? 'Provider breakdown with costs: Yes' : '',
      args.showModels ? 'Model breakdown with costs: Yes' : '',
      args.topModels ? `Top models: ${args.topModels}` : '',
      args.chatId ? `Chat-specific filtering: ${args.chatId}` : '',
    ].filter(Boolean);
    
    if (configSummary.length > 1) {
      console.log(`🔧 Configuration: ${configSummary.join(', ')}`);
    }

    console.log(`\n🚀 Executing ${queries.length} queries...\n`);

    const results: QueryResult[] = [];

    for (const { name, query } of queries) {
      console.log(`⏳ Executing: ${name}...`);
      const startTime = Date.now();
      
      try {
        const data = await executeQuery(query);
        const responseTime = Date.now() - startTime;
        
        // Debug: Log raw response for enhanced queries in debug mode
        if (import.meta.env.DEV && (name.includes('Provider') || name.includes('Model'))) {
          console.log(`🔍 Debug - ${name} raw response:`, JSON.stringify(data, null, 2).substring(0, 800) + '...');
        }
        
        results.push({
          name,
          responseTime,
          data,
        });
        
        // Enhanced success logging with data summary
        let dataSummary = '';
        if (name.includes('Provider Request Analytics') && (data as ProviderRequestAnalytics)?.data?.viewer?.accounts?.[0]?.data) {
          const providerData = (data as ProviderRequestAnalytics).data.viewer.accounts[0].data;
          const uniqueProviders = new Set(providerData.map(d => d.dimensions.provider)).size;
          const totalRequests = providerData.reduce((sum, d) => sum + d.count, 0);
          dataSummary = ` (${providerData.length} records, ${uniqueProviders} providers, ${totalRequests.toLocaleString()} requests)`;
        } else if (name.includes('Model Token Analytics') && (data as ModelTokenAnalytics)?.data?.viewer?.accounts?.[0]?.data) {
          const modelData = (data as ModelTokenAnalytics).data.viewer.accounts[0].data;
          const uniqueModels = new Set(modelData.map(d => d.dimensions.model)).size;
          const uniqueProviders = new Set(modelData.map(d => d.dimensions.provider)).size;
          const totalCost = modelData.reduce((sum, d) => sum + d.sum.cost, 0);
          dataSummary = ` (${modelData.length} records, ${uniqueModels} models, ${uniqueProviders} providers, $${totalCost.toFixed(4)} total cost)`;
        }
        
        console.log(`✅ ${name} completed in ${responseTime}ms${dataSummary}`);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        console.log(`❌ ${name} failed in ${responseTime}ms`);
        console.error(`   Error details:`, error);
        
        results.push({
          name,
          responseTime,
          data: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    displayResults(results, {
      showProviders: args.showProviders,
      showModels: args.showModels,
      topModels: args.topModels
    });
    
    // Show helpful usage tips if running with basic options
    if (!args.showProviders && !args.showModels && !args.topModels && !args.userId && !args.chatId) {
      console.log('\n💡 Pro Tips:');
      console.log('   • Use --show-providers to see provider breakdown with costs');
      console.log('   • Use --show-models to see model-level analytics with costs');
      console.log('   • Use --top-models 5 to see top 5 models by usage and cost');
      console.log('   • Use --granularity minute for minute-level precision');
      console.log('   • Use --chat-id <id> for chat-specific provider/model analytics');
      console.log('   • Use --user-id <id> for user-specific analytics (note: enhanced analytics are global)');
    }

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);