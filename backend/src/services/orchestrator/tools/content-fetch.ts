import { ToolDefinition } from '../types';
import { ContentFetcherService } from '../../content-fetcher';

/**
 * URL content fetching tool.
 * Wraps the existing ContentFetcherService to let the agent loop
 * fetch and summarize web page content.
 */

export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description: 'Fetch and extract content from a URL (articles, web pages, etc.)',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
    },
    required: ['url'],
  },
};

/**
 * Create the executor that uses ContentFetcherService to fetch a URL.
 */
export function createFetchUrlExecutor(contentFetcher: ContentFetcherService) {
  return async (args: Record<string, any>): Promise<string> => {
    const url = String(args.url || '').trim();
    if (!url) {
      return 'Error: No URL provided.';
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return `Error: Invalid URL "${url}".`;
    }

    try {
      const fetched = await contentFetcher.fetch(url);

      const parts: string[] = [];
      parts.push(`**${fetched.title}**`);
      parts.push(`URL: ${fetched.url}`);
      parts.push(`Type: ${fetched.type}`);

      if (fetched.description) {
        parts.push(`\nDescription: ${fetched.description}`);
      }

      if (fetched.metadata.author) {
        parts.push(`Author: ${fetched.metadata.author}`);
      }
      if (fetched.metadata.publishedDate) {
        parts.push(`Published: ${fetched.metadata.publishedDate}`);
      }
      if (fetched.metadata.siteName) {
        parts.push(`Site: ${fetched.metadata.siteName}`);
      }

      // GitHub-specific
      if (fetched.type === 'github') {
        if (fetched.metadata.repoName) parts.push(`Repo: ${fetched.metadata.repoName}`);
        if (fetched.metadata.stars) parts.push(`Stars: ${fetched.metadata.stars}`);
        if (fetched.metadata.language) parts.push(`Language: ${fetched.metadata.language}`);
      }

      if (fetched.content) {
        // Truncate content to a reasonable size for the LLM context
        const maxLen = 3000;
        const content = fetched.content.length > maxLen
          ? fetched.content.substring(0, maxLen) + '... [truncated]'
          : fetched.content;
        parts.push(`\nContent:\n${content}`);
      }

      return parts.join('\n');
    } catch (err) {
      return `Error fetching URL: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
}
