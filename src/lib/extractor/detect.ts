import type { SourceType } from "@/types";

interface DetectionResult {
  readonly type: SourceType;
  readonly canonicalUrl: string;
  readonly metadata: Record<string, string>;
  readonly isSource: boolean; // true = should be added as a monitored source
}

const PATTERNS: ReadonlyArray<{
  type: SourceType;
  test: (url: URL) => boolean;
  extract: (url: URL) => Record<string, string>;
  isSource: boolean;
}> = [
  // X profile → source (monitor manually)
  {
    type: "x_profile",
    test: (url) =>
      (url.hostname === "x.com" || url.hostname === "twitter.com") &&
      /^\/[a-zA-Z0-9_]+$/.test(url.pathname),
    extract: (url) => ({
      username: url.pathname.slice(1),
      isProfile: "true",
    }),
    isSource: true,
  },
  // Individual tweet → save as item
  {
    type: "x_profile",
    test: (url) =>
      (url.hostname === "x.com" || url.hostname === "twitter.com") &&
      /^\/[a-zA-Z0-9_]+\/status\/\d+/.test(url.pathname),
    extract: (url) => {
      const parts = url.pathname.split("/");
      return {
        username: parts[1],
        tweetId: parts[3],
        isPost: "true",
      };
    },
    isSource: false,
  },
  // YouTube video → save as item
  {
    type: "youtube",
    test: (url) =>
      (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") &&
      url.pathname === "/watch" &&
      url.searchParams.has("v"),
    extract: (url) => ({
      videoId: url.searchParams.get("v") ?? "",
      isVideo: "true",
    }),
    isSource: false,
  },
  // YouTube short URL → save as item
  {
    type: "youtube",
    test: (url) => url.hostname === "youtu.be",
    extract: (url) => ({
      videoId: url.pathname.slice(1),
      isVideo: "true",
    }),
    isSource: false,
  },
  // YouTube channel → source (monitor via RSS)
  {
    type: "youtube",
    test: (url) =>
      (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") &&
      (url.pathname.startsWith("/@") || url.pathname.startsWith("/c/") || url.pathname.startsWith("/channel/")),
    extract: (url) => ({
      channelPath: url.pathname,
      isChannel: "true",
    }),
    isSource: true,
  },
  // Reddit post → save as item
  {
    type: "reddit",
    test: (url) =>
      (url.hostname === "www.reddit.com" || url.hostname === "reddit.com") &&
      url.pathname.includes("/comments/"),
    extract: (url) => {
      const parts = url.pathname.split("/");
      const subredditIdx = parts.indexOf("r");
      return {
        subreddit: subredditIdx >= 0 ? parts[subredditIdx + 1] : "",
        postId: parts[parts.indexOf("comments") + 1] ?? "",
        isPost: "true",
      };
    },
    isSource: false,
  },
  // Subreddit → source (monitor via RSS)
  {
    type: "reddit",
    test: (url) =>
      (url.hostname === "www.reddit.com" || url.hostname === "reddit.com") &&
      url.pathname.startsWith("/r/") &&
      !url.pathname.includes("/comments/"),
    extract: (url) => ({
      subreddit: url.pathname.split("/")[2],
      isSubreddit: "true",
    }),
    isSource: true,
  },
];

/**
 * Heuristic: is this URL a "section/homepage" (source) or a "specific article" (item)?
 *
 * Source indicators: short path, no slug-like segments, common section paths.
 * Article indicators: long path with slug, date patterns, query params like ?p=123.
 */
function isLikelySourceUrl(url: URL): boolean {
  const path = url.pathname.replace(/\/$/, ""); // Remove trailing slash
  const segments = path.split("/").filter(Boolean);

  // Root page (homepage) → source
  if (segments.length === 0) return true;

  // Single segment like /tech, /news, /blog → likely a section/source
  if (segments.length === 1 && segments[0].length < 20) return true;

  // Common section patterns
  const sectionPatterns = [
    /^\/?(tech|news|science|politics|business|sports|entertainment|world|opinion|lifestyle|culture|health)$/i,
    /^\/?(blog|articles|posts|feed|latest|trending|popular)$/i,
    /^\/category\//i,
    /^\/tag\//i,
    /^\/topic\//i,
  ];
  if (sectionPatterns.some((p) => p.test(path))) return true;

  // Two segments but second is short (like /news/tech) → section
  if (segments.length === 2 && segments.every((s) => s.length < 15 && !s.includes("-"))) {
    return true;
  }

  // Article indicators: slug-like paths, dates, long segments
  const datePattern = /\d{4}\/\d{2}/;
  if (datePattern.test(path)) return false; // Has date → article

  // Long slug with hyphens → article
  if (segments.some((s) => s.includes("-") && s.length > 20)) return false;

  // More than 2 path segments → likely an article
  if (segments.length > 2) return false;

  return false; // Default: treat as article/item
}

export function detectUrlType(rawUrl: string): DetectionResult {
  let urlString = rawUrl.trim();

  // Add protocol if missing
  if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
    urlString = `https://${urlString}`;
  }

  const url = new URL(urlString);

  for (const pattern of PATTERNS) {
    if (pattern.test(url)) {
      return {
        type: pattern.type,
        canonicalUrl: url.toString(),
        metadata: pattern.extract(url),
        isSource: pattern.isSource,
      };
    }
  }

  // Check for RSS feed URLs → always a source
  if (
    url.pathname.endsWith(".xml") ||
    url.pathname.endsWith(".rss") ||
    url.pathname.endsWith("/feed") ||
    url.pathname.endsWith("/rss") ||
    url.pathname.includes("/feeds/")
  ) {
    return {
      type: "rss",
      canonicalUrl: url.toString(),
      metadata: {},
      isSource: true,
    };
  }

  // For generic URLs, determine if it's a source or an item
  const likelySource = isLikelySourceUrl(url);

  return {
    type: likelySource ? "website" : "generic",
    canonicalUrl: url.toString(),
    metadata: {},
    isSource: likelySource,
  };
}
