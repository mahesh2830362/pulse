import SHA256 from "crypto-js/sha256";
import { detectUrlType } from "./detect";

export interface ExtractedContent {
  readonly url: string;
  readonly title: string;
  readonly contentSnippet: string | null;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly imageUrl: string | null;
  readonly contentHash: string;
  readonly sourceType: string;
  readonly rawMetadata: Record<string, unknown>;
}

/**
 * Extract content from any URL.
 * Uses regex-based parsing (no jsdom) for Vercel serverless compatibility.
 */
export async function extractContent(rawUrl: string): Promise<ExtractedContent> {
  const detection = detectUrlType(rawUrl);

  switch (detection.type) {
    case "x_profile":
      return extractTweet(detection.canonicalUrl, detection.metadata);
    case "youtube":
      return extractYouTube(detection.canonicalUrl, detection.metadata);
    default:
      return extractArticle(detection.canonicalUrl);
  }
}

async function extractTweet(
  url: string,
  metadata: Record<string, string>
): Promise<ExtractedContent> {
  if (metadata.isProfile === "true") {
    return {
      url,
      title: `@${metadata.username} on X`,
      contentSnippet: `X profile: @${metadata.username}. Paste individual tweet URLs to save specific posts.`,
      author: metadata.username,
      publishedAt: null,
      imageUrl: null,
      contentHash: SHA256(url).toString(),
      sourceType: "x_profile",
      rawMetadata: { ...metadata, isProfileSource: true },
    };
  }

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error(`oEmbed request failed: ${response.status}`);
    }

    const data = await response.json();
    const htmlContent = data.html as string;
    const plainText = htmlContent
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      url,
      title: plainText.slice(0, 100) + (plainText.length > 100 ? "..." : ""),
      contentSnippet: plainText,
      author: data.author_name ?? metadata.username,
      publishedAt: null,
      imageUrl: null,
      contentHash: SHA256(url + plainText).toString(),
      sourceType: "x_profile",
      rawMetadata: {
        ...metadata,
        embedHtml: data.html,
        authorUrl: data.author_url,
      },
    };
  } catch {
    return {
      url,
      title: `Tweet by @${metadata.username}`,
      contentSnippet: null,
      author: metadata.username,
      publishedAt: null,
      imageUrl: null,
      contentHash: SHA256(url).toString(),
      sourceType: "x_profile",
      rawMetadata: metadata,
    };
  }
}

async function extractYouTube(
  url: string,
  metadata: Record<string, string>
): Promise<ExtractedContent> {
  if (metadata.isChannel === "true") {
    const channelName = metadata.channelPath.split("/").pop() ?? "Unknown";
    return {
      url,
      title: `${channelName} — YouTube Channel`,
      contentSnippet: `YouTube channel. New videos will be monitored via RSS.`,
      author: channelName,
      publishedAt: null,
      imageUrl: null,
      contentHash: SHA256(url).toString(),
      sourceType: "youtube",
      rawMetadata: { ...metadata, isChannelSource: true },
    };
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error(`YouTube oEmbed failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      url,
      title: data.title ?? "YouTube Video",
      contentSnippet: `Video by ${data.author_name}`,
      author: data.author_name ?? null,
      publishedAt: null,
      imageUrl: data.thumbnail_url ?? null,
      contentHash: SHA256(url + (data.title ?? "")).toString(),
      sourceType: "youtube",
      rawMetadata: {
        ...metadata,
        thumbnailUrl: data.thumbnail_url,
        authorUrl: data.author_url,
        embedHtml: data.html,
      },
    };
  } catch {
    const videoId = metadata.videoId ?? "";
    return {
      url,
      title: "YouTube Video",
      contentSnippet: null,
      author: null,
      publishedAt: null,
      imageUrl: videoId
        ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        : null,
      contentHash: SHA256(url).toString(),
      sourceType: "youtube",
      rawMetadata: metadata,
    };
  }
}

/**
 * Extract article content using regex and Open Graph tags.
 * Lightweight alternative to jsdom/Readability for serverless.
 */
async function extractArticle(url: string): Promise<ExtractedContent> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PulseBot/1.0; +https://pulse.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const html = await response.text();

    // Extract meta tags using regex
    const ogTitle = getMetaContent(html, 'property="og:title"') ??
      getMetaContent(html, 'name="twitter:title"');
    const ogDescription = getMetaContent(html, 'property="og:description"') ??
      getMetaContent(html, 'name="twitter:description"') ??
      getMetaContent(html, 'name="description"');
    const ogImage = getMetaContent(html, 'property="og:image"') ??
      getMetaContent(html, 'name="twitter:image"');
    const ogAuthor = getMetaContent(html, 'name="author"') ??
      getMetaContent(html, 'property="article:author"');
    const ogPublished = getMetaContent(html, 'property="article:published_time"') ??
      getMetaContent(html, 'name="date"');
    const siteName = getMetaContent(html, 'property="og:site_name"') ??
      new URL(url).hostname;

    // Extract <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch?.[1]?.trim();

    // Extract body text for snippet
    const bodyContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "");

    // Try to get article/main content
    const articleMatch =
      bodyContent.match(/<article[\s\S]*?<\/article>/i) ??
      bodyContent.match(/<main[\s\S]*?<\/main>/i);

    const contentArea = articleMatch?.[0] ?? bodyContent;
    const plainText = contentArea
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const title = ogTitle ?? pageTitle ?? url;
    const snippet = ogDescription ?? plainText.slice(0, 500) ?? null;

    return {
      url,
      title,
      contentSnippet: snippet,
      author: ogAuthor ?? null,
      publishedAt: ogPublished ?? null,
      imageUrl: ogImage ?? null,
      contentHash: SHA256(url + title + (snippet ?? "")).toString(),
      sourceType: "website",
      rawMetadata: {
        ogTitle,
        ogDescription,
        ogImage,
        siteName,
        fullContent: plainText.slice(0, 5000),
        wordCount: plainText.split(/\s+/).length,
      },
    };
  } catch (error) {
    return {
      url,
      title: new URL(url).hostname,
      contentSnippet: null,
      author: null,
      publishedAt: null,
      imageUrl: null,
      contentHash: SHA256(url).toString(),
      sourceType: "generic",
      rawMetadata: {
        error: error instanceof Error ? error.message : "Extraction failed",
      },
    };
  }
}

/**
 * Extract meta tag content using regex.
 * Handles both attribute orders: property/name before or after content.
 */
function getMetaContent(html: string, attrSelector: string): string | null {
  // Try: <meta property="..." content="...">
  const regex1 = new RegExp(
    `<meta[^>]*${attrSelector.replace(/"/g, '"')}[^>]*content="([^"]*)"`,
    "i"
  );
  const match1 = html.match(regex1);
  if (match1?.[1]) return match1[1];

  // Try: <meta content="..." property="...">
  const regex2 = new RegExp(
    `<meta[^>]*content="([^"]*)"[^>]*${attrSelector.replace(/"/g, '"')}`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2?.[1] ?? null;
}
