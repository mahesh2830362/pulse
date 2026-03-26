import { JSDOM } from "jsdom";
import SHA256 from "crypto-js/sha256";

export interface RSSItem {
  readonly title: string;
  readonly url: string;
  readonly contentSnippet: string | null;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly imageUrl: string | null;
  readonly contentHash: string;
}

export interface RSSFeedResult {
  readonly items: ReadonlyArray<RSSItem>;
  readonly feedTitle: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

/**
 * Discover RSS feed URL from a website URL.
 * Checks common paths and HTML <link> tags.
 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  // Common RSS paths to try
  const commonPaths = [
    "/feed",
    "/rss",
    "/feed.xml",
    "/rss.xml",
    "/atom.xml",
    "/index.xml",
    "/feeds/posts/default",
    "/blog/feed",
    "/blog/rss",
  ];

  const url = new URL(siteUrl);

  // First: check HTML for <link rel="alternate" type="application/rss+xml">
  try {
    const response = await fetch(siteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const html = await response.text();
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Look for RSS/Atom link tags
      const feedLink =
        doc.querySelector('link[type="application/rss+xml"]') ??
        doc.querySelector('link[type="application/atom+xml"]') ??
        doc.querySelector('link[type="application/feed+json"]');

      if (feedLink) {
        const href = feedLink.getAttribute("href");
        if (href) {
          // Handle relative URLs
          return href.startsWith("http") ? href : new URL(href, siteUrl).toString();
        }
      }
    }
  } catch {
    // Ignore and try common paths
  }

  // Second: try common paths
  for (const path of commonPaths) {
    try {
      const feedUrl = `${url.origin}${path}`;
      const response = await fetch(feedUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)",
        },
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (
        response.ok &&
        (contentType.includes("xml") ||
          contentType.includes("rss") ||
          contentType.includes("atom") ||
          contentType.includes("feed"))
      ) {
        return feedUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Fetch and parse an RSS/Atom feed.
 * Supports conditional GET via ETag and If-Modified-Since.
 */
export async function fetchFeed(
  feedUrl: string,
  etag?: string | null,
  lastModified?: string | null
): Promise<RSSFeedResult | null> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  };

  if (etag) {
    headers["If-None-Match"] = etag;
  }
  if (lastModified) {
    headers["If-Modified-Since"] = lastModified;
  }

  const response = await fetch(feedUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  // 304 Not Modified — no new content
  if (response.status === 304) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const doc = dom.window.document;

  const responseEtag = response.headers.get("etag");
  const responseLastModified = response.headers.get("last-modified");

  // Try RSS 2.0 first
  const rssItems = doc.querySelectorAll("item");
  if (rssItems.length > 0) {
    return parseRSS(doc, rssItems, responseEtag, responseLastModified);
  }

  // Try Atom
  const atomEntries = doc.querySelectorAll("entry");
  if (atomEntries.length > 0) {
    return parseAtom(doc, atomEntries, responseEtag, responseLastModified);
  }

  return { items: [], feedTitle: null, etag: responseEtag, lastModified: responseLastModified };
}

function parseRSS(
  doc: Document,
  rssItems: NodeListOf<Element>,
  etag: string | null,
  lastModified: string | null
): RSSFeedResult {
  const feedTitle = doc.querySelector("channel > title")?.textContent ?? null;
  const items: RSSItem[] = [];

  rssItems.forEach((item) => {
    const title = item.querySelector("title")?.textContent?.trim() ?? "Untitled";
    const link = item.querySelector("link")?.textContent?.trim() ?? "";
    const description = item.querySelector("description")?.textContent?.trim() ?? null;
    const author =
      item.querySelector("author")?.textContent?.trim() ??
      item.querySelector("dc\\:creator")?.textContent?.trim() ??
      null;
    const pubDate = item.querySelector("pubDate")?.textContent?.trim() ?? null;

    // Extract image from enclosure or media:content
    const enclosure = item.querySelector("enclosure");
    const mediaContent = item.querySelector("media\\:content, media\\:thumbnail");
    let imageUrl: string | null = null;

    if (enclosure?.getAttribute("type")?.startsWith("image/")) {
      imageUrl = enclosure.getAttribute("url");
    } else if (mediaContent) {
      imageUrl = mediaContent.getAttribute("url");
    }

    // Clean HTML from description
    const plainDescription = description
      ? description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)
      : null;

    if (link) {
      items.push({
        title,
        url: link,
        contentSnippet: plainDescription,
        author,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        imageUrl,
        contentHash: SHA256(link + title).toString(),
      });
    }
  });

  return { items, feedTitle, etag, lastModified };
}

function parseAtom(
  doc: Document,
  entries: NodeListOf<Element>,
  etag: string | null,
  lastModified: string | null
): RSSFeedResult {
  const feedTitle = doc.querySelector("feed > title")?.textContent ?? null;
  const items: RSSItem[] = [];

  entries.forEach((entry) => {
    const title = entry.querySelector("title")?.textContent?.trim() ?? "Untitled";
    const linkEl = entry.querySelector('link[rel="alternate"]') ?? entry.querySelector("link");
    const link = linkEl?.getAttribute("href") ?? "";
    const summary =
      entry.querySelector("summary")?.textContent?.trim() ??
      entry.querySelector("content")?.textContent?.trim() ??
      null;
    const author = entry.querySelector("author > name")?.textContent?.trim() ?? null;
    const published =
      entry.querySelector("published")?.textContent?.trim() ??
      entry.querySelector("updated")?.textContent?.trim() ??
      null;

    const plainSummary = summary
      ? summary.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)
      : null;

    if (link) {
      items.push({
        title,
        url: link,
        contentSnippet: plainSummary,
        author,
        publishedAt: published ? new Date(published).toISOString() : null,
        imageUrl: null,
        contentHash: SHA256(link + title).toString(),
      });
    }
  });

  return { items, feedTitle, etag, lastModified };
}

/**
 * Build YouTube RSS feed URL from a channel URL.
 */
export async function getYouTubeFeedUrl(channelUrl: string): Promise<string | null> {
  try {
    // Fetch the channel page to find the channel ID
    const response = await fetch(channelUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Look for channel ID in meta tags or page content
    const channelIdMatch =
      html.match(/channel_id=([a-zA-Z0-9_-]+)/) ??
      html.match(/"channelId":"([a-zA-Z0-9_-]+)"/) ??
      html.match(/externalId":"([a-zA-Z0-9_-]+)"/);

    if (channelIdMatch?.[1]) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
    }

    return null;
  } catch {
    return null;
  }
}
