import SHA256 from "crypto-js/sha256";

export interface PageChangeResult {
  readonly hasChanged: boolean;
  readonly newHash: string;
  readonly title: string | null;
  readonly contentSnippet: string | null;
  readonly imageUrl: string | null;
}

/**
 * Check if a webpage has changed since the last check.
 * Uses regex-based parsing (no jsdom) for Vercel compatibility.
 */
export async function checkPageChange(
  url: string,
  lastHash: string | null
): Promise<PageChangeResult> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0; +https://pulse.app)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Page fetch failed: ${response.status}`);
  }

  const html = await response.text();

  // Strip scripts, styles, nav, header, footer
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  // Try to find main content area
  const mainMatch =
    cleaned.match(/<main[\s\S]*?<\/main>/i) ??
    cleaned.match(/<article[\s\S]*?<\/article>/i) ??
    cleaned.match(/<div[^>]*role="main"[\s\S]*?<\/div>/i);

  const contentHtml = mainMatch?.[0] ?? cleaned;

  // Strip all HTML tags to get text
  const textContent = contentHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);

  const newHash = SHA256(textContent).toString();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? null;

  // Extract og:image
  const ogImageMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/i)
    ?? html.match(/content="([^"]+)"[^>]*property="og:image"/i);
  const imageUrl = ogImageMatch?.[1] ?? null;

  const snippet = textContent.slice(0, 300) || null;

  return {
    hasChanged: lastHash !== null && lastHash !== newHash,
    newHash,
    title,
    contentSnippet: snippet,
    imageUrl,
  };
}
