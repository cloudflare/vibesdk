import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { createLogger } from '../../logger';
import { MCPServerConfig } from './types';

const logger = createLogger('MCPManager');

const MCP_SERVERS: MCPServerConfig[] = [
	// {
	// 	name: 'cloudflare-docs',
	// 	sseUrl: 'https://docs.mcp.cloudflare.com/sse',
	// },
];

/**
 * MCP Manager - Based on the reference implementation from vite-cfagents-runner
 * Manages connections to multiple MCP servers and provides unified tool access
 */
export class MCPManager {
	private clients: Map<string, Client> = new Map();
	private toolMap: Map<string, string> = new Map();
	private initialized = false;

	async initialize() {
		if (this.initialized) return;

		logger.info('Initializing MCP manager...');
		for (const serverConfig of MCP_SERVERS) {
			try {
				const transport = new SSEClientTransport(
					new URL(serverConfig.sseUrl),
				);

				const client = new Client(
					{
						name: 'cloudflare-agent',
						version: '1.0.0',
					},
					{
						capabilities: {},
					},
				);
                logger.info(`Connecting to MCP server ${serverConfig.name}, ${serverConfig.sseUrl}`);
				await client.connect(transport, {timeout: 500, maxTotalTimeout: 500});
                logger.info(`Connected to MCP server ${serverConfig.name}`);
				this.clients.set(serverConfig.name, client);

				const toolsResult = await client.listTools();

				if (toolsResult?.tools) {
					for (const tool of toolsResult.tools) {
						this.toolMap.set(tool.name, serverConfig.name);
					}
				}

				logger.info(
					`Connected to MCP server ${serverConfig.name}, found ${toolsResult?.tools?.length || 0} tools`,
				);
			} catch (error) {
				logger.error(
					`Failed to connect to MCP server ${serverConfig.name}:`,
					error,
				);
			}
		}

		this.initialized = true;
		logger.info(
			`MCP manager initialized with ${this.clients.size} active connections`,
		);
	}

	async getToolDefinitions() {
		await this.initialize();
		const allTools = [];

		for (const [serverName, client] of this.clients.entries()) {
			try {
				const toolsResult = await client.listTools();

				if (toolsResult?.tools) {
					for (const tool of toolsResult.tools) {
						allTools.push({
							type: 'function' as const,
							function: {
								name: tool.name,
								description: tool.description || '',
								parameters: tool.inputSchema || {
									type: 'object',
									properties: {},
									required: [],
								},
							},
						});
					}
				}
			} catch (error) {
				logger.error(`Error getting tools from ${serverName}:`, error);
			}
		}

		return allTools;
	}

	async executeTool(
		toolName: string,
		args: Record<string, unknown>,
	): Promise<string> {
		await this.initialize();

		const serverName = this.toolMap.get(toolName);
		if (!serverName) {
			throw new Error(`Tool ${toolName} not found in any MCP server`);
		}

		const client = this.clients.get(serverName);
		if (!client) {
			throw new Error(`Client for server ${serverName} not available`);
		}

		try {
			const result = await client.callTool({
				name: toolName,
				arguments: args,
			});

			if (result.isError) {
				throw new Error(
					`Tool execution failed: ${Array.isArray(result.content) ? result.content.map((c: { text: string }) => c.text).join('\n') : 'Unknown error'}`,
				);
			}

			if (Array.isArray(result.content)) {
				return result.content
					.filter((c: { type: string }) => c.type === 'text')
					.map((c: { text: string }) => c.text)
					.join('\n');
			}

			return 'No content returned';
		} catch (error) {
			throw new Error(`Tool execution failed: ${String(error)}`);
		}
	}

	hasToolAvailable(toolName: string): boolean {
		return this.toolMap.has(toolName);
	}

	getAvailableToolNames(): string[] {
		return Array.from(this.toolMap.keys());
	}

	async shutdown(): Promise<void> {
		logger.info('Shutting down MCP manager...');

		// MCP SDK handles cleanup automatically
		this.clients.clear();
		this.toolMap.clear();
		this.initialized = false;

		logger.info('MCP manager shutdown complete');
	}
}

// Singleton instance
export const mcpManager = new MCPManager();
