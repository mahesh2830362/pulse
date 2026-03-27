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
 * Uses regex parsing (no jsdom) for Vercel compatibility.
 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  const url = new URL(siteUrl);

  // First: check HTML for <link> RSS/Atom tags using regex
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

      // Match <link> tags with RSS/Atom type
      const linkRegex = /<link[^>]*type="application\/(rss|atom)\+xml"[^>]*>/gi;
      const matches = html.matchAll(linkRegex);

      for (const match of matches) {
        const hrefMatch = match[0].match(/href="([^"]+)"/i);
        if (hrefMatch?.[1]) {
          const href = hrefMatch[1];
          return href.startsWith("http") ? href : new URL(href, siteUrl).toString();
        }
      }

      // Also try reversed attribute order: href before type
      const linkRegex2 = /<link[^>]*href="([^"]+)"[^>]*type="application\/(rss|atom)\+xml"[^>]*/gi;
      const matches2 = html.matchAll(linkRegex2);

      for (const match of matches2) {
        if (match[1]) {
          const href = match[1];
          return href.startsWith("http") ? href : new URL(href, siteUrl).toString();
        }
      }
    }
  } catch {
    // Ignore and try common paths
  }

  // Second: try common RSS paths
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
 * Fetch and parse an RSS/Atom feed using regex (no jsdom).
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

  if (response.status === 304) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const responseEtag = response.headers.get("etag");
  const responseLastModified = response.headers.get("last-modified");

  // Detect if RSS or Atom
  if (xml.includes("<entry>") || xml.includes("<entry ")) {
    return parseAtomRegex(xml, responseEtag, responseLastModified);
  }

  return parseRSSRegex(xml, responseEtag, responseLastModified);
}

function getTagContent(xml: string, tagName: string): string | null {
  // Handle CDATA and regular content
  const regex = new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").trim();
}

function getAttrValue(xml: string, attr: string): string | null {
  const regex = new RegExp(`${attr}="([^"]*)"`, "i");
  const match = xml.match(regex);
  return match?.[1] ?? null;
}

function parseRSSRegex(
  xml: string,
  etag: string | null,
  lastModified: string | null
): RSSFeedResult {
  const feedTitle = getTagContent(xml.split("<item")[0], "title");
  const items: RSSItem[] = [];

  // Split by <item> tags
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1);

  for (const block of itemBlocks) {
    const itemXml = block.split("</item>")[0];

    const title = getTagContent(itemXml, "title") ?? "Untitled";
    const link = getTagContent(itemXml, "link") ?? "";
    const description = getTagContent(itemXml, "description");
    const author = getTagContent(itemXml, "dc:creator") ?? getTagContent(itemXml, "author");
    const pubDate = getTagContent(itemXml, "pubDate");

    // Extract image from enclosure or media:content
    const enclosureMatch = itemXml.match(/<enclosure[^>]*type="image\/[^"]*"[^>]*url="([^"]*)"[^>]*\/?>/i)
      ?? itemXml.match(/<enclosure[^>]*url="([^"]*)"[^>]*type="image\/[^"]*"[^>]*\/?>/i);
    const mediaMatch = itemXml.match(/<media:content[^>]*url="([^"]*)"[^>]*\/?>/i)
      ?? itemXml.match(/<media:thumbnail[^>]*url="([^"]*)"[^>]*\/?>/i);

    const imageUrl = enclosureMatch?.[1] ?? mediaMatch?.[1] ?? null;

    // Strip HTML from description
    const plainDescription = description
      ? description.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 500)
      : null;

    if (link) {
      items.push({
        title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'),
        url: link.trim(),
        contentSnippet: plainDescription,
        author,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        imageUrl,
        contentHash: SHA256(link.trim() + title).toString(),
      });
    }
  }

  return { items, feedTitle, etag, lastModified };
}

function parseAtomRegex(
  xml: string,
  etag: string | null,
  lastModified: string | null
): RSSFeedResult {
  const feedTitle = getTagContent(xml.split("<entry")[0], "title");
  const items: RSSItem[] = [];

  const entryBlocks = xml.split(/<entry[\s>]/i).slice(1);

  for (const block of entryBlocks) {
    const entryXml = block.split("</entry>")[0];

    const title = getTagContent(entryXml, "title") ?? "Untitled";

    // Get link href - prefer alternate
    const altLinkMatch = entryXml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"[^>]*\/?>/i);
    const anyLinkMatch = entryXml.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i);
    const link = altLinkMatch?.[1] ?? anyLinkMatch?.[1] ?? "";

    const summary = getTagContent(entryXml, "summary") ?? getTagContent(entryXml, "content");
    const author = getTagContent(entryXml, "name"); // inside <author><name>
    const published = getTagContent(entryXml, "published") ?? getTagContent(entryXml, "updated");

    const plainSummary = summary
      ? summary.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 500)
      : null;

    if (link) {
      items.push({
        title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'),
        url: link,
        contentSnippet: plainSummary,
        author,
        publishedAt: published ? new Date(published).toISOString() : null,
        imageUrl: null,
        contentHash: SHA256(link + title).toString(),
      });
    }
  }

  return { items, feedTitle, etag, lastModified };
}

/**
 * Build YouTube RSS feed URL from a channel URL.
 */
export async function getYouTubeFeedUrl(channelUrl: string): Promise<string | null> {
  try {
    const response = await fetch(channelUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();

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
