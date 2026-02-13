import { ToolDefinition } from '../types';

/**
 * Web search tool definition.
 *
 * For Gemini: web search is built-in via grounding (handled in the gemini provider).
 * This tool is the FALLBACK for non-Gemini providers that need web search results.
 *
 * Uses DuckDuckGo's HTML search endpoint and scrapes the result snippets.
 */

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for current information, news, prices, weather, etc.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
};

/**
 * Execute a web search via DuckDuckGo HTML and return formatted results.
 * Falls back to the instant answer API if HTML parsing fails.
 */
export async function executeWebSearch(args: Record<string, any>): Promise<string> {
  const query = String(args.query || '').trim();
  if (!query) {
    return 'Error: No search query provided.';
  }

  try {
    // Try DuckDuckGo HTML search first
    const results = await searchDuckDuckGoHtml(query);
    if (results.length > 0) {
      return formatResults(query, results);
    }

    // Fallback to instant answer API
    const instant = await searchDuckDuckGoInstant(query);
    if (instant) {
      return instant;
    }

    return `No results found for: "${query}"`;
  } catch (error) {
    return `Search error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search DuckDuckGo HTML endpoint and parse result snippets.
 */
async function searchDuckDuckGoHtml(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MARVIN/1.0)',
      'Accept': 'text/html',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseHtmlResults(html).slice(0, 5);
}

/**
 * Parse DuckDuckGo HTML search results.
 * The HTML contains result blocks with class "result" or "web-result".
 */
function parseHtmlResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks: each has a link (<a class="result__a">) and snippet (<a class="result__snippet">)
  const resultBlockRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = resultBlockRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const title = stripHtml(match[2]).trim();
    const snippet = stripHtml(match[3]).trim();

    if (!title || !rawUrl) continue;

    // DuckDuckGo wraps URLs in a redirect; extract the actual URL
    const actualUrl = extractDdgUrl(rawUrl);

    results.push({ title, url: actualUrl, snippet });
  }

  // Fallback: try simpler pattern if the above didn't match
  if (results.length === 0) {
    const simpleLinkRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = simpleLinkRegex.exec(html)) !== null) {
      const rawUrl = match[1];
      const title = stripHtml(match[2]).trim();
      if (!title || !rawUrl || rawUrl.startsWith('/') || rawUrl.includes('duckduckgo.com')) continue;

      const actualUrl = extractDdgUrl(rawUrl);
      results.push({ title, url: actualUrl, snippet: '' });
    }
  }

  return results;
}

/**
 * DuckDuckGo instant answer API fallback.
 */
async function searchDuckDuckGoInstant(query: string): Promise<string | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MARVIN/1.0)' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data = await response.json() as any;

  const parts: string[] = [];

  if (data.AbstractText) {
    parts.push(`**${data.Heading || query}**`);
    parts.push(data.AbstractText);
    if (data.AbstractURL) {
      parts.push(`Source: ${data.AbstractURL}`);
    }
  }

  if (data.Answer) {
    parts.push(`Answer: ${data.Answer}`);
  }

  // Include related topics as additional results
  if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
    const topics = data.RelatedTopics
      .filter((t: any) => t.Text && t.FirstURL)
      .slice(0, 3);

    if (topics.length > 0) {
      parts.push('\nRelated:');
      for (const topic of topics) {
        parts.push(`- ${topic.Text}\n  ${topic.FirstURL}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

function formatResults(query: string, results: SearchResult[]): string {
  const lines: string[] = [`Search results for: "${query}"\n`];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. **${r.title}**`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push(`   ${r.url}`);
    lines.push('');
  }

  return lines.join('\n');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the real URL from a DuckDuckGo redirect link.
 * DDG wraps URLs like: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&...
 */
function extractDdgUrl(rawUrl: string): string {
  try {
    if (rawUrl.includes('uddg=')) {
      const urlObj = new URL(rawUrl, 'https://duckduckgo.com');
      const actual = urlObj.searchParams.get('uddg');
      if (actual) return actual;
    }
  } catch {
    // Fall through to return raw URL
  }
  return rawUrl;
}
