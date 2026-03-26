import { JSDOM } from "jsdom";
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
 * Compares a hash of the page's main content to detect meaningful changes.
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
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Extract the main content area — strip nav, header, footer, scripts, etc.
  const selectorsToRemove = [
    "nav",
    "header",
    "footer",
    "script",
    "style",
    "noscript",
    "iframe",
    ".sidebar",
    ".nav",
    ".header",
    ".footer",
    ".menu",
    ".advertisement",
    ".ad",
    "#sidebar",
    "#nav",
    "#header",
    "#footer",
  ];

  for (const selector of selectorsToRemove) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }

  // Get main content text
  const mainContent =
    doc.querySelector("main") ??
    doc.querySelector("article") ??
    doc.querySelector('[role="main"]') ??
    doc.querySelector("#content") ??
    doc.querySelector(".content") ??
    doc.body;

  const textContent = mainContent?.textContent
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000) ?? "";

  const newHash = SHA256(textContent).toString();

  // Get metadata
  const title = doc.title ?? null;
  const ogImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

  const snippet = textContent.slice(0, 300) || null;

  return {
    hasChanged: lastHash !== null && lastHash !== newHash,
    newHash,
    title,
    contentSnippet: snippet,
    imageUrl: ogImage,
  };
}
