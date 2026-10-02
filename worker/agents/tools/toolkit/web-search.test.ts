import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTools, withRenderer } from '../customTools';
import { executeToolCallsWithDependencies } from '../../inferutils/toolExecution';
import type { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { createLogger } from '../../../logger';

declare const __VIBESDK_SEARCH_LIVE__: boolean;

const bindings = vi.hoisted(() => ({ WEB_SEARCH_PROVIDER: undefined as string | undefined, SERPAPI_KEY: '' }));
vi.mock('cloudflare:workers', async importOriginal => ({
	...await importOriginal<typeof import('cloudflare:workers')>(), env: bindings,
}));

const query = 'Cloudflare Workers documentation';
const responseData = { results: [
	{ title: 'Workers docs', url: 'https://developers.cloudflare.com/workers/', excerpts: ['Build serverless applications.'] },
	{ title: 'Durable Objects', url: 'https://developers.cloudflare.com/durable-objects/', excerpts: ['Coordinate state.'] },
] };

type RequestRecord = { method: string; rpc?: string; headers: Headers; params?: Record<string, unknown> };
let requests: RequestRecord[];
let callResult: Record<string, unknown>;
let encoding: 'json' | 'sse';

function mockMcp() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		expect(String(input)).toBe('https://search.parallel.ai/mcp');
		const headers = new Headers(init?.headers);
		const method = init?.method || 'GET';
		if (method === 'GET') {
			requests.push({ method, headers });
			return new Response(null, { status: 405 });
		}
		const body = JSON.parse(String(init?.body)) as { id?: number; method: string; params?: Record<string, unknown> };
		requests.push({ method, headers, rpc: body.method, params: body.params });
		if (body.method.startsWith('notifications/')) return new Response(null, { status: 202 });
		const result = body.method === 'initialize'
			? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'search-fixture', version: '1' } }
			: body.method === 'tools/list'
				? { tools: [{ name: 'web_search', inputSchema: { type: 'object' } }] }
				: callResult;
		const message = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
		return encoding === 'sse'
			? new Response(`event: message\ndata: ${message}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
			: new Response(message, { headers: { 'Content-Type': 'application/json' } });
	});
}

async function execute(args: Record<string, unknown>) {
	// Exercise the maintained registry, canonical executor and native conversation result.
	const messages: string[] = [];
	const tools = withRenderer(buildTools({ getBehavior: () => 'agentic' } as ICodingAgent, createLogger('search-test'), () => {}, () => {}), () => {}, async message => {
		messages.push(String(message.content));
	});
	const tool = tools.find(tool => tool.name === 'web_search');
	expect(tool).toBeDefined();
	const parsed = tool!.schema.parse(args);
	const [result] = await executeToolCallsWithDependencies([{
		id: 'search-1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify(parsed) },
	}], tools);
	expect(messages).toEqual([JSON.stringify(result.result)]);
	return result.result as { content?: string; error?: string };
}

beforeEach(() => {
	bindings.WEB_SEARCH_PROVIDER = undefined;
	bindings.SERPAPI_KEY = '';
	requests = [];
	callResult = { content: [{ type: 'text', text: JSON.stringify(responseData) }] };
	encoding = 'json';
});
afterEach(() => vi.restoreAllMocks());

describe('native web_search provider selection', () => {
	it.each([undefined, 'serpapi', 'unknown'])('retains the missing-key SerpAPI behavior for %s', async provider => {
		bindings.WEB_SEARCH_PROVIDER = provider;
		const fetch = vi.spyOn(globalThis, 'fetch');
		expect((await execute({ query })).content).toContain('Web search requires SerpAPI key');
		expect(fetch).not.toHaveBeenCalled();
	});
	it('retains credential-selected SerpAPI and its authentication errors', async () => {
		bindings.SERPAPI_KEY = 'test-serp-key';
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
		expect((await execute({ query })).content).toContain('Search failed: API error');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(String(fetch.mock.calls[0][0])).toContain('https://serpapi.com/search');
	});
	it.each(['json', 'sse'] as const)('returns links and excerpts through the native executor over %s responses, without credentials', async format => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		encoding = format;
		mockMcp();
		const result = await execute({ query, num_results: 1 });
		expect(result.content).toContain('Build serverless applications.');
		expect(result.content).toContain('https://developers.cloudflare.com/workers/');
		expect(result.content).not.toContain('Durable Objects');
		expect(requests.filter(r => r.rpc).map(r => r.rpc)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
		expect(requests.find(r => r.rpc === 'tools/call')?.params).toEqual({ name: 'web_search', arguments: { objective: query, search_queries: [query] } });
		for (const request of requests) {
			expect(request.headers.get('User-Agent')).toBe('VibeSDK/1.5.0 (https://github.com/cloudflare/vibesdk)');
			expect(request.headers.has('Authorization')).toBe(false);
			expect(request.headers.has('x-api-key')).toBe(false);
		}
	});
	it('accepts structured results and explicitly overrides a configured SerpAPI key', async () => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		bindings.SERPAPI_KEY = 'test-serp-key';
		callResult = { content: [], structuredContent: responseData };
		mockMcp();
		expect((await execute({ query })).content).toContain('Coordinate state.');
	});
	it.each([
		{ content: [{ type: 'text', text: 'remote error' }], isError: true },
		{ content: [{ type: 'text', text: 'not json' }] },
		{ content: [], structuredContent: { unexpected: true } },
	])('reports tool and malformed-result errors without changing providers', async result => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		callResult = result;
		mockMcp();
		expect((await execute({ query })).content).toContain('Parallel search failed: API error');
	});
	it('reports HTTP failure without fallback', async () => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));
		expect((await execute({ query })).content).toContain('Parallel search failed: API error');
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it('uses the same deadline for initialization and tool discovery, aborting stalled I/O', async () => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		const controller = new AbortController();
		vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
			expect(milliseconds).toBe(15000);
			return controller.signal;
		});
		const fetch = mockMcp();
		const fixture = fetch.getMockImplementation()!;
		fetch.mockImplementation(async (input, init) => {
			const body = init?.body ? JSON.parse(String(init.body)) as { method: string } : undefined;
			if (body?.method !== 'tools/list') return fixture(input, init);
			return new Promise<Response>((_, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('Deadline exceeded', 'TimeoutError')), { once: true });
				controller.abort(new DOMException('Deadline exceeded', 'TimeoutError'));
			});
		});
		expect((await execute({ query })).content).toContain('Parallel search failed: timeout');
	});
	it('preserves direct URL fetching even when Parallel is selected', async () => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<p>Direct page content</p>', { headers: { 'Content-Type': 'text/html' } }));
		expect((await execute({ query, url: 'https://example.com/page' })).content).toContain('Direct page content');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toBe('https://example.com/page');
	});

	it.runIf(__VIBESDK_SEARCH_LIVE__)('live keyless search through the native registry and conversation result', async () => {
		bindings.WEB_SEARCH_PROVIDER = 'parallel';
		const realFetch = globalThis.fetch;
		const observed: Array<{ url: string; method: string; rpc?: string; userAgent: string | null; authorization: boolean }> = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const headers = new Headers(init?.headers);
			const body = init?.body ? JSON.parse(String(init.body)) as { method?: string } : undefined;
			observed.push({ url: String(input), method: init?.method || 'GET', rpc: body?.method,
				userAgent: headers.get('User-Agent'), authorization: headers.has('Authorization') || headers.has('x-api-key') });
			return realFetch(input, init);
		});
		const result = await execute({ query, num_results: 2 });
		expect(result.content).toContain('Search results for');
		expect(result.content).toContain('https://developers.cloudflare.com/');
		expect(observed.some(request => request.rpc === 'tools/list')).toBe(true);
		expect(observed.some(request => request.rpc === 'tools/call')).toBe(true);
		expect(observed.every(request => !request.authorization && request.userAgent?.startsWith('VibeSDK/'))).toBe(true);
		console.log('KEYLESS_EVIDENCE', JSON.stringify({ query, provider: bindings.WEB_SEARCH_PROVIDER, serpapiKeyPresent: false, requests: observed, finalAnswer: result.content }));
	}, 20000);
});
