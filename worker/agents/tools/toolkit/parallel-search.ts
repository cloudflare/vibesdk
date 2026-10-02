import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { z } from 'zod';

const searchResponseSchema = z.object({
	results: z.array(z.object({
		url: z.string(),
		title: z.string().nullish(),
		excerpts: z.array(z.string()).nullish(),
	})),
});

/** Anonymous Streamable HTTP search; no credentials or automatic fallback. */
export async function performParallelSearch(query: string, numResults: number): Promise<string> {
	// One deadline covers initialization, discovery, search and response reading.
	const signal = AbortSignal.timeout(15000);
	const client = new Client({ name: 'vibesdk', version: '1.5.0' }, {
		jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
	});
	const transport = new StreamableHTTPClientTransport(new URL('https://search.parallel.ai/mcp'), {
		requestInit: { headers: { 'User-Agent': 'VibeSDK/1.5.0 (https://github.com/cloudflare/vibesdk)' } },
		fetch: (input, init) => fetch(input, {
			...init,
			signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
		}),
	});
	const options = { signal, timeout: 15000 };
	try {
		await client.connect(transport, options);
		const tools = await client.listTools({}, options);
		if (!tools.tools.some(tool => tool.name === 'web_search')) {
			throw new Error('Search tool unavailable');
		}
		const result = CallToolResultSchema.parse(await client.callTool({
			name: 'web_search',
			arguments: { objective: query, search_queries: [query] },
		}, undefined, options));
		if (result.isError) throw new Error('Search tool failed');
		const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
		const data = searchResponseSchema.parse(result.structuredContent ?? JSON.parse(text));
		const limit = Number.isFinite(numResults) ? Math.max(1, Math.min(Math.floor(numResults), 10)) : 5;
		const results = data.results.slice(0, limit).map((result, index) =>
			`${index + 1}. **${result.title || result.url}**\n${(result.excerpts ?? []).join('\n')}\nLink: ${result.url}`
		);
		return results.length
			? `🔍 Search results for "${query}":\n\n${results.join('\n\n')}`
			: `No results found for "${query}".`;
	} catch {
		// Keep the existing content result shape, without leaking remote diagnostics.
		return `Parallel search failed: ${signal.aborted ? 'timeout' : 'API error'}. Try: https://www.google.com/search?q=${encodeURIComponent(query)}`;
	} finally {
		await client.close();
	}
}
