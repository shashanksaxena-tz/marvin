import * as cheerio from 'cheerio';

/**
 * Structured content extracted from a URL.
 */
export interface FetchedContent {
  url: string;
  title: string;
  description: string;
  content: string;
  type: 'article' | 'github' | 'social' | 'video' | 'other';
  metadata: {
    siteName?: string;
    author?: string;
    publishedDate?: string;
    images: string[];
    ogData: Record<string, string>;
    type: 'article' | 'github' | 'social' | 'video' | 'other';
    tags?: string[];
    /** GitHub-specific fields */
    repoName?: string;
    repoDescription?: string;
    stars?: string;
    language?: string;
    /** Social-specific fields */
    tweetText?: string;
    postCaption?: string;
  };
  fetchedAt: string;
}

/**
 * Content fetching service that extracts structured data from URLs.
 * Supports articles, GitHub repos, social media, and general web pages.
 */
export class ContentFetcherService {
  private readonly userAgent =
    'Mozilla/5.0 (compatible; MARVIN/1.0; +https://github.com/marvin-assistant)';

  /**
   * Fetch and extract structured content from a URL.
   *
   * @param url - The URL to fetch
   * @returns Structured content object
   * @throws Error if fetching or parsing fails
   */
  async fetch(url: string): Promise<FetchedContent> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        // Non-HTML content - return minimal info
        return {
          url,
          title: url,
          description: `Non-HTML content (${contentType})`,
          content: '',
          type: 'other',
          metadata: { type: 'other', images: [], ogData: {} },
          fetchedAt: new Date().toISOString(),
        };
      }

      const html = await response.text();
      return this.parseHtml(url, html);
    } catch (error) {
      throw new Error(
        `Failed to fetch content from ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse HTML and extract structured content.
   */
  private parseHtml(url: string, html: string): FetchedContent {
    const $ = cheerio.load(html);

    // Remove script, style, and nav elements
    $('script, style, nav, header, footer, iframe, noscript').remove();

    const type = this.detectContentType(url, $);
    const title = this.extractTitle($);
    const description = this.extractDescription($);
    const mainText = this.extractMainText($, type);
    const ogData = this.extractOgData($);
    const images = this.extractImages($);
    const siteSpecific = this.extractSiteSpecific(url, $, type);

    return {
      url,
      title,
      description,
      content: mainText.substring(0, 5000), // Cap at 5000 chars
      type,
      metadata: {
        siteName: this.extractMeta($, 'og:site_name'),
        author: this.extractAuthor($),
        publishedDate: this.extractMeta($, 'article:published_time')
          || this.extractMeta($, 'datePublished'),
        images,
        ogData,
        type,
        tags: this.extractTags($),
        ...siteSpecific,
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Detect the type of content based on URL and page structure.
   */
  private detectContentType(
    url: string,
    $: cheerio.CheerioAPI
  ): FetchedContent['metadata']['type'] {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('github.com')) return 'github';
    if (
      hostname.includes('twitter.com') ||
      hostname.includes('x.com') ||
      hostname.includes('reddit.com') ||
      hostname.includes('linkedin.com') ||
      hostname.includes('facebook.com') ||
      hostname.includes('instagram.com') ||
      hostname.includes('mastodon')
    ) {
      return 'social';
    }
    if (
      hostname.includes('youtube.com') ||
      hostname.includes('youtu.be') ||
      hostname.includes('vimeo.com')
    ) {
      return 'video';
    }
    if ($('article').length > 0 || $('[itemtype*="Article"]').length > 0) {
      return 'article';
    }
    return 'other';
  }

  /**
   * Extract the page title, preferring og:title over <title>.
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    return (
      this.extractMeta($, 'og:title') ||
      $('title').first().text().trim() ||
      $('h1').first().text().trim() ||
      'Untitled'
    );
  }

  /**
   * Extract the page description.
   */
  private extractDescription($: cheerio.CheerioAPI): string {
    return (
      this.extractMeta($, 'og:description') ||
      this.extractMeta($, 'description') ||
      $('meta[name="description"]').attr('content')?.trim() ||
      ''
    );
  }

  /**
   * Extract the main text content from the page.
   */
  private extractMainText($: cheerio.CheerioAPI, type: string): string {
    let content = '';

    if (type === 'github') {
      // GitHub: get README content
      const readme = $('article.markdown-body, .readme-container, #readme');
      content = readme.text().trim();
      if (!content) {
        content = $('[data-testid="about-description"]').text().trim();
      }
    } else if (type === 'article') {
      // Articles: get the article body
      const article = $('article, [role="main"], .post-content, .entry-content, .article-body');
      content = article.first().text().trim();
    }

    if (!content) {
      // Fallback: get the main or body content
      const main = $('main, [role="main"], #content, .content');
      if (main.length > 0) {
        content = main.first().text().trim();
      } else {
        content = $('body').text().trim();
      }
    }

    // Clean up whitespace
    return content.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract a meta tag value by property or name.
   */
  private extractMeta($: cheerio.CheerioAPI, name: string): string {
    return (
      $(`meta[property="${name}"]`).attr('content')?.trim() ||
      $(`meta[name="${name}"]`).attr('content')?.trim() ||
      ''
    );
  }

  /**
   * Extract author information.
   */
  private extractAuthor($: cheerio.CheerioAPI): string | undefined {
    return (
      this.extractMeta($, 'author') ||
      this.extractMeta($, 'article:author') ||
      $('meta[name="author"]').attr('content')?.trim() ||
      $('[rel="author"]').first().text().trim() ||
      undefined
    );
  }

  /**
   * Extract tags/keywords from the page.
   */
  private extractTags($: cheerio.CheerioAPI): string[] {
    const keywords = this.extractMeta($, 'keywords');
    if (keywords) {
      return keywords.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
    }

    // Try to find tag elements
    const tags: string[] = [];
    $('a[rel="tag"], .tag, .label, [data-tag]').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 50) {
        tags.push(text);
      }
    });
    return tags.slice(0, 10);
  }

  /**
   * Extract all Open Graph meta properties.
   */
  private extractOgData($: cheerio.CheerioAPI): Record<string, string> {
    const ogData: Record<string, string> = {};
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr('property');
      const content = $(el).attr('content')?.trim();
      if (property && content) {
        ogData[property] = content;
      }
    });
    return ogData;
  }

  /**
   * Extract image URLs from the page.
   */
  private extractImages($: cheerio.CheerioAPI): string[] {
    const images: string[] = [];
    // OG image first
    const ogImage = this.extractMeta($, 'og:image');
    if (ogImage) images.push(ogImage);

    // Then page images
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src')?.trim();
      if (src && !src.startsWith('data:') && !images.includes(src)) {
        images.push(src);
      }
    });
    return images.slice(0, 10);
  }

  /**
   * Extract site-specific metadata based on content type.
   */
  private extractSiteSpecific(
    url: string,
    $: cheerio.CheerioAPI,
    type: string,
  ): Record<string, string | undefined> {
    if (type === 'github') {
      return this.extractGitHubMeta(url, $);
    }
    if (type === 'social') {
      return this.extractSocialMeta(url, $);
    }
    return {};
  }

  /**
   * Extract GitHub repo metadata: name, description, stars, language.
   */
  private extractGitHubMeta(
    url: string,
    $: cheerio.CheerioAPI,
  ): Record<string, string | undefined> {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    const repoName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;

    const repoDescription =
      $('[data-testid="about-description"]').text().trim() ||
      this.extractMeta($, 'og:description') ||
      undefined;

    // Stars count - GitHub renders this in various selectors
    const starsText =
      $('#repo-stars-counter-star').text().trim() ||
      $('a[href$="/stargazers"] .Counter').text().trim() ||
      $('a[href$="/stargazers"]').text().replace(/[^0-9.kKmM]/g, '').trim() ||
      undefined;

    // Primary language
    const language =
      $('span[itemprop="programmingLanguage"]').first().text().trim() ||
      $('.repository-lang-stats-graph span').first().text().trim() ||
      undefined;

    return { repoName, repoDescription, stars: starsText, language };
  }

  /**
   * Extract social media metadata (tweet text, post captions).
   */
  private extractSocialMeta(
    url: string,
    $: cheerio.CheerioAPI,
  ): Record<string, string | undefined> {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      // Twitter/X: tweet text is often in og:description
      const tweetText =
        $('[data-testid="tweetText"]').first().text().trim() ||
        this.extractMeta($, 'og:description') ||
        undefined;
      return { tweetText };
    }

    if (hostname.includes('instagram.com')) {
      const postCaption =
        this.extractMeta($, 'og:description') ||
        $('meta[name="description"]').attr('content')?.trim() ||
        undefined;
      return { postCaption };
    }

    return {};
  }
}
