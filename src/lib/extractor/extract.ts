import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
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
 * Detects the URL type and applies the appropriate extraction strategy.
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

/**
 * Extract tweet content using X's free oEmbed endpoint.
 */
async function extractTweet(
  url: string,
  metadata: Record<string, string>
): Promise<ExtractedContent> {
  // For profile URLs (not individual posts), return profile info
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

  // For individual tweets, use oEmbed
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error(`oEmbed request failed: ${response.status}`);
    }

    const data = await response.json();

    // Extract plain text from HTML embed
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
  } catch (error) {
    // Fallback: return basic info
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

/**
 * Extract YouTube video info using oEmbed (free, no API key needed).
 */
async function extractYouTube(
  url: string,
  metadata: Record<string, string>
): Promise<ExtractedContent> {
  // For channel URLs, return channel info
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

  // For videos, use oEmbed
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
        thumbnailWidth: data.thumbnail_width,
        thumbnailHeight: data.thumbnail_height,
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
 * Extract article content using Mozilla Readability.
 * Falls back to Open Graph / meta tag extraction.
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
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Try Readability first
    const reader = new Readability(doc.cloneNode(true) as Document);
    const article = reader.parse();

    // Extract Open Graph / meta data as fallback
    const ogTitle = getMetaContent(doc, 'property="og:title"') ??
      getMetaContent(doc, 'name="twitter:title"');
    const ogDescription = getMetaContent(doc, 'property="og:description"') ??
      getMetaContent(doc, 'name="twitter:description"') ??
      getMetaContent(doc, 'name="description"');
    const ogImage = getMetaContent(doc, 'property="og:image"') ??
      getMetaContent(doc, 'name="twitter:image"');
    const ogAuthor = getMetaContent(doc, 'name="author"') ??
      getMetaContent(doc, 'property="article:author"');
    const ogPublished = getMetaContent(doc, 'property="article:published_time"') ??
      getMetaContent(doc, 'name="date"');

    const title = article?.title ?? ogTitle ?? doc.title ?? url;
    const snippet =
      article?.textContent?.slice(0, 500) ?? ogDescription ?? null;

    return {
      url,
      title,
      contentSnippet: snippet,
      author: article?.byline ?? ogAuthor ?? null,
      publishedAt: ogPublished ?? null,
      imageUrl: ogImage ?? null,
      contentHash: SHA256(url + title + (snippet ?? "")).toString(),
      sourceType: "website",
      rawMetadata: {
        ogTitle,
        ogDescription,
        ogImage,
        siteName:
          getMetaContent(doc, 'property="og:site_name"') ??
          new URL(url).hostname,
        readabilityExcerpt: article?.excerpt ?? null,
        wordCount: article?.textContent
          ? article.textContent.split(/\s+/).length
          : null,
        fullContent: article?.textContent ?? null,
      },
    };
  } catch (error) {
    // Minimal fallback
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

function getMetaContent(doc: Document, selector: string): string | null {
  const el = doc.querySelector(`meta[${selector}]`);
  return el?.getAttribute("content") ?? null;
}
