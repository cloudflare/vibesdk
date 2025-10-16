import { ACIService } from './aci.service';

// ACI Function Provider for VibeSDK AI Agent
export class ACIFunctionProvider {
  private aci: ACIService;
  private linkedAccountOwnerId: string;

  constructor(aciApiKey: string, aciApiUrl?: string, linkedAccountOwnerId = 'Admin') {
    this.aci = new ACIService({ apiKey: aciApiKey, baseUrl: aciApiUrl });
    this.linkedAccountOwnerId = linkedAccountOwnerId;
  }

  /**
   * Get available ACI functions for LLM integration
   */
  async getAvailableFunctions(intent?: string): Promise<any[]> {
    try {
      const functions = await this.aci.searchFunctions({
        intent: intent || 'general',
        allowedOnly: false,
        format: 'openai',
        limit: 20,
      });

      return functions.map(func => ({
        name: func.name || func.function_name,
        description: func.description,
        parameters: func.parameters || {},
      }));
    } catch (error) {
      console.error('Error getting ACI functions:', error);
      return [];
    }
  }

  /**
   * Execute an ACI function
   */
  async executeFunction(functionName: string, args: Record<string, any>): Promise<any> {
    try {
      const result = await this.aci.executeFunction({
        functionName,
        functionArguments: args,
        linkedAccountOwnerId: this.linkedAccountOwnerId,
      });

      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error || 'Function execution failed');
      }
    } catch (error) {
      console.error(`Error executing ACI function ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Search for relevant apps based on user intent
   */
  async searchAppsForIntent(intent: string): Promise<any[]> {
    try {
      return await this.aci.searchApps({
        intent,
        includeFunctions: true,
        limit: 10,
      });
    } catch (error) {
      console.error('Error searching ACI apps:', error);
      return [];
    }
  }

  /**
   * Get function definition for a specific function
   */
  async getFunctionDefinition(functionName: string): Promise<any> {
    try {
      return await this.aci.getFunctionDefinition(functionName, 'openai');
    } catch (error) {
      console.error(`Error getting function definition for ${functionName}:`, error);
      return null;
    }
  }
}

// Factory function to create ACI provider from environment
export function createACIFunctionProvider(): ACIFunctionProvider | null {
  const apiKey = process.env.ACI_API_KEY;
  const apiUrl = process.env.ACI_API_URL;

  if (!apiKey) {
    console.warn('ACI_API_KEY not found, ACI functions will not be available');
    return null;
  }

  return new ACIFunctionProvider(apiKey, apiUrl, 'Admin');
}
