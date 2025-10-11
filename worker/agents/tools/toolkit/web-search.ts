import { env } from 'cloudflare:workers'
import { ToolDefinition } from '../types';

interface SerpApiResponse {
    knowledge_graph?: {
        title?: string;
        description?: string;
        source?: { link?: string };
    };
    answer_box?: {
        answer?: string;
        snippet?: string;
        title?: string;
        link?: string;
    };
    organic_results?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
    }>;
    local_results?: Array<{
        title?: string;
        address?: string;
        phone?: string;
        rating?: number;
    }>;
    error?: string;
}


const createSearchUrl = (query: string, apiKey: string, numResults: number) => {
    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('num', Math.min(numResults, 10).toString());
    return url.toString();
};

const formatSearchResults = (
    data: SerpApiResponse,
    query: string,
    numResults: number,
): string => {
    const results: string[] = [];

    // Knowledge graph
    if (data.knowledge_graph?.title && data.knowledge_graph.description) {
        results.push(
            `**${data.knowledge_graph.title}**\n${data.knowledge_graph.description}`,
        );
        if (data.knowledge_graph.source?.link)
            results.push(`Source: ${data.knowledge_graph.source.link}`);
    }

    // Answer box
    if (data.answer_box) {
        const { answer, snippet, title, link } = data.answer_box;
        if (answer) results.push(`**Answer**: ${answer}`);
        else if (snippet) results.push(`**${title || 'Answer'}**: ${snippet}`);
        if (link) results.push(`Source: ${link}`);
    }

    // Organic results
    if (data.organic_results?.length) {
        results.push('\n**Search Results:**');
        data.organic_results.slice(0, numResults).forEach((result, index) => {
            if (result.title && result.link) {
                const text = [`${index + 1}. **${result.title}**`];
                if (result.snippet) text.push(`   ${result.snippet}`);
                text.push(`   Link: ${result.link}`);
                results.push(text.join('\n'));
            }
        });
    }

    // Local results
    if (data.local_results?.length) {
        results.push('\n**Local Results:**');
        data.local_results.slice(0, 3).forEach((result, index) => {
            if (result.title) {
                const text = [`${index + 1}. **${result.title}**`];
                if (result.address) text.push(`   Address: ${result.address}`);
                if (result.phone) text.push(`   Phone: ${result.phone}`);
                if (result.rating)
                    text.push(`   Rating: ${result.rating} stars`);
                results.push(text.join('\n'));
            }
        });
    }

    return results.length
        ? `🔍 Search results for "${query}":\n\n${results.join('\n\n')}`
        : `No results found for "${query}". Try: https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

async function performWebSearch(
    query: string,
    numResults = 5,
): Promise<string> {
    const apiKey = env.SERPAPI_KEY;
    if (!apiKey) {
        return `🔍 Web search requires SerpAPI key. Get one at https://serpapi.com/\nFallback: https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    try {
        const response = await fetch(
            createSearchUrl(query, apiKey, numResults),
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; WebBot/1.0)',
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(15000),
            },
        );

        if (!response.ok)
            throw new Error(`SerpAPI returned ${response.status}`);

        const data: SerpApiResponse = await response.json();
        if (data.error) throw new Error(`SerpAPI error: ${data.error}`);

        return formatSearchResults(data, query, numResults);
    } catch (error) {
        const isTimeout =
            error instanceof Error && error.message.includes('timeout');
        const fallback = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        return `Search failed: ${isTimeout ? 'timeout' : 'API error'}. Try: ${fallback}`;
    }
}

const extractTextFromHtml = (html: string): string => {
    // Multi-pass approach to handle nested/malformed tags
    let sanitized = html;
    let previousLength: number;
    
    // Keep removing script/style/noscript tags until no more are found
    do {
        previousLength = sanitized.length;
        sanitized = sanitized.replace(
            /<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi,
            ''
        );
    } while (sanitized.length < previousLength);
    
    // Keep removing all HTML tags until no more are found
    do {
        previousLength = sanitized.length;
        sanitized = sanitized.replace(/<[^>]*>/g, ' ');
    } while (sanitized.length !== previousLength);
    
    // Decode HTML entities to prevent encoded script injection
    sanitized = sanitized
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => 
            String.fromCharCode(parseInt(hex, 16))
        )
        .replace(/&#(\d+);/g, (_, dec) => 
            String.fromCharCode(parseInt(dec, 10))
        )
        .replace(/&amp;/g, '&');
    
    // Final cleanup of whitespace
    return sanitized.replace(/\s+/g, ' ').trim();
};

async function fetchWebContent(url: string): Promise<string> {
    try {
        new URL(url); // Validate
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebBot/1.0)' },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/'))
            throw new Error('Unsupported content type');

        const html = await response.text();
        const text = extractTextFromHtml(html);

        return text.length
            ? `Content from ${url}:\n\n${text.slice(0, 4000)}${text.length > 4000 ? '...' : ''}`
            : `No readable content found at ${url}`;
    } catch (error) {
        throw new Error(
            `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
    }
}

// Define the argument and result types for the web search tool
type WebSearchArgs = {
    query?: string;
    url?: string; 
    num_results?: number;
};

type WebSearchResult = { content?: string; error?: string }

const toolWebSearch = async (args: WebSearchArgs): Promise<WebSearchResult> => {
    const { query, url, num_results = 5 } = args;
    if (typeof url === 'string') {
        const content = await fetchWebContent(url);
        return { content };
    }
    if (typeof query === 'string') {
        const content = await performWebSearch(
            query,
            num_results as number,
        );
        return { content };
    }
    return { error: 'Either query or url parameter is required' };
};

export const toolWebSearchDefinition: ToolDefinition<WebSearchArgs, WebSearchResult> = {
    implementation: toolWebSearch,
    type: 'function' as const,
    function: {
        name: 'web_search',
        description:
            'Search the web using Google or fetch content from a specific URL',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query for Google search',
                },
                url: {
                    type: 'string',
                    description:
                        'Specific URL to fetch content from (alternative to search)',
                },
                num_results: {
                    type: 'number',
                    description:
                        'Number of search results to return (default: 5, max: 10)',
                    default: 5,
                },
            },
            required: [],
        },
    },
};
