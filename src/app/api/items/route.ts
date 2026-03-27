import { createClient } from "@/lib/supabase/server";
import { extractContent } from "@/lib/extractor/extract";
import { detectUrlType } from "@/lib/extractor/detect";
import { NextResponse } from "next/server";

/**
 * POST /api/items — Save a URL.
 *
 * Smart routing:
 * - Source URLs (homepages, sections, profiles, channels) → added as monitored source
 * - Content URLs (articles, tweets, videos) → saved as feed item
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Detect URL type
    const detection = detectUrlType(url);

    // If it's a source URL, add as a monitored source instead
    if (detection.isSource) {
      return addAsSource(supabase, user.id, detection.canonicalUrl, detection);
    }

    // Otherwise, save as a feed item
    return saveAsItem(supabase, user.id, url);
  } catch (error) {
    console.error("Error saving item:", error);
    return NextResponse.json(
      { error: "Failed to extract and save content" },
      { status: 500 }
    );
  }
}

/**
 * Add a URL as a monitored source.
 */
async function addAsSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  canonicalUrl: string,
  detection: ReturnType<typeof detectUrlType>
) {
  // Check for existing source
  const { data: existing } = await supabase
    .from("sources")
    .select("id, name")
    .eq("user_id", userId)
    .eq("url", canonicalUrl)
    .single();

  if (existing) {
    return NextResponse.json({
      success: true,
      action: "source_exists",
      source: existing,
      message: `"${existing.name}" is already in your sources.`,
    });
  }

  // Forward to sources API internally
  const sourcesUrl = new URL("/api/sources", "http://localhost:3000");
  const response = await fetch(sourcesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "", // Will use server-side supabase client instead
    },
    body: JSON.stringify({ url: canonicalUrl }),
  });

  // Since internal fetch won't have auth, do it directly
  let feedUrl: string | null = null;
  let sourceType = detection.type;
  let sourceName = "";

  if (detection.type === "youtube" && detection.metadata.isChannel === "true") {
    sourceName = detection.metadata.channelPath?.split("/").pop() ?? "YouTube Channel";
    sourceType = "youtube";
  } else if (detection.type === "x_profile") {
    sourceName = `@${detection.metadata.username}`;
  } else if (detection.type === "reddit") {
    sourceName = `r/${detection.metadata.subreddit}`;
  } else if (detection.type === "rss") {
    feedUrl = canonicalUrl;
    sourceName = new URL(canonicalUrl).hostname;
  } else {
    // Website — try to get name from the page
    try {
      const pageResponse = await fetch(canonicalUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)" },
        signal: AbortSignal.timeout(5000),
      });
      if (pageResponse.ok) {
        const html = await pageResponse.text();
        const siteNameMatch = html.match(
          /property="og:site_name"\s+content="([^"]+)"/i
        ) ?? html.match(
          /content="([^"]+)"\s+property="og:site_name"/i
        );
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        sourceName = siteNameMatch?.[1]?.trim() ?? titleMatch?.[1]?.trim() ?? new URL(canonicalUrl).hostname;

        // Try to discover RSS feed
        const rssMatch = html.match(
          /type="application\/(rss|atom)\+xml"[^>]*href="([^"]+)"/i
        ) ?? html.match(
          /href="([^"]+)"[^>]*type="application\/(rss|atom)\+xml"/i
        );
        if (rssMatch) {
          const rssHref = rssMatch[2] ?? rssMatch[1];
          feedUrl = rssHref.startsWith("http")
            ? rssHref
            : new URL(rssHref, canonicalUrl).toString();
          sourceType = "rss";
        }
      }
    } catch {
      sourceName = new URL(canonicalUrl).hostname;
    }
  }

  const defaultInterval =
    sourceType === "rss" || sourceType === "youtube"
      ? 10
      : sourceType === "website"
        ? 10
        : 0;

  const { data: source, error: insertError } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      url: canonicalUrl,
      feed_url: feedUrl,
      type: sourceType,
      name: sourceName.slice(0, 200),
      check_interval_minutes: defaultInterval,
      is_high_priority: false,
      is_active: true,
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({
        success: true,
        action: "source_exists",
        message: `This source is already being monitored.`,
      });
    }
    throw insertError;
  }

  // Create feed_state for monitoring
  if (feedUrl || sourceType === "website") {
    await supabase.from("feed_states").insert({
      source_id: source.id,
      last_checked_at: null,
      last_content_hash: null,
      etag: null,
    });
  }

  const monitoringType = feedUrl
    ? "RSS feed"
    : sourceType === "website"
      ? "page monitoring"
      : "manual (paste links)";

  return NextResponse.json({
    success: true,
    action: "source_added",
    source,
    feedDiscovered: feedUrl !== null,
    message: `Added "${sourceName}" as a source. Monitoring via ${monitoringType}.`,
  });
}

/**
 * Save a URL as a feed item.
 */
async function saveAsItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  url: string
) {
  // Extract content
  const extracted = await extractContent(url);

  // Check for duplicate by content hash
  const { data: existing } = await supabase
    .from("items")
    .select("id")
    .eq("content_hash", extracted.contentHash)
    .single();

  let itemId: string;

  if (existing) {
    itemId = existing.id;
  } else {
    const { data: newItem, error: insertError } = await supabase
      .from("items")
      .insert({
        url: extracted.url,
        title: extracted.title,
        content_snippet: extracted.contentSnippet,
        author: extracted.author,
        published_at: extracted.publishedAt,
        image_url: extracted.imageUrl,
        content_hash: extracted.contentHash,
        raw_metadata: extracted.rawMetadata,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raceItem } = await supabase
          .from("items")
          .select("id")
          .eq("content_hash", extracted.contentHash)
          .single();
        itemId = raceItem!.id;
      } else {
        throw insertError;
      }
    } else {
      itemId = newItem.id;
    }
  }

  // Add to user's feed
  await supabase
    .from("user_feed_items")
    .upsert(
      { user_id: userId, item_id: itemId, is_read: false },
      { onConflict: "user_id,item_id" }
    );

  // Fetch complete item
  const { data: item } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  return NextResponse.json({
    success: true,
    action: "item_saved",
    item,
    sourceType: extracted.sourceType,
    isNew: !existing,
    message: `Saved: ${item?.title ?? "Item"}`,
  });
}

/**
 * GET /api/items — Get user's feed items
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") ?? "all";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    let query = supabase
      .from("user_feed_items")
      .select(
        `
        is_read,
        created_at,
        items (
          id,
          url,
          title,
          content_snippet,
          author,
          published_at,
          image_url,
          content_hash,
          raw_metadata,
          summary,
          created_at,
          source_id
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter === "unread") {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Flatten the response
    const items = (data ?? []).map((feedItem) => ({
      ...feedItem.items,
      is_read: feedItem.is_read,
      feed_created_at: feedItem.created_at,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json(
      { error: "Failed to fetch items" },
      { status: 500 }
    );
  }
}
