import { z } from 'zod';

// ACI.dev API Types
const AppBasicSchema = z.object({
  name: z.string(),
  display_name: z.string(),
  description: z.string(),
  categories: z.array(z.string()),
});

const AppDetailsSchema = z.object({
  name: z.string(),
  display_name: z.string(),
  description: z.string(),
  categories: z.array(z.string()),
  functions: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
});

const FunctionExecutionResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type AppBasic = z.infer<typeof AppBasicSchema>;
export type AppDetails = z.infer<typeof AppDetailsSchema>;
export type FunctionExecutionResult = z.infer<typeof FunctionExecutionResultSchema>;

// ACI.dev Service Configuration
interface ACIConfig {
  apiKey: string;
  baseUrl?: string;
}

export class ACIService {
  private config: ACIConfig;
  private baseUrl: string;

  constructor(config: ACIConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://aci-api.assista.dev/v1';
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey, // Use X-API-Key header for ACI.dev
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { detail: errorText };
      }
      throw new Error(`ACI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    return response.json();
  }

  /**
   * Search for apps based on intent
   */
  async searchApps(params: {
    intent?: string;
    allowedAppsOnly?: boolean;
    includeFunctions?: boolean;
    categories?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<AppBasic[]> {
    const queryParams = new URLSearchParams();

    if (params.intent) queryParams.append('intent', params.intent);
    if (params.allowedAppsOnly !== undefined) queryParams.append('allowed_apps_only', params.allowedAppsOnly.toString());
    if (params.includeFunctions !== undefined) queryParams.append('include_functions', params.includeFunctions.toString());
    if (params.categories) queryParams.append('categories', params.categories.join(','));
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const data = await this.makeRequest(`/apps/search?${queryParams}`);
    return z.array(AppBasicSchema).parse(data);
  }

  /**
   * Get detailed information about an app
   */
  async getAppDetails(appName: string): Promise<AppDetails> {
    const data = await this.makeRequest(`/v1/apps/${appName}`);
    return AppDetailsSchema.parse(data);
  }

  /**
   * Search for functions across apps
   */
  async searchFunctions(params: {
    appNames?: string[];
    intent?: string;
    allowedOnly?: boolean;
    format?: 'openai' | 'anthropic' | 'basic';
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    const queryParams = new URLSearchParams();

    if (params.appNames) queryParams.append('app_names', params.appNames.join(','));
    if (params.allowedOnly !== undefined) queryParams.append('allowed_only', params.allowedOnly.toString());
    if (params.format) queryParams.append('format', params.format);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const data = await this.makeRequest(`/v1/functions/search?${queryParams}`);
    return data as any[];
  }

  /**
   * Get function definition for LLM integration
   */
  async getFunctionDefinition(functionName: string, format: 'openai' | 'anthropic' | 'basic' = 'openai'): Promise<any> {
    const data = await this.makeRequest(`/functions/${functionName}/definition?format=${format}`);
    return data;
  }

  /**
   * Execute a function
   */
  async executeFunction(params: {
    functionName: string;
    functionArguments: Record<string, any>;
    linkedAccountOwnerId: string;
  }): Promise<FunctionExecutionResult> {
    const data = await this.makeRequest('/v1/functions/execute', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    return FunctionExecutionResultSchema.parse(data);
  }

  /**
   * Link an account for authentication
   */
  async linkAccount(params: {
    appName: string;
    linkedAccountOwnerId: string;
    securityScheme: 'api_key' | 'oauth2' | 'no_auth';
    apiKey?: string;
    afterOauth2LinkRedirectUrl?: string;
  }): Promise<any> {
    const data = await this.makeRequest('/v1/linked-accounts/link', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    return data;
  }

  /**
   * List linked accounts
   */
  async listLinkedAccounts(params: {
    appName?: string;
    linkedAccountOwnerId?: string;
  } = {}): Promise<any[]> {
    const queryParams = new URLSearchParams();

    if (params.appName) queryParams.append('app_name', params.appName);
    if (params.linkedAccountOwnerId) queryParams.append('linked_account_owner_id', params.linkedAccountOwnerId);

    const data = await this.makeRequest(`/linked-accounts?${queryParams}`);
    return data as any[];
  }
}
